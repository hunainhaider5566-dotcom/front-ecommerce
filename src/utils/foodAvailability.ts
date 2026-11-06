import type { Category } from '../types/category'

const FOOD_AVAILABILITY_SLUGS = new Set(['fastfood', 'homemadefood'])

export function isFoodAvailabilityCategory(categoryId: string, categories: Category[]): boolean {
  const byId = new Map(categories.map((category) => [category.id, category]))
  let current = byId.get(categoryId)
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    const slug = current.slug.toLowerCase().replace(/[^a-z0-9]/g, '')
    const name = current.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (FOOD_AVAILABILITY_SLUGS.has(slug) || FOOD_AVAILABILITY_SLUGS.has(name)) return true
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return false
}
