// IRS Form 990 grants for funders in the x-risk/EA/animal cluster. XML
// e-files come from the Giving Tuesday 990 data lake (public S3 mirror of
// IRS e-file data), pinned by immutable IRS object id. New filings: find the
// object id on the filer's ProPublica page and add it here. Where a year has
// an original and an amended return, list only the amended one.
// Grants carry the filing's tax-period end date at year precision.
//
// Two shapes:
// * form '990PF' (private foundations): Part XV grants paid during the year.
// * form '990' (public charities): Schedule I Part II (named US grantees),
//   Schedule I Part III and Schedule F (grants to individuals / foreign orgs,
//   which the form reports by region only) — the latter land on Various
//   Recipients / Various Individuals so the dollars still count.
import { classifyCauses } from './lib/causes'
import { runIngest, type SourceRecordInput } from './lib/ingest'

const XML_BASE = 'https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles'

type Filer = {
  ein: string
  funderName: string
  funderType?: 'foundation' | 'organization'
  form: '990PF' | '990'
  objectIds: string[]
  // Only rows whose recipient matches are ingested — for funders where we
  // track a single grantee, not the whole portfolio.
  recipientFilter?: RegExp
  // Fixed cause slugs for this filer's rows; null falls through to keywords.
  causes?: (recipient: string, purpose: string) => string[] | null
}

