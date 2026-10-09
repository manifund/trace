// Cross-source grant dedup. Default: report candidate pairs and record them in
// dedup_candidates. With --apply: also execute the decisions listed in
// data/dedup-resolutions.json (keyed by the two grants' provenance keys,
// sorted, joined with ' || ').
// Merge keeps the grant whose source ranks higher in PRIORITY; the loser's
// grant_sources repoint to the winner and the loser becomes 'superseded'.
import resolutionsFile from '@/data/dedup-resolutions.json'
import { createAdminClient } from '@/db/supabase-admin'

// Original sources outrank Vipul's aggregate mirror; anything unlisted ranks
// just above vipul_donations (see rank()).
const PRIORITY = [
  'sff',
  'ea_funds',
  'manifund',
  'coefficient_giving',
  'fli',
  'longview',
  'schmidt_sciences',
  'foresight',
  'clr_fund',
  'sentinel_bio',
  'acx_grants',
  'jefftk',
  'uk_aisi',
  'irs_990',
  'ftx_future_fund',
  'jaan_online',
  'vipul_donations',
]

const RESOLUTIONS: Record<string, 'merged' | 'distinct'> = (
  resolutionsFile as never as { resolutions: Record<string, 'merged' | 'distinct'> }
).resolutions

type GrantInfo = {
  id: string
  funder: string
  recipient: string
  sponsor: string | null
  amountUsd: number | null
  date: string | null
  sourceId: string
  provenanceKey: string
}

const db = createAdminClient()

async function loadGrants(): Promise<GrantInfo[]> {
  const grants: GrantInfo[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('grant_sources')
      .select(
        `is_primary,
         grants!inner(id, funder_org_id, recipient_org_id, fiscal_sponsor_org_id, amount_usd, grant_date, status),
         source_records!inner(source_id, source_record_key)`
      )
      .eq('is_primary', true)
      .eq('grants.status', 'approved')
      .range(from, from + 999)
      .throwOnError()
    const rows = (data ?? []) as never as {
      grants: {
        id: string
        funder_org_id: string
        recipient_org_id: string
        fiscal_sponsor_org_id: string | null
        amount_usd: number | null
        grant_date: string | null
      }
      source_records: { source_id: string; source_record_key: string }
    }[]
    for (const row of rows) {
      const grant = row.grants
      const record = row.source_records
      grants.push({
        id: grant.id,
        funder: grant.funder_org_id,
        recipient: grant.recipient_org_id,
        sponsor: grant.fiscal_sponsor_org_id,
        amountUsd: grant.amount_usd,
        date: grant.grant_date,
        sourceId: record.source_id,
        provenanceKey: `${record.source_id}:${record.source_record_key}`,
      })
    }
    if (!data || data.length < 1000) break
  }
  return grants
}

function daysApart(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000
}

function isCandidate(a: GrantInfo, b: GrantInfo): string | null {
  if (a.sourceId === b.sourceId) return null
  if (a.funder !== b.funder) return null
  const recipientMatch =
    a.recipient === b.recipient || a.recipient === b.sponsor || a.sponsor === b.recipient
  if (!recipientMatch) return null
  if (a.amountUsd === null || b.amountUsd === null) return null
  const amountDelta = Math.abs(a.amountUsd - b.amountUsd) / Math.max(a.amountUsd, b.amountUsd)
  if (amountDelta > 0.01) return null
  const days = daysApart(a.date, b.date)
  if (days !== null && days > 180) return null
  return `same funder+recipient, amount within 1%, dates within ${days === null ? '?' : Math.round(days)}d`
}

function resolutionKey(a: GrantInfo, b: GrantInfo): string {
  return [a.provenanceKey, b.provenanceKey].sort().join(' || ')
}

async function merge(winner: GrantInfo, loser: GrantInfo) {
  await db
    .from('grant_sources')
    .update({ grant_id: winner.id, is_primary: false })
    .eq('grant_id', loser.id)
    .throwOnError()
  await db
    .from('grants')
    .update({ status: 'superseded', superseded_by: winner.id })
    .eq('id', loser.id)
    .throwOnError()
}

