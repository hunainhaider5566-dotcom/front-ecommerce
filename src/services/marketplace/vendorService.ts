import { getSupabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

export type SellerProfile = Database['public']['Tables']['seller_profiles']['Row']
export type VendorProduct = Database['public']['Tables']['products']['Row']
export type VendorInventory = Database['public']['Tables']['product_inventory']['Row'] & { product_name: string; variant_name: string | null }
export type MarketplaceCase = Database['public']['Tables']['marketplace_cases']['Row']
export type VendorOrderItem = Database['public']['Functions']['vendor_order_items']['Returns'][number]
export type VendorSupportTicket = Database['public']['Tables']['support_tickets']['Row']

const SELLER_COLUMNS = 'id, user_id, shop_name, slug, description, contact_email, phone, document_path, shop_image_url, shop_lat, shop_lng, shop_location_label, show_shop_on_map, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at'
const CASE_COLUMNS = 'id, order_id, order_item_id, buyer_id, seller_id, case_type, status, reason, evidence_path, seller_response, admin_decision, decided_by, decided_at, created_at, updated_at'

export interface VendorShopInput {
  shop_name: string
  slug: string
  description: string
  contact_email: string | null
  phone: string | null
  shop_image_url?: string | null
  shop_lat?: number | null
  shop_lng?: number | null
  shop_location_label?: string
  show_shop_on_map?: boolean
}

export async function uploadVendorShopImage(file: File): Promise<{ path: string; url: string }> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Shop images must be 5 MB or smaller.')
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP or AVIF shop image.')
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in before uploading a shop image.')
  const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
  const { error } = await client.storage.from('shop-images').upload(path, file, { upsert: false, contentType: file.type })
  assertError(error)
  return { path, url: client.storage.from('shop-images').getPublicUrl(path).data.publicUrl }
}

export async function removeVendorShopImage(path: string): Promise<void> {
  const { error } = await getSupabase().storage.from('shop-images').remove([path])
  assertError(error)
}

