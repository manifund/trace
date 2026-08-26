'use client'

// Funding-by-year bars for an org profile. Shows one series per role the org
// actually has (received / made / via), grouped side by side.
import { useRef, useState } from 'react'
import { fmtCompact, niceTicks } from '@/components/charts'

type Series = { name: string; color: string; byYear: Record<number, number> }

export function OrgYearChart(props: { series: Series[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const series = props.series.filter((s) => Object.keys(s.byYear).length > 0)
  if (series.length === 0) return null

  const allYears = series.flatMap((s) => Object.keys(s.byYear).map(Number))
  const minYear = Math.min(...allYears)
  const maxYear = Math.max(...allYears)
  const years: number[] = []
  for (let y = minYear; y <= maxYear; y++) years.push(y)

  const H = 180
  const W = 720
  const padL = 52
  const padB = 20
  const padT = 6
  const dataMax = Math.max(1, ...series.flatMap((s) => Object.values(s.byYear)))
  const ticks = niceTicks(dataMax, 2)
  const max = ticks[ticks.length - 1]
  const plotW = W - padL - 8
  const plotH = H - padT - padB
  const slot = plotW / years.length
  const bw = Math.min(28, Math.max(3, (slot - 4) / series.length))
  const y = (v: number) => padT + plotH * (1 - v / max)

  return (
    <div ref={wrap} className="relative mb-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Funding by year">
        {ticks
          .filter((t) => t > 0)
          .map((t) => (
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
        <line x1={padL} x2={W - 8} y1={y(0)} y2={y(0)} stroke="var(--rule)" strokeWidth="1" />
        {years.map((year, yi) =>
          series.map((s, si) => {
            const v = s.byYear[year] ?? 0
            if (v === 0) return null
            const x = padL + slot * yi + (slot - bw * series.length) / 2 + bw * si
            return (
              <rect
                key={`${year}-${s.name}`}
                x={x}
                y={y(v)}
                width={Math.max(1, bw - 2)}
                height={Math.max(1, y(0) - y(v))}
                fill={s.color}
                rx="2"
                onMouseMove={(e) => {
                  const box = wrap.current?.getBoundingClientRect()
                  if (!box) return
                  setTip({
                    x: e.clientX - box.left,
                    y: e.clientY - box.top,
                    lines: [`${year}`, `${s.name}: ${fmtCompact(v)}`],
                  })
                }}
                onMouseLeave={() => setTip(null)}
              />
            )
          })
        )}
        {years
          .filter((_, i) => years.length <= 14 || i % Math.ceil(years.length / 14) === 0)
          .map((year, _, arr) => (
            <text
              key={year}
              x={padL + slot * years.indexOf(year) + slot / 2}
              y={H - 5}
              textAnchor="middle"
              fontSize="10"
              fill="var(--ink-muted)"
            >
              {year}
            </text>
          ))}
      </svg>
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-4 text-xs">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-xs"
                style={{ background: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {tip && (
        <div
          className="pointer-events-none absolute z-10 rounded-sm border border-rule bg-paper px-2 py-1 text-xs"
          style={{ left: tip.x + 12, top: tip.y - 8 }}
        >
          {tip.lines.map((line, i) => (
            <div key={i} className={i === 0 ? 'font-semibold' : 'text-ink-muted'}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
