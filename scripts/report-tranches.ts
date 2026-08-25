// Finds SFF grants that jaan.online records as several payments — SFF
// publishes the recommendation, Jaan's log lists the speculation advance(s)
// plus the balance paid later through Founders Pledge, so both sources
// describe the same money and the parts double-count the whole.
//
// Only SFF-vehicle payments (SFF, the SF committee, Founders Pledge) inside
// the round's window are considered; his Lightspeed/Solenum/other giving is
// separate money and is never folded in. Prints the groups; --write records
// each component against the SFF grant in data/dedup-resolutions.json, after
// which `bun run dedup --apply` performs the merges.
import { readFileSync, writeFileSync } from 'fs'
import { createAdminClient } from '@/db/supabase-admin'

const db = createAdminClient()

const SFF_VEHICLES = [
  'Survival and Flourishing Fund',
  'Survival and Flourishing Com',
  'Founders Pledge',
]
// Recipients where more than one grouping fits the arithmetic, so no
// grouping can be trusted without knowing which payment settles which
// round. Resolved by hand in dedup-resolutions.json instead — for CAIS
// Action Fund, Caroline confirmed the $720k/$400k/$501k payments complete
// the $1.621m SFF-2024 grant.
const AMBIGUOUS_RECIPIENTS = ['Center for AI Safety Action Fund, Inc.']
const WINDOW_BEFORE_DAYS = 210
const WINDOW_AFTER_DAYS = 180
const MAX_COMPONENTS = 4
const TOLERANCE = 0.005

type Row = {
  id: string
  key: string
  source: string
  amount: number
  date: string
  recipient: string
  funder: string
  vias: string[]
}

async function loadRows(): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('grants')
      .select(
        'id, amount_usd, grant_date, recipient:recipient_org_id(name), funder:funder_org_id(name), grant_vias(orgs:via_org_id(name)), grant_sources(is_primary, source_records(source_id, source_record_key))'
      )
      .eq('status', 'approved')
      .range(from, from + 999)
      .throwOnError()
    type Raw = {
      id: string
      amount_usd: number | null
      grant_date: string | null
      recipient: { name: string }
      funder: { name: string }
      grant_vias: { orgs: { name: string } }[]
      grant_sources: {
        is_primary: boolean
        source_records: { source_id: string; source_record_key: string }
      }[]
    }
    for (const grant of (data ?? []) as never as Raw[]) {
      const primary = grant.grant_sources.find((s) => s.is_primary)?.source_records
      if (!primary || grant.amount_usd === null || !grant.grant_date) continue
      if (primary.source_id !== 'sff' && primary.source_id !== 'jaan_online') continue
      rows.push({
        id: grant.id,
        key: `${primary.source_id}:${primary.source_record_key}`,
        source: primary.source_id,
        amount: grant.amount_usd,
        date: grant.grant_date,
        recipient: grant.recipient.name,
        funder: grant.funder.name,
        vias: grant.grant_vias.map((v) => v.orgs.name),
      })
    }
    if (!data || data.length < 1000) break
  }
  return rows
}

const days = (a: string, b: string) =>
  (new Date(a).getTime() - new Date(b).getTime()) / (24 * 60 * 60 * 1000)

async function main() {
  const rows = await loadRows()
  const byRecipient = new Map<string, Row[]>()
  for (const row of rows) {
    const list = byRecipient.get(row.recipient) ?? []
    list.push(row)
    byRecipient.set(row.recipient, list)
  }

  type Group = { sff: Row; parts: Row[]; spread: number }
  const groups: Group[] = []
  for (const [recipient, list] of byRecipient) {
    if (AMBIGUOUS_RECIPIENTS.includes(recipient)) {
      console.log(`SKIP ${recipient}: multiple groupings fit — resolve by hand`)
      continue
    }
    for (const sff of list.filter((r) => r.source === 'sff')) {
      const pool = list.filter(
        (r) =>
          r.source === 'jaan_online' &&
          r.funder === sff.funder &&
          r.vias.some((v) => SFF_VEHICLES.includes(v)) &&
          days(sff.date, r.date) <= WINDOW_BEFORE_DAYS &&
          days(r.date, sff.date) <= WINDOW_AFTER_DAYS &&
          r.amount <= sff.amount * (1 + TOLERANCE)
      )
      if (pool.length < 2) continue
      const n = Math.min(pool.length, 14)
      let best: Group | null = null
      for (let mask = 1; mask < 1 << n; mask++) {
        const parts: Row[] = []
        let sum = 0
        for (let bit = 0; bit < n; bit++)
          if (mask & (1 << bit)) {
            parts.push(pool[bit])
            sum += pool[bit].amount
          }
        if (parts.length < 2 || parts.length > MAX_COMPONENTS) continue
        if (Math.abs(sum - sff.amount) > sff.amount * TOLERANCE) continue
        const spread = Math.max(...parts.map((p) => Math.abs(days(p.date, sff.date))))
        // Prefer the tightest-dated group, then the one with more components.
        if (
          !best ||
          spread < best.spread ||
          (spread === best.spread && parts.length > best.parts.length)
        )
          best = { sff, parts, spread }
      }
      if (best) groups.push(best)
    }
  }

  // One jaan payment can only belong to one round: keep the tightest group.
  groups.sort((a, b) => a.spread - b.spread)
  const claimed = new Set<string>()
  const kept: Group[] = []
  for (const group of groups) {
    if (group.parts.some((p) => claimed.has(p.key))) continue
    for (const part of group.parts) claimed.add(part.key)
    kept.push(group)
  }

  kept.sort((a, b) => b.sff.amount - a.sff.amount)
  let dollars = 0
  for (const group of kept) {
    dollars += group.parts.reduce((sum, p) => sum + p.amount, 0)
    console.log(
      `${group.sff.recipient} — SFF ${group.sff.date} $${group.sff.amount.toLocaleString()}`
    )
    for (const part of group.parts)
      console.log(
        `    ${part.date} $${part.amount.toLocaleString().padStart(11)}  ${part.vias.join(', ')}`
      )
  }
  console.log(
    `\n${kept.length} groups, $${Math.round(dollars).toLocaleString()} of jaan.online payments that duplicate SFF rows`
  )

  if (process.argv.includes('--write')) {
    const path = 'data/dedup-resolutions.json'
    const doc = JSON.parse(readFileSync(path, 'utf8')) as {
      resolutions: Record<string, string>
    }
    let added = 0
    for (const group of kept) {
      for (const part of group.parts) {
        const key = [group.sff.key, part.key].sort().join(' || ')
        if (doc.resolutions[key]) continue
        doc.resolutions[key] = 'merged'
        added++
      }
    }
    writeFileSync(path, JSON.stringify(doc, null, 2) + '\n')
    console.log(`recorded ${added} resolutions; run \`bun run dedup --apply\``)
  }
}

await main()
