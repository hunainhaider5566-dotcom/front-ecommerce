import { useEffect, useState } from 'react'
import { Star, Send } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useI18n } from '../../i18n/LocaleContext'
import { getProductReviews, getReviewableOrderId, getSellerReviews, submitProductReview, submitSellerReview, type ProductReview, type SellerReview } from '../../services/products/reviewService'

type Props = { kind: 'product' | 'seller'; targetId: string }

export function ReviewComposer({ kind, targetId }: Props) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { push } = useToast()
  const [reviews, setReviews] = useState<Array<ProductReview | SellerReview>>([])
  const [orderId, setOrderId] = useState<string | null>(null)
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ownShop, setOwnShop] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const rows = kind === 'product' ? await getProductReviews(targetId) : await getSellerReviews(targetId)
      setReviews(rows)
      if (user) {
        const eligible = await getReviewableOrderId(user.id, kind === 'product' ? targetId : undefined, kind === 'seller' ? targetId : undefined)
        setOrderId(eligible)
      } else {
        setOrderId(null)
      }
      if (user && kind === 'seller') {
        const { getSupabase } = await import('../../lib/supabase')
        const { data } = await getSupabase().from('seller_profiles').select('user_id').eq('id', targetId).maybeSingle()
        setOwnShop(data?.user_id === user.id)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [targetId, kind, user?.id])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!orderId || saving) return
    setSaving(true)
    try {
      if (kind === 'product') {
        await submitProductReview({ productId: targetId, orderId, rating, title, comment })
      } else {
        await submitSellerReview({ sellerId: targetId, orderId, rating, comment })
      }
      push(t('Thanks for sharing your review.'), 'success')
      setTitle('')
      setComment('')
      await refresh()
    } catch (cause) {
      push(cause instanceof Error ? cause.message : t('Your review could not be submitted.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const average = reviews.length ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1) : '—'

  return <section className="review-composer" aria-label={t(kind === 'product' ? 'Product reviews' : 'Seller reviews')}>
    <div className="review-composer__heading">
      <div><span className="eyebrow">{t('Community feedback')}</span><h3>{t(kind === 'product' ? 'Customer reviews' : 'Shop reviews')}</h3></div>
      <div className="review-composer__summary"><Star size={17} fill="currentColor" /><strong>{average}</strong><span>{reviews.length} {t('reviews')}</span></div>
    </div>
    {user && !ownShop && orderId && <form className="review-form" onSubmit={submit}>
      <label>{t('Your rating')}<div className="review-form__stars" role="group" aria-label={t('Choose a rating')}>{[1,2,3,4,5].map(value => <button key={value} type="button" className={value <= rating ? 'is-selected' : ''} onClick={() => setRating(value)} aria-label={`${value} ${t('stars')}`} aria-pressed={rating === value}><Star size={22} fill={value <= rating ? 'currentColor' : 'none'} /></button>)}</div></label>
      {kind === 'product' && <label>{t('Review title')}<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder={t('What stood out?')} /></label>}
      <label>{t('Your review')}<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} rows={3} placeholder={t('Share your experience')} /></label>
      <button className="button button--dark" type="submit" disabled={saving || loading}><Send size={15} /> {t(saving ? 'Submitting…' : 'Submit review')}</button>
    </form>}
    {!user && <p className="review-composer__hint">{t('Sign in and place a delivered order to leave a review.')}</p>}
    {user && !ownShop && !orderId && <p className="review-composer__hint">{t('Reviews are available after a delivered order containing this product or from this shop.')}</p>}
    {ownShop && <p className="review-composer__hint">{t('You cannot review your own seller account.')}</p>}
    {loading && <p className="review-composer__hint">{t('Loading reviews…')}</p>}
    {reviews.length > 0 ? <div className="review-composer__list">{reviews.map(review => <article className="review-composer__item" key={review.id}><div className="review-composer__stars">{[1,2,3,4,5].map(value => <Star key={value} size={13} fill={value <= review.rating ? 'currentColor' : 'none'} />)}<strong>{review.rating}/5</strong></div>{'title' in review && review.title && <strong>{review.title}</strong>}{review.comment && <p>{review.comment}</p>}<time dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString()}</time></article>)}</div> : !loading && <p className="review-composer__hint">{t('No reviews yet. Be the first verified customer to share feedback.')}</p>}
  </section>
}
