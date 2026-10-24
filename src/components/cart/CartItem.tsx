import { BookOpen, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/LocaleContext'
import { useToast } from '../../contexts/ToastContext'
import type { CartLine } from '../../types/cart'
import { useCatalog } from '../../contexts/CatalogContext'
import { formatPKR } from '../../utils/money'
import { QuantitySelector } from '../products/QuantitySelector'
import { isCartLineAvailable } from '../../utils/cart'

export function CartItem({ line, onQuantity, onRemove, compact = false }: { line: CartLine; onQuantity: (quantity: number) => void; onRemove: () => void; compact?: boolean }) {
  const { findProductById } = useCatalog()
  const product = findProductById(line.productId)
  const variant = product?.variants.find((item) => item.id === line.variantId)
  const unitPrice = variant?.price ?? product?.price ?? 0
  const [imageFailed, setImageFailed] = useState(false)
  const { t } = useI18n()
  const { push } = useToast()
  const available = isCartLineAvailable(product, line)

  function handleRemove() {
    onRemove()
    push(t('Removed from your cart.'))
  }

  if (!product) {
    return <article className="cart-item cart-item--unavailable">
      <div className="cart-item__image cart-item__image--fallback"><BookOpen size={24} aria-hidden="true" /></div>
      <div className="cart-item__body">
        <strong>{t('This item is no longer in the published catalog')}</strong>
        <p className="cart-item__note">{t('Remove it to continue with the rest of your cart.')}</p>
        <button type="button" className="text-button" onClick={handleRemove}><Trash2 size={14} /> {t('Remove')}</button>
      </div>
    </article>
  }

  const name = t(product.name)
  return <article className={`cart-item${compact ? ' cart-item--compact' : ''}`}>
    <Link to={`/products/${product.slug}`} className="cart-item__image">
      {imageFailed || !product.images[0]
        ? <span className="cart-item__fallback"><BookOpen size={24} aria-hidden="true" /></span>
        : <img src={product.images[0]} alt="" onError={() => setImageFailed(true)} />}
    </Link>
    <div className="cart-item__body">
      <div className="cart-item__topline">
        <div>
          <Link to={`/products/${product.slug}`} className="cart-item__name">{name}</Link>
          {variant && <p className="cart-item__variant">{t(variant.label)}: {t(variant.value)}</p>}
          {!available && <p className="cart-item__note cart-item__note--warning">{t('Unavailable at this time')}</p>}
        </div>
        <strong className="cart-item__price">{formatPKR(unitPrice * line.quantity)}</strong>
      </div>
      <div className="cart-item__controls">
        <QuantitySelector value={line.quantity} onChange={onQuantity} label={`${t('Quantity for')} ${name}`} />
        <button type="button" className="text-button" onClick={handleRemove}><Trash2 size={14} /> {t('Remove')}</button>
      </div>
    </div>
  </article>
}
