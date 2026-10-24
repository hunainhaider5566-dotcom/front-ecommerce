import { Heart } from 'lucide-react'
import { useI18n } from '../../i18n/LocaleContext'
import { useToast } from '../../contexts/ToastContext'
import { useWishlist } from '../../contexts/WishlistContext'

export function WishlistButton({ productId, productName }: { productId: string; productName: string }) {
  const { has, toggle } = useWishlist()
  const { t } = useI18n()
  const { push } = useToast()
  const saved = has(productId)
  function handleToggle() {
    toggle(productId)
    push(t(saved ? 'Removed from wishlist.' : 'Added to wishlist.'))
  }
  return (
    <button className={`icon-button wishlist-button${saved ? ' is-saved' : ''}`} type="button" onClick={handleToggle} aria-pressed={saved} aria-label={`${saved ? t('Remove') : t('Add')} ${productName} ${saved ? t('from') : t('to')} ${t('wishlist')}`}>
      <Heart size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  )
}
