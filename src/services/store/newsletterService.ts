import { getSupabase } from '../../lib/supabase'

export async function subscribeToNewsletter(email: string, source = 'storefront'): Promise<void> {
  const { error } = await getSupabase().rpc('subscribe_newsletter', {
    p_email: email.trim().toLowerCase(),
    p_source: source,
  })
  if (error) throw new Error(error.message)
}
