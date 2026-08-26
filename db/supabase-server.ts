import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { DB_SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

// No auth in v1, so a plain anon client is all server components need.
export function createPublicSupabaseClient() {
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    db: { schema: DB_SCHEMA as 'public' },
  })
}
