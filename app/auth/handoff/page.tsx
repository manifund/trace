'use client'

// Lands here from Manifund's /sso route, which appends the signed-in user's
// Supabase tokens as a URL fragment (fragments never reach a server). We swap
// them for a session cookie on this host, wipe them from the address bar, and
// carry on. Both sites share one Supabase project, so this is the same account
// and the same tokens — only the cookie is per-host.
import { useEffect, useState } from 'react'
import { createClientSupabase } from '@/db/supabase-browser'

export default function Page() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const next = params.get('next') || '/suggestions'
    if (!accessToken || !refreshToken) {
      setError('No sign-in details were passed along. Try signing in again.')
      return
    }
    // Drop the tokens from the URL before anything can record them.
    window.history.replaceState(null, '', window.location.pathname)
    createClientSupabase()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError(sessionError.message)
          return
        }
        window.location.replace(next.startsWith('/') ? next : '/suggestions')
      })
  }, [])

  return (
    <p className="text-ink-muted">
      {error ? (
        <>
          {error} <a href="/suggestions">Back to suggestions</a>.
        </>
      ) : (
        'Signing you in…'
      )}
    </p>
  )
}
