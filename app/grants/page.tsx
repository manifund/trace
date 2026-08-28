import { Suspense } from 'react'
import { GrantsTable } from '@/components/grants-table'
import { getGrants, getGrantsVersion, listSources } from '@/db/grant'

export const revalidate = 600

// The server renders the first page of rows; the browser loads the full set
// once (useGrants) and every filter, including cause, applies client-side.
export default async function Page() {
  const [grants, version, sources] = await Promise.all([
    getGrants(),
    getGrantsVersion(),
    listSources(),
  ])
  return (
    <Suspense>
      <GrantsTable
        version={version}
        initial={grants.slice(0, 200)}
        sources={sources.filter((source) => source.last_ingested_at !== null)}
      />
    </Suspense>
  )
}
