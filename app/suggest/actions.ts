'use server'

// Submitting runs here rather than in the browser. The client bundle inlines
// NEXT_PUBLIC_ values at build time, so a schema configured that way is easy to
// get wrong — and did go wrong, sending inserts to `public`. On the server the
// schema comes from the running environment.
//
// This is still the user's own write: the client carries their cookie session,
// so RLS applies as them and the same policy (user_id = auth.uid()) governs it.
import { createUserSupabaseClient } from '@/db/supabase-auth'

export type SuggestionInput = {
  kind: 'new' | 'edit'
  grantId: string | null
  payload: Record<string, string>
  sourceUrl: string | null
  comment: string | null
}

export async function submitSuggestion(input: SuggestionInput): Promise<{ error?: string }> {
  const supabase = await createUserSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired — sign in again.' }
  if (Object.keys(input.payload).length === 0) return { error: 'Nothing to submit.' }

  const { error } = await supabase.from('suggestions').insert({
    user_id: user.id,
    user_email: user.email ?? null,
    kind: input.kind,
    grant_id: input.grantId,
    payload: input.payload,
    source_url: input.sourceUrl,
    comment: input.comment,
  })
  return error ? { error: error.message } : {}
}
