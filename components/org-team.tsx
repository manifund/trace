'use client'

import { useState } from 'react'
import type { OrgTeam, OrgPerson } from '@/db/team'

function Name(props: { person: OrgPerson }) {
  const { person } = props
  return person.slug ? <a href={`/orgs/${person.slug}`}>{person.name}</a> : <>{person.name}</>
}

// Who runs the org and how many people work there, from the org's own site.
// Leadership in one column, headcount and provenance in the other; the full
// staff list opens underneath.
export function OrgTeamBlock(props: { team: OrgTeam | null }) {
  const [open, setOpen] = useState(false)
  const team = props.team
  if (!team || (team.people.length === 0 && team.headcount === null)) return null
  const leaders = team.people.filter((p) => p.leadership)
  // A site that names only its executives gives no staff count; say nothing
  // rather than pass the executive count off as the headcount.
  const count = team.headcount
  const hasMore = team.people.length > leaders.length
  const checked = new Date(`${team.checkedAt}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-x-12 gap-y-4">
        {leaders.length > 0 && (
          <section>
            <h3 className="mb-1 font-sans text-xs uppercase tracking-wide text-ink-muted">
              Leadership
            </h3>
            <ul className="text-sm">
              {leaders.map((p) => (
                <li key={p.name}>
                  <Name person={p} />
                  {p.title && <span className="text-ink-muted"> · {p.title}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {(count !== null || hasMore || team.sourceUrl) && (
          <section>
            <h3 className="mb-1 font-sans text-xs uppercase tracking-wide text-ink-muted">Team</h3>
            <p className="text-sm" title={team.headcountNote ?? undefined}>
              {count !== null
                ? `${count.toLocaleString()} ${count === 1 ? 'person' : 'people'}`
                : 'headcount not published'}
            </p>
            {team.sourceUrl && (
              <p className="text-sm text-ink-muted">
                <a href={team.sourceUrl}>source</a>, {checked}
              </p>
            )}
            {hasMore && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-1 text-xs text-brand"
              >
                {open ? 'Hide list ▴' : count !== null ? 'All staff ▾' : 'All listed ▾'}
              </button>
            )}
          </section>
        )}
      </div>
      {open && (
        <ul className="mt-4 columns-1 gap-x-8 text-sm sm:columns-2 md:columns-3">
          {team.people.map((p) => (
            <li key={p.name} className="break-inside-avoid">
              <Name person={p} />
              {p.title && <span className="text-xs text-ink-muted"> · {p.title}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
