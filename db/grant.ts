import 'server-only'

import { createHash } from 'node:crypto'
import { SUPABASE_URL } from './env'
import { createPublicSupabaseClient } from './supabase-server'

// Allows building without a configured Supabase project (CI, fresh clones).
export const dbConfigured = () => Boolean(SUPABASE_URL)

export type GrantRow = {
  id: string
  date: string | null
  datePrecision: 'day' | 'month' | 'year' | null
  amount: number | null
  currency: string
  amountUsd: number | null
  amountEstimated: boolean
  estimateNote: string | null
  description: string | null
  round: string | null
  url: string | null
  funderSlug: string
  funderName: string
  recipientSlug: string
  recipientName: string
  sponsorSlug: string | null
  sponsorName: string | null
  vias: { slug: string; name: string }[]
  sourceId: string | null
  causes: string[]
}

type JoinedOrg = { slug: string; name: string } | null

const GRANT_SELECT_BASE = `id, amount, currency, amount_usd, amount_estimated, estimate_note, grant_date, date_precision, description, round, url,
  funder:orgs!grants_funder_org_id_fkey(slug, name),
  recipient:orgs!grants_recipient_org_id_fkey(slug, name),
  sponsor:orgs!grants_fiscal_sponsor_org_id_fkey(slug, name),
  grant_vias(orgs(slug, name)),
  grant_sources(is_primary, source_records(source_id))`

function mapGrantRow(grant: Record<string, unknown>): GrantRow {
  const funder = grant.funder as JoinedOrg
  const recipient = grant.recipient as JoinedOrg
  const sponsor = grant.sponsor as JoinedOrg
  const viaJoins = (grant.grant_vias ?? []) as { orgs: { slug: string; name: string } | null }[]
  const causeJoins = (grant.grant_cause_areas ?? []) as { cause_areas: { slug: string } | null }[]
  const sourceJoins = (grant.grant_sources ?? []) as {
    is_primary: boolean
    source_records: { source_id: string } | null
  }[]
  return {
    id: grant.id as string,
    date: grant.grant_date as string | null,
    datePrecision: grant.date_precision as GrantRow['datePrecision'],
    amount: grant.amount as number | null,
    currency: grant.currency as string,
    amountUsd: grant.amount_usd as number | null,
    amountEstimated: Boolean(grant.amount_estimated),
    estimateNote: (grant.estimate_note as string | null) ?? null,
    description: grant.description as string | null,
    round: grant.round as string | null,
    url: grant.url as string | null,
    funderSlug: funder?.slug ?? '',
    funderName: funder?.name ?? '',
    recipientSlug: recipient?.slug ?? '',
    recipientName: recipient?.name ?? '',
    sponsorSlug: sponsor?.slug ?? null,
    sponsorName: sponsor?.name ?? null,
    vias: viaJoins
      .map((j) => j.orgs)
      .filter((o): o is { slug: string; name: string } => Boolean(o)),
    sourceId: sourceJoins.find((s) => s.is_primary)?.source_records?.source_id ?? null,
    causes: causeJoins
      .map((join) => join.cause_areas?.slug)
      .filter((slug): slug is string => Boolean(slug)),
  }
}

// Loads every approved grant with org + provenance joins, batching past the
// PostgREST 1000-row cap. Callers filter in memory; use getGrants() for the
// cached copy.
async function listGrants(): Promise<GrantRow[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const rows: GrantRow[] = []
  // Count first, then fetch every 1000-row page in parallel: sequential
  // paging was the dominant latency on pages that need the full table.
  const { count } = await supabase
    .from('grants')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .throwOnError()
  const pages = Math.ceil((count ?? 0) / 1000)
  const fetchPage = (page: number) =>
    supabase
      .from('grants')
      .select(`${GRANT_SELECT_BASE}, grant_cause_areas(cause_areas(slug))`)
      .eq('status', 'approved')
      .order('grant_date', { ascending: false, nullsFirst: false })
      .order('id')
      .range(page * 1000, page * 1000 + 999)
      .throwOnError()
  // Small chunks: full parallelism trips Postgres statement timeouts when
  // several pages build at once.
  for (let start = 0; start < pages; start += 3) {
    const chunk = await Promise.all(
      Array.from({ length: Math.min(3, pages - start) }, (_, i) => fetchPage(start + i))
    )
    for (const { data } of chunk) {
      for (const grant of (data ?? []) as never as Record<string, unknown>[]) {
        rows.push(mapGrantRow(grant))
      }
    }
  }
  return rows
}

