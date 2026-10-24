import { ArrowLeft, ArrowRight, CheckCircle2, MapPin, PackageCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { useI18n } from '../i18n/LocaleContext'
import { getMyOrderByNumber } from '../services/orders/orderService'
import type { OrderRecord } from '../types/order'
import { formatPKR } from '../utils/money'

function addressLines(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const address = value as Record<string, unknown>
  const line1 = typeof address.address_line_1 === 'string' ? address.address_line_1 : ''
  const line2 = typeof address.address_line_2 === 'string' ? address.address_line_2 : ''
  const city = typeof address.city === 'string' ? address.city : ''
  return [line1, line2, city].filter(Boolean)
}

export function ConfirmationPage() {
  const { t } = useI18n()
  const { orderNumber = '' } = useParams()
  const { user, loading: authLoading } = useAuth()
  const [order, setOrder] = useState<OrderRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  usePageMeta(t('Order confirmation'), t('Review the details of your placed order.'))

  useEffect(() => {
    let cancelled = false
    if (authLoading) return
    if (!user) { setLoading(false); return }
    setLoading(true)
    setError(null)
    getMyOrderByNumber(orderNumber)
      .then((record) => { if (!cancelled) setOrder(record) })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'The order could not be loaded.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authLoading, orderNumber, user])

  if (authLoading || loading) return <div className="page-shell"><LoadingState label={t('Loading your order…')} /></div>

  if (!user) {
    return <div className="page-shell confirmation-page"><div className="confirmation-card">
      <span className="confirmation-icon"><PackageCheck size={28} /></span>
      <span className="eyebrow">{t('Order confirmation')}</span>
      <h1>{t('Sign in to view')} <em>{t('this order.')}</em></h1>
      <p>{t('Orders are only visible to the account that placed them.')}</p>
      <div className="confirmation-actions">
        <Link to={`/login?redirect=${encodeURIComponent(`/order-confirmation/${orderNumber}`)}`} className="button button--dark">{t('Sign in')} <ArrowRight size={16} /></Link>
        <Link to="/shop" className="button button--outline">{t('Return to the shop')}</Link>
      </div>
    </div></div>
  }

  if (error) return <div className="page-shell"><ErrorState message={error} /><Link to="/account" className="back-link"><ArrowLeft size={15} /> {t('Back to your account')}</Link></div>

  if (!order) {
    return <div className="page-shell confirmation-page"><EmptyState title={t('Order not found')} description={t('This order does not exist on your account, or the link is incorrect.')} actionLabel={t('View your orders')} actionHref="/account" /></div>
  }

  const address = addressLines(order.shipping_address_snapshot)

  return <div className="page-shell confirmation-page">
    <div className="confirmation-card confirmation-card--wide">
      <span className="confirmation-icon"><CheckCircle2 size={28} /></span>
      <span className="eyebrow">{t('Order placed successfully')}</span>
      <h1>{t('Thank you for your')} <em>{t('order.')}</em></h1>
      <p>{t('We received your cash-on-delivery order. Keep your order number for reference.')}</p>
      <div className="confirmation-meta">
        <div><span>{t('Order number')}</span><strong>{order.order_number}</strong></div>
        <div><span>{t('Status')}</span><strong>{t(order.order_status)}</strong></div>
        <div><span>{t('Payment')}</span><strong>{order.payment_method === 'cod' ? t('Cash on delivery') : t(order.payment_method)}</strong></div>
        <div><span>{t('Placed')}</span><strong>{new Date(order.created_at).toLocaleString()}</strong></div>
      </div>

      <section className="confirmation-section" aria-labelledby="confirmation-items">
        <h2 id="confirmation-items">{t('Items')}</h2>
        <ul className="confirmation-items">
          {(order.items ?? []).map((item) => <li key={item.id}>
            <span>{item.product_name_snapshot} <small>× {item.quantity}</small></span>
            <strong>{formatPKR(Number(item.line_total))}</strong>
          </li>)}
        </ul>
      </section>

      <section className="confirmation-section" aria-labelledby="confirmation-delivery">
        <h2 id="confirmation-delivery">{t('Delivery details')}</h2>
        <p className="confirmation-address"><MapPin size={15} /> {address.join(', ') || t('Address on file')}</p>
        <p>{t('Phone')}: {order.customer_phone}</p>
        {order.delivery_location_name && <p>{t('Location pin')}: {order.delivery_location_name} ({order.delivery_lat}, {order.delivery_lng})</p>}
      </section>

      <div className="confirmation-totals">
        <div><span>{t('Item subtotal')}</span><strong>{formatPKR(Number(order.subtotal))}</strong></div>
        <div><span>{t('Delivery fee')}</span><strong>{formatPKR(Number(order.delivery_fee))}</strong></div>
        {Number(order.discount_amount) > 0 && <div><span>{t('Discount')}</span><strong>−{formatPKR(Number(order.discount_amount))}</strong></div>}
        <div className="confirmation-total"><span>{t('Total')}</span><strong>{formatPKR(Number(order.total))}</strong></div>
      </div>

      <div className="confirmation-actions">
        <Link to="/account" className="button button--dark">{t('View your orders')} <ArrowRight size={16} /></Link>
        <Link to="/shop" className="button button--outline">{t('Continue shopping')}</Link>
      </div>
    </div>
  </div>
}
