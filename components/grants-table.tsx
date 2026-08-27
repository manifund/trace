'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { MultiSelect } from '@/components/multi-select'
import type { GrantRow } from '@/db/grant'
import { ESTIMATE_SYMBOLS, formatGrantDate, formatMoney } from '@/utils/format'
import { CAUSE_OPTIONS, displayCauses } from '@/utils/cause-tree'
import {
  applyFilters,
  filtersFromParams,
  filtersToParams,
  type GrantFilters,
} from '@/utils/grant-filters'

const PAGE = 200

export function GrantsTable(props: {
  grants: GrantRow[]
  sources: { id: string; name: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const cause = searchParams.get('cause') || 'ai-safety'
  const [filters, setFilters] = useState<GrantFilters>(() =>
    filtersFromParams(new URLSearchParams(searchParams.toString()))
  )
  const [limit, setLimit] = useState(PAGE)

  // Cause narrowing happens here, not on the server: the page is static.
  const causeRows = useMemo(
    () =>
      cause === 'all' ? props.grants : props.grants.filter((row) => row.causes.includes(cause)),
    [props.grants, cause]
  )

  const update = (partial: Partial<GrantFilters>) => {
    const next = { ...filters, ...partial }
    setFilters(next)
    setLimit(PAGE)
    const params = filtersToParams(next, cause)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const setCause = (nextCause: string) => {
    setLimit(PAGE)
    const params = filtersToParams(filters, nextCause)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const funderOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const grant of causeRows) names.set(grant.funderSlug, grant.funderName)
    return Array.from(names.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [causeRows])

  const sourceOptions = props.sources.map((source) => ({ value: source.id, label: source.name }))

  const years = useMemo(() => {
    const set = new Set<number>()
    for (const grant of causeRows) {
      if (grant.date) set.add(Number(grant.date.slice(0, 4)))
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [causeRows])

  const rows = useMemo(() => applyFilters(causeRows, filters), [causeRows, filters])
  const estimateNotes = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((r) => r.amountEstimated && r.estimateNote)
            .map((r) => r.estimateNote as string)
        )
      ),
    [rows]
  )
  const totalUsd = useMemo(() => rows.reduce((sum, row) => sum + (row.amountUsd ?? 0), 0), [rows])

  const sortHeader = (key: GrantFilters['sort'], label: string, numeric = false) => (
    <th
      className={numeric ? 'gb-num cursor-pointer' : 'cursor-pointer'}
      onClick={() =>
        update(
          filters.sort === key
            ? { dir: filters.dir === 'asc' ? 'desc' : 'asc' }
            : { sort: key, dir: key === 'date' || key === 'amount' ? 'desc' : 'asc' }
        )
      }
    >
      {label}
      {filters.sort === key ? (filters.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const csvHref = `/grants.csv?${filtersToParams(filters, cause).toString()}`

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search"
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
          className="w-56 rounded border border-rule bg-paper px-2 py-1 text-sm"
        />
        <MultiSelect
          label="Funder"
          options={funderOptions}
          selected={filters.funders}
          onChange={(funders) => update({ funders })}
        />
        <MultiSelect
          label="Source"
          options={sourceOptions}
          selected={filters.sources}
          onChange={(sources) => update({ sources })}
        />
        <select
          value={cause}
          onChange={(e) => setCause(e.target.value)}
          className="rounded border border-rule bg-paper-alt px-2 py-1 text-sm"
        >
          <option value="all">All causes</option>
          {CAUSE_OPTIONS.map((cause) => (
            <option key={cause.slug} value={cause.slug}>
              {' '.repeat(cause.depth)}
              {cause.name}
            </option>
          ))}
        </select>
        <select
          value={filters.yearMin ?? ''}
          onChange={(e) => update({ yearMin: e.target.value ? Number(e.target.value) : null })}
          className="rounded border border-rule bg-paper-alt px-2 py-1 text-sm"
        >
          <option value="">From: start</option>
          {years.map((year) => (
            <option key={year} value={year}>
              From {year}
            </option>
          ))}
        </select>
        <select
          value={filters.yearMax ?? ''}
          onChange={(e) => update({ yearMax: e.target.value ? Number(e.target.value) : null })}
          className="rounded border border-rule bg-paper-alt px-2 py-1 text-sm"
        >
          <option value="">To: present</option>
          {years.map((year) => (
            <option key={year} value={year}>
              To {year}
            </option>
          ))}
        </select>
        <a href={csvHref} className="ml-auto text-sm">
          CSV
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="gb-table">
          <thead>
            <tr>
              {sortHeader('date', 'Date')}
              {sortHeader('funder', 'Funder')}
              <th>Via</th>
              {sortHeader('recipient', 'Recipient')}
              {sortHeader('amount', 'Amount', true)}
              <th>Cause</th>
              <th>Source</th>
              <th>Purpose</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap">
                  {formatGrantDate(row.date, row.datePrecision)}
                </td>
                <td>
                  <a href={`/orgs/${row.funderSlug}`}>{row.funderName}</a>
                </td>
                <td>
                  {row.vias
                    .filter((via) => via.slug !== row.funderSlug)
                    .map((via, i) => (
                      <span key={via.slug}>
                        {i > 0 && ', '}
                        <a href={`/orgs/${via.slug}`}>{via.name}</a>
                      </span>
                    ))}
                </td>
                <td>
                  <a href={`/orgs/${row.recipientSlug}`}>{row.recipientName}</a>
                </td>
                <td className="gb-num whitespace-nowrap">
                  {row.amountEstimated && '~'}
                  {formatMoney(row.amountUsd)}
                  {row.amountEstimated && (
                    <a
                      href="#amount-notes"
                      title={row.estimateNote ?? undefined}
                      className="text-accent"
                    >
                      {ESTIMATE_SYMBOLS[
                        Math.max(estimateNotes.indexOf(row.estimateNote ?? ''), 0)
                      ] ?? '*'}
                    </a>
                  )}
                </td>
                <td className="max-w-44 text-xs text-ink-muted">
                  {displayCauses(row.causes).join(', ')}
                </td>
                <td className="whitespace-nowrap">
                  {row.url ? <a href={row.url}>{row.sourceId}</a> : row.sourceId}
                </td>
                <td className="max-w-md">
                  <span className="line-clamp-2">{row.description}</span>
                </td>
                <td className="whitespace-nowrap text-xs">
                  <a href={`/suggest?grant=${row.id}`} title="Edit this grant">
                    edit
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {estimateNotes.length > 0 && (
        <div id="amount-notes" className="mt-1 text-xs text-ink-muted">
          {estimateNotes.map((note, i) => (
            <p key={note}>
              {ESTIMATE_SYMBOLS[i] ?? '*'} {note}
            </p>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-baseline gap-4 text-sm text-ink-muted">
        <span>
          {rows.length.toLocaleString()} grants ·{' '}
          {rows.some((row) => row.amountEstimated) && (
            <a href="#amount-notes" title="Includes estimated amounts" className="text-accent">
              ~
            </a>
          )}
          {formatMoney(totalUsd)}
        </span>
        {limit < rows.length && (
          <button className="text-accent" onClick={() => setLimit(limit + PAGE)}>
            Show more
          </button>
        )}
      </div>
    </div>
  )
}
