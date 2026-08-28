import { TreemapView } from '@/components/treemap-view'
import { listGrants } from '@/db/grant'
import { listVehicleSlugs } from '@/db/org'
import { toFlowRows, yearSpan } from '@/utils/flow'

export const revalidate = 600

// Where the money sits, as area: funders across the canvas, what each of them
// funded nested inside. The full grants table is at /grants.
export default async function Page() {
  const [grants, vehicles] = await Promise.all([listGrants('all'), listVehicleSlugs()])
  const rows = toFlowRows(grants)
  return <TreemapView rows={rows} span={yearSpan(rows)} vehicles={vehicles} />
}
