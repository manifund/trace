// Loads data/reviews/*.json into org_reviews. Each file is one reviewer's
// edition (see scripts/fetch-zvi-reviews.ts for the shape); org names resolve
// through the same crosswalk as grants, so a review of an org the grants data
// has not seen yet creates a needs_review org for curation. Rows are keyed
// by file id + normalized org name: re-running updates in place, and rows
// whose org dropped out of the file are deleted.
// Usage: bun run scripts/ingest-reviews.ts [fileId]
import { readdirSync, readFileSync } from 'node:fs'
import { createAdminClient } from '@/db/supabase-admin'
import { normalizeName } from './lib/normalize'
import { OrgResolver } from './lib/resolve-org'

type ReviewsFile = {
  id: string
  reviewer: string
  reviewerUrl?: string | null
  sourceUrl?: string | null
  reviewedAt: string
  reviews: {
    org: string
    confidence?: string | null
    fundingNeeded?: string | null
    review: string
  }[]
}

// Reviewer-specific ratings live in the text, not in columns: other
// reviewers will not have them.
function body(review: ReviewsFile['reviews'][number]): string {
  const ratings = [
    review.confidence && `Confidence: ${review.confidence}`,
    review.fundingNeeded && `Funding needs: ${review.fundingNeeded}`,
  ].filter(Boolean)
  return ratings.length > 0 ? `${ratings.join(', ')}\n\n${review.review}` : review.review
}

const only = process.argv[2]
const db = createAdminClient()
const resolver = await OrgResolver.load(db)

for (const name of readdirSync('data/reviews').sort()) {
  if (!name.endsWith('.json')) continue
  const file = JSON.parse(readFileSync(`data/reviews/${name}`, 'utf8')) as ReviewsFile
  if (only && file.id !== only) continue

  const rows = []
  const seen = new Set<string>()
  for (const review of file.reviews) {
    const key = `${file.id}:${normalizeName(review.org)}`
    if (seen.has(key)) throw new Error(`${name}: duplicate org "${review.org}"`)
    seen.add(key)
    rows.push({
      org_id: await resolver.resolve(review.org),
      source_key: key,
      reviewer: file.reviewer,
      reviewer_url: file.reviewerUrl ?? null,
      source_url: file.sourceUrl ?? null,
      reviewed_at: file.reviewedAt,
      body: body(review),
      updated_at: new Date().toISOString(),
    })
  }
  await db.from('org_reviews').upsert(rows, { onConflict: 'source_key' }).throwOnError()
  const { data: stale } = await db
    .from('org_reviews')
    .select('source_key')
    .like('source_key', `${file.id}:%`)
    .throwOnError()
  const gone = (stale ?? []).map((r) => r.source_key).filter((k) => !seen.has(k))
  if (gone.length > 0) {
    await db.from('org_reviews').delete().in('source_key', gone).throwOnError()
  }
  console.log(JSON.stringify({ file: file.id, upserted: rows.length, removed: gone.length }))
}
if (resolver.createdNames.length > 0) {
  console.log(`New orgs (needs_review): ${resolver.createdNames.join('; ')}`)
}
