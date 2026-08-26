'use client'

// Grants over time for one org: a bar per year, optionally split into the
// categories that make it up (cause areas for a funder, funders for a
// recipient). Same mark discipline as the other charts — thin marks, rounded
// data ends, a 2px gap between stacked segments, recessive grid.
import { useMemo, useRef, useState } from 'react'
import { fmtCompact, niceTicks, SERIES, SERIES_OTHER } from '@/components/charts'

export type Stack = { name: string; byYear: Record<number, number> }

export function OrgBarChart(props: {
  years: number[]
  totals: Record<number, number>
  stacks: Stack[]
  stackLabel: string
  height?: number
}) {
  const [stacked, setStacked] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  const colored = useMemo(
    () =>
      props.stacks.map((stack, i) => ({
        ...stack,
        color: i < SERIES.length ? SERIES[i] : SERIES_OTHER,
      })),
    [props.stacks]
  )

  const H = props.height ?? 260
  const W = 720
  const padL = 52
  const padB = 22
  const padT = 8
  const years = props.years
  const max = Math.max(1, ...years.map((y) => props.totals[y] ?? 0))
  const ticks = niceTicks(max * 1.05)
  const top = ticks[ticks.length - 1]
  const plotW = W - padL - 8
  const plotH = H - padT - padB
  const slot = plotW / Math.max(years.length, 1)
  const bw = Math.min(46, Math.max(4, slot - 6))
  const x = (i: number) => padL + slot * i + (slot - bw) / 2
  const y = (v: number) => padT + plotH * (1 - v / top)

  const move = (event: React.MouseEvent, year: number) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return
    const parts = stacked
      ? colored
          .map((s) => ({ name: s.name, value: s.byYear[year] ?? 0 }))
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 8)
          .map((p) => `${p.name}: ${fmtCompact(p.value)}`)
      : []
    setTip({
      x: event.clientX - box.left,
      y: event.clientY - box.top,
      lines: [`${year}`, fmtCompact(props.totals[year] ?? 0), ...parts],
    })
  }

  if (years.length === 0) return null

  return (
    <section className="mb-8">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h2 className="font-serif text-lg font-bold">Grants over time</h2>
        {colored.length > 1 && (
          <button
            onClick={() => setStacked(!stacked)}
            className="rounded border border-rule bg-paper-alt px-2 py-0.5 font-sans text-xs"
          >
            {stacked ? 'Show totals' : `Stack by ${props.stackLabel}`}
          </button>
        )}
      </div>
      <div ref={wrap} className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grants over time">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth="1" />
              <text
                x={padL - 6}
                y={y(t) + 3}
                textAnchor="end"
                fontSize="10"
                fill="var(--ink-muted)"
              >
                {fmtCompact(t)}
              </text>
            </g>
          ))}
          {years.map((year, i) => {
            const total = props.totals[year] ?? 0
            if (!stacked) {
              const h = Math.max(0, y(0) - y(total))
              return (
                <g key={year} onMouseMove={(e) => move(e, year)} onMouseLeave={() => setTip(null)}>
                  <rect x={x(i)} y={y(total)} width={bw} height={h} fill="var(--s1)" />
                </g>
              )
            }
            let cursor = 0
            const segments: { name: string; color: string; top: number; height: number }[] = []
            for (const stack of colored) {
              const value = stack.byYear[year] ?? 0
              if (value <= 0) continue
              const bottom = y(cursor)
              cursor += value
              const topY = y(cursor)
              segments.push({
                name: stack.name,
                color: stack.color,
                top: topY,
                height: Math.max(1, bottom - topY),
              })
            }
            return (
              <g key={year} onMouseMove={(e) => move(e, year)} onMouseLeave={() => setTip(null)}>
                {segments.map((segment) => (
                  <rect
                    key={segment.name}
                    x={x(i)}
                    y={segment.top}
                    width={bw}
                    height={segment.height}
                    fill={segment.color}
                  />
                ))}
                {/* A hairline where segments meet, rather than a gap through the bar. */}
                {segments.slice(0, -1).map((segment) => (
                  <line
                    key={`rule-${segment.name}`}
                    x1={x(i)}
                    x2={x(i) + bw}
                    y1={segment.top}
                    y2={segment.top}
                    stroke="var(--rule)"
                    strokeWidth="1"
                  />
                ))}
              </g>
            )
          })}
          {years
            .filter((_, i) => years.length <= 16 || i % Math.ceil(years.length / 16) === 0)
            .map((year) => (
              <text
                key={year}
                x={x(years.indexOf(year)) + bw / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fill="var(--ink-muted)"
              >
                {year}
              </text>
            ))}
        </svg>
        {tip && (
          <div
            className="pointer-events-none absolute z-10 rounded border border-rule bg-paper px-2 py-1 text-xs"
            style={{ left: tip.x + 12, top: tip.y - 8 }}
          >
            {tip.lines.map((line, i) => (
              <div key={line + i} className={i === 0 ? 'font-semibold' : 'text-ink-muted'}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
      {stacked && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-sans text-xs text-ink-muted">
          {colored.map((stack) => (
            <span key={stack.name} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: stack.color }}
              />
              {stack.name}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
