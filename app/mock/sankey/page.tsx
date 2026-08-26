import { SankeyView } from '@/components/sankey-view'
import { listGrants } from '@/db/grant'
import { toFlowRows, yearSpan } from '@/utils/flow'

export const revalidate = 600

export default async function Page() {
  const rows = toFlowRows(await listGrants('all'))
  return <SankeyView rows={rows} span={yearSpan(rows)} />
}
