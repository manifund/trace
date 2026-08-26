'use client'

import { useMemo, useState } from 'react'
import {
  DonutChart,
  SERIES,
  SERIES_OTHER,
  YearBarChart,
  YearLineChart,
  fmtCompact,
} from '@/components/charts'
import { MultiSelect } from '@/components/multi-select'
import type { GrantRow } from '@/db/grant'
import { CAUSE_OPTIONS, CAUSE_PARENTS, CAUSE_TREE } from '@/utils/cause-tree'

const NAMES = new Map(CAUSE_TREE.map((node) => [node.slug, node.name]))
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const TOP_LEVEL = CAUSE_TREE.filter((node) => !node.parent).map((node) => node.slug)
const AIS_SUBCAUSES = CAUSE_TREE.filter((node) => node.parent === 'ai-safety').map((n) => n.slug)

function CauseSelect(props: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="rounded-sm border border-rule bg-paper-alt px-2 py-1 text-sm"
    >
      <option value="all">All causes</option>
      {CAUSE_OPTIONS.map((cause) => (
        <option key={cause.slug} value={cause.slug}>
          {' '.repeat(cause.depth)}
          {cause.name}
        </option>
      ))}
    </select>
  )
}

function useOrgOptions(grants: GrantRow[], side: 'funder' | 'recipient') {
  return useMemo(() => {
    const totals = new Map<string, { label: string; usd: number }>()
    for (const grant of grants) {
      const slug = side === 'funder' ? grant.funderSlug : grant.recipientSlug
      const name = side === 'funder' ? grant.funderName : grant.recipientName
      const entry = totals.get(slug) ?? { label: name, usd: 0 }
      entry.usd += grant.amountUsd ?? 0
      totals.set(slug, entry)
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1].usd - a[1].usd)
      .map(([value, entry]) => ({ value, label: entry.label }))
  }, [grants, side])
}

const inCause = (grant: GrantRow, cause: string) => cause === 'all' || grant.causes.includes(cause)

// Which cause filter a grouping mode actually leaves open: grouping by cause
// implies all causes, by subcause implies AI safety, by subsubcause narrows
// within AI safety's branches.
function effectiveCause(mode: GroupMode, cause: string, branch: string): string {
  if (mode === 'cause') return 'all'
  if (mode === 'subcause') return 'ai-safety'
  if (mode === 'subsubcause') return branch
  return cause
}

function BranchSelect(props: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="rounded-sm border border-rule bg-paper-alt px-2 py-1 text-sm"
    >
      <option value="ai-safety">AI safety</option>
      {CAUSE_TREE.filter((node) => node.parent === 'ai-safety').map((node) => (
        <option key={node.slug} value={node.slug}>
          {node.name}
        </option>
      ))}
    </select>
  )
}

function byYear(grants: GrantRow[]): { year: number; value: number }[] {
  const map = new Map<number, number>()
  for (const grant of grants) {
    if (!grant.date || grant.amountUsd === null) continue
    const year = Number(grant.date.slice(0, 4))
    map.set(year, (map.get(year) ?? 0) + grant.amountUsd)
  }
  const years = Array.from(map.keys()).sort((a, b) => a - b)
  if (years.length === 0) return []
  const out: { year: number; value: number }[] = []
  for (let year = years[0]; year <= years[years.length - 1]; year++) {
    out.push({ year, value: map.get(year) ?? 0 })
  }
  return out
}

type GroupMode = 'funder' | 'cause' | 'subcause' | 'subsubcause'

// Grouping key for a grant under a mode; null = excluded from this view.
function groupKeys(grant: GrantRow, mode: GroupMode): string[] | null {
  if (mode === 'funder') return [grant.funderName]
  if (mode === 'cause') {
    const tops = grant.causes.filter((slug) => TOP_LEVEL.includes(slug))
    return tops.length > 0 ? tops.map((slug) => NAMES.get(slug) ?? slug) : null
  }
  // subcause/subsubcause: AIS grants only
  if (!grant.causes.includes('ai-safety')) return null
  if (mode === 'subsubcause') {
    // tier-3 tags; grants without one land in a single Uncategorized bucket
    const keys = new Set<string>()
    for (const slug of grant.causes) {
      let cursor: string | undefined = slug
      while (cursor && CAUSE_PARENTS[cursor] && !AIS_SUBCAUSES.includes(CAUSE_PARENTS[cursor])) {
        cursor = CAUSE_PARENTS[cursor]
      }
      if (cursor && CAUSE_PARENTS[cursor] && AIS_SUBCAUSES.includes(CAUSE_PARENTS[cursor])) {
        keys.add(NAMES.get(cursor) ?? cursor)
      }
    }
    return keys.size > 0 ? Array.from(keys) : ['Uncategorized']
  }
  const subs = new Set<string>()
  for (const slug of grant.causes) {
    let cursor: string | undefined = slug
    while (cursor && CAUSE_PARENTS[cursor] && CAUSE_PARENTS[cursor] !== 'ai-safety') {
      cursor = CAUSE_PARENTS[cursor]
    }
    if (cursor && AIS_SUBCAUSES.includes(cursor)) subs.add(NAMES.get(cursor) ?? cursor)
  }
  return subs.size > 0 ? Array.from(subs) : ['AI safety (unclassified)']
}

