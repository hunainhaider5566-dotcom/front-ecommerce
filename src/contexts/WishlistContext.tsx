import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCatalog } from './CatalogContext'
import { useAuth } from './AuthContext'
import { addWishlistProduct, listMyWishlistProductIds, removeWishlistProduct } from '../services/account/wishlistService'

interface WishlistValue {
  ids: string[]
  syncError: string | null
  toggle: (productId: string) => Promise<void>
  has: (productId: string) => boolean
  refresh: () => Promise<void>
}

const WISHLIST_KEY = 'meridion-wishlist-v1'
const WishlistContext = createContext<WishlistValue | null>(null)

function readGuestWishlist(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string'))]
  } catch {
    return []
  }
}

function writeGuestWishlist(ids: string[]) {
  try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids)) } catch { /* local preference is optional */ }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { products, status, findProductById } = useCatalog()
  const { user } = useAuth()
  const [ids, setIds] = useState<string[]>(readGuestWishlist)
  const [syncError, setSyncError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setIds(readGuestWishlist())
      return
    }
    try {
      const remoteIds = await listMyWishlistProductIds()
      const guestIds = readGuestWishlist()
      if (guestIds.length) {
        await Promise.all(guestIds.map((id) => addWishlistProduct(id)))
        writeGuestWishlist([])
        setIds(await listMyWishlistProductIds())
      } else {
        setIds(remoteIds)
      }
      setSyncError(null)
    } catch (cause) {
      setSyncError(cause instanceof Error ? cause.message : 'Saved items could not be synchronized.')
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!user) writeGuestWishlist(ids)
  }, [ids, user])

  useEffect(() => {
    if (status === 'ready') {
      const availableIds = new Set(products.filter((product) => product.isPublished).map((product) => product.id))
      setIds((current) => current.filter((id) => availableIds.has(id)))
    }
  }, [status, products])

  const toggle = useCallback(async (productId: string) => {
    if (!findProductById(productId)) return
    const wasSaved = ids.includes(productId)
    setIds((current) => wasSaved ? current.filter((id) => id !== productId) : [...current, productId])
    if (!user) return
    try {
      if (wasSaved) await removeWishlistProduct(productId)
      else await addWishlistProduct(productId)
      setSyncError(null)
    } catch (cause) {
      setIds((current) => wasSaved ? [...current, productId] : current.filter((id) => id !== productId))
      setSyncError(cause instanceof Error ? cause.message : 'Saved items could not be updated.')
    }
  }, [findProductById, ids, user])

  const value = useMemo(() => ({
    ids,
    syncError,
    toggle,
    has: (productId: string) => ids.includes(productId),
    refresh,
  }), [ids, syncError, toggle, refresh])

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist(): WishlistValue {
  const context = useContext(WishlistContext)
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider')
  return context
}
