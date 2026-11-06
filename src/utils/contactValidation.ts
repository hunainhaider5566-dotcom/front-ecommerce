export const PAKISTANI_MOBILE_PATTERN = /^(?:03\d{9}|\+923\d{9})$/
export const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

export function isValidPakistaniMobile(value: string): boolean {
  return PAKISTANI_MOBILE_PATTERN.test(value.trim())
}

export function normalizePakistaniMobile(value: string): string {
  const mobile = value.trim()
  if (!isValidPakistaniMobile(mobile)) throw new Error('Use 03 followed by 9 digits or +923 followed by 9 digits.')
  return mobile.startsWith('03') ? '+92' + mobile.slice(1) : mobile
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value)
}
