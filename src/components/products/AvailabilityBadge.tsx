import type { AvailabilityStatus } from '../../types/product'
import { useI18n } from '../../i18n/LocaleContext'

export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  const { t } = useI18n()
  const label = status === 'available' ? t('In stock') : status === 'out-of-stock' ? t('Out of stock') : status === 'unavailable' ? t('Not available') : t('Availability not confirmed')
  return <span className={`availability-badge availability-badge--${status}`}>{label}</span>
}
