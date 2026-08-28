'use client'

import { CheckIcon, ChevronDownIcon } from '@heroicons/react/16/solid'
import { useMemo, useState } from 'react'
import { formatShortUsd } from '@/components/amount-filter'
import { FilterCell } from '@/components/filter-cell'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type ListOption = { value: string; label: string; usd: number; depth?: number }

// Beyond this many options the list is ranked and searched rather than shown
// whole; while searching, up to SEARCH_SHOWN matches render.
const TOP_SHOWN = 12
const SEARCH_SHOWN = 40

// A picker whose rows carry a bar for the dollars behind each option, so the
// list itself shows where the money is before anything is chosen. `order`
// 'usd' ranks by total; 'given' keeps the caller's order (for trees).
export function ListFilter(props: {
  options: ListOption[]
  selected: string[]
  onChange: (next: string[]) => void
  multi: boolean
  order?: 'usd' | 'given'
  searchPlaceholder: string
  trigger?: 'cell' | 'scope'
  align?: 'left' | 'right'
}) {
  const {
    options,
    selected,
    onChange,
    multi,
    order = 'usd',
    searchPlaceholder,
    trigger = 'cell',
    align,
  } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const searchable = options.length > TOP_SHOWN

  const ranked = useMemo(
    () => (order === 'usd' ? [...options].sort((a, b) => b.usd - a.usd) : options),
    [options, order]
  )
  const peak = Math.max(1, ...options.map((o) => o.usd))
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])

  let shown: ListOption[]
  let hidden = 0
  if (q) {
    const matches = ranked.filter((o) => o.label.toLowerCase().includes(q))
    shown = matches.slice(0, SEARCH_SHOWN)
    hidden = matches.length - shown.length
  } else if (searchable) {
    // Chosen rows pin to the top so they never scroll out of reach.
    const chosen = selected.map((v) => byValue.get(v)).filter((o): o is ListOption => !!o)
    const chosenSet = new Set(selected)
    const rest = ranked.filter((o) => !chosenSet.has(o.value)).slice(0, TOP_SHOWN)
    shown = [...chosen, ...rest]
    hidden = options.length - shown.length
  } else {
    shown = ranked
  }

  const toggle = (value: string) => {
    if (!multi) {
      onChange([value])
      setOpen(false)
      return
    }
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const first = selected[0] ? byValue.get(selected[0]) : undefined
  const activeLabel =
    selected.length === 0
      ? null
      : `${first?.label ?? selected[0]}${selected.length > 1 ? ` +${selected.length - 1}` : ''}`

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      {trigger === 'scope' ? (
        <PopoverTrigger className="inline-flex items-center gap-1 rounded-sm text-[15px] font-semibold text-ink outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/50">
          {activeLabel}
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </PopoverTrigger>
      ) : (
        <PopoverTrigger render={<FilterCell active={activeLabel !== null} align={align} />}>
          {activeLabel ?? 'Any'}
        </PopoverTrigger>
      )}
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        {searchable && (
          <div className="p-1.5 pb-0">
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 text-[12px]"
              autoFocus
            />
          </div>
        )}
        <div className="max-h-72 overflow-y-auto p-1.5">
          {shown.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches.</p>
          )}
          {shown.map((option) => {
            const checked = selected.includes(option.value)
            const pct = (option.usd / peak) * 100
            return (
              <button
                key={option.value}
                type="button"
                role={multi ? 'menuitemcheckbox' : 'menuitemradio'}
                aria-checked={checked}
                onClick={() => toggle(option.value)}
                className="flex h-7 w-full items-center gap-2 rounded-sm px-1.5 text-left text-[12.5px] outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/50"
                style={{ paddingLeft: 6 + (option.depth ?? 0) * 14 }}
              >
                {multi ? (
                  <Checkbox checked={checked} tabIndex={-1} />
                ) : (
                  <CheckIcon className={cn('size-3.5 text-brand', !checked && 'invisible')} />
                )}
                {/* The bar runs behind the text only, from the label's left
                    edge, so it never collides with the checkbox. */}
                <span className="relative flex min-w-0 flex-1 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -inset-y-0.5 -left-1.5',
                      checked ? 'bg-brand-soft' : 'bg-ink/6'
                    )}
                    style={{ width: `calc(${pct}% + 6px)` }}
                  />
                  <span className={cn('relative min-w-0 flex-1 truncate', checked && 'text-brand')}>
                    {option.label}
                  </span>
                  <span className="relative shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                    {option.usd > 0 ? formatShortUsd(Math.round(option.usd)) : ''}
                  </span>
                </span>
              </button>
            )
          })}
          {hidden > 0 && (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
              +{hidden.toLocaleString()} more — {q ? 'keep typing' : 'search to find them'}
            </p>
          )}
        </div>
        {multi && selected.length > 0 && (
          <div className="border-t p-1">
            <Button variant="ghost" size="xs" className="w-full" onClick={() => onChange([])}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
