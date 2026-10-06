// Applies one migration file to the `trace` schema of the hosted project
// through the Supabase Management API (the project has no direct Postgres
// access from here). Needs a personal access token.
// Usage: SUPABASE_PAT=sbp_... bun run scripts/apply-trace-migration.ts supabase/migrations/<file>.sql
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) throw new Error('Usage: bun run scripts/apply-trace-migration.ts <migration.sql>')
const pat = process.env.SUPABASE_PAT
if (!pat) throw new Error('Set SUPABASE_PAT (Supabase personal access token)')
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/(\w+)\.supabase\.co/)?.[1]
if (!projectRef) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
const schema = process.env.NEXT_PUBLIC_TRACE_DB_SCHEMA || 'trace'

const query = `SET search_path = ${schema}, public;\n${readFileSync(file, 'utf8')}`
const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${pat}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
})
const text = await res.text()
if (!res.ok || /"message"/.test(text)) throw new Error(`FAILED (${res.status}): ${text}`)
console.log(`Applied ${file} to schema ${schema} on ${projectRef}`)
