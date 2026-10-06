// Snapshots Michael Dickens's "Where I Am Donating" posts into
// data/reviews/mdickens-<year>.json, one review per org section. Each body
// opens with his classification of the org, then his write-up from the
// Organizations section, then (2024) his "Prioritization within my top five"
// note where there is one, or (2025) his "Where I'm donating" reasoning for
// the org he picked. Links are made absolute so they survive leaving the post.
// Usage: bun run scripts/fetch-mdickens-reviews.ts
import { writeFileSync } from 'node:fs'
import * as cheerio from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode } from 'domhandler'

type Post = {
  id: string
  url: string
  reviewedAt: string
  // h1 titles whose h2 sections are org write-ups.
  orgSections: string[]
  // h2 titles under those h1s that are not single orgs.
  skip: string[]
  // Section title -> name to file the review under (keeps one org per body).
  rename?: Record<string, string>
  // Section title -> classification line, for posts without a formal list.
  classify?: Record<string, string>
}

const POSTS: Post[] = [
  {
    id: 'mdickens-2024',
    url: 'https://mdickens.me/2024/11/18/where_i_am_donating_in_2024/',
    reviewedAt: '2024-11-18',
    orgSections: ['Organizations'],
    skip: ['Important disclaimers'],
    rename: { 'Control AI': 'ControlAI' },
    classify: {
      'Campaign for AI Safety':
        'Not classified; rolled into Existential Risk Observatory in early 2024',
    },
  },
  {
    id: 'mdickens-2025',
    url: 'https://mdickens.me/2025/11/22/where_i_am_donating_in_2025/',
    reviewedAt: '2025-11-22',
    orgSections: ['Organizations (tax-deductible)', 'Non-tax-deductible donation opportunities'],
    skip: ['AI-for-animals orgs', 'Video projects', 'Congressional campaigns'],
    classify: {
      'AI Safety and Governance Fund':
        'Tax-deductible; deserves more funding, but not one of my top candidates this year',
      'Existential Risk Observatory':
        'Tax-deductible; deserves more funding, but not one of my top candidates',
      'Machine Intelligence Research Institute (MIRI)': 'Tax-deductible; deserves more funding',
      'Palisade Research': 'Tax-deductible; one of my favorite AI safety nonprofits',
      'PauseAI US': 'Favorite tax-deductible donation target; donating $40,000',
      'AI Policy Network': 'Non-tax-deductible; open questions, no position yet',
      'Americans for Responsible Innovation (ARI)':
        'Non-tax-deductible; open questions, no position yet',
      ControlAI: 'Non-tax-deductible; tentatively my favorite non-tax-deductible org',
      Encode: 'Non-tax-deductible; open questions, no position yet',
    },
  },
]

// ---- HTML -> markdown (just what the renderer understands) ----

