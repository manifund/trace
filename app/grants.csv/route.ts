import { listGrants } from '@/db/grant'
import { toCsvCell } from '@/scripts/lib/csv'
import { applyFilters, filtersFromParams } from '@/utils/grant-filters'

export const revalidate = 600

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cause = searchParams.get('cause') ?? 'ai-safety'
  const filters = filtersFromParams(searchParams)
  const rows = applyFilters(await listGrants(cause), filters)

  const header = [
    'date',
    'date_precision',
    'funder',
    'via',
    'recipient',
    'fiscal_sponsor',
    'amount',
    'currency',
    'amount_usd',
    'amount_is_estimate',
    'estimate_note',
    'round',
    'purpose',
    'source',
    'url',
    'causes',
    'grant_id',
  ]
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.date,
        row.datePrecision,
        row.funderName,
        row.vias.map((via) => via.name).join('; '),
        row.recipientName,
        row.sponsorName,
        row.amount,
        row.currency,
        row.amountUsd,
        row.amountEstimated ? 'true' : '',
        row.estimateNote,
        row.round,
        row.description,
        row.sourceId,
        row.url,
        row.causes.join('; '),
        row.id,
      ]
        .map(toCsvCell)
        .join(',')
    )
  }
  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="trace.csv"',
    },
  })
}
