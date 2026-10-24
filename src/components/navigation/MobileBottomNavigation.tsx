import { Grid2X2, House, MessageCircle, Search, ShoppingCart } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCart } from '../../contexts/CartContext'
import { useI18n } from '../../i18n/LocaleContext'
import { useStoreSettings } from '../../hooks/useStoreSettings'
import { supportDestination } from '../../utils/support'

const items = [
  { to: '/', label: 'Home', Icon: House, match: (path: string) => path === '/' },
  { to: '/shop', label: 'Shop', Icon: Search, match: (path: string) => path === '/shop' || path.startsWith('/search') },
  { to: '/categories', label: 'Categories', Icon: Grid2X2, match: (path: string) => path.startsWith('/categories') },
  { to: '/cart', label: 'Cart', Icon: ShoppingCart, match: (path: string) => path === '/cart' || path === '/checkout' },
]

export function MobileBottomNavigation() {
  const location = useLocation()
  const { itemCount } = useCart()
  const { t } = useI18n()
  const settings = useStoreSettings()
  const support = supportDestination(undefined, settings.supportWhatsapp)
  const supportActive = location.pathname === '/contact'
  return <nav className="mobile-bottom-nav" aria-label={t('Mobile primary navigation')}>
    {items.map(({ to, label, Icon, match }) => <Link key={to} to={to} className={`mobile-nav-item${match(location.pathname) ? ' is-active' : ''}`} aria-current={match(location.pathname) ? 'page' : undefined} aria-label={t(label)}>
      <span className="mobile-nav-item__icon"><Icon size={19} />{label === 'Cart' && itemCount > 0 && <span className="mobile-nav-badge">{itemCount > 99 ? '99+' : itemCount}</span>}</span><span>{t(label)}</span>
    </Link>)}
    {support.startsWith('https://') ? <a className={`mobile-nav-item${supportActive ? ' is-active' : ''}`} href={support} target="_blank" rel="noopener noreferrer" aria-label={t('Open WhatsApp support in a new tab')}><span className="mobile-nav-item__icon"><MessageCircle size={19} /></span><span>{t('Support')}</span></a> : <Link to={support} className={`mobile-nav-item${supportActive ? ' is-active' : ''}`} aria-current={supportActive ? 'page' : undefined} aria-label={t('Support')}><span className="mobile-nav-item__icon"><MessageCircle size={19} /></span><span>{t('Support')}</span></Link>}
  </nav>
}
