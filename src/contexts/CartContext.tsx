import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useCatalog } from './CatalogContext'
import { getSupabase } from '../lib/supabase'
import type { CartLine } from '../types/cart'
import type { Product } from '../types/product'

interface CartContextValue {
  lines: CartLine[]
  itemCount: number
  message: string
  loading: boolean
  add: (product: Product, quantity: number, variantId?: string, variantLabel?: string) => Promise<boolean>
  setQuantity: (productId: string, variantId: string | undefined, quantity: number) => Promise<void>
  remove: (productId: string, variantId?: string) => Promise<void>
  clear: () => Promise<void>
}

const CartContext = createContext<CartContextValue | null>(null)


export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { findProductById } = useCatalog()
  const [lines, setLines] = useState<CartLine[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const guestLinesRef = useRef<CartLine[]>([])
  const previousUserIdRef = useRef<string | null>(null)

  const loadCart = useCallback(async (userId: string) => {
    const client = getSupabase()
    const { data, error } = await client.from('cart_items')
      .select('product_id, variant_id, quantity')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
      productId: row.product_id,
      quantity: row.quantity,
      ...(row.variant_id ? { variantId: row.variant_id } : {}),
      ...(row.variant_id ? { variantLabel: findProductById(row.product_id)?.variants.find((v) => v.id === row.variant_id)?.value } : {}),
    }))
  }, [findProductById])

  useEffect(() => {
    let active = true
    if (authLoading) return () => { active = false }
    if (!user) {
      if (previousUserIdRef.current) {
        setLines([])
        guestLinesRef.current = []
      }
      previousUserIdRef.current = null
      setLoading(false)
      return () => { active = false }
    }

    previousUserIdRef.current = user.id
    setLoading(true)
    void (async () => {
      try {
        const client = getSupabase()
        const guestLines = guestLinesRef.current
        if (guestLines.length) {
          const { data: existingRows, error: readError } = await client.from('cart_items')
            .select('product_id, variant_id, quantity')
            .eq('user_id', user.id)
          if (readError) throw new Error(readError.message)
          const merged = new Map<string, { user_id: string; product_id: string; variant_id: string | null; quantity: number }>()
          for (const row of existingRows ?? []) {
            merged.set(row.product_id + ':' + (row.variant_id ?? ''), {
              user_id: user.id, product_id: row.product_id, variant_id: row.variant_id, quantity: row.quantity,
            })
          }
          for (const line of guestLines) {
            const key = line.productId + ':' + (line.variantId ?? '')
            const current = merged.get(key)
            merged.set(key, {
              user_id: user.id, product_id: line.productId, variant_id: line.variantId ?? null,
              quantity: Math.min(99, (current?.quantity ?? 0) + line.quantity),
            })
          }
          const { error: upsertError } = await client.from('cart_items').upsert([...merged.values()], {
            onConflict: 'user_id,product_id,variant_id',
          })
          if (upsertError) throw new Error(upsertError.message)
        }
        const saved = await loadCart(user.id)
        if (!active) return
        setLines(saved)
        guestLinesRef.current = []
        setMessage('')
      } catch (cause) {
        if (!active) return
        setMessage(cause instanceof Error ? cause.message : 'Your saved cart could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [user?.id, authLoading, loadCart])

  const add = useCallback<CartContextValue['add']>(async (product, requested, variantId, variantLabel) => {
    if (authLoading) {
      setMessage('Please wait while your account is checked.')
      return false
    }
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
    const newLine: CartLine = { productId: product.id, quantity, ...(variantId ? { variantId } : {}), ...(variantLabel ? { variantLabel } : {}) }

    if (!user) {
      const current = guestLinesRef.current
      const existing = current.find((line) => line.productId === product.id && line.variantId === variantId)
      const next = existing
        ? current.map((line) => line === existing ? { ...line, quantity: Math.min(99, line.quantity + quantity) } : line)
        : [...current, newLine]
      guestLinesRef.current = next
      setLines(next)
      setMessage('Guest cart is temporary. Sign in to save it to your account.')
      return true
    }

    try {
      const client = getSupabase()
      let query = client.from('cart_items').select('quantity').eq('user_id', user.id).eq('product_id', product.id)
      query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null)
      const { data: existing, error: readError } = await query.maybeSingle()
      if (readError) throw new Error(readError.message)
      const nextQuantity = Math.min(99, (existing?.quantity ?? 0) + quantity)
      const { error } = await client.from('cart_items').upsert({
        user_id: user.id, product_id: product.id, variant_id: variantId ?? null, quantity: nextQuantity,
      }, { onConflict: 'user_id,product_id,variant_id' })
      if (error) throw new Error(error.message)
      setLines(await loadCart(user.id))
      setMessage(`${product.name} added to your saved cart.`)
      return true
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The item could not be saved to your account cart.')
      return false
    }
  }, [authLoading, findProductById, user, loadCart])

  const setQuantity = useCallback<CartContextValue['setQuantity']>(async (productId, variantId, quantity) => {
    if (!user) {
      if (quantity <= 0) {
        const next = guestLinesRef.current.filter((line) => !(line.productId === productId && line.variantId === variantId))
        guestLinesRef.current = next
        setLines(next)
        return
      }
      const safeQuantity = Math.max(1, Math.min(99, Math.floor(quantity)))
      const next = guestLinesRef.current.map((line) => line.productId === productId && line.variantId === variantId ? { ...line, quantity: safeQuantity } : line)
      guestLinesRef.current = next
      setLines(next)
      return
    }
    try {
      const client = getSupabase()
      let query = client.from('cart_items').delete().eq('user_id', user.id).eq('product_id', productId)
      if (quantity > 0) {
        let update = client.from('cart_items').update({ quantity: Math.max(1, Math.min(99, Math.floor(quantity))) })
          .eq('user_id', user.id).eq('product_id', productId)
        update = variantId ? update.eq('variant_id', variantId) : update.is('variant_id', null)
        const { error } = await update
        if (error) throw new Error(error.message)
      } else {
        query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null)
        const { error } = await query
        if (error) throw new Error(error.message)
      }
      setLines(await loadCart(user.id))
      setMessage('')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The cart could not be updated.')
    }
  }, [user, loadCart])

  const remove = useCallback<CartContextValue['remove']>(async (productId, variantId) => {
    if (!user) {
      const next = guestLinesRef.current.filter((line) => !(line.productId === productId && line.variantId === variantId))
      guestLinesRef.current = next
      setLines(next)
      setMessage('Item removed from your temporary cart.')
      return
    }
    try {
      const client = getSupabase()
      let query = client.from('cart_items').delete().eq('user_id', user.id).eq('product_id', productId)
      query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null)
      const { error } = await query
      if (error) throw new Error(error.message)
      setLines(await loadCart(user.id))
      setMessage('Item removed from your cart.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The item could not be removed.')
    }
  }, [user, loadCart])

  const clear = useCallback<CartContextValue['clear']>(async () => {
    if (!user) {
      guestLinesRef.current = []
      setLines([])
      setMessage('Your temporary cart is clear.')
      return
    }
    try {
      const { error } = await getSupabase().from('cart_items').delete().eq('user_id', user.id)
      if (error) throw new Error(error.message)
      setLines([])
      setMessage('Your saved cart is clear.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The cart could not be cleared.')
    }
  }, [user])

  const value = useMemo(() => ({
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    message,
    loading,
    add,
    setQuantity,
    remove,
    clear,
  }), [lines, message, loading, add, setQuantity, remove, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside CartProvider')
  return context
}
