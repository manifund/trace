// The headline numbers on an org page: a small uppercase label over a big
// figure, with an optional line of detail underneath.
export type Stat = { label: string; value: string; detail?: string }

export function OrgStats(props: { stats: Stat[] }) {
  return (
    <dl className="mb-8 flex flex-wrap gap-x-10 gap-y-4">
      {props.stats.map((stat) => (
        <div key={stat.label}>
          <dt className="font-sans text-xs uppercase tracking-wide text-ink-muted">{stat.label}</dt>
          <dd className="font-display text-2xl font-bold tabular-nums">{stat.value}</dd>
          {stat.detail && <dd className="text-xs text-ink-muted">{stat.detail}</dd>}
        </div>
      ))}
    </dl>
  )
}
