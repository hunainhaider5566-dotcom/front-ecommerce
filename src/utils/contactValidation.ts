export const PAKISTANI_MOBILE_PATTERN = /^(?:03[0-9]{9}|\\+923[0-9]{9})$/
export const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

export function isValidPakistaniMobile(value: string): boolean {
  return PAKISTANI_MOBILE_PATTERN.test(value)
}

export function normalizePakistaniMobile(value: string): string {
  if (!isValidPakistaniMobile(value)) throw new Error('Enter a valid Pakistani mobile number: 03001234567 or +923001234567.')
  return value.startsWith('03') ? '+92' + value.slice(1) : value
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value)
}
