export function moneyToCents(value) {
  const text = String(value)
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Invalid money value returned by the server')
  const [whole, fraction = ''] = text.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function formatMoney(value, currency) {
  const amount = typeof value === 'bigint' ? value : moneyToCents(value)
  const parts = new Intl.NumberFormat(undefined, {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).formatToParts(amount / 100n)
  const fraction = new Intl.NumberFormat(undefined, { minimumIntegerDigits: 2, useGrouping: false }).format(Number(amount % 100n))
  return parts.map((part) => part.type === 'fraction' ? fraction : part.value).join('')
}
