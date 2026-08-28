'use client'

import { ChevronDownIcon } from '@heroicons/react/16/solid'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Rendering every funder makes the popover sluggish; show the first few matches.
const MAX_SHOWN = 40

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
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
          {selected.length > 0 && <span className="text-brand">({selected.length})</span>}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${label.toLowerCase()}s`}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {shown.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                onSelect={() => toggle(option.value)}
              >
                <Checkbox checked={selected.includes(option.value)} tabIndex={-1} />
                <span className="truncate">{option.label}</span>
              </CommandItem>
            ))}
            {matches.length > MAX_SHOWN && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                +{matches.length - MAX_SHOWN} more — keep typing
              </p>
            )}
          </CommandList>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="xs" className="w-full" onClick={() => onChange([])}>
                Clear
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
