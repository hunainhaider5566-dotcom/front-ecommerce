import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { useI18n } from '../i18n/LocaleContext'

type ToastTone = 'success' | 'error' | 'info'
interface ToastItem { id: number; message: string; tone: ToastTone }
interface ToastValue { push: (message: string, tone?: ToastTone) => void }
const ToastContext = createContext<ToastValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = Date.now() + Math.random()
    setItems((current) => [...current.slice(-2), { id, message, tone }])
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3600)
  }, [])
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), [])
  const value = useMemo(() => ({ push }), [push])
  return <ToastContext.Provider value={value}>{children}<ToastViewport items={items} dismiss={dismiss} /></ToastContext.Provider>
}

function ToastViewport({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  const { t } = useI18n()
  return <div className="toast-viewport" aria-live="polite" aria-relevant="additions text" aria-atomic="false">
    {items.map((item) => <div key={item.id} className={`toast toast--${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
      {item.tone === 'success' ? <CheckCircle2 size={18} aria-hidden="true" /> : item.tone === 'error' ? <CircleAlert size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
      <span>{item.message}</span>
      <button type="button" aria-label={t('Dismiss notification')} onClick={() => dismiss(item.id)}><X size={16} /></button>
    </div>)}
  </div>
}

export function useToast(): ToastValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
