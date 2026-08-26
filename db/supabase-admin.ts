// Write client for ingestion scripts and admin server actions.
//
// Two shapes, depending on where Trace's tables live:
//   * its own project — the project's service_role key
//   * inside Manifund's project — a JWT minted for the `trace_writer` role,
//     which can reach the `trace` schema and nothing else, so Trace's
//     automation cannot touch Manifund's data even by accident. The gateway
//     still wants a valid publishable key in `apikey`, so the anon key rides
//     along and the role token goes in Authorization.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { DB_SCHEMA, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from './env'

const TRACE_WRITER_JWT = process.env.TRACE_WRITER_JWT

export function createAdminClient() {
  if (!SUPABASE_URL) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL')
  if (TRACE_WRITER_JWT) {
    if (!SUPABASE_ANON_KEY) throw new Error('Set NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      db: { schema: DB_SCHEMA as 'public' },
      global: { headers: { Authorization: `Bearer ${TRACE_WRITER_JWT}` } },
    })
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Set SUPABASE_SERVICE_ROLE_KEY or TRACE_WRITER_JWT')
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: DB_SCHEMA as 'public' },
  })
}
