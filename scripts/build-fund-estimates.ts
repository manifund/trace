// Regenerates data/curated/fund-estimates.json: aggregate per-year giving
// estimates for funds that don't publish grant-level data (figures from
// Caroline, 2026-08). Each row is the year's estimated total minus grants
// from that funder already recorded individually in the database, so the
// aggregate never double-counts. Re-run after major ingests, then
// `bun run scripts/ingest-curated.ts fund_estimates --force`.
import { writeFileSync } from 'fs'
import { createAdminClient } from '@/db/supabase-admin'

const db = createAdminClient()

type Bucket = 'ai' | 'animal' | 'bio' | 'xrisk' | 'other'
type Estimate = {
  funderSlug: string | null // null = org may not exist yet; no subtraction possible
  funderName: string
  date: string // 'YYYY' or 'YYYY-MM'
  bucket: Bucket
  totalUsd: number
  note: string
}

const yearNote = (funder: string, year: string) =>
  `Estimated total given out by ${funder} in ${year}; grants recorded individually in this database are subtracted from the total.`

const ESTIMATES: Estimate[] = []
const longview: Record<string, [number, number]> = {
  '2026': [200e6, 200e6],
  '2025': [60e6, 60e6],
  '2024': [16e6, 12e6],
  '2023': [11e6, 11e6],
  '2022': [7e6, 8e6],
  '2021': [5e6, 7e6],
  '2020': [3e6, 7e6],
  '2019': [2e6, 7e6],
  '2018': [1e6, 2e6],
}
for (const [year, [ai, other]] of Object.entries(longview)) {
  ESTIMATES.push({
    funderSlug: 'longview-philanthropy',
    funderName: 'Longview Philanthropy',
    date: year,
    bucket: 'ai',
    totalUsd: ai,
    note: yearNote('Longview Philanthropy', year),
  })
  // Non-AI giving split evenly between biosecurity and other existential risk.
  for (const bucket of ['bio', 'xrisk'] as Bucket[]) {
    ESTIMATES.push({
      funderSlug: 'longview-philanthropy',
      funderName: 'Longview Philanthropy',
      date: year,
      bucket,
      totalUsd: other / 2,
      note: `${yearNote('Longview Philanthropy', year)} Non-AI giving is split evenly between biosecurity and other existential risk.`,
    })
  }
}
const macroscopic: Record<string, number> = {
  '2026': 70e6,
  '2025': 30e6,
  '2024': 10e6,
  '2023': 8e6,
  '2022': 6e6,
  '2021': 5e6,
  '2020': 2e6,
  '2019': 1e6,
}
// Macroscopic's portfolio split: 70% AI safety, 15% animal welfare, 15% other.
for (const [year, total] of Object.entries(macroscopic)) {
  const note = `${yearNote('Macroscopic Ventures', year)} Split 70% AI safety / 15% animal welfare / 15% other.`
  const shares: [Bucket, number][] = [
    ['ai', 0.7],
    ['animal', 0.15],
    ['other', 0.15],
  ]
  for (const [bucket, share] of shares) {
    ESTIMATES.push({
      funderSlug: 'macroscopic',
      funderName: 'Macroscopic Ventures',
      date: year,
      bucket,
      totalUsd: total * share,
      note,
    })
  }
}
const aistof: Record<string, number> = {
  '2026': 25e6,
  '2025': 15e6,
  '2024': 5e6,
  '2023': 2e6,
}
for (const [year, total] of Object.entries(aistof)) {
  ESTIMATES.push({
    funderSlug: 'aistof',
    funderName: 'AI Safety Tactical Opportunities Fund',
    date: year,
    bucket: 'ai',
    totalUsd: total,
    note: yearNote('the AI Safety Tactical Opportunities Fund', year),
  })
}
ESTIMATES.push({
  funderSlug: 'openai',
  funderName: 'OpenAI',
  date: '2024-02',
  bucket: 'ai',
  totalUsd: 10e6,
  note: 'OpenAI announced $10m of Superalignment Fast Grants in February 2024; grants recorded individually in this database are subtracted from the total.',
})

