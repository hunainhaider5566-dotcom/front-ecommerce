import { ArrowRight, Mail } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/LocaleContext'
import { subscribeToNewsletter } from '../../services/store/newsletterService'

export function NewsletterSignup() {
  const { t } = useI18n()
  const id = `meridion-newsletter-${useId().replace(/:/g, '')}`
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('submitting')
    setMessage('')
    try {
      await subscribeToNewsletter(email)
      setStatus('success')
      setMessage(t('You are subscribed. Look out for the next note from JTBazar.'))
      setEmail('')
    } catch (cause) {
      setStatus('error')
      setMessage(cause instanceof Error ? cause.message : t('The subscription could not be saved. Please try again.'))
    }
  }

  return (
    <section className="home-newsletter newsletter__section" aria-labelledby={`${id}-title`}>
      <div className="newsletter__icon" aria-hidden="true"><Mail size={20} /></div>
      <div className="newsletter__copy">
        <span className="newsletter__eyebrow">{t('A quiet note for future launches')}</span>
        <h2 id={`${id}-title`}>{t('Stay close to the next page.')}</h2>
        <p>{t('A quiet note for future launches, product edits and useful desk ideas.')}</p>
      </div>
      <form className="newsletter__form" onSubmit={handleSubmit}>
        <label className="newsletter__label" htmlFor={`${id}-email`}>{t('Email address')}</label>
        <div className="newsletter__field-row">
          <input
            id={`${id}-email`}
            className="newsletter__input"
            type="email"
            name="email"
            value={email}
            onChange={(event) => { setEmail(event.target.value); if (status !== 'submitting') setStatus('idle') }}
            placeholder={t('Your email address')}
            autoComplete="email"
            required
            disabled={status === 'submitting'}
          />
          <button className="newsletter__submit" type="submit" disabled={status === 'submitting'}><span>{t(status === 'submitting' ? 'Saving…' : 'Join the note')}</span><ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        <p className="newsletter__fine-print">{t('We only use your address for store updates. You can ask us to remove it at any time.')}</p>
        {message && <p className={`newsletter__feedback${status === 'error' ? ' newsletter__feedback--error' : ''}`} role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</p>}
      </form>
    </section>
  )
}
