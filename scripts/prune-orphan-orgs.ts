// Deletes orgs nothing refers to: no grant in any role or status, no via
// row, no review, no team, no staff link, and not seeded. They are left
// behind when an override or alias moves an auto-created org's only grant
// elsewhere, and show up only as search suggestions. A rebuild would not
// recreate them, so deleting is durable; their slugs are also dropped from
// reviewed-orgs.json, which only ever confirmed the name.
// Usage: bun run scripts/prune-orphan-orgs.ts [--apply]
import { readFileSync, writeFileSync } from 'node:fs'
import orgsSeed from '@/data/orgs-seed.json'
import { createAdminClient } from '@/db/supabase-admin'

const apply = process.argv.includes('--apply')
const db = createAdminClient()

const referenced = new Set<string>()
async function collect(table: string, columns: string[]) {
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from(table as 'grants')
      .select(columns.join(', '))
      .range(from, from + 999)
      .throwOnError()
    for (const row of (data ?? []) as never as Record<string, string | null>[]) {
      for (const column of columns) if (row[column]) referenced.add(row[column] as string)
    }
    if (!data || data.length < 1000) break
  }
}
await collect('grants', ['funder_org_id', 'recipient_org_id', 'fiscal_sponsor_org_id'])
await collect('grant_vias', ['via_org_id'])
await collect('org_reviews', ['org_id'])
await collect('org_teams', ['org_id'])
await collect('org_people', ['org_id', 'person_org_id'])

const curated = new Set((orgsSeed as never as { orgs: { slug: string }[] }).orgs.map((o) => o.slug))

const orphans: { id: string; slug: string; name: string }[] = []
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from('orgs')
    .select('id, slug, name')
    .range(from, from + 999)
    .throwOnError()
  for (const org of data ?? []) {
    if (!referenced.has(org.id) && !curated.has(org.slug)) orphans.push(org)
  }
  if (!data || data.length < 1000) break
}
orphans.sort((a, b) => a.slug.localeCompare(b.slug))
for (const org of orphans) console.log(`${org.slug}  (${org.name})`)
console.log(`${orphans.length} orphan org(s)${apply ? '' : '; pass --apply to delete'}`)

if (apply && orphans.length > 0) {
  const ids = orphans.map((o) => o.id)
  for (let from = 0; from < ids.length; from += 200) {
    const batch = ids.slice(from, from + 200)
    await db.from('org_names').delete().in('org_id', batch).throwOnError()
    await db.from('orgs').delete().in('id', batch).throwOnError()
  }
  const reviewedPath = 'data/reviewed-orgs.json'
  const reviewed = JSON.parse(readFileSync(reviewedPath, 'utf8')) as { slugs: string[] }
  const gone = new Set(orphans.map((o) => o.slug))
  const kept = reviewed.slugs.filter((slug) => !gone.has(slug))
  if (kept.length !== reviewed.slugs.length) {
    writeFileSync(reviewedPath, JSON.stringify({ ...reviewed, slugs: kept }, null, 2) + '\n')
    console.log(`Dropped ${reviewed.slugs.length - kept.length} slug(s) from reviewed-orgs.json`)
  }
  console.log(`Deleted ${orphans.length}`)
}
