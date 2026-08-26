import 'server-only'

import { createHash } from 'node:crypto'
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'
import { revalidateTag, unstable_cache } from 'next/cache'
import { dbConfigured, type GrantRow, type SourceInfo } from './grant'
import { createPublicSupabaseClient } from './supabase-server'
import { expandGrants, type GrantTuple, type Snapshot } from '@/utils/snapshot'

export const SNAPSHOT_TAG = 'snapshot'
const SNAPSHOT_TTL_SECONDS = 600

// Fetch every 1000-row page of a table, all pages in parallel. Flat selects
// are cheap enough (~160ms a page) that parallelism doesn't trip statement
// timeouts the way the old six-embed query did.
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>,
  count: () => PromiseLike<{ count: number | null }>
): Promise<T[]> {
  const { count: total } = await count()
  const pages = Math.ceil((total ?? 0) / 1000)
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) => build(i * 1000, i * 1000 + 999))
  )
  return results.flatMap((r) => (r.data ?? []) as T[])
}

type GrantRowDb = {
  id: string
  amount: number | null
  currency: string
  amount_usd: number | null
  amount_estimated: boolean | null
  estimate_note: string | null
  grant_date: string | null
  date_precision: GrantRow['datePrecision']
  description: string | null
  round: string | null
  url: string | null
  funder_org_id: string
  recipient_org_id: string
  fiscal_sponsor_org_id: string | null
}

// Short ids: the 8 hex chars before the UUID's first dash. A prefix that
// collides is extended two chars at a time until unique, so a collision
// changes one row's id rather than the scheme. Resolution is prefix-based
// either way (see getGrantById).
function shortIds(uuids: string[]): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set<string>()
  const hex = uuids.map((u) => u.replace(/-/g, ''))
  for (let len = 8; hex.length > 0 && len <= 32; len += 2) {
    const counts = new Map<string, number>()
    for (const h of hex) counts.set(h.slice(0, len), (counts.get(h.slice(0, len)) ?? 0) + 1)
    const rest: string[] = []
    for (const h of hex) {
      const short = h.slice(0, len)
      if (counts.get(short) === 1 && !taken.has(short)) {
        out.set(h, short)
        taken.add(short)
      } else rest.push(h)
    }
    hex.splice(0, hex.length, ...rest)
  }
  return new Map(uuids.map((u) => [u, out.get(u.replace(/-/g, ''))!]))
}

