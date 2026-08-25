// Manifund funded projects. Two modes:
// * --direct (the real one): read Manifund's own Supabase (set
//   MANIFUND_SUPABASE_URL + MANIFUND_SUPABASE_ANON_KEY in .env.local) and
//   create one grant per (project, donor) from 'project donation' txns —
//   funder is the actual donor, via = Manifund.
// * default API mode: https://manifund.org/api/v0/projects (paginated via the
//   ?before= cursor) covers full history but exposes no donor identities or
//   txn types, so it can only record a coarse aggregate grant per project
//   (funder = Manifund). Use --direct for real runs; a later --direct run
//   tombstones the coarse records automatically.
import { createClient } from '@supabase/supabase-js'
import projectOrgsFile from '@/data/manifund-project-orgs.json'
import aliasesFile from '@/data/aliases.json'
import { createAdminClient } from '@/db/supabase-admin'
import { classifyCauses } from './lib/causes'
import { runIngest, type SourceRecordInput } from './lib/ingest'
import { normalizeName } from './lib/normalize'

type Txn = {
  amount: number
  token: string
  type: string | null
  created_at: string | null
  donor: { username: string; full_name: string | null } | null
}

type Project = {
  id: string
  title: string
  created_at: string
  slug: string
  stage: string
  type: string
  blurb: string | null
  profiles: { username: string; full_name: string } | null
  txns: Txn[]
  causes: { title: string; slug: string }[]
}

async function fetchViaApi(): Promise<Project[]> {
  const all: Project[] = []
  let cursor: string | null = null
  for (;;) {
    const url = `https://manifund.org/api/v0/projects${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Manifund API ${res.status}`)
    const batch = (await res.json()) as Project[]
    if (batch.length === 0) break
    all.push(...batch)
    cursor = batch[batch.length - 1].created_at
  }
  return all
}

async function fetchDirect(): Promise<Project[]> {
  const url = process.env.MANIFUND_SUPABASE_URL
  const key = process.env.MANIFUND_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Set MANIFUND_SUPABASE_URL and MANIFUND_SUPABASE_ANON_KEY for --direct')
  }
  const db = createClient(url, key)
  const all: Project[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('projects')
      .select(
        `id, title, created_at, slug, stage, type, blurb,
         profiles!projects_creator_fkey(username, full_name),
         txns(amount, token, type, created_at, donor:profiles!txns_from_id_fkey(username, full_name)),
         causes(title, slug)`
      )
      .neq('stage', 'hidden')
      .neq('stage', 'draft')
      .range(from, from + 999)
    if (error) throw error
    all.push(...((data ?? []) as never as Project[]))
    if (!data || data.length < 1000) break
  }
  return all
}

// Normalized names of every org already known to Trace (org_names rows
// plus alias keys). Used to detect org-run projects by their title.
const PROJECT_ORGS: Record<string, string> = Object.fromEntries(
  Object.entries(
    (projectOrgsFile as never as { projects: Record<string, { org: string }> }).projects
  ).map(([id, entry]) => [id, entry.org])
)

async function fetchKnownOrgNames(): Promise<Set<string>> {
  const db = createAdminClient()
  const known = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('org_names')
      .select('normalized')
      .range(from, from + 999)
      .throwOnError()
    for (const row of data ?? []) known.add(row.normalized)
    if (!data || data.length < 1000) break
  }
  for (const alias of Object.keys(aliasesFile)) known.add(normalizeName(alias))
  return known
}

async function main() {
  const direct = process.argv.includes('--direct')
  const projects = await (direct ? fetchDirect() : fetchViaApi())
  console.log(`${projects.length} projects fetched${direct ? ' (direct)' : ' (api, recent only)'}`)
  const knownOrgs = await fetchKnownOrgNames()

  // Creators whose projects belong to their organization, not to them.
  // (Most org-run pages are caught by the title-matches-org rule below.)
  const RECIPIENT_OVERRIDES: Record<string, string> = {}
  // Donor accounts that pass through someone else's money: the person is the
  // funder, the account is the vehicle.
  const DONOR_OVERRIDES: Record<string, { name: string; vias: string[] }> = {
    'grantmaking-ai': { name: 'Anton Makiievskyi', vias: ['grantmaking.ai', 'Manifund'] },
  }

  const records: SourceRecordInput[] = []
  for (const project of projects) {
    const creatorName =
      project.profiles?.full_name?.trim() || project.profiles?.username || project.title
    // A project titled exactly like a known org belongs to that org, not to
    // the person who posted it (e.g. Tarbell Center for AI Journalism).
    const normalizedTitle = normalizeName(project.title)
    const titleIsOrg = normalizedTitle.length >= 4 && knownOrgs.has(normalizedTitle)
    // Hand-reviewed project-to-org map for founder-posted projects whose
    // title doesn't name the org (ChinaTalk, Timaeus, ...).
    const mapped = PROJECT_ORGS[project.id]
    const recipient =
      RECIPIENT_OVERRIDES[creatorName] ??
      mapped ??
      (titleIsOrg ? project.title.trim() : creatorName)
    const causeSlugs = (project.causes ?? []).map((cause) => cause.slug)
    const causes = classifyCauses({
      labels: causeSlugs,
      text: `${recipient} ${project.title} ${project.blurb ?? ''}`,
    })
    const url = `https://manifund.org/projects/${project.slug}`
    const shared = { title: project.title, slug: project.slug, stage: project.stage }

    if (!direct) {
      const funded = (project.txns ?? [])
        .filter((txn) => txn.token === 'USD')
        .reduce((sum, txn) => sum + txn.amount, 0)
      if (funded <= 0) continue
      records.push({
        key: project.id,
        raw: { ...shared, id: project.id, funded_usd: funded, causes: causeSlugs },
        parsed: {
          funderName: 'Manifund',
          funderType: 'fund',
          viaNames: ['Manifund'],
          recipientName: recipient,
          amount: funded,
          currency: 'USD',
          date: project.created_at.slice(0, 10),
          datePrecision: 'day',
          description: project.title,
          url,
          causeSlugs: causes,
        },
      })
      continue
    }

    // Direct mode: one grant per donor per project.
    const byDonor = new Map<string, { name: string; total: number; last: string }>()
    for (const txn of project.txns ?? []) {
      if (txn.token !== 'USD' || txn.type !== 'project donation') continue
      if (txn.amount <= 0) continue
      const username = txn.donor?.username ?? 'anonymous'
      const name = txn.donor?.full_name?.trim() || txn.donor?.username || 'Anonymous'
      const entry = byDonor.get(username) ?? { name, total: 0, last: project.created_at }
      entry.total += txn.amount
      if (txn.created_at && txn.created_at > entry.last) entry.last = txn.created_at
      byDonor.set(username, entry)
    }
    for (const [username, donor] of byDonor) {
      records.push({
        key: `${project.id}:${username}`,
        raw: {
          ...shared,
          project_id: project.id,
          donor: username,
          amount: donor.total,
          causes: causeSlugs,
        },
        parsed: {
          funderName: DONOR_OVERRIDES[username]?.name ?? donor.name,
          funderType: 'individual',
          viaNames: DONOR_OVERRIDES[username]?.vias ?? ['Manifund'],
          recipientName: recipient,
          amount: Math.round(donor.total * 100) / 100,
          currency: 'USD',
          date: donor.last.slice(0, 10),
          datePrecision: 'day',
          description: project.title,
          url,
          causeSlugs: causes,
        },
      })
    }
  }
  // Never tombstone from the API's partial view.
  await runIngest('manifund', records, { tombstone: direct })
}

await main()
