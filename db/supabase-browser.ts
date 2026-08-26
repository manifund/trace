'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { DB_SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

// Browser client: keeps the auth session in cookies so server components and
// RLS see the same user. @supabase/ssr's own generics resolve the schema to
// `never` against this supabase-js version, so the (runtime-identical) client
// is cast to the properly typed one.
export function createClientSupabase(): SupabaseClient<Database> {
  return createBrowserClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!
  ) as unknown as SupabaseClient<Database>
}