// The whole approved dataset, fetched once per process and reused by every
// page for ten minutes. ISR already makes prod this stale; this makes dev
// (where ISR doesn't run) and cold regenerations share one query instead of
// paying the full load per request. Lives on globalThis so dev hot reloads
// keep it. A failed load is dropped so the next request retries.
const TTL_MS = 10 * 60 * 1000
type Loaded = { rows: GrantRow[]; version: string }
type Memo = { at: number; loaded: Promise<Loaded> }
const store = globalThis as typeof globalThis & { __traceGrants?: Memo }

function loadGrants(): Promise<Loaded> {
  const memo = store.__traceGrants
  if (memo && Date.now() - memo.at < TTL_MS) return memo.loaded
  const loaded = listGrants()
    .then((rows) => ({
      rows,
      // Content hash: the browser caches /grants.json?v=<version> forever, so
      // a changed dataset must be a new URL.
      version: createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 12),
    }))
    .catch((err) => {
      store.__traceGrants = undefined
      throw err
    })
  store.__traceGrants = { at: Date.now(), loaded }
  return loaded
}

export const getGrants = () => loadGrants().then((l) => l.rows)
export const getGrantsVersion = () => loadGrants().then((l) => l.version)

export function clearGrants() {
  store.__traceGrants = undefined
}

// A small slice for a page's server-rendered first paint: the grants that
// carry 98% of the dollars (a few thousand of the ~11k), minus the prose.
// The browser swaps in the full dataset from useGrants() moments later, so
// totals are right immediately and the long tail of small grants follows.
export function firstPaintRows(rows: GrantRow[]): GrantRow[] {
  const sorted = [...rows].sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))
  const target = 0.98 * sorted.reduce((sum, row) => sum + (row.amountUsd ?? 0), 0)
  const out: GrantRow[] = []
  for (let sum = 0; sum < target && out.length < sorted.length; ) {
    const row = sorted[out.length]
    sum += row.amountUsd ?? 0
    out.push({ ...row, description: null, url: null, estimateNote: null, round: null })
  }
  return out
}

// Approved grants tagged with a cause; 'all' returns everything.
export async function getGrantsByCause(cause: string): Promise<GrantRow[]> {
  const rows = await getGrants()
  return cause === 'all' ? rows : rows.filter((row) => row.causes.includes(cause))
}

// Every grant an org touches, by role. A regrantor shows up on several sides.
export async function getGrantsForOrg(slug: string) {
  const rows = await getGrants()
  return {
    made: rows.filter((row) => row.funderSlug === slug),
    received: rows.filter((row) => row.recipientSlug === slug),
    sponsored: rows.filter((row) => row.sponsorSlug === slug),
    via: rows.filter((row) => row.vias.some((via) => via.slug === slug)),
  }
}

// One approved grant by id, for the suggestion form.
export async function getGrantById(id: string): Promise<GrantRow | null> {
  const supabase = createPublicSupabaseClient()
  const { data } = await supabase
    .from('grants')
    .select(`${GRANT_SELECT_BASE}, grant_cause_areas(cause_areas(slug))`)
    .eq('status', 'approved')
    .eq('id', id)
    .maybeSingle()
    .throwOnError()
  return data ? mapGrantRow(data as never as Record<string, unknown>) : null
}

export type SourceInfo = {
  id: string
  name: string
  url: string | null
  license: string | null
  tier: number
  last_ingested_at: string | null
}

export async function listSources(): Promise<SourceInfo[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const { data } = await supabase
    .from('sources')
    .select('id, name, url, license, tier, last_ingested_at')
    .order('tier')
    .order('id')
    .throwOnError()
  return data ?? []
}
