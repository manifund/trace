import { TreemapView } from '@/components/treemap-view'
import { firstPaintRows, getGrants, getGrantsVersion } from '@/db/grant'
import { listVehicleSlugs } from '@/db/org'
import { toFlowRows, yearSpan } from '@/utils/flow'

export const revalidate = 600

// Where the money sits, as area: funders across the canvas, what each of them
// funded nested inside. The full grants table is at /grants.
export default async function Page() {
  const [grants, version, vehicles] = await Promise.all([
    getGrants(),
    getGrantsVersion(),
    listVehicleSlugs(),
  ])
  const rows = toFlowRows(grants)
  return (
    <TreemapView
      version={version}
      initial={toFlowRows(firstPaintRows(grants))}
      span={yearSpan(rows)}
      vehicles={vehicles}
    />
  )
}
