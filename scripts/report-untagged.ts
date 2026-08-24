// Lists approved grants tagged 'other' ranked by USD, grouped by primary
// source. 'other' is the classifier's last resort, so a high-dollar entry
// here usually means a new source or recipient the tagging layers don't
// cover yet. Feed fixes back into data/cause-tags.json (per grant), the
// "recipients" map in data/cause-area-map.json (per org), or its "funds"
// defaults (per source), then re-ingest with --force.
import { createAdminClient } from '@/db/supabase-admin'

const db = createAdminClient()

async function main() {
  const { data: cause } = await db
    .from('cause_areas')
    .select('id')
    .eq('slug', 'other')
    .single()
    .throwOnError()

  const grantIds: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('grant_cause_areas')
      .select('grant_id')
      .eq('cause_area_id', cause!.id)
      .range(from, from + 999)
      .throwOnError()
    grantIds.push(...(data ?? []).map((row) => row.grant_id))
    if (!data || data.length < 1000) break
  }

  type Row = {
    usd: number
    source: string
    funder: string
    recipient: string
    description: string
  }
  const rows: Row[] = []
  for (let from = 0; from < grantIds.length; from += 100) {
    const { data } = await db
      .from('grants')
      .select(
        'status, amount_usd, description, round, funder:funder_org_id(name), recipient:recipient_org_id(name), grant_sources(is_primary, source_records(source_id))'
      )
      .in('id', grantIds.slice(from, from + 100))
      .throwOnError()
    type GrantRow = {
      status: string
      amount_usd: number | null
      description: string | null
      round: string | null
      funder: { name: string }
      recipient: { name: string }
      grant_sources: { is_primary: boolean; source_records: { source_id: string } }[]
    }
    for (const grant of (data ?? []) as never as GrantRow[]) {
      if (grant.status !== 'approved') continue
      rows.push({
        usd: grant.amount_usd ?? 0,
        source: grant.grant_sources.find((s) => s.is_primary)?.source_records.source_id ?? '?',
        funder: grant.funder.name,
        recipient: grant.recipient.name,
        description: grant.description ?? grant.round ?? '',
      })
    }
  }

  const bySource = new Map<string, { count: number; usd: number }>()
  for (const row of rows) {
    const entry = bySource.get(row.source) ?? { count: 0, usd: 0 }
    entry.count++
    entry.usd += row.usd
    bySource.set(row.source, entry)
  }
  console.log(`${rows.length} approved grants tagged 'other'\n`)
  for (const [source, entry] of Array.from(bySource).sort((a, b) => b[1].usd - a[1].usd)) {
    console.log(
      `$${Math.round(entry.usd).toLocaleString()}`.padStart(14) +
        `  ${String(entry.count).padStart(4)} grants  ${source}`
    )
  }

  const limit = Number(process.argv[2] ?? 40)
  console.log(`\ntop ${limit} by USD:\n`)
  rows.sort((a, b) => b.usd - a.usd)
  for (const row of rows.slice(0, limit)) {
    console.log(
      `$${Math.round(row.usd).toLocaleString()}`.padStart(14) +
        `  [${row.source}] ${row.funder} -> ${row.recipient} | ${row.description.slice(0, 80)}`
    )
  }
}

await main()
