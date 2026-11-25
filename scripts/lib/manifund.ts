import { createClient } from '@supabase/supabase-js'

// Read-only client for Manifund's own tables (projects, txns, profiles,
// comments). Trace lives in a schema of Manifund's Supabase project, so
// Trace's public URL and anon key are Manifund's; this client just reads the
// default `public` schema instead of `trace`.
export function createManifundClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createClient(url, key)
}
