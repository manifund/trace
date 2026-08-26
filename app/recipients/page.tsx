import { Suspense } from 'react'
import { OrgIndex } from '@/components/org-index'
import { USE_SNAPSHOT } from '@/db/flags'
import { listGrants } from '@/db/grant'
import { getSnapshot } from '@/db/snapshot'
import { toOrgIndexRows } from '@/utils/org-index-rows'

export const revalidate = 600

export default async function Page() {
  const version = USE_SNAPSHOT ? (await getSnapshot()).version : null
  const rows = version ? [] : toOrgIndexRows('recipient', await listGrants('all'))
  return (
    <Suspense>
      <OrgIndex side="recipient" rows={rows} version={version} />
    </Suspense>
  )
}
