// Snapshots the Long-Term Future Fund's payout reports on the EA Forum into
// data/reviews/ltff-<yyyy-mm>.json, one review per grant write-up, filed under
// the grantee. A write-up starts at a heading or bold paragraph that carries
// the grant amount ("Name ($40,000)", "Name – $60,000", "Name: USD 40,000")
// and runs to the next one; the fund manager who wrote it comes from the
// enclosing "Writeups by …" / "Grant reports by …" / "Grants evaluated by …"
// section and is the review's reviewer (the fund is the venue). The body
// opens with amount and purpose as the verdict line.
// Grantees are mostly individuals, so these files set createOrgs: false and
// ingest-reviews skips any that the crosswalk does not already know.
// Usage: bun run scripts/fetch-ltff-reviews.ts [postId]
import { writeFileSync } from 'node:fs'
import * as cheerio from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode } from 'domhandler'
import { blockMd, textOf } from './lib/html-md'
import { normalizeName } from './lib/normalize'

type Post = {
  id: string
  postId: string
  // Who wrote every write-up, for posts without per-section bylines.
  author?: string
  // Section titles (any heading level) whose contents are not write-ups:
  // recipient tables, one-line lists of smaller grants, appendices.
  skip?: string[]
}

const POSTS: Post[] = [
  { id: 'ltff-2018-11', postId: 'sTvepoxCDMgskGDDN' },
  { id: 'ltff-2019-04', postId: 'CJJDwgyqT4gXktq6g', skip: ['Grant Recipients'] },
  {
    id: 'ltff-2019-08',
    postId: 'an9GrNXrdMwBJpHeC',
    skip: ['Grant Recipients', 'Grants Made By the Long-Term Future Fund', 'Other Recommendations'],
  },
  {
    id: 'ltff-2019-11',
    postId: '6BXrSZGayibJjR9uc',
    skip: ['Grant Recipients', 'Grants Made By the Long-Term Future Fund'],
  },
  { id: 'ltff-2020-04', postId: 'AioofNtgQFpE5k8tE' },
  { id: 'ltff-2020-09', postId: 'dgy6m8TGhv4FCn4rx', skip: ['Grant recipients'] },
  { id: 'ltff-2020-11', postId: 'Yosqvz6w9fuc3zjBS', skip: ['Highlights', 'Grant recipients'] },
  { id: 'ltff-2021-05', postId: 'diZWNmLRgcbuwmYn4', skip: ['Highlights', 'Grant recipients'] },
  { id: 'ltff-2021-07', postId: 'HYKDh2mLjapsgj9nB' },
  { id: 'ltff-2021-12', postId: 'ddBLtdQjcjvZH5JvF', skip: ['Highlights'] },
  {
    id: 'ltff-2023-04',
    postId: 'zZ2vq7YEckpunrQS4',
    skip: [
      'Highlights',
      'Other grants we made during this period',
      'Appendix: How we set grant and stipend amounts',
    ],
  },
  {
    id: 'ltff-2024-06',
    postId: 'pJyCWzevPHsycj4oQ',
    author: 'Linch Zhang',
    skip: ['Appendix', 'Other Grants We Made During This Time Period'],
  },
]

const FORUM = 'https://forum.effectivealtruism.org'
const REVIEWER_URL = 'https://funds.effectivealtruism.org/funds/far-future'

