'use client'

import { useMemo } from 'react'
import { RangeFilter } from '@/components/range-filter'

// Stops are year boundaries, so bin i covers all of FIRST_YEAR + i. The data
// runs back to 2003 but only a few dozen grants predate 2012; they share the
// first bin and the open "Start" bound still includes them.
const FIRST_YEAR = 2012
const THIS_YEAR = new Date().getFullYear()
const LAST = THIS_YEAR - FIRST_YEAR + 1
const yearAt = (i: number) => FIRST_YEAR + i

export function formatYearRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null
  if (min === null) return `Through ${max}`
  if (max === null) return `Since ${min}`
  return min === max ? String(min) : `${min}–${max}`
}

const clamp = (i: number) => Math.min(LAST, Math.max(0, i))

const PRESETS = [
  ...[0, 1, 2].map((back) => ({
    label: String(THIS_YEAR - back),
    lo: clamp(THIS_YEAR - back - FIRST_YEAR),
    hi: clamp(THIS_YEAR - back - FIRST_YEAR + 1),
  })),
  { label: 'Last 5 years', lo: clamp(THIS_YEAR - 4 - FIRST_YEAR), hi: LAST },
]

export function DateFilter(props: {
  dates: (string | null)[]
  min: number | null
  max: number | null
  onChange: (next: { yearMin: number | null; yearMax: number | null }) => void
}) {
  const { dates, min, max, onChange } = props

  const bins = useMemo(() => {
    const counts = new Array<number>(LAST).fill(0)
    for (const date of dates) {
      if (!date) continue
      counts[clamp(Number(date.slice(0, 4)) - FIRST_YEAR)]++
    }
    return counts
  }, [dates])

  return (
    <RangeFilter
      activeLabel={formatYearRange(min, max)}
      bins={bins}
      value={[
        min === null ? 0 : clamp(min - FIRST_YEAR),
        max === null ? LAST : clamp(max + 1 - FIRST_YEAR),
      ]}
      onChange={([lo, hi]) =>
        onChange({
          yearMin: lo === 0 ? null : yearAt(lo),
          yearMax: hi === LAST ? null : yearAt(hi) - 1,
        })
      }
      stopLabel={(i) => (i === 0 ? 'Start' : i === LAST ? 'Present' : String(yearAt(i)))}
      presets={PRESETS}
      ariaLabel="Grant date range"
    />
  )
}
