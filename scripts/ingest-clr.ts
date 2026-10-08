// The CLR Fund, the Center on Long-Term Risk's grantmaking ("EAF Fund" until
// EAF's research arm became CLR in 2020), from the "Past Grants" section of
// https://longtermrisk.org/grantmaking/ — attributed to CLR itself, as
// Foresight's and BlueDot's programmes are to their orgs.
// One <details> per grant under an <h3> year heading:
//   <summary>Recipient: Purpose</summary>
//   <li>Grant amount: 5,000 USD</li>        (or "$81,503"; GBP/EUR too)
//   <li>Payout date: 13th February 2026</li> (or several dates, or
//                                             "$16,000 in December 2019; ...")
//   <li>Fund managers: ...</li>
//   <li>Disbursing charity: Effective Altruism Foundation</li>
//   <p>write-up</p>
import * as cheerio from 'cheerio'
import { classifyCauses } from './lib/causes'
import { runIngest, type SourceRecordInput } from './lib/ingest'
import { sha256 } from './lib/normalize'

const URL = 'https://longtermrisk.org/grantmaking/'
const FUNDER = 'Center on Long-Term Risk'

// Nearly every grantee is a person (scholarships, buy-outs, stipends); the
// handful of organisations are recognisable by name.
const ORG_NAME =
  /\b(Priorities|Initiative|Ethics|University|Institute|Foundation|Fund|Center|Centre|Research|Lab|Project)\b/i

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

function parseAmount(text: string): { amount: number | null; currency: string } {
  const cell = text.replace(/^.*?amount:?\s*/i, '')
  const dollars = cell.match(/\$\s*([\d,]+(?:\.\d+)?)/)
  if (dollars) return { amount: Number(dollars[1].replace(/,/g, '')), currency: 'USD' }
  const coded = cell.match(/([\d,]+(?:\.\d+)?)\s*([A-Z]{3})\b/)
  if (coded) return { amount: Number(coded[1].replace(/,/g, '')), currency: coded[2] }
  return { amount: null, currency: 'USD' }
}

// First payout date on the line. "October 8, 2019", "13th February 2026",
// "March 24th, 2022" are day-precise; "December 2019" is month-precise.
function parseDate(text: string): {
  date: string | null
  precision: 'day' | 'month' | null
} {
  const cell = text.replace(/^.*?date:?\s*/i, '').toLowerCase()
  const re = new RegExp(
    `(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+)?(${MONTHS.join('|')})(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?)?,?\\s+(\\d{4})`
  )
  const m = cell.match(re)
  if (!m) return { date: null, precision: null }
  const month = String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')
  const day = m[1] ?? m[3]
  if (day) return { date: `${m[4]}-${month}-${day.padStart(2, '0')}`, precision: 'day' }
  return { date: `${m[4]}-${month}-01`, precision: 'month' }
}

async function main() {
  const res = await fetch(URL, {
    headers: { 'user-agent': 'trace-grantbook (+https://trace.manifund.org)' },
  })
  if (!res.ok) throw new Error(`CLR fetch failed: ${res.status}`)
  const $ = cheerio.load(await res.text())

  const records: SourceRecordInput[] = []
  let year: string | null = null
  const nodes = $('#past-grants').nextAll().toArray()
  for (const node of nodes) {
    const el = $(node)
    if (node.type === 'tag' && node.name === 'h2') break
    if (node.type === 'tag' && node.name === 'h3') {
      year = el.text().trim()
      continue
    }
    if (!(node.type === 'tag' && node.name === 'details')) continue

    const summary = el.find('summary').first().text().replace(/\s+/g, ' ').trim()
    const lines = el
      .find('li')
      .toArray()
      .map((li) => $(li).text().replace(/\s+/g, ' ').trim())
    const field = (label: RegExp) => lines.find((line) => label.test(line)) ?? ''
    const writeup = el
      .find('p')
      .toArray()
      .map((p) => $(p).text().replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n')

    const colon = summary.indexOf(': ')
    const recipient = colon > 0 ? summary.slice(0, colon).trim() : summary
    const purpose = colon > 0 ? summary.slice(colon + 2).trim() : ''
    if (!recipient) continue

    const { amount, currency } = parseAmount(field(/amount/i))
    const { date, precision } = parseDate(field(/payout/i))

    records.push({
      // The page has no ids; the summary line is the stable handle.
      key: `${year ?? 'undated'}:${(await sha256(summary)).slice(0, 24)}`,
      raw: { year, summary, lines, writeup } as never,
      parsed: {
        funderName: FUNDER,
        funderType: 'organization',
        recipientName: recipient,
        recipientType: ORG_NAME.test(recipient) ? 'organization' : 'individual',
        amount,
        currency,
        date,
        datePrecision: precision,
        description: purpose || null,
        url: `${URL}#${year ?? ''}`,
        // The write-ups mention everything CLR cares about; only the purpose
        // line says what this grant is for. No keyword group covers animal
        // welfare, so the two wild-animal grants are tagged here.
        causeSlugs: /wild[- ]animal|animal (welfare|suffering)/i.test(purpose)
          ? ['animal-welfare']
          : classifyCauses({ fund: 'clr_fund', text: purpose }),
      },
    })
  }

  if (records.length < 40)
    throw new Error(`only ${records.length} CLR grants parsed — page changed?`)
  // The disbursing charity (EAF, later CLR itself) is the fund's paying
  // entity, not a fiscal sponsor of the recipient; it stays in raw only.
  console.log(`CLR Fund: ${records.length} grants`)
  await runIngest('clr_fund', records, { tombstone: true })
}

await main()
