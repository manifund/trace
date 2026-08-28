import { ChartsView } from '@/components/charts-view'
import { getGrants, getGrantsVersion, firstPaintRows } from '@/db/grant'

export const revalidate = 600

export default async function Page() {
  const [grants, version] = await Promise.all([getGrants(), getGrantsVersion()])
  return <ChartsView version={version} initial={firstPaintRows(grants)} />
}
