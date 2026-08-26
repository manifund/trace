// "Biggest recipients", "biggest funders", "biggest cause areas": the few rows
// that answer most questions about an org before anyone scrolls to the full
// grant history.
import { formatMoney } from '@/utils/format'

export type BreakdownRow = { name: string; slug?: string; amount: number; count: number }

export function OrgBreakdown(props: { title: string; rows: BreakdownRow[]; limit?: number }) {
  const limit = props.limit ?? 8
  const total = props.rows.reduce((sum, row) => sum + row.amount, 0)
  if (props.rows.length === 0 || total <= 0) return null
  const shown = props.rows.slice(0, limit)
  return (
    <section className="mb-6 min-w-64 flex-1">
      <h3 className="mb-1 font-sans text-xs uppercase tracking-wide text-ink-muted">
        {props.title}
      </h3>
      <table className="gb-table">
        <tbody>
          {shown.map((row) => (
            <tr key={row.name}>
              <td>{row.slug ? <a href={`/orgs/${row.slug}`}>{row.name}</a> : row.name}</td>
              <td className="gb-num whitespace-nowrap">{formatMoney(row.amount)}</td>
              <td className="gb-num whitespace-nowrap text-xs text-ink-muted">
                {Math.round((row.amount / total) * 100)}%
              </td>
              <td className="gb-num whitespace-nowrap text-xs text-ink-muted">
                {row.count.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
