import { TreemapView } from '@/components/treemap-view'
import { listGrants } from '@/db/grant'
import { toFlowRows, yearSpan } from '@/utils/flow'

export const revalidate = 600

export default async function Page() {
  const rows = toFlowRows(await listGrants('all'))
  return <TreemapView rows={rows} span={yearSpan(rows)} />
}
