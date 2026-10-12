// Fills data/person-links.json from Manifund: an individual with a grant on
// Manifund (as donor or project creator) whose name matches exactly one
// Manifund profile gets that profile's link, plus whatever the profile's
// website field points at (a personal site, or a Twitter / LinkedIn /
// LessWrong / EA Forum profile). People who only share a name with a profile
// are left alone. Keys already in the file are never touched, so re-runs only
// add; `bun run seed` applies the file.
//
//   bun run find-person-links
import linksFile from '@/data/person-links.json'
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/db/supabase-admin'
import type { LinkKind, OrgLinks } from '@/utils/links'
import { normalizeName, normalizeUrl } from './lib/normalize'

type Entry = { name: string; via?: string } & { [kind in LinkKind]?: string | null }
type LinksFile = { _comment: string; people: Record<string, Entry> }

const url = process.env.MANIFUND_SUPABASE_URL
const key = process.env.MANIFUND_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Set MANIFUND_SUPABASE_URL and MANIFUND_SUPABASE_ANON_KEY')
const manifund = createClient(url, key)
const db = createAdminClient()

// Which kind of link a profile's website field is. Hosts that are neither a
// known profile nor plausibly someone's own site are dropped.
const NOT_A_HOMEPAGE =
  /(^|\.)(github|facebook|instagram|youtube|medium|tiktok|discord|calendly|notion|bsky|manifund|manifold|google|linktr)\.(com|org|site|so|app|markets|ee)$|(^|\.)t\.me$/i
function classify(raw: string | null): OrgLinks {
  const link = normalizeUrl(raw)
  if (!link) return {}
  let parsed: URL
  try {
    parsed = new URL(link)
  } catch {
    return {}
  }
  const host = parsed.hostname.replace(/^www\./, '')
  const first = parsed.pathname.split('/').filter(Boolean)
  if (host === 'twitter.com' || host === 'x.com')
    return first.length === 1 ? { twitter: `https://x.com/${first[0].replace(/^@/, '')}` } : {}
  if (host.endsWith('linkedin.com'))
    return first[0] === 'in' && first[1]
      ? { linkedin: `https://www.linkedin.com/in/${first[1]}` }
      : {}
  if (host === 'lesswrong.com')
    return first[0] === 'users' && first[1]
      ? { lesswrong: `https://www.lesswrong.com/users/${first[1]}` }
      : {}
  if (host === 'forum.effectivealtruism.org')
    return first[0] === 'users' && first[1]
      ? { eaforum: `https://forum.effectivealtruism.org/users/${first[1]}` }
      : {}
  if (!host.includes('.') || NOT_A_HOMEPAGE.test(host)) return {}
  return { website: link }
}

async function all<T>(
  page: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

const people = await all((from) =>
  db
    .from('orgs')
    .select('id, slug, name')
    .eq('org_type', 'individual')
    .range(from, from + 999)
)
const grants = await all((from) =>
  db
    .from('grants')
    .select('funder_org_id, recipient_org_id')
    .eq('status', 'approved')
    .like('url', 'https://manifund.org/projects/%')
    .range(from, from + 999)
)
const onManifund = new Set(grants.flatMap((g) => [g.funder_org_id, g.recipient_org_id]))
const names = await all((from) =>
  db
    .from('org_names')
    .select('org_id, normalized')
    .range(from, from + 999)
)
const namesByOrg = new Map<string, string[]>()
for (const row of names)
  namesByOrg.set(row.org_id, [...(namesByOrg.get(row.org_id) ?? []), row.normalized])

const profiles = await all<{
  username: string
  full_name: string | null
  website: string | null
  type: string
}>((from) =>
  manifund
    .from('profiles')
    .select('username, full_name, website, type')
    .range(from, from + 999)
)
const profilesByName = new Map<string, typeof profiles>()
for (const profile of profiles) {
  const normalized = normalizeName(profile.full_name ?? '')
  if (!normalized || profile.type !== 'individual') continue
  profilesByName.set(normalized, [...(profilesByName.get(normalized) ?? []), profile])
}

const file = linksFile as never as LinksFile
let added = 0
let ambiguous = 0
for (const person of people) {
  if (!onManifund.has(person.id)) continue
  const matches = new Map<string, (typeof profiles)[number]>()
  for (const normalized of namesByOrg.get(person.id) ?? [])
    for (const profile of profilesByName.get(normalized) ?? [])
      matches.set(profile.username, profile)
  if (matches.size !== 1) {
    if (matches.size > 1) ambiguous++
    continue
  }
  const [profile] = matches.values()
  const found: OrgLinks = {
    manifund: `https://manifund.org/${profile.username}`,
    ...classify(profile.website),
  }
  const entry: Entry = file.people[person.slug] ?? { name: person.name, via: 'manifund' }
  let changed = false
  for (const [kind, link] of Object.entries(found) as [LinkKind, string][]) {
    if (kind in entry) continue
    entry[kind] = link
    changed = true
  }
  if (changed) {
    file.people[person.slug] = entry
    added++
  }
}

file.people = Object.fromEntries(Object.entries(file.people).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync('data/person-links.json', JSON.stringify(file, null, 2) + '\n')
console.log(
  `${people.length} individuals, ${added} entries added or extended, ${ambiguous} with more than one matching profile; ${Object.keys(file.people).length} people in the file`
)
