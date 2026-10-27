import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Administrator sign-in is required.' }, 401)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Account management is not configured.' }, 500)

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: callerResult, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !callerResult.user) return json({ error: 'Your administrator session is not valid.' }, 401)
  const { data: adminResult, error: adminError } = await callerClient.rpc('current_user_is_admin')
  if (adminError || adminResult !== true) return json({ error: 'Administrator access is required.' }, 403)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const asyncEmail = async (subject: string, message: string) => {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('SUPPORT_FROM_EMAIL')
    const email = authUser.user?.email
    if (!apiKey || !from || !email) return false
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [email], subject, html: `<main style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#20251f"><h2>${subject}</h2><p>${message.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)}</p><p>Meridion Marketplace</p></main>` }) })
    return response.ok
  }
  let input: { user_id?: string; action?: string; reason?: string }
  try { input = await request.json() } catch { return json({ error: 'Invalid request body.' }, 400) }
  const userId = input.user_id
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return json({ error: 'Choose a valid account.' }, 400)
  if (!['suspend', 'restore'].includes(input.action ?? '')) return json({ error: 'Choose suspend or restore.' }, 400)

  const { data: roles, error: rolesError } = await adminClient.from('user_roles').select('role').eq('user_id', userId)
  if (rolesError) return json({ error: 'Could not verify account roles.' }, 500)
  if (roles?.some((row) => row.role === 'admin')) return json({ error: 'Administrator accounts cannot be suspended here.' }, 403)
  const { data: authUser, error: userError } = await adminClient.auth.admin.getUserById(userId)
  if (userError || !authUser.user) return json({ error: 'Account was not found.' }, 404)

  if (input.action === 'suspend') {
    const reason = input.reason?.trim()
    if (!reason || reason.length < 5 || reason.length > 1000) return json({ error: 'Add a suspension reason between 5 and 1,000 characters.' }, 400)
    const { error: banError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
    if (banError) return json({ error: `Account could not be suspended: ${banError.message}` }, 500)
    const { error: saveError } = await adminClient.from('account_suspensions').upsert({ user_id: userId, reason, suspended_by: callerResult.user.id, suspended_at: new Date().toISOString() })
    if (saveError) {
      await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' })
      return json({ error: 'Suspension was rolled back because its reason could not be recorded.' }, 500)
    }
    await adminClient.from('notifications').insert({ user_id: userId, kind: 'account', audience: 'customer', title: 'Account suspended', body: reason })
    await adminClient.from('admin_audit_logs').insert({ actor_id: callerResult.user.id, action: 'UPDATE', entity: 'account_suspensions', entity_id: userId, details: { action: 'suspend', reason } })
    const email_sent = await asyncEmail('Your Meridion account has been suspended', `Your marketplace account has been suspended. Reason: ${reason}`)
    return json({ ok: true, user_id: userId, suspended: true, email_sent })
  }

  const { error: unbanError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' })
  if (unbanError) return json({ error: `Account could not be restored: ${unbanError.message}` }, 500)
  const { error: removeError } = await adminClient.from('account_suspensions').delete().eq('user_id', userId)
  if (removeError) return json({ error: 'Account is unbanned, but the suspension record could not be cleared.' }, 500)
  await adminClient.from('notifications').insert({ user_id: userId, kind: 'account', audience: 'customer', title: 'Account restored', body: 'Your marketplace account access has been restored.' })
  await adminClient.from('admin_audit_logs').insert({ actor_id: callerResult.user.id, action: 'UPDATE', entity: 'account_suspensions', entity_id: userId, details: { action: 'restore' } })
  const email_sent = await asyncEmail('Your Meridion account has been restored', 'Your marketplace account access has been restored. You can sign in and use your customer and seller features again.')
  return json({ ok: true, user_id: userId, suspended: false, email_sent })
})
