import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ShoppingBag, Store, ChevronUp, ChevronDown, Sparkles, BookOpen } from 'lucide-react'
import { useCart } from '../contexts/CartContext'
import { useCatalog } from '../contexts/CatalogContext'
import { useWishlist } from '../contexts/WishlistContext'
import { useToast } from '../contexts/ToastContext'
import { formatPKR } from '../utils/money'
import { useI18n } from '../i18n/LocaleContext'
import { usePageMeta } from '../hooks/usePageMeta'
import type { Product } from '../types/product'

interface DiscoverItem {
  product: Product
  sellerName: string | null
  sellerSlug: string | null
}

export function DiscoverPage() {
  const { t } = useI18n()
  const { products, shops, status, error } = useCatalog()
  const { add } = useCart()
  const { has, toggle } = useWishlist()
  const { push } = useToast()
  usePageMeta(t('Discover Feed'), t('Explore trending products and top sellers in a swipeable discovery feed.'))

  const [currentIndex, setCurrentIndex] = useState(0)
  const shopsById = useMemo(() => new Map(shops.map((shop) => [shop.id, shop])), [shops])
  const items = useMemo<DiscoverItem[]>(() => products
    .filter((product) => product.isPublished)
    .sort((a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured)) || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map((product) => {
      const shop = product.sellerId ? shopsById.get(product.sellerId) : undefined
      return { product, sellerName: product.sellerName ?? shop?.shopName ?? null, sellerSlug: product.sellerSlug ?? shop?.slug ?? null }
    }), [products, shopsById])

  useEffect(() => {
    if (currentIndex > items.length - 1) setCurrentIndex(Math.max(0, items.length - 1))
  }, [currentIndex, items.length])

  if (status === 'loading') {
    return (
      <div className="discover-screen discover-screen--loading">
        <Sparkles size={32} className="spin" />
        <p>{t('Loading Discover Feed…')}</p>
      </div>
    )
  }

  if (status === 'error') {
    return <div className="page-shell"><div className="empty-state"><Sparkles size={32} /><h2>{t('The catalog is unavailable')}</h2><p>{error || t('The catalog could not be loaded.')}</p><Link to="/shop" className="button button--dark">{t('Browse Store')}</Link></div></div>
  }

  if (items.length === 0) {
    return (
      <div className="page-shell">
        <div className="empty-state">
          <Sparkles size={32} />
          <h2>{t('No Discover items available')}</h2>
          <p>{t('Check back soon as sellers publish new products.')}</p>
          <Link to="/shop" className="button button--dark">{t('Browse Store')}</Link>
        </div>
      </div>
    )
  }

  const current = items[currentIndex]
  const saved = has(current.product.id)
  const canAdd = current.product.variants.length === 0 && current.product.availabilityStatus === 'available'

  return (
    <div className="discover-page-container">
      <div className="discover-nav-buttons">
        <button className="discover-nav-btn" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0} aria-label={t('Previous product')}><ChevronUp size={24} /></button>
        <span className="discover-counter">{currentIndex + 1} / {items.length}</span>
        <button className="discover-nav-btn" onClick={() => setCurrentIndex((index) => Math.min(items.length - 1, index + 1))} disabled={currentIndex === items.length - 1} aria-label={t('Next product')}><ChevronDown size={24} /></button>
      </div>

      <div className="discover-card shine-surface">
        <div className="discover-media">
          {current.product.images[0] ? <img src={current.product.images[0]} alt={current.product.name} /> : <div className="image-fallback image-fallback--large"><BookOpen size={42} /><span>{current.product.name}</span></div>}
          <div className="discover-overlay-top">
            <span className="discover-badge"><Sparkles size={14} /> {t('Discover')}</span>
            {current.sellerSlug && current.sellerName && <Link to={`/shops/${current.sellerSlug}`} className="discover-shop-tag"><Store size={14} /> {current.sellerName}</Link>}
          </div>
        </div>

        <div className="discover-content">
          <div className="discover-info">
            <span className="discover-price">{formatPKR(current.product.price)}</span>
            <h2>{current.product.name}</h2>
            <p>{current.product.shortDescription}</p>
          </div>

          <div className="discover-actions">
            <button className={`discover-wishlist-btn${saved ? ' is-active' : ''}`} onClick={() => { void toggle(current.product.id); push(t(saved ? 'Removed from wishlist' : 'Saved to wishlist'), 'success') }} aria-pressed={saved}>
              <Heart size={20} fill={saved ? 'currentColor' : 'none'} />
              <span>{saved ? t('Saved') : t('Wishlist')}</span>
            </button>

            {current.product.variants.length > 0
              ? <Link to={`/products/${current.product.slug}`} className="button button--dark discover-cart-btn"><ShoppingBag size={18} /><span>{t('Choose options')}</span></Link>
              : <button className="button button--dark discover-cart-btn" disabled={!canAdd} onClick={() => { if (add(current.product, 1)) push(t('Added to cart'), 'success') }}><ShoppingBag size={18} /><span>{t('Add to Cart')}</span></button>}

            <Link to={`/products/${current.product.slug}`} className="button button--outline">{t('View Details')}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
