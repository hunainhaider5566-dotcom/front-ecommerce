import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import { catalogService } from '../services/products/productService'
import type { Category } from '../types/category'
import type { Product } from '../types/product'
import type { PublicShop } from '../types/shop'

type CatalogStatus = 'loading' | 'ready' | 'error' | 'unconfigured'
type CatalogSnapshot = { products: Product[]; categories: Category[]; shops: PublicShop[] }
const CATALOG_CACHE_KEY = 'jtbazar.catalog.snapshot.v1'

function readCatalogSnapshot(): CatalogSnapshot | null {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(CATALOG_CACHE_KEY) : null
    if (!raw) return null
    const value = JSON.parse(raw) as CatalogSnapshot
    return Array.isArray(value.products) && Array.isArray(value.categories) && Array.isArray(value.shops) ? value : null
  } catch { return null }
}

function writeCatalogSnapshot(value: CatalogSnapshot) {
  try { if (typeof window !== 'undefined') window.sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(value)) } catch { /* cache is optional */ }
}

interface CatalogValue {
  products: Product[]
  categories: Category[]
  shops: PublicShop[]
  status: CatalogStatus
  error: string | null
  refresh: () => void
  findProductById: (id: string) => Product | undefined
  findProductBySlug: (slug: string) => Product | undefined
  findCategoryBySlug: (slug: string) => Category | undefined
  findShopBySlug: (slug: string) => PublicShop | undefined
  productsBySeller: (sellerId: string) => Product[]
}

const CatalogContext = createContext<CatalogValue | null>(null)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [initialCatalog] = useState(readCatalogSnapshot)
  const [products, setProducts] = useState<Product[]>(() => initialCatalog?.products ?? [])
  const [categories, setCategories] = useState<Category[]>(() => initialCatalog?.categories ?? [])
  const [shops, setShops] = useState<PublicShop[]>(() => initialCatalog?.shops ?? [])
  const [status, setStatus] = useState<CatalogStatus>(isSupabaseConfigured ? initialCatalog ? 'ready' : 'loading' : 'unconfigured')
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((current) => current + 1), [])

  useEffect(() => {
    let cancelled = false
    setError(null)

    if (!isSupabaseConfigured) {
      setProducts([])
      setCategories([])
      setShops([])
      setStatus('unconfigured')
      return () => { cancelled = true }
    }

    if (!initialCatalog) setStatus('loading')
    catalogService.loadCatalog()
      .then((catalog) => {
        if (cancelled) return
        setProducts(catalog.products)
        setCategories(catalog.categories)
        setShops(catalog.shops)
        writeCatalogSnapshot(catalog)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'The catalog could not be loaded.')
        setStatus('error')
      })

    return () => { cancelled = true }
  }, [refreshToken])



  const value = useMemo<CatalogValue>(() => ({
    products,
    categories,
    shops,
    status,
    error,
    refresh,
    findProductById: (id) => products.find((product) => product.id === id && product.isPublished),
    findProductBySlug: (slug) => products.find((product) => product.slug === slug && product.isPublished),
    findCategoryBySlug: (slug) => categories.find((category) => category.slug === slug && category.isActive !== false),
    findShopBySlug: (slug) => shops.find((shop) => shop.slug === slug),
    productsBySeller: (sellerId) => products.filter((product) => product.sellerId === sellerId),
  }), [products, categories, shops, status, error, refresh])

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog() {
  const context = useContext(CatalogContext)
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider')
  return context
}
