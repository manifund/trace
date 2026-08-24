import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/db/database.types'
import causeAreaMap from '@/data/cause-area-map.json'
import causeTagsFile from '@/data/cause-tags.json'
import overridesFile from '@/data/overrides.json'
import { withAncestors } from './causes'
import { createAdminClient } from '@/db/supabase-admin'
import { toUsd } from './fx'
import { sha256 } from './normalize'
import { OrgResolver } from './resolve-org'

type Db = SupabaseClient<Database>
type GrantInsert = Database['public']['Tables']['grants']['Insert']
type OrgType = Database['public']['Tables']['orgs']['Row']['org_type']

const OVERRIDES: Record<string, Partial<GrantInsert>> = (
  overridesFile as never as { overrides: Record<string, Partial<GrantInsert>> }
).overrides
const MANUAL_TAGS: Record<string, string[]> = (
  causeTagsFile as never as { tags: Record<string, string[]> }
).tags
const RECIPIENT_TAGS: Record<string, string[]> = Object.fromEntries(
  Object.entries(
    (causeAreaMap as never as { recipients: Record<string, string[] | string> }).recipients
  ).filter(([slug]) => !slug.startsWith('_'))
) as Record<string, string[]>

const CHUNK = 500

export type ParsedGrant = {
  funderName: string
  funderType?: OrgType
  recipientName: string
  recipientType?: OrgType
  sponsorName?: string | null
  // Funding-side vehicles the money flowed through, outermost first
  // (e.g. ['grantmaking.ai', 'Manifund']).
  viaNames?: string[]
  amount: number | null
  // The amount is an estimate; note explains how it was derived.
  amountEstimated?: boolean
  estimateNote?: string | null
  currency?: string
  date?: string | null
  datePrecision?: 'day' | 'month' | 'year' | null
  description?: string | null
  round?: string | null
  url?: string | null
  causeSlugs: string[]
}

export type SourceRecordInput = {
  key: string
  raw: Json
  parsed: ParsedGrant
}

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function loadCauseIds(db: Db): Promise<Map<string, string>> {
  const { data } = await db.from('cause_areas').select('id, slug').throwOnError()
  return new Map((data ?? []).map((c) => [c.slug, c.id]))
}

type ExistingRecord = {
  id: string
  content_hash: string
  first_seen_at: string
  removed_at: string | null
}

async function loadExistingRecords(db: Db, sourceId: string): Promise<Map<string, ExistingRecord>> {
  const map = new Map<string, ExistingRecord>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('source_records')
      .select('id, source_record_key, content_hash, first_seen_at, removed_at')
      .eq('source_id', sourceId)
      .range(from, from + 999)
      .throwOnError()
    for (const row of data ?? []) map.set(row.source_record_key, row)
    if (!data || data.length < 1000) break
  }
  return map
}

// grant_sources rows for this source's records: record id -> {grantId, isPrimary}
async function loadGrantLinks(
  db: Db,
  sourceId: string
): Promise<Map<string, { grantId: string; isPrimary: boolean }>> {
  const map = new Map<string, { grantId: string; isPrimary: boolean }>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('grant_sources')
      .select('grant_id, source_record_id, is_primary, source_records!inner(source_id)')
      .eq('source_records.source_id', sourceId)
      .range(from, from + 999)
      .throwOnError()
    const rows = (data ?? []) as never as {
      grant_id: string
      source_record_id: string
      is_primary: boolean
    }[]
    for (const row of rows) {
      map.set(row.source_record_id, { grantId: row.grant_id, isPrimary: row.is_primary })
    }
    if (!data || data.length < 1000) break
  }
  return map
}

