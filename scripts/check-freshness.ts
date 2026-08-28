// Fails when a source that is supposed to refresh often hasn't.
//
// A workflow that errors sends mail; a workflow GitHub never starts sends
// nothing at all, and scheduled runs are best-effort — ours skipped a day in
// its first two. So the check lives in a *different* workflow from the one
// that does the ingesting, and notices the silence.
import { createAdminClient } from '@/db/supabase-admin'

const MAX_AGE_HOURS: Record<string, number> = {
  manifund: 30,
}

const db = createAdminClient()
const { data } = await db.from('sources').select('id, name, last_ingested_at').throwOnError()

let stale = false
for (const [id, limit] of Object.entries(MAX_AGE_HOURS)) {
  const source = (data ?? []).find((s) => s.id === id)
  if (!source) {
    console.error(`FAIL ${id}: not registered`)
    stale = true
    continue
  }
  if (!source.last_ingested_at) {
    console.error(`FAIL ${id}: never ingested`)
    stale = true
    continue
  }
  const hours = (Date.now() - new Date(source.last_ingested_at).getTime()) / 3600e3
  const line = `${id}: last ingested ${hours.toFixed(1)}h ago (limit ${limit}h)`
  if (hours > limit) {
    console.error(`FAIL ${line}`)
    stale = true
  } else {
    console.log(`ok   ${line}`)
  }
}

if (stale) {
  console.error('\nScheduled ingests are not running. Check the Actions tab.')
  process.exit(1)
}
