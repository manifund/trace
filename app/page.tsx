import { Suspense } from 'react'
import { GrantsTable } from '@/components/grants-table'
import { SSR_ROWS, USE_SNAPSHOT } from '@/db/flags'
import { listGrants, listSources } from '@/db/grant'
import { getSnapshot } from '@/db/snapshot'

export const revalidate = 600

// Statically rendered (ISR). With the snapshot on, the HTML carries only the
// first screen of rows and the browser loads the full dataset once; every
// filter, including cause, applies client-side either way.
export default async function Page() {
  const [grants, sources] = await Promise.all([listGrants('all'), listSources()])
  const version = USE_SNAPSHOT ? (await getSnapshot()).version : null
  return (
    <Suspense>
      <GrantsTable
        grants={version ? grants.slice(0, SSR_ROWS) : grants}
        version={version}
        sources={sources.filter((source) => source.last_ingested_at !== null)}
      />
    </Suspense>
  )
}
