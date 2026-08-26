'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const LINKS = [
  ['/', 'Grants'],
  ['/funders', 'Funders'],
  ['/recipients', 'Recipients'],
  ['/charts', 'Charts'],
  ['/suggestions', 'Suggestions'],
  ['/about', 'About'],
] as const

export function NavLinks() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-5">
      {LINKS.map(([href, label]) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'caps-label pb-2 -mb-2.5 border-b-2 hover:no-underline!',
              active ? 'border-navy text-navy!' : 'border-transparent hover:text-ink!'
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
