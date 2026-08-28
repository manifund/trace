import { TreemapFromSnapshot } from '@/components/treemap-from-snapshot'
import { TreemapView } from '@/components/treemap-view'
import { USE_SNAPSHOT } from '@/db/flags'
import { listGrants } from '@/db/grant'
import { listVehicleSlugs } from '@/db/org'
import { getSnapshot } from '@/db/snapshot'
import { toFlowRows, yearSpan } from '@/utils/flow'

export const revalidate = 600

// Where the money sits, as area: funders across the canvas, what each of them
// funded nested inside. The full grants table is at /grants.
export default async function Page() {
  if (USE_SNAPSHOT) {
    const [{ version }, vehicles] = await Promise.all([getSnapshot(), listVehicleSlugs()])
    return <TreemapFromSnapshot version={version} vehicles={vehicles} />
  }
  const [grants, vehicles] = await Promise.all([listGrants('all'), listVehicleSlugs()])
  const rows = toFlowRows(grants)
  return <TreemapView rows={rows} span={yearSpan(rows)} vehicles={vehicles} />
}
