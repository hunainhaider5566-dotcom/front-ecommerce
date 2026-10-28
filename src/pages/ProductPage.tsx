import { getProductReviews, type ProductReview } from '../services/products/reviewService'
import { Star } from 'lucide-react'
import { ArrowLeft, ArrowRight, BookOpen, Check, MessageCircle, PackageCheck, ShieldCheck, Store } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AvailabilityBadge } from '../components/products/AvailabilityBadge'
import { QuantitySelector } from '../components/products/QuantitySelector'
import { WishlistButton } from '../components/products/WishlistButton'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { useCart } from '../contexts/CartContext'
import { useCatalog } from '../contexts/CatalogContext'
import { useToast } from '../contexts/ToastContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { SITE_URL } from '../config/store'
import { useStoreSettings } from '../hooks/useStoreSettings'
import { useI18n } from '../i18n/LocaleContext'
import { formatPKR } from '../utils/money'
import { supportDestination, productInquiryMessage } from '../utils/support'

export function ProductPage() {
  const { t } = useI18n()
  const { slug = '' } = useParams()
  const { status, error, findProductBySlug, categories } = useCatalog()
  const settings = useStoreSettings()
  const product = findProductBySlug(slug)
  const [quantity, setQuantity] = useState(1)
  const [variantId, setVariantId] = useState(product?.variants[0]?.id ?? '')
  const [imageIndex, setImageIndex] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)
  const [added, setAdded] = useState(false)
  const [reviews, setReviews] = useState<ProductReview[]>([])

  useEffect(() => {
    if (product?.id) {
      getProductReviews(product.id).then(setReviews).catch(() => setReviews([]))
    }
  }, [product?.id])
  const addLock = useRef(false)
  const { add } = useCart()
  const { push } = useToast()

  useEffect(() => {
    setQuantity(1)
    setVariantId(product?.variants[0]?.id ?? '')
    setImageIndex(0)
    setImageFailed(false)
    setAdded(false)
    addLock.current = false
  }, [product?.id])

  const productSchema = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription || product.description,
    image: product.images,
    sku: product.variants.find((variant) => variant.id === variantId)?.sku,
    brand: { '@type': 'Brand', name: 'JTBazar' },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/products/${product.slug}`,
      priceCurrency: product.currency || 'PKR',
      price: product.variants.find((variant) => variant.id === variantId)?.price ?? product.price,
      availability: product.availabilityStatus === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  } : null
  usePageMeta(product ? t(product.seoTitle || product.name) : t('Product not found'), product ? t(product.seoDescription || product.shortDescription || product.description) : t('This catalog product could not be found.'), { image: product?.images[0], type: 'product', structuredData: productSchema, noIndex: status === 'ready' && !product })
  if (status === 'loading') return <div className="page-shell"><LoadingState label="Loading product details…" /></div>
  if (status === 'error') return <div className="page-shell"><ErrorState message={error || 'The catalog could not be loaded.'} /></div>
  if (status === 'unconfigured') return <div className="page-shell"><ErrorState message="The product catalog is temporarily unavailable." /></div>
  if (!product) return <div className="page-shell"><EmptyState title="This product is not in the published catalog" description="It may have been unpublished or removed. Browse current active products instead." actionLabel="Browse the catalog" /></div>

  const productName = t(product.name)
  const categoryName = t(categories.find((item) => item.id === product.categoryId)?.name ?? 'Collection')
  const images = product.images
  const activeImage = images[imageIndex]
  const avgRating = reviews.length ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : null
  const selectedVariant = product.variants.find((variant) => variant.id === variantId)
  const price = selectedVariant?.price ?? product.price
  const support = supportDestination(productInquiryMessage(productName, product.slug), settings.supportWhatsapp)
  const availability = selectedVariant?.availabilityStatus ?? product.availabilityStatus
  const canAdd = product.isPublished && availability !== 'out-of-stock' && availability !== 'unavailable' && availability !== 'unknown'
  const previousImage = () => { setImageFailed(false); setImageIndex((current) => (current - 1 + images.length) % images.length) }
  const nextImage = () => { setImageFailed(false); setImageIndex((current) => (current + 1) % images.length) }
  function handleAdd() {
    if (!product || !canAdd || added || addLock.current) return
    addLock.current = true
    if (add(product, quantity, variantId || undefined, selectedVariant?.value)) {
      setAdded(true)
      push(t('Added to your cart.'), 'success')
      window.setTimeout(() => { addLock.current = false; setAdded(false) }, 2200)
    } else {
      addLock.current = false
    }
  }

  return <div className="page-shell product-detail-page">
    <Link to="/shop" className="back-link"><ArrowLeft size={15} /> {t('Back to collection')}</Link>
    <div className="product-detail">
      <div className="product-gallery" role="group" aria-label={`${productName} ${t('image gallery')}`}>
        <div className="product-gallery__main">
          {imageFailed || !activeImage ? <div className="image-fallback image-fallback--large"><BookOpen size={42} /><span>{productName}</span></div> : <img src={activeImage} alt={`${productName} ${imageIndex + 1}`} onError={() => setImageFailed(true)} />}
          {images.length > 0 && <span className="gallery-counter" aria-live="polite">{String(imageIndex + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}</span>}
        </div>
        {images.length > 1 && <>
          <div className="product-gallery__controls"><button type="button" aria-label={t('Previous product image')} onClick={previousImage}><ArrowLeft size={17} /></button><span>{t('Image')} {imageIndex + 1} {t('of')} {images.length}</span><button type="button" aria-label={t('Next product image')} onClick={nextImage}><ArrowRight size={17} /></button></div>
          <div className="product-gallery__thumbnails" aria-label={t('Choose a product image')}>{images.map((image, index) => <button type="button" key={image} className={`product-gallery__thumbnail${imageIndex === index ? ' is-active' : ''}`} aria-label={`${t('Show image')} ${index + 1} ${t('of')} ${images.length}`} aria-pressed={imageIndex === index} onClick={() => { setImageFailed(false); setImageIndex(index) }}><img src={image} alt="" aria-hidden="true" loading="lazy" /></button>)}</div>
        </>}
      </div>
      <div className="product-detail__content">
        <div className="product-detail__topline"><span className="eyebrow">{categoryName}</span><WishlistButton productId={product.id} productName={productName} /></div>
        <h1>{productName}</h1>
        <p className="product-detail__description">{t(product.description)}</p>
        <div className="product-price-row">
          <strong>{formatPKR(price)}</strong>
          <AvailabilityBadge status={availability} />
          {avgRating && <span className="product-rating-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "14px", color: "#b96e52", fontWeight: 700 }}><Star size={16} fill="currentColor" /> {avgRating} ({reviews.length} {t("reviews")})</span>}
        </div>
        <p className="product-price-caption">{t('Published catalog price')} · {t('Availability is checked again when you place your order.')}</p>
        {product.variants.length > 0 && <fieldset className="variant-picker"><legend>{t(product.variants[0].label)}</legend><div className="variant-options">{product.variants.map((variant) => { const variantUnavailable = variant.availabilityStatus === 'out-of-stock'; return <button type="button" key={variant.id} className={`variant-option${variantId === variant.id ? ' is-selected' : ''}`} aria-pressed={variantId === variant.id} aria-disabled={variantUnavailable} onClick={() => setVariantId(variant.id)}><span>{t(variant.value)}{variant.price !== undefined && variant.price !== product.price ? ` · ${formatPKR(variant.price)}` : ''}</span>{variantId === variant.id && <Check size={14} />}{variantUnavailable && <small>{t('Out of stock')}</small>}</button> })}</div></fieldset>}
        <div className="detail-purchase-row"><span className="eyebrow">{t('Quantity')}</span><QuantitySelector value={quantity} onChange={setQuantity} label={`${t('Quantity for')} ${productName}`} /></div>
        <button type="button" className="button button--dark button--full" disabled={!canAdd || added} onClick={handleAdd}>{added ? <><Check size={17} /> {t('Added to cart')}</> : <>{t('Add to cart')} <ArrowRight size={17} /></>}</button>
        <p className="product-detail__reassurance"><ShieldCheck size={15} /> {t(settings.codEnabled ? 'Cash on delivery. Prices and stock are validated when the order is placed.' : 'Prices and stock are validated when an order is placed.')}</p>
        {product.sellerName && product.sellerSlug && <Link className="product-seller-link" to={`/shops/${product.sellerSlug}`}><Store size={15} /> {t('Sold by')} {product.sellerName}</Link>}
                {reviews.length > 0 && (
          <div className="product-reviews-section" style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #e7e3dc" }}>
            <h3 style={{ fontSize: "18px", marginBottom: "12px" }}>{t("Customer Reviews")} ({reviews.length})</h3>
            <div className="product-reviews-list" style={{ display: "grid", gap: "12px" }}>
              {reviews.map((r) => (
                <div key={r.id} className="product-review-card" style={{ padding: "12px", border: "1px solid #eeeae3", borderRadius: "4px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#b96e52", marginBottom: "4px" }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} fill={i < r.rating ? "currentColor" : "none"} />
                    ))}
                    <strong style={{ fontSize: "12px", color: "#20231f" }}>{r.rating}/5</strong>
                  </div>
                  {r.title && <strong style={{ display: "block", fontSize: "14px", marginBottom: "2px" }}>{r.title}</strong>}
                  {r.comment && <p style={{ fontSize: "13px", color: "#555b51", margin: 0 }}>{r.comment}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="detail-accordions"><details><summary><span><BookOpen size={16} /> {t('Product details')}</span><span>+</span></summary><ul>{product.specifications.map((spec) => <li key={spec.label}><span>{t(spec.label)}</span><span>{t(spec.value)}</span></li>)}</ul></details><details><summary><span><PackageCheck size={16} /> {t('Shipping & returns')}</span><span>+</span></summary><p>{t('Delivery fee')}: {formatPKR(settings.deliveryFee)}. {t('Returns are accepted within')} {settings.returnWindowDays} {t('days of delivery through your account.')}</p><Link to="/returns">{t('Read the returns policy')}</Link></details></div>
        <a className="product-inquiry-link" href={support} target={support.startsWith('https://') ? '_blank' : undefined} rel={support.startsWith('https://') ? 'noopener noreferrer' : undefined}><MessageCircle size={16} /> {t('Ask a question about this listing')}</a>
      </div>
    </div>
  </div>
}
