export function formatMoney(amount: number | null, currency = 'USD') {
  if (amount === null) return '—'
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
  return formatted
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatGrantDate(date: string | null, precision: 'day' | 'month' | 'year' | null) {
  if (!date) return '—'
  const [year, month, day] = date.split('-').map(Number)
  if (precision === 'year') return String(year)
  if (precision === 'month') return `${MONTHS[month - 1]} ${year}`
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

// Footnote markers for estimated amounts, in table order.
export const ESTIMATE_SYMBOLS = ['*', '\u2020', '\u2021', '\u00a7', '\u00b6']

// Placeholder recipients that don't count as itemized grants when computing
// a funder's coverage (share of its dollar total with a real recipient):
// aggregate estimate rows, anonymous donors, and sources' own "undisclosed"
// lines (Jaan Tallinn's undisclosed donations, 990 Schedule F redactions).
const COVERAGE_EXCLUDED_NAME = /^\(?\s*(various|undisclosed|anonymous)\b/i

export function countsTowardCoverage(recipientName: string): boolean {
  return !COVERAGE_EXCLUDED_NAME.test(recipientName.trim())
}

export function formatCoverage(coveredUsd: number, totalUsd: number): string {
  if (totalUsd <= 0) return '\u2014'
  const pct = (coveredUsd / totalUsd) * 100
  if (pct > 0 && pct < 1) return '<1%'
  return `${Math.round(pct)}%`
}
