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
// Coefficient Giving: only their AI-safety giving is estimated, so the
// catch-all fold below must not pull their (much larger) other-cause
// grantmaking into this bucket — see PARTIAL_FUNDERS.
const coefficientAi: Record<string, number> = { '2026': 500e6, '2025': 450e6 }
for (const [year, total] of Object.entries(coefficientAi)) {
  ESTIMATES.push({
    funderSlug: 'coefficient-giving',
    funderName: 'Coefficient Giving',
    date: year,
    bucket: 'ai',
    totalUsd: total,
    note: `Estimated total given to AI safety by Coefficient Giving in ${year}${year === '2026' ? ' so far' : ''}; AI-safety grants recorded individually in this database are subtracted from the total.`,
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
  const { data: allCauses } = await db.from('cause_areas').select('id, slug').throwOnError()
  const slugById = new Map((allCauses ?? []).map((c) => [c.id, c.slug]))
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
    type GrantRow = {
      amount_usd: number | null
      grant_date: string | null
      grant_cause_areas: { cause_area_id: string }[]
      grant_sources: { is_primary: boolean; source_records: { source_id: string } }[]
    }
    // Paginate: a funder with thousands of grants would otherwise stop at the
    // 1,000-row default and every remainder would come out too large.
    for (let from = 0; ; from += 1000) {
      const { data: grants } = await db
        .from('grants')
        .select(
          'amount_usd, grant_date, grant_cause_areas(cause_area_id), grant_sources!inner(is_primary, source_records!inner(source_id))'
        )
        .eq('status', 'approved')
        .eq('funder_org_id', org.id)
        .range(from, from + 999)
        .throwOnError()
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
      if (!grants || grants.length < 1000) break
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
  // Funders whose estimates deliberately cover only some causes: never fold
  // recorded grants from other buckets into their estimate.
  const PARTIAL_FUNDERS = new Set(['coefficient-giving'])
  const catchAll = (slug: string): Bucket => {
    if (PARTIAL_FUNDERS.has(slug)) return 'none' as Bucket
    const set = estimatedBuckets.get(slug) ?? new Set<Bucket>()
    for (const bucket of ['other', 'xrisk', 'ai'] as Bucket[]) if (set.has(bucket)) return bucket
    return 'other'
  }
  const rows: Record<string, unknown>[] = []
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
        .select(
          'amount_usd, grant_date, grant_sources!inner(is_primary, source_records!inner(source_id))'
        )
        .eq('status', 'approved')
        .eq('funder_org_id', cg!.id)
        .range(from, from + 999)
        .throwOnError()
      type CgRow = {
        amount_usd: number | null
        grant_date: string | null
        grant_sources: { is_primary: boolean; source_records: { source_id: string } }[]
      }
      for (const grant of (data ?? []) as never as CgRow[]) {
        // Skip this source's rows from a previous run; the equivalents
        // generated in THIS run are added below, so the total is
        // self-consistent rather than a generation behind.
        if (
          grant.grant_sources.some(
            (s) => s.is_primary && s.source_records.source_id === 'fund_estimates'
          )
        )
          continue
        const year = (grant.grant_date ?? '').slice(0, 4)
        if (year) spend.set(year, (spend.get(year) ?? 0) + (grant.amount_usd ?? 0))
      }
      if (!data || data.length < 1000) break
    }
    // Good Ventures funds all of CG's grantmaking, so CG's own estimated
    // giving counts toward the total too.
    for (const row of rows) {
      if (row.funder !== 'Coefficient Giving') continue
      const year = String(row.date).slice(0, 4)
      spend.set(year, (spend.get(year) ?? 0) + row.amount)
    }
    for (const [year, total] of Array.from(spend).sort()) {
      const yearNum = Number(year)
      const variousCap = yearNum >= 2025 ? 200e6 : yearNum === 2024 ? 100e6 : 0
      const various = Math.round(Math.min(variousCap, total))
      const gv = Math.round(total - various)
      const shared = `Coefficient Giving (then Open Philanthropy) granted $${Math.round(total).toLocaleString()} in ${year} per this database, including estimated giving.`
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

  // Form 990 gaps: a filer's reported total grants paid for a year, minus the
  // grants from that filer we have itemized, becomes a 'Various Recipients'
  // estimate row. Cause is left as 'other' — the remainder is unattributed by
  // definition, so tagging it would inflate a cause's totals.
  const FILINGS: { slug: string; name: string; url: string; paid: Record<string, number> }[] = [
    {
      slug: 'fli',
      name: 'Future of Life Institute',
      url: 'https://projects.propublica.org/nonprofits/organizations/471052538',
      paid: { '2021': 13_521_246, '2022': 372_863_899, '2023': 9_449_231, '2024': 7_457_618 },
    },
    {
      slug: 'lightcone-foundation',
      name: 'Lightcone Foundation',
      url: 'https://projects.propublica.org/nonprofits/organizations/920636259',
      paid: { '2022': 10_000_000, '2023': 12_150_000 },
    },
  ]
  for (const filer of FILINGS) {
    const { data: org } = await db.from('orgs').select('id').eq('slug', filer.slug).maybeSingle()
    if (!org) continue
    const itemized = new Map<string, number>()
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from('grants')
        .select(
          'amount_usd, grant_date, grant_sources!inner(is_primary, source_records!inner(source_id))'
        )
        .eq('status', 'approved')
        .eq('funder_org_id', org.id)
        .range(from, from + 999)
        .throwOnError()
      type Row = {
        amount_usd: number | null
        grant_date: string | null
        grant_sources: { is_primary: boolean; source_records: { source_id: string } }[]
      }
      for (const grant of (data ?? []) as never as Row[]) {
        if (
          grant.grant_sources.some(
            (s) => s.is_primary && s.source_records.source_id === 'fund_estimates'
          )
        )
          continue
        const year = (grant.grant_date ?? '').slice(0, 4)
        if (year) itemized.set(year, (itemized.get(year) ?? 0) + (grant.amount_usd ?? 0))
      }
      if (!data || data.length < 1000) break
    }
    for (const [year, paid] of Object.entries(filer.paid)) {
      const known = Math.round(itemized.get(year) ?? 0)
      const gap = Math.round(paid - known)
      if (gap <= 0) {
        console.log(
          `SKIP ${filer.name} ${year} 990 gap: itemized $${known.toLocaleString()} >= $${paid.toLocaleString()}`
        )
        continue
      }
      console.log(
        `${filer.name} ${year} 990 gap: $${paid.toLocaleString()} paid - $${known.toLocaleString()} itemized = $${gap.toLocaleString()}`
      )
      rows.push({
        recipient: 'Various Recipients',
        funder: filer.name,
        amount: gap,
        currency: 'USD',
        date: year,
        description: null,
        program: 'Aggregate estimate — other causes',
        sourceUrl: filer.url,
        amountEstimated: true,
        estimateNote: `${filer.name}'s Form 990 reports $${paid.toLocaleString()} of grants paid in ${year}; grants itemized in this database are subtracted from the total.`,
      })
    }
  }

  // FTX Future Fund: their own published totals by cause-area label, mapped
  // onto this database's causes and net of what we already record. Labels on
  // combined rows split the amount evenly. A cause we already record above
  // the published figure gets no row (logged as SKIP) — our tagging and
  // theirs disagree at the margins, so the total can overshoot slightly.
  {
    const FTX_TOTALS: [string, number][] = [
      ['Artificial Intelligence', 61_810_238],
      ['Effective Altruism', 54_787_717],
      ['Biorisk and Recovery from Catastrophe', 40_242_711],
      ['Epistemic Institutions', 21_743_478],
      ['Other, Great Power Relations', 15_000_000],
      ['Empowering Exceptional People', 10_856_520],
      ['Other', 8_972_903],
      ['Values and Reflective Processes', 8_108_847],
      ['Economic Growth', 4_616_500],
      ['Research That Can Help Us Improve', 3_052_143],
      ['Great Power Relations', 2_438_700],
      ['Values and Reflective Processes, Effective Altruism', 1_174_529],
      ['Artificial Intelligence, Research That Can Help Us Improve', 1_000_000],
      ['Empowering Exceptional People, Effective Altruism', 1_000_000],
      ['Effective Altruism, Empowering Exceptional People', 824_000],
      ['Artificial Intelligence, Biorisk and Recovery from Catastrophe', 790_000],
      ['(blank)', 686_800],
      [
        'Biorisk and Recovery from Catastrophe, Economic Growth, Empowering Exceptional People',
        480_000,
      ],
      ['Artificial Intelligence, Values and Reflective Processes', 400_000],
      ['Epistemic Institutions, Great Power Relations', 366_000],
      ['Space Governance', 356_000],
      ['Epistemic Institutions, Values and Reflective Processes', 339_555],
      ['Values and Reflective Processes, Epistemic Institutions', 256_250],
      ['Effective Altruism, Great Power Relations', 255_600],
      ['Research that can help us improve', 243_400],
      ['Great power relations', 225_000],
      ['Economic Growth, Empowering Exceptional People', 150_000],
      ['Effective Altruism, Values and Reflective Processes', 136_426],
      ['Artificial Intelligence, Effective Altruism', 23_480],
      ['Epistemic Institutions, Effective Altruism', 20_000],
      ['Effective Altruism, Research That Can Help Us Improve', 17_502],
      ['Biorisk and Recovery from Catastrophe, Effective Altruism', 12_800],
      ['Effective Altruism, Biorisk and Recovery from Catastrophe', 0],
    ]
    // Label -> cause slug, chosen to match how this database actually tags
    // FTX grants carrying that label.
    const LABEL_SLUG: Record<string, string> = {
      'artificial intelligence': 'ai-safety',
      'biorisk and recovery from catastrophe': 'biosecurity',
      'effective altruism': 'ea-infrastructure',
      'empowering exceptional people': 'ea-infrastructure',
      'epistemic institutions': 'other',
      'values and reflective processes': 'other',
      'research that can help us improve': 'other',
      'economic growth': 'other',
      other: 'other',
      'great power relations': 'x-risk-other',
      'space governance': 'x-risk-other',
      '(blank)': 'x-risk-other',
    }
    const CAUSE_NAMES: Record<string, string> = {
      'ai-safety': 'AI safety',
      biosecurity: 'biosecurity',
      'ea-infrastructure': 'EA infrastructure',
      'x-risk-other': 'other existential risk',
      other: 'other causes',
    }
    const published = new Map<string, number>()
    for (const [label, amount] of FTX_TOTALS) {
      const parts =
        label === '(blank)' ? ['(blank)'] : label.split(',').map((p) => p.trim().toLowerCase())
      const slugs = parts.map((p) => LABEL_SLUG[p]).filter(Boolean)
      for (const slug of slugs)
        published.set(slug, (published.get(slug) ?? 0) + amount / slugs.length)
    }
    const { data: org } = await db
      .from('orgs')
      .select('id')
      .eq('slug', 'ftx-future-fund')
      .maybeSingle()
    if (org) {
      const PRIORITY = ['ai-safety', 'biosecurity', 'ea-infrastructure', 'x-risk-other']
      const known = new Map<string, number>()
      for (let from = 0; ; from += 1000) {
        const { data } = await db
          .from('grants')
          .select(
            'amount_usd, grant_cause_areas(cause_area_id), grant_sources!inner(is_primary, source_records!inner(source_id))'
          )
          .eq('status', 'approved')
          .eq('funder_org_id', org.id)
          .range(from, from + 999)
          .throwOnError()
        type Row = {
          amount_usd: number | null
          grant_cause_areas: { cause_area_id: string }[]
          grant_sources: { is_primary: boolean; source_records: { source_id: string } }[]
        }
        for (const grant of (data ?? []) as never as Row[]) {
          if (
            grant.grant_sources.some(
              (s) => s.is_primary && s.source_records.source_id === 'fund_estimates'
            )
          )
            continue
          const tags = new Set(grant.grant_cause_areas.map((t) => slugById.get(t.cause_area_id)))
          const slug = PRIORITY.find((s) => tags.has(s)) ?? 'other'
          known.set(slug, (known.get(slug) ?? 0) + (grant.amount_usd ?? 0))
        }
        if (!data || data.length < 1000) break
      }
      for (const [slug, total] of Array.from(published).sort((a, b) => b[1] - a[1])) {
        const recordedUsd = Math.round(known.get(slug) ?? 0)
        const gap = Math.round(total - recordedUsd)
        if (gap <= 0) {
          console.log(
            `SKIP FTX Future Fund ${slug}: recorded $${recordedUsd.toLocaleString()} >= published $${Math.round(total).toLocaleString()}`
          )
          continue
        }
        console.log(
          `FTX Future Fund ${slug}: $${Math.round(total).toLocaleString()} published - $${recordedUsd.toLocaleString()} recorded = $${gap.toLocaleString()}`
        )
        rows.push({
          recipient: 'Various Recipients',
          funder: 'FTX Future Fund',
          amount: gap,
          currency: 'USD',
          date: '2022',
          description: null,
          program: `Aggregate estimate — ${CAUSE_NAMES[slug] ?? slug}`,
          sourceUrl: null,
          amountEstimated: true,
          causes: [slug],
          estimateNote: `The FTX Future Fund reported $${Math.round(total).toLocaleString()} awarded for ${CAUSE_NAMES[slug] ?? slug}; grants recorded individually in this database are subtracted from the total.`,
        })
      }
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
