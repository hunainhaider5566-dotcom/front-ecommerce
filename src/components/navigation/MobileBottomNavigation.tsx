import { Grid2X2, House, Search, ShoppingCart, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCart } from '../../contexts/CartContext'
import { useI18n } from '../../i18n/LocaleContext'

const items = [
  { to: '/', label: 'Home', Icon: House, match: (path: string) => path === '/' },
  { to: '/shop', label: 'Shop', Icon: Search, match: (path: string) => path === '/shop' || path.startsWith('/search') },
  { to: '/categories', label: 'Categories', Icon: Grid2X2, match: (path: string) => path.startsWith('/categories') },
  { to: '/cart', label: 'Cart', Icon: ShoppingCart, match: (path: string) => path === '/cart' || path === '/checkout' },
  { to: '/discover', label: 'Discover', Icon: Sparkles, match: (path: string) => path === '/discover' },
]

export function MobileBottomNavigation() {
  const location = useLocation()
  const { itemCount } = useCart()
  const { t } = useI18n()
  return <nav className="mobile-bottom-nav" aria-label={t('Mobile primary navigation')}>
    {items.map(({ to, label, Icon, match }) => <Link key={to} to={to} className={`mobile-nav-item${match(location.pathname) ? ' is-active' : ''}`} aria-current={match(location.pathname) ? 'page' : undefined} aria-label={t(label)}>
      <span className="mobile-nav-item__icon"><Icon size={19} />{label === 'Cart' && itemCount > 0 && <span className="mobile-nav-badge">{itemCount > 99 ? '99+' : itemCount}</span>}</span><span>{t(label)}</span>
    </Link>)}
  </nav>
}
