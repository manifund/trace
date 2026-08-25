// Mirrors accepted community suggestions into the checked-in data files, so
// the database can always be rebuilt from the repo:
//   * added grants  -> data/curated/community.json (source `community`)
//   * edits         -> data/overrides.json, keyed by the grant's provenance
// Accepting a suggestion in the app writes it to the database immediately;
// this makes that change reproducible. Run it after reviewing, commit the
// result, then `bun run scripts/ingest-curated.ts community --force`.
import { readFileSync, writeFileSync } from 'fs'
import { createAdminClient } from '@/db/supabase-admin'
import { sha256 } from './lib/normalize'

const db = createAdminClient()

type Payload = Record<string, string>

function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null
  const value = Number(raw.replace(/[$,\s]/g, ''))
  return Number.isFinite(value) ? value : null
}

async function main() {
  const { data: suggestions } = await db
    .from('suggestions')
    .select('*')
    .eq('status', 'accepted')
    .order('created_at')
    .throwOnError()

  const communityPath = 'data/curated/community.json'
  const community = JSON.parse(readFileSync(communityPath, 'utf8')) as {
    _comment: string
    grants: Record<string, unknown>[]
  }
  const overridesPath = 'data/overrides.json'
  const overridesDoc = JSON.parse(readFileSync(overridesPath, 'utf8')) as {
    overrides: Record<string, Record<string, unknown>>
  }

  const byKey = new Map(community.grants.map((row) => [row.key as string, row]))
  let added = 0
  let edited = 0
  let skipped = 0

  for (const suggestion of suggestions ?? []) {
    const payload = (suggestion.payload ?? {}) as Payload
    const credit = `Community suggestion${suggestion.user_email ? ` from ${suggestion.user_email}` : ''}${
      suggestion.reviewer ? `, accepted by ${suggestion.reviewer}` : ''
    }.`

    if (suggestion.kind === 'new') {
      const key = await sha256(`suggestion:${suggestion.id}`)
      byKey.set(key, {
        key,
        recipient: payload.recipient_name ?? '',
        funder: payload.funder_name ?? 'Undisclosed',
        amount: parseAmount(payload.amount_usd),
        currency: 'USD',
        date: payload.grant_date ?? null,
        description: payload.description ?? null,
        sourceUrl: payload.url ?? suggestion.source_url ?? null,
        note: [credit, suggestion.comment].filter(Boolean).join(' '),
      })
      added++
      continue
    }

    // Edits need the grant's provenance key so the override survives a rebuild.
    if (!suggestion.grant_id) {
      skipped++
      continue
    }
    const { data: links } = await db
      .from('grant_sources')
      .select('is_primary, source_records(source_id, source_record_key)')
      .eq('grant_id', suggestion.grant_id)
      .throwOnError()
    type Link = {
      is_primary: boolean
      source_records: { source_id: string; source_record_key: string }
    }
    const primary = ((links ?? []) as never as Link[]).find((l) => l.is_primary)
    if (!primary) {
      skipped++
      continue
    }
    const provenance = `${primary.source_records.source_id}:${primary.source_records.source_record_key}`
    const patch: Record<string, unknown> = { ...(overridesDoc.overrides[provenance] ?? {}) }
    if (payload.funder_name) patch.funder_name = payload.funder_name
    if (payload.recipient_name) patch.recipient_name = payload.recipient_name
    if (payload.description) patch.description = payload.description
    if (payload.url) patch.url = payload.url
    const amount = parseAmount(payload.amount_usd)
    if (amount !== null) {
      patch.amount = amount
      patch.amount_usd = amount
      patch.currency = 'USD'
    }
    if (payload.grant_date) {
      const value = payload.grant_date.trim()
      if (/^\d{4}$/.test(value)) {
        patch.grant_date = `${value}-01-01`
        patch.date_precision = 'year'
      } else if (/^\d{4}-\d{2}$/.test(value)) {
        patch.grant_date = `${value}-01`
        patch.date_precision = 'month'
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        patch.grant_date = value
        patch.date_precision = 'day'
      }
    }
    patch.note = [patch.note, credit].filter(Boolean).join(' ')
    overridesDoc.overrides[provenance] = patch
    edited++
  }

  community.grants = Array.from(byKey.values())
  writeFileSync(communityPath, JSON.stringify(community, null, 2) + '\n')
  overridesDoc.overrides = Object.fromEntries(
    Object.entries(overridesDoc.overrides).sort(([a], [b]) => a.localeCompare(b))
  )
  writeFileSync(overridesPath, JSON.stringify(overridesDoc, null, 2) + '\n')
  console.log(
    `${added} added grants in ${communityPath}, ${edited} edits in ${overridesPath}${
      skipped ? `, ${skipped} skipped (no grant to attach to)` : ''
    }`
  )
}

await main()
