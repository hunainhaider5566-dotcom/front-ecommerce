import { getSupabase } from '../../lib/supabase'
import { STORE_NAME } from '../../config/store'

export interface StoreSettings {
  storeName: string
  supportEmail: string | null
  supportPhone: string | null
  supportWhatsapp: string | null
  deliveryFee: number
  codEnabled: boolean
  returnWindowDays: number
}

export const FALLBACK_STORE_SETTINGS: StoreSettings = {
  storeName: STORE_NAME,
  supportEmail: null,
  supportPhone: null,
  supportWhatsapp: null,
  deliveryFee: 250,
  codEnabled: true,
  returnWindowDays: 7,
}

let settingsPromise: Promise<StoreSettings> | null = null

async function fetchStoreSettings(): Promise<StoreSettings> {
  const { data, error } = await getSupabase()
    .from('store_settings')
    .select('store_name, support_email, support_phone, support_whatsapp, delivery_fee, cod_enabled, return_window_days')
    .eq('id', 'default')
    .maybeSingle()
  if (error || !data) return FALLBACK_STORE_SETTINGS
  return {
    storeName: data.store_name || STORE_NAME,
    supportEmail: data.support_email,
    supportPhone: data.support_phone,
    supportWhatsapp: data.support_whatsapp,
    deliveryFee: Number(data.delivery_fee ?? FALLBACK_STORE_SETTINGS.deliveryFee),
    codEnabled: data.cod_enabled !== false,
    returnWindowDays: Number(data.return_window_days ?? FALLBACK_STORE_SETTINGS.returnWindowDays),
  }
}

export function loadStoreSettings(): Promise<StoreSettings> {
  if (!settingsPromise) {
    settingsPromise = fetchStoreSettings().catch(() => FALLBACK_STORE_SETTINGS)
  }
  return settingsPromise
}

export function invalidateStoreSettings() {
  settingsPromise = null
}
