// SFF recommendations, all rounds 2019-2025, from the single index table at
// https://survivalandflourishing.fund/recommendations
// Columns: Round | Source | Organization | Amount | Receiving Charity | Purpose
// * Source is the actual funder (Jaan Tallinn, Jed McCaleb, ...).
// * Organization vs Receiving Charity encodes fiscal sponsorship.
// * Amount cells can carry a speculation-grant top-up: "$X +$Y‡" — both count.
import * as cheerio from 'cheerio'
import { classifyCauses } from './lib/causes'
import { runIngest, type SourceRecordInput } from './lib/ingest'
import { sha256 } from './lib/normalize'

const URL = 'https://survivalandflourishing.fund/recommendations'

function parseAmount(cell: string): number | null {
  const parts = Array.from(cell.matchAll(/\$([\d,]+)/g)).map((m) => Number(m[1].replace(/,/g, '')))
  if (parts.length === 0) return null
  return parts.reduce((a, b) => a + b, 0)
}

// Round labels: SFF-2019-Q3, SFF-2020-H1, SFF-2024, SFF-2024-FlexHEGs,
// Initiative Committee 2024, SFF-2025. Quarters/halves map to their final
// month; plain years stay year-precision.
// Actual round dates per Caroline (announcement/decision dates). Rounds not
// listed fall back to the label heuristic below. The 2025 "further
// opportunities" round is expected ~Nov 2025 — add its label here when it
// shows up in the table.
const ROUND_DATES: Record<string, { date: string; precision: 'day' | 'month' }> = {
  'SFF-2019-Q4': { date: '2019-12-01', precision: 'month' },
  'SFF-2020-H1': { date: '2020-06-01', precision: 'month' },
  'SFF-2020-H2': { date: '2020-12-01', precision: 'month' },
  'SFF-2021-H1': { date: '2021-07-01', precision: 'month' },
  'SFF-2021-H2': { date: '2021-11-20', precision: 'day' },
  'SFF-2022-H1': { date: '2022-05-01', precision: 'month' },
  'SFF-2022-H2': { date: '2022-12-01', precision: 'month' },
  'SFF-2023-H1': { date: '2023-04-28', precision: 'day' },
  'SFF-2023-H2': { date: '2023-10-26', precision: 'day' },
  'SFF-2024': { date: '2024-10-30', precision: 'day' },
  'SFF-2024-FlexHEGs': { date: '2024-12-01', precision: 'month' },
  'SFF-2025': { date: '2025-09-01', precision: 'month' },
  'SFF-2026': { date: '2026-09-01', precision: 'month' },
}

// From SFF-2026 on, the index lists joint "Jaan Tallinn & Dustin Moskovitz"
// rows with one combined amount; the per-funder split is only on the round's
// own announcement page, whose recommendations grid repeats each row's total
// with "Jaan Tallinn: $X" / "Dustin Moskovitz: $Y" lines underneath.
const ROUND_PAGES: Record<string, string> = {
  'SFF-2026': 'https://survivalandflourishing.fund/2026/recommendations',
}

type Split = { name: string; amount: number }[]

// Keyed by `${organization}|${total}` (an org can appear twice in a round
// with different amounts). Orgs added to the page after the announcement
// carry a trailing "*", which is stripped.
async function loadFunderSplits(url: string): Promise<Map<string, Split>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`SFF round page fetch failed: ${res.status} ${url}`)
  const $ = cheerio.load(await res.text())
  const cells = $('[columns="6"] .in-grid:not(.is-header)')
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, ' ').trim())
  const splits = new Map<string, Split>()
  for (let i = 0; i + 5 < cells.length; i += 6) {
    const organization = cells[i + 1].replace(/\*$/, '').trim()
    const amountCell = cells[i + 3]
    const total = amountCell.match(/^\$([\d,]+)/)?.[1]
    if (!total) continue
    const split: Split = []
    for (const m of amountCell.matchAll(/(Jaan Tallinn|Dustin Moskovitz): \$([\d,]+)/g)) {
      split.push({ name: m[1], amount: Number(m[2].replace(/,/g, '')) })
    }
    if (split.length) splits.set(`${organization}|${Number(total.replace(/,/g, ''))}`, split)
  }
  if (splits.size === 0) throw new Error(`No funder splits parsed from ${url}`)
  return splits
}

