import { ArrowRight, BookOpen, CircleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/LocaleContext'

export function EmptyState({ title, description, actionLabel = 'Explore the collection', actionHref = '/shop' }: { title: string; description: string; actionLabel?: string; actionHref?: string }) {
  const { t } = useI18n()
  return (
    <section className="empty-state">
      <span className="empty-state__icon"><BookOpen size={22} aria-hidden="true" /></span>
      <h2>{t(title)}</h2><p>{t(description)}</p>
      <Link className="button button--outline" to={actionHref}>{t(actionLabel)}<ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
  )
}

export function LoadingState({ label = 'Loading the collection…' }: { label?: string }) {
  const { t } = useI18n()
  return <div className="state-message" role="status"><span className="loading-dot" />{t(label)}</div>
}

export function ErrorState({ message }: { message: string }) {
  const { t } = useI18n()
  return <div className="error-state" role="alert"><CircleAlert size={20} /><p>{t(message)}</p></div>
}
