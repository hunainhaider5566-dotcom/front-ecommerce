import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCatalog } from './CatalogContext'
import type { CartLine } from '../types/cart'
import type { Product } from '../types/product'

interface CartContextValue {
  lines: CartLine[]
  itemCount: number
  message: string
  add: (product: Product, quantity: number, variantId?: string, variantLabel?: string) => boolean
  setQuantity: (productId: string, variantId: string | undefined, quantity: number) => void
  remove: (productId: string, variantId?: string) => void
  clear: () => void
}

const CART_KEY = 'meridion-cart-v1'
const CartContext = createContext<CartContextValue | null>(null)

function readCart(): CartLine[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((line): line is CartLine =>
      typeof line?.productId === 'string' && Number.isInteger(line?.quantity) && line.quantity > 0,
    ).map((line) => ({
      productId: line.productId,
      quantity: Math.min(line.quantity, 99),
      ...(typeof line.variantId === 'string' ? { variantId: line.variantId } : {}),
      ...(typeof line.variantLabel === 'string' ? { variantLabel: line.variantLabel } : {}),
    }))
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { findProductById } = useCatalog()
  const [lines, setLines] = useState<CartLine[]>(readCart)
  const [message, setMessage] = useState('')

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(lines))
  }, [lines])

  const add = useCallback<CartContextValue['add']>((product, requested, variantId, variantLabel) => {
    const currentProduct = findProductById(product.id)
    const selectedVariant = currentProduct?.variants.find((variant) => variant.id === variantId)
    const availability = selectedVariant?.availabilityStatus ?? currentProduct?.availabilityStatus
    if (!currentProduct || !currentProduct.isPublished || availability === 'unavailable' || availability === 'out-of-stock') {
      setMessage(`${product.name} is not currently available to add.`)
      return false
    }
    if (currentProduct.variants.length > 0 && (!variantId || !selectedVariant)) {
      setMessage(`Choose an option for ${product.name} before adding it.`)
      return false
    }
    const quantity = Math.max(1, Math.min(99, Math.floor(requested) || 1))
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id && line.variantId === variantId)
      if (existing) return current.map((line) => line === existing ? { ...line, quantity: Math.min(99, line.quantity + quantity) } : line)
      return [...current, { productId: product.id, quantity, ...(variantId ? { variantId } : {}), ...(variantLabel ? { variantLabel } : {}) }]
    })
    setMessage(`${product.name} added to your cart.`)
    return true
  }, [findProductById])

  const setQuantity = useCallback<CartContextValue['setQuantity']>((productId, variantId, quantity) => {
    if (quantity <= 0) {
      setLines((current) => current.filter((line) => !(line.productId === productId && line.variantId === variantId)))
      return
    }
    const safeQuantity = Math.max(1, Math.min(99, Math.floor(quantity)))
    setLines((current) => current.map((line) => line.productId === productId && line.variantId === variantId ? { ...line, quantity: safeQuantity } : line))
  }, [])

  const remove = useCallback<CartContextValue['remove']>((productId, variantId) => {
    setLines((current) => current.filter((line) => !(line.productId === productId && line.variantId === variantId)))
    setMessage('Item removed from your cart.')
  }, [])

  const clear = useCallback(() => {
    setLines([])
    setMessage('Your cart is clear.')
  }, [])

  const value = useMemo(() => ({
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    message,
    add,
    setQuantity,
    remove,
    clear,
  }), [lines, message, add, setQuantity, remove, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside CartProvider')
  return context
}
