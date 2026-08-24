// Lists auto-created (needs_review) orgs ranked by total grant USD touched,
// with same-word suggestions against curated orgs. Feed decisions back into
// data/aliases.json (raw name -> canonical slug) and re-run `bun run seed`.
import { createAdminClient } from '@/db/supabase-admin'

const db = createAdminClient()

const STOPWORDS = new Set(['the', 'of', 'for', 'and', 'fund', 'foundation', 'institute', 'inc'])

async function main() {
  const orgs: { id: string; slug: string; name: string; needs_review: boolean }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('orgs')
      .select('id, slug, name, needs_review')
      .range(from, from + 999)
      .throwOnError()
    orgs.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const curated = orgs.filter((org) => !org.needs_review)
  const review = orgs.filter((org) => org.needs_review)

  const totals = new Map<string, { count: number; usd: number }>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('grants')
      .select('funder_org_id, recipient_org_id, amount_usd, status')
      .eq('status', 'approved')
      .range(from, from + 999)
      .throwOnError()
    for (const grant of data ?? []) {
      for (const orgId of [grant.funder_org_id, grant.recipient_org_id]) {
        const entry = totals.get(orgId) ?? { count: 0, usd: 0 }
        entry.count++
        entry.usd += grant.amount_usd ?? 0
        totals.set(orgId, entry)
      }
    }
    if (!data || data.length < 1000) break
  }

  const ranked = review
    .map((org) => ({ ...org, ...(totals.get(org.id) ?? { count: 0, usd: 0 }) }))
    .sort((a, b) => b.usd - a.usd)

  const limit = Number(process.argv[2] ?? 50)
  console.log(`${ranked.length} orgs need review; top ${Math.min(limit, ranked.length)}:\n`)
  for (const org of ranked.slice(0, limit)) {
    const words = org.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3 && !STOPWORDS.has(word))
    const suggestions = curated
      .filter((c) => words.some((word) => c.name.toLowerCase().includes(word)))
      .map((c) => c.slug)
      .slice(0, 3)
    const hint = suggestions.length > 0 ? `  ~ ${suggestions.join(', ')}` : ''
    console.log(
      `$${Math.round(org.usd).toLocaleString()}`.padStart(14) +
        `  ${org.count} grants  ${org.name} [${org.slug}]${hint}`
    )
  }
}

await main()
