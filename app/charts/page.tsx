import { ChartsView } from '@/components/charts-view'
import { USE_SNAPSHOT } from '@/db/flags'
import { listGrants } from '@/db/grant'
import { getSnapshot } from '@/db/snapshot'

export const revalidate = 600

export default async function Page() {
  if (USE_SNAPSHOT) return <ChartsView version={(await getSnapshot()).version} />
  return <ChartsView grants={await listGrants('all')} />
}
