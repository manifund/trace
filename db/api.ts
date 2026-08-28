import 'server-only'

// Shared query + serialization layer for the public API and MCP endpoints.
import { getGrantsByCause, type GrantRow } from './grant'
import { applyFilters, filtersFromParams } from '@/utils/grant-filters'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function serializeGrant(row: GrantRow) {
  return {
    id: row.id,
    date: row.date,
    date_precision: row.datePrecision,
    amount: row.amount,
    currency: row.currency,
    amount_usd: row.amountUsd,
    amount_estimated: row.amountEstimated,
    estimate_note: row.estimateNote,
    funder: { slug: row.funderSlug, name: row.funderName },
    recipient: { slug: row.recipientSlug, name: row.recipientName },
    fiscal_sponsor:
      row.sponsorSlug && row.sponsorName ? { slug: row.sponsorSlug, name: row.sponsorName } : null,
    vias: row.vias,
    causes: row.causes,
    purpose: row.description,
    round: row.round,
    source: row.sourceId,
    source_url: row.url,
  }
}

export type GrantQuery = {
  cause?: string
  q?: string
  funders?: string[]
  recipients?: string[]
  vias?: string[]
  sources?: string[]
  yearMin?: number | null
  yearMax?: number | null
  amountMin?: number | null
  amountMax?: number | null
  sort?: 'date' | 'amount' | 'funder' | 'recipient'
  dir?: 'asc' | 'desc'
}

const matchOrg = (needle: string, slug: string, name: string) => {
  const n = needle.toLowerCase()
  return slug === n || name.toLowerCase().includes(n)
}

// Accepts slugs or (partial) names for org-side filters so both the REST API
// and MCP tools can pass through what they were given.
export async function queryGrants(query: GrantQuery): Promise<GrantRow[]> {
  const rows = await getGrantsByCause(query.cause || 'all')
  let out = applyFilters(rows, {
    q: query.q ?? '',
    funders: [],
    recipients: [],
    sources: query.sources ?? [],
    yearMin: query.yearMin ?? null,
    amountMin: query.amountMin ?? null,
    amountMax: query.amountMax ?? null,
    yearMax: query.yearMax ?? null,
    sort: query.sort ?? 'date',
    dir: query.dir ?? 'desc',
  })
  for (const funder of query.funders ?? []) {
    out = out.filter((row) => matchOrg(funder, row.funderSlug, row.funderName))
  }
  for (const recipient of query.recipients ?? []) {
    out = out.filter((row) => matchOrg(recipient, row.recipientSlug, row.recipientName))
  }
  for (const via of query.vias ?? []) {
    out = out.filter((row) => row.vias.some((v) => matchOrg(via, v.slug, v.name)))
  }
  return out
}

export function grantQueryFromParams(params: URLSearchParams): GrantQuery {
  const filters = filtersFromParams(params)
  const list = (key: string) => params.get(key)?.split(',').filter(Boolean) ?? []
  return {
    cause: params.get('cause') ?? 'all',
    q: filters.q,
    funders: list('funders'),
    recipients: list('recipients'),
    vias: list('vias'),
    sources: filters.sources,
    yearMin: filters.yearMin,
    yearMax: filters.yearMax,
    amountMin: filters.amountMin,
    amountMax: filters.amountMax,
    sort: filters.sort,
    dir: filters.dir,
  }
}
