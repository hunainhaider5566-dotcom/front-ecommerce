import type { CartLine } from '../types/cart'
import type { Product } from '../types/product'

const unitDivisor = (unit: NonNullable<Product['foodSellingUnit']>) =>
  unit === 'kg' || unit === 'l' ? 1000 : 1

export function getFoodQuantityLabel(product: Product, increments: number): string {
  const unit = product.foodSellingUnit
  const step = product.foodQuantityIncrement ?? 1
  if (!unit) return String(increments)
  const amount = step * increments
  if (unit === 'kg' || unit === 'g') {
    if (unit === 'kg' && amount % 1000 === 0) return `${amount / 1000} kg`
    return `${amount} g`
  }
  if (unit === 'l' || unit === 'ml') {
    if (unit === 'l' && amount % 1000 === 0) return `${amount / 1000} L`
    return `${amount} ml`
  }
  if (unit === 'dozen') return `${amount} ${amount === 1 ? 'dozen' : 'dozen'}`
  if (unit === 'piece') return `${amount} ${amount === 1 ? 'piece' : 'pieces'}`
  return `${amount} ${amount === 1 ? 'pack' : 'packs'}`
}

export function getCartLineUnitPrice(product: Product | undefined, line: CartLine): number {
  if (!product) return 0
  const variantPrice = product.variants.find((variant) => variant.id === line.variantId)?.price
  if (variantPrice !== undefined) return variantPrice
  if (product.foodSellingUnit && product.foodUnitPrice !== null && product.foodUnitPrice !== undefined) {
    return Number((product.foodUnitPrice * (product.foodQuantityIncrement ?? 1) / unitDivisor(product.foodSellingUnit)).toFixed(2))
  }
  return product.price
}

export function isCartLineAvailable(product: Product | undefined, line: CartLine): boolean {
  if (!product?.isPublished) return false
  const variant = product.variants.find((item) => item.id === line.variantId)
  if (product.variants.length > 0 && !variant) return false
  const status = variant?.availabilityStatus ?? product.availabilityStatus
  return status !== 'out-of-stock' && status !== 'unavailable'
}

export function getCartLineMaxQuantity(product: Product | undefined, line: CartLine): number {
  if (!product || !product.isPublished) return 0
  if (product.trackInventory === false) return 99
  const variant = product.variants.find((item) => item.id === line.variantId)
  if (product.variants.length > 0 && !variant) return 0
  const stock = variant ? variant.stockQuantity : product.stockQuantity
  if (stock === undefined || stock === null) return 99
  return Math.max(0, Math.min(99, Math.floor(stock)))
}
