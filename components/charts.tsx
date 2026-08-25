'use client'

// Hand-rolled SVG charts following the table discipline: thin marks, rounded
// data-ends, 2px surface gaps, recessive grid, muted labels, hover tooltips.
import { useMemo, useRef, useState } from 'react'

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)']
export const SERIES_OTHER = 'var(--s-other)'

export function fmtCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`
  if (abs >= 1e3) return `$${Math.round(value / 1e3)}K`
  return `$${Math.round(value)}`
}

export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; ; v += step) {
    ticks.push(v)
    if (v >= max) break
  }
  return ticks
}

type Tip = { x: number; y: number; lines: string[] } | null

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-10 rounded border border-rule bg-paper px-2 py-1 text-xs"
      style={{ left: tip.x + 12, top: tip.y - 8 }}
    >
      {tip.lines.map((line, i) => (
        <div key={i} className={i === 0 ? 'font-semibold' : 'text-ink-muted'}>
          {line}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- bar chart
export function YearBarChart(props: {
  data: { year: number; value: number }[]
  series?: { name: string; color: string }
  height?: number
}) {
  const [tip, setTip] = useState<Tip>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const H = props.height ?? 240
  const W = 720
  const padL = 52
  const padB = 22
  const padT = 8
  const data = props.data
  const max = Math.max(...data.map((d) => d.value), 1)
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const plotW = W - padL - 8
  const plotH = H - padT - padB
  const bw = Math.min(40, Math.max(6, plotW / data.length - 2))
  const x = (i: number) => padL + (plotW / data.length) * i + (plotW / data.length - bw) / 2
  const y = (v: number) => padT + plotH * (1 - v / top)
  const color = props.series?.color ?? 'var(--s1)'

  const move = (e: React.MouseEvent, d: { year: number; value: number }) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return
    setTip({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      lines: [`${d.year}`, fmtCompact(d.value)],
    })
  }

  if (data.length === 0) return <p className="text-sm text-ink-muted">No dated grants match.</p>
  return (
    <div ref={wrap} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Funding by year">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--ink-muted)">
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.year}>
            <rect
              x={x(i)}
              y={y(d.value)}
              width={bw}
              height={Math.max(0, y(0) - y(d.value))}
              fill={color}
              rx="4"
              onMouseMove={(e) => move(e, d)}
              onMouseLeave={() => setTip(null)}
            />
            {/* square off the bottom corners: bars anchor to the baseline */}
            {y(0) - y(d.value) > 4 && (
              <rect x={x(i)} y={y(0) - 4} width={bw} height={4} fill={color} />
            )}
            {(data.length <= 16 || i % Math.ceil(data.length / 16) === 0) && (
              <text
                x={x(i) + bw / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fill="var(--ink-muted)"
              >
                {d.year}
              </text>
            )}
          </g>
        ))}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

// --------------------------------------------------------------- line chart
// x values are arbitrary integers (years, or month indexes year*12+m); pass
// xTicks for axis labels and fmtX for tooltip headers when not plain years.
export function YearLineChart(props: {
  series: { name: string; color: string; points: Map<number, number> }[]
  years: number[]
  xTicks?: { value: number; label: string }[]
  fmtX?: (x: number) => string
  height?: number
}) {
  const [tip, setTip] = useState<Tip>(null)
  const [hoverYear, setHoverYear] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const H = props.height ?? 260
  const W = 720
  const padL = 52
  const padB = 22
  const padT = 8
  const years = props.years
  const max = Math.max(1, ...props.series.flatMap((s) => Array.from(s.points.values())))
  // 5% headroom so the tallest peak never rides the top edge of the plot.
  const ticks = niceTicks(max * 1.05)
  const top = ticks[ticks.length - 1]
  const plotW = W - padL - 12
  const plotH = H - padT - padB
  const x = (year: number) =>
    padL +
    (years.length === 1
      ? plotW / 2
      : (plotW * (year - years[0])) / (years[years.length - 1] - years[0]))
  const y = (v: number) => padT + plotH * (1 - v / top)

  const move = (e: React.MouseEvent) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return
    const px = ((e.clientX - box.left) / box.width) * W
    const year = years.reduce(
      (best, yr) => (Math.abs(x(yr) - px) < Math.abs(x(best) - px) ? yr : best),
      years[0]
    )
    setHoverYear(year)
    const lines = [
      props.fmtX ? props.fmtX(year) : `${year}`,
      ...props.series
        .map((s) => ({ s, v: s.points.get(year) }))
        .filter((e2) => e2.v !== undefined)
        .sort((a, b) => (b.v ?? 0) - (a.v ?? 0))
        .map((e2) => `${e2.s.name}: ${fmtCompact(e2.v ?? 0)}`),
    ]
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, lines })
  }

  if (years.length === 0) return <p className="text-sm text-ink-muted">No dated grants match.</p>
  return (
    <div ref={wrap} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Funding by year, by series"
        onMouseMove={move}
        onMouseLeave={() => {
          setTip(null)
          setHoverYear(null)
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 12} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--ink-muted)">
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        {(
          props.xTicks ??
          years
            .filter((yr, i) => years.length <= 16 || i % Math.ceil(years.length / 16) === 0)
            .map((yr) => ({ value: yr, label: `${yr}` }))
        ).map((tick) => (
          <text
            key={tick.value}
            x={x(tick.value)}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fill="var(--ink-muted)"
          >
            {tick.label}
          </text>
        ))}
        {hoverYear !== null && (
          <line
            x1={x(hoverYear)}
            x2={x(hoverYear)}
            y1={padT}
            y2={padT + plotH}
            stroke="var(--ink-muted)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        {props.series.map((s) => {
          const pts = years
            .filter((yr) => s.points.has(yr))
            .map((yr) => `${x(yr)},${y(s.points.get(yr) ?? 0)}`)
          return (
            <g key={s.name}>
              <polyline
                points={pts.join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {hoverYear !== null && s.points.has(hoverYear) && (
                <circle
                  cx={x(hoverYear)}
                  cy={y(s.points.get(hoverYear) ?? 0)}
                  r="4"
                  fill={s.color}
                  stroke="var(--paper)"
                  strokeWidth="2"
                />
              )}
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {props.series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- donut
export function DonutChart(props: { slices: { name: string; value: number; color: string }[] }) {
  const [tip, setTip] = useState<Tip>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const size = 260
  const cx = size / 2
  const cy = size / 2
  const R = 100
  const r = 58
  const total = props.slices.reduce((sum, s) => sum + s.value, 0)

  const arcs = useMemo(() => {
    let angle = -Math.PI / 2
    return props.slices.map((s) => {
      const frac = total > 0 ? s.value / total : 0
      const start = angle
      const end = angle + frac * Math.PI * 2
      angle = end
      return { ...s, start, end, frac }
    })
  }, [props.slices, total])

  const arcPath = (start: number, end: number) => {
    const large = end - start > Math.PI ? 1 : 0
    const p = (a: number, rad: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`
    return `M ${p(start, R)} A ${R} ${R} 0 ${large} 1 ${p(end, R)} L ${p(end, r)} A ${r} ${r} 0 ${large} 0 ${p(start, r)} Z`
  }

  if (total === 0) return <p className="text-sm text-ink-muted">No grants match.</p>
  return (
    <div ref={wrap} className="relative flex flex-wrap items-center gap-6">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label="Funding share"
      >
        {arcs.map((a) => (
          <path
            key={a.name}
            d={arcPath(a.start, a.end)}
            fill={a.color}
            stroke="var(--paper)"
            strokeWidth="2"
            onMouseMove={(e) => {
              const box = wrap.current?.getBoundingClientRect()
              if (!box) return
              setTip({
                x: e.clientX - box.left,
                y: e.clientY - box.top,
                lines: [a.name, `${fmtCompact(a.value)} · ${(a.frac * 100).toFixed(1)}%`],
              })
            }}
            onMouseLeave={() => setTip(null)}
          />
        ))}
      </svg>
      <table className="text-xs">
        <tbody>
          {arcs.map((a) => (
            <tr key={a.name}>
              <td className="pr-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: a.color }}
                />
              </td>
              <td className="pr-3">{a.name}</td>
              <td className="gb-num pr-3">{fmtCompact(a.value)}</td>
              <td className="gb-num text-ink-muted">{(a.frac * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Tooltip tip={tip} />
    </div>
  )
}
