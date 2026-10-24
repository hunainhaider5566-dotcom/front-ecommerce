export type AvailabilityStatus = 'available' | 'out-of-stock' | 'unavailable' | 'unknown'

export interface ProductVariant {
  id: string
  label: string
  value: string
  price?: number
  sku?: string
  availabilityStatus?: Exclude<AvailabilityStatus, 'unavailable'>
}

export interface ProductSpecification {
  label: string
  value: string
}

export interface Product {
  id: string
  slug: string
  name: string
  shortDescription: string
  description: string
  price: number
  currency: string
  categoryId: string
  images: string[]
  specifications: ProductSpecification[]
  variants: ProductVariant[]
  isPublished: boolean
  availabilityStatus: AvailabilityStatus
  isFeatured?: boolean
  trackInventory?: boolean
  sellerId?: string | null
  sellerName?: string | null
  sellerSlug?: string | null
  createdAt?: string
}
