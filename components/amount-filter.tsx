'use client'

import { useMemo } from 'react'
import { RangeFilter } from '@/components/range-filter'

// Grant sizes span seven orders of magnitude with roughly equal counts per
// decade, so the slider lives on a log axis: one stop per 1 / 3 / 10 step.
// The two ends stand for "no bound".
const TICKS = [100, 300, 1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6, 3e6, 1e7, 3e7, 1e8, 3e8, 1e9]
const LAST = TICKS.length - 1

export function formatShortUsd(amount: number): string {
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ]
  for (const [size, suffix] of units) {
    if (amount >= size) {
      const n = amount / size
      return `$${Number.isInteger(n) ? n : n.toFixed(1)}${suffix}`
    }
  }
  return `$${amount}`
}

export function formatAmountRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null
  if (min === null) return `Under ${formatShortUsd(max!)}`
  if (max === null) return `${formatShortUsd(min)}+`
  return `${formatShortUsd(min)} – ${formatShortUsd(max)}`
}

// Index of the tick closest (on the log axis) to an arbitrary dollar bound.
function tickIndex(amount: number | null, fallback: number): number {
  if (amount === null) return fallback
  let best = 0
  for (let i = 1; i < TICKS.length; i++) {
    if (
      Math.abs(Math.log10(TICKS[i]) - Math.log10(amount)) <
      Math.abs(Math.log10(TICKS[best]) - Math.log10(amount))
    )
      best = i
  }
  return best
}

const PRESETS = [
  { label: '<$1k', lo: 0, hi: tickIndex(1e3, 0) },
  { label: '$1k–10k', lo: tickIndex(1e3, 0), hi: tickIndex(1e4, 0) },
  { label: '$10k–100k', lo: tickIndex(1e4, 0), hi: tickIndex(1e5, 0) },
  { label: '$100k–1M', lo: tickIndex(1e5, 0), hi: tickIndex(1e6, 0) },
  { label: '$1M+', lo: tickIndex(1e6, 0), hi: LAST },
]

export function AmountFilter(props: {
  amounts: (number | null)[]
  min: number | null
  max: number | null
  onChange: (next: { amountMin: number | null; amountMax: number | null }) => void
}) {
  const { amounts, min, max, onChange } = props

  // One bin per gap between ticks; amounts below the first tick go in bin 0.
  const bins = useMemo(() => {
    const counts = new Array<number>(LAST).fill(0)
    for (const amount of amounts) {
      if (amount === null || amount >= TICKS[LAST]) continue
      let i = 0
      while (i < LAST - 1 && amount >= TICKS[i + 1]) i++
      counts[i]++
    }
    return counts
  }, [amounts])

  return (
    <RangeFilter
      label="Amount"
      activeLabel={formatAmountRange(min, max)}
      bins={bins}
      value={[tickIndex(min, 0), tickIndex(max, LAST)]}
      onChange={([lo, hi]) =>
        onChange({
          amountMin: lo === 0 ? null : TICKS[lo],
          amountMax: hi === LAST ? null : TICKS[hi],
        })
      }
      stopLabel={(i) => (i === 0 || i === LAST ? 'Any' : formatShortUsd(TICKS[i]))}
      presets={PRESETS}
      ariaLabel="Grant amount range"
    />
  )
}
