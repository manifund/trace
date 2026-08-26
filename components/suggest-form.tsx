'use client'

// Suggestion form: propose a new grant, or changes to an existing one.
// Writes straight to the `suggestions` table as the signed-in user (RLS
// requires user_id = auth.uid()), so no server action is needed.
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClientSupabase } from '@/db/supabase-browser'
import { formatGrantDate, formatMoney } from '@/utils/format'

export type ExistingGrant = {
  id: string
  funderName: string
  recipientName: string
  amountUsd: number | null
  date: string | null
  datePrecision: 'day' | 'month' | 'year' | null
  description: string | null
  url: string | null
}

const FIELDS = [
  { key: 'funder_name', label: 'Funder', placeholder: 'Organization or person giving the money' },
  { key: 'recipient_name', label: 'Recipient', placeholder: 'Who received it' },
  { key: 'amount_usd', label: 'Amount (USD)', placeholder: '250000' },
  { key: 'grant_date', label: 'Date', placeholder: 'YYYY-MM-DD, YYYY-MM or YYYY' },
  { key: 'description', label: 'Purpose', placeholder: 'What the grant is for' },
  { key: 'url', label: 'Grant page', placeholder: 'Link to the grant on the funder’s site' },
] as const

const label = 'block text-sm font-sans text-ink-muted'
const input = 'w-full rounded-sm border border-rule bg-paper px-2 py-1'

export function SuggestForm(props: { grant: ExistingGrant | null; signedIn: boolean }) {
  const router = useRouter()
  const kind = props.grant ? 'edit' : 'new'
  const [values, setValues] = useState<Record<string, string>>({})
  const [sourceUrl, setSourceUrl] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const current = (key: string): string => {
    const g = props.grant
    if (!g) return ''
    switch (key) {
      case 'funder_name':
        return g.funderName
      case 'recipient_name':
        return g.recipientName
      case 'amount_usd':
        return g.amountUsd === null ? '' : String(g.amountUsd)
      case 'grant_date':
        return g.date ?? ''
      case 'description':
        return g.description ?? ''
      case 'url':
        return g.url ?? ''
      default:
        return ''
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    // For an edit, only send fields the suggester actually changed.
    const payload: Record<string, string> = {}
    for (const field of FIELDS) {
      const value = (values[field.key] ?? '').trim()
      if (!value) continue
      if (kind === 'edit' && value === current(field.key).trim()) continue
      payload[field.key] = value
    }
    if (Object.keys(payload).length === 0) {
      setError(kind === 'edit' ? 'Change at least one field.' : 'Fill in at least one field.')
      return
    }
    if (kind === 'new' && (!payload.funder_name || !payload.recipient_name)) {
      setError('A new grant needs at least a funder and a recipient.')
      return
    }
    setBusy(true)
    const supabase = createClientSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setBusy(false)
      setError('Your session expired — sign in again.')
      return
    }
    const { error: insertError } = await supabase.from('suggestions').insert({
      user_id: user.id,
      user_email: user.email ?? null,
      kind,
      grant_id: props.grant?.id ?? null,
      payload,
      source_url: sourceUrl.trim() || null,
      comment: comment.trim() || null,
    })
    setBusy(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setDone(true)
    router.refresh()
  }

  if (done)
    return (
      <p className="rounded-sm border border-rule bg-paper-alt p-3">
        Thanks — your suggestion is queued for review. See it on the{' '}
        <a href="/suggestions">suggestions page</a>.
      </p>
    )

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-3">
      {props.grant && (
        <div className="rounded-sm border border-rule bg-paper-alt p-3 text-sm">
          Editing: <strong>{props.grant.funderName}</strong> → {props.grant.recipientName} ·{' '}
          {formatMoney(props.grant.amountUsd)} ·{' '}
          {formatGrantDate(props.grant.date, props.grant.datePrecision)}
          <div className="mt-1 text-ink-muted">Leave a field blank to keep it as it is.</div>
        </div>
      )}
      {FIELDS.map((field) => (
        <div key={field.key}>
          <label className={label} htmlFor={field.key}>
            {field.label}
            {props.grant && current(field.key) && (
              <span className="ml-2 text-xs">now: {current(field.key).slice(0, 80)}</span>
            )}
          </label>
          <input
            id={field.key}
            className={input}
            placeholder={field.placeholder}
            value={values[field.key] ?? ''}
            onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
          />
        </div>
      ))}
      <div>
        <label className={label} htmlFor="source_url">
          Source link
        </label>
        <input
          id="source_url"
          className={input}
          placeholder="Where this can be verified — optional, but it speeds up review"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
      </div>
      <div>
        <label className={label} htmlFor="comment">
          Explanation
        </label>
        <textarea
          id="comment"
          className={`${input} h-24`}
          placeholder="How you know this, or anything a reviewer should check"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-(--s4)">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={busy || !props.signedIn}
          className="rounded-sm border border-rule bg-paper-alt px-3 py-1 disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Submit suggestion'}
        </button>
      </div>
    </form>
  )
}
