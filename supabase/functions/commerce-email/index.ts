import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
type Input = { event?: string; order_id?: string; status?: string; order_item_id?: string; seller_profile_id?: string }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Sign-in is required.' }, 401)
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('SUPPORT_FROM_EMAIL'), inbox = Deno.env.get('SUPPORT_INBOX_EMAIL')
  if (!url || !anon || !serviceKey) return json({ error: 'Email service is not configured.' }, 503)
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: authData, error: authError } = await caller.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Your sign-in session is invalid.' }, 401)
  let input: Input
  try { input = await request.json() } catch { return json({ error: 'Invalid request body.' }, 400) }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const event = input.event
  let entityId = '', eventType = event ?? '', subject = '', body = '', recipients: string[] = []
  const requireAdmin = async () => { const { data, error } = await caller.rpc('current_user_is_admin'); return !error && data === true }
  const userEmail = async (id: string | null) => {
    if (!id) return null
    const { data } = await admin.auth.admin.getUserById(id)
    return data.user?.email ?? null
  }

  if (event === 'order_placed' || event === 'order_status') {
    if (!input.order_id) return json({ error: 'Order is required.' }, 400)
    entityId = input.order_id
    const { data: order, error } = await admin.from('orders').select('id,order_number,customer_id,customer_email,customer_name,total,order_status').eq('id', entityId).maybeSingle()
    if (error || !order) return json({ error: 'Order was not found.' }, 404)
    if (event === 'order_placed' && order.customer_id !== authData.user.id) return json({ error: 'You can only notify about your own order.' }, 403)
    if (event === 'order_status') {
      if (!(await requireAdmin())) return json({ error: 'Administrator access is required.' }, 403)
      if (!['confirmed', 'shipped', 'delivered'].includes(input.status ?? '') || order.order_status !== input.status) return json({ error: 'Order status event is invalid or stale.' }, 409)
    }
    const { data: items } = await admin.from('order_items').select('seller_id,product_name_snapshot,quantity').eq('order_id', entityId)
    const customerEmail = order.customer_email ?? await userEmail(order.customer_id)
    if (customerEmail) recipients.push(customerEmail)
    if (event === 'order_placed') {
      if (inbox) recipients.push(inbox)
      const sellerIds = [...new Set((items ?? []).map((item) => item.seller_id).filter((id): id is string => Boolean(id)))]
      for (const sellerId of sellerIds) {
        const { data: seller } = await admin.from('seller_profiles').select('user_id').eq('id', sellerId).maybeSingle()
        const email = await userEmail(seller?.user_id ?? null)
        if (email) recipients.push(email)
      }
      subject = `Order received: ${order.order_number}`
      body = `We received order ${order.order_number} for PKR ${Number(order.total).toLocaleString('en-PK')}. It is now awaiting confirmation.`
      eventType = 'order_placed'
    } else {
      const labels: Record<string, string> = { confirmed: 'confirmed', shipped: 'shipped', delivered: 'delivered' }
      subject = `Order ${labels[input.status!]}: ${order.order_number}`
      body = `Your order ${order.order_number} is now ${labels[input.status!]}.`
      eventType = `order_${input.status}`
    }
  } else if (event === 'vendor_fulfillment') {
    if (!input.order_item_id || !['accepted', 'shipped', 'delivered'].includes(input.status ?? '')) return json({ error: 'Fulfilment event is invalid.' }, 400)
    entityId = input.order_item_id
    const { data: item, error } = await admin.from('order_items').select('id,order_id,seller_id,vendor_fulfillment_status').eq('id', entityId).maybeSingle()
    if (error || !item) return json({ error: 'Order item was not found.' }, 404)
    const { data: seller } = await admin.from('seller_profiles').select('id,user_id').eq('id', item.seller_id).maybeSingle()
    if (!seller || seller.user_id !== authData.user.id) return json({ error: 'Only the assigned seller can send this update.' }, 403)
    if (item.vendor_fulfillment_status !== input.status) return json({ error: 'Fulfilment status event is stale.' }, 409)
    const { data: order } = await admin.from('orders').select('id,order_number,customer_id,customer_email').eq('id', item.order_id).maybeSingle()
    if (order) entityId = order.id
    const email = order?.customer_email ?? await userEmail(order?.customer_id ?? null)
    if (email) recipients.push(email)
    const label = input.status === 'accepted' ? 'accepted by the seller' : input.status
    subject = `Order update: ${order?.order_number ?? ''}`
    body = `The seller has ${label} your order ${order?.order_number ?? ''}.`
    eventType = input.status === 'accepted' ? `vendor_accepted_${seller.user_id}` : `order_${input.status}`
  } else if (event === 'seller_approved') {
    if (!input.seller_profile_id) return json({ error: 'Seller application is required.' }, 400)
    if (!(await requireAdmin())) return json({ error: 'Administrator access is required.' }, 403)
    entityId = input.seller_profile_id
    const { data: seller, error } = await admin.from('seller_profiles').select('id,user_id,shop_name,status').eq('id', entityId).maybeSingle()
    if (error || !seller) return json({ error: 'Seller application was not found.' }, 404)
    if (seller.status !== 'approved') return json({ error: 'Seller application is not approved.' }, 409)
    const email = await userEmail(seller.user_id)
    if (email) recipients.push(email)
    subject = 'Your seller shop is approved'
    body = `${seller.shop_name} is approved. You can now open your vendor dashboard and manage listings and orders.`
    eventType = 'seller_approved'
  } else return json({ error: 'Unsupported email event.' }, 400)

  if (!resendKey || !from || recipients.length === 0) return json({ sent: false, reason: !resendKey || !from ? 'email_not_configured' : 'recipient_missing' })
  let sent = 0
  for (const recipient of [...new Set(recipients)]) {
    const eventKey = `${eventType}:${entityId}:${recipient.toLowerCase()}`
    const { error: claimError } = await admin.from('email_notification_events').insert({ event_key: eventKey, event_type: eventType, entity_id: entityId, recipient_email: recipient })
    if (claimError?.code === '23505') { sent++; continue }
    if (claimError) continue
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [recipient], subject, html: `<main style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#20251f"><h2>${escapeHtml(subject)}</h2><p>${escapeHtml(body)}</p><p style="color:#687268">Meridion Marketplace</p></main>` }),
    })
    if (response.ok) {
      sent++
      await admin.from('email_notification_events').update({ sent_at: new Date().toISOString() }).eq('event_key', eventKey)
    } else await admin.from('email_notification_events').delete().eq('event_key', eventKey)
  }
  return json({ sent: sent > 0, recipients_sent: sent })
})
