// Finds websites for orgs that have none, from sources that already know the
// org: the Donations List Website donee table (vipulnaik/donations), the
// Manifund profile behind an org-run project, and Wikidata (exact label
// matches that carry an official-website claim). Candidates land in
// data/org-links.json with their provenance; `bun run seed` applies the file.
// Slugs already in the file are never touched, so re-runs only add.
//
//   bun run find-org-links [--wikidata-min 2] [--no-wikidata]
import aliasesFile from '@/data/aliases.json'
import linksFile from '@/data/org-links.json'
import projectOrgsFile from '@/data/manifund-project-orgs.json'
import orgsSeed from '@/data/orgs-seed.json'
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/db/supabase-admin'
import { countsTowardCoverage } from '@/utils/format'
import { parseInserts } from './lib/mysqldump-parse'
import { normalizeName, normalizeUrl } from './lib/normalize'

type Link = { name: string; url: string | null; via: string; note?: string }
type LinksFile = { _comment: string; websites: Record<string, Link> }

const USER_AGENT = 'trace-curation (https://trace.manifund.org)'
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const WIKIDATA_MIN_GRANTS = Number(option('--wikidata-min', '2'))

// Profile links that are not an organization's own site.
const NOT_A_HOMEPAGE =
  /(^|\.)(twitter|x|linkedin|github|facebook|instagram|youtube|medium|substack|tiktok|discord|calendly|lesswrong|notion|bsky|manifund|manifold|effectivealtruism|google)\.(com|org|site|so|app|markets)$|(^|\.)t\.me$|scholar\.google/i

function homepage(raw: string | null | undefined): string | null {
  const url = normalizeUrl(raw)
  if (!url) return null
  try {
    const host = new URL(url).hostname
    if (!host.includes('.') || NOT_A_HOMEPAGE.test(host)) return null
  } catch {
    return null
  }
  return url
}

const db = createAdminClient()

type Org = { id: string; slug: string; name: string }

async function loadOrgs() {
  const seeded = new Set(
    (orgsSeed as never as { orgs: { slug: string }[] }).orgs.map((o) => o.slug)
  )
  const known = new Set(Object.keys((linksFile as LinksFile).websites))
  // Orgs still needing a website, by id.
  const wanted = new Map<string, Org>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('orgs')
      .select('id, slug, name, website, org_type')
      .range(from, from + 999)
      .throwOnError()
    for (const org of data ?? []) {
      if (org.website || org.org_type === 'individual') continue
      if (seeded.has(org.slug) || known.has(org.slug)) continue
      if (!countsTowardCoverage(org.name)) continue
      wanted.set(org.id, { id: org.id, slug: org.slug, name: org.name })
    }
    if (!data || data.length < 1000) break
  }
  // normalized name -> org id, every org (names of settled orgs still have to
  // resolve so that a source naming one by alias finds it).
  const byName = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('org_names')
      .select('normalized, org_id')
      .range(from, from + 999)
      .throwOnError()
    for (const row of data ?? []) byName.set(row.normalized, row.org_id)
    if (!data || data.length < 1000) break
  }
  const grantCounts = new Map<string, number>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('grants')
      .select('funder_org_id, recipient_org_id')
      .eq('status', 'approved')
      .range(from, from + 999)
      .throwOnError()
    for (const row of data ?? []) {
      for (const id of [row.funder_org_id, row.recipient_org_id]) {
        if (id) grantCounts.set(id, (grantCounts.get(id) ?? 0) + 1)
      }
    }
    if (!data || data.length < 1000) break
  }
  return { wanted, byName, grantCounts }
}

const found = new Map<string, Link>() // slug -> link
function propose(org: Org, url: string | null, via: string, note?: string) {
  if (!url || found.has(org.slug)) return
  found.set(org.slug, { name: org.name, url, via, ...(note ? { note } : {}) })
}

