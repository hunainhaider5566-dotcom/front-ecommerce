import { getSupabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

export type CustomerSupportTicket = Database['public']['Tables']['customer_support_tickets']['Row']
export type SupportTicketKind = 'customer' | 'seller'
export type SupportTicketEmailEvent = 'created' | 'admin_reply'

export async function listMyCustomerSupportTickets(): Promise<CustomerSupportTicket[]> {
  const { data, error } = await getSupabase().from('customer_support_tickets')
    .select('*').order('updated_at', { ascending: false }).limit(30)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createCustomerSupportTicket(subject: string, message: string): Promise<CustomerSupportTicket> {
  const client = getSupabase()
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) throw new Error('Sign in to send and track a support request.')
  const { data, error } = await client.from('customer_support_tickets')
    .insert({ user_id: user.id, subject: subject.trim(), message: message.trim() })
    .select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function notifySupportEmail(ticketId: string, ticketKind: SupportTicketKind, event: SupportTicketEmailEvent): Promise<boolean> {
  try {
    const { data, error } = await getSupabase().functions.invoke('support-email', {
      body: { ticket_id: ticketId, ticket_kind: ticketKind, event },
    })
    return !error && (data as { sent?: boolean } | null)?.sent === true
  } catch {
    return false
  }
}