const FILERS: Filer[] = [
  {
    ein: '460538779',
    funderName: 'Robert and Virginia Shiller Foundation',
    form: '990PF',
    objectIds: [
      '201421339349100842',
      '201811359349101396',
      '201901359349103130',
      '202032669349100708',
      '202102179349100420',
      '202201339349103895',
      '202301329349100225',
      '202401359349102510',
      '202501359349101480',
      // 2025 tax year (object 202621349349102937) not yet in the data lake
    ],
  },
  {
    ein: '276364101',
    funderName: 'Casey and Family Foundation',
    form: '990PF',
    objectIds: [
      '201622109349100407',
      '201732159349100513',
      '201821349349100147',
      '201931419349100123',
      '202041579349100209',
      '202111049349100226',
      '202221539349100322',
      '202321359349100212',
      '202421359349100427',
      // 2025 tax year (object 202631319349100533) not yet in the data lake
    ],
  },
  {
    // Greenwich, CT private foundation (ruling 2021); funds Vox's Future
    // Perfect and GiveWell.
    ein: '854281986',
    funderName: 'BEMC Foundation',
    form: '990PF',
    objectIds: [
      '202210469349100116', // 2020 (short first year, no grants)
      '202323199349109357', // 2021, amended (supersedes 202243189349104649)
      '202333199349106948', // 2022
      '202403209349103005', // 2023
      '202523219349100137', // 2024
    ],
    causes: (recipient) => {
      if (/givewell/i.test(recipient)) return ['global-health-development']
      if (/vox/i.test(recipient)) return ['ea-infrastructure']
      return null
    },
  },
  {
    // Public charity: Recommended Charity Fund payouts and Movement Grants.
    // Fiscal year moved from calendar to April–March in 2022, hence the
    // three-month 2022 stub period.
    ein: '364684978',
    funderName: 'Animal Charity Evaluators',
    funderType: 'organization',
    form: '990',
    objectIds: [
      '201622229349301647', // 2015
      '201720899349301132', // 2016
      '201801019349300535', // 2017
      '201941089349300429', // 2018
      '202031129349301518', // 2019
      '202111169349301116', // 2020
      '202240909349301529', // 2021
      '202222229349302257', // Jan–Mar 2022
      '202302719349300730', // FY Apr 2022–Mar 2023
      '202432269349301368', // FY Apr 2023–Mar 2024
      '202542729349301389', // FY Apr 2024–Mar 2025
    ],
    causes: () => ['animal-welfare'],
  },
  {
    // Only their Future Perfect grants to Vox Media (2018–2019); the rest of
    // the foundation's portfolio is out of scope.
    ein: '131659629',
    funderName: 'The Rockefeller Foundation',
    form: '990PF',
    objectIds: ['201903119349101295', '202043119349100024'],
    recipientFilter: /^vox media/i,
    causes: () => ['ea-infrastructure'],
  },
]

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}>([^<]*)</${name}>`))
  return match ? unescapeXml(match[1].trim()) : ''
}

function blocksOf(xml: string, name: string): string[] {
  return xml.match(new RegExp(`<${name}>[\\s\\S]*?</${name}>`, 'g')) ?? []
}

// 990 names are usually ALL CAPS; title-case them for display. Resolution is
// case-insensitive, so this only affects newly created orgs.
function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name
  return name
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

function regionName(region: string): string {
  return displayName(region)
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bThe\b/g, 'the')
}

type Row = {
  key: string
  rawName: string
  recipient: string
  amount: number
  purpose: string
  city?: string
  state?: string
  country?: string
  region?: string
  recipientCount?: string
}

function pfRows(xml: string): Row[] {
  return blocksOf(xml, 'GrantOrContributionPdDurYrGrp').flatMap((block, index) => {
    const rawName = tag(block, 'BusinessNameLine1Txt') || tag(block, 'RecipientPersonNm')
    if (!rawName) return []
    return [
      {
        key: String(index),
        rawName,
        recipient: displayName(rawName),
        amount: Number(tag(block, 'Amt')),
        purpose: tag(block, 'GrantOrContributionPurposeTxt'),
        city: tag(block, 'CityNm'),
        state: tag(block, 'StateAbbreviationCd'),
      },
    ]
  })
}

function publicCharityRows(xml: string): Row[] {
  const rows: Row[] = []
  // Schedule I Part II: grants to US organizations (named).
  blocksOf(xml, 'RecipientTable').forEach((block, index) => {
    const rawName = tag(block, 'BusinessNameLine1Txt')
    if (!rawName) return
    rows.push({
      key: `i:${index}`,
      rawName,
      recipient: displayName(rawName),
      amount: Number(tag(block, 'CashGrantAmt')),
      purpose: tag(block, 'PurposeOfGrantTxt'),
      city: tag(block, 'CityNm'),
      state: tag(block, 'StateAbbreviationCd'),
      country: tag(block, 'CountryCd'),
    })
  })
  // Schedule I Part III: grants to US individuals (count + total only).
  blocksOf(xml, 'GrantsOtherAsstToIndivInUSGrp').forEach((block, index) => {
    rows.push({
      key: `di:${index}`,
      rawName: 'Various Individuals',
      recipient: 'Various Individuals',
      amount: Number(tag(block, 'CashGrantAmt')),
      purpose: tag(block, 'GrantTypeTxt'),
      recipientCount: tag(block, 'RecipientCnt'),
    })
  })
  // Schedule F Part II: grants to organizations outside the US, region only.
  blocksOf(xml, 'GrantsToOrgOutsideUSGrp').forEach((block, index) => {
    rows.push({
      key: `f:${index}`,
      rawName: 'Various Recipients',
      recipient: 'Various Recipients',
      amount: Number(tag(block, 'CashGrantAmt')),
      purpose: tag(block, 'PurposeOfGrantTxt'),
      region: tag(block, 'RegionTxt'),
    })
  })
  // Schedule F Part III: grants to individuals outside the US.
  blocksOf(xml, 'ForeignIndividualsGrantsGrp').forEach((block, index) => {
    rows.push({
      key: `fi:${index}`,
      rawName: 'Various Individuals',
      recipient: 'Various Individuals',
      amount: Number(tag(block, 'CashGrantAmt')),
      purpose: tag(block, 'GrantTypeTxt'),
      region: tag(block, 'RegionTxt'),
      recipientCount: tag(block, 'RecipientCnt'),
    })
  })
  return rows
}

function describe(row: Row): string | null {
  const parts: string[] = []
  if (row.region) {
    parts.push(
      row.recipient === 'Various Individuals'
        ? `Grants to ${row.recipientCount ? `${row.recipientCount} ` : ''}individuals in ${regionName(row.region)} (names not disclosed)`
        : `Grant to an organization in ${regionName(row.region)} (name not disclosed on the form)`
    )
  } else if (row.recipient === 'Various Individuals') {
    parts.push(
      `Grants to ${row.recipientCount ? `${row.recipientCount} ` : ''}individuals in the US (names not disclosed)`
    )
  }
  if (row.purpose) parts.push(displayName(row.purpose))
  return parts.join(' — ') || null
}

async function main() {
  const records: SourceRecordInput[] = []
  for (const filer of FILERS) {
    for (const objectId of filer.objectIds) {
      const res = await fetch(`${XML_BASE}/${objectId}_public.xml`)
      if (!res.ok) throw new Error(`${objectId}: HTTP ${res.status}`)
      const xml = await res.text()
      if (!xml.includes('<Return')) throw new Error(`${objectId}: not an e-file XML`)
      const returnType = tag(xml, 'ReturnTypeCd')
      if (returnType !== filer.form) {
        throw new Error(`${objectId}: expected ${filer.form}, got ${returnType}`)
      }
      const periodEnd = tag(xml, 'TaxPeriodEndDt')
      const rows = filer.form === '990PF' ? pfRows(xml) : publicCharityRows(xml)
      for (const row of rows) {
        if (filer.recipientFilter && !filer.recipientFilter.test(row.rawName)) continue
        const description = describe(row)
        const causes = filer.causes?.(row.recipient, row.purpose) ?? null
        records.push({
          key: `${filer.ein}:${objectId}:${row.key}`,
          raw: {
            ein: filer.ein,
            object_id: objectId,
            form: filer.form,
            period_end: periodEnd,
            recipient: row.rawName,
            amount: row.amount,
            purpose: row.purpose,
            city: row.city ?? '',
            state: row.state ?? '',
            country: row.country ?? '',
            region: row.region ?? '',
            recipient_count: row.recipientCount ?? '',
          },
          parsed: {
            funderName: filer.funderName,
            funderType: filer.funderType ?? 'foundation',
            recipientName: row.recipient,
            amount: Number.isFinite(row.amount) && row.amount > 0 ? row.amount : null,
            currency: 'USD',
            date: periodEnd || null,
            datePrecision: 'year',
            description,
            url: `https://projects.propublica.org/nonprofits/organizations/${filer.ein}/${objectId}/full`,
            causeSlugs: causes ?? classifyCauses({ text: `${row.recipient} ${row.purpose}` }),
          },
        })
      }
    }
  }
  await runIngest('irs_990', records, { tombstone: true })
}

await main()