async function fromVipul(wanted: Map<string, Org>, byName: Map<string, string>) {
  const res = await fetch(
    'https://raw.githubusercontent.com/vipulnaik/donations/master/sql/donees/donees.sql',
    { headers: { 'user-agent': USER_AGENT } }
  )
  if (!res.ok) throw new Error(`donees.sql ${res.status}`)
  // The file separates cause areas with MySQL `#` comments, which the parser
  // does not know; left in, each one swallows the statement after it.
  const rows = parseInserts((await res.text()).replace(/^\s*#.*$/gm, ''), 'donees')
  let hits = 0
  for (const row of rows) {
    const url = homepage(typeof row.website === 'string' ? row.website : null)
    if (!url) continue
    const names = [row.donee, ...String(row.other_names ?? '').split('|')]
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter(Boolean)
    for (const name of names) {
      const org = wanted.get(byName.get(normalizeName(name)) ?? '')
      if (!org) continue
      propose(org, url, 'vipul')
      hits++
      break
    }
  }
  console.log(`vipul: ${rows.length} donees, ${hits} matched`)
}

// Org-run Manifund projects: the creator's profile website is the org's.
// Person-run projects are skipped; a personal site is not an org homepage.
async function fromManifund(wanted: Map<string, Org>, byName: Map<string, string>) {
  const url = process.env.MANIFUND_SUPABASE_URL
  const key = process.env.MANIFUND_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.warn('manifund: skipped (set MANIFUND_SUPABASE_URL and MANIFUND_SUPABASE_ANON_KEY)')
    return
  }
  const manifund = createClient(url, key)
  const projectOrgs = (projectOrgsFile as never as { projects: Record<string, { org: string }> })
    .projects
  const aliasNames = new Set(
    Object.keys((aliasesFile as never as { aliases: Record<string, string> }).aliases).map(
      normalizeName
    )
  )
  let hits = 0
  for (let from = 0; ; from += 1000) {
    const { data, error } = await manifund
      .from('projects')
      .select('id, title, profiles!projects_creator_fkey(website)')
      .neq('stage', 'hidden')
      .neq('stage', 'draft')
      .range(from, from + 999)
    if (error) throw error
    for (const project of (data ?? []) as never as {
      id: string
      title: string
      profiles: { website: string | null } | null
    }[]) {
      const site = homepage(project.profiles?.website)
      if (!site) continue
      const normalizedTitle = normalizeName(project.title)
      const titleIsOrg =
        normalizedTitle.length >= 4 &&
        (byName.has(normalizedTitle) || aliasNames.has(normalizedTitle))
      const orgName = projectOrgs[project.id]?.org ?? (titleIsOrg ? project.title : null)
      if (!orgName) continue
      const org = wanted.get(byName.get(normalizeName(orgName)) ?? '')
      if (!org) continue
      propose(org, site, 'manifund', `profile behind "${project.title}"`)
      hits++
    }
    if (!data || data.length < 1000) break
  }
  console.log(`manifund: ${hits} org-run projects with a profile website`)
}

async function wikidata(params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams({ ...params, format: 'json' })
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://www.wikidata.org/w/api.php?${query}`, {
      headers: { 'user-agent': USER_AGENT },
    })
    if (res.ok) return res.json()
    if (res.status !== 429 && res.status < 500) throw new Error(`wikidata ${res.status}`)
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt))
  }
  throw new Error('wikidata: gave up')
}

// Instances to refuse even on an exact label match.
const NOT_AN_ORG = new Set(['Q5', 'Q4167410', 'Q13442814', 'Q7187', 'Q11173', 'Q8054'])

async function fromWikidata(wanted: Map<string, Org>, grantCounts: Map<string, number>) {
  const targets = Array.from(wanted.values()).filter(
    (org) => !found.has(org.slug) && (grantCounts.get(org.id) ?? 0) >= WIKIDATA_MIN_GRANTS
  )
  console.log(`wikidata: checking ${targets.length} orgs with >= ${WIKIDATA_MIN_GRANTS} grants`)
  let hits = 0
  let done = 0
  const lookup = async (org: Org) => {
    const normalized = normalizeName(org.name)
    const result = (await wikidata({
      action: 'wbsearchentities',
      search: org.name,
      language: 'en',
      limit: '5',
    })) as {
      search?: { id: string; label?: string; description?: string; match?: { text: string } }[]
    }
    const exact = (result.search ?? []).find(
      (hit) =>
        normalizeName(hit.label ?? '') === normalized ||
        normalizeName(hit.match?.text ?? '') === normalized
    )
    if (!exact) return
    const entities = (await wikidata({
      action: 'wbgetentities',
      ids: exact.id,
      props: 'claims',
    })) as {
      entities: Record<
        string,
        { claims?: Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]> }
      >
    }
    const claims = entities.entities[exact.id]?.claims ?? {}
    const instanceOf = (claims.P31 ?? []).map(
      (claim) => (claim.mainsnak.datavalue?.value as { id?: string } | undefined)?.id ?? ''
    )
    if (instanceOf.some((id) => NOT_AN_ORG.has(id))) return
    const site = homepage(claims.P856?.[0]?.mainsnak.datavalue?.value as string | undefined)
    if (!site) return
    propose(org, site, 'wikidata', `${exact.id}: ${exact.description ?? 'no description'}`)
    hits++
  }
  const queue = [...targets]
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      for (let org = queue.shift(); org; org = queue.shift()) {
        try {
          await lookup(org)
        } catch (error) {
          console.warn(`wikidata: ${org.name}: ${(error as Error).message}`)
        }
        if (++done % 100 === 0) console.log(`wikidata: ${done}/${targets.length}`)
      }
    })
  )
  console.log(`wikidata: ${hits} matched`)
}

async function main() {
  const { wanted, byName, grantCounts } = await loadOrgs()
  console.log(`${wanted.size} orgs without a website`)
  await fromVipul(wanted, byName)
  await fromManifund(wanted, byName)
  if (!flag('--no-wikidata')) await fromWikidata(wanted, grantCounts)

  const file = linksFile as LinksFile
  const merged = { ...file.websites }
  for (const [slug, link] of found) merged[slug] = link
  const sorted = Object.fromEntries(
    Object.entries(merged).sort((a, b) => a[1].name.localeCompare(b[1].name))
  )
  writeFileSync(
    'data/org-links.json',
    JSON.stringify({ _comment: file._comment, websites: sorted }, null, 2) + '\n'
  )
  console.log(`Added ${found.size} websites; ${Object.keys(sorted).length} in data/org-links.json`)
}

await main()
