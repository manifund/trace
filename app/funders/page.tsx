import { Suspense } from 'react'
import { OrgIndex, type OrgIndexRow } from '@/components/org-index'
import { listGrants } from '@/db/grant'
import { COVERAGE_EXCLUDED_SLUGS } from '@/utils/format'

export const revalidate = 600

export default async function Page() {
  const grants = await listGrants('all')
  const rows: OrgIndexRow[] = grants.map((grant) => [
    grant.funderSlug,
    grant.funderName,
    grant.date ? Number(grant.date.slice(0, 4)) : null,
    grant.amountUsd,
    grant.causes,
    !COVERAGE_EXCLUDED_SLUGS.includes(grant.recipientSlug),
  ])
  return (
    <Suspense>
      <OrgIndex side="funder" rows={rows} />
    </Suspense>
  )
}
