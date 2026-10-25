import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ShoppingBag, Store, ChevronLeft, ChevronRight, Sparkles, BookOpen, Map as MapIcon } from 'lucide-react'
import { useCart } from '../contexts/CartContext'
import { useCatalog } from '../contexts/CatalogContext'
import { useWishlist } from '../contexts/WishlistContext'
import { useToast } from '../contexts/ToastContext'
import { formatPKR } from '../utils/money'
import { useI18n } from '../i18n/LocaleContext'
import { usePageMeta } from '../hooks/usePageMeta'
import type { Product } from '../types/product'
import { AvailabilityBadge } from '../components/products/AvailabilityBadge'
import { NearbyShopsMap } from '../components/shops/NearbyShopsMap'

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
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [visibleCount, setVisibleCount] = useState(6)
  const [view, setView] = useState<'map' | 'products'>('map')
  const trackRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Array<HTMLElement | null>>([])
  const shopsById = useMemo(() => new Map(shops.map((shop) => [shop.id, shop])), [shops])
  const items = useMemo<DiscoverItem[]>(() => products
    .filter((product) => product.isPublished)
    .sort((a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured)) || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map((product) => {
      const shop = product.sellerId ? shopsById.get(product.sellerId) : undefined
      return { product, sellerName: product.sellerName ?? shop?.shopName ?? null, sellerSlug: product.sellerSlug ?? shop?.slug ?? null }
    }), [products, shopsById])
  const visibleItems = items.slice(0, visibleCount)

  useEffect(() => {
    if (currentIndex > visibleItems.length - 1) setCurrentIndex(Math.max(0, visibleItems.length - 1))
  }, [currentIndex, visibleItems.length])

  useEffect(() => {
    cardRefs.current[currentIndex]?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' })
  }, [currentIndex, reducedMotion])

  useEffect(() => {
    if (reducedMotion || window.matchMedia('(max-width: 760px)').matches || items.length < 2) return
    const timer = window.setInterval(() => {
      setVisibleCount((count) => Math.min(items.length, Math.max(count, currentIndex + 2)))
      setCurrentIndex((index) => index >= items.length - 1 ? 0 : index + 1)
    }, 6500)
    return () => window.clearInterval(timer)
  }, [currentIndex, visibleItems.length, items.length, reducedMotion])

  function handleTrackScroll() {
    const track = trackRef.current
    if (!track) return
    const horizontal = window.matchMedia('(min-width: 761px)').matches
    const center = horizontal ? track.getBoundingClientRect().left + track.clientWidth / 2 : track.getBoundingClientRect().top + track.clientHeight / 2
    let nearest = currentIndex
    let distance = Number.POSITIVE_INFINITY
    cardRefs.current.slice(0, visibleItems.length).forEach((card, index) => {
      if (!card) return
      const rect = card.getBoundingClientRect()
      const cardCenter = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2
      if (Math.abs(cardCenter - center) < distance) { distance = Math.abs(cardCenter - center); nearest = index }
    })
    if (nearest !== currentIndex) setCurrentIndex(nearest)
  }

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

  const hasMore = visibleItems.length < items.length

  return (
    <div className="discover-page-container">
      <header className="discover-heading"><span className="eyebrow">{t('Discover')}</span><h1>{t(view === 'map' ? 'Explore shops near you.' : 'Find your next favourite.')}</h1><p>{t(view === 'map' ? 'Find independent marketplace shops around your current location.' : 'Real finds from independent marketplace shops.')}</p></header>
      <div className="discover-view-switch" role="group" aria-label={t('Explore view')}><button type="button" className={view === 'map' ? 'is-active' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}><MapIcon size={16} /> {t('Nearby shops')}</button><button type="button" className={view === 'products' ? 'is-active' : ''} aria-pressed={view === 'products'} onClick={() => setView('products')}><Sparkles size={16} /> {t('Product discovery')}</button></div>
      {view === 'map' && <NearbyShopsMap shops={shops} />}
      {view === 'products' && (items.length === 0 ? <div className="empty-state"><Sparkles size={32} /><h2>{t('No Discover items available')}</h2><p>{t('Check back soon as sellers publish new products.')}</p><Link to="/shop" className="button button--dark">{t('Browse Store')}</Link></div> : <>
      <div className="discover-nav-buttons">
        <button type="button" className="discover-nav-btn" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0} aria-label={t('Previous product')}><ChevronLeft size={22} /></button>
        <span className="discover-counter" aria-live="polite">{currentIndex + 1} / {items.length}</span>
        <button type="button" className="discover-nav-btn" onClick={() => { if (currentIndex < visibleItems.length - 1) setCurrentIndex((index) => index + 1); else if (hasMore) { const next = Math.min(items.length, visibleCount + 6); setVisibleCount(next); setCurrentIndex((index) => Math.min(next - 1, index + 1)) } }} disabled={currentIndex === items.length - 1} aria-label={t('Next product')}><ChevronRight size={22} /></button>
      </div>
      <div className="discover-track" ref={trackRef} onScroll={handleTrackScroll} aria-label={t('Discover products')}>
        {visibleItems.map((item, index) => {
          const saved = has(item.product.id)
          const canAdd = item.product.variants.length === 0 && item.product.availabilityStatus === 'available'
          return <article className="discover-card shine-surface" key={item.product.id} ref={(element) => { cardRefs.current[index] = element }}>
            <div className="discover-media">
              <Link to={`/products/${item.product.slug}`} className="discover-product-image" aria-label={`${t('View')} ${item.product.name}`}>
                {item.product.images[0] ? <img src={item.product.images[0]} alt={item.product.name} loading={index < 2 ? 'eager' : 'lazy'} /> : <div className="image-fallback image-fallback--large"><BookOpen size={42} /><span>{item.product.name}</span></div>}
              </Link>
              <div className="discover-overlay-top"><span className="discover-badge"><Sparkles size={14} /> {t('Discover')}</span>{item.sellerSlug && item.sellerName && <Link to={`/shops/${item.sellerSlug}`} className="discover-shop-tag"><Store size={14} /> {item.sellerName}</Link>}</div>
            </div>
            <div className="discover-content">
              <div className="discover-info"><span className="discover-price">{formatPKR(item.product.price)}</span><h2><Link to={`/products/${item.product.slug}`}>{item.product.name}</Link></h2><p>{item.product.shortDescription}</p><AvailabilityBadge status={item.product.availabilityStatus} />{item.sellerName && item.sellerSlug && <Link to={`/shops/${item.sellerSlug}`} className="discover-seller-link">{t('Sold by')} {item.sellerName}</Link>}</div>
              <div className="discover-actions">
                <button type="button" className={`discover-wishlist-btn${saved ? ' is-active' : ''}`} onClick={() => { void toggle(item.product.id); push(t(saved ? 'Removed from wishlist' : 'Saved to wishlist'), 'success') }} aria-pressed={saved}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /><span>{saved ? t('Saved') : t('Wishlist')}</span></button>
                {item.product.variants.length > 0 ? <Link to={`/products/${item.product.slug}`} className="button button--dark discover-cart-btn"><ShoppingBag size={18} /><span>{t('Choose options')}</span></Link> : <button type="button" className="button button--dark discover-cart-btn" disabled={!canAdd} onClick={() => { if (add(item.product, 1)) push(t('Added to your cart.'), 'success') }}><ShoppingBag size={18} /><span>{t(canAdd ? 'Add to Cart' : item.product.availabilityStatus === 'out-of-stock' ? 'Out of stock' : 'Not available')}</span></button>}
                <Link to={`/products/${item.product.slug}`} className="button button--outline">{t('View Details')}</Link>
              </div>
            </div>
          </article>
        })}
      </div>
      {hasMore && <button type="button" className="button button--outline discover-load-more" onClick={() => setVisibleCount((count) => Math.min(items.length, count + 6))}>{t('Load more products')}</button>}
      </>)}
    </div>
  )
}
