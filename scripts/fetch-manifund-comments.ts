// Snapshots Manifund regrantors' comments on the projects they fund into
// data/reviews/manifund-<username>.json, one file per regrantor and one review
// per org: every comment the regrantor left on that org's projects, oldest
// first, each headed by the project and date. Projects map to orgs through the
// Manifund grants Trace already holds (grant url -> recipient), so a comment on
// a project with no recorded grant is left out. Reads Manifund's Supabase with
// the anon key (MANIFUND_SUPABASE_URL / MANIFUND_SUPABASE_ANON_KEY).
// Usage: bun run scripts/fetch-manifund-comments.ts [username ...]
import { readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/db/supabase-admin'

const MANIFUND = 'https://manifund.org'
// Manifund's own team hold regranter status but their comments are platform
// operations (approvals, grant agreements), not assessments of the grantee.
const STAFF = new Set(['Austin', 'Rachel'])

const manifund = createClient(
  process.env.MANIFUND_SUPABASE_URL!,
  process.env.MANIFUND_SUPABASE_ANON_KEY!
)
const trace = createAdminClient()

// ---- TipTap JSON -> markdown ----

type Node = {
  type: string
  text?: string
  content?: Node[]
  marks?: { type: string; attrs?: Record<string, string> }[]
  attrs?: Record<string, unknown>
}

function inline(node: Node): string {
  if (node.type === 'text') {
    let text = node.text ?? ''
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `**${text}**`
      else if (mark.type === 'italic') text = `*${text}*`
      else if (mark.type === 'link' && mark.attrs?.href) text = `[${text}](${mark.attrs.href})`
    }
    return text
  }
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'mention') return `@${(node.attrs?.label as string) ?? ''}`
  return (node.content ?? []).map(inline).join('')
}

function block(node: Node): string {
  switch (node.type) {
    case 'paragraph':
      return inline(node).trim()
    case 'heading':
      return `**${inline(node).trim()}**`
    case 'bulletList':
    case 'orderedList':
      return (node.content ?? [])
        .map((li) =>
          (li.content ?? [])
            .map(block)
            .filter(Boolean)
            .join('\n')
            .split('\n')
            .map((line, i) => (i === 0 ? `- ${line}` : `  ${line}`))
            .join('\n')
        )
        .join('\n')
    case 'blockquote':
      return (node.content ?? [])
        .map(block)
        .filter(Boolean)
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    case 'codeBlock':
      return inline(node).trim()
    default:
      return (node.content ?? []).map(block).filter(Boolean).join('\n\n')
  }
}

function plain(doc: Node | null): string {
  const walk = (n: Node): string =>
    n.type === 'text'
      ? (n.text ?? '')
      : (n.content ?? []).map(walk).join(n.type === 'paragraph' ? '' : ' ')
  return doc ? walk(doc) : ''
}

function markdown(doc: Node | null): string {
  if (!doc) return ''
  return (doc.content ?? []).map(block).filter(Boolean).join('\n\n').trim()
}

// ---- which comments count as reviews ----

