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
    // Local scope: drop this site's session only. The default is 'global',
    // which revokes every refresh token the account has — and since Manifund
    // signs in against the same Supabase project, signing out of Trace was
    // signing you out of Manifund too. The next "Sign in with Manifund" then
    // found nobody to hand over and dropped you on Manifund's login instead
    // of coming back here.
    await createClientSupabase().auth.signOut({ scope: 'local' })
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
      className="rounded-sm border border-rule bg-paper-alt px-3 py-1 text-sm"
    >
      {busy ? 'Redirecting…' : 'Sign in with Manifund'}
    </button>
  )
}
