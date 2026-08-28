import { NextResponse } from 'next/server'
import { createUserSupabaseClient } from '@/db/supabase-auth'

// OAuth redirect target: swaps the code for a session cookie.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/edit'
  if (code) {
    const supabase = await createUserSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        new URL(`/edit?error=${encodeURIComponent(error.message)}`, url.origin)
      )
    }
  }
  return NextResponse.redirect(new URL(next, url.origin))
}
