import { ArrowRight, CheckCircle2, PackageCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { useI18n } from '../i18n/LocaleContext'

export function ConfirmationPage() {
  const { t } = useI18n()
  usePageMeta(t('Order Confirmed'), t('Your order has been successfully placed on Meridion Marketplace.'))
  const { orderNumber = 'ORD-SUCCESS' } = useParams()

  return (
    <div className="page-shell confirmation-page">
      <div className="confirmation-card shine-surface">
        <span className="confirmation-icon"><CheckCircle2 size={32} /></span>
        <span className="eyebrow">{t('Order Placed Successfully')}</span>
        <h1>{t('Thank You for Your Order!')}</h1>
        <p className="order-number-display"><PackageCheck size={18} /> {t('Order #:')} <strong>{orderNumber}</strong></p>
        <p>{t('Your order has been recorded and transmitted to the seller for fulfillment. Payment method: Cash on Delivery (COD).')}</p>
        <div className="demo-notice demo-notice--compact" role="note">
          <span><strong>{t('Order Status:')}</strong> {t('Pending fulfillment. Updates will be visible in your Account Order History.')}</span>
        </div>
        <div className="confirmation-actions">
          <Link to="/account" className="button button--outline">{t('View My Orders')}</Link>
          <Link to="/shop" className="button button--dark">{t('Continue Shopping')} <ArrowRight size={16} /></Link>
        </div>
      </div>
    </div>
  )
}
