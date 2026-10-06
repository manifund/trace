import type { OrgTeam, OrgPerson } from '@/db/team'

function Person(props: { person: OrgPerson; withTitle?: boolean }) {
  const { person } = props
  const name = person.slug ? <a href={`/orgs/${person.slug}`}>{person.name}</a> : person.name
  return (
    <>
      {name}
      {props.withTitle !== false && person.title && (
        <span className="text-ink-muted"> ({person.title})</span>
      )}
    </>
  )
}

// One line under the org header: who runs it and how many people work
// there, from the org's own site. The full staff list opens on click.
export function OrgTeamLine(props: { team: OrgTeam | null }) {
  const team = props.team
  if (!team || (team.people.length === 0 && team.headcount === null)) return null
  const leaders = team.people.filter((p) => p.leadership)
  const count = team.headcount ?? team.people.length
  const summary = (
    <>
      {leaders.length > 0 && (
        <>
          {leaders.map((p, i) => (
            <span key={p.name}>
              {i > 0 && ', '}
              <Person person={p} />
            </span>
          ))}
        </>
      )}
      {count > 0 && (
        <>
          {leaders.length > 0 && ' · '}
          <span title={team.headcountNote ?? undefined}>
            {count.toLocaleString()} {count === 1 ? 'person' : 'people'}
          </span>
        </>
      )}
      {team.sourceUrl && (
        <>
          {' · '}
          <a href={team.sourceUrl} className="text-xs">
            source, {team.checkedAt.slice(0, 7)}
          </a>
        </>
      )}
    </>
  )
  if (team.people.length <= leaders.length) {
    return <p className="mb-4 text-sm text-ink-muted">{summary}</p>
  }
  return (
    <details className="group mb-4 text-sm text-ink-muted">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {summary}
        <span className="ml-2 text-xs text-brand">
          <span className="group-open:hidden">All staff ▾</span>
          <span className="hidden group-open:inline">Hide ▴</span>
        </span>
      </summary>
      <ul className="mt-2 columns-1 gap-x-8 sm:columns-2 md:columns-3">
        {team.people.map((p) => (
          <li key={p.name} className="break-inside-avoid">
            <span className="text-ink">
              <Person person={p} withTitle={false} />
            </span>
            {p.title && <span className="text-xs"> · {p.title}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}