const HOUSEKEEPING =
  /\b(limit order|signal.?boost|links? (is|are) broken|look into this|see \w+'s comment|in response to|would appreciate feedback)/i

type Comment = { content: Node | null; replying_to: string | null; special_type: string | null }

function substantive(c: Comment, text: string): boolean {
  const s = text.trim()
  if (c.special_type === 'grant rationale') return true
  // Progress updates and final reports are the regrantor reporting on a
  // project of their own.
  if (c.special_type) return false
  if (/^(@|hi\b|hey\b|hello\b|dear\b)/i.test(s)) return false
  const questions = (s.match(/\?/g) ?? []).length
  const sentences = Math.max(1, s.split(/[.!?]+(\s|$)/).filter((x) => x.trim()).length)
  if (questions > 0 && questions >= sentences / 2) return false
  if (HOUSEKEEPING.test(s)) return false
  if (c.replying_to) return s.length >= 400
  return s.length >= 60
}

// ---- project -> Trace org, via the grants Trace already holds ----

const orgByProjectSlug = new Map<string, string>()
for (let from = 0; ; from += 1000) {
  const { data } = await trace
    .from('grants')
    .select('url, recipient:orgs!grants_recipient_org_id_fkey(name)')
    .like('url', `${MANIFUND}/projects/%`)
    .range(from, from + 999)
    .throwOnError()
  for (const row of data ?? []) {
    const slug = (row.url as string).slice(`${MANIFUND}/projects/`.length).split(/[?#]/)[0]!
    const name = (row.recipient as never as { name: string } | null)?.name
    if (slug && name && !orgByProjectSlug.has(slug)) orgByProjectSlug.set(slug, name)
  }
  if (!data || data.length < 1000) break
}

const { data: regranters } = await manifund
  .from('profiles')
  .select('id, username, full_name')
  .eq('regranter_status', true)
  .throwOnError()
const wanted = new Set(process.argv.slice(2))
const existing = new Set(
  readdirSync('data/reviews')
    .filter((f) => f.startsWith('manifund-') && f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
)

let written = 0
for (const who of (regranters ?? []).sort((a, b) => a.username.localeCompare(b.username))) {
  if (wanted.size > 0 && !wanted.has(who.username)) continue
  if (STAFF.has(who.username) && !wanted.has(who.username)) continue
  const { data: comments } = await manifund
    .from('comments')
    .select(
      'id, created_at, content, replying_to, special_type, project:projects!inner(slug, title)'
    )
    .eq('commenter', who.id)
    .is('deleted_at', null)
    .order('created_at')
    .throwOnError()

  type Entry = { org: string; slug: string; pieces: string[]; latest: string; first: string }
  const byOrg = new Map<string, Entry>()
  for (const c of comments ?? []) {
    const project = c.project as never as { slug: string; title: string }
    const org = orgByProjectSlug.get(project.slug)
    if (!org) continue
    const text = markdown(c.content as Node | null)
    if (!text || !substantive(c as never as Comment, plain(c.content as Node | null))) continue
    const date = (c.created_at as string).slice(0, 10)
    const entry = byOrg.get(org) ?? {
      org,
      slug: project.slug,
      pieces: [],
      latest: date,
      first: `${c.id}`,
    }
    const month = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    entry.pieces.push(
      `[${project.title}](${MANIFUND}/projects/${project.slug}), ${month}\n\n${text}`
    )
    entry.latest = date
    byOrg.set(org, entry)
  }

  const id = `manifund-${who.username}`
  if (byOrg.size === 0) {
    if (existing.has(id)) unlinkSync(`data/reviews/${id}.json`)
    continue
  }
  const reviews = Array.from(byOrg.values())
    .sort((a, b) => a.org.localeCompare(b.org))
    .map((e) => ({
      org: e.org,
      sourceUrl: `${MANIFUND}/projects/${e.slug}?tab=comments#${e.first}`,
      reviewedAt: e.latest,
      review: e.pieces.join('\n\n---\n\n'),
    }))
  const file = {
    _comment: `${who.full_name}'s comments as a Manifund regrantor on projects Trace records grants for, snapshotted by scripts/fetch-manifund-comments.ts. One review per org: the substantive comments on that org's projects (grant rationales and assessments; not replies, questions or housekeeping), oldest first, each headed by the project and month.`,
    id,
    reviewer: who.full_name,
    reviewerUrl: `${MANIFUND}/${who.username}`,
    sourceUrl: `${MANIFUND}/${who.username}?tab=by`,
    reviewedAt: reviews.reduce((m, r) => (r.reviewedAt > m ? r.reviewedAt : m), '0000'),
    venue: 'Manifund',
    createOrgs: false,
    reviews,
  }
  writeFileSync(`data/reviews/${id}.json`, JSON.stringify(file, null, 2) + '\n')
  written++
  console.log(`${id}: ${reviews.length} orgs, ${comments?.length ?? 0} comments total`)
}
console.log(`${written} regrantor files written`)
