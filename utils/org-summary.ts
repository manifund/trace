// Turns an org's grants into the numbers its page leads with: headline stats,
// the year-by-year stacks behind the chart, and the "biggest X" tables.
import type { GrantRow } from '@/db/grant'
import { CAUSE_TREE } from '@/utils/cause-tree'
import { countsTowardCoverage, formatCoverage, formatMoney } from '@/utils/format'

const TOP_LEVEL = CAUSE_TREE.filter((node) => !node.parent)
const CAUSE_NAMES = new Map(TOP_LEVEL.map((node) => [node.slug, node.name]))
// AI safety covers most of this database, so a funder split only by top-level
// cause would be one bar. Inside it, split by the tier below instead.
const AIS_SUBCAUSES = CAUSE_TREE.filter((node) => node.parent === 'ai-safety')
const AIS_NAMES = new Map(AIS_SUBCAUSES.map((node) => [node.slug, node.name]))

export type Bucket = { name: string; slug?: string; amount: number; count: number }

const priced = (grants: GrantRow[]) => grants.filter((g) => g.amountUsd !== null)
const sum = (grants: GrantRow[]) => grants.reduce((total, g) => total + (g.amountUsd ?? 0), 0)

export function yearsActive(grants: GrantRow[]): string {
  const years = grants.map((g) => (g.date ? Number(g.date.slice(0, 4)) : null)).filter(Boolean)
  if (years.length === 0) return '—'
  const min = Math.min(...(years as number[]))
  const max = Math.max(...(years as number[]))
  return min === max ? String(min) : `${min}–${String(max).slice(2)}`
}

export function byYear(grants: GrantRow[]): Record<number, number> {
  const out: Record<number, number> = {}
  for (const grant of grants) {
    if (!grant.date || grant.amountUsd === null) continue
    out[Number(grant.date.slice(0, 4))] =
      (out[Number(grant.date.slice(0, 4))] ?? 0) + grant.amountUsd
  }
  return out
}

export function yearRange(grants: GrantRow[]): number[] {
  const years = Object.keys(byYear(grants)).map(Number)
  if (years.length === 0) return []
  const out: number[] = []
  for (let y = Math.min(...years); y <= Math.max(...years); y++) out.push(y)
  return out
}

// The causes a grant counts towards, splitting its amount between them so
// totals still add up. AI safety grants are split by their subcause.
export function causeBuckets(grant: GrantRow): string[] {
  const inAis = grant.causes.includes('ai-safety')
  if (inAis) {
    const subs = AIS_SUBCAUSES.filter((node) => grant.causes.includes(node.slug)).map(
      (node) => AIS_NAMES.get(node.slug) as string
    )
    return subs.length > 0 ? subs : ['AI safety']
  }
  const tops = TOP_LEVEL.filter(
    (node) => node.slug !== 'ai-safety' && grant.causes.includes(node.slug)
  ).map((node) => CAUSE_NAMES.get(node.slug) as string)
  return tops.length > 0 ? tops : ['Other']
}

function rank(map: Map<string, Bucket>, limit = 12): Bucket[] {
  return Array.from(map.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

export function byCause(grants: GrantRow[]): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const grant of priced(grants)) {
    const names = causeBuckets(grant)
    for (const name of names) {
      const entry = map.get(name) ?? { name, amount: 0, count: 0 }
      entry.amount += (grant.amountUsd ?? 0) / names.length
      entry.count++
      map.set(name, entry)
    }
  }
  return rank(map)
}

export function byOrg(grants: GrantRow[], side: 'funder' | 'recipient'): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const grant of priced(grants)) {
    const name = side === 'funder' ? grant.funderName : grant.recipientName
    const slug = side === 'funder' ? grant.funderSlug : grant.recipientSlug
    const entry = map.get(slug) ?? { name, slug, amount: 0, count: 0 }
    entry.amount += grant.amountUsd ?? 0
    entry.count++
    map.set(slug, entry)
  }
  return rank(map)
}

// Year-by-year stacks for the chart, keeping the biggest categories and
// folding the rest into "All others" so the palette stays readable.
export function stacksFor(
  grants: GrantRow[],
  dimension: 'cause' | 'funder',
  keep = 5
): { name: string; byYear: Record<number, number> }[] {
  const totals = dimension === 'cause' ? byCause(grants) : byOrg(grants, 'funder')
  const top = totals.slice(0, keep).map((bucket) => bucket.name)
  const stacks = new Map<string, Record<number, number>>()
  for (const name of [...top, 'All others']) stacks.set(name, {})
  for (const grant of priced(grants)) {
    if (!grant.date) continue
    const year = Number(grant.date.slice(0, 4))
    const names = dimension === 'cause' ? causeBuckets(grant) : [grant.funderName]
    for (const name of names) {
      const key = top.includes(name) ? name : 'All others'
      const bucket = stacks.get(key) as Record<number, number>
      bucket[year] = (bucket[year] ?? 0) + (grant.amountUsd ?? 0) / names.length
    }
  }
  return Array.from(stacks.entries())
    .map(([name, values]) => ({ name, byYear: values }))
    .filter((stack) => Object.keys(stack.byYear).length > 0)
}

export type Stat = { label: string; value: string; detail?: string }

export function funderStats(made: GrantRow[]): Stat[] {
  const withAmount = priced(made)
  const total = sum(withAmount)
  const covered = withAmount
    .filter((g) => countsTowardCoverage(g.recipientName))
    .reduce((t, g) => t + (g.amountUsd ?? 0), 0)
  return [
    { label: 'Total granted', value: formatMoney(total) },
    { label: 'Grants', value: made.length.toLocaleString() },
    {
      label: 'Average size',
      value: withAmount.length ? formatMoney(Math.round(total / withAmount.length)) : '—',
    },
    {
      label: 'Coverage',
      value: formatCoverage(covered, total),
      detail: 'itemized by recipient',
    },
    { label: 'Years active', value: yearsActive(made) },
  ]
}

export function viaStats(via: GrantRow[]): Stat[] {
  const withAmount = priced(via)
  const total = sum(withAmount)
  return [
    { label: 'Total routed', value: formatMoney(total) },
    { label: 'Grants', value: via.length.toLocaleString() },
    {
      label: 'Average size',
      value: withAmount.length ? formatMoney(Math.round(total / withAmount.length)) : '—',
    },
    { label: 'Years active', value: yearsActive(via) },
  ]
}

export function recipientStats(received: GrantRow[]): Stat[] {
  const total = sum(priced(received))
  const funders = new Set(received.map((g) => g.funderSlug)).size
  return [
    { label: 'Received', value: formatMoney(total), detail: `from ${funders} funders` },
    { label: 'Grants', value: received.length.toLocaleString() },
    { label: 'Funders', value: funders.toLocaleString() },
    { label: 'Years active', value: yearsActive(received) },
  ]
}
