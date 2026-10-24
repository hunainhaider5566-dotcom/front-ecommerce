import { SlidersHorizontal } from 'lucide-react'
import type { Category } from '../../types/category'
import { useI18n } from '../../i18n/LocaleContext'

export type PriceSort = 'featured' | 'price-low' | 'price-high'

export function FilterControls({ category, onCategory, sort, onSort, count, categories = [] }: { category: string; onCategory: (id: string) => void; sort: PriceSort; onSort: (sort: PriceSort) => void; count: number; categories?: Category[] }) {
  const { t } = useI18n()
  return (
    <div className="catalog-filters">
      <div className="category-chips" aria-label={t('Filter by category')}>
        <button type="button" className={`category-chip${category === 'all' ? ' is-active' : ''}`} aria-pressed={category === 'all'} onClick={() => onCategory('all')}>{t('All')}</button>
        {categories.map((item) => <button key={item.id} type="button" className={`category-chip${category === item.id ? ' is-active' : ''}`} aria-pressed={category === item.id} onClick={() => onCategory(item.id)}>{t(item.name)}</button>)}
      </div>
      <div className="filter-meta"><span><SlidersHorizontal size={15} aria-hidden="true" /> {count} {t('products shown')}</span><label htmlFor="price-sort" className="sr-only">{t('Sort products by price')}</label><select id="price-sort" value={sort} onChange={(event) => onSort(event.target.value as PriceSort)}><option value="featured">{t('Featured')}</option><option value="price-low">{t('Price: low to high')}</option><option value="price-high">{t('Price: high to low')}</option></select></div>
    </div>
  )
}
