import type { GrantRow } from '@/db/grant'
import { countsTowardCoverage } from '@/utils/format'

// [org slug, org name, year, amount USD, cause slugs, counts toward coverage]
export type OrgIndexRow = [string, string, number | null, number | null, string[], boolean?]

// One compact tuple per grant for the /funders and /recipients index.
export function toIndexRows(grants: GrantRow[], side: 'funder' | 'recipient'): OrgIndexRow[] {
  return grants.map((grant) =>
    side === 'funder'
      ? [
          grant.funderSlug,
          grant.funderName,
          grant.date ? Number(grant.date.slice(0, 4)) : null,
          grant.amountUsd,
          grant.causes,
          countsTowardCoverage(grant.recipientName),
        ]
      : [
          grant.recipientSlug,
          grant.recipientName,
          grant.date ? Number(grant.date.slice(0, 4)) : null,
          grant.amountUsd,
          grant.causes,
        ]
  )
}
