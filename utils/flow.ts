// Aggregation behind the front page: grants reduced to a compact row, then
// nested into the treemap's blocks.
import type { GrantRow } from '@/db/grant'
import { CAUSE_TREE } from '@/utils/cause-tree'

export type FlowRow = {
  f: string
  fn: string
  r: string
  rn: string
  a: number
  y: number | null
  c: string[]
  v: { slug: string; name: string }[]
}

export function toFlowRows(grants: GrantRow[]): FlowRow[] {
  return grants
    .filter((g) => (g.amountUsd ?? 0) > 0)
    .map((g) => ({
      f: g.funderSlug,
      fn: g.funderName,
      r: g.recipientSlug,
      rn: g.recipientName,
      a: g.amountUsd as number,
      y: g.date ? Number(g.date.slice(0, 4)) : null,
      c: g.causes,
      v: g.vias,
    }))
}

// ------------------------------------------------------------- grantmakers

// A grant names the donor as funder and the vehicle it was granted through
// as a via: Jaan Tallinn funds SFF rounds, ACX regrantors work through
// Manifund. The vehicle picked the recipient, so it's the grantmaker and the
// funder is the donor standing behind it.
const NOT_A_GRANTMAKER = new Set([
  // The umbrella brand. Its constituent funds — LTFF, EAIF, the Animal
  // Welfare Fund — are already named as the funder, and they're the ones
  // choosing grantees.
  'ea-funds',
])

export function grantmakerOf(row: FlowRow, vehicles: Set<string>): { slug: string; name: string } {
  const vehicle = row.v.find(
    (via) => via.slug !== row.f && vehicles.has(via.slug) && !NOT_A_GRANTMAKER.has(via.slug)
  )
  return vehicle ?? { slug: row.f, name: row.fn }
}

// ---------------------------------------------------------------- structure

export type FlowStructure = {
  // Orgs that move most of what they take in back out again.
  regrantor: Set<string>
  // Where a funder's money came from, as shares summing to 1.
  originsOf: (slug: string) => Map<string, number>
  nameOf: (slug: string) => string
}

// Read off the whole database, not the filtered view: who funds Coefficient
// Giving is a fact about Coefficient Giving, not about the grants currently
// on screen.
export function analyzeStructure(all: FlowRow[]): FlowStructure {
  const granted = new Map<string, number>()
  const received = new Map<string, number>()
  const names = new Map<string, string>()
  const donorsOf = new Map<string, Map<string, number>>()
  for (const row of all) {
    names.set(row.f, row.fn)
    names.set(row.r, row.rn)
    granted.set(row.f, (granted.get(row.f) ?? 0) + row.a)
    received.set(row.r, (received.get(row.r) ?? 0) + row.a)
    const donors = donorsOf.get(row.r) ?? new Map<string, number>()
    donors.set(row.f, (donors.get(row.f) ?? 0) + row.a)
    donorsOf.set(row.r, donors)
  }

  // An org that sends most of its income straight back out is a conduit:
  // counting the grant in and the grants out would count the same dollars
  // twice, so grants into one are left off the chart.
  const regrantor = new Set<string>()
  for (const [slug, taken] of received) {
    if (taken >= 1e6 && (granted.get(slug) ?? 0) >= taken * 0.5) regrantor.add(slug)
  }

  const memo = new Map<string, Map<string, number>>()
  const resolving = new Set<string>()
  let cycles = 0
  const originsOf = (slug: string): Map<string, number> => {
    const cached = memo.get(slug)
    if (cached) return cached
    const donors = donorsOf.get(slug)
    const taken = received.get(slug) ?? 0
    const given = granted.get(slug) ?? 0
    if (!donors || taken <= 0 || given <= 0) return new Map([[slug, 1]])
    // A ring of funds financing each other would recurse forever; the org
    // that closes the ring is credited to itself.
    if (resolving.has(slug)) {
      cycles++
      return new Map([[slug, 1]])
    }
    // Only the share of an org's grantmaking that its recorded donors can
    // account for gets credited upstream. Good Ventures granting billions on
    // the back of one small incoming grant stays its own origin.
    const upstream = Math.min(1, taken / given)
    resolving.add(slug)
    const before = cycles
    const shares = new Map<string, number>()
    for (const [donor, amount] of donors) {
      for (const [origin, share] of originsOf(donor)) {
        shares.set(origin, (shares.get(origin) ?? 0) + (share * amount * upstream) / taken)
      }
    }
    if (upstream < 1) shares.set(slug, (shares.get(slug) ?? 0) + 1 - upstream)
    resolving.delete(slug)
    // A result computed through a truncated cycle isn't the real answer for
    // this org, so it doesn't get cached.
    if (cycles === before) memo.set(slug, shares)
    return shares
  }

  return { regrantor, originsOf, nameOf: (slug) => names.get(slug) ?? slug }
}