export function ChartsView(props: { grants: GrantRow[] }) {
  const funderOptions = useOrgOptions(props.grants, 'funder')
  const recipientOptions = useOrgOptions(props.grants, 'recipient')

  // Chart 1: funding by year
  const [barCause, setBarCause] = useState('ai-safety')
  const [barFunders, setBarFunders] = useState<string[]>([])
  const [barRecipients, setBarRecipients] = useState<string[]>([])
  const barData = useMemo(() => {
    const rows = props.grants.filter(
      (g) =>
        inCause(g, barCause) &&
        (barFunders.length === 0 || barFunders.includes(g.funderSlug)) &&
        (barRecipients.length === 0 || barRecipients.includes(g.recipientSlug))
    )
    return byYear(rows)
  }, [props.grants, barCause, barFunders, barRecipients])

  // Chart 2: lines by year
  const [lineGroup, setLineGroup] = useState<GroupMode>('funder')
  const [lineCause, setLineCause] = useState('ai-safety')
  const [lineFunders, setLineFunders] = useState<string[]>([])
  const [lineCount, setLineCount] = useState(5)
  const [lineBranch, setLineBranch] = useState('ai-safety')
  const lineData = useMemo(() => {
    const cause = effectiveCause(lineGroup, lineCause, lineBranch)
    const rows = props.grants.filter(
      (g) => inCause(g, cause) && (lineFunders.length === 0 || lineFunders.includes(g.funderSlug))
    )
    // Monthly resolution: month index = year*12 + (month-1). Year-precision
    // grants are amortized evenly across the year's 12 months.
    const totals = new Map<string, number>()
    const perMonth = new Map<string, Map<number, number>>()
    let minMonth = Infinity
    let maxMonth = -Infinity
    for (const grant of rows) {
      if (!grant.date || grant.amountUsd === null) continue
      const keys = groupKeys(grant, lineGroup)
      if (!keys) continue
      const year = Number(grant.date.slice(0, 4))
      const parts: [number, number][] =
        grant.datePrecision === 'year'
          ? Array.from({ length: 12 }, (_, m) => [year * 12 + m, grant.amountUsd! / 12])
          : [[year * 12 + Number(grant.date.slice(5, 7)) - 1, grant.amountUsd]]
      for (const [month] of parts) {
        minMonth = Math.min(minMonth, month)
        maxMonth = Math.max(maxMonth, month)
      }
      for (const key of keys) {
        totals.set(key, (totals.get(key) ?? 0) + grant.amountUsd)
        const m = perMonth.get(key) ?? new Map<number, number>()
        for (const [month, value] of parts) m.set(month, (m.get(month) ?? 0) + value)
        perMonth.set(key, m)
      }
    }
    const top = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, lineCount)
      .map(([name]) => name)
    const months: number[] = []
    if (minMonth !== Infinity) for (let m = minMonth; m <= maxMonth; m++) months.push(m)
    const series = top.map((name, i) => {
      const points = new Map<number, number>()
      let running = 0
      for (const month of months) {
        running += perMonth.get(name)?.get(month) ?? 0
        points.set(month, running)
      }
      return { name, color: SERIES[i % SERIES.length], points }
    })
    // Tick on Januaries, thinned to at most ~16 labels.
    const jans = months.filter((m) => m % 12 === 0)
    const step = Math.max(1, Math.ceil(jans.length / 16))
    const xTicks = jans
      .filter((_, i) => i % step === 0)
      .map((m) => ({ value: m, label: `${Math.floor(m / 12)}` }))
    return { series, months, xTicks }
  }, [props.grants, lineGroup, lineCause, lineBranch, lineFunders, lineCount])

  // Chart 3: donut
  const [pieGroup, setPieGroup] = useState<Exclude<GroupMode, 'funder'> | 'funder'>('cause')
  const [pieCause, setPieCause] = useState('all')
  const [pieFunders, setPieFunders] = useState<string[]>([])
  const [pieRecipients, setPieRecipients] = useState<string[]>([])
  const [pieBranch, setPieBranch] = useState('ai-safety')
  const pieData = useMemo(() => {
    const cause = effectiveCause(pieGroup, pieCause, pieBranch)
    const rows = props.grants.filter(
      (g) =>
        inCause(g, cause) &&
        (pieFunders.length === 0 || pieFunders.includes(g.funderSlug)) &&
        (pieRecipients.length === 0 || pieRecipients.includes(g.recipientSlug))
    )
    const totals = new Map<string, number>()
    for (const grant of rows) {
      if (grant.amountUsd === null) continue
      const keys = groupKeys(grant, pieGroup)
      if (!keys) continue
      // Split the amount across multi-key grants so the donut sums correctly.
      for (const key of keys)
        totals.set(key, (totals.get(key) ?? 0) + grant.amountUsd / keys.length)
    }
    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
    const head = sorted.slice(0, 5)
    const rest = sorted.slice(5).reduce((sum, [, v]) => sum + v, 0)
    const slices = head.map(([name, value], i) => ({ name, value, color: SERIES[i] }))
    if (rest > 0) slices.push({ name: 'All others', value: rest, color: SERIES_OTHER })
    return slices
  }, [props.grants, pieGroup, pieCause, pieBranch, pieFunders, pieRecipients])

  const barTotal = barData.reduce((sum, d) => sum + d.value, 0)
  const barHasEstimates = useMemo(
    () =>
      props.grants.some(
        (g) =>
          g.amountEstimated &&
          inCause(g, barCause) &&
          (barFunders.length === 0 || barFunders.includes(g.funderSlug)) &&
          (barRecipients.length === 0 || barRecipients.includes(g.recipientSlug))
      ),
    [props.grants, barCause, barFunders, barRecipients]
  )

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-1 font-serif text-lg font-bold">Funding by year</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CauseSelect value={barCause} onChange={setBarCause} />
          <MultiSelect
            label="Funder"
            options={funderOptions}
            selected={barFunders}
            onChange={setBarFunders}
          />
          <MultiSelect
            label="Recipient"
            options={recipientOptions}
            selected={barRecipients}
            onChange={setBarRecipients}
          />
          <span className="ml-auto text-sm text-ink-muted">
            {fmtCompact(barTotal)}
            {barHasEstimates && '*'} total
          </span>
        </div>
        <YearBarChart data={barData} />
      </section>

      <section>
        <h2 className="mb-1 font-serif text-lg font-bold">Cumulative funding, compared</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={lineGroup}
            onChange={(e) => setLineGroup(e.target.value as never)}
            className="rounded-sm border border-rule bg-paper-alt px-2 py-1 text-sm"
          >
            <option value="funder">Lines: funders</option>
            <option value="cause">Lines: causes</option>
            <option value="subcause">Lines: AI safety subcauses</option>
            <option value="subsubcause">Lines: AI safety subsubcauses</option>
          </select>
          {lineGroup === 'funder' && <CauseSelect value={lineCause} onChange={setLineCause} />}
          {lineGroup === 'subsubcause' && (
            <BranchSelect value={lineBranch} onChange={setLineBranch} />
          )}
          <MultiSelect
            label="Funder"
            options={funderOptions}
            selected={lineFunders}
            onChange={setLineFunders}
          />
          <select
            value={lineCount}
            onChange={(e) => setLineCount(Number(e.target.value))}
            className="rounded-sm border border-rule bg-paper-alt px-2 py-1 text-sm"
          >
            {[5, 8, 10].map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </div>
        <YearLineChart
          series={lineData.series}
          years={lineData.months}
          xTicks={lineData.xTicks}
          fmtX={(m) => `${MONTH_NAMES[m % 12]} ${Math.floor(m / 12)}`}
        />
      </section>

      <section>
        <h2 className="mb-1 font-serif text-lg font-bold">Funding share</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={pieGroup}
            onChange={(e) => setPieGroup(e.target.value as never)}
            className="rounded-sm border border-rule bg-paper-alt px-2 py-1 text-sm"
          >
            <option value="cause">By cause</option>
            <option value="subcause">By AI safety subcause</option>
            <option value="subsubcause">By AI safety subsubcause</option>
            <option value="funder">By funder</option>
          </select>
          {pieGroup === 'funder' && <CauseSelect value={pieCause} onChange={setPieCause} />}
          {pieGroup === 'subsubcause' && <BranchSelect value={pieBranch} onChange={setPieBranch} />}
          <MultiSelect
            label="Funder"
            options={funderOptions}
            selected={pieFunders}
            onChange={setPieFunders}
          />
          <MultiSelect
            label="Recipient"
            options={recipientOptions}
            selected={pieRecipients}
            onChange={setPieRecipients}
          />
        </div>
        <DonutChart slices={pieData} />
      </section>

      <p className="text-xs text-ink-muted">
        Dollar figures cover grants with disclosed amounts only; * includes estimated amounts.
      </p>
    </div>
  )
}
