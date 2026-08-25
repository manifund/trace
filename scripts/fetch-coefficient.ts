// Refreshes data/coefficient-grants.json from Coefficient Giving's public
// Algolia index — the same index that powers the grant widgets on their fund
// pages. The site itself is Cloudflare-gated to non-browsers, but the Algolia
// API is not; the app id and search-only key below are published in the DOM
// of every fund page (hidden inputs #algolia-app-id / #algolia-search-key),
// so this needs no browser session. Long grant pages are split into -0/-1/-2
// records; we keep one row per post. Run, then
// `bun run scripts/ingest-coefficient.ts --force`.
import { readFileSync, writeFileSync } from 'fs'

const APP_ID = 'WBC743WF65'
const SEARCH_KEY = 'da168b7a254a1f18a8fd0e6b65d7e0e2'
const INDEX = 'coefficientgiving_grants_award_date_desc'

type Hit = {
  objectID: string
  post_id: number
  title: string
  url: string
  award_date: number
  award_year: number
  grant_amount: number | null
  organization_name: string[]
  'focus-area': string[]
}

const unescapeHtml = (s: string) =>
  s
    .replaceAll('&amp;', '&')
    .replaceAll('&#038;', '&')
    .replaceAll('&#8217;', '’')
    .replaceAll('&#8216;', '‘')
    .replaceAll('&#8211;', '–')
    .replaceAll('&quot;', '"')

async function query(params: string) {
  const res = await fetch(
    `https://${APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${INDEX}/query`,
    {
      method: 'POST',
      headers: {
        'x-algolia-application-id': APP_ID,
        'x-algolia-api-key': SEARCH_KEY,
      },
      body: JSON.stringify({ params }),
    }
  )
  if (!res.ok) throw new Error(`Algolia ${res.status}: ${await res.text()}`)
  return (await res.json()) as { hits: Hit[]; nbHits: number; nbPages: number }
}

async function main() {
  // Offset pagination is capped at 1,000 hits, so partition by award_year
  // (no year has 1,000+ grants) and page within each.
  const rows = new Map<number, Hit>()
  const probe = await query('hitsPerPage=1')
  const total = probe.nbHits
  for (let year = 2010; year <= new Date().getFullYear() + 1; year++) {
    for (let page = 0; ; page++) {
      const data = await query(
        `hitsPerPage=1000&page=${page}&numericFilters=${encodeURIComponent(`award_year=${year}`)}`
      )
      if (data.nbHits >= 1000) throw new Error(`year ${year} exceeds the pagination cap`)
      for (const hit of data.hits) if (!rows.has(hit.post_id)) rows.set(hit.post_id, hit)
      if (page >= data.nbPages - 1) break
    }
  }
  // Anything with an award_year outside the range would be silently dropped;
  // compare split-record totals loosely to catch that.
  console.log(`index reports ${total} records (incl. split rows); collected ${rows.size} posts`)

  const grants = Array.from(rows.values())
    .sort((a, b) => b.award_date - a.award_date || a.post_id - b.post_id)
    .map((hit) => ({
      id: `grants-${hit.post_id}-0`,
      org: unescapeHtml(hit.organization_name?.[0] ?? ''),
      date: hit.award_date,
      slug: hit.url.replace(/\/$/, '').split('/').pop() ?? String(hit.post_id),
      year: hit.award_year,
      areas: (hit['focus-area'] ?? []).map(unescapeHtml),
      title: unescapeHtml(hit.title ?? ''),
      amount: typeof hit.grant_amount === 'number' ? hit.grant_amount : null,
    }))

  // Keep exported_at stable when nothing changed so automated runs produce
  // no diff (and therefore no PR) on quiet months.
  const path = 'data/coefficient-grants.json'
  const prior = JSON.parse(readFileSync(path, 'utf8')) as { exported_at: string; grants: unknown }
  if (JSON.stringify(prior.grants) === JSON.stringify(grants)) {
    console.log(`no changes (${grants.length} grants)`)
    return
  }
  const doc = {
    _comment:
      'Coefficient Giving grants, fetched from their public Algolia index by scripts/fetch-coefficient.ts. Regenerate with `bun run scripts/fetch-coefficient.ts`, then re-ingest with --force.',
    exported_at: new Date().toISOString(),
    grants,
  }
  writeFileSync(path, JSON.stringify(doc, null, 1) + '\n')
  console.log(`wrote ${grants.length} grants (deduped from split records)`)
}

await main()
