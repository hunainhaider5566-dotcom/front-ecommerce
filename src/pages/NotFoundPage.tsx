import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/LocaleContext'
import { usePageMeta } from '../hooks/usePageMeta'

export function NotFoundPage() {
  const { t } = useI18n()
  usePageMeta(t('Page not found'), t('This JTBazar page could not be found. Explore our active product collection instead.'), { noIndex: true })
  return <div className="page-shell not-found"><span className="not-found__icon"><Compass size={28} /></span><span className="eyebrow">404 · {t('Page not found')}</span><h1>{t('This page took')} <em>{t('a wrong turn.')}</em></h1><p>{t('We couldn’t find the page you were looking for. Explore our catalog or return to the homepage.')}</p><Link to="/shop" className="button button--dark"><ArrowLeft size={15} aria-hidden="true" /> {t('Back to the marketplace')}</Link></div>
}
