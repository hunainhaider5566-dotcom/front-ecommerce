import type { AvailabilityStatus } from '../../types/product'
import { useI18n } from '../../i18n/LocaleContext'

export function AvailabilityBadge({ status, foodCategory = false }: { status: AvailabilityStatus; foodCategory?: boolean }) {
  const { t } = useI18n()
  const label = foodCategory
    ? status === 'available' ? t('Available') : status === 'unknown' ? t('Availability not confirmed') : t('Currently Unavailable')
    : status === 'available' ? t('In stock') : status === 'out-of-stock' ? t('Out of stock') : status === 'unavailable' ? t('Not available') : t('Availability not confirmed')
  return <span className={`availability-badge availability-badge--${status}`}>{label}</span>
}
