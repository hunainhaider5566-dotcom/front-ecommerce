export interface PublicShop {
  id: string
  shopName: string
  slug: string
  description: string
  createdAt: string
  productCount: number
  shopImageUrl: string | null
  shopLocationLabel: string | null
  latitude: number | null
  longitude: number | null
}
