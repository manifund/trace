export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Which Postgres schema Trace's tables live in: `trace`, inside Manifund's
// Supabase project, where `public` belongs to Manifund. Defaulted rather than
// read from the environment because client bundles inline this at build time —
// a missing variable silently sent browser queries to `public`. Override only
// when pointing at a database that keeps these tables somewhere else.
export const DB_SCHEMA = process.env.NEXT_PUBLIC_TRACE_DB_SCHEMA ?? 'trace'

// Set to `.manifund.org` so the Supabase auth cookie is shared with
// manifund.org: signing in on either site signs you into both. Only safe once
// Manifund sets the same domain — two cookies of the same name (one host-only,
// one domain-wide) would otherwise fight. Unset locally.
export const AUTH_COOKIE_DOMAIN = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN
