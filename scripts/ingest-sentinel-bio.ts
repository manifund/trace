// Sentinel Bio's grants, from the card list at
// https://sentinelbio.org/research-and-projects/ — one <a class="grant"> per
// grant with recipient, month, programme(s) and amount, linking to a detail
// page whose write-up comes from the WordPress REST API (`grant` post type)
// in one call. The detail slug is the record key.
//
// A starred amount ("$750,000*") is "funding provided by external partner at
// recommendation of Sentinel Bio": the money is someone else's, so the funder
// is Unknown Donors and Sentinel Bio is the via. Cards without an amount are
// grants whose size Sentinel Bio does not publish.
import * as cheerio from 'cheerio'
import { textOf } from './lib/html-md'
import { runIngest, type SourceRecordInput } from './lib/ingest'

const INDEX = 'https://sentinelbio.org/research-and-projects/'
const API = 'https://sentinelbio.org/api/wp/v2/grant?per_page=100&_fields=slug,content'
const FUNDER = 'Sentinel Bio'
const HEADERS = { 'user-agent': 'trace-grantbook (+https://trace.manifund.org)' }

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

// "August 2026" -> "2026-08-01"
function monthToDate(label: string): string | null {
  const m = label
    .trim()
    .toLowerCase()
    .match(/^([a-z]+)\s+(\d{4})$/)
  const index = m ? MONTHS.indexOf(m[1]) : -1
  return index < 0 ? null : `${m![2]}-${String(index + 1).padStart(2, '0')}-01`
}

// Programme names are inconsistently cased and separated on the cards.
const PROGRAMMES: Record<string, string> = {
  'biosecurity and ai': 'Biosecurity and AI',
  'nucleic acid governance': 'Nucleic acid governance',
  'building the ecosystem': 'Building the ecosystem',
}
function programmes(label: string): string[] {
  return label
    .split(/[;,]/)
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((p) => PROGRAMMES[p.toLowerCase()] ?? p)
}

// Everything is biosecurity; the "Biosecurity and AI" programme is also the
// AI x bio tag.
function causes(programmes: string[]): string[] {
  return programmes.some((p) => /\bai\b/i.test(p)) ? ['biosecurity', 'ai-bio'] : ['biosecurity']
}

async function main() {
  const [indexRes, apiRes] = await Promise.all([
    fetch(INDEX, { headers: HEADERS }),
    fetch(API, { headers: HEADERS }),
  ])
  if (!indexRes.ok) throw new Error(`Sentinel Bio index: HTTP ${indexRes.status}`)
  if (!apiRes.ok) throw new Error(`Sentinel Bio API: HTTP ${apiRes.status}`)
  const total = Number(apiRes.headers.get('x-wp-total') ?? 0)
  const posts = (await apiRes.json()) as { slug: string; content: { rendered: string } }[]
  if (total > posts.length)
    throw new Error(`Sentinel Bio API: ${total} grants, got ${posts.length} — page it`)
  const writeups = new Map(
    posts.map((post) => [post.slug, textOf(cheerio.load(post.content.rendered)('body'))])
  )

  const $ = cheerio.load(await indexRes.text())
  const records: SourceRecordInput[] = []
  for (const card of $('a.grant').toArray()) {
    const el = $(card)
    const link = el.attr('href') ?? ''
    const slug = link.match(/\/grant\/([^/]+)\/?$/)?.[1]
    if (!slug) continue
    const recipient = textOf(el.find('.name'))
    const [month = '', programmeLabel = '', amountLabel = ''] = el
      .find('.details div')
      .toArray()
      .map((div) => textOf($(div)))
    const external = amountLabel.includes('*')
    const digits = amountLabel.match(/\$\s*([\d,]+)/)?.[1]
    const amount = digits ? Number(digits.replace(/,/g, '')) : null
    const date = monthToDate(month)
    const programmeList = programmes(programmeLabel)
    const writeup = writeups.get(slug) ?? null

    records.push({
      key: slug,
      raw: {
        slug,
        recipient,
        month,
        programmes: programmeLabel,
        amount: amountLabel,
        link,
        writeup,
      } as never,
      parsed: {
        funderName: external ? 'Unknown Donors' : FUNDER,
        funderType: 'organization',
        viaNames: external ? [FUNDER] : undefined,
        recipientName: recipient,
        amount,
        currency: 'USD',
        date,
        datePrecision: date ? 'month' : null,
        description:
          [
            writeup,
            external
              ? 'Funding provided by an external partner at the recommendation of Sentinel Bio.'
              : null,
          ]
            .filter(Boolean)
            .join(' ') || null,
        round: programmeList.join('; ') || null,
        url: link,
        causeSlugs: causes(programmeList),
      },
    })
  }

  if (records.length < 40)
    throw new Error(`only ${records.length} Sentinel Bio grants parsed — page changed?`)
  console.log(
    `Sentinel Bio: ${records.length} grants, ${records.filter((r) => r.parsed.amount === null).length} without amounts`
  )
  await runIngest('sentinel_bio', records, { tombstone: true })
}

await main()
