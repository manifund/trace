'use client'

// Shared control strip for the two front-page candidates: which view, which
// cause, which years.
import Link from 'next/link'
import { CAUSE_OPTIONS } from '@/utils/cause-tree'
import type { Filters } from '@/utils/flow'

const CAUSES = CAUSE_OPTIONS.filter((option) => option.depth <= 1)

export function ViewToggle(props: { active: 'sankey' | 'treemap' }) {
  const tab = (href: string, key: 'sankey' | 'treemap', label: string) => (
    <Link
      href={href}
      className={`border-r border-rule px-2.5 py-1 last:border-r-0 !text-ink hover:!no-underline ${
        props.active === key ? 'bg-paper-alt font-semibold' : 'text-ink-muted'
      }`}
    >
      {label}
    </Link>
  )
  return (
    <div className="flex overflow-hidden rounded border border-rule font-sans text-xs">
      {tab('/mock/sankey', 'sankey', 'Flow')}
      {tab('/mock/treemap', 'treemap', 'Treemap')}
    </div>
  )
}

export function FlowControls(props: {
  filters: Filters
  span: [number, number]
  onChange: (filters: Filters) => void
  children?: React.ReactNode
}) {
  const years = Array.from(
    { length: props.span[1] - props.span[0] + 1 },
    (_, i) => props.span[0] + i
  )
  const select = 'rounded border border-rule bg-paper px-2 py-1 text-xs'
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 font-sans">
      <select
        aria-label="Cause area"
        className={select}
        value={props.filters.cause}
        onChange={(e) => props.onChange({ ...props.filters, cause: e.target.value })}
      >
        <option value="all">All causes</option>
        {CAUSES.map((cause) => (
          <option key={cause.slug} value={cause.slug}>
            {cause.depth > 0 ? ` ${cause.name}` : cause.name}
          </option>
        ))}
      </select>
      <select
        aria-label="First year"
        className={select}
        value={props.filters.from}
        onChange={(e) =>
          props.onChange({
            ...props.filters,
            from: Number(e.target.value),
            to: Math.max(props.filters.to, Number(e.target.value)),
          })
        }
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <span className="text-xs text-ink-muted">to</span>
      <select
        aria-label="Last year"
        className={select}
        value={props.filters.to}
        onChange={(e) =>
          props.onChange({
            ...props.filters,
            to: Number(e.target.value),
            from: Math.min(props.filters.from, Number(e.target.value)),
          })
        }
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      {props.children}
    </div>
  )
}

export function StatStrip(props: { stats: { label: string; value: string }[] }) {
  return (
    <div className="mb-5 flex flex-wrap gap-x-10 gap-y-3 border-b border-rule pb-4">
      {props.stats.map((stat) => (
        <div key={stat.label}>
          <div className="font-sans text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-muted">
            {stat.label}
          </div>
          <div className="gb-num text-2xl font-semibold" style={{ textAlign: 'left' }}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}
