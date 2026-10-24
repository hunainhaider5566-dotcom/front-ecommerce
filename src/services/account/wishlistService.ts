import { getSupabase } from '../../lib/supabase'

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function listMyWishlistProductIds(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from('wishlist_items')
    .select('product_id')
    .order('added_at', { ascending: false })
  throwIfError(error)
  return [...new Set((data ?? []).map((row) => row.product_id))]
}

export async function addWishlistProduct(productId: string): Promise<void> {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in to save items to your account.')
  const { error } = await client
    .from('wishlist_items')
    .insert({ user_id: user.id, product_id: productId })
  if (error && !error.message.toLowerCase().includes('duplicate')) throw new Error(error.message)
}

export async function removeWishlistProduct(productId: string): Promise<void> {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in to update your saved items.')
  const { error } = await client
    .from('wishlist_items')
    .delete()
    .eq('user_id', user.id)
    .eq('product_id', productId)
  throwIfError(error)
}
