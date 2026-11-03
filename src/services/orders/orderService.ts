import { getSupabase } from '../../lib/supabase'
import type { Json } from '../../types/database'
import { sendCommerceEmail } from '../account/commerceEmailService'
import { isValidPakistaniMobile, normalizePakistaniMobile } from '../../utils/contactValidation'
import type {
  MarketplaceCaseRecord,
  OrderItemRecord,
  OrderRecord,
  PlaceOrderInput,
  PlacedOrder,
} from '../../types/order'

const ORDER_COLUMNS = 'id, order_number, customer_name, customer_phone, customer_email, shipping_address_snapshot, customer_note, currency, subtotal, delivery_fee, discount_amount, total, order_status, payment_method, payment_status, delivery_lat, delivery_lng, delivery_location_name, delivery_location_captured_at, created_at, updated_at'
const ITEM_COLUMNS = 'id, order_id, product_id, variant_id, seller_id, seller_name_snapshot, product_name_snapshot, sku_snapshot, variant_snapshot, product_snapshot, quantity, unit_price, line_total, vendor_fulfillment_status'
const CASE_COLUMNS = 'id, order_id, order_item_id, buyer_id, seller_id, case_type, status, reason, evidence_path, seller_response, admin_decision, created_at, updated_at'

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  if (!isValidPakistaniMobile(input.customerPhone)) throw new Error('Enter exactly 03001234567 or +923001234567.')
  const { data, error } = await getSupabase().rpc('place_order', {
    p_customer_name: input.customerName,
    p_customer_phone: normalizePakistaniMobile(input.customerPhone),
    p_customer_email: input.customerEmail,
    p_shipping_address: input.shippingAddress,
    p_items: input.items as unknown as Json,
    p_idempotency_key: input.idempotencyKey,
    p_customer_note: input.customerNote,
    p_delivery_lat: input.deliveryLat,
    p_delivery_lng: input.deliveryLng,
    p_delivery_location_name: input.deliveryLocationName,
    p_delivery_location_captured_at: input.deliveryLocationCapturedAt,
  })
  throwIfError(error)
  const row = data?.[0]
  if (!row) throw new Error('The order was not created. Please try again.')
  await sendCommerceEmail({ event: 'order_placed', order_id: row.order_id })
  return {
    orderId: row.order_id,
    orderNumber: row.order_number,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
  }
}

export async function listMyOrders(): Promise<OrderRecord[]> {
  const { data, error } = await getSupabase()
    .from('orders')
    .select(ORDER_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100)
  throwIfError(error)
  return (data ?? []) as OrderRecord[]
}

export async function cancelCustomerOrder(orderId: string): Promise<void> {
  const { data, error } = await getSupabase().rpc('cancel_customer_order', { p_order_id: orderId })
  throwIfError(error)
  if (!data) throw new Error('The order could not be cancelled.')
}

export async function getMyOrderByNumber(orderNumber: string): Promise<OrderRecord | null> {
  const { data, error } = await getSupabase()
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('order_number', orderNumber)
    .maybeSingle()
  throwIfError(error)
  if (!data) return null
  const order = data as OrderRecord
  order.items = await listOrderItems(order.id)
  return order
}

export async function listOrderItems(orderId: string): Promise<OrderItemRecord[]> {
  const { data, error } = await getSupabase()
    .from('order_items')
    .select(ITEM_COLUMNS)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  throwIfError(error)
  return (data ?? []) as OrderItemRecord[]
}

export async function listMyCases(): Promise<MarketplaceCaseRecord[]> {
  const { data, error } = await getSupabase()
    .from('marketplace_cases')
    .select(CASE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100)
  throwIfError(error)
  return (data ?? []) as MarketplaceCaseRecord[]
}

export async function uploadComplaintEvidence(orderId: string, file: File): Promise<string> {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in before uploading evidence.')
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Evidence must be a JPG, PNG, WebP or AVIF image.')
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Evidence images must be between 1 byte and 10 MB.')
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' } as Record<string, string>)[file.type]
  const path = `${user.id}/${orderId}-${crypto.randomUUID()}.${ext}`
  const { error } = await client.storage.from('complaint-evidence').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  throwIfError(error)
  return path
}

export async function createMarketplaceCase(input: {
  orderId: string
  orderItemId: string | null
  sellerId: string | null
  caseType: MarketplaceCaseRecord['case_type']
  reason: string
  evidencePath: string | null
}): Promise<MarketplaceCaseRecord> {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in before opening a case.')
  if (input.reason.trim().length < 3) throw new Error('A case reason of at least 3 characters is required.')
  if (input.caseType !== 'refund' && !input.evidencePath) throw new Error('A product evidence image is required for complaints and returns.')
  if (input.evidencePath && !input.evidencePath.startsWith(user.id + '/' + input.orderId + '-')) throw new Error('The evidence image does not belong to this order or account.')
  const { data, error } = await client
    .from('marketplace_cases')
    .insert({
      order_id: input.orderId,
      order_item_id: input.orderItemId,
      buyer_id: user.id,
      seller_id: input.sellerId,
      case_type: input.caseType,
      reason: input.reason.trim(),
      evidence_path: input.evidencePath,
    })
    .select(CASE_COLUMNS)
    .single()
  throwIfError(error)
  if (!data) throw new Error('The case was not created.')
  return data as MarketplaceCaseRecord
}

export async function getEvidenceSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await getSupabase().storage.from('complaint-evidence').createSignedUrl(path, 600)
  if (error || !data) return null
  return data.signedUrl
}
