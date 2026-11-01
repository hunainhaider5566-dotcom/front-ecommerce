import { ArrowUpRight, Facebook, Instagram, MessageCircle, PhoneCall } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SOCIAL_LINKS } from '../../config/store'
import { useCatalog } from '../../contexts/CatalogContext'
import { useI18n } from '../../i18n/LocaleContext'
import { useStoreSettings } from '../../hooks/useStoreSettings'
import { NewsletterSignup } from '../home/NewsletterSignup'

const TikTokIcon = ({ size = 18 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.5v13.67a2.9 2.9 0 0 1-2.9 2.9 2.9 2.9 0 1 1 2.9-2.9c0-.16-.01-.32-.04-.47V11.6a6.4 6.4 0 1 0 3.54 5.73V9.4a8.28 8.28 0 0 0 4.84 1.56V7.5c-.36 0-.72-.04-1.07-.11Z" /></svg>
const socialIcons = { Facebook, Instagram, TikTok: TikTokIcon, WhatsApp: MessageCircle }

export function SiteFooter() {
  const { t } = useI18n()
  const { categories } = useCatalog()
  const settings = useStoreSettings()
  return <footer className="site-footer">
    <div className="footer-newsletter"><NewsletterSignup /></div>
    <div className="footer-main">
      <div className="footer-brand"><Link className="wordmark wordmark--footer" to="/" aria-label={`${settings.storeName} home`}><img className="brand-logo" src="/jtbazar-logo.png" alt="JTBazar" /></Link><p>{t('A multi-category store for thoughtful goods across everyday routines.')}</p><span className="footer-note-badge">{t(settings.codEnabled ? 'Live catalog · Cash on delivery' : 'Live catalog')}</span></div>
      <div className="footer-column"><h2>{t('Explore')}</h2><Link to="/shop">{t('Shop all')}</Link><Link to="/categories">{t('Collections')}</Link>{categories.slice(0, 3).map((category) => <Link key={category.id} to={`/categories/${category.slug}`}>{t(category.name)}</Link>)}</div>
      <div className="footer-column"><h2>{t('Helpful details')}</h2><Link to="/about">{t('Our story')}</Link><Link to="/contact">{t('Contact')}</Link><Link to="/faq">{t('FAQ')}</Link><Link to="/shipping">{t('Shipping')}</Link><Link to="/returns">{t('Returns')}</Link><Link to="/privacy">{t('Privacy')}</Link></div>
      <div className="footer-note"><span className="eyebrow">{t('Need a hand?')}</span><p>{t('Questions about an order, delivery or a seller can be sent to our support team.')}</p>{settings.supportEmail ? <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail} <ArrowUpRight size={14} /></a> : <Link to="/contact">{t('Contact support')} <ArrowUpRight size={14} /></Link>}<a className="footer-phone" href="tel:+923700822507"><PhoneCall size={14} aria-hidden="true" /> +92 370 0822507</a></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} {settings.storeName}</span><div className="footer-socials" aria-label={t('Social links')}>{SOCIAL_LINKS.map((item) => { const Icon = socialIcons[item.label]; return item.href.startsWith('https://') ? <a href={item.href} key={item.label} target="_blank" rel="noopener noreferrer" aria-label={t(item.label)}><Icon size={18} aria-hidden="true" /><span className="sr-only">{t(item.label)}</span></a> : <span key={item.label} aria-label={t(item.label)} title={t(item.label)}><Icon size={18} aria-hidden="true" /><span className="sr-only">{t(item.label)}</span></span> })}</div><span>{t('Thoughtfully considered, never assumed.')}</span></div>
  </footer>
}