export async function runIngest(
  sourceId: string,
  records: SourceRecordInput[],
  opts: { tombstone?: boolean } = {}
) {
  const db = createAdminClient()
  const startedAt = new Date().toISOString()
  const resolver = await OrgResolver.load(db)
  const causeIds = await loadCauseIds(db)
  // Recipient-based cause defaults (data/cause-area-map.json "recipients"):
  // resolve the mapped slugs to org ids so grants to them can be tagged.
  const recipientTagsByOrgId = new Map<string, string[]>()
  {
    const slugs = Object.keys(RECIPIENT_TAGS)
    const { data } = await db.from('orgs').select('id, slug').in('slug', slugs).throwOnError()
    for (const org of data ?? []) recipientTagsByOrgId.set(org.id, RECIPIENT_TAGS[org.slug])
  }
  const existing = await loadExistingRecords(db, sourceId)
  const grantLinks = await loadGrantLinks(db, sourceId)

  // Dedupe keys within the batch; sources occasionally repeat rows.
  const seenKeys = new Set<string>()
  const unique: SourceRecordInput[] = []
  let batchDupes = 0
  for (const record of records) {
    if (seenKeys.has(record.key)) {
      batchDupes++
      continue
    }
    seenKeys.add(record.key)
    unique.push(record)
  }

  const now = new Date().toISOString()
  let inserted = 0
  let updated = 0
  let unchanged = 0

  type Prepared = SourceRecordInput & {
    recordId: string
    hash: string
    isNewRecord: boolean
    changed: boolean
  }
  const prepared: Prepared[] = []
  for (const record of unique) {
    const hash = await sha256(JSON.stringify(record.raw))
    const prior = existing.get(record.key)
    prepared.push({
      ...record,
      hash,
      recordId: prior?.id ?? crypto.randomUUID(),
      isNewRecord: !prior,
      changed:
        process.argv.includes('--force') ||
        !prior ||
        prior.content_hash !== hash ||
        prior.removed_at !== null ||
        // A record without a grant means an earlier run died mid-derivation.
        !grantLinks.has(prior.id),
    })
  }

  // Touch unchanged records; upsert new/changed ones.
  const unchangedIds = prepared.filter((p) => !p.changed).map((p) => p.recordId)
  for (const ids of chunks(unchangedIds)) {
    await db.from('source_records').update({ last_seen_at: now }).in('id', ids).throwOnError()
  }
  const changedRows = prepared
    .filter((p) => p.changed)
    .map((p) => ({
      id: p.recordId,
      source_id: sourceId,
      source_record_key: p.key,
      raw: p.raw,
      content_hash: p.hash,
      first_seen_at: existing.get(p.key)?.first_seen_at ?? now,
      last_seen_at: now,
      removed_at: null,
    }))
  for (const rows of chunks(changedRows)) {
    await db.from('source_records').upsert(rows).throwOnError()
  }

  // Derive grants for new/changed records. Field updates only flow through a
  // record that is (or becomes) its grant's primary source; merged-away
  // secondary records must not clobber the winning grant.
  const newGrants: GrantInsert[] = []
  const newGrantSources: { grant_id: string; source_record_id: string; is_primary: boolean }[] = []
  const grantCauses = new Map<string, string[]>()
  const grantVias = new Map<string, string[]>()
  const updatedGrants: (GrantInsert & { id: string })[] = []

  for (const p of prepared) {
    if (!p.changed) continue
    const link = grantLinks.get(p.recordId)
    if (link && !link.isPrimary) continue

    const year = p.parsed.date ? Number(p.parsed.date.slice(0, 4)) : null
    const currency = p.parsed.currency ?? 'USD'
    // Overrides may carry non-column fields: `note` (documentation) and
    // `recipient_name`/`fiscal_sponsor_name` (resolved like any source name,
    // so they survive rebuilds).
    const {
      note: _note,
      recipient_name: recipientNameOverride,
      fiscal_sponsor_name: sponsorNameOverride,
      via_names: viaNamesOverride,
      ...fieldOverrides
    } = (OVERRIDES[`${sourceId}:${p.key}`] ??
      // Project-level fallback, mirroring MANUAL_TAGS: applies to every
      // sub-record of a key like `<projectId>:<donor>`.
      OVERRIDES[`${sourceId}:${p.key.split(':')[0]}`] ??
      {}) as Partial<GrantInsert> & {
      note?: string
      recipient_name?: string
      fiscal_sponsor_name?: string
      via_names?: string[]
    }
    const base: GrantInsert = {
      funder_org_id: await resolver.resolve(p.parsed.funderName, p.parsed.funderType),
      recipient_org_id: await resolver.resolve(
        recipientNameOverride ?? p.parsed.recipientName,
        recipientNameOverride ? 'organization' : p.parsed.recipientType
      ),
      fiscal_sponsor_org_id:
        (sponsorNameOverride ?? p.parsed.sponsorName)
          ? await resolver.resolve((sponsorNameOverride ?? p.parsed.sponsorName) as string)
          : null,
      amount: p.parsed.amount,
      currency,
      amount_usd: p.parsed.amount === null ? null : toUsd(p.parsed.amount, currency, year),
      amount_estimated: p.parsed.amountEstimated ?? false,
      estimate_note: p.parsed.estimateNote ?? null,
      grant_date: p.parsed.date ?? null,
      date_precision: p.parsed.date ? (p.parsed.datePrecision ?? 'day') : null,
      description: p.parsed.description ?? null,
      round: p.parsed.round ?? null,
      url: p.parsed.url ?? null,
      status: 'approved',
      updated_at: now,
      ...fieldOverrides,
    }

    // "Sponsored by itself" (name-variant noise in the source) is not
    // information — drop it.
    if (base.fiscal_sponsor_org_id === base.recipient_org_id) base.fiscal_sponsor_org_id = null

    const grantId = link?.grantId ?? crypto.randomUUID()
    // Manual tags are authoritative: they replace the classifier's output
    // (closed over ancestors), so they can also correct false positives.
    // Keys with a suffix (manifund's "projectId:donor") also match their
    // prefix, so one entry can cover every donor to a project.
    const manualTags =
      MANUAL_TAGS[`${sourceId}:${p.key}`] ?? MANUAL_TAGS[`${sourceId}:${p.key.split(':')[0]}`]
    // Recipient-based default: for orgs whose work is single-cause, the
    // recipient determines the tag better than the grant text does.
    const recipientTags = base.recipient_org_id
      ? recipientTagsByOrgId.get(base.recipient_org_id)
      : undefined
    // Always close tags over ancestors so filtering works at any level.
    grantCauses.set(grantId, withAncestors(manualTags ?? recipientTags ?? p.parsed.causeSlugs))

    const viaIds: string[] = []
    for (const viaName of viaNamesOverride ?? p.parsed.viaNames ?? []) {
      viaIds.push(await resolver.resolve(viaName, 'fund'))
    }
    grantVias.set(grantId, Array.from(new Set(viaIds)))
    if (link) {
      updatedGrants.push({ ...base, id: grantId })
      updated++
    } else {
      newGrants.push({ ...base, id: grantId })
      newGrantSources.push({ grant_id: grantId, source_record_id: p.recordId, is_primary: true })
      inserted++
    }
  }
  unchanged = prepared.length - inserted - updated

  for (const rows of chunks(newGrants)) {
    await db.from('grants').insert(rows).throwOnError()
  }
  for (const rows of chunks(updatedGrants)) {
    await db.from('grants').upsert(rows).throwOnError()
  }
  for (const rows of chunks(newGrantSources)) {
    await db.from('grant_sources').insert(rows).throwOnError()
  }

  const causeRows = Array.from(grantCauses.entries()).flatMap(([grantId, slugs]) =>
    slugs.map((slug) => {
      const causeId = causeIds.get(slug)
      if (!causeId) throw new Error(`Unknown cause slug '${slug}' — seed cause_areas first`)
      return { grant_id: grantId, cause_area_id: causeId }
    })
  )
  const updatedGrantIds = updatedGrants.map((g) => g.id)
  for (const ids of chunks(updatedGrantIds)) {
    await db.from('grant_cause_areas').delete().in('grant_id', ids).throwOnError()
  }
  for (const rows of chunks(causeRows)) {
    await db.from('grant_cause_areas').insert(rows).throwOnError()
  }

  const viaRows = Array.from(grantVias.entries()).flatMap(([grantId, orgIds]) =>
    orgIds.map((orgId) => ({ grant_id: grantId, via_org_id: orgId }))
  )
  for (const ids of chunks(updatedGrantIds)) {
    await db.from('grant_vias').delete().in('grant_id', ids).throwOnError()
  }
  for (const rows of chunks(viaRows)) {
    await db.from('grant_vias').insert(rows).throwOnError()
  }

  // Tombstone records the source no longer returns, and reject their grants.
  let removed = 0
  if (opts.tombstone !== false) {
    const missing = Array.from(existing.entries()).filter(
      ([key, row]) => !seenKeys.has(key) && row.removed_at === null
    )
    removed = missing.length
    const missingIds = missing.map(([, row]) => row.id)
    for (const ids of chunks(missingIds)) {
      await db.from('source_records').update({ removed_at: now }).in('id', ids).throwOnError()
    }
    const rejectGrantIds = missingIds
      .map((id) => grantLinks.get(id))
      .filter((link): link is { grantId: string; isPrimary: boolean } => Boolean(link?.isPrimary))
      .map((link) => link.grantId)
    for (const ids of chunks(rejectGrantIds)) {
      await db
        .from('grants')
        .update({ status: 'rejected', updated_at: now })
        .in('id', ids)
        .throwOnError()
    }
  }

  await db.from('sources').update({ last_ingested_at: startedAt }).eq('id', sourceId).throwOnError()

  const summary = {
    source: sourceId,
    fetched: records.length,
    batchDupes,
    inserted,
    updated,
    unchanged,
    removed,
    newOrgs: resolver.createdNames.length,
  }
  console.log(JSON.stringify(summary))
  if (resolver.createdNames.length > 0) {
    console.log(`New orgs (needs_review): ${resolver.createdNames.slice(0, 20).join('; ')}`)
    if (resolver.createdNames.length > 20) {
      console.log(`...and ${resolver.createdNames.length - 20} more (bun run report-unmatched)`)
    }
  }
  return summary
}
