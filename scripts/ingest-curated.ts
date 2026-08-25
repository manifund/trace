// Ingests curated snapshot datasets from data/curated/*.json — sources whose
// sites publish grants as pages/press releases rather than structured feeds
// (FLI, Schmidt Sciences, Foresight, Longview, ...). Each file is a research
// extraction with per-row provenance URLs; refresh by re-running the
// extraction and overwriting the file.
// Usage: bun run scripts/ingest-curated.ts [sourceId]
import { readFileSync } from 'node:fs'
import { classifyCauses } from './lib/causes'
import { runIngest, type SourceRecordInput } from './lib/ingest'
import { sha256 } from './lib/normalize'

type CuratedRow = {
  recipient: string
  funder?: string
  amount?: number | null
  currency?: string | null
  date?: string | number | null
  datePrecision?: 'day' | 'month' | 'year' | null
  amountEstimated?: boolean
  estimateNote?: string | null
  description?: string | null
  program?: string | null
  sourceUrl?: string | null
  // Intermediary vehicle(s): the money reached the recipient through these.
  via?: string | string[] | null
}

type CuratedSource = {
  sourceId: string
  file: string
  defaultFunder: string
  funderType?: 'foundation' | 'fund' | 'organization' | 'individual' | 'government'
  // Cause slugs derived from the program name; null falls through to keywords.
  programCauses?: (program: string) => string[] | null
}

const SOURCES: CuratedSource[] = [
  {
    sourceId: 'fli',
    file: 'fli.json',
    defaultFunder: 'Future of Life Institute',
    funderType: 'organization',
    programCauses: (program) => {
      if (/nuclear/i.test(program)) return ['x-risk-other']
      if (/ai safety|agi safety/i.test(program)) return ['technical-ai-safety']
      if (/governing ai|governance/i.test(program)) return ['ai-policy']
      if (/power concentration/i.test(program)) return ['gradual-disempowerment']
      if (/fellowship/i.test(program)) return ['training-pipelines']
      if (/religious|superintelligence imagined|multistakeholder/i.test(program)) {
        return ['ai-advocacy']
      }
      return null
    },
  },
  {
    sourceId: 'schmidt_sciences',
    file: 'schmidt-sciences.json',
    defaultFunder: 'Schmidt Sciences',
    funderType: 'foundation',
    programCauses: (program) => {
      if (/trustworthy ai|safety science/i.test(program)) return ['technical-ai-safety']
      // AI2050 is "beneficial AI" broadly; only keyword hits count as safety.
      return null
    },
  },
  {
    sourceId: 'foresight',
    file: 'foresight.json',
    defaultFunder: 'Foresight Institute',
    funderType: 'organization',
    programCauses: () => null,
  },
  {
    sourceId: 'longview',
    file: 'longview.json',
    defaultFunder: 'Longview Philanthropy',
    funderType: 'foundation',
    programCauses: (program) => {
      if (/nuclear/i.test(program)) return ['x-risk-other']
      if (/frontier ai/i.test(program)) return ['ai-safety']
      if (/digital minds|sentience/i.test(program)) return ['digital-minds']
      return null
    },
  },
  {
    sourceId: 'acx_grants',
    file: 'acx-grants.json',
    defaultFunder: 'ACX Grants',
    funderType: 'fund',
    programCauses: () => null,
  },
  {
    sourceId: 'org_reported',
    file: 'org-reported.json',
    defaultFunder: 'Undisclosed',
    funderType: 'organization',
    programCauses: () => null,
  },
  {
    sourceId: 'ftx_future_fund',
    file: 'ftx-future-fund.json',
    defaultFunder: 'FTX Future Fund',
    funderType: 'fund',
    programCauses: (program) => {
      if (/artificial intelligence/i.test(program)) return ['ai-safety']
      if (/biorisk/i.test(program)) return ['biosecurity']
      if (/effective altruism/i.test(program)) return ['ea-infrastructure']
      return null
    },
  },
  {
    sourceId: 'fli_990',
    file: 'fli-990.json',
    defaultFunder: 'Future of Life Institute',
    funderType: 'organization',
    programCauses: () => ['ai-safety'],
  },
  {
    sourceId: 'lightcone_990',
    file: 'lightcone-990.json',
    defaultFunder: 'Lightcone Foundation',
    funderType: 'foundation',
    programCauses: () => null,
  },
  {
    sourceId: 'macroscopic',
    file: 'macroscopic.json',
    defaultFunder: 'Macroscopic Ventures',
    funderType: 'foundation',
    programCauses: (program) => {
      if (/cooperative ai/i.test(program)) return ['ai-safety']
      if (/welfare & sentience/i.test(program)) return ['digital-minds']
      if (/s-risk/i.test(program)) return ['s-risk']
      if (/technical ai governance/i.test(program)) return ['technical-governance']
      if (/international/i.test(program)) return ['international-policy']
      if (/^ai governance$/i.test(program)) return ['ai-policy']
      if (/animal welfare/i.test(program)) return ['animal-welfare']
      if (/ai safety research/i.test(program)) return ['technical-ai-safety']
      return null
    },
  },
  {
    sourceId: 'fund_estimates',
    file: 'fund-estimates.json',
    defaultFunder: 'Undisclosed',
    funderType: 'fund',
    programCauses: (program) => {
      if (/coefficient giving/i.test(program)) return ['other']
      if (/ai safety/i.test(program)) return ['ai-safety']
      if (/animal welfare/i.test(program)) return ['animal-welfare']
      if (/biosecurity/i.test(program)) return ['biosecurity']
      if (/existential risk/i.test(program)) return ['x-risk-other']
      if (/other causes/i.test(program)) return ['other']
      return null
    },
  },
  {
    sourceId: 'jefftk',
    file: 'jefftk.json',
    defaultFunder: 'Julia Wise and Jeff Kaufman',
    funderType: 'individual',
    programCauses: () => null,
  },
  {
    sourceId: 'uk_aisi',
    file: 'uk-aisi.json',
    defaultFunder: 'UK AI Security Institute',
    funderType: 'government',
    programCauses: (program) => {
      if (/alignment project/i.test(program)) return ['technical-ai-safety']
      if (/systemic safety/i.test(program)) return ['ai-safety']
      if (/challenge fund/i.test(program)) return ['ai-safety']
      return null
    },
  },
]

