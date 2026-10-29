import { ArrowRight, ShoppingBag, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { CartItem } from '../components/cart/CartItem'
import { OrderSummary } from '../components/cart/OrderSummary'
import { useCart } from '../contexts/CartContext'
import { useCatalog } from '../contexts/CatalogContext'
import { useToast } from '../contexts/ToastContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { useStoreSettings } from '../hooks/useStoreSettings'
import { useI18n } from '../i18n/LocaleContext'
import { getCartLineUnitPrice, isCartLineAvailable } from '../utils/cart'

export function CartPage() {
  const { t } = useI18n()
  const { push } = useToast()
  const { lines, setQuantity, remove, clear, loading: cartLoading } = useCart()
  const { status, error, findProductById, refresh } = useCatalog()
  const settings = useStoreSettings()
  usePageMeta(t('Your cart'), t('Review the items in your cart before continuing to secure checkout.'))
  const subtotal = lines.reduce((sum, line) => sum + getCartLineUnitPrice(findProductById(line.productId), line) * line.quantity, 0)
  const canCheckout = status === 'ready' && lines.length > 0 && lines.every((line) => isCartLineAvailable(findProductById(line.productId), line))

  function handleClear() {
    clear()
    push(t('Your cart is clear.'))
  }

  if (cartLoading) return <div className="page-shell cart-page"><LoadingState label={t('Loading your saved cart…')} /></div>

  if (lines.length === 0) {
    return <div className="page-shell cart-page">
      <div className="page-heading"><span className="eyebrow">{t('Your collection')}</span><h1>{t('Your')} <em>{t('cart.')}</em></h1></div>
      <EmptyState title={t('Your cart is empty')} description={t('Explore the catalog and add something you would like to order.')} actionLabel={t('Browse the catalog')} actionHref="/shop" />
    </div>
  }

  return <div className="page-shell cart-page">
    <div className="page-heading page-heading--cart">
      <div><span className="eyebrow">{t('Your collection')}</span><h1>{t('Your')} <em>{t('cart.')}</em></h1><p>{t('Prices and availability are checked again securely when you place your order.')}</p></div>
      <span className="cart-count-note"><ShoppingBag size={16} /> {lines.reduce((sum, line) => sum + line.quantity, 0)} {t('items')}</span>
    </div>
    {status === 'loading' && <LoadingState label={t('Checking current catalog items…')} />}
    {status === 'error' && <><ErrorState message={error || t('The catalog could not be loaded.')} /><button type="button" className="button button--outline" onClick={refresh}>{t('Try again')}</button></>}
    <div className="cart-layout">
      <section className="cart-lines" aria-label={t('Items in your cart')}>
        {lines.map((line) => <CartItem key={`${line.productId}-${line.variantId ?? 'default'}`} line={line} onQuantity={(quantity) => setQuantity(line.productId, line.variantId, quantity)} onRemove={() => remove(line.productId, line.variantId)} />)}
        <button type="button" className="text-button cart-clear" onClick={handleClear}><Trash2 size={15} /> {t('Clear cart')}</button>
      </section>
      <aside className="cart-sidebar">
        <OrderSummary subtotal={subtotal} deliveryFee={settings.deliveryFee} label={t('Order summary')} />
        <div className="cart-checkout-note">
          {canCheckout
            ? <Link to="/checkout" className="button button--dark button--full">{t('Continue to checkout')} <ArrowRight size={16} /></Link>
            : <button type="button" className="button button--dark button--full" disabled>{status === 'loading' ? t('Checking availability…') : t('Remove unavailable items to continue')}</button>}
          <p>{t('Your saved cart is linked to your account. Guest carts are temporary until you sign in.')}</p>
        </div>
      </aside>
    </div>
  </div>
}
