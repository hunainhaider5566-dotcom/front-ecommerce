import { getSupabase } from '../../lib/supabase'
import type { NotificationRecord } from '../../types/order'

export type NotificationAudience = 'customer' | 'vendor' | 'admin'

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function listMyNotifications(audience: NotificationAudience): Promise<NotificationRecord[]> {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('id, kind, title, body, related_order_id, read_at, created_at, audience')
    .eq('audience', audience)
    .order('created_at', { ascending: false })
    .limit(30)
  throwIfError(error)
  return (data ?? []) as NotificationRecord[]
}

export async function markNotificationRead(id: string, audience: NotificationAudience): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('audience', audience)
    .is('read_at', null)
  throwIfError(error)
}

export async function markAllNotificationsRead(audience: NotificationAudience): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('audience', audience)
    .is('read_at', null)
  throwIfError(error)
}
