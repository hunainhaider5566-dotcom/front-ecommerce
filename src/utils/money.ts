export function formatPKR(value: number): string {
  return `PKR ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(value)}`
}
