'use client'

// Wireframe 2a: area is dollars, nested two levels deep. Click a block to
// zoom into it; click a block inside to open that org.
//
// Everything is laid out in one 1000x560 coordinate space and emitted as
// percentages, so the whole map scales with the page instead of drifting
// against fixed pixel sizes.
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtCompact, SERIES, SERIES_OTHER } from '@/components/charts'
import { squarify } from '@/utils/flow'
import type { Rect, TreeBranch, TreeLeaf } from '@/utils/flow'

const W = 1000
const H = 560
const HEADER = 22
const INSET = 3

const pct = (value: number, extent: number) => `${(value / extent) * 100}%`

// Blocks inside a parent fade down the ranking, so the big ones read first
// without spending a second hue on them.
const tint = (color: string, rank: number, count: number) => {
  const strength = count <= 1 ? 42 : 46 - (rank / Math.max(count - 1, 1)) * 32
  return `color-mix(in oklab, ${color} ${strength.toFixed(0)}%, var(--paper))`
}

function span(leaf: TreeLeaf) {
  if (leaf.from === null || leaf.to === null) return ''
  return leaf.from === leaf.to ? ` · ${leaf.from}` : ` · ${leaf.from}–${leaf.to}`
}

export function TreemapChart(props: { branches: TreeBranch[]; total: number }) {
  const router = useRouter()
  const [zoom, setZoom] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  const zoomed = zoom ? props.branches.find((branch) => branch.key === zoom) : undefined
  const colorOf = useMemo(() => {
    const map = new Map<string, string>()
    props.branches.forEach((branch, i) => {
      map.set(branch.key, i < SERIES.length && branch.key !== '~others' ? SERIES[i] : SERIES_OTHER)
    })
    return map
  }, [props.branches])

  const blocks = useMemo(
    () => squarify(props.branches, { x: 0, y: 0, w: W, h: H }),
    [props.branches]
  )

  const point = (event: React.MouseEvent, lines: string[]) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top, lines })
  }

  const shareOf = (value: number) =>
    props.total > 0 ? `${((value / props.total) * 100).toFixed(1)}%` : ''

  // `area` is the box the children fill, in coordinate-space units; the DOM
  // container it lands in is exactly that size, so percentages are of `area`.
  const childTiles = (parent: TreeBranch, area: Rect, color: string) =>
    squarify(parent.children, area).map((child, i) => {
      const wide = child.w > 58
      const tall = child.h > 26
      return (
        <div
          key={child.key}
          className="absolute overflow-hidden px-1 py-px"
          style={{
            left: pct(child.x + INSET / 2, area.w),
            top: pct(child.y + INSET / 2, area.h),
            width: pct(Math.max(0, child.w - INSET), area.w),
            height: pct(Math.max(0, child.h - INSET), area.h),
            // The folded tail is often the biggest block; keeping it palest
            // stops an aggregate from dominating the named ones.
            background:
              child.key === '~others'
                ? tint(color, parent.children.length, parent.children.length)
                : tint(color, i, parent.children.length),
            cursor: child.slug ? 'pointer' : 'default',
          }}
          onClick={(event) => {
            event.stopPropagation()
            if (child.slug) router.push(`/orgs/${child.slug}`)
          }}
          onMouseMove={(event) => {
            event.stopPropagation()
            point(event, [
              `${child.name} · ${parent.name}`,
              `${fmtCompact(child.value)} · ${child.count.toLocaleString()} grant${child.count === 1 ? '' : 's'}${span(child)}`,
            ])
          }}
        >
          {wide && tall && (
            <>
              <div className="truncate text-[11px] leading-tight">{child.name}</div>
              <div className="truncate text-[10px] leading-tight text-ink-muted">
                {fmtCompact(child.value)}
              </div>
            </>
          )}
          {wide && !tall && (
            <div className="truncate text-[10px] leading-tight">
              {child.name} <span className="text-ink-muted">{fmtCompact(child.value)}</span>
            </div>
          )}
        </div>
      )
    })

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-1.5 font-sans text-xs">
        <button
          onClick={() => setZoom(null)}
          className={zoomed ? 'text-accent' : 'text-ink-muted'}
          disabled={!zoomed}
        >
          All
        </button>
        {zoomed && (
          <>
            <span className="text-ink-muted">›</span>
            <span className="font-semibold">{zoomed.name}</span>
            <span className="text-ink-muted">
              {fmtCompact(zoomed.value)} · {shareOf(zoomed.value)}
            </span>
          </>
        )}
      </div>
      <div
        ref={wrap}
        className="relative w-full border border-rule"
        style={{ aspectRatio: `${W} / ${H}`, background: 'var(--paper)' }}
        onMouseLeave={() => setTip(null)}
      >
        {zoomed
          ? childTiles(zoomed, { x: 0, y: 0, w: W, h: H }, colorOf.get(zoomed.key) as string)
          : blocks.map((block) => {
              const color = colorOf.get(block.key) as string
              const boxW = Math.max(0, block.w - INSET)
              const boxH = Math.max(0, block.h - INSET)
              const bodyH = boxH - HEADER
              return (
                <div
                  key={block.key}
                  className="absolute flex cursor-pointer flex-col overflow-hidden"
                  style={{
                    left: pct(block.x + INSET / 2, W),
                    top: pct(block.y + INSET / 2, H),
                    width: pct(boxW, W),
                    height: pct(boxH, H),
                    border: `1px solid color-mix(in oklab, ${color} 45%, var(--paper))`,
                  }}
                  onClick={() => setZoom(block.key)}
                  onMouseMove={(event) =>
                    point(event, [
                      block.name,
                      `${fmtCompact(block.value)} · ${shareOf(block.value)} · ${block.count.toLocaleString()} grants`,
                    ])
                  }
                >
                  <div
                    className="flex shrink-0 items-center justify-between gap-2 overflow-hidden px-1.5"
                    style={{
                      height: pct(Math.min(HEADER, boxH), boxH),
                      background: `color-mix(in oklab, ${color} 20%, var(--paper))`,
                    }}
                  >
                    <span className="truncate text-[12px] font-semibold">{block.name}</span>
                    <span className="shrink-0 text-[11px] text-ink-muted">
                      {fmtCompact(block.value)}
                    </span>
                  </div>
                  <div className="relative grow">
                    {bodyH > 16 && childTiles(block, { x: 0, y: 0, w: boxW, h: bodyH }, color)}
                  </div>
                </div>
              )
            })}
        {tip && (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded border border-rule bg-paper px-2 py-1 text-xs"
            style={{ left: Math.min(tip.x + 12, 700), top: tip.y - 8 }}
          >
            {tip.lines.map((line, i) => (
              <div key={line + i} className={i === 0 ? 'font-semibold' : 'text-ink-muted'}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
