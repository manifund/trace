'use client'

import { useMemo, useState } from 'react'
import { OverviewControls, StatStrip } from '@/components/overview-controls'
import { TreemapChart } from '@/components/treemap-chart'
import { analyzeStructure, applyFilters, buildTree } from '@/utils/flow'
import type { FlowRow, Nesting } from '@/utils/flow'
import { formatMoney } from '@/utils/format'

const NESTINGS: { value: Nesting; label: string }[] = [
  { value: 'funder-recipient', label: 'funder › recipient' },
  { value: 'cause-recipient', label: 'cause › recipient' },
  { value: 'funder-cause', label: 'funder › cause' },
]

export function TreemapView(props: {
  rows: FlowRow[]
  span: [number, number]
  vehicles: string[]
}) {
  const [filters, setFilters] = useState({
    cause: 'ai-safety',
    from: props.span[0],
    to: props.span[1],
  })
  const [nesting, setNesting] = useState<Nesting>('funder-recipient')

  const structure = useMemo(() => analyzeStructure(props.rows), [props.rows])
  // A grant into a regranting fund is left out: the fund's own grants
  // already carry those dollars, so counting both would double up.
  const filtered = useMemo(
    () =>
      applyFilters(props.rows, filters, props.span).filter(
        (row) => !structure.regrantor.has(row.r)
      ),
    [props.rows, filters, props.span, structure]
  )
  const vehicles = useMemo(() => new Set(props.vehicles), [props.vehicles])
  const branches = useMemo(
    () => buildTree(filtered, nesting, vehicles),
    [filtered, nesting, vehicles]
  )
  const total = useMemo(() => filtered.reduce((sum, row) => sum + row.a, 0), [filtered])

  return (
    <div>
      <StatStrip
        stats={[
          { label: 'Granted', value: formatMoney(Math.round(total)) },
          { label: 'Grants', value: filtered.length.toLocaleString() },
          { label: 'Funders', value: new Set(filtered.map((row) => row.f)).size.toLocaleString() },
          {
            label: 'Recipients',
            value: new Set(filtered.map((row) => row.r)).size.toLocaleString(),
          },
        ]}
      />
      <OverviewControls filters={filters} span={props.span} onChange={setFilters}>
        <select
          aria-label="Nesting"
          className="rounded border border-rule bg-paper px-2 py-1 text-xs"
          value={nesting}
          onChange={(e) => setNesting(e.target.value as Nesting)}
        >
          {NESTINGS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </OverviewControls>
      <TreemapChart branches={branches} total={total} />
    </div>
  )
}
