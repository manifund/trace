import { AuthButton } from '@/components/auth-button'
import { ReviewButtons } from '@/components/review-buttons'
import { createAdminClient } from '@/db/supabase-admin'
import { getUser, isAdminEmail } from '@/db/supabase-auth'
import { createPublicSupabaseClient } from '@/db/supabase-server'
import { formatMoney } from '@/utils/format'

export const dynamic = 'force-dynamic'

const FIELD_LABELS: Record<string, string> = {
  funder_name: 'Funder',
  recipient_name: 'Recipient',
  amount_usd: 'Amount',
  grant_date: 'Date',
  description: 'Purpose',
  via_names: 'Via',
  causes: 'Cause areas',
  url: 'Source link',
}

export default async function Page() {
  const user = await getUser()
  const admin = isAdminEmail(user?.email)
  // Admins review everything; everyone else sees reviewed suggestions plus
  // their own pending ones (RLS enforces the latter).
  const supabase = admin ? createAdminClient() : createPublicSupabaseClient()
  const { data } = await supabase
    .from('suggestions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  const rows = data ?? []
  const pending = rows.filter((r) => r.status === 'pending')
  // Rejected suggestions stay off the page — they only clutter it. They remain
  // readable through the API; this is a display choice, not a privacy one.
  const reviewed = rows.filter(
    (r) => r.status === 'accepted' || (r.status === 'rejected' && (admin || r.user_id === user?.id))
  )

  const grantIds = rows.map((r) => r.grant_id).filter(Boolean) as string[]
  const grants = new Map<string, { funder: string; recipient: string; amount: number | null }>()
  if (grantIds.length > 0) {
    const { data: gs } = await createPublicSupabaseClient()
      .from('grants')
      .select('id, amount_usd, funder:funder_org_id(name), recipient:recipient_org_id(name)')
      .in('id', grantIds)
    for (const g of (gs ?? []) as never as {
      id: string
      amount_usd: number | null
      funder: { name: string }
      recipient: { name: string }
    }[])
      grants.set(g.id, { funder: g.funder.name, recipient: g.recipient.name, amount: g.amount_usd })
  }

  function Card(props: { row: (typeof rows)[number] }) {
    const row = props.row
    const payload = (row.payload ?? {}) as Record<string, string>
    const target = row.grant_id ? grants.get(row.grant_id) : null
    return (
      <div className="mb-3 rounded border border-rule p-3">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <span className="rounded bg-paper-alt px-2 py-0.5 font-sans text-xs uppercase text-ink-muted">
            {row.kind === 'new' ? 'Suggested grant' : 'Suggested edit'}
          </span>
          {row.status !== 'pending' && (
            <span className="font-sans text-xs uppercase text-ink-muted">{row.status}</span>
          )}
          <span className="text-xs text-ink-muted">
            {row.created_at.slice(0, 10)}
            {row.user_email && ` · ${row.user_email}`}
          </span>
        </div>
        {target && (
          <div className="text-sm text-ink-muted">
            on: {target.funder} → {target.recipient} · {formatMoney(target.amount)}
          </div>
        )}
        <ul className="mt-1 text-sm">
          {Object.entries(payload).map(([key, value]) => (
            <li key={key}>
              <span className="text-ink-muted">{FIELD_LABELS[key] ?? key}:</span> {String(value)}
            </li>
          ))}
        </ul>
        {row.source_url && (
          <p className="mt-1 text-sm">
            Source: <a href={row.source_url}>{row.source_url}</a>
          </p>
        )}
        {row.comment && <p className="mt-1 text-sm text-ink-muted">{row.comment}</p>}
        {row.review_note && (
          <p className="mt-1 text-sm text-ink-muted">
            Reviewer: {row.review_note} {row.reviewer && `— ${row.reviewer}`}
          </p>
        )}
        {admin && row.status === 'pending' && <ReviewButtons id={row.id} />}
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl font-bold">Suggestions</h1>
        <AuthButton email={user?.email ?? null} />
      </div>
      <p className="mb-4 text-ink-muted">
        Anyone signed in can <a href="/suggest">suggest a grant</a> or an edit to an existing one.
      </p>

      <h2 className="mb-2 font-serif text-lg font-bold">
        Pending {pending.length > 0 && `(${pending.length})`}
      </h2>
      {pending.length === 0 ? (
        <p className="mb-6 text-ink-muted">
          {user ? 'Nothing pending.' : 'Sign in to see your own pending suggestions.'}
        </p>
      ) : (
        pending.map((row) => <Card key={row.id} row={row} />)
      )}

      {reviewed.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 font-serif text-lg font-bold">Accepted</h2>
          {reviewed.map((row) => (
            <Card key={row.id} row={row} />
          ))}
        </>
      )}
    </div>
  )
}