// -------------------------------------------------------------------- causes

const TOP_LEVEL = CAUSE_TREE.filter((node) => !node.parent)
const AIS_SUBCAUSES = CAUSE_TREE.filter((node) => node.parent === 'ai-safety')

// AI safety covers most of the database, so splitting only at the top level
// would give one giant block. Inside it, split by the tier below.
export function causeBuckets(causes: string[]): string[] {
  if (causes.includes('ai-safety')) {
    const subs = AIS_SUBCAUSES.filter((node) => causes.includes(node.slug)).map((node) => node.name)
    return subs.length > 0 ? subs : ['AI safety']
  }
  const tops = TOP_LEVEL.filter(
    (node) => node.slug !== 'ai-safety' && causes.includes(node.slug)
  ).map((node) => node.name)
  return tops.length > 0 ? tops : ['Other']
}

export function yearSpan(rows: FlowRow[]): [number, number] {
  const years = rows.map((row) => row.y).filter((year): year is number => year !== null)
  if (years.length === 0) return [2012, new Date().getFullYear()]
  return [Math.min(...years), Math.max(...years)]
}

export type Filters = { cause: string; from: number; to: number }

export function applyFilters(rows: FlowRow[], filters: Filters, span: [number, number]): FlowRow[] {
  const narrowed = filters.from > span[0] || filters.to < span[1]
  return rows.filter((row) => {
    if (filters.cause !== 'all' && !row.c.includes(filters.cause)) return false
    if (!narrowed) return true
    // Undated rows can't be placed in a narrowed window, so they drop out.
    return row.y !== null && row.y >= filters.from && row.y <= filters.to
  })
}

// ------------------------------------------------------------------ treemap

export type Nesting = 'funder-recipient' | 'cause-recipient' | 'funder-cause'

export type TreeLeaf = {
  key: string
  name: string
  slug: string | null
  value: number
  count: number
  from: number | null
  to: number | null
}
export type TreeBranch = TreeLeaf & { children: TreeLeaf[] }

const OTHERS = 'Others'

function accumulate(
  into: Map<string, TreeLeaf>,
  key: string,
  name: string,
  slug: string | null,
  row: FlowRow,
  amount: number
) {
  const leaf = into.get(key) ?? {
    key,
    name,
    slug,
    value: 0,
    count: 0,
    from: null,
    to: null,
  }
  leaf.value += amount
  leaf.count++
  if (row.y !== null) {
    leaf.from = leaf.from === null ? row.y : Math.min(leaf.from, row.y)
    leaf.to = leaf.to === null ? row.y : Math.max(leaf.to, row.y)
  }
  into.set(key, leaf)
}

// A grant tagged with several causes is split between them, so the blocks
// still add up to the total.
function splitBy(
  row: FlowRow,
  level: 'funder' | 'recipient' | 'cause',
  vehicles: Set<string>
): { key: string; name: string; slug: string | null; amount: number }[] {
  if (level === 'funder') {
    const maker = grantmakerOf(row, vehicles)
    return [{ key: maker.slug, name: maker.name, slug: maker.slug, amount: row.a }]
  }
  if (level === 'recipient') return [{ key: row.r, name: row.rn, slug: row.r, amount: row.a }]
  const buckets = causeBuckets(row.c)
  return buckets.map((name) => ({
    key: name,
    name,
    slug: null,
    amount: row.a / buckets.length,
  }))
}

