import { ArrowUpRight, BookOpen, Clock3 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/LocaleContext'
import type { Category } from '../../types/category'

export function CategoryCard({ category }: { category: Category }) {
  const [failed, setFailed] = useState(false)
  const { t } = useI18n()
  const name = t(category.name)
  const card = (
    <>
      
      <div className="category-card__image">
        {failed || !category.image ? <div className="category-card__fallback"><BookOpen size={30} aria-hidden="true" /></div> : <img src={category.image} alt={`${name} ${t('category collection')}`} loading="lazy" onError={() => setFailed(true)} />}
        <span className="category-card__shade" />
        <span className="category-card__caption"><strong>{name}</strong><small>{category.isComingSoon ? t('Coming soon') : t('Explore products')}</small></span>
        <span className="category-card__arrow">{category.isComingSoon ? <Clock3 size={17} aria-hidden="true" /> : <ArrowUpRight size={17} aria-hidden="true" />}</span>
      </div>
    </>
  )
  return category.isComingSoon
    ? <div className="category-card shine-surface is-coming-soon" aria-disabled="true" title={t('Coming soon')}>{card}</div>
    : <Link to={`/categories/${category.slug}`} className="category-card shine-surface">{card}</Link>
}
