'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// [alias name, org slug, canonical org name]
type NameRow = [string, string, string]

let indexPromise: Promise<NameRow[]> | null = null
function loadIndex(): Promise<NameRow[]> {
  indexPromise ??= fetch('/org-names.json')
    .then((res) => (res.ok ? res.json() : []))
    .catch(() => [])
  return indexPromise
}

export function OrgSearch() {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<NameRow[] | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrap = useRef<HTMLDivElement>(null)

  const ensureIndex = () => {
    if (index === null) loadIndex().then(setIndex)
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2 || !index) return []
    const seen = new Set<string>()
    const out: { slug: string; name: string }[] = []
    for (const pass of [0, 1]) {
      for (const [alias, slug, name] of index) {
        const lower = alias.toLowerCase()
        const isPrefix = lower.startsWith(q)
        if ((pass === 0) !== isPrefix) continue
        if (!isPrefix && !lower.includes(q)) continue
        if (seen.has(slug)) continue
        seen.add(slug)
        out.push({ slug, name })
        if (out.length >= 8) return out
      }
    }
    return out
  }, [query, index])

  useEffect(() => {
    setActive(-1)
    setOpen(results.length > 0)
  }, [results])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const go = (slug: string) => {
    window.location.href = `/orgs/${slug}`
  }

  return (
    <div ref={wrap} className="relative ml-auto">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          ensureIndex()
          if (results.length > 0) setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, -1))
          } else if (e.key === 'Enter' && open && results.length > 0) {
            go(results[Math.max(active, 0)].slug)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        placeholder="Search orgs"
        className="w-44 rounded-sm border border-rule bg-paper-alt px-2 py-1 text-sm sm:w-56"
      />
      {open && results.length > 0 && (
        <ul className="absolute right-0 z-20 mt-1 w-72 rounded-sm border border-rule bg-paper py-1 text-sm">
          {results.map((r, i) => (
            <li key={r.slug}>
              <button
                className={`block w-full truncate px-3 py-1 text-left ${i === active ? 'bg-paper-alt' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.slug)}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
