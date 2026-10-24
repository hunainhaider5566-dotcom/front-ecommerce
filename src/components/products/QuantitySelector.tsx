import { Minus, Plus } from 'lucide-react'
import { useI18n } from '../../i18n/LocaleContext'

export function QuantitySelector({ value, onChange, label = 'Quantity', max = 99 }: { value: number; onChange: (value: number) => void; label?: string; max?: number }) {
  const { t } = useI18n()
  return (
    <div className="quantity-selector" role="group" aria-label={t(label)}>
      <button type="button" className="quantity-button" aria-label={t('Decrease quantity')} disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}><Minus size={14} aria-hidden="true" /></button>
      <output aria-live="polite" aria-label={`${value} ${t('items')}`}>{value}</output>
      <button type="button" className="quantity-button" aria-label={t('Increase quantity')} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={14} aria-hidden="true" /></button>
    </div>
  )
}
