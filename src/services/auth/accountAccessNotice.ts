const SUSPENSION_NOTICE_KEY = 'meridion.account-suspension-seen'
const NOTICE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function rememberAccountSuspension(): void {
  try { window.localStorage.setItem(SUSPENSION_NOTICE_KEY, String(Date.now())) } catch { /* Storage may be disabled. */ }
}

export function hasRememberedAccountSuspension(): boolean {
  try {
    const timestamp = Number(window.localStorage.getItem(SUSPENSION_NOTICE_KEY))
    if (!Number.isFinite(timestamp) || timestamp <= 0 || Date.now() - timestamp > NOTICE_TTL_MS) {
      window.localStorage.removeItem(SUSPENSION_NOTICE_KEY)
      return false
    }
    return true
  } catch { return false }
}

export function clearRememberedAccountSuspension(): void {
  try { window.localStorage.removeItem(SUSPENSION_NOTICE_KEY) } catch { /* Storage may be disabled. */ }
}