function inlineMd($: CheerioAPI, node: AnyNode, base: string): string {
  if (node.type === 'text') return node.data.replace(/\s+/g, ' ')
  if (node.type !== 'tag') return ''
  const kids = () =>
    $(node)
      .contents()
      .toArray()
      .map((k) => inlineMd($, k, base))
      .join('')
  switch (node.name) {
    case 'a': {
      const href = $(node).attr('href') ?? ''
      let abs = href
      try {
        abs = new URL(href.replace(/^\(+/, ''), base).toString()
      } catch {}
      return `[${kids()}](${abs})`
    }
    case 'strong':
    case 'b':
      return `**${kids()}**`
    case 'em':
    case 'i':
      return `*${kids()}*`
    case 'code':
      return kids()
    case 'sup':
      return '' // footnote markers
    case 'br':
      return '\n'
    default:
      return kids()
  }
}

function blockMd($: CheerioAPI, el: Cheerio<AnyNode>, base: string): string {
  const node = el.get(0)
  if (!node || node.type !== 'tag') return ''
  switch (node.name) {
    case 'p':
      return el
        .contents()
        .toArray()
        .map((k) => inlineMd($, k, base))
        .join('')
        .trim()
    case 'ul':
    case 'ol':
      return el
        .children('li')
        .toArray()
        .map(
          (li) =>
            '- ' +
            $(li)
              .contents()
              .toArray()
              .map((k) => inlineMd($, k, base))
              .join('')
              .trim()
        )
        .join('\n')
    case 'blockquote':
      return el
        .children()
        .toArray()
        .map((c) => blockMd($, $(c), base))
        .filter(Boolean)
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    case 'div':
      return el
        .children()
        .toArray()
        .map((c) => blockMd($, $(c), base))
        .filter(Boolean)
        .join('\n\n')
    default:
      return el
        .contents()
        .toArray()
        .map((k) => inlineMd($, k, base))
        .join('')
        .trim()
  }
}

// The blocks between a heading and the next heading of the same or higher level.
function sectionBlocks($: CheerioAPI, heading: Cheerio<AnyNode>, stopAt: string[]) {
  const out: Cheerio<AnyNode>[] = []
  let cur = heading.next()
  while (
    cur.length > 0 &&
    !stopAt.includes(
      cur.get(0)!.type === 'tag' ? (cur.get(0) as never as { name: string }).name : ''
    )
  ) {
    out.push(cur)
    cur = cur.next()
  }
  return out
}

function textOf(el: Cheerio<AnyNode>): string {
  return el.text().replace(/\s+/g, ' ').trim()
}

function h2Sections($: CheerioAPI, h1Title: string) {
  const h1 = $('h1')
    .toArray()
    .find((h) => textOf($(h)) === h1Title)
  if (!h1) throw new Error(`h1 "${h1Title}" not found`)
  const sections: { title: string; id: string; blocks: Cheerio<AnyNode>[] }[] = []
  for (const block of sectionBlocks($, $(h1), ['h1'])) {
    const node = block.get(0)!
    if (node.type === 'tag' && node.name === 'h2') {
      sections.push({ title: textOf(block), id: block.attr('id') ?? '', blocks: [] })
    } else if (sections.length > 0) {
      sections[sections.length - 1]!.blocks.push(block)
    }
  }
  return sections
}

function render($: CheerioAPI, blocks: Cheerio<AnyNode>[], base: string): string {
  return blocks
    .map((b) => blockMd($, b, base))
    .filter(Boolean)
    .join('\n\n')
}

// 2024: "My top candidates" list, then "**Label:** A, B, C" paragraphs.
function classification2024($: CheerioAPI, base: string): Map<string, string> {
  const h1 = $('h1')
    .toArray()
    .find((h) => textOf($(h)) === 'Where I’m donating')
  if (!h1) throw new Error('"Where I’m donating" not found')
  const result = new Map<string, string>()
  const blocks = sectionBlocks($, $(h1), ['h1', 'h2'])
  const list = blocks.find((b) => b.is('ol, ul'))!
  list
    .children('li')
    .toArray()
    .forEach((li, i, all) =>
      result.set(textOf($(li)), `Top candidate (#${i + 1} of ${all.length})`)
    )
  for (const block of blocks) {
    if (!block.is('p') || block.children('strong').length === 0) continue
    const label = textOf(block.children('strong').first()).replace(/:$/, '')
    const names = textOf(block)
      .slice(textOf(block.children('strong').first()).length)
      .trim()
    for (const name of names.split(/,\s*/)) result.set(name.trim(), label)
  }
  void base
  return result
}

// 2024: "**#N: Name**" paragraphs and what follows each, until the next one.
function prioritization2024($: CheerioAPI, base: string): Map<string, string> {
  const h2 = $('h2')
    .toArray()
    .find((h) => textOf($(h)) === 'Prioritization within my top five')
  if (!h2) throw new Error('"Prioritization within my top five" not found')
  const result = new Map<string, string>()
  let current: string | null = null
  let buf: string[] = []
  const flush = () => {
    if (current) result.set(current, buf.join('\n\n'))
    buf = []
  }
  for (const block of sectionBlocks($, $(h2), ['h1', 'h2'])) {
    const head = block.is('p') ? textOf(block).match(/^#(\d+): (.+)$/) : null
    if (head) {
      flush()
      current = head[2]!
    }
    if (current) buf.push(blockMd($, block, base))
  }
  flush()
  return result
}

function matchName(sectionTitle: string, names: Iterable<string>): string | undefined {
  const t = sectionTitle.toLowerCase()
  for (const name of names) {
    const n = name.toLowerCase()
    if (t === n || t.includes(n) || n.includes(t)) return name
  }
  return undefined
}

for (const post of POSTS) {
  const res = await fetch(post.url, { headers: { 'user-agent': 'Mozilla/5.0 (trace)' } })
  if (!res.ok) throw new Error(`${post.url}: ${res.status}`)
  const $ = cheerio.load(await res.text())

  const classes = post.id === 'mdickens-2024' ? classification2024($, post.url) : null
  const priority = post.id === 'mdickens-2024' ? prioritization2024($, post.url) : null
  let donating: string | null = null
  if (post.id === 'mdickens-2025') {
    const h1 = $('h1')
      .toArray()
      .find((h) => textOf($(h)) === 'Where I’m donating')!
    donating = render($, sectionBlocks($, $(h1), ['h1']), post.url)
  }

  const reviews = []
  for (const h1Title of post.orgSections) {
    for (const section of h2Sections($, h1Title)) {
      if (post.skip.includes(section.title)) continue
      const org = post.rename?.[section.title] ?? section.title
      let classification: string
      if (classes) {
        const key = matchName(section.title, classes.keys())
        classification = key ? classes.get(key)! : (post.classify?.[org] ?? 'Not classified')
      } else {
        classification = post.classify?.[org] ?? post.classify?.[section.title] ?? 'Not classified'
      }
      const parts = [`Classification: ${classification}`, render($, section.blocks, post.url)]
      if (priority) {
        const key = matchName(section.title, priority.keys())
        if (key) parts.push(priority.get(key)!)
      }
      if (donating && org === 'PauseAI US') parts.push(donating)
      reviews.push({
        org,
        classification,
        sourceUrl: section.id ? `${post.url}#${section.id}` : post.url,
        review: parts.filter(Boolean).join('\n\n'),
      })
    }
  }
  if (reviews.length < 5) throw new Error(`${post.id}: only ${reviews.length} reviews parsed`)
  const unclassified = reviews
    .filter((r) => r.classification === 'Not classified')
    .map((r) => r.org)
  const file = {
    _comment: `Michael Dickens, "Where I Am Donating in ${post.reviewedAt.slice(0, 4)}", snapshotted by scripts/fetch-mdickens-reviews.ts. Each body opens with his classification of the org, then his write-up, then his top-five prioritization note or donation reasoning where there is one.`,
    id: post.id,
    reviewer: 'Michael Dickens',
    reviewerUrl: 'https://mdickens.me/',
    sourceUrl: post.url,
    reviewedAt: post.reviewedAt,
    reviews,
  }
  const out = `data/reviews/${post.id}.json`
  writeFileSync(out, JSON.stringify(file, null, 2) + '\n')
  console.log(
    `Wrote ${reviews.length} reviews to ${out}${unclassified.length ? ` (unclassified: ${unclassified.join(', ')})` : ''}`
  )
}
