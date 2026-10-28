import { getSupabase } from '../../lib/supabase'

export interface ProductReview {
  id: string
  product_id: string
  order_id: string
  buyer_id: string
  rating: number
  title: string | null
  comment: string | null
  created_at: string
}

export interface SellerReview {
  id: string
  seller_id: string
  order_id: string
  buyer_id: string
  rating: number
  comment: string | null
  created_at: string
}

export async function submitProductReview(input: {
  productId: string
  orderId: string
  rating: number
  title?: string
  comment?: string
}): Promise<ProductReview> {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in to leave a review.')
  const eligibleOrderId = await getReviewableOrderId(user.id, input.productId)
  if (!eligibleOrderId || eligibleOrderId !== input.orderId) throw new Error('You can review this product after a delivered order containing it.')
  const { data: ownListing } = await client.from('products').select('seller_id').eq('id', input.productId).maybeSingle()
  if (ownListing?.seller_id) {
    const { data: ownShop } = await client.from('seller_profiles').select('user_id').eq('id', ownListing.seller_id).maybeSingle()
    if (ownShop?.user_id === user.id) throw new Error('You cannot review your own product.')
  }

  const { data, error } = await client
    .from('product_reviews')
    .insert({
      product_id: input.productId,
      order_id: input.orderId,
      buyer_id: user.id,
      rating: input.rating,
      title: input.title?.trim() || null,
      comment: input.comment?.trim() || null,
      status: 'approved',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as ProductReview
}

export async function submitSellerReview(input: {
  sellerId: string
  orderId: string
  rating: number
  comment?: string
}): Promise<SellerReview> {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in to leave a review.')
  const { data: shop } = await client.from('seller_profiles').select('user_id').eq('id', input.sellerId).maybeSingle()
  if (shop?.user_id === user.id) throw new Error('You cannot review your own seller account.')
  const eligibleOrderId = await getReviewableOrderId(user.id, undefined, input.sellerId)
  if (!eligibleOrderId || eligibleOrderId !== input.orderId) throw new Error('You can review this seller after a delivered order from this shop.')

  const { data, error } = await client
    .from('seller_reviews')
    .insert({
      seller_id: input.sellerId,
      order_id: input.orderId,
      buyer_id: user.id,
      rating: input.rating,
      comment: input.comment?.trim() || null,
      status: 'approved',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as SellerReview
}

export async function getProductReviews(productId: string): Promise<ProductReview[]> {
  const { data, error } = await getSupabase()
    .from('product_reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data as ProductReview[]
}

export async function getSellerReviews(sellerId: string): Promise<SellerReview[]> {
  const { data, error } = await getSupabase()
    .from('seller_reviews')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data as SellerReview[]
}


/** Returns a delivered order ID only when the signed-in customer bought the product or from the seller. */
export async function getReviewableOrderId(userId: string, productId?: string, sellerId?: string): Promise<string | null> {
  const client = getSupabase()
  const { data: orders, error: orderError } = await client
    .from('orders')
    .select('id')
    .eq('customer_id', userId)
    .eq('order_status', 'delivered')
    .order('created_at', { ascending: false })
  if (orderError || !orders?.length) return null

  let query = client.from('order_items').select('order_id').in('order_id', orders.map((order) => order.id))
  if (productId) query = query.eq('product_id', productId)
  if (sellerId) query = query.eq('seller_id', sellerId)
  const { data: items, error: itemsError } = await query.limit(100)
  if (itemsError || !items?.length) return null
  const eligibleIds = new Set(items.map((item) => item.order_id))
  return orders.find((order) => eligibleIds.has(order.id))?.id ?? null
}
