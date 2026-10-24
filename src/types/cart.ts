export interface CartLine {
  productId: string
  quantity: number
  variantId?: string
  variantLabel?: string
}

export interface EnrichedCartLine extends CartLine {
  name: string
  slug: string
  image: string
  unitPrice: number
  currency: 'PKR'
  isPublished: boolean
  availabilityStatus: 'unavailable' | 'out-of-stock'
  lineTotal: number
}