async function fetchPost(postId: string) {
  const res = await fetch(`${FORUM}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `{ post(input:{selector:{_id:"${postId}"}}) { result { title postedAt pageUrl htmlBody } } }`,
    }),
  })
  if (!res.ok) throw new Error(`${postId}: HTTP ${res.status}`)
  const json = (await res.json()) as {
    data: {
      post: { result: { title: string; postedAt: string; pageUrl: string; htmlBody: string } }
    }
  }
  return json.data.post.result
}

// "$40,000", "USD 40,000", "CAD 6,000 (approx USD 4,500)", "£10,000".
const AMOUNT = /(?:\$|USD\s?|CAD\s?|£|€)\s?\d(?:[\d,]*\d)?(?:\.\d+)?(?:k|K)?/
const AMOUNT_ALL = new RegExp(AMOUNT.source, 'g')

type Head = { name: string; amount: string; purpose: string }

// Splits "Name ($40,680) - 9-month stipend…" into its parts; null when the
// text is not a grant heading.
function parseHead(text: string): Head | null {
  const m = AMOUNT.exec(text)
  if (!m || m.index === 0) return null
  let name = text
    .slice(0, m.index)
    .replace(/[\s(:–—-]+$/, '')
    .replace(/\b(?:up to|approximately|approx\.?)\s*$/i, '')
    .replace(/[\s(:–—-]+$/, '')
    .trim()
  // Prose that happens to mention money ("We've spent an average of ~$1M…").
  if (
    !name ||
    name.length > 80 ||
    /[.!?]/.test(name) ||
    /^(total|fund|payout|grant date)/i.test(name) ||
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i.test(
      name
    )
  )
    return null
  // "AI summer school (Jan Kulveit)": the person is the grantee.
  name = name.replace(/^(.*)\s\(([^()]+)\)$/, (_, project, person) =>
    /\b(and|&)\b/.test(person) || project.length > 60 ? project : person
  )
  const amount = m[0].replace(/\s+/g, ' ').trim()
  // Past the amount, any further amounts or "(approx USD …)" asides, the
  // closing paren and the separator before the purpose.
  const purpose = text
    .slice(m.index + m[0].length)
    .replace(
      new RegExp(
        `^(?:\\s*(?:\\(approx\\.?\\s*)?${AMOUNT.source}\\)?|\\s*,\\s*with an expected reimbursement of up to ${AMOUNT.source})*`
      ),
      ''
    )
    .replace(/^\s*\)?\s*[:–—,-]*\s*/, '')
    .trim()
  return { name, amount, purpose }
}

function tagName(el: Cheerio<AnyNode>): string {
  const node = el.get(0)
  return node && node.type === 'tag' ? node.name : ''
}

function isBoldStart($: CheerioAPI, node: AnyNode): boolean {
  const first = $(node)
    .contents()
    .toArray()
    .find((n) => n.type !== 'text' || n.data.trim() !== '')
  return !!first && first.type === 'tag' && (first.name === 'strong' || first.name === 'b')
}

function isBoldParagraph($: CheerioAPI, el: Cheerio<AnyNode>): boolean {
  return tagName(el) === 'p' && isBoldStart($, el.get(0)!)
}

const BY_LINE = /^(?:writeups?|grant reports?|grants? evaluated|grants? recommended)\s+by\s+(.+)$/i
const NOT_A_NAME =
  /\b(grants?|fund|highlights?|highlighted|introduction|appendix|updates?|writings?|feedback|recipients?|reports?|overview|summary|other|future)\b/i

type Review = {
  org: string
  sourceUrl: string
  reviewer: string | null
  review: string
}

// Bylines vary between posts; one spelling per person.
const NAMES: Record<string, string> = { 'Linchuan Zhang': 'Linch Zhang' }

function extract($: CheerioAPI, base: string, post: Post): Review[] {
  const out = new Map<string, Review>()
  let evaluator: string | null = null
  let skipping = false
  let cur: { head: Head; id: string; blocks: string[]; evaluator: string | null } | null = null

  const flush = () => {
    if (!cur) return
    const { head, id, blocks } = cur
    if (/^anonymous/i.test(head.name)) {
      cur = null
      return
    }
    const verdict = [head.amount, head.purpose].filter(Boolean).join(' · ')
    const text = [verdict, ...blocks].filter(Boolean).join('\n\n')
    const key = normalizeName(head.name)
    const prev = out.get(key)
    const who = cur.evaluator ?? post.author ?? null
    if (prev) {
      // A second grant to the same grantee in one report, maybe by another
      // manager: keep both write-ups under the file's reviewer.
      prev.review += `\n\n---\n\n${who && who !== prev.reviewer ? `*Write-up by ${who}.* ` : ''}${text}`
      if (who !== prev.reviewer) prev.reviewer = null
    } else {
      out.set(key, {
        org: head.name,
        sourceUrl: id ? `${base}#${id}` : base,
        reviewer: who,
        review: text,
      })
    }
    cur = null
  }

  for (const node of $('body').children().toArray()) {
    const el = $(node)
    const tag = tagName(el)
    if (!tag) continue
    const isHeading = /^h[1-6]$/.test(tag)
    const text = textOf(el)
    if (isHeading || isBoldParagraph($, el)) {
      const head = parseHead(text)
      if (head) {
        flush()
        if (!skipping) cur = { head, id: el.attr('id') ?? '', blocks: [], evaluator }
        continue
      }
    }
    if (isHeading) {
      // "Writeups by Helen Toner", or (2020) just "Helen Toner" as a heading.
      const by =
        BY_LINE.exec(text) ??
        (NOT_A_NAME.test(text) ? null : /^([A-Z][\w'.-]+(?: [A-Z][\w'.-]+){1,2})$/.exec(text))
      if (by) {
        flush()
        evaluator = NAMES[by[1]!.trim()] ?? by[1]!.trim()
        skipping = false
        continue
      }
      // A manager's aside on a colleague's grant stays with that grant.
      if (cur && /comments? on/i.test(text)) {
        cur.blocks.push(`**${text}**`)
        continue
      }
      flush()
      skipping = (post.skip ?? []).some((t) => t.toLowerCase() === text.toLowerCase())
      continue
    }
    // Dec 2021 nests each grant as a bold list item with its write-up as a
    // sub-list.
    if ((tag === 'ul' || tag === 'ol') && !skipping) {
      const items = el.children('li').toArray()
      const heads = items.map((li) => {
        const own = $(li).clone()
        own.children('ul, ol').remove()
        return isBoldStart($, li) ? parseHead(textOf(own)) : null
      })
      if (heads.some(Boolean)) {
        items.forEach((li, i) => {
          const head = heads[i]
          if (head) {
            flush()
            cur = { head, id: '', blocks: [], evaluator }
          }
          if (!cur) return
          // A plain item is write-up text for the grant above it.
          if (!head) {
            const own = $(li).clone()
            own.children('ul, ol').remove()
            const md = blockMd($, own, base)
            if (md) cur.blocks.push(md)
          }
          for (const child of $(li).children('ul, ol, p, blockquote').toArray()) {
            const md = blockMd($, $(child), base)
            if (md) cur.blocks.push(md)
          }
        })
        continue
      }
    }
    if (cur && !skipping) {
      const md = blockMd($, el, base)
      if (md) cur.blocks.push(md)
    }
  }
  flush()
  return Array.from(out.values())
}

const only = process.argv[2]
for (const post of POSTS) {
  if (only && post.postId !== only && post.id !== only) continue
  const result = await fetchPost(post.postId)
  const $ = cheerio.load(result.htmlBody)
  const reviews = extract($, result.pageUrl, post)
  const file = {
    _comment: `Long-Term Future Fund payout report "${result.title.replace(/\s+/g, ' ').trim()}", snapshotted from the EA Forum by scripts/fetch-ltff-reviews.ts. One review per grant write-up, filed under the grantee and attributed to the fund manager who wrote it; the body opens with amount and purpose.`,
    id: post.id,
    reviewer: 'Long-Term Future Fund',
    reviewerUrl: REVIEWER_URL,
    venue: 'Long-Term Future Fund',
    sourceUrl: result.pageUrl,
    reviewedAt: result.postedAt.slice(0, 10),
    createOrgs: false,
    reviews,
  }
  writeFileSync(`data/reviews/${post.id}.json`, JSON.stringify(file, null, 2) + '\n')
  console.log(
    `${post.id}: ${reviews.length} write-ups (${result.title.replace(/\s+/g, ' ').trim()})`
  )
}
