'use client'

// Wireframe 1a: donors -> funders -> recipients, one band per flow. Bands are
// tinted by the funder in the middle, which is where the story is; hovering
// any band traces the whole path it belongs to.
import { useMemo, useRef, useState } from 'react'
import { fmtCompact, SERIES, SERIES_OTHER } from '@/components/charts'
import type { SankeyData, SankeyLink, SankeyNode } from '@/utils/flow'

const W = 1080
const H = 530
const PAD_L = 168
const PAD_R = 214
const PAD_T = 24
const PAD_B = 10
const NODE_W = 13
const GAP = 9

type Placed = SankeyNode & { x: number; y: number; height: number; color: string }
type Ribbon = SankeyLink & { path: string; color: string }

function trim(name: string, max: number) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

function layout(data: SankeyData) {
  const plotH = H - PAD_T - PAD_B
  const columns: SankeyNode[][] = [[], [], []]
  for (const node of data.nodes) columns[node.column].push(node)

  // Funders first, biggest at the top; the outer columns then sort by where
  // their traffic lands, which is what keeps the bands from tangling.
  columns[1].sort((a, b) => b.value - a.value)
  const funderOrder = new Map(columns[1].map((node, i) => [node.key, i]))
  const barycenter = (key: string, side: 'source' | 'target') => {
    let weight = 0
    let sum = 0
    for (const link of data.links) {
      const own = side === 'source' ? link.source : link.target
      if (own !== key) continue
      const other = side === 'source' ? link.target : link.source
      const rank = funderOrder.get(other)
      if (rank === undefined) continue
      sum += rank * link.value
      weight += link.value
    }
    return weight > 0 ? sum / weight : Number.MAX_SAFE_INTEGER
  }
  const sortOuter = (nodes: SankeyNode[], side: 'source' | 'target') => {
    const centers = new Map(nodes.map((node) => [node.key, barycenter(node.key, side)]))
    nodes.sort(
      (a, b) => (centers.get(a.key) as number) - (centers.get(b.key) as number) || b.value - a.value
    )
  }
  sortOuter(columns[0], 'source')
  sortOuter(columns[2], 'target')

  const tallest = Math.max(...columns.map((column) => column.length))
  const scale = (plotH - (tallest - 1) * GAP) / Math.max(data.total, 1)
  const x = [PAD_L, Math.round((W - PAD_R + PAD_L - NODE_W) / 2), W - PAD_R - NODE_W]

  // Hues go to the named funders in size order and stop there. The catch-all
  // node takes the neutral, so no two funders ever share a colour.
  const hue = new Map<string, string>()
  let taken = 0
  for (const node of columns[1]) {
    if (node.slug === '~other' || taken >= SERIES.length) hue.set(node.key, SERIES_OTHER)
    else hue.set(node.key, SERIES[taken++])
  }

  const placed = new Map<string, Placed>()
  columns.forEach((column, index) => {
    const height =
      column.reduce((t, n) => t + Math.max(2, n.value * scale), 0) + (column.length - 1) * GAP
    let cursor = PAD_T + Math.max(0, (plotH - height) / 2)
    for (const node of column) {
      const nodeH = Math.max(2, node.value * scale)
      placed.set(node.key, {
        ...node,
        x: x[index],
        y: cursor,
        height: nodeH,
        color: index === 1 ? (hue.get(node.key) as string) : 'var(--ink)',
      })
      cursor += nodeH + GAP
    }
  })

  // Each node pays out its bands top to bottom in the order their far ends
  // sit, so ribbons stay parallel instead of braiding.
  const outgoing = new Map<string, number>()
  const incoming = new Map<string, number>()
  const yOf = (key: string) => placed.get(key)?.y ?? 0
  const ordered = [...data.links].sort(
    (a, b) => yOf(a.source) - yOf(b.source) || yOf(a.target) - yOf(b.target)
  )
  const bySource = [...ordered].sort(
    (a, b) => yOf(a.source) - yOf(b.source) || yOf(a.target) - yOf(b.target)
  )
  const byTarget = [...ordered].sort(
    (a, b) => yOf(a.target) - yOf(b.target) || yOf(a.source) - yOf(b.source)
  )
  const startY = new Map<SankeyLink, number>()
  const endY = new Map<SankeyLink, number>()
  for (const link of bySource) {
    const node = placed.get(link.source)
    if (!node) continue
    const used = outgoing.get(link.source) ?? 0
    startY.set(link, node.y + used * scale)
    outgoing.set(link.source, used + link.value)
  }
  for (const link of byTarget) {
    const node = placed.get(link.target)
    if (!node) continue
    const used = incoming.get(link.target) ?? 0
    endY.set(link, node.y + used * scale)
    incoming.set(link.target, used + link.value)
  }

  const ribbons: Ribbon[] = ordered.map((link) => {
    const from = placed.get(link.source) as Placed
    const to = placed.get(link.target) as Placed
    const thickness = Math.max(1, link.value * scale)
    const x0 = from.x + NODE_W
    const x1 = to.x
    const mid = (x0 + x1) / 2
    const a0 = startY.get(link) ?? from.y
    const b0 = endY.get(link) ?? to.y
    const a1 = a0 + thickness
    const b1 = b0 + thickness
    return {
      ...link,
      color: placed.get(link.funderKey)?.color ?? SERIES_OTHER,
      path: `M${x0},${a0} C${mid},${a0} ${mid},${b0} ${x1},${b0} L${x1},${b1} C${mid},${b1} ${mid},${a1} ${x0},${a1} Z`,
    }
  })

  return { placed: Array.from(placed.values()), ribbons }
}