async function main() {
  const apply = process.argv.includes('--apply')
  const grants = await loadGrants()

  // Bucket by recipient-side org to avoid O(n^2) over everything.
  const buckets = new Map<string, GrantInfo[]>()
  for (const grant of grants) {
    for (const key of new Set([grant.recipient, grant.sponsor].filter(Boolean) as string[])) {
      const bucket = buckets.get(key) ?? []
      bucket.push(grant)
      buckets.set(key, bucket)
    }
  }

  const seenPairs = new Set<string>()
  let pending = 0
  let merged = 0
  let distinct = 0
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i]
        const b = bucket[j]
        const pairKey = [a.id, b.id].sort().join('|')
        if (seenPairs.has(pairKey)) continue
        // A hand-recorded resolution overrides the heuristic windows (e.g. an
        // announcement and its payout more than 180 days apart).
        const reason =
          isCandidate(a, b) ?? (RESOLUTIONS[resolutionKey(a, b)] ? 'manually recorded pair' : null)
        if (!reason) continue
        seenPairs.add(pairKey)

        const resolution = RESOLUTIONS[resolutionKey(a, b)]
        const [idA, idB] = [a.id, b.id].sort()
        if (resolution === 'distinct') {
          distinct++
          await db
            .from('dedup_candidates')
            .upsert(
              {
                grant_id_a: idA,
                grant_id_b: idB,
                reason,
                status: 'distinct',
                resolved_at: new Date().toISOString(),
              },
              { onConflict: 'grant_id_a,grant_id_b' }
            )
            .throwOnError()
          continue
        }
        if (resolution === 'merged' && apply) {
          // Sources missing from PRIORITY rank last, not first.
          const rank = (sourceId: string) => {
            const i = PRIORITY.indexOf(sourceId)
            return i === -1 ? PRIORITY.indexOf('vipul_donations') - 0.5 : i
          }
          const [winner, loser] = rank(a.sourceId) <= rank(b.sourceId) ? [a, b] : [b, a]
          await merge(winner, loser)
          merged++
          await db
            .from('dedup_candidates')
            .upsert(
              {
                grant_id_a: idA,
                grant_id_b: idB,
                reason,
                status: 'merged',
                resolved_at: new Date().toISOString(),
              },
              { onConflict: 'grant_id_a,grant_id_b' }
            )
            .throwOnError()
          continue
        }
        pending++
        await db
          .from('dedup_candidates')
          .upsert(
            { grant_id_a: idA, grant_id_b: idB, reason, status: 'pending' },
            { onConflict: 'grant_id_a,grant_id_b', ignoreDuplicates: true }
          )
          .throwOnError()
        console.log(`CANDIDATE ${resolutionKey(a, b)}`)
        console.log(`  ${reason}; $${a.amountUsd} vs $${b.amountUsd}`)
      }
    }
  }
  // Recorded resolutions can pair grants the heuristics never compare (e.g.
  // the two sources name the recipient differently, so they sit in different
  // buckets). Process them directly by provenance key.
  const byProvenance = new Map(grants.map((g) => [g.provenanceKey, g]))
  for (const [rkey, resolution] of Object.entries(RESOLUTIONS)) {
    if (resolution !== 'merged' || !apply) continue
    const [keyA, keyB] = rkey.split(' || ')
    const a = byProvenance.get(keyA)
    const b = byProvenance.get(keyB)
    if (!a || !b || a.id === b.id) continue
    const pairKey = [a.id, b.id].sort().join('|')
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)
    const rank = (sourceId: string) => {
      const i = PRIORITY.indexOf(sourceId)
      return i === -1 ? PRIORITY.indexOf('vipul_donations') - 0.5 : i
    }
    const [winner, loser] = rank(a.sourceId) <= rank(b.sourceId) ? [a, b] : [b, a]
    await merge(winner, loser)
    merged++
    const [idA, idB] = [a.id, b.id].sort()
    await db
      .from('dedup_candidates')
      .upsert(
        {
          grant_id_a: idA,
          grant_id_b: idB,
          reason: 'manually recorded pair',
          status: 'merged',
          resolved_at: new Date().toISOString(),
        },
        { onConflict: 'grant_id_a,grant_id_b' }
      )
      .throwOnError()
  }

  console.log(JSON.stringify({ grants: grants.length, pending, merged, distinct, applied: apply }))
  if (pending > 0) {
    console.log('Resolve pending pairs in data/dedup-resolutions.json, then run dedup --apply')
  }
}

await main()
