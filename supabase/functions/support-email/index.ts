import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import nodemailer from 'npm:nodemailer@^9'

const smtpUser = Deno.env.get('SMTP_USERNAME') ?? ''
const smtpPassword = Deno.env.get('SMTP_PASSWORD') ?? ''
const smtpHost = Deno.env.get('SMTP_HOSTNAME') ?? 'smtp.gmail.com'
const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '465')
const smtpFrom = Deno.env.get('SMTP_FROM') || (smtpUser ? `"JTBazar" <${smtpUser}>` : '')
const resendKey = Deno.env.get('RESEND_API_KEY')
const legacyFrom = Deno.env.get('SUPPORT_FROM_EMAIL')

async function sendEmail(to: string, subject: string, html: string): Promise<'smtp' | 'resend' | null> {
  if (smtpUser && smtpPassword) {
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    })
    await transport.sendMail({ from: smtpFrom, to, subject, html })
    return 'smtp'
  }
  // Temporary compatibility while SMTP Edge Function secrets are being configured.
  if (resendKey && legacyFrom) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: legacyFrom, to: [to], subject, html }),
    })
    if (!response.ok) throw new Error('Legacy email provider rejected the message.')
    return 'resend'
  }
  return null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Sign-in is required.' }, 401)
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const inbox = Deno.env.get('SUPPORT_INBOX_EMAIL')
  if (!url || !anon || !serviceKey) return json({ error: 'Support email is not configured.' }, 503)
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Your sign-in session is invalid.' }, 401)
  let input: { ticket_id?: string; ticket_kind?: 'customer' | 'seller'; event?: 'created' | 'admin_reply' }
  try { input = await request.json() } catch { return json({ error: 'Invalid request body.' }, 400) }
  if (!input.ticket_id || !['customer', 'seller'].includes(input.ticket_kind ?? '') || !['created', 'admin_reply'].includes(input.event ?? '')) return json({ error: 'Ticket details are invalid.' }, 400)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  if (input.event === 'admin_reply') {
    const { data, error } = await caller.rpc('current_user_is_admin')
    if (error || data !== true) return json({ error: 'Administrator access is required.' }, 403)
  }
  const table = input.ticket_kind === 'customer' ? 'customer_support_tickets' : 'support_tickets'
  const { data: ticket, error: ticketError } = await admin.from(table).select('*').eq('id', input.ticket_id).maybeSingle()
  if (ticketError || !ticket) return json({ error: 'Support ticket not found.' }, 404)
  const ownerId = input.ticket_kind === 'customer' ? ticket.user_id : ticket.created_by
  if (input.event === 'created' && ownerId !== userData.user.id) return json({ error: 'You can only notify support about your own ticket.' }, 403)
  if (!inbox) return json({ sent: false, reason: 'support_inbox_not_configured' }, 200)
  let recipient = inbox
  let subject = `New ${input.ticket_kind} support request: ${ticket.subject}`
  let heading = 'New support request'
  if (input.event === 'admin_reply') {
    if (input.ticket_kind === 'customer') recipient = ticket.requester_email
    else {
      const { data: owner } = await admin.auth.admin.getUserById(ownerId)
      recipient = owner?.user?.email ?? ''
    }
    if (!recipient) return json({ sent: false, reason: 'requester_email_missing' }, 200)
    subject = `Marketplace support replied: ${ticket.subject}`
    heading = 'Marketplace support replied'
  }
  const body = input.event === 'admin_reply' ? ticket.admin_response ?? 'Your support request was updated.' : ticket.message
  const html = `<main style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#20251f"><h2>${escapeHtml(heading)}</h2><p><b>Subject:</b> ${escapeHtml(ticket.subject)}</p><p style="white-space:pre-wrap">${escapeHtml(body)}</p><p style="color:#687268">Meridion Marketplace Support</p></main>`
  try {
    const provider = await sendEmail(recipient, subject, html)
    if (!provider) return json({ sent: false, reason: 'smtp_not_configured' }, 200)
    return json({ sent: true, provider })
  } catch {
    return json({ sent: false, reason: 'provider_error' }, 200)
  }
})
