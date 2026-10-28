export interface Category {
  id: string
  slug: string
  name: string
  description: string
  image?: string
  eyebrow?: string
  isActive?: boolean
  sortOrder?: number
  seoTitle?: string | null
  seoDescription?: string | null
}