type Focus = { kind: 'funder' | 'node'; key: string } | null

export function SankeyChart(props: { data: SankeyData }) {
  const { placed, ribbons } = useMemo(() => layout(props.data), [props.data])
  const [focus, setFocus] = useState<Focus>(null)
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const byKey = useMemo(() => new Map(placed.map((node) => [node.key, node])), [placed])

  const lit = (ribbon: Ribbon) =>
    !focus ||
    (focus.kind === 'funder' && ribbon.funderKey === focus.key) ||
    (focus.kind === 'node' && (ribbon.source === focus.key || ribbon.target === focus.key))

  const share = (value: number) =>
    props.data.total > 0 ? `${((value / props.data.total) * 100).toFixed(1)}%` : ''

  const point = (event: React.MouseEvent, lines: string[]) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top, lines })
  }

  const headers: { label: string; x: number; anchor: 'start' | 'middle' | 'end' }[] = [
    { label: 'Donors', x: PAD_L + NODE_W, anchor: 'end' },
    { label: 'Funders', x: (W - PAD_R + PAD_L) / 2, anchor: 'middle' },
    { label: 'Recipients', x: W - PAD_R - NODE_W, anchor: 'start' },
  ]

  return (
    <div ref={wrap} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Grant flows from donors through funders to recipients"
      >
        {headers.map((header) => (
          <text
            key={header.label}
            x={header.x}
            y={13}
            textAnchor={header.anchor}
            fontFamily="var(--font-sans), system-ui, sans-serif"
            fontSize="11"
            fontWeight="600"
            letterSpacing="0.07em"
            fill="var(--ink-muted)"
          >
            {header.label.toUpperCase()}
          </text>
        ))}
        <g>
          {ribbons.map((ribbon) => (
            <path
              key={`${ribbon.source}>${ribbon.target}`}
              d={ribbon.path}
              fill={ribbon.color}
              opacity={lit(ribbon) ? (focus ? 0.62 : 0.34) : 0.07}
              onMouseEnter={() => setFocus({ kind: 'funder', key: ribbon.funderKey })}
              onMouseMove={(e) =>
                point(e, [
                  `${byKey.get(ribbon.source)?.name} → ${byKey.get(ribbon.target)?.name}`,
                  `${fmtCompact(ribbon.value)} · ${share(ribbon.value)}`,
                ])
              }
              onMouseLeave={() => {
                setFocus(null)
                setTip(null)
              }}
            />
          ))}
        </g>
        {placed.map((node) => (
          <g key={node.key}>
            <rect
              x={node.x}
              y={node.y}
              width={NODE_W}
              height={node.height}
              fill={node.color}
              onMouseEnter={() => setFocus({ kind: 'node', key: node.key })}
              onMouseMove={(e) =>
                point(e, [node.name, `${fmtCompact(node.value)} · ${share(node.value)}`])
              }
              onMouseLeave={() => {
                setFocus(null)
                setTip(null)
              }}
            />
            <text
              x={node.column === 0 ? node.x - 8 : node.x + NODE_W + 8}
              y={node.y + node.height / 2 + (node.height >= 26 ? -1 : 3.5)}
              textAnchor={node.column === 0 ? 'end' : 'start'}
              fontSize="11.5"
              fill="var(--ink)"
              stroke="var(--paper)"
              strokeWidth="3.5"
              paintOrder="stroke"
            >
              {trim(node.name, node.column === 1 ? 26 : 24)}
            </text>
            {node.height >= 26 && (
              <text
                x={node.column === 0 ? node.x - 8 : node.x + NODE_W + 8}
                y={node.y + node.height / 2 + 12}
                textAnchor={node.column === 0 ? 'end' : 'start'}
                fontSize="10"
                fill="var(--ink-muted)"
                stroke="var(--paper)"
                strokeWidth="3.5"
                paintOrder="stroke"
              >
                {fmtCompact(node.value)}
              </text>
            )}
          </g>
        ))}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded border border-rule bg-paper px-2 py-1 text-xs"
          style={{ left: Math.min(tip.x + 12, 760), top: tip.y - 8 }}
        >
          {tip.lines.map((line, i) => (
            <div key={line + i} className={i === 0 ? 'font-semibold' : 'text-ink-muted'}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
