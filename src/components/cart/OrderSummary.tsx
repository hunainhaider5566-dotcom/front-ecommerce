import { useI18n } from '../../i18n/LocaleContext'
import { formatPKR } from '../../utils/money'

export function OrderSummary({ subtotal, deliveryFee, total, label = 'Order summary' }: { subtotal: number; deliveryFee: number; total?: number; label?: string }) {
  const { t } = useI18n()
  const finalTotal = total ?? subtotal + deliveryFee
  return <section className="order-summary" aria-label={t(label)}>
    <h2>{t(label)}</h2>
    <div className="order-summary__row"><span>{t('Item subtotal')}</span><strong>{formatPKR(subtotal)}</strong></div>
    <div className="order-summary__row"><span>{t('Delivery fee')}</span><strong>{formatPKR(deliveryFee)}</strong></div>
    <div className="order-summary__total"><span>{t('Total')}</span><strong>{formatPKR(finalTotal)}</strong></div>
    <p>{t('The final total is validated securely when you place your order.')}</p>
  </section>
}