function parseDate(row: CuratedRow): {
  date: string | null
  precision: 'day' | 'month' | 'year' | null
} {
  const raw = row.date === null || row.date === undefined ? '' : String(row.date).trim()
  if (!raw) return { date: null, precision: null }
  if (/^\d{4}$/.test(raw)) return { date: `${raw}-01-01`, precision: 'year' }
  if (/^\d{4}-\d{2}$/.test(raw)) return { date: `${raw}-01`, precision: 'month' }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return { date: raw.slice(0, 10), precision: row.datePrecision ?? 'day' }
  }
  const year = raw.match(/(\d{4})/)?.[1]
  return year ? { date: `${year}-01-01`, precision: 'year' } : { date: null, precision: null }
}

async function ingestSource(source: CuratedSource) {
  const file = JSON.parse(readFileSync(`data/curated/${source.file}`, 'utf8')) as {
    grants: CuratedRow[]
  }
  const records: SourceRecordInput[] = []
  const keyCounts = new Map<string, number>()

  for (const row of file.grants) {
    const recipient = (row.recipient ?? '').trim()
    if (!recipient) continue
    const program = (row.program ?? '').trim()
    const { date, precision } = parseDate(row)
    const amount = typeof row.amount === 'number' && row.amount > 0 ? row.amount : null

    const baseKey = await sha256(
      [recipient, program, date ?? '', row.description ?? '', amount ?? ''].join('|')
    )
    const n = (keyCounts.get(baseKey) ?? 0) + 1
    keyCounts.set(baseKey, n)

    const hinted = program ? source.programCauses?.(program) : null
    const text = `${recipient} ${row.description ?? ''} ${program}`
    records.push({
      key: n === 1 ? baseKey : `${baseKey}#${n}`,
      raw: row as never,
      parsed: {
        funderName: row.funder?.trim() || source.defaultFunder,
        funderType: source.funderType ?? 'foundation',
        recipientName: recipient,
        amount,
        amountEstimated: row.amountEstimated ?? false,
        estimateNote: row.estimateNote ?? null,
        currency: row.currency ?? 'USD',
        date,
        datePrecision: precision,
        description: [row.description, program].filter(Boolean).join(' — ') || null,
        round: program || null,
        url: row.sourceUrl ?? null,
        viaNames: row.via ? (Array.isArray(row.via) ? row.via : [row.via]) : undefined,
        causeSlugs: hinted
          ? classifyCauses({ labels: [], text }).includes('other')
            ? hinted
            : Array.from(new Set([...hinted, ...classifyCauses({ labels: [], text })])).filter(
                (slug) => slug !== 'other'
              )
          : classifyCauses({ fund: source.sourceId, text }),
      },
    })
  }
  await runIngest(source.sourceId, records)
}

const only = process.argv[2]
for (const source of SOURCES) {
  if (only && source.sourceId !== only) continue
  await ingestSource(source)
}
