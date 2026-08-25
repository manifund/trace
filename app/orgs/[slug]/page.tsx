import { notFound } from 'next/navigation'
import { OrgGrantTable } from '@/components/org-grant-table'
import { OrgYearChart } from '@/components/org-year-chart'
import { listGrantsByOrg, listGrantsByVia, type GrantRow } from '@/db/grant'
import { getOrgBySlug, listBusiestOrgSlugs } from '@/db/org'
import { countsTowardCoverage, ESTIMATE_SYMBOLS, formatCoverage, formatMoney } from '@/utils/format'

export const revalidate = 600

// Prebuild the pages people actually click; the rest render on demand and
// are cached by the same ISR window.
export async function generateStaticParams() {
  const slugs = await listBusiestOrgSlugs()
  return slugs.map((slug) => ({ slug }))
}

function GrantList(props: {
  title: string
  grants: GrantRow[]
  side: 'made' | 'received' | 'via'
}) {
  if (props.grants.length === 0) return null
  const priced = props.grants.filter((grant) => grant.amountUsd !== null)
  const total = priced.reduce((sum, grant) => sum + (grant.amountUsd ?? 0), 0)
  const avg = priced.length > 0 ? total / priced.length : null
  const coveredUsd =
    props.side === 'made'
      ? priced
          .filter((grant) => countsTowardCoverage(grant.recipientName))
          .reduce((sum, grant) => sum + (grant.amountUsd ?? 0), 0)
      : total
  const showCoverage = props.side === 'made' && coveredUsd < total
  const estimateNotes = Array.from(
    new Set(
      props.grants
        .filter((g) => g.amountEstimated && g.estimateNote)
        .map((g) => g.estimateNote as string)
    )
  )
  const noteId = `amount-notes-${props.title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section className="mb-8">
      <h2 className="mb-2 font-serif text-lg font-bold">
        {props.title}{' '}
        <span className="text-sm font-normal text-ink-muted">
          {props.grants.length.toLocaleString()} ·{' '}
          {props.grants.some((grant) => grant.amountEstimated) && (
            <a href={`#${noteId}`} title="Includes estimated amounts" className="text-accent">
              ~
            </a>
          )}
          {formatMoney(total)}
          {avg !== null && <> · {formatMoney(Math.round(avg))} average</>}
          {showCoverage && (
            <>
              {' '}
              ·{' '}
              <span title="Share of the total itemized as individual grants; aggregate and anonymous rows excluded">
                {formatCoverage(coveredUsd, total)} coverage
              </span>
            </>
          )}
        </span>
      </h2>
      <OrgGrantTable
        grants={props.grants}
        side={props.side}
        noteId={noteId}
        estimateNotes={estimateNotes}
      />
      {estimateNotes.length > 0 && (
        <div id={noteId} className="mt-1 text-xs text-ink-muted">
          {estimateNotes.map((note, i) => (
            <p key={note}>
              {ESTIMATE_SYMBOLS[i] ?? '*'} {note}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const org = await getOrgBySlug(slug)
  if (!org) notFound()

  const [made, received, sponsored, via] = await Promise.all([
    listGrantsByOrg('funder_org_id', org.id),
    listGrantsByOrg('recipient_org_id', org.id),
    listGrantsByOrg('fiscal_sponsor_org_id', org.id),
    listGrantsByVia(org.id),
  ])
  const formerNames = org.names.filter((name) => name.kind !== 'canonical')

  const byYear = (grants: GrantRow[]) => {
    const out: Record<number, number> = {}
    for (const grant of grants) {
      if (!grant.date || grant.amountUsd === null) continue
      const year = Number(grant.date.slice(0, 4))
      out[year] = (out[year] ?? 0) + grant.amountUsd
    }
    return out
  }
  // Only chart the via flow when this org is not also the funder of record.
  const viaOnly = via.filter((g) => g.funderSlug !== org.slug)
  const chartSeries = [
    { name: 'Received', color: 'var(--s1)', byYear: byYear(received) },
    { name: 'Made', color: 'var(--s3)', byYear: byYear(made) },
    { name: 'Via', color: 'var(--s2)', byYear: byYear(viaOnly) },
  ]

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold">{org.name}</h1>
      <p className="mb-6 text-sm text-ink-muted">
        {org.website && (
          <>
            <a href={org.website}>{org.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
            {' · '}
          </>
        )}
        {org.org_type}
        {formerNames.length > 0 && (
          <>
            {' · '}
            {formerNames
              .map(
                (name) =>
                  `${name.name}${name.valid_to ? ` (until ${name.valid_to.slice(0, 4)})` : ''}`
              )
              .join(', ')}
          </>
        )}
      </p>
      <OrgYearChart series={chartSeries} />
      <GrantList title="Grants received" grants={received} side="received" />
      <GrantList title="Grants made" grants={made} side="made" />
      <GrantList title="Grants via" grants={viaOnly} side="via" />
      <GrantList title="As fiscal sponsor" grants={sponsored} side="via" />
    </div>
  )
}
