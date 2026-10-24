import { BookOpen, ShoppingBag } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../../contexts/CartContext'
import { useI18n } from '../../i18n/LocaleContext'
import { useToast } from '../../contexts/ToastContext'
import type { Product } from '../../types/product'
import { formatPKR } from '../../utils/money'
import { AvailabilityBadge } from './AvailabilityBadge'
import { WishlistButton } from './WishlistButton'

export function ProductCard({ product }: { product: Product }) {
  const [imageFailed, setImageFailed] = useState(false)
  const [adding, setAdding] = useState(false)
  const addLock = useRef(false)
  const { add } = useCart()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { push } = useToast()
  const name = t(product.name)
  const canAdd = product.isPublished && product.variants.length === 0 && product.availabilityStatus !== 'out-of-stock' && product.availabilityStatus !== 'unavailable' && product.availabilityStatus !== 'unknown'
  function handleAdd() {
    if (product.variants.length > 0) {
      navigate(`/products/${product.slug}`)
      return
    }
    if (addLock.current || !canAdd) return
    addLock.current = true
    setAdding(true)
    if (add(product, 1)) {
      push(t('Added to your cart.'), 'success')
      window.setTimeout(() => { addLock.current = false; setAdding(false) }, 900)
    } else {
      addLock.current = false
      setAdding(false)
    }
  }
  return (
    <article className="product-card shine-surface">
      <div className="product-card__image-wrap">
        <Link to={`/products/${product.slug}`} className="product-card__image-link" aria-label={`${t('View')} ${name}`}>
          {imageFailed || !product.images[0] ? <div className="image-fallback"><BookOpen size={34} aria-hidden="true" /><span>{name}</span></div> : <img src={product.images[0]} alt={name} loading="lazy" onError={() => setImageFailed(true)} />}
        </Link>
        {product.sellerName && <span className="product-card__badge">{t(product.sellerName)}</span>}
        <WishlistButton productId={product.id} productName={name} />
      </div>
      <div className="product-card__body">
        <div className="product-card__title-row"><Link to={`/products/${product.slug}`} className="product-card__name">{name}</Link><span className="product-card__price">{formatPKR(product.price)}</span></div>
        <p className="product-card__description">{t(product.shortDescription)}</p>
        <div className="product-card__bottom"><AvailabilityBadge status={product.availabilityStatus} /><button type="button" className="product-add" onClick={handleAdd} disabled={!canAdd || adding} aria-busy={adding} aria-label={product.variants.length ? `${t('Choose options for')} ${name}` : `${t('Add')} ${name} ${t('to cart')}`}><ShoppingBag size={16} aria-hidden="true" /><span>{t(product.variants.length ? 'Choose options' : 'Add')}</span></button></div>
      </div>
    </article>
  )
}