export function buildTree(
  rows: FlowRow[],
  nesting: Nesting,
  vehicles: Set<string>,
  keep = { parents: 7, children: 14 }
): TreeBranch[] {
  const [outer, inner] = (
    {
      'funder-recipient': ['funder', 'recipient'],
      'cause-recipient': ['cause', 'recipient'],
      'funder-cause': ['funder', 'cause'],
    } as const
  )[nesting]

  const parents = new Map<string, TreeLeaf>()
  const childrenOf = new Map<string, Map<string, TreeLeaf>>()
  for (const row of rows) {
    for (const parent of splitBy(row, outer, vehicles)) {
      accumulate(parents, parent.key, parent.name, parent.slug, row, parent.amount)
      const kids = childrenOf.get(parent.key) ?? new Map<string, TreeLeaf>()
      // Both levels may split the same grant; the shares multiply out.
      const inners = splitBy(row, inner, vehicles)
      for (const child of inners) {
        accumulate(
          kids,
          child.key,
          child.name,
          child.slug,
          row,
          (parent.amount * child.amount) / row.a
        )
      }
      childrenOf.set(parent.key, kids)
    }
  }

  const ranked = Array.from(parents.values()).sort((a, b) => b.value - a.value)
  const shown = ranked.slice(0, keep.parents)
  const rest = ranked.slice(keep.parents)

  const foldChildren = (kids: TreeLeaf[]): TreeLeaf[] => {
    const sorted = kids.sort((a, b) => b.value - a.value)
    const head = sorted.slice(0, keep.children)
    const tail = sorted.slice(keep.children)
    if (tail.length === 0) return head
    return [
      ...head,
      {
        key: '~others',
        name: `${tail.length} others`,
        slug: null,
        value: tail.reduce((t, k) => t + k.value, 0),
        count: tail.reduce((t, k) => t + k.count, 0),
        from: null,
        to: null,
      },
    ]
  }

  const branches: TreeBranch[] = shown.map((parent) => ({
    ...parent,
    children: foldChildren(Array.from(childrenOf.get(parent.key)?.values() ?? [])),
  }))

  if (rest.length > 0) {
    const merged = new Map<string, TreeLeaf>()
    for (const parent of rest) {
      for (const child of childrenOf.get(parent.key)?.values() ?? []) {
        const existing = merged.get(child.key)
        if (existing) {
          existing.value += child.value
          existing.count += child.count
        } else merged.set(child.key, { ...child })
      }
    }
    branches.push({
      key: '~others',
      name: `${rest.length} ${OTHERS.toLowerCase()}`,
      slug: null,
      value: rest.reduce((t, p) => t + p.value, 0),
      count: rest.reduce((t, p) => t + p.count, 0),
      from: null,
      to: null,
      children: foldChildren(Array.from(merged.values())),
    })
  }
  return branches
}

// ------------------------------------------------------------ squarified layout

export type Rect = { x: number; y: number; w: number; h: number }

function worstRatio(values: number[], length: number, scale: number): number {
  const sum = values.reduce((t, v) => t + v, 0) * scale
  const max = Math.max(...values) * scale
  const min = Math.min(...values) * scale
  if (sum <= 0 || min <= 0) return Infinity
  const l2 = length * length
  const s2 = sum * sum
  return Math.max((l2 * max) / s2, s2 / (l2 * min))
}

// Bruls, Huizing & van Wijk: lay each row along the shorter side so tiles
// stay close to square and stay readable.
export function squarify<T extends { value: number }>(items: T[], rect: Rect): (T & Rect)[] {
  const laid: (T & Rect)[] = []
  const queue = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value)
  const totalValue = queue.reduce((t, item) => t + item.value, 0)
  if (totalValue <= 0 || rect.w <= 0 || rect.h <= 0) return laid
  const scale = (rect.w * rect.h) / totalValue

  let free = { ...rect }
  let index = 0
  while (index < queue.length && free.w > 0.5 && free.h > 0.5) {
    const length = Math.min(free.w, free.h)
    const row: T[] = []
    const values: number[] = []
    while (index < queue.length) {
      const next = queue[index].value
      if (
        row.length > 0 &&
        worstRatio([...values, next], length, scale) > worstRatio(values, length, scale)
      ) {
        break
      }
      row.push(queue[index])
      values.push(next)
      index++
    }
    const rowArea = values.reduce((t, v) => t + v, 0) * scale
    const thickness = rowArea / length
    const vertical = free.w >= free.h
    let offset = 0
    for (let i = 0; i < row.length; i++) {
      const extent = (values[i] * scale) / thickness
      laid.push(
        vertical
          ? { ...row[i], x: free.x, y: free.y + offset, w: thickness, h: extent }
          : { ...row[i], x: free.x + offset, y: free.y, w: extent, h: thickness }
      )
      offset += extent
    }
    free = vertical
      ? { x: free.x + thickness, y: free.y, w: free.w - thickness, h: free.h }
      : { x: free.x, y: free.y + thickness, w: free.w, h: free.h - thickness }
  }
  return laid
}