async function main() {
  const { data: causeRows } = await db
    .from('cause_areas')
    .select('id, slug')
    .in('slug', ['ai-safety', 'animal-welfare', 'biosecurity', 'x-risk-other'])
    .throwOnError()
  const causeId = (slug: string) => causeRows!.find((c) => c.slug === slug)!.id
  const bucketOf = (tagIds: Set<string>): Bucket =>
    tagIds.has(causeId('ai-safety'))
      ? 'ai'
      : tagIds.has(causeId('animal-welfare'))
        ? 'animal'
        : tagIds.has(causeId('biosecurity'))
          ? 'bio'
          : tagIds.has(causeId('x-risk-other'))
            ? 'xrisk'
            : 'other'

  // Recorded per funder-year-bucket totals, excluding this source's own rows.
  const recorded = new Map<string, number>()
  for (const slug of new Set(ESTIMATES.map((e) => e.funderSlug))) {
    if (!slug) continue
    const { data: org } = await db.from('orgs').select('id').eq('slug', slug).maybeSingle()
    if (!org) continue
    const { data: grants } = await db
      .from('grants')
      .select(
        'amount_usd, grant_date, grant_cause_areas(cause_area_id), grant_sources!inner(is_primary, source_records!inner(source_id))'
      )
      .eq('status', 'approved')
      .eq('funder_org_id', org.id)
      .throwOnError()
    type GrantRow = {
      amount_usd: number | null
      grant_date: string | null
      grant_cause_areas: { cause_area_id: string }[]
      grant_sources: { is_primary: boolean; source_records: { source_id: string } }[]
    }
    for (const grant of (grants ?? []) as never as GrantRow[]) {
      const sources = grant.grant_sources
      if (sources.some((s) => s.is_primary && s.source_records.source_id === 'fund_estimates'))
        continue
      const year = (grant.grant_date ?? '').slice(0, 4)
      if (!year) continue
      const tags = grant.grant_cause_areas as never as { cause_area_id: string }[]
      const bucket = bucketOf(new Set(tags.map((t) => t.cause_area_id)))
      const key = `${slug}|${year}|${bucket}`
      recorded.set(key, (recorded.get(key) ?? 0) + (grant.amount_usd ?? 0))
    }
  }

  // Recorded grants in buckets a funder has no estimate for fold into its
  // catch-all bucket (first of other > xrisk > ai with an estimate row).
  const ALL_BUCKETS: Bucket[] = ['ai', 'animal', 'bio', 'xrisk', 'other']
  const estimatedBuckets = new Map<string, Set<Bucket>>()
  for (const est of ESTIMATES) {
    if (!est.funderSlug) continue
    const set = estimatedBuckets.get(est.funderSlug) ?? new Set<Bucket>()
    set.add(est.bucket)
    estimatedBuckets.set(est.funderSlug, set)
  }
  const catchAll = (slug: string): Bucket => {
    const set = estimatedBuckets.get(slug) ?? new Set<Bucket>()
    for (const bucket of ['other', 'xrisk', 'ai'] as Bucket[]) if (set.has(bucket)) return bucket
    return 'other'
  }
  const rows = []
  for (const est of ESTIMATES) {
    const year = est.date.slice(0, 4)
    let subtracted = est.funderSlug
      ? (recorded.get(`${est.funderSlug}|${year}|${est.bucket}`) ?? 0)
      : 0
    if (est.funderSlug && est.bucket === catchAll(est.funderSlug)) {
      const set = estimatedBuckets.get(est.funderSlug) ?? new Set<Bucket>()
      for (const other of ALL_BUCKETS) {
        if (other === est.bucket || set.has(other)) continue
        subtracted += recorded.get(`${est.funderSlug}|${year}|${other}`) ?? 0
      }
    }
    const remainder = Math.round(est.totalUsd - subtracted)
    if (remainder <= 0) {
      console.log(`SKIP ${est.funderName} ${est.date} ${est.bucket}: recorded exceeds estimate`)
      continue
    }
    rows.push({
      recipient: 'Various Recipients',
      funder: est.funderName,
      amount: remainder,
      currency: 'USD',
      date: est.date,
      description: null,
      program: {
        ai: 'Aggregate estimate — AI safety',
        animal: 'Aggregate estimate — animal welfare',
        bio: 'Aggregate estimate — biosecurity',
        xrisk: 'Aggregate estimate — other existential risk',
        other: 'Aggregate estimate — other causes',
      }[est.bucket],
      sourceUrl: null,
      amountEstimated: true,
      estimateNote: est.note,
    })
    if (subtracted > 0)
      console.log(
        `${est.funderName} ${est.date} ${est.bucket}: $${est.totalUsd.toLocaleString()} - $${Math.round(subtracted).toLocaleString()} recorded = $${remainder.toLocaleString()}`
      )
  }

  // Good Ventures -> Coefficient Giving: GV is assumed to fund all of CG's
  // grantmaking up to 2023, all but $100m in 2024, and all but $200m from
  // 2025 on; the remainder is attributed to 'Various Donors'. Amounts come
  // from CG's recorded grantmaking in this database, so they track ingests.
  {
    const { data: cg } = await db
      .from('orgs')
      .select('id')
      .eq('slug', 'coefficient-giving')
      .single()
      .throwOnError()
    const spend = new Map<string, number>()
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from('grants')
        .select('amount_usd, grant_date')
        .eq('status', 'approved')
        .eq('funder_org_id', cg!.id)
        .range(from, from + 999)
        .throwOnError()
      for (const grant of data ?? []) {
        const year = (grant.grant_date ?? '').slice(0, 4)
        if (year) spend.set(year, (spend.get(year) ?? 0) + (grant.amount_usd ?? 0))
      }
      if (!data || data.length < 1000) break
    }
    for (const [year, total] of Array.from(spend).sort()) {
      const yearNum = Number(year)
      const variousCap = yearNum >= 2025 ? 200e6 : yearNum === 2024 ? 100e6 : 0
      const various = Math.round(Math.min(variousCap, total))
      const gv = Math.round(total - various)
      const shared = `Coefficient Giving (then Open Philanthropy) granted $${Math.round(total).toLocaleString()} in ${year} per this database.`
      if (gv > 0)
        rows.push({
          recipient: 'Coefficient Giving',
          funder: 'Good Ventures Foundation',
          amount: gv,
          currency: 'USD',
          date: year,
          description: null,
          program: 'Aggregate estimate — Coefficient Giving grantmaking',
          sourceUrl: null,
          amountEstimated: true,
          estimateNote: `${shared} Good Ventures is assumed to have funded ${variousCap > 0 ? `all but $${(variousCap / 1e6).toFixed(0)}m` : 'all'} of it.`,
        })
      if (various > 0)
        rows.push({
          recipient: 'Coefficient Giving',
          funder: 'Various Donors',
          amount: various,
          currency: 'USD',
          date: year,
          description: null,
          program: 'Aggregate estimate — Coefficient Giving grantmaking',
          sourceUrl: null,
          amountEstimated: true,
          estimateNote: `${shared} Funding beyond Good Ventures' assumed share is attributed to various donors.`,
        })
    }
  }

  const doc = {
    _comment:
      'GENERATED by scripts/build-fund-estimates.ts — edit the totals there, not here. Aggregate per-year giving estimates net of individually recorded grants.',
    grants: rows,
  }
  writeFileSync('data/curated/fund-estimates.json', JSON.stringify(doc, null, 2) + '\n')
  console.log(`wrote ${rows.length} rows to data/curated/fund-estimates.json`)
}

await main()
