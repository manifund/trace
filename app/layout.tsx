import './globals.css'
import Link from 'next/link'
import { IBM_Plex_Sans_Condensed, IBM_Plex_Serif } from 'next/font/google'
import type { Metadata } from 'next'
import { OrgSearch } from '@/components/org-search'

const plexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
})
const plexCondensed = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Grantbook',
  description: 'A database of AI safety grants, aggregated from public sources.',
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSerif.variable} ${plexCondensed.variable}`}>
      <body className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 flex items-baseline gap-6 border-b border-rule pb-3">
          <Link href="/" className="font-serif text-xl font-bold !text-ink hover:!no-underline">
            Grantbook
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/">Grants</Link>
            <Link href="/funders">Funders</Link>
            <Link href="/recipients">Recipients</Link>
            <Link href="/charts">Charts</Link>
            <Link href="/about">About</Link>
          </nav>
          <OrgSearch />
        </header>
        {props.children}
      </body>
    </html>
  )
}
