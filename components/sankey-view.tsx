'use client'

import { useMemo, useState } from 'react'
import { FlowControls, StatStrip, ViewToggle } from '@/components/flow-controls'
import { SankeyChart } from '@/components/sankey-chart'
import { analyzeStructure, applyFilters, buildSankey } from '@/utils/flow'
import type { FlowRow } from '@/utils/flow'
import { formatMoney } from '@/utils/format'

export function SankeyView(props: { rows: FlowRow[]; span: [number, number] }) {
  const [filters, setFilters] = useState({
    cause: 'ai-safety',
    from: props.span[0],
    to: props.span[1],
  })
  const structure = useMemo(() => analyzeStructure(props.rows), [props.rows])
  const data = useMemo(() => {
    const filtered = applyFilters(props.rows, filters, props.span)
    return buildSankey(props.rows, filtered, structure)
  }, [props.rows, filters, props.span, structure])

  return (
    <div>
      <StatStrip
        stats={[
          { label: 'Granted', value: formatMoney(Math.round(data.total)) },
          { label: 'Grants', value: data.grants.toLocaleString() },
          { label: 'Funders', value: data.funders.toLocaleString() },
          { label: 'Recipients', value: data.recipients.toLocaleString() },
        ]}
      />
      <FlowControls filters={filters} span={props.span} onChange={setFilters}>
        <div className="ml-auto">
          <ViewToggle active="sankey" />
        </div>
      </FlowControls>
      <SankeyChart data={data} />
      <p className="mt-3 max-w-3xl font-sans text-xs text-ink-muted">
        Money granted to a fund that regrants it is shown once, at the point it reaches a recipient,
        and credited back to whoever gave the fund its money.
      </p>
    </div>
  )
}
