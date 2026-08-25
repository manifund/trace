import 'server-only'

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

// Loads approved grants with org + provenance joins, batching past the
// PostgREST 1000-row cap. cause === 'all' skips the cause filter.
export async function listGrants(cause?: string): Promise<GrantRow[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const rows: GrantRow[] = []
  const causeFilter = cause && cause !== 'all'
  // The filter needs its own aliased embed: filtering the display embed would
  // strip every cause row except the matched one.
  const causeEmbed = causeFilter
    ? 'grant_cause_areas(cause_areas(slug)), cause_filter:grant_cause_areas!inner(cause_areas!inner(slug))'
    : 'grant_cause_areas(cause_areas(slug))'

  // Count first, then fetch every 1000-row page in parallel: sequential
  // paging was the dominant latency on pages that need the full table.
  let countQuery = supabase
    .from('grants')
    .select(
      causeFilter ? 'id, cause_filter:grant_cause_areas!inner(cause_areas!inner(slug))' : 'id',
      { count: 'exact', head: true }
    )
    .eq('status', 'approved')
  if (causeFilter) countQuery = countQuery.eq('cause_filter.cause_areas.slug', cause)
  const { count } = await countQuery.throwOnError()
  const pages = Math.ceil((count ?? 0) / 1000)

  const fetchPage = (page: number) => {
    let query = supabase
      .from('grants')
      .select(`${GRANT_SELECT_BASE}, ${causeEmbed}`)
      .eq('status', 'approved')
      .order('grant_date', { ascending: false, nullsFirst: false })
      .order('id')
      .range(page * 1000, page * 1000 + 999)
    if (causeFilter) query = query.eq('cause_filter.cause_areas.slug', cause)
    return query.throwOnError()
  }
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

// Fetch every 1000-row page of a query. Pages go out in small parallel
// batches: sequential round-trips dominate the wait for a big funder, while
// full parallelism trips Postgres statement timeouts.
async function collectPages(
  count: number,
  fetchPage: (page: number) => PromiseLike<{ data: unknown[] | null }>
): Promise<GrantRow[]> {
  const rows: GrantRow[] = []
  const pages = Math.max(1, Math.ceil(count / 1000))
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

// Approved grants that flowed through the given vehicle org.
export async function listGrantsByVia(orgId: string): Promise<GrantRow[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const select = `${GRANT_SELECT_BASE}, grant_cause_areas(cause_areas(slug)), via_filter:grant_vias!inner(via_org_id)`
  const { count } = await supabase
    .from('grants')
    .select('id, via_filter:grant_vias!inner(via_org_id)', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq('via_filter.via_org_id', orgId)
    .throwOnError()
  const fetchPage = (page: number) =>
    supabase
      .from('grants')
      .select(select)
      .eq('status', 'approved')
      .eq('via_filter.via_org_id', orgId)
      .order('grant_date', { ascending: false, nullsFirst: false })
      .order('id')
      .range(page * 1000, page * 1000 + 999)
      .throwOnError()
  return collectPages(count ?? 0, fetchPage)
}

// Approved grants where the org appears on the given side.
export async function listGrantsByOrg(
  column: 'funder_org_id' | 'recipient_org_id' | 'fiscal_sponsor_org_id',
  orgId: string
): Promise<GrantRow[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const { count } = await supabase
    .from('grants')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq(column, orgId)
    .throwOnError()
  const fetchPage = (page: number) =>
    supabase
      .from('grants')
      .select(`${GRANT_SELECT_BASE}, grant_cause_areas(cause_areas(slug))`)
      .eq('status', 'approved')
      .eq(column, orgId)
      .order('grant_date', { ascending: false, nullsFirst: false })
      .order('id')
      .range(page * 1000, page * 1000 + 999)
      .throwOnError()
  return collectPages(count ?? 0, fetchPage)
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

export async function grantYearRange(): Promise<{ min: number; max: number }> {
  const fallback = { min: 2012, max: new Date().getFullYear() }
  if (!dbConfigured()) return fallback
  const supabase = createPublicSupabaseClient()
  const edge = async (ascending: boolean) => {
    const { data } = await supabase
      .from('grants')
      .select('grant_date')
      .eq('status', 'approved')
      .not('grant_date', 'is', null)
      .order('grant_date', { ascending })
      .limit(1)
      .throwOnError()
    return data?.[0]?.grant_date ? Number(data[0].grant_date.slice(0, 4)) : null
  }
  const [min, max] = await Promise.all([edge(true), edge(false)])
  return { min: min ?? fallback.min, max: max ?? fallback.max }
}

export async function listCauseAreas() {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const { data } = await supabase.from('cause_areas').select('slug, name').throwOnError()
  return data ?? []
}
