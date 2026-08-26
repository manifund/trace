'use client'

import { Popover } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'

const MAX_SHOWN = 250

export function MultiSelect(props: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const { label, options, selected, onChange } = props
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  const shown = matches.slice(0, MAX_SHOWN)
  return (
    <Popover className="relative">
      <Popover.Button className="flex items-center gap-1 rounded-sm border border-rule bg-paper-alt px-2 py-1 text-sm">
        {label}
        {selected.length > 0 && <span className="text-accent">({selected.length})</span>}
        <ChevronDownIcon className="h-4 w-4 text-ink-muted" />
      </Popover.Button>
      <Popover.Panel className="absolute z-10 mt-1 max-h-72 w-64 overflow-y-auto rounded-sm border border-rule bg-paper p-2 shadow-none">
        <div className="mb-1 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            autoFocus
            className="w-full rounded-sm border border-rule bg-paper-alt px-2 py-0.5 text-sm"
          />
          {selected.length > 0 && (
            <button className="text-xs text-accent" onClick={() => onChange([])}>
              clear
            </button>
          )}
        </div>
        {shown.map((option) => (
          <label key={option.value} className="flex items-center gap-2 py-0.5 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, option.value]
                    : selected.filter((v) => v !== option.value)
                )
              }
            />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
        {matches.length > MAX_SHOWN && (
          <p className="py-0.5 text-xs text-ink-muted">+{matches.length - MAX_SHOWN} more</p>
        )}
      </Popover.Panel>
    </Popover>
  )
}
