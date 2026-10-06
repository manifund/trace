// Snapshots Zvi Mowshowitz's Big Nonprofits List from nonprofits.zone into
// data/reviews/zvi-2025.json. The site is a static page over one JSON file,
// so this keeps every field it publishes (leaders, focus, ratings) even
// though the site only renders the review text and ratings for now.
// Usage: bun run scripts/fetch-zvi-reviews.ts
import { writeFileSync } from 'node:fs'

const SITE = 'https://nonprofits.zone/'
const DATA = `${SITE}featured-nonprofits.json`
const POST = 'https://thezvi.substack.com/p/the-big-nonprofits-post-2025'
const OUT = 'data/reviews/zvi-2025.json'

type Raw = Record<string, string>

const res = await fetch(DATA)
if (!res.ok) throw new Error(`${DATA}: ${res.status}`)
const rows = (await res.json()) as Raw[]

const reviews = rows
  .filter((row) => Number(row.Ranking) > 0)
  .sort((a, b) => Number(a.Ranking) - Number(b.Ranking))
  .map((row) => ({
    org: row['Nonprofit Name'].trim(),
    ranking: Number(row.Ranking),
    category: row.Category || null,
    confidence: row['Confidence Level'] || null,
    fundingNeeded: row['Funding Needed'] || null,
    leaders: row['Leader(s)'] || null,
    focus: row.Focus || null,
    website: row.Website || null,
    donationLink: row['Donation Link'] || null,
    // The scrape leaks the post's "Leaders:" line into some descriptions;
    // leaders have their own field above.
    review: row.Description.replace(/^Leaders?:[^\n]*\n+/, '').trim(),
  }))

if (reviews.length < 50) throw new Error(`only ${reviews.length} reviews parsed`)

const file = {
  _comment:
    "Zvi Mowshowitz's Big Nonprofits List 2025, snapshotted from nonprofits.zone by scripts/fetch-zvi-reviews.ts. Review text is his; ratings are his Confidence Level and Funding Needed labels.",
  id: 'zvi-2025',
  reviewer: 'Zvi Mowshowitz',
  reviewerUrl: SITE,
  sourceUrl: POST,
  reviewedAt: '2025-11-26',
  reviews,
}
writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
console.log(`Wrote ${reviews.length} reviews to ${OUT}`)
