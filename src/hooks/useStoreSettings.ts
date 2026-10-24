import { useEffect, useState } from 'react'
import { loadStoreSettings, FALLBACK_STORE_SETTINGS, type StoreSettings } from '../services/store/storeSettingsService'

export function useStoreSettings(): StoreSettings & { loaded: boolean } {
  const [settings, setSettings] = useState<StoreSettings>(FALLBACK_STORE_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void loadStoreSettings().then((next) => {
      if (!active) return
      setSettings(next)
      setLoaded(true)
    })
    return () => { active = false }
  }, [])

  return { ...settings, loaded }
}