function assertError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function uploadVendorDocument(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Verification documents must be 10 MB or smaller.')
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Verification documents must be a PDF, JPG, PNG or WebP file.')
  }
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in required before uploading verification documents.')

  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`

  const { error } = await client.storage.from('vendor-documents').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })

  assertError(error)
  return path
}

export async function getOwnSellerProfile(): Promise<SellerProfile | null> {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) return null
  const { data, error } = await client.from('seller_profiles').select(SELLER_COLUMNS).eq('user_id', user.id).maybeSingle()
  assertError(error)
  return (data as SellerProfile | null) ?? null
}

export async function applyAsSeller(input: VendorShopInput & { document_path?: string | null }): Promise<SellerProfile> {
  const user = (await getSupabase().auth.getUser()).data.user
  if (!user) throw new Error('Sign in before applying as a vendor.')
  const existing = await getOwnSellerProfile()
  if (existing) {
    throw new Error(`A seller application already exists with status: ${existing.status}. Open your seller application to review or update it.`)
  }
  const { data, error } = await getSupabase().from('seller_profiles').insert({
    user_id: user.id,
    shop_name: input.shop_name,
    slug: input.slug,
    description: input.description,
    contact_email: input.contact_email,
    phone: input.phone,
    ...(input.shop_image_url !== undefined ? { shop_image_url: input.shop_image_url } : {}),
    ...(input.shop_lat !== undefined ? { shop_lat: input.shop_lat } : {}),
    ...(input.shop_lng !== undefined ? { shop_lng: input.shop_lng } : {}),
    ...(input.shop_location_label !== undefined ? { shop_location_label: input.shop_location_label } : {}),
    ...(input.show_shop_on_map !== undefined ? { show_shop_on_map: input.show_shop_on_map } : {}),
    document_path: input.document_path ?? null,
  }).select(SELLER_COLUMNS).single()
  assertError(error)
  if (!data) throw new Error('The seller application was not created.')
  return data as SellerProfile
}

export async function updateOwnShop(input: VendorShopInput & { document_path?: string | null }): Promise<SellerProfile> {
  const user = (await getSupabase().auth.getUser()).data.user
  if (!user) throw new Error('Sign in before updating your shop.')
  const { data, error } = await getSupabase().from('seller_profiles').update({
    shop_name: input.shop_name,
    slug: input.slug,
    description: input.description,
    contact_email: input.contact_email,
    phone: input.phone,
    ...(input.shop_image_url !== undefined ? { shop_image_url: input.shop_image_url } : {}),
    ...(input.shop_lat !== undefined ? { shop_lat: input.shop_lat } : {}),
    ...(input.shop_lng !== undefined ? { shop_lng: input.shop_lng } : {}),
    ...(input.shop_location_label !== undefined ? { shop_location_label: input.shop_location_label } : {}),
    ...(input.show_shop_on_map !== undefined ? { show_shop_on_map: input.show_shop_on_map } : {}),
    ...(input.document_path ? { document_path: input.document_path } : {}),
  }).eq('user_id', user.id).select(SELLER_COLUMNS).single()
  assertError(error)
  if (!data) throw new Error('The shop profile was not updated.')
  return data as SellerProfile
}

export async function resubmitSellerApplication(): Promise<SellerProfile> {
  const { data, error } = await getSupabase().rpc('seller_resubmit_application')
  assertError(error)
  const row = data as SellerProfile | null
  if (!row) throw new Error('The application could not be resubmitted.')
  return row
}

export async function listOwnProducts(): Promise<VendorProduct[]> {
  const { data, error } = await getSupabase().rpc('vendor_list_products')
  assertError(error)
  return (data ?? []) as VendorProduct[]
}

export async function createVendorProduct(input: {
  category_id: string | null
  name: string
  slug: string
  sku: string | null
  short_description: string
  description: string
  price: number
  supplier_cost: number | null
  fulfillment_expense: number
  minimum_profit: number
  track_inventory: boolean
}): Promise<string> {
  const { data, error } = await getSupabase().rpc('vendor_create_product', {
    p_category_id: input.category_id,
    p_name: input.name,
    p_slug: input.slug,
    p_sku: input.sku,
    p_short_description: input.short_description,
    p_description: input.description,
    p_price: input.price,
    p_supplier_cost: input.supplier_cost,
    p_fulfillment_expense: input.fulfillment_expense,
    p_minimum_profit: input.minimum_profit,
    p_track_inventory: input.track_inventory,
  })
  assertError(error)
  if (!data) throw new Error('The product was not created.')
  return data
}

export async function updateVendorProduct(productId: string, input: {
  name: string
  slug: string
  sku: string | null
  short_description: string
  description: string
  price: number
  supplier_cost: number | null
  fulfillment_expense: number
  minimum_profit: number
}): Promise<VendorProduct> {
  const { data, error } = await getSupabase().rpc('vendor_update_product', {
    p_product_id: productId,
    p_name: input.name,
    p_slug: input.slug,
    p_sku: input.sku,
    p_short_description: input.short_description,
    p_description: input.description,
    p_price: input.price,
    p_supplier_cost: input.supplier_cost,
    p_fulfillment_expense: input.fulfillment_expense,
    p_minimum_profit: input.minimum_profit,
  })
  assertError(error)
  if (!data) throw new Error('The product was not updated.')
  return data as VendorProduct
}

export async function listOwnInventory(): Promise<VendorInventory[]> {
  const { data, error } = await getSupabase().from('product_inventory')
    .select('id, product_id, variant_id, quantity, low_stock_threshold, updated_at, products!inner(name, seller_id), product_variants(option_label, option_value)')
    .order('updated_at', { ascending: false })
    .limit(200)
  assertError(error)
  return (data ?? []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants
    return {
      id: row.id,
      product_id: row.product_id,
      variant_id: row.variant_id,
      quantity: row.quantity,
      low_stock_threshold: row.low_stock_threshold,
      updated_at: row.updated_at,
      product_name: product?.name ?? 'Unknown product',
      variant_name: variant ? `${variant.option_label}: ${variant.option_value}` : null,
    }
  })
}

export async function adjustOwnInventory(id: string, quantity: number, note: string): Promise<void> {
  const { error } = await getSupabase().rpc('vendor_adjust_inventory', { p_inventory_id: id, p_new_quantity: quantity, p_note: note })
  assertError(error)
}

export async function listOwnCases(): Promise<MarketplaceCase[]> {
  const { data, error } = await getSupabase().from('marketplace_cases').select(CASE_COLUMNS).order('created_at', { ascending: false }).limit(100)
  assertError(error)
  return (data ?? []) as MarketplaceCase[]
}

export async function respondToCase(id: string, sellerResponse: string): Promise<void> {
  if (sellerResponse.trim().length < 3) throw new Error('Add a short response before sending.')
  const { error } = await getSupabase().from('marketplace_cases')
    .update({ seller_response: sellerResponse.trim(), status: 'seller_responded' })
    .eq('id', id)
  assertError(error)
}

export async function listOwnSupportTickets(): Promise<VendorSupportTicket[]> {
  const { data, error } = await getSupabase().from('support_tickets').select('*').order('created_at', { ascending: false }).limit(100)
  assertError(error)
  return data ?? []
}

export async function createOwnSupportTicket(sellerId: string, subject: string, message: string): Promise<void> {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in before creating a support ticket.')
  const { error } = await client.from('support_tickets').insert({ seller_id: sellerId, created_by: user.id, subject: subject.trim(), message: message.trim() })
  assertError(error)
}

export async function getCaseEvidenceUrl(path: string): Promise<string | null> {
  const { data, error } = await getSupabase().storage.from('complaint-evidence').createSignedUrl(path, 600)
  if (error || !data) return null
  return data.signedUrl
}

export async function listOwnOrderItems(): Promise<VendorOrderItem[]> {
  const { data, error } = await getSupabase().rpc('vendor_order_items')
  assertError(error)
  return data ?? []
}

export async function updateOwnOrderItem(id: string, status: string, trackingNumber: string | null, trackingUrl: string | null, note: string | null): Promise<void> {
  if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) throw new Error('Tracking links must start with https://')
  const { error } = await getSupabase().rpc('vendor_update_order_item', {
    p_item_id: id,
    p_status: status,
    p_tracking_number: trackingNumber,
    p_tracking_url: trackingUrl,
    p_vendor_note: note,
  })
  assertError(error)
}
