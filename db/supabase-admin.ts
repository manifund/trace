// Service-role client for ingestion scripts. Never import from app code.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { DB_SCHEMA, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from './env'

export function createAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: DB_SCHEMA as 'public' },
  })
}
