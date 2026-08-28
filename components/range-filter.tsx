'use client'

import { ChevronDownIcon } from '@heroicons/react/16/solid'
import { Slider } from '@base-ui/react/slider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// A filter pill whose popover shows a histogram over a fixed set of stops
// with a two-thumb slider beneath. Bins sit between stops, so `bins` has one
// entry fewer than there are stops; the outermost stops mean "no bound".
export type RangePreset = { label: string; lo: number; hi: number }

export function RangeFilter(props: {
  label: string
  activeLabel: string | null
  bins: number[]
  value: [number, number]
  onChange: (next: [number, number]) => void
  stopLabel: (index: number) => string
  presets: RangePreset[]
  ariaLabel: string
}) {
  const { label, activeLabel, bins, value, onChange, stopLabel, presets, ariaLabel } = props
  const [lo, hi] = value
  const last = bins.length
  const peak = Math.max(1, ...bins)

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        {activeLabel ? <span className="text-brand">{activeLabel}</span> : label}
        <ChevronDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3 p-3">
        {/* Thumbs are centered on the track ends, so the chart is inset by
            half a thumb to keep bar edges and stops aligned. */}
        <div className="px-[7px]">
          <svg
            viewBox={`0 0 ${last} 10`}
            preserveAspectRatio="none"
            className="block h-12 w-full"
            aria-hidden="true"
          >
            {bins.map((count, i) => {
              const h = (count / peak) * 10
              // Only a real selection lights up; "any to any" stays quiet.
              const inRange = activeLabel !== null && i >= lo && i < hi
              return (
                <rect
                  key={i}
                  x={i + 0.08}
                  y={10 - h}
                  width={0.84}
                  height={h}
                  className={inRange ? 'fill-brand' : 'fill-ink/20'}
                />
              )
            })}
          </svg>
          <Slider.Root
            value={[lo, hi]}
            min={0}
            max={last}
            step={1}
            minStepsBetweenValues={1}
            onValueChange={(v) => onChange(v as [number, number])}
            aria-label={ariaLabel}
          >
            <Slider.Control className="flex h-4 w-full touch-none items-center select-none">
              <Slider.Track className="relative h-0.5 w-full rounded-full bg-ink/15">
                <Slider.Indicator className="absolute h-full rounded-full bg-brand" />
                {[0, 1].map((index) => (
                  <Slider.Thumb
                    key={index}
                    index={index}
                    aria-label={index === 0 ? 'Minimum' : 'Maximum'}
                    getAriaValueText={(_, v) => stopLabel(v)}
                    className="size-3.5 rounded-full border-2 border-brand bg-popover outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                ))}
              </Slider.Track>
            </Slider.Control>
          </Slider.Root>
        </div>
        <div className="flex justify-between px-[7px] font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>{stopLabel(lo)}</span>
          <span>{stopLabel(hi)}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => {
            const active = preset.lo === lo && preset.hi === hi
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? [0, last] : [preset.lo, preset.hi])}
                className={cn(
                  'rounded-md border px-1.5 py-0.5 text-[11.5px] tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  active
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-border text-ink-muted hover:border-ink/30 hover:text-ink'
                )}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
