import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { COMMON_URDU } from './translations/common'
import { HOME_URDU } from './translations/home'
import { STORE_URDU } from './translations/store'
import { AUTH_URDU } from './translations/auth'
import { INFO_URDU } from './translations/info'

export type Locale = 'en' | 'ur'
interface LocaleValue {
  locale: Locale
  direction: 'ltr' | 'rtl'
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  t: (english: string) => string
}

const LOCALE_KEY = 'meridion-locale-v1'
const URDU = { ...COMMON_URDU, ...HOME_URDU, ...STORE_URDU, ...AUTH_URDU, ...INFO_URDU }
const LocaleContext = createContext<LocaleValue | null>(null)

function readLocale(): Locale {
  try { return localStorage.getItem(LOCALE_KEY) === 'ur' ? 'ur' : 'en' } catch { return 'en' }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(readLocale)
  const direction = locale === 'ur' ? 'rtl' : 'ltr'
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = direction
    try { localStorage.setItem(LOCALE_KEY, locale) } catch { /* Locale preference is optional. */ }
  }, [locale, direction])
  const value = useMemo<LocaleValue>(() => ({
    locale,
    direction,
    setLocale,
    toggleLocale: () => setLocale((current) => current === 'en' ? 'ur' : 'en'),
    t: (english) => locale === 'ur' ? URDU[english] ?? english : english,
  }), [locale, direction])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useI18n(): LocaleValue {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useI18n must be used inside LocaleProvider')
  return context
}
