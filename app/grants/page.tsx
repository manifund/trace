import { Suspense } from 'react'
import { GrantsTable } from '@/components/grants-table'
import { listGrants, listSources } from '@/db/grant'

export const revalidate = 600

// Statically rendered (ISR): the full grant set ships once and every filter,
// including cause, applies client-side.
export default async function Page() {
  const [grants, sources] = await Promise.all([listGrants('all'), listSources()])
  return (
    <Suspense>
      <GrantsTable
        grants={grants}
        sources={sources.filter((source) => source.last_ingested_at !== null)}
      />
    </Suspense>
  )
}
