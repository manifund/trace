'use client'

import { FunnelIcon } from '@heroicons/react/24/outline'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// The trigger that sits in the filter row under each column header. Reads
// "Any" in muted text when idle and the chosen value in brand when active, so
// the row doubles as a summary of what the table is currently showing.
export function FilterCell(
  props: ComponentProps<'button'> & { active: boolean; align?: 'left' | 'right' }
) {
  const { active, align = 'left', className, children, ...rest } = props
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'flex h-8 w-full items-center gap-1.5 px-2.5 text-[12px] outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset data-popup-open:bg-card',
        align === 'right' && 'justify-end text-right',
        active ? 'font-medium text-brand' : 'text-muted-foreground',
        className
      )}
    >
      <FunnelIcon
        aria-hidden="true"
        strokeWidth={2.25}
        className={cn('size-3 shrink-0', active ? 'text-brand' : 'text-ink/35')}
      />
      <span className="truncate">{children}</span>
    </button>
  )
}
