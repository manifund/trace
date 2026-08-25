// Coefficient Giving (formerly Open Philanthropy), full grants database.
// The Nov 2025 rebrand removed the site's grants index page, but the data
// still lives in their public Algolia search index
// (coefficientgiving_grants_award_date_desc, app wbc743wf65), which powers
// the per-fund "Featured Grants" widgets. Their site is Cloudflare-gated to
// non-browser clients, but the Algolia API itself is open: refresh the
// export with `bun run scripts/fetch-coefficient.ts` (no browser needed).
// Historical note: the original export ran in a real browser session and the
// result is checked in as data/coefficient-grants.json (2,889 grants,
// 2012 through 2026 at last export).
//
// To refresh: open any fund page (e.g. /funds/navigating-transformative-ai/),
// export the index via the page's own Algolia client, and overwrite
// data/coefficient-grants.json — then re-run this script.
import snapshot from '@/data/coefficient-grants.json'
import { classifyCauses } from './lib/causes'
import { runIngest, type SourceRecordInput } from './lib/ingest'

type SnapshotGrant = {
  id: string
  title: string | null
  amount: number | null
  date: number | null
  year: number | null
  org: string | null
  areas: string[]
  slug: string | null
}

// The per-grant pages died in the Nov 2025 rebrand; link the grant's fund
// page instead. Sub-programs map to their parent fund; legacy Open Phil areas
// with no current fund fall back to the funds index.
const FUND_PAGES: Record<string, string> = {
  'Navigating Transformative AI': 'navigating-transformative-ai',
  'Farm Animal Welfare': 'farm-animal-welfare',
  'Cage-Free Reforms': 'farm-animal-welfare',
  'Farm Animal Welfare in Asia': 'farm-animal-welfare',
  'Farm Animal Welfare in Europe': 'farm-animal-welfare',
  'Fish Welfare': 'farm-animal-welfare',
  'Broiler Chicken Welfare': 'farm-animal-welfare',
  'Alternatives to Animal Products': 'farm-animal-welfare',
  'Science and Global Health R&D': 'science-and-global-health-rd',
  'Infectious Diseases': 'science-and-global-health-rd',
  'Noninfectious Diseases': 'science-and-global-health-rd',
  'Human Health and Wellbeing': 'science-and-global-health-rd',
  'Transformative Science': 'science-and-global-health-rd',
  'Scientific Innovation: Tools and Techniques': 'science-and-global-health-rd',
  'Other Scientific Research Areas': 'science-and-global-health-rd',
  'Strep A Vaccine Fund': 'strep-a-vaccine-fund',
  'Global Health & Wellbeing Opportunities': 'global-health-wellbeing-opportunities',
  'Global Catastrophic Risks Opportunities': 'global-catastrophic-risks-opportunities',
  'Biosecurity & Pandemic Preparedness': 'biosecurity-pandemic-preparedness',
  'Science Supporting Biosecurity and Pandemic Preparedness': 'biosecurity-pandemic-preparedness',
  'Abundance & Growth': 'abundance-and-growth',
  'Housing Policy Reform': 'abundance-and-growth',
  'Innovation Policy': 'abundance-and-growth',
  'Effective Giving & Careers': 'effective-giving-and-careers',
  'Global Aid Policy': 'global-aid-policy',
  'Air Quality': 'air-quality',
  Forecasting: 'forecasting',
  'Lead Exposure Action Fund': 'lead-exposure-action-fund',
  'Global Growth': 'global-growth',
}

function fundUrl(areas: string[]): string {
  for (const area of areas) {
    const slug = FUND_PAGES[area]
    if (slug) return `https://coefficientgiving.org/funds/${slug}/`
  }
  return 'https://coefficientgiving.org/funds/'
}

async function main() {
  const grants = (snapshot as never as { grants: SnapshotGrant[] }).grants
  if (grants.length < 2500) throw new Error(`Suspiciously few rows: ${grants.length}`)

  const records: SourceRecordInput[] = []
  for (const grant of grants) {
    const recipient = (grant.org ?? '').trim()
    if (!recipient) continue
    // Algolia object ids look like "grants-36950-0"; the WP post id is the
    // stable key.
    const postId = grant.id.match(/grants-(\d+)/)?.[1] ?? grant.id
    const date = grant.date ? new Date(grant.date * 1000).toISOString().slice(0, 10) : null

    records.push({
      key: postId,
      raw: {
        id: grant.id,
        title: grant.title,
        amount: grant.amount,
        award_date: grant.date,
        organization: grant.org,
        areas: grant.areas,
        slug: grant.slug,
      },
      parsed: {
        funderName: 'Coefficient Giving',
        funderType: 'foundation',
        recipientName: recipient,
        amount: grant.amount && grant.amount > 0 ? grant.amount : null,
        currency: 'USD',
        date,
        datePrecision: date ? 'month' : null,
        description: grant.title || null,
        round: grant.areas[0] ?? null,
        url: fundUrl(grant.areas),
        causeSlugs: classifyCauses({
          labels: grant.areas,
          text: `${recipient} ${grant.title ?? ''} ${grant.areas.join(' ')}`,
        }),
      },
    })
  }
  await runIngest('coefficient_giving', records)
}

await main()
