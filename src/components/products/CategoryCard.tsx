import { ArrowUpRight, BookOpen } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/LocaleContext'
import type { Category } from '../../types/category'

export function CategoryCard({ category }: { category: Category }) {
  const [failed, setFailed] = useState(false)
  const { t } = useI18n()
  const name = t(category.name)
  return (
    <Link to={`/categories/${category.slug}`} className="category-card shine-surface">
      <div className="category-card__image">
        {failed || !category.image ? <div className="image-fallback"><BookOpen size={30} aria-hidden="true" /><span>{name}</span></div> : <img src={category.image} alt={`${name} ${t('category collection')}`} loading="lazy" onError={() => setFailed(true)} />}
        <span className="category-card__arrow"><ArrowUpRight size={17} aria-hidden="true" /></span>
      </div>
      <span className="eyebrow">{t(category.eyebrow ?? 'Collection')}</span>
      <h3>{name}</h3>
      <p>{t(category.description)}</p>
    </Link>
  )
}
