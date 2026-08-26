// Copies every Trace table from one Supabase project/schema to another, in
// dependency order. Used to move Trace's data into a `trace` schema inside the
// Manifund project so Manifund logins work with RLS natively.
//
//   SOURCE_URL=... SOURCE_SERVICE_KEY=... SOURCE_SCHEMA=public \
//   TARGET_URL=... TARGET_SERVICE_KEY=... TARGET_SCHEMA=trace \
//   bun run scripts/copy-database.ts [--wipe] [--verify-only]
//
// Reads only from the source. `--wipe` clears the target tables first (target
// only, in reverse dependency order); without it, rows are upserted by primary
// key so the copy is resumable. `--verify-only` just compares row counts.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Parents before children: every table's foreign keys point at earlier ones.
const TABLES = [
  'cause_areas',
  'sources',
  'orgs',
  'org_names',
  'source_records',
  'grants',
  'grant_cause_areas',
  'grant_sources',
  'grant_vias',
  'dedup_candidates',
  'suggestions',
] as const

// Composite-key tables have no single id to upsert on.
const CONFLICT_KEYS: Partial<Record<(typeof TABLES)[number], string>> = {
  grant_cause_areas: 'grant_id,cause_area_id',
  grant_vias: 'grant_id,via_org_id',
  grant_sources: 'grant_id,source_record_id',
}

// Self-referencing columns can point at a row that a later page will insert,
// so they are nulled on the way in and set once every row exists.
const SELF_REFS: Partial<Record<(typeof TABLES)[number], string>> = {
  grants: 'superseded_by',
}

const PAGE = 500

function client(url: string | undefined, key: string | undefined, schema: string) {
  if (!url || !key)
    throw new Error('Set SOURCE_URL/SOURCE_SERVICE_KEY and TARGET_URL/TARGET_SERVICE_KEY')
  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema },
  }) as unknown as SupabaseClient
}

async function count(db: SupabaseClient, table: string): Promise<number> {
  const { count: n, error } = await db.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  return n ?? 0
}

async function main() {
  const source = client(
    process.env.SOURCE_URL,
    process.env.SOURCE_SERVICE_KEY,
    process.env.SOURCE_SCHEMA ?? 'public'
  )
  const target = client(
    process.env.TARGET_URL,
    process.env.TARGET_SERVICE_KEY,
    process.env.TARGET_SCHEMA ?? 'trace'
  )
  const verifyOnly = process.argv.includes('--verify-only')
  const wipe = process.argv.includes('--wipe')

  if (verifyOnly) {
    let ok = true
    for (const table of TABLES) {
      const [from, to] = await Promise.all([count(source, table), count(target, table)])
      const match = from === to
      ok &&= match
      console.log(`${match ? 'OK  ' : 'DIFF'} ${table.padEnd(18)} source ${from} / target ${to}`)
    }
    console.log(ok ? '\nrow counts match' : '\nMISMATCH — re-run the copy')
    process.exit(ok ? 0 : 1)
  }

  if (wipe) {
    for (const table of [...TABLES].reverse()) {
      // Join tables key on grant_id rather than a synthetic id.
      const keyColumn = (CONFLICT_KEYS[table] ?? 'id').split(',')[0]
      const { error } = await target.from(table).delete().not(keyColumn, 'is', null)
      if (error) throw new Error(`wipe ${table}: ${error.message}`)
    }
    console.log('target cleared')
  }

  const deferred: { table: string; id: string; column: string; value: unknown }[] = []
  for (const table of TABLES) {
    const total = await count(source, table)
    let copied = 0
    for (let from = 0; from < Math.max(total, 1); from += PAGE) {
      const { data, error } = await source
        .from(table)
        .select('*')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`read ${table}: ${error.message}`)
      if (!data || data.length === 0) break
      const selfRef = SELF_REFS[table]
      const rows = selfRef
        ? data.map((row) => {
            const value = (row as Record<string, unknown>)[selfRef]
            if (value)
              deferred.push({ table, id: (row as { id: string }).id, column: selfRef, value })
            return { ...(row as Record<string, unknown>), [selfRef]: null }
          })
        : data
      const { error: writeError } = await target
        .from(table)
        .upsert(rows, { onConflict: CONFLICT_KEYS[table] ?? 'id' })
      if (writeError) throw new Error(`write ${table}: ${writeError.message}`)
      copied += data.length
    }
    console.log(`${table.padEnd(18)} ${copied}/${total}`)
  }

  // Second pass: restore the self-references now that every row is present.
  if (deferred.length > 0) {
    const byValue = new Map<string, { table: string; column: string; ids: string[] }>()
    for (const row of deferred) {
      const key = `${row.table}|${row.column}|${String(row.value)}`
      const entry = byValue.get(key) ?? { table: row.table, column: row.column, ids: [] }
      entry.ids.push(row.id)
      byValue.set(key, entry)
    }
    const jobs = Array.from(byValue.entries())
    for (let i = 0; i < jobs.length; i += 20) {
      await Promise.all(
        jobs.slice(i, i + 20).map(async ([key, entry]) => {
          const value = key.split('|')[2]
          const { error } = await target
            .from(entry.table)
            .update({ [entry.column]: value })
            .in('id', entry.ids)
          if (error) throw new Error(`link ${entry.table}.${entry.column}: ${error.message}`)
        })
      )
    }
    console.log(`linked ${deferred.length} self-references`)
  }
  console.log('\ndone — run with --verify-only to compare row counts')
}

await main()
