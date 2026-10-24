import { ArrowRight, BookOpen, CircleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/LocaleContext'

export function EmptyState({ title, description, actionLabel = 'Explore the collection', actionHref, onAction }: { title: string; description: string; actionLabel?: string; actionHref?: string; onAction?: () => void }) {
  const { t } = useI18n()
  return (
    <section className="empty-state">
      <span className="empty-state__icon"><BookOpen size={22} aria-hidden="true" /></span>
      <h2>{t(title)}</h2><p>{t(description)}</p>
      {onAction
        ? <button type="button" className="button button--outline" onClick={onAction}>{t(actionLabel)}<ArrowRight size={16} aria-hidden="true" /></button>
        : actionHref
          ? <Link className="button button--outline" to={actionHref}>{t(actionLabel)}<ArrowRight size={16} aria-hidden="true" /></Link>
          : null}
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
