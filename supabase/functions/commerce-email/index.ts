import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'


import nodemailer from 'npm:nodemailer@^9'

const smtpUser = Deno.env.get('SMTP_USERNAME') ?? ''
const smtpPassword = Deno.env.get('SMTP_PASSWORD') ?? ''
const smtpHost = Deno.env.get('SMTP_HOSTNAME') ?? 'smtp.gmail.com'
const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '465')
const smtpFrom = Deno.env.get('SMTP_FROM') || (smtpUser ? `"JTBazar" <${smtpUser}>` : '')

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!smtpUser || !smtpPassword) throw new Error('SMTP credentials are not configured for this Edge Function.')
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPassword },
  })
  await transport.sendMail({ from: smtpFrom, to, subject, html })
  return true
}

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const variantLabel = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${typeof item === 'string' || typeof item === 'number' ? item : JSON.stringify(item)}`).join(' · ')
}
type EmailOrderItem = { product_name_snapshot: string; sku_snapshot: string | null; quantity: number; unit_price: number; line_total: number; variant_snapshot: unknown }
type Input = { event?: string; order_id?: string; status?: string; order_item_id?: string; seller_profile_id?: string }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Sign-in is required.' }, 401)
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const inbox = Deno.env.get('SUPPORT_INBOX_EMAIL')
  if (!url || !anon || !serviceKey) return json({ error: 'Email service is not configured.' }, 503)
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: authData, error: authError } = await caller.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Your sign-in session is invalid.' }, 401)
  let input: Input
  try { input = await request.json() } catch { return json({ error: 'Invalid request body.' }, 400) }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const event = input.event
  let entityId = '', eventType = event ?? '', subject = '', body = '', recipients: string[] = []
  let emailOrderNumber = '', emailTotal = 0
  let emailItems: EmailOrderItem[] = []
  const requireAdmin = async () => { const { data, error } = await caller.rpc('current_user_is_admin'); return !error && data === true }
  const userEmail = async (id: string | null) => {
    if (!id) return null
    const { data } = await admin.auth.admin.getUserById(id)
    return data.user?.email ?? null
  }

  if (event === 'order_placed' || event === 'order_status') {
    if (!input.order_id) return json({ error: 'Order is required.' }, 400)
    entityId = input.order_id
    const { data: order, error } = await admin.from('orders').select('id,order_number,customer_id,customer_email,customer_name,total,order_status,confirmation_status').eq('id', entityId).maybeSingle()
    if (error || !order) return json({ error: 'Order was not found.' }, 404)
    if (event === 'order_placed' && order.customer_id !== authData.user.id) return json({ error: 'You can only notify about your own order.' }, 403)
    if (event === 'order_status') {
      if (!(await requireAdmin())) return json({ error: 'Administrator access is required.' }, 403)
      const status = input.status ?? ''
      const validStatuses = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected']
      const isRejected = status === 'rejected' && order.order_status === 'cancelled' && order.confirmation_status === 'not_reachable'
      if (!validStatuses.includes(status) || (!isRejected && order.order_status !== status)) return json({ error: 'Order status event is invalid or stale.' }, 409)
    }
    const { data: items, error: itemsError } = await admin.from('order_items').select('seller_id,product_name_snapshot,sku_snapshot,variant_snapshot,quantity,unit_price,line_total').eq('order_id', entityId).order('created_at')
    if (itemsError) return json({ error: 'Order items could not be loaded.' }, 500)
    emailOrderNumber = order.order_number
    emailTotal = Number(order.total)
    emailItems = (items ?? []) as EmailOrderItem[]
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
      subject = `We received your JTBazar order ${order.order_number}`
      body = `Thank you ${order.customer_name}. We received your order for PKR ${Number(order.total).toLocaleString('en-PK')}. Our team will contact you to confirm it.`
      eventType = 'order_placed'
    } else {
      const labels: Record<string, string> = { confirmed: 'confirmed', processing: 'being prepared', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled', rejected: 'not confirmed' }
      subject = input.status === 'rejected' ? `Your JTBazar order could not be confirmed: ${order.order_number}` : `JTBazar order ${labels[input.status!]}: ${order.order_number}`
      body = input.status === 'rejected'
        ? `We could not confirm your order ${order.order_number}. Please contact JTBazar support if you need help.`
        : `Your order ${order.order_number} is now ${labels[input.status!]}.`
      eventType = `order_${input.status}`
    }
  } else if (event === 'vendor_fulfillment') {
    if (!input.order_item_id || !['accepted', 'shipped', 'delivered'].includes(input.status ?? '')) return json({ error: 'Fulfilment event is invalid.' }, 400)
    entityId = input.order_item_id
    const { data: item, error } = await admin.from('order_items').select('id,order_id,seller_id,vendor_fulfillment_status,product_name_snapshot,sku_snapshot,variant_snapshot,quantity,unit_price,line_total').eq('id', entityId).maybeSingle()
    if (error || !item) return json({ error: 'Order item was not found.' }, 404)
    const { data: seller } = await admin.from('seller_profiles').select('id,user_id').eq('id', item.seller_id).maybeSingle()
    if (!seller || seller.user_id !== authData.user.id) return json({ error: 'Only the assigned seller can send this update.' }, 403)
    if (item.vendor_fulfillment_status !== input.status) return json({ error: 'Fulfilment status event is stale.' }, 409)
    const { data: order } = await admin.from('orders').select('id,order_number,customer_id,customer_email').eq('id', item.order_id).maybeSingle()
    if (order) {
      entityId = order.id
      emailOrderNumber = order.order_number
      const { data: relatedItems } = await admin.from('order_items').select('product_name_snapshot,sku_snapshot,variant_snapshot,quantity,unit_price,line_total').eq('order_id', order.id).order('created_at')
      emailItems = (relatedItems ?? []) as EmailOrderItem[]
    } else emailItems = [item as EmailOrderItem]
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

  if (recipients.length === 0) return json({ sent: false, reason: 'recipient_missing' })
  let sent = 0
  for (const recipient of [...new Set(recipients)]) {
    const eventKey = `${eventType}:${entityId}:${recipient.toLowerCase()}`
    const { error: claimError } = await admin.from('email_notification_events').insert({ event_key: eventKey, event_type: eventType, entity_id: entityId, recipient_email: recipient })
    if (claimError?.code === '23505') { sent++; continue }
    if (claimError) continue
    try {
      const statusLabel = eventType === 'order_placed' ? 'Order received' : eventType.replace('order_', '').replace(/_/g, ' ')
      const statusColors: Record<string, { bg: string; fg: string }> = {
        'order received': { bg: '#fff4db', fg: '#8a5a00' }, confirmed: { bg: '#e8f7ee', fg: '#176b3a' },
        processing: { bg: '#fff4db', fg: '#8a5a00' }, shipped: { bg: '#eaf2ff', fg: '#2456a6' },
        delivered: { bg: '#e8f7ee', fg: '#176b3a' }, cancelled: { bg: '#fff0ee', fg: '#a83224' },
        rejected: { bg: '#fff0ee', fg: '#a83224' },
      }
      const tone = statusColors[statusLabel] ?? { bg: '#eef2f7', fg: '#344054' }
      const itemRows = emailItems.map((item) => {
        const variant = variantLabel(item.variant_snapshot)
        const details = [item.sku_snapshot ? `SKU: ${item.sku_snapshot}` : '', variant].filter(Boolean).join(' · ')
        return '<tr><td style="padding:13px 10px;border-bottom:1px solid #edf0f4"><strong>' + escapeHtml(item.product_name_snapshot || 'Product') + '</strong>' + (details ? '<div style="font-size:11px;color:#667085;margin-top:4px">' + escapeHtml(details) + '</div>' : '') + '</td><td align="center" style="padding:13px 8px;border-bottom:1px solid #edf0f4">' + Number(item.quantity) + '</td><td align="right" style="padding:13px 10px;border-bottom:1px solid #edf0f4">PKR ' + Number(item.line_total ?? Number(item.unit_price) * Number(item.quantity)).toLocaleString('en-PK') + '</td></tr>'
      }).join('')
      const itemsTable = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:16px"><thead><tr style="background:#f7f8fa;color:#667085;font-size:11px;text-transform:uppercase"><th align="left" style="padding:10px">Item</th><th align="center" style="padding:10px">Qty</th><th align="right" style="padding:10px">Amount</th></tr></thead><tbody>' + (itemRows || '<tr><td colspan="3" style="padding:14px">Order items are being prepared.</td></tr>') + '</tbody></table>'
      const orderReference = emailOrderNumber || entityId
      const html = '<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#182230"><div style="display:none;max-height:0;overflow:hidden;opacity:0">' + escapeHtml(body) + '</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f8;padding:28px 10px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e6eaf0;border-radius:16px;overflow:hidden"><tr><td style="padding:25px 30px;background:#243b2a;color:#fff"><div style="font-size:25px;font-weight:800;letter-spacing:-.5px">JTBazar</div><div style="font-size:11px;color:#d9e4d7;margin-top:5px;letter-spacing:1px">SHOP SMART. LIVE BETTER.</div></td></tr><tr><td style="padding:28px 30px"><span style="display:inline-block;padding:7px 11px;border-radius:20px;background:' + tone.bg + ';color:' + tone.fg + ';font-size:11px;font-weight:700;text-transform:uppercase">' + escapeHtml(statusLabel) + '</span><h1 style="font-size:23px;line-height:1.3;margin:17px 0 9px;color:#243b2a">' + escapeHtml(subject) + '</h1><p style="font-size:14px;line-height:1.7;color:#526071;margin:0">' + escapeHtml(body) + '</p><div style="margin-top:22px;padding:14px 16px;border:1px solid #e6eaf0;border-radius:10px;background:#fafbfc"><div style="font-size:10px;color:#667085;text-transform:uppercase;letter-spacing:1px">Order number</div><div style="font-size:17px;font-weight:700;color:#243b2a;margin-top:6px">' + escapeHtml(orderReference) + '</div></div>' + itemsTable + '<div style="display:flex;justify-content:flex-end;margin-top:16px;padding-top:14px;border-top:1px solid #e6eaf0"><strong style="font-size:15px;color:#243b2a">Order total: PKR ' + Number(emailTotal).toLocaleString('en-PK') + '</strong></div><p style="font-size:12px;line-height:1.6;color:#667085;margin:23px 0 0">We will keep you updated as your order moves through each stage. Thank you for shopping with JTBazar.</p></td></tr><tr><td style="padding:18px 30px;border-top:1px solid #edf0f4;background:#fafbfc;font-size:11px;color:#98a2b3">This is an automated order notification from JTBazar.</td></tr></table></td></tr></table></body></html>'
      const provider = await sendEmail(recipient, subject, html)
        const status = eventType.startsWith('order_') ? eventType.replace('order_', '').replace(/_/g, ' ') : eventType.replace(/_/g, ' ')
        const statusColors: Record<string, { bg: string; fg: string }> = {
          placed: { bg: '#fff4db', fg: '#8a5a00' },
          confirmed: { bg: '#e8f7ee', fg: '#176b3a' },
          shipped: { bg: '#eaf2ff', fg: '#2456a6' },
          delivered: { bg: '#e8f7ee', fg: '#176b3a' },
        }
        const tone = statusColors[status] ?? { bg: '#eef2f7', fg: '#344054' }
        const orderNumber = body.match(/(?:order|Order)\\s+([A-Z0-9-]+)/)?.[1] ?? ''
        return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#182230">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(body)}</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f8;padding:32px 12px"><tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e6eaf0;border-radius:16px;overflow:hidden">
              <tr><td style="padding:26px 32px;background:#172b4d;color:#ffffff">
                <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#cbd5e1">MERIDION</div>
                <div style="font-size:22px;font-weight:700;letter-spacing:-.4px;margin-top:5px">Marketplace</div>
              </td></tr>
              <tr><td style="padding:32px">
                <div style="display:inline-block;padding:7px 11px;border-radius:20px;background:${tone.bg};color:${tone.fg};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${escapeHtml(status)}</div>
                <h1 style="font-size:25px;line-height:1.3;margin:18px 0 10px;color:#172b4d">${escapeHtml(subject)}</h1>
                <p style="font-size:15px;line-height:1.7;color:#526071;margin:0 0 24px">${escapeHtml(body)}</p>
                <div style="border:1px solid #e6eaf0;border-radius:12px;padding:18px 20px;background:#fafbfc">
                  <div style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:1px">Order reference</div>
                  <div style="font-size:17px;font-weight:700;color:#172b4d;margin-top:7px;word-break:break-word">${escapeHtml(orderNumber || entityId)}</div>
                </div>
                <p style="font-size:13px;line-height:1.6;color:#667085;margin:24px 0 0">Thank you for shopping with Meridion Marketplace. We’ll keep you updated as your order progresses.</p>
              </td></tr>
              <tr><td style="padding:20px 32px;border-top:1px solid #edf0f4;background:#fafbfc">
                <div style="font-size:13px;font-weight:700;color:#344054">Meridion Marketplace</div>
                <div style="font-size:12px;line-height:1.6;color:#98a2b3;margin-top:5px">Order updates and notifications</div>
              </td></tr>
            </table>
            <div style="font-size:11px;color:#98a2b3;padding:18px 8px">This is an automated notification about your marketplace order.</div>
          </td></tr></table>
        </body></html>`

      if (provider) {
        sent++
        await admin.from('email_notification_events').update({ sent_at: new Date().toISOString() }).eq('event_key', eventKey)
      } else await admin.from('email_notification_events').delete().eq('event_key', eventKey)
    } catch {
      await admin.from('email_notification_events').delete().eq('event_key', eventKey)
    }
  }
  return json({ sent: sent > 0, recipients_sent: sent })
})
