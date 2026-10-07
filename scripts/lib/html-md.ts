// HTML -> markdown, just what the review renderer understands. Shared by the
// review fetchers that read org write-ups out of web pages.
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode } from 'domhandler'

export function inlineMd($: CheerioAPI, node: AnyNode, base: string): string {
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

export function blockMd($: CheerioAPI, el: Cheerio<AnyNode>, base: string): string {
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

export function textOf(el: Cheerio<AnyNode>): string {
  return el.text().replace(/\s+/g, ' ').trim()
}
