export const COD_ENABLED = true as const

/** Default delivery fee used until the live store settings are loaded. */
export const DELIVERY_FEE = 250

export const WHATSAPP_NUMBER = ''
export const STORE_NAME = 'Meridion Marketplace'
export const STORE_CURRENCY = 'PKR' as const
export const ANNOUNCEMENT_TEXT = 'Welcome to Meridion Marketplace — Discover Quality Goods from Verified Vendors'
/** Platform support details. Live values come from admin store settings. */
export const STORE_CONTACT = { email: 'support@meridion.market', phone: '+92 300 0000000', address: 'Meridion Commerce Hub' } as const
/** Social links */
export const SOCIAL_LINKS: { label: 'Facebook' | 'Instagram' | 'TikTok' | 'WhatsApp'; href: string }[] = [
  { label: 'Facebook', href: '#' },
  { label: 'Instagram', href: '#' },
  { label: 'TikTok', href: '#' },
  { label: 'WhatsApp', href: '#' },
]
