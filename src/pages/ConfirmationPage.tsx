import { ArrowRight, CheckCircle2, Clock3, PackageCheck, PhoneCall, ShieldCheck, Truck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { useI18n } from '../i18n/LocaleContext'

export function ConfirmationPage() {
  const { t } = useI18n()
  usePageMeta(t('Order Confirmed'), t('Your order has been successfully placed on JTBazar.'))
  const { orderNumber = 'ORD-SUCCESS' } = useParams()

  return (
    <main className="page-shell confirmation-page">
      <section className="confirmation-card confirmation-card--premium">
        <div className="confirmation-card__topline"><span>JTBazar</span><span><ShieldCheck size={14} /> Safe & secure checkout</span></div>
        <div className="confirmation-success-mark"><CheckCircle2 size={34} strokeWidth={1.8} /></div>
        <span className="confirmation-eyebrow">{t('ORDER PLACED SUCCESSFULLY')}</span>
        <h1>{t('Thank you for shopping with us!')}</h1>
        <p className="confirmation-lead">{t('Your order is now in our hands. Our team will contact you to confirm the details before delivery.')}</p>
        <div className="confirmation-order-ref">
          <span>{t('YOUR ORDER NUMBER')}</span>
          <strong>{orderNumber}</strong>
          <small><PackageCheck size={14} /> {t('Keep this number for your records')}</small>
        </div>
        <div className="confirmation-status"><span className="confirmation-status__dot" /><div><strong>{t('Order received')}</strong><span>{t('We have successfully received your order.')}</span></div><b>{t('PENDING')}</b></div>
        <div className="confirmation-next">
          <h2>{t('What happens next?')}</h2>
          <div className="confirmation-steps">
            <div><span><PhoneCall size={18} /></span><section><strong>{t('We confirm your order')}</strong><p>{t('Our team will call you to verify your phone number and delivery address.')}</p></section></div>
            <div><span><PackageCheck size={18} /></span><section><strong>{t('We prepare your items')}</strong><p>{t('Our team coordinates with the shop to arrange your products.')}</p></section></div>
            <div><span><Truck size={18} /></span><section><strong>{t('Your order is delivered')}</strong><p>{t('We deliver to your address. Pay cash when your order arrives.')}</p></section></div>
          </div>
        </div>
        <div className="confirmation-payment"><span><Clock3 size={17} /> {t('Payment on delivery')}</span><strong>{t('Cash on Delivery (COD)')}</strong></div>
        <div className="confirmation-actions">
          <Link to="/account" className="button button--outline">{t('Track My Order')}</Link>
          <Link to="/shop" className="button button--dark">{t('Continue Shopping')} <ArrowRight size={16} /></Link>
        </div>
        <p className="confirmation-help">{t('Need help?')} <Link to="/contact">{t('Contact our support team')}</Link></p>
      </section>
    </main>
  )
}
