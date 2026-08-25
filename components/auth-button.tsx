'use client'

// Google sign-in / sign-out. Sessions live in cookies so server components
// and RLS see the same user.
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClientSupabase } from '@/db/supabase-browser'

export function AuthButton(props: { email: string | null; next?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    const supabase = createClientSupabase()
    const next = props.next ?? window.location.pathname + window.location.search
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) {
      setBusy(false)
      alert(`Sign-in failed: ${error.message}`)
    }
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
      {busy ? 'Redirecting…' : 'Sign in with Google'}
    </button>
  )
}
