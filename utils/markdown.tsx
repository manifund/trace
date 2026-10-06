import type { ReactNode } from 'react'

// Just enough markdown for review text: paragraphs, [links](url), *italics*.
// Anything else renders as written.
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*\\])\*([^*\n]+)\*(?![\w*])/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    if (match[1] !== undefined) {
      out.push(
        <a key={`${keyPrefix}-${i++}`} href={match[2]}>
          {match[1]}
        </a>
      )
    } else {
      out.push(<em key={`${keyPrefix}-${i++}`}>{match[3]}</em>)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out.map((node) => (typeof node === 'string' ? node.replace(/\\([~*_])/g, '$1') : node))
}

export function Markdown(props: { text: string; className?: string }) {
  const paragraphs = props.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={props.className}>
          {inline(paragraph, String(i))}
        </p>
      ))}
    </>
  )
}
