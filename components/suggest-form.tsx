'use client'

// Suggestion form: propose a new grant, or changes to an existing one.
// Writes straight to the `suggestions` table as the signed-in user (RLS
// requires user_id = auth.uid()), so no server action is needed.
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { submitSuggestion } from '@/app/suggest/actions'
import { MultiSelect } from '@/components/multi-select'
import { CAUSE_OPTIONS, displayCauses } from '@/utils/cause-tree'
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
  viaNames: string[]
  causes: string[]
}

// Only the date says what shape it wants, because that one is not guessable.
const FIELDS = [
  { key: 'funder_name', label: 'Funder', placeholder: '' },
  { key: 'recipient_name', label: 'Recipient', placeholder: '' },
  { key: 'via_names', label: 'Via (optional)', placeholder: '' },
  { key: 'amount_usd', label: 'Amount (USD)', placeholder: '' },
  { key: 'grant_date', label: 'Date', placeholder: 'YYYY-MM-DD, YYYY-MM or YYYY' },
  { key: 'description', label: 'Purpose', placeholder: '' },
] as const

// Indent the tree so the sub-causes read as sub-causes.
const CAUSE_CHOICES = CAUSE_OPTIONS.map((option) => ({
  value: option.slug,
  label: `${'\u00a0\u00a0'.repeat(option.depth)}${option.name}`,
}))

const label = 'block text-sm font-sans text-ink-muted'
const input = 'w-full rounded-sm border border-rule bg-paper px-2 py-1'

export function SuggestForm(props: { grant: ExistingGrant | null; signedIn: boolean }) {
  const router = useRouter()
  const kind = props.grant ? 'edit' : 'new'
  const [values, setValues] = useState<Record<string, string>>({})
  const [causes, setCauses] = useState<string[]>(props.grant?.causes ?? [])
  const [sourceUrl, setSourceUrl] = useState(props.grant?.url ?? '')
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
      case 'via_names':
        return g.viaNames.join(', ')
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
    // One link field, not two: it is the grant's page and the thing a
    // reviewer checks, and asking twice got the same URL pasted twice.
    const link = sourceUrl.trim()
    if (link && !(kind === 'edit' && link === (props.grant?.url ?? '').trim())) {
      payload.url = link
    }
    // The picker starts from the grant's current tags, so an edit sends
    // whenever the set differs — including down to none, which is how a
    // wrongly-tagged grant gets cleared.
    const causeKey = causes.join(',')
    if (kind === 'edit' ? causeKey !== (props.grant?.causes ?? []).join(',') : causes.length > 0) {
      payload.causes = causeKey
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
    const { error: submitError } = await submitSuggestion({
      kind,
      grantId: props.grant?.id ?? null,
      payload,
      sourceUrl: sourceUrl.trim() || null,
      comment: comment.trim() || null,
    })
    setBusy(false)
    if (submitError) {
      setError(submitError)
      return
    }
    setDone(true)
    router.refresh()
  }

  if (done)
    return (
      <p className="rounded-sm border border-rule bg-paper-alt p-3">
        Thanks — your suggestion is queued for review. See it on the <a href="/edit">edit page</a>.
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
        <span className={label}>
          Cause areas
          {props.grant && props.grant.causes.length > 0 && (
            <span className="ml-2 text-xs">
              now: {displayCauses(props.grant.causes).join(', ')}
            </span>
          )}
        </span>
        <div className="mt-1">
          <MultiSelect
            label={causes.length > 0 ? 'Cause areas' : 'Choose cause areas'}
            options={CAUSE_CHOICES}
            selected={causes}
            onChange={setCauses}
          />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="source_url">
          Source link
        </label>
        <input
          id="source_url"
          className={input}
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
