// Loads data/teams/<slug>.json (leadership and staff as listed on each org's
// website) into org_teams and org_people. Files are keyed by org slug and
// must name an existing org; people are matched by normalized name to any
// existing org so a staff member with a Trace page gets linked, never
// auto-created. Re-running replaces an org's rows.
// Usage: bun run scripts/ingest-teams.ts [slug]
import { readdirSync, readFileSync } from 'node:fs'
import { createAdminClient } from '@/db/supabase-admin'
import { normalizeName } from './lib/normalize'

type TeamFile = {
  slug: string
  sourceUrl?: string | null
  checkedAt: string
  headcount?: number | null
  headcountNote?: string | null
  people: { name: string; title?: string | null; leadership?: boolean }[]
}

const only = process.argv[2]
const db = createAdminClient()

// normalized name -> org id. Org type is not a reliable "is a person" signal
// (ingesters default to organization), so any org whose name matches a
// staff member's exactly counts; people's names rarely collide with orgs'.
const byName = new Map<string, string>()
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from('org_names')
    .select('normalized, org_id')
    .range(from, from + 999)
    .throwOnError()
  for (const row of data ?? []) byName.set(row.normalized, row.org_id)
  if (!data || data.length < 1000) break
}

let files = 0
let people = 0
let linked = 0
for (const name of readdirSync('data/teams').sort()) {
  if (!name.endsWith('.json')) continue
  const team = JSON.parse(readFileSync(`data/teams/${name}`, 'utf8')) as TeamFile
  if (only && team.slug !== only) continue
  if (name !== `${team.slug}.json`)
    throw new Error(`${name}: slug "${team.slug}" does not match file name`)
  const { data: org } = await db
    .from('orgs')
    .select('id')
    .eq('slug', team.slug)
    .maybeSingle()
    .throwOnError()
  if (!org) throw new Error(`${name}: no org with slug "${team.slug}"`)

  await db
    .from('org_teams')
    .upsert(
      {
        org_id: org.id,
        headcount: team.headcount ?? null,
        headcount_note: team.headcountNote ?? null,
        source_url: team.sourceUrl ?? null,
        checked_at: team.checkedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )
    .throwOnError()

  const seen = new Set<string>()
  const rows = team.people
    .filter((p) => {
      const key = normalizeName(p.name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((p, i) => {
      const personId = byName.get(normalizeName(p.name)) ?? null
      if (personId) linked++
      return {
        org_id: org.id,
        name: p.name.trim(),
        title: p.title?.trim() || null,
        leadership: p.leadership ?? false,
        person_org_id: personId,
        sort_order: i,
      }
    })
  await db.from('org_people').delete().eq('org_id', org.id).throwOnError()
  if (rows.length > 0) await db.from('org_people').insert(rows).throwOnError()
  files++
  people += rows.length
}
console.log(JSON.stringify({ orgs: files, people, linkedToTracePages: linked }))
