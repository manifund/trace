'use client'

// The grants table on an org page. Client-side so the Date and Amount
// columns can be sorted; everything else is presentational.
import { useMemo, useState } from 'react'
import type { GrantRow } from '@/db/grant'
import { displayCauses } from '@/utils/cause-tree'
import { ESTIMATE_SYMBOLS, formatGrantDate, formatMoney } from '@/utils/format'

type SortKey = 'date' | 'amount'

const PAGE = 250

export function OrgGrantTable(props: {
  grants: GrantRow[]
  side: 'made' | 'received' | 'via'
  noteId: string
  estimateNotes: string[]
}) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [desc, setDesc] = useState(true)
  // Big funders have thousands of grants; rendering them all makes the page
  // slow to send and slow to paint. Show a window and let the reader extend it.
  const [limit, setLimit] = useState(PAGE)

  const sorted = useMemo(() => {
    const rows = [...props.grants]
    rows.sort((a, b) => {
      if (sortKey === 'amount') {
        // Undisclosed amounts sort last in either direction.
        if (a.amountUsd === null || b.amountUsd === null) {
          if (a.amountUsd === b.amountUsd) return 0
          return a.amountUsd === null ? 1 : -1
        }
        return desc ? b.amountUsd - a.amountUsd : a.amountUsd - b.amountUsd
      }
      const left = a.date ?? ''
      const right = b.date ?? ''
      if (left === right) return 0
      if (!left || !right) return !left ? 1 : -1
      return desc ? right.localeCompare(left) : left.localeCompare(right)
    })
    return rows
  }, [props.grants, sortKey, desc])

  const toggle = (key: SortKey) => {
    if (key === sortKey) setDesc(!desc)
    else {
      setSortKey(key)
      setDesc(true)
    }
  }
  const arrow = (key: SortKey) => (key === sortKey ? (desc ? ' ↓' : ' ↑') : '')
  const sortable = 'cursor-pointer select-none hover:text-ink'

  return (
    <div className="overflow-x-auto">
      <table className="gb-table">
        <thead>
          <tr>
            <th
              className={sortable}
              onClick={() => toggle('date')}
              aria-sort={sortKey === 'date' ? (desc ? 'descending' : 'ascending') : 'none'}
            >
              Date{arrow('date')}
            </th>
            {props.side === 'via' ? (
              <>
                <th>Funder</th>
                <th>Recipient</th>
              </>
            ) : (
              <th>{props.side === 'made' ? 'Recipient' : 'Funder'}</th>
            )}
            <th>Via</th>
            <th
              className={`gb-num ${sortable}`}
              onClick={() => toggle('amount')}
              aria-sort={sortKey === 'amount' ? (desc ? 'descending' : 'ascending') : 'none'}
            >
              Amount{arrow('amount')}
            </th>
            <th>Cause</th>
            <th>Source</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map((grant) => {
            const other =
              props.side === 'made'
                ? { slug: grant.recipientSlug, name: grant.recipientName }
                : { slug: grant.funderSlug, name: grant.funderName }
            return (
              <tr key={grant.id}>
                <td className="whitespace-nowrap">
                  {formatGrantDate(grant.date, grant.datePrecision)}
                </td>
                {props.side === 'via' ? (
                  <>
                    <td>
                      <a href={`/orgs/${grant.funderSlug}`}>{grant.funderName}</a>
                    </td>
                    <td>
                      <a href={`/orgs/${grant.recipientSlug}`}>{grant.recipientName}</a>
                    </td>
                  </>
                ) : (
                  <td>
                    <a href={`/orgs/${other.slug}`}>{other.name}</a>
                  </td>
                )}
                <td>
                  {grant.vias
                    .filter((via) => via.slug !== grant.funderSlug)
                    .map((via, i) => (
                      <span key={via.slug}>
                        {i > 0 && ', '}
                        <a href={`/orgs/${via.slug}`}>{via.name}</a>
                      </span>
                    ))}
                </td>
                <td className="gb-num whitespace-nowrap">
                  {grant.amountEstimated && '~'}
                  {formatMoney(grant.amountUsd)}
                  {grant.amountEstimated && (
                    <a
                      href={`#${props.noteId}`}
                      title={grant.estimateNote ?? undefined}
                      className="text-brand"
                    >
                      {ESTIMATE_SYMBOLS[
                        Math.max(props.estimateNotes.indexOf(grant.estimateNote ?? ''), 0)
                      ] ?? '*'}
                    </a>
                  )}
                </td>
                <td className="max-w-44 text-xs text-ink-muted">
                  {displayCauses(grant.causes).join(', ')}
                </td>
                <td className="whitespace-nowrap">
                  {grant.url ? <a href={grant.url}>{grant.sourceId}</a> : grant.sourceId}
                </td>
                <td className="max-w-md">
                  <span className="line-clamp-2">{grant.description}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.length > limit && (
        <p className="mt-2 text-sm text-ink-muted">
          Showing {limit.toLocaleString()} of {sorted.length.toLocaleString()}.{' '}
          <button className="underline" onClick={() => setLimit(limit + 4 * PAGE)}>
            Show more
          </button>{' '}
          ·{' '}
          <button className="underline" onClick={() => setLimit(sorted.length)}>
            Show all
          </button>
        </p>
      )}
    </div>
  )
}
