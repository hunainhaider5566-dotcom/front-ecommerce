import { WHATSAPP_NUMBER } from '../config/store'

export function normalizedWhatsAppNumber(value = WHATSAPP_NUMBER): string | null {
  const input = value.trim()
  const digits = input.replace(/\D/g, '')
  if (!digits) return null
  if (/^0?3\d{9}$/.test(digits)) return `92${digits.startsWith('0') ? digits.slice(1) : digits}`
  const hasInternationalPrefix = input.startsWith('+') || input.startsWith('00')
  const international = digits.startsWith('00') ? digits.slice(2) : digits
  if (!hasInternationalPrefix || !/^[1-9]\d{9,14}$/.test(international)) return null
  return international
}

export function supportDestination(message?: string): string {
  const number = normalizedWhatsAppNumber()
  if (!number) return '/contact'
  const text = message || 'Hello, I have a question about Meridion Marketplace.'
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

export function productInquiryMessage(name: string, slug: string): string {
  return `Hello, I have a question about the product "${name}" (${slug}) on Meridion Marketplace.`
}
