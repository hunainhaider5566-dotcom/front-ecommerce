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
