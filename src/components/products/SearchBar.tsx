import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n/LocaleContext'

export function SearchBar({ initialValue = '', compact = false }: { initialValue?: string; compact?: boolean }) {
  const [value, setValue] = useState(initialValue)
  const navigate = useNavigate()
  const { t } = useI18n()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = value.trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }
  return (
    <form className={`search-field${compact ? ' search-field--compact' : ''}`} role="search" onSubmit={submit}>
      <Search size={17} aria-hidden="true" />
      <label className="sr-only" htmlFor={compact ? 'header-search' : 'catalog-search'}>{t('Search items')}</label>
      <input id={compact ? 'header-search' : 'catalog-search'} type="search" placeholder={t('Search products, categories…')} value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="submit" className="search-submit">{t('Search')}</button>
    </form>
  )
}
