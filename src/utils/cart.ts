import type { CartLine } from '../types/cart'
import type { Product } from '../types/product'

export function getCartLineUnitPrice(product: Product | undefined, line: CartLine): number {
  if (!product) return 0
  return product.variants.find((variant) => variant.id === line.variantId)?.price ?? product.price
}

export function isCartLineAvailable(product: Product | undefined, line: CartLine): boolean {
  if (!product?.isPublished) return false
  const variant = product.variants.find((item) => item.id === line.variantId)
  if (product.variants.length > 0 && !variant) return false
  const status = variant?.availabilityStatus ?? product.availabilityStatus
  return status !== 'out-of-stock' && status !== 'unavailable'
}
