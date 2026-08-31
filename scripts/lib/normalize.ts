// Conservative name normalization for entity matching. Deliberately no fuzzy
// matching: near-misses go through data/aliases.json instead.
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(inc|llc|ltd|incorporated)$/, '')
    .trim()
}

// Slugs stay ASCII for URLs; fully non-Latin names get a stable hash slug.
export function slugify(name: string): string {
  const ascii = normalizeName(name)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-')
    .slice(0, 80)
  if (ascii) return ascii
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return `org-${hash.toString(16)}`
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Suggesters type URLs the way they say them — `thecommonsproblem.com`, no
// scheme. Stored verbatim that renders as a *relative* href, so the browser
// resolves it against the current page (`/orgs/thecommonsproblem.com`). Give
// every stored URL a scheme, and keep anything that isn't http(s) out of an
// href entirely: `javascript:` and `data:` URLs are live in a link.
export function normalizeUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()
  if (scheme) return scheme === 'http' || scheme === 'https' ? value : null
  // Protocol-relative (`//example.com`) is scheme-less but not a bare domain.
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('/')) return null
  return `https://${value}`
}
