'use client'

// Sign-in goes through Manifund: its /sso route hands this site the session of
// whoever is already signed in there, so a Manifund user is one redirect away
// from being signed in here — and nobody needs a second account, since both
// sites share a Supabase project.
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClientSupabase } from '@/db/supabase-browser'

const MANIFUND_SSO = 'https://manifund.org/sso'

export function AuthButton(props: { email: string | null; next?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  function signIn() {
    setBusy(true)
    const next = props.next ?? window.location.pathname + window.location.search
    const back = `${window.location.origin}/auth/handoff`
    window.location.href = `${MANIFUND_SSO}?next=${encodeURIComponent(back)}&then=${encodeURIComponent(next)}`
  }

  async function signOut() {
    setBusy(true)
    await createClientSupabase().auth.signOut()
    setBusy(false)
    router.refresh()
  }

  if (props.email)
    return (
      <span className="text-sm text-ink-muted">
        {props.email}{' '}
        <button onClick={signOut} disabled={busy} className="underline">
          sign out
        </button>
      </span>
    )
  return (
    <button
      onClick={signIn}
      disabled={busy}
      className="rounded border border-rule bg-paper-alt px-3 py-1 text-sm"
    >
      {busy ? 'Redirecting…' : 'Sign in with Manifund'}
    </button>
  )
}
