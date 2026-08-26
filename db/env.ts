export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Which Postgres schema Trace's tables live in. `public` in Trace's own
// Supabase project; `trace` once hosted inside Manifund's project, where
// `public` belongs to Manifund.
export const DB_SCHEMA = process.env.NEXT_PUBLIC_TRACE_DB_SCHEMA ?? 'public'
