import { Suspense } from 'react'
import { OrgIndex } from '@/components/org-index'
import { firstPaintRows, getGrants, getGrantsVersion } from '@/db/grant'
import { toIndexRows } from '@/utils/org-index-rows'

export const revalidate = 600

export default async function Page() {
  const [grants, version] = await Promise.all([getGrants(), getGrantsVersion()])
  return (
    <Suspense>
      <OrgIndex
        side="recipient"
        version={version}
        initial={toIndexRows(firstPaintRows(grants), 'recipient')}
      />
    </Suspense>
  )
}
