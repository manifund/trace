import { notFound } from 'next/navigation'
import { OrgBarChart } from '@/components/org-bar-chart'
import { OrgBreakdown } from '@/components/org-breakdown'
import { OrgGrantTable } from '@/components/org-grant-table'
import { OrgStats } from '@/components/org-stats'
import { listGrantsByOrg, listGrantsByVia, type GrantRow } from '@/db/grant'
import { getOrgBySlug, listBusiestOrgSlugs } from '@/db/org'
import {
  byCause,
  byOrg,
  byYear,
  funderStats,
  recipientStats,
  stacksFor,
  viaStats,
  yearRange,
} from '@/utils/org-summary'
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
  // The section matching the org's main role repeats the stats at the top of
  // the page, so it leaves them off.
  showSummary?: boolean
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
      <h2 className="mb-2 font-display text-lg font-bold">
        {props.title}{' '}
        <span
          className={`text-sm font-normal text-ink-muted${props.showSummary === false ? ' hidden' : ''}`}
        >
          {props.grants.length.toLocaleString()} ·{' '}
          {props.grants.some((grant) => grant.amountEstimated) && (
            <a href={`#${noteId}`} title="Includes estimated amounts" className="text-brand">
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

  // Only chart the via flow when this org is not also the funder of record.
  const viaOnly = via.filter((g) => g.funderSlug !== org.slug)
  const money = (grants: GrantRow[]) => grants.reduce((t, g) => t + (g.amountUsd ?? 0), 0)

  // Orgs wear several hats — a regrantor gives, receives and routes. Lead with
  // whichever role moves the most money, and keep the rest below.
  const roles = [
    { role: 'funder' as const, grants: made, total: money(made) },
    { role: 'recipient' as const, grants: received, total: money(received) },
    { role: 'via' as const, grants: viaOnly, total: money(viaOnly) },
  ]
  const primary = roles.sort((a, b) => b.total - a.total)[0]

  const stats =
    primary.role === 'funder'
      ? funderStats(made)
      : primary.role === 'via'
        ? viaStats(viaOnly)
        : recipientStats(received)

  const stackDimension = primary.role === 'recipient' ? 'funder' : 'cause'
  const chartGrants = primary.grants
  // Aggregate estimate rows ("Unknown Recipients", "Unknown Donors") are real
  // money but not real counterparties, so they would top a "biggest" list
  // without naming anyone. They stay in the chart, where the stacks have to add
  // up to the bar.
  const named = (rows: ReturnType<typeof byOrg>) =>
    rows.filter((row) => countsTowardCoverage(row.name))
  const breakdowns =
    primary.role === 'funder'
      ? [
          { title: 'Biggest cause areas', rows: byCause(made), total: money(made) },
          {
            title: 'Biggest recipients',
            rows: named(byOrg(made, 'recipient')),
            total: money(made),
          },
        ]
      : primary.role === 'via'
        ? [
            {
              title: 'Biggest funders',
              rows: named(byOrg(viaOnly, 'funder')),
              total: money(viaOnly),
            },
            {
              title: 'Biggest recipients',
              rows: named(byOrg(viaOnly, 'recipient')),
              total: money(viaOnly),
            },
          ]
        : [
            {
              title: 'Biggest funders',
              rows: named(byOrg(received, 'funder')),
              total: money(received),
            },
            // Plenty of charities regrant some of what they raise; show both
            // sides rather than only the money coming in.
            ...(money(made) > 0
              ? [
                  {
                    title: 'Biggest recipients',
                    rows: named(byOrg(made, 'recipient')),
                    total: money(made),
                  },
                ]
              : []),
          ]

  // Cause chips lead a recipient's page: what they work on, in their own data.
  const causeChips = primary.role === 'recipient' ? byCause(received).slice(0, 5) : []

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">{org.name}</h1>
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
      {causeChips.length > 0 && (
        <p className="mb-4 flex flex-wrap gap-1">
          {causeChips.map((chip) => (
            <span
              key={chip.name}
              className="rounded bg-paper-alt px-2 py-0.5 font-sans text-xs text-ink-muted"
            >
              {chip.name}
            </span>
          ))}
        </p>
      )}
      <OrgStats stats={stats} />
      <OrgBarChart
        years={yearRange(chartGrants)}
        totals={byYear(chartGrants)}
        stacks={stacksFor(chartGrants, stackDimension)}
        stackLabel={stackDimension === 'cause' ? 'cause area' : 'funder'}
      />
      <div className="flex flex-wrap gap-x-10">
        {breakdowns.map((breakdown) => (
          <OrgBreakdown
            key={breakdown.title}
            title={breakdown.title}
            rows={breakdown.rows}
            total={breakdown.total}
          />
        ))}
      </div>
      <GrantList
        title="Grants received"
        grants={received}
        side="received"
        showSummary={primary.role !== 'recipient'}
      />
      <GrantList
        title="Grants made"
        grants={made}
        side="made"
        showSummary={primary.role !== 'funder'}
      />
      <GrantList
        title="Grants via"
        grants={viaOnly}
        side="via"
        showSummary={primary.role !== 'via'}
      />
      <GrantList title="As fiscal sponsor" grants={sponsored} side="via" />
    </div>
  )
}
