import './globals.css'
import Link from 'next/link'
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from 'next/font/google'
import type { Metadata } from 'next'
import { NavLinks } from '@/components/nav-links'
import { OrgSearch } from '@/components/org-search'
import { TooltipProvider } from '@/components/ui/tooltip'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
})
const plexCondensed = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-plex-condensed',
})

export const metadata: Metadata = {
  title: 'Trace',
  description: 'A database of AI safety grants, aggregated from public sources.',
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexCondensed.variable}`}>
      {/* Layout lives on a wrapper, not <body>: popup scroll locks rewrite
          body margins while open. `isolate` gives Base UI portals a clean
          stacking context. */}
      <body>
        <TooltipProvider>
          <div className="isolate mx-auto max-w-7xl px-4 py-5">
            <header className="mb-5 flex items-baseline gap-6 border-b border-rule pb-2">
              <Link
                href="/"
                className="font-display text-lg font-semibold tracking-[0.12em] text-ink! uppercase hover:no-underline!"
              >
                Trace
              </Link>
              <NavLinks />
              <OrgSearch />
            </header>
            {props.children}
          </div>
        </TooltipProvider>
      </body>
    </html>
  )
}
