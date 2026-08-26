'use client'

// Client-side index for /funders and /recipients: the page ships one compact
// tuple per grant and every filter recomputes the aggregates instantly.
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useSnapshot } from '@/components/use-snapshot'
import { CAUSE_OPTIONS } from '@/utils/cause-tree'
import { formatCoverage, formatMoney } from '@/utils/format'
import { toOrgIndexRows, type OrgIndexRow } from '@/utils/org-index-rows'

type SortKey = 'name' | 'grants' | 'total' | 'coverage' | 'years'

export type { OrgIndexRow }

export function OrgIndex(props: {
  side: 'funder' | 'recipient'
  rows: OrgIndexRow[] // empty when a version is given; derived from the snapshot instead
  version: string | null
}) {
  const snapshot = useSnapshot(props.version)
  const rows = useMemo(
    () => (snapshot ? toOrgIndexRows(props.side, snapshot.grants) : props.rows),
    [snapshot, props.side, props.rows]
  )
  const loading = props.version !== null && snapshot === null
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const cause = searchParams.get('cause') || 'ai-safety'
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDesc, setSortDesc] = useState(true)
  const yearMin = Number(searchParams.get('yearMin')) || null
  const yearMax = Number(searchParams.get('yearMax')) || null

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const years = useMemo(() => {
    const set = new Set<number>()
    for (const [, , year] of rows) if (year !== null) set.add(year)
    return Array.from(set).sort((a, b) => b - a)
  }, [rows])

  const aggregates = useMemo(() => {
    const byOrg = new Map<
      string,
      {
        name: string
        grantCount: number
        totalUsd: number
        coveredUsd: number
        firstYear: number | null
        lastYear: number | null
      }
    >()
    for (const [slug, name, year, amountUsd, causes, covered] of rows) {
      if (cause !== 'all' && !causes.includes(cause)) continue
      if (yearMin !== null && (year === null || year < yearMin)) continue
      if (yearMax !== null && (year === null || year > yearMax)) continue
      const entry = byOrg.get(slug) ?? {
        name,
        grantCount: 0,
        totalUsd: 0,
        coveredUsd: 0,
        firstYear: null,
        lastYear: null,
      }
      entry.grantCount++
      entry.totalUsd += amountUsd ?? 0
      if (covered !== false) entry.coveredUsd += amountUsd ?? 0
      if (year !== null) {
        entry.firstYear = entry.firstYear === null ? year : Math.min(entry.firstYear, year)
        entry.lastYear = entry.lastYear === null ? year : Math.max(entry.lastYear, year)
      }
      byOrg.set(slug, entry)
    }
    return Array.from(byOrg.entries()).map(([slug, entry]) => ({ slug, ...entry }))
  }, [rows, cause, yearMin, yearMax])

  const sorted = useMemo(() => {
    const rows = [...aggregates]
    const dir = sortDesc ? 1 : -1
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * -dir
        case 'grants':
          return (b.grantCount - a.grantCount) * dir
        case 'coverage': {
          const share = (row: (typeof rows)[number]) =>
            row.totalUsd > 0 ? row.coveredUsd / row.totalUsd : -1
          return (share(b) - share(a)) * dir
        }
        case 'years':
          return ((b.lastYear ?? -Infinity) - (a.lastYear ?? -Infinity)) * dir
        default:
          return (b.totalUsd - a.totalUsd) * dir
      }
    })
    return rows
  }, [aggregates, sortKey, sortDesc])

  const totalUsd = aggregates.reduce((sum, row) => sum + row.totalUsd, 0)
  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDesc(!sortDesc)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }
  const arrow = (key: SortKey) => (key === sortKey ? (sortDesc ? ' \u2193' : ' \u2191') : '')
  const sortable = 'cursor-pointer select-none hover:text-ink'
  const selectClass = 'rounded border border-rule bg-paper-alt px-2 py-1'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {loading && <span className="text-ink-muted">Loading all grants…</span>}
        <select
          value={cause}
          onChange={(e) => setParam('cause', e.target.value === 'ai-safety' ? '' : e.target.value)}
          className={selectClass}
        >
          <option value="all">All causes</option>
          {CAUSE_OPTIONS.map((area) => (
            <option key={area.slug} value={area.slug}>
              {' '.repeat(area.depth)}
              {area.name}
            </option>
          ))}
        </select>
        <select
          value={yearMin ?? ''}
          onChange={(e) => setParam('yearMin', e.target.value)}
          className={selectClass}
        >
          <option value="">From: start</option>
          {years.map((year) => (
            <option key={year} value={year}>
              From {year}
            </option>
          ))}
        </select>
        <select
          value={yearMax ?? ''}
          onChange={(e) => setParam('yearMax', e.target.value)}
          className={selectClass}
        >
          <option value="">To: present</option>
          {years.map((year) => (
            <option key={year} value={year}>
              To {year}
            </option>
          ))}
        </select>
        <span className="ml-auto text-ink-muted">
          {aggregates.length.toLocaleString()} orgs · {formatMoney(totalUsd)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="gb-table">
          <thead>
            <tr>
              <th className={sortable} onClick={() => toggle('name')}>
                {props.side === 'funder' ? 'Funder' : 'Recipient'}
                {arrow('name')}
              </th>
              <th className={`gb-num ${sortable}`} onClick={() => toggle('grants')}>
                Grants{arrow('grants')}
              </th>
              <th className={`gb-num ${sortable}`} onClick={() => toggle('total')}>
                Total{arrow('total')}
              </th>
              {props.side === 'funder' && (
                <th
                  className={`gb-num ${sortable}`}
                  onClick={() => toggle('coverage')}
                  title="Share of the total itemized as individual grants; aggregate and anonymous rows excluded"
                >
                  Coverage{arrow('coverage')}
                </th>
              )}
              <th className={`gb-num ${sortable}`} onClick={() => toggle('years')}>
                Years{arrow('years')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.slug}>
                <td>
                  <a href={`/orgs/${row.slug}`}>{row.name}</a>
                </td>
                <td className="gb-num">{row.grantCount.toLocaleString()}</td>
                <td className="gb-num">{formatMoney(row.totalUsd)}</td>
                {props.side === 'funder' && (
                  <td className="gb-num">{formatCoverage(row.coveredUsd, row.totalUsd)}</td>
                )}
                <td className="gb-num whitespace-nowrap">
                  {row.firstYear === null
                    ? '—'
                    : row.firstYear === row.lastYear
                      ? row.firstYear
                      : `${row.firstYear}–${row.lastYear}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
