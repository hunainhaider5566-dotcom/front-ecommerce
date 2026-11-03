export type AvailabilityStatus = 'available' | 'out-of-stock' | 'unavailable' | 'unknown'

export interface ProductVariant {
  id: string
  label: string
  value: string
  price?: number
  originalPrice?: number
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
  originalPrice?: number
  discountPercent?: number
  foodSellingUnit?: 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'dozen' | 'pack' | null
  foodUnitPrice?: number | null
  originalFoodUnitPrice?: number | null
  foodQuantityIncrement?: number | null
  foodMinimumQuantity?: number | null
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
  vendorId?: string
  sellerName?: string
  sellerSlug?: string
  createdAt?: string
  seoTitle?: string | null
  seoDescription?: string | null
}
