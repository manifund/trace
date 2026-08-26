// The whole public dataset as one compact, JSON-serializable structure, small
// enough (~375KB brotli) to ship to the browser once and reuse on every page.
// Isomorphic: the server expands it to render, the client expands the same
// bytes to filter. `db/snapshot.ts` builds it; nothing else constructs one.
import type { GrantRow, SourceInfo } from '@/db/grant'

// Column order of a grant tuple. Arrays instead of objects: keys are the
// bulk of the JSON otherwise, and orgs/causes/sources are referenced by index
// into the dictionaries so each name is sent once.
export type GrantTuple = [
  id: string, // 8-hex UUID prefix, extended per row only when it collides
  date: string | null,
  datePrecision: GrantRow['datePrecision'],
  amount: number | null,
  currency: string | 0, // 0 = USD, the overwhelming default
  amountUsd: number | null,
  amountEstimated: 0 | 1,
  estimateNote: string | null,
  description: string | null,
  round: string | null,
  url: string | null,
  funder: number,
  recipient: number,
  sponsor: number | null,
  vias: number[],
  source: number | null,
  causes: number[],
]

export type Snapshot = {
  version: string // content hash; the client URL is keyed on it
  builtAt: string
  orgs: [slug: string, name: string, orgType: string, website: string | null][]
  // Aliases and former names: [name, org index, kind, valid_from, valid_to].
  // Canonical names are already in `orgs`, so the header search index is the
  // union of the two.
  names: [name: string, org: number, kind: string, from: string | null, to: string | null][]
  causes: string[]
  sources: SourceInfo[]
  grants: GrantTuple[]
}

export function expandGrants(snapshot: Snapshot): GrantRow[] {
  const org = (i: number) => ({ slug: snapshot.orgs[i][0], name: snapshot.orgs[i][1] })
  return snapshot.grants.map((t) => {
    const funder = org(t[11])
    const recipient = org(t[12])
    const sponsor = t[13] === null ? null : org(t[13])
    return {
      id: t[0],
      date: t[1],
      datePrecision: t[2],
      amount: t[3],
      currency: t[4] === 0 ? 'USD' : t[4],
      amountUsd: t[5],
      amountEstimated: t[6] === 1,
      estimateNote: t[7],
      description: t[8],
      round: t[9],
      url: t[10],
      funderSlug: funder.slug,
      funderName: funder.name,
      recipientSlug: recipient.slug,
      recipientName: recipient.name,
      sponsorSlug: sponsor?.slug ?? null,
      sponsorName: sponsor?.name ?? null,
      vias: t[14].map(org),
      sourceId: t[15] === null ? null : snapshot.sources[t[15]].id,
      causes: t[16].map((i) => snapshot.causes[i]),
    }
  })
}

// [alias or name, org slug, canonical org name] — the header typeahead index.
export function expandNameIndex(snapshot: Snapshot): [string, string, string][] {
  const rows: [string, string, string][] = snapshot.orgs.map(([slug, name]) => [name, slug, name])
  for (const [name, i] of snapshot.names) {
    const [slug, canonical] = snapshot.orgs[i]
    if (name !== canonical) rows.push([name, slug, canonical])
  }
  return rows
}

export type SnapshotOrg = {
  slug: string
  name: string
  org_type: string
  website: string | null
  names: { name: string; kind: string; valid_from: string | null; valid_to: string | null }[]
}

export function expandOrg(snapshot: Snapshot, index: number): SnapshotOrg {
  const [slug, name, org_type, website] = snapshot.orgs[index]
  const names = snapshot.names
    .filter((n) => n[1] === index)
    .map(([alias, , kind, valid_from, valid_to]) => ({ name: alias, kind, valid_from, valid_to }))
  return { slug, name, org_type, website, names }
}
