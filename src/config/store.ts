export const COD_ENABLED = true as const

/** Default delivery fee used until the live store settings are loaded. */
export const DELIVERY_FEE = 250

export const STORE_NAME = 'Meridion Marketplace'
export const STORE_CURRENCY = 'PKR' as const
export const ANNOUNCEMENT_TEXT = 'Welcome to Meridion Marketplace — Discover Quality Goods from Verified Vendors'
/** Optional social profiles. Add verified URLs in one place; empty entries are not rendered. */
export const SOCIAL_LINKS: { label: 'Facebook' | 'Instagram' | 'TikTok' | 'WhatsApp'; href: string }[] = []
