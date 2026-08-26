import 'server-only'

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { DB_SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

// Request-scoped client that carries the signed-in user's session, so RLS
// applies as that user. Use createPublicSupabaseClient for anonymous reads.
export async function createUserSupabaseClient(): Promise<SupabaseClient<Database>> {
  const store = await cookies()
  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    db: { schema: DB_SCHEMA },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // Called from a server component: the middleware refreshes instead.
        }
      },
    },
  }) as unknown as SupabaseClient<Database>
}

export async function getUser() {
  const supabase = await createUserSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

// Admins may review suggestions. Set ADMIN_EMAILS to a comma-separated list.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(email.toLowerCase())
}
