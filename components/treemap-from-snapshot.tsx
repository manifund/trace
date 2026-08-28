'use client'

// Front page under the snapshot flag: the treemap's rows are derived in the
// browser from the same dataset every other page uses, instead of shipping
// a second copy of every grant in the HTML.
import { useMemo } from 'react'
import { TreemapView } from '@/components/treemap-view'
import { useSnapshot } from '@/components/use-snapshot'
import { toFlowRows, yearSpan } from '@/utils/flow'

export function TreemapFromSnapshot(props: { version: string; vehicles: string[] }) {
  const snapshot = useSnapshot(props.version)
  const rows = useMemo(() => (snapshot ? toFlowRows(snapshot.grants) : null), [snapshot])
  if (!rows) return <p className="text-sm text-muted-foreground">Loading all grants…</p>
  return <TreemapView rows={rows} span={yearSpan(rows)} vehicles={props.vehicles} />
}
