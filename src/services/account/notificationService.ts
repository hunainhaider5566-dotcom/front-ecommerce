import { getSupabase } from '../../lib/supabase'
import type { NotificationRecord } from '../../types/order'

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function listMyNotifications(): Promise<NotificationRecord[]> {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('id, kind, title, body, related_order_id, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(30)
  throwIfError(error)
  return (data ?? []) as NotificationRecord[]
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  throwIfError(error)
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  throwIfError(error)
}
