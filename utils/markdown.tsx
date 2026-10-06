import type { ReactNode } from 'react'

// Just enough markdown for review text: paragraphs, bullet lists, block
// quotes, [links](url), **bold** and *italics*. Anything else renders as
// written.
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|(?<![\w*\\])\*([^*\n]+)\*(?![\w*])/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  const push = (s: string) => out.push(s.replace(/\\([~*_])/g, '$1'))
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) push(text.slice(last, match.index))
    const key = `${keyPrefix}-${i++}`
    if (match[1] !== undefined) {
      out.push(
        <a key={key} href={match[2]}>
          {match[1]}
        </a>
      )
    } else if (match[3] !== undefined) {
      out.push(<strong key={key}>{match[3]}</strong>)
    } else {
      out.push(<em key={key}>{match[4]}</em>)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) push(text.slice(last))
  return out
}

function Block(props: { text: string; index: number; className?: string }) {
  const { text, index, className } = props
  const lines = text.split('\n')
  if (lines.every((line) => line.startsWith('- '))) {
    return (
      <ul className={`${className ?? ''} list-disc pl-5`}>
        {lines.map((line, j) => (
          <li key={j}>{inline(line.slice(2), `${index}-${j}`)}</li>
        ))}
      </ul>
    )
  }
  if (lines.every((line) => line.startsWith('>'))) {
    const inner = lines.map((line) => line.replace(/^> ?/, '')).join('\n')
    return (
      <blockquote className={`${className ?? ''} border-l-2 border-rule pl-3 text-ink-muted`}>
        <Markdown text={inner} />
      </blockquote>
    )
  }
  return <p className={className}>{inline(text, String(index))}</p>
}

export function Markdown(props: { text: string; className?: string }) {
  const blocks = props.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} text={block} index={i} className={props.className} />
      ))}
    </>
  )
}
