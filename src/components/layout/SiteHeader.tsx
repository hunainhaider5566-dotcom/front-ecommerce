import { Bell, Globe2, Heart, Menu, Search, ShoppingBag, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ANNOUNCEMENT_TEXT } from '../../config/store'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'
import { useWishlist } from '../../contexts/WishlistContext'
import { useI18n } from '../../i18n/LocaleContext'
import { useStoreSettings } from '../../hooks/useStoreSettings'
import { UserAvatar } from '../common/UserAvatar'
import { getOwnSellerProfile } from '../../services/marketplace/vendorService'
import { listMyNotifications, markAllNotificationsRead, markNotificationRead, type NotificationAudience } from '../../services/account/notificationService'
import type { SellerStatus } from '../../types/database'
import type { NotificationRecord } from '../../types/order'

const primaryLinks = [{ to: '/discover', label: 'Discover' }, { to: '/budget', label: 'Budget' }, { to: '/shop', label: 'Shop' }, { to: '/categories', label: 'Collections' }, { to: '/about', label: 'Our story' }]

function NotificationPanel({ notifications, loading, error, onMarkAll, onMarkOne, onClose }: {
  notifications: NotificationRecord[]
  loading: boolean
  error: string | null
  onMarkAll: () => void
  onMarkOne: (id: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const unread = notifications.filter((item) => !item.read_at).length
  return <section className="notification-panel" role="region" aria-label={t('Notifications')}>
    <div className="notification-panel__head">
      <div><span className="eyebrow">{t('Store updates')}</span><h2>{t('Notifications')}</h2></div>
      <div className="notification-panel__actions">
        {unread > 0 && <button type="button" className="text-button" onClick={onMarkAll}>{t('Mark all read')}</button>}
        <button type="button" className="icon-button" aria-label={t('Close notifications')} onClick={onClose}><X size={18} /></button>
      </div>
    </div>
    {loading && <p className="notification-panel__note">{t('Loading notifications…')}</p>}
    {error && <p className="notification-panel__note field-error" role="alert">{error}</p>}
    {!loading && !error && notifications.length === 0 && <div className="notification-panel__empty"><span className="notification-panel__icon"><Bell size={22} aria-hidden="true" /></span><strong>{t('No notifications yet')}</strong><p>{t('Order updates and account messages will appear here.')}</p></div>}
    {!loading && notifications.length > 0 && <ul className="notification-list">
      {notifications.map((item) => <li key={item.id} className={item.read_at ? 'notification-item' : 'notification-item is-unread'}>
        <button type="button" className="notification-item__button" onClick={() => onMarkOne(item.id)}>
          <strong>{item.title}</strong>
          <span>{item.body}</span>
          <small>{new Date(item.created_at).toLocaleString()}</small>
        </button>
      </li>)}
    </ul>}
  </section>
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState<string | null>(null)
  const { itemCount } = useCart()
  const { ids: wishlistIds } = useWishlist()
  const { t, locale, toggleLocale } = useI18n()
  const { user, avatarUrl, displayName } = useAuth()
  const settings = useStoreSettings()
  const [sellerStatus, setSellerStatus] = useState<SellerStatus | null>(null)
  const location = useLocation()
  const notificationAudience: NotificationAudience = location.pathname.startsWith('/admin') ? 'admin' : location.pathname.startsWith('/vendor') ? 'vendor' : 'customer'
  useEffect(() => { setMenuOpen(false); setNotificationsOpen(false) }, [location.pathname])
  useEffect(() => {
    let active = true
    if (!user) { setSellerStatus(null); return () => { active = false } }
    void getOwnSellerProfile().then((profile) => { if (active) setSellerStatus(profile?.status ?? null) }).catch(() => { if (active) setSellerStatus(null) })
    return () => { active = false }
  }, [user?.id])

  const loadNotifications = useCallback(async () => {
    if (!user) { setNotifications([]); return }
    setNotificationsLoading(true)
    setNotificationsError(null)
    try {
      setNotifications(await listMyNotifications(notificationAudience))
    } catch (cause) {
      setNotificationsError(cause instanceof Error ? cause.message : 'Notifications could not be loaded.')
    } finally {
      setNotificationsLoading(false)
    }
  }, [user, notificationAudience])

  useEffect(() => { void loadNotifications() }, [loadNotifications])

  const targetLanguage = locale === 'en' ? 'اردو' : 'English'
  const closeNotifications = () => setNotificationsOpen(false)
  const unreadCount = notifications.filter((item) => !item.read_at).length
  const sellerLink = sellerStatus === 'approved'
    ? { to: '/vendor', label: 'Vendor dashboard' }
    : sellerStatus === 'pending' || sellerStatus === 'rejected'
      ? { to: '/vendor/apply', label: 'Application status' }
      : { to: '/vendor/apply', label: 'Become a Seller' }

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead(notificationAudience)
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })))
    } catch (cause) {
      setNotificationsError(cause instanceof Error ? cause.message : 'Notifications could not be updated.')
    }
  }

  async function handleMarkOne(id: string) {
    if (notifications.find((item) => item.id === id)?.read_at) return
    try {
      await markNotificationRead(id, notificationAudience)
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
    } catch (cause) {
      setNotificationsError(cause instanceof Error ? cause.message : 'The notification could not be updated.')
    }
  }

  const notificationPanel = <NotificationPanel notifications={notifications} loading={notificationsLoading} error={notificationsError} onMarkAll={() => void handleMarkAll()} onMarkOne={(id) => void handleMarkOne(id)} onClose={closeNotifications} />

  return <>
    {ANNOUNCEMENT_TEXT.trim() && <div className="announcement-bar">{ANNOUNCEMENT_TEXT}</div>}
    <header className="site-header">
      <div className="site-header__inner">
        <button className="icon-button menu-toggle" aria-label={t(menuOpen ? 'Close main menu' : 'Open main menu')} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen((open) => !open)} type="button">{menuOpen ? <X /> : <Menu />}</button>
        <Link className="wordmark" to="/" aria-label={`${settings.storeName} · ${t('Home')}`} onClick={() => setMenuOpen(false)}><img className="brand-logo" src="/jtbazar-logo.png" alt="JTBazar home" /></Link>
        <nav className="desktop-nav" aria-label={t('Main navigation')}>{primaryLinks.map((link) => <NavLink key={link.to} to={link.to} className={({ isActive }) => isActive ? 'is-active' : ''}>{t(link.label)}</NavLink>)}<NavLink className="seller-entry" to={sellerLink.to}>{t(sellerLink.label)}</NavLink></nav>
        <div className="header-actions">
          <Link to="/search" aria-label={t('Search')} className="icon-button"><Search size={19} /></Link>
          <Link to="/wishlist" aria-label={`${t('Wishlist')}${wishlistIds.length ? ` · ${wishlistIds.length}` : ''}`} className="icon-button header-wishlist"><Heart size={19} />{wishlistIds.length > 0 && <span className="header-cart__badge">{wishlistIds.length > 99 ? '99+' : wishlistIds.length}</span>}</Link>
          <div className="notification-anchor">
            <button type="button" aria-label={`${t('Open notifications')}${unreadCount ? ` · ${unreadCount}` : ''}`} className="icon-button notification-trigger" aria-expanded={notificationsOpen} aria-controls="desktop-notification-panel" onClick={() => setNotificationsOpen((open) => !open)}><Bell size={19} />{unreadCount > 0 && <span className="header-cart__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>
            <div id="desktop-notification-panel" className="notification-panel-anchor">{notificationsOpen && notificationPanel}</div>
          </div>
          <Link to={user ? '/account' : '/login'} aria-label={user ? `${t('Account')} · ${displayName || ''}` : t('Sign in')} className={`icon-button account-action${avatarUrl ? ' account-action--has-avatar' : ''}`}><UserAvatar avatarUrl={avatarUrl} name={displayName} size={19} className="header-avatar" /></Link>
          <Link to="/cart" aria-label={`${t('Cart')} · ${itemCount}`} className="icon-button header-cart"><ShoppingBag size={19} />{itemCount > 0 && <span className="header-cart__badge">{itemCount > 99 ? '99+' : itemCount}</span>}</Link>
          <button type="button" className="locale-toggle" aria-label={`${t('Change language')}: ${targetLanguage}`} onClick={toggleLocale}><Globe2 size={16} /><span>{targetLanguage}</span></button>
        </div>
      </div>
      {menuOpen && <nav className="mobile-menu" id="mobile-menu" aria-label={t('Mobile navigation')}>
        {user && <Link to="/account" className="mobile-menu__user" onClick={() => setMenuOpen(false)}>
          <div className="mobile-menu__user-avatar-frame"><UserAvatar avatarUrl={avatarUrl} name={displayName} size={28} className="mobile-menu__user-avatar" /></div>
          <div className="mobile-menu__user-info"><strong className="mobile-menu__user-name">{displayName || t('My Account')}</strong><span className="mobile-menu__user-email">{user.email}</span></div>
        </Link>}
        {primaryLinks.map((link) => <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)}>{t(link.label)}</NavLink>)}
        <Link className="mobile-menu__seller" to={sellerLink.to} onClick={() => setMenuOpen(false)}>{t(sellerLink.label)}</Link>
        <Link to="/wishlist" onClick={() => setMenuOpen(false)}>{t('Wishlist')}{wishlistIds.length > 0 ? ` · ${wishlistIds.length}` : ''}</Link>
        <Link to={user ? '/account' : '/login'} onClick={() => setMenuOpen(false)}>{t(user ? 'Account' : 'Sign in')}</Link>
        <button type="button" className="mobile-menu__notification" aria-expanded={notificationsOpen} aria-controls="mobile-notification-panel" onClick={() => setNotificationsOpen((open) => !open)}><Bell size={17} aria-hidden="true" />{t('Notifications')}{unreadCount ? ` · ${unreadCount}` : ''}</button>
        <div id="mobile-notification-panel" className="notification-panel-anchor notification-panel-anchor--mobile">{notificationsOpen && notificationPanel}</div>
        <button type="button" className="mobile-menu__locale" onClick={toggleLocale}><Globe2 size={17} aria-hidden="true" />{targetLanguage}</button>
        <Link to="/faq" onClick={() => setMenuOpen(false)}>{t('FAQ & help')}</Link>
      </nav>}
    </header>
  </>
}