function parseRound(round: string): {
  date: string | null
  precision: 'day' | 'month' | 'year' | null
} {
  const known = ROUND_DATES[round.trim()]
  if (known) return known
  const year = round.match(/(\d{4})/)?.[1]
  if (!year) return { date: null, precision: null }
  const quarter = round.match(/Q([1-4])/)?.[1]
  if (quarter) {
    const month = Number(quarter) * 3
    return { date: `${year}-${String(month).padStart(2, '0')}-01`, precision: 'month' }
  }
  const half = round.match(/H([12])/)?.[1]
  if (half) {
    const month = half === '1' ? 6 : 12
    return { date: `${year}-${String(month).padStart(2, '0')}-01`, precision: 'month' }
  }
  return { date: `${year}-01-01`, precision: 'year' }
}

async function main() {
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`SFF fetch failed: ${res.status}`)
  const $ = cheerio.load(await res.text())
  const splitsByRound = new Map<string, Map<string, Split>>()
  for (const [round, url] of Object.entries(ROUND_PAGES)) {
    splitsByRound.set(round, await loadFunderSplits(url))
  }

  const records: SourceRecordInput[] = []
  const rows = $('tr').toArray()
  for (const tr of rows) {
    const cells = $(tr)
      .find('td')
      .toArray()
      .map((td) => $(td).text().replace(/\s+/g, ' ').trim())
    if (cells.length !== 6) continue
    const [round, source, organization, amountCell, receivingCharity, purpose] = cells
    if (!organization) continue

    // Bracketed qualifiers ("Org [Project Name]") stay out of the org entity.
    const recipient = organization.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
    const sponsor =
      receivingCharity && receivingCharity !== organization && receivingCharity !== recipient
        ? receivingCharity
        : null
    const { date, precision } = parseRound(round)

    // Joint-funder rows ("Jaan Tallinn and Blake Borgeson") pair each funder
    // with their own amount ("$1,094,000 and $135,000", same order). Split
    // them into one grant per funder. Only split when the amount cell itself
    // pairs two figures — org names can contain "and" ("The Casey and Family
    // Foundation") without being joint.
    const jointAmounts = amountCell.match(/^\$([\d,]+) and \$([\d,]+)$/)
    let funders: { name: string; amount: number | null }[]
    if (jointAmounts && source.includes(' and ')) {
      funders = source.split(' and ').map((name, i) => ({
        name: name.trim(),
        amount: Number(jointAmounts[i + 1].replace(/,/g, '')),
      }))
    } else if (source.includes(' & ')) {
      // "Jaan Tallinn & Dustin Moskovitz" with one combined amount: split per
      // the round page. The page's total is the index amount including any
      // "+$X‡" matching pledge, and the two funder figures sum to it.
      const total = parseAmount(amountCell)
      const split = splitsByRound.get(round.trim())?.get(`${organization}|${total}`)
      if (!split) {
        throw new Error(`No funder split for ${round} / ${organization} / ${amountCell}`)
      }
      const splitTotal = split.reduce((a, b) => a + b.amount, 0)
      if (splitTotal !== total) {
        throw new Error(`Funder split for ${organization} sums to ${splitTotal}, not ${total}`)
      }
      funders = split
    } else {
      funders = [{ name: source, amount: parseAmount(amountCell) }]
    }

    for (const funder of funders) {
      // Early rounds list "SFF DAF" as the source — the fund's own DAF pool,
      // seeded by Jaan Tallinn's earlier BERI-era grants (his own donation
      // log claims these disbursements). Attributed to him per Caroline.
      if (funder.name.trim() === 'SFF DAF') funder.name = 'Jaan Tallinn'
      records.push({
        key: await sha256(
          [round, funder.name, organization, amountCell, receivingCharity, purpose].join('|')
        ),
        raw: {
          round,
          source,
          funder: funder.name,
          organization,
          amount: amountCell,
          receivingCharity,
          purpose,
        },
        parsed: {
          funderName: funder.name,
          funderType: 'individual',
          recipientName: recipient,
          sponsorName: sponsor,
          viaNames: ['Survival and Flourishing Fund'],
          amount: funder.amount,
          currency: 'USD',
          date,
          datePrecision: precision,
          description: purpose || null,
          round,
          url: URL,
          causeSlugs: classifyCauses({
            fund: 'sff',
            text: `${recipient} ${purpose ?? ''}`,
          }),
        },
      })
    }
  }
  if (records.length < 400) {
    throw new Error(`SFF parse suspiciously small: ${records.length} rows — page layout changed?`)
  }
  await runIngest('sff', records)
}

await main()