// One pass over the flat tables, joined in memory. ~1.4s against the hosted
// project; called once per cache window, never per page.
export async function buildSnapshot(): Promise<Snapshot> {
  const db = createPublicSupabaseClient()
  const approved = () =>
    db.from('grants').select('*', { count: 'exact', head: true }).eq('status', 'approved')
  const all = <T>(table: string, cols: string) =>
    fetchAll<T>(
      (from, to) =>
        db
          .from(table as 'grants')
          .select(cols)
          .range(from, to)
          .throwOnError(),
      () =>
        db
          .from(table as 'grants')
          .select('*', { count: 'exact', head: true })
          .throwOnError()
    )
  const [grants, orgs, orgNames, causes, grantCauses, grantVias, grantSources, sources] =
    await Promise.all([
      fetchAll<GrantRowDb>(
        (from, to) =>
          db
            .from('grants')
            .select(
              'id, amount, currency, amount_usd, amount_estimated, estimate_note, grant_date, date_precision, description, round, url, funder_org_id, recipient_org_id, fiscal_sponsor_org_id'
            )
            .eq('status', 'approved')
            .range(from, to)
            .throwOnError(),
        () => approved().throwOnError()
      ),
      all<{ id: string; slug: string; name: string; org_type: string; website: string | null }>(
        'orgs',
        'id, slug, name, org_type, website'
      ),
      all<{
        name: string
        org_id: string
        kind: string
        valid_from: string | null
        valid_to: string | null
      }>('org_names', 'name, org_id, kind, valid_from, valid_to'),
      all<{ id: string; slug: string }>('cause_areas', 'id, slug'),
      all<{ grant_id: string; cause_area_id: string }>(
        'grant_cause_areas',
        'grant_id, cause_area_id'
      ),
      all<{ grant_id: string; via_org_id: string }>('grant_vias', 'grant_id, via_org_id'),
      fetchAll<{ grant_id: string; source_records: { source_id: string } | null }>(
        (from, to) =>
          db
            .from('grant_sources')
            .select('grant_id, source_records(source_id)')
            .eq('is_primary', true)
            .range(from, to)
            .throwOnError(),
        () =>
          db
            .from('grant_sources')
            .select('*', { count: 'exact', head: true })
            .eq('is_primary', true)
            .throwOnError()
      ),
      all<SourceInfo>('sources', 'id, name, url, license, tier, last_ingested_at'),
    ])

  // Only orgs a grant references: the dictionary is a fifth of the file.
  const referenced = new Set<string>()
  for (const g of grants) {
    referenced.add(g.funder_org_id)
    referenced.add(g.recipient_org_id)
    if (g.fiscal_sponsor_org_id) referenced.add(g.fiscal_sponsor_org_id)
  }
  for (const v of grantVias) referenced.add(v.via_org_id)
  const usedOrgs = orgs
    .filter((o) => referenced.has(o.id))
    .sort((a, b) => a.slug.localeCompare(b.slug))
  const orgIdx = new Map(usedOrgs.map((o, i) => [o.id, i]))
  const causeList = causes.map((c) => c.slug).sort()
  const causeIdx = new Map(causes.map((c) => [c.id, causeList.indexOf(c.slug)]))
  sources.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id))
  const sourceIdx = new Map(sources.map((s, i) => [s.id, i]))

  const group = <T>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, T[]>()
    for (const r of rows) {
      const k = key(r)
      const list = m.get(k)
      if (list) list.push(r)
      else m.set(k, [r])
    }
    return m
  }
  const causesBy = group(grantCauses, (r) => r.grant_id)
  const viasBy = group(grantVias, (r) => r.grant_id)
  const sourceBy = new Map(grantSources.map((r) => [r.grant_id, r.source_records?.source_id]))

  // Same order the PostgREST path used: newest first, id as tiebreak.
  grants.sort(
    (a, b) => (b.grant_date ?? '').localeCompare(a.grant_date ?? '') || a.id.localeCompare(b.id)
  )
  const ids = shortIds(grants.map((g) => g.id))
  const tuples: GrantTuple[] = grants.map((g) => [
    ids.get(g.id)!,
    g.grant_date,
    g.date_precision,
    g.amount,
    g.currency === 'USD' ? 0 : g.currency,
    g.amount_usd,
    g.amount_estimated ? 1 : 0,
    g.estimate_note,
    g.description,
    g.round,
    g.url,
    orgIdx.get(g.funder_org_id)!,
    orgIdx.get(g.recipient_org_id)!,
    g.fiscal_sponsor_org_id ? (orgIdx.get(g.fiscal_sponsor_org_id) ?? null) : null,
    (viasBy.get(g.id) ?? []).map((v) => orgIdx.get(v.via_org_id)!),
    sourceIdx.get(sourceBy.get(g.id) ?? '') ?? null,
    (causesBy.get(g.id) ?? []).map((c) => causeIdx.get(c.cause_area_id)!).sort((a, b) => a - b),
  ])

  const names: Snapshot['names'] = []
  for (const n of orgNames) {
    const i = orgIdx.get(n.org_id)
    if (i !== undefined && n.kind !== 'canonical')
      names.push([n.name, i, n.kind, n.valid_from, n.valid_to])
  }

  const body = {
    orgs: usedOrgs.map((o): Snapshot['orgs'][number] => [o.slug, o.name, o.org_type, o.website]),
    names,
    causes: causeList,
    sources,
    grants: tuples,
  }
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12)
  return { version, builtAt: new Date().toISOString(), ...body }
}

// The Data Cache caps entries at 2MB and the raw JSON is 2.6MB, so the cached
// form is the brotli bytes (~375KB) as base64. That is also exactly what the
// /snapshot route serves, so the bytes are compressed once per build.
const cachedBrotli = unstable_cache(
  async (): Promise<{ version: string; br: string }> => {
    const snapshot = await buildSnapshot()
    const br = brotliCompressSync(JSON.stringify(snapshot), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    })
    return { version: snapshot.version, br: br.toString('base64') }
  },
  ['trace-snapshot'],
  { tags: [SNAPSHOT_TAG], revalidate: SNAPSHOT_TTL_SECONDS }
)

// Per-process memo so a lambda serving many renders decodes once per version.
let expanded: { version: string; snapshot: Snapshot; grants: GrantRow[] } | null = null

const EMPTY: Snapshot = {
  version: 'empty',
  builtAt: '',
  orgs: [],
  names: [],
  causes: [],
  sources: [],
  grants: [],
}

export async function getSnapshotBytes(): Promise<{ version: string; br: Buffer } | null> {
  if (!dbConfigured()) return null
  const { version, br } = await cachedBrotli()
  return { version, br: Buffer.from(br, 'base64') }
}

export async function getSnapshot(): Promise<Snapshot> {
  const bytes = await getSnapshotBytes()
  if (!bytes) return EMPTY
  if (expanded?.version !== bytes.version) {
    const snapshot = JSON.parse(brotliDecompressSync(bytes.br).toString()) as Snapshot
    expanded = { version: snapshot.version, snapshot, grants: expandGrants(snapshot) }
  }
  return expanded.snapshot
}

export async function getSnapshotGrants(): Promise<GrantRow[]> {
  await getSnapshot()
  return expanded?.grants ?? []
}

// Call after anything that writes grants: the next read rebuilds.
export function invalidateSnapshot() {
  revalidateTag(SNAPSHOT_TAG, 'max')
  expanded = null
}
