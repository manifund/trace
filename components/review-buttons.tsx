'use client'

import { useState, useTransition } from 'react'
import { acceptSuggestion, rejectSuggestion } from '@/app/suggestions/actions'

export function ReviewButtons(props: { id: string }) {
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (fn: (id: string, note: string) => Promise<void>) =>
    start(async () => {
      setError(null)
      try {
        await fn(props.id, note)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        className="rounded border border-rule bg-paper px-2 py-1 text-sm"
        placeholder="Review note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        onClick={() => run(acceptSuggestion)}
        disabled={pending}
        className="rounded border border-rule bg-paper-alt px-3 py-1 text-sm disabled:opacity-50"
      >
        Accept
      </button>
      <button
        onClick={() => run(rejectSuggestion)}
        disabled={pending}
        className="rounded border border-rule bg-paper-alt px-3 py-1 text-sm disabled:opacity-50"
      >
        Reject
      </button>
      {error && <span className="text-sm text-[var(--s4)]">{error}</span>}
    </div>
  )
}
