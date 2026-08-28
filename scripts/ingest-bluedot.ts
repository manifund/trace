// BlueDot Impact's own grant programmes, read from the tRPC endpoints that
// back bluedot.org/grants. Both procedures are named "...Public..." upstream —
// they return the grantees who agreed to be listed, and nothing else.
//
// Rapid Grants carry a name, amount and month. Career Transition Grants are
// listed by name and plan only; BlueDot publishes no amounts or dates for
// them, so those land as grants with an undisclosed amount, which records who
// was funded without inventing a figure.
import { classifyCauses } from './lib/causes'
import { runIngest, type SourceRecordInput } from './lib/ingest'
import { sha256 } from './lib/normalize'

const TRPC = 'https://bluedot.org/api/trpc'
const FUNDER = 'BlueDot Impact'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type RapidGrantee = {
  granteeName: string
  projectTitle?: string | null
  amountUsd?: number | null
  monthLabel?: string | null
  link?: string | null
}

type CareerGrantee = {
  granteeName: string
  bio?: string | null
  grantPlan?: string | null
}

// "Aug 2026" -> "2026-08-01", carried at month precision.
function monthToDate(label: string | null | undefined): string | null {
  if (!label) return null
  const [mon, year] = label.trim().split(/\s+/)
  const index = MONTHS.indexOf(mon.slice(0, 3))
  if (index < 0 || !/^\d{4}$/.test(year ?? '')) return null
  return `${year}-${String(index + 1).padStart(2, '0')}-01`
}

// tRPC batches two procedures per call and wants a superjson-shaped input for
// each, even though both take no arguments.
async function batch<T>(procedures: string[]): Promise<T[]> {
  const input = Object.fromEntries(
    procedures.map((_, i) => [i, { json: null, meta: { values: ['undefined'] } }])
  )
  const url = `${TRPC}/${procedures.join(',')}?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`
  const res = await fetch(url, {
    headers: { 'user-agent': 'trace-grantbook (+https://trace.manifund.org)' },
  })
  if (!res.ok) throw new Error(`bluedot tRPC: HTTP ${res.status}`)
  const body = (await res.json()) as { result?: { data?: unknown } }[]
  return body.map((entry) => entry?.result?.data as T)
}

async function main() {
  const [rapid, rapidStats] = await batch<never>([
    'grants.getAllPublicRapidGrantees',
    'grants.getRapidGrantStats',
  ])
  const [career] = await batch<never>([
    'grants.getAllPublicCareerTransitionGrantees',
    'grants.getCareerTransitionGrantStats',
  ])

  const rapidRows = (rapid ?? []) as never as RapidGrantee[]
  const careerRows = (career ?? []) as never as CareerGrantee[]
  const stats = (rapidStats ?? {}) as never as { count?: number; totalAmountUsd?: number }
  if (rapidRows.length < 100)
    throw new Error(`only ${rapidRows.length} rapid grantees — feed changed?`)

  const records: SourceRecordInput[] = []

  for (const row of rapidRows) {
    const amount = typeof row.amountUsd === 'number' ? row.amountUsd : null
    const date = monthToDate(row.monthLabel)
    records.push({
      // BlueDot exposes no grant id. Name, month and amount alone collide:
      // one grantee took two $1,000 grants in the same month, and 60-odd
      // rows are all named "Anonymous". The project text separates them and
      // keeps the key stable across runs.
      key: `rapid:${(
        await sha256(
          [row.granteeName, row.monthLabel ?? '', amount ?? '', row.projectTitle ?? ''].join('|')
        )
      ).slice(0, 24)}`,
      raw: row as never,
      parsed: {
        funderName: FUNDER,
        funderType: 'organization',
        recipientName: row.granteeName.trim(),
        recipientType: 'individual',
        amount,
        currency: 'USD',
        date,
        datePrecision: date ? 'month' : null,
        description: row.projectTitle?.trim() || null,
        round: 'Rapid Grants',
        url: row.link || 'https://bluedot.org/grants/rapid',
        causeSlugs: classifyCauses({ text: `${row.granteeName} ${row.projectTitle ?? ''}` }),
      },
    })
  }

  for (const row of careerRows) {
    records.push({
      key: `career-transition:${(await sha256([row.granteeName, row.grantPlan ?? ''].join('|'))).slice(0, 24)}`,
      raw: row as never,
      parsed: {
        funderName: FUNDER,
        funderType: 'organization',
        recipientName: row.granteeName.trim(),
        recipientType: 'individual',
        // BlueDot publishes no amount or date for this programme.
        amount: null,
        currency: 'USD',
        date: null,
        datePrecision: null,
        description: row.grantPlan?.trim() || row.bio?.trim() || null,
        round: 'Career Transition Grants',
        url: 'https://bluedot.org/grants/career-transition',
        causeSlugs: classifyCauses({ text: `${row.grantPlan ?? ''} ${row.bio ?? ''}` }),
      },
    })
  }

  const listed = rapidRows.reduce((total, row) => total + (row.amountUsd ?? 0), 0)
  console.log(
    `BlueDot: ${rapidRows.length} rapid ($${Math.round(listed).toLocaleString()} listed of ` +
      `$${Math.round(stats.totalAmountUsd ?? 0).toLocaleString()} across ${stats.count ?? '?'} made), ` +
      `${careerRows.length} career-transition (no amounts published)`
  )
  await runIngest('bluedot', records, { tombstone: true })
}

await main()
