'use client'

import {
  ChevronDownIcon,
  ChevronUpIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
} from '@heroicons/react/16/solid'
import {
  columnVisibilityFeature,
  createColumnHelper,
  rowExpandingFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { GrantRow } from '@/db/grant'
import { cn } from '@/lib/utils'
import { formatGrantDate, formatMoney } from '@/utils/format'
import { CAUSE_OPTIONS, displayCauses } from '@/utils/cause-tree'
import {
  applyFilters,
  filtersFromParams,
  filtersToParams,
  type GrantFilters,
} from '@/utils/grant-filters'

const PAGE = 200
const COLUMNS_KEY = 'trace:grant-columns'

// Columns hidden until the "+" in the header row reveals them.
const EXTRA_COLUMNS = ['recipient', 'cause'] as const
const DEFAULT_VISIBILITY: ColumnVisibilityState = { recipient: false, cause: false }

// Short source labels so the Source column stays one word wide.
const SOURCE_SHORT: Record<string, string> = {
  ea_funds: 'EA Funds',
  sff: 'SFF',
  manifund: 'Manifund',
  vipul_donations: 'Vipul',
  coefficient_giving: 'Coefficient',
  acx_grants: 'ACX',
  fli: 'FLI',
  lightcone_commons: 'Lightcone',
  foresight: 'Foresight',
  schmidt_sciences: 'Schmidt',
  longview: 'Longview',
  jefftk: 'jefftk',
}

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  rowExpandingFeature,
})
const helper = createColumnHelper<typeof features, GrantRow>()

const NUMERIC_COLUMNS = new Set(['amount'])
// Fixed layout: the Purpose column absorbs the slack; others get set widths.
const COLUMN_WIDTHS: Record<string, string> = {
  date: 'w-28',
  funder: 'w-44',
  amount: 'w-28',
  source: 'w-40',
  recipient: 'w-44',
  cause: 'w-36',
  actions: 'w-8',
}

const SORT_KEYS: GrantFilters['sort'][] = ['date', 'amount', 'funder', 'recipient']
const isSortKey = (id: string): id is GrantFilters['sort'] => (SORT_KEYS as string[]).includes(id)

function OrgLink(props: { slug: string; name: string; className?: string }) {
  return (
    <a
      href={`/orgs/${props.slug}`}
      className={cn('block truncate', props.className)}
      title={props.name}
    >
      {props.name}
    </a>
  )
}

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
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_VISIBILITY)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Column choice is a per-browser convenience, not part of the shareable URL.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_KEY)
      const parsed: unknown = saved ? JSON.parse(saved) : null
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setColumnVisibility(parsed as ColumnVisibilityState)
      }
    } catch {}
  }, [])
  const updateVisibility = (next: ColumnVisibilityState) => {
    setColumnVisibility(next)
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next))
    } catch {}
  }
  const extrasShown = EXTRA_COLUMNS.every((id) => columnVisibility[id] !== false)
  const toggleExtras = () =>
    updateVisibility(Object.fromEntries(EXTRA_COLUMNS.map((id) => [id, !extrasShown])))

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
    setExpanded({})
    router.replace(`${pathname}?${filtersToParams(next, cause).toString()}`, { scroll: false })
  }

  const setCause = (nextCause: string) => {
    setLimit(PAGE)
    setExpanded({})
    router.replace(`${pathname}?${filtersToParams(filters, nextCause).toString()}`, {
      scroll: false,
    })
  }

  const funderOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const grant of causeRows) names.set(grant.funderSlug, grant.funderName)
    return Array.from(names.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [causeRows])

  const sourceNames = useMemo(
    () => new Map(props.sources.map((source) => [source.id, source.name])),
    [props.sources]
  )
  const sourceOptions = props.sources.map((source) => ({ value: source.id, label: source.name }))

  const years = useMemo(() => {
    const set = new Set<number>()
    for (const grant of causeRows) {
      if (grant.date) set.add(Number(grant.date.slice(0, 4)))
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [causeRows])

  // Filtering and sorting stay in grant-filters so the CSV route matches
  // exactly; the table runs with manualSorting and only owns the header UI.
  const rows = useMemo(() => applyFilters(causeRows, filters), [causeRows, filters])
  const pageRows = useMemo(() => rows.slice(0, limit), [rows, limit])
  const totalUsd = useMemo(() => rows.reduce((sum, row) => sum + (row.amountUsd ?? 0), 0), [rows])

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('date', {
          header: 'Date',
          sortDescFirst: true,
          cell: ({ row }) => (
            <span className="whitespace-nowrap tabular-nums">
              {formatGrantDate(row.original.date, row.original.datePrecision)}
            </span>
          ),
        }),
        helper.accessor('description', {
          id: 'purpose',
          header: 'Purpose',
          enableSorting: false,
          cell: ({ row }) =>
            row.original.description ? (
              <span className="block truncate">{row.original.description}</span>
            ) : (
              <span className="block truncate text-muted-foreground">
                Grant to {row.original.recipientName}
              </span>
            ),
        }),
        helper.accessor('funderName', {
          id: 'funder',
          header: 'Funder',
          cell: ({ row }) => (
            <OrgLink slug={row.original.funderSlug} name={row.original.funderName} />
          ),
        }),
        helper.accessor('amountUsd', {
          id: 'amount',
          header: 'Amount',
          sortDescFirst: true,
          cell: ({ row }) => {
            const grant = row.original
            return (
              <span
                className="whitespace-nowrap font-semibold text-brand tabular-nums"
                title={grant.amountEstimated ? (grant.estimateNote ?? 'Estimated') : undefined}
              >
                {grant.amountEstimated && '~'}
                {formatMoney(grant.amountUsd)}
              </span>
            )
          },
        }),
        helper.accessor('sourceId', {
          id: 'source',
          header: 'Source',
          enableSorting: false,
          cell: ({ row }) => {
            const grant = row.original
            const label = grant.sourceId
              ? (SOURCE_SHORT[grant.sourceId] ?? sourceNames.get(grant.sourceId) ?? grant.sourceId)
              : '—'
            // The via is only news when it isn't the funder or the source itself.
            const sourceName = sourceNames.get(grant.sourceId ?? '')
            const vias = grant.vias.filter(
              (via) =>
                via.slug !== grant.funderSlug && via.name !== sourceName && via.name !== label
            )
            return (
              <span className="flex items-center gap-1 whitespace-nowrap text-xs">
                {grant.url ? (
                  <a href={grant.url} title={sourceNames.get(grant.sourceId ?? '')}>
                    {label}
                  </a>
                ) : (
                  <span title={sourceNames.get(grant.sourceId ?? '')}>{label}</span>
                )}
                {vias.length > 0 && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <a
                            href={`/orgs/${vias[0].slug}`}
                            className="max-w-24 truncate text-muted-foreground"
                          />
                        }
                      >
                        via {vias[0].name}
                      </TooltipTrigger>
                      <TooltipContent>Via {vias.map((via) => via.name).join(', ')}</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </span>
            )
          },
        }),
        helper.accessor('recipientName', {
          id: 'recipient',
          header: 'Recipient',
          cell: ({ row }) => (
            <OrgLink slug={row.original.recipientSlug} name={row.original.recipientName} />
          ),
        }),
        helper.accessor('causes', {
          id: 'cause',
          header: 'Cause',
          enableSorting: false,
          cell: ({ row }) => (
            <span className="block truncate text-xs text-muted-foreground">
              {displayCauses(row.original.causes).join(', ')}
            </span>
          ),
        }),
        helper.display({
          id: 'actions',
          header: () => (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={toggleExtras}
                    aria-label={extrasShown ? 'Hide extra columns' : 'Show more columns'}
                  />
                }
              >
                {extrasShown ? <MinusIcon /> : <PlusIcon />}
              </TooltipTrigger>
              <TooltipContent>{extrasShown ? 'Fewer columns' : 'More columns'}</TooltipContent>
            </Tooltip>
          ),
          cell: ({ row }) => (
            <a
              href={`/suggest?grant=${row.original.id}`}
              className="flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-ink focus-visible:opacity-100"
              aria-label="Edit this grant"
              title="Edit this grant"
            >
              <PencilIcon className="size-3.5" />
            </a>
          ),
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceNames, extrasShown]
  )

  const sorting: SortingState = [{ id: filters.sort, desc: filters.dir === 'desc' }]
  const onSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const first = next[0]
    if (!first || !isSortKey(first.id)) return
    update({ sort: first.id, dir: first.desc ? 'desc' : 'asc' })
  }

  const table = useTable({
    features,
    columns,
    data: pageRows,
    getRowId: (row) => row.id,
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    getRowCanExpand: () => true,
    // `data` changes identity on every "show more"; don't let that collapse
    // open detail rows (update/setCause reset expanded explicitly).
    autoResetExpanded: false,
    state: { sorting, columnVisibility, expanded },
    onSortingChange,
    onColumnVisibilityChange: (updater) =>
      updateVisibility(typeof updater === 'function' ? updater(columnVisibility) : updater),
    onExpandedChange: (updater) =>
      setExpanded((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        return next === true ? {} : next
      }),
  })

  const visibleCount = table.getVisibleLeafColumns().length
  const csvHref = `/grants.csv?${filtersToParams(filters, cause).toString()}`

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search grants"
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
          className="h-7 w-52 text-[0.8rem]"
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
        <Select value={cause} onValueChange={(v) => v && setCause(v)} modal={false}>
          <SelectTrigger size="sm">
            <SelectValue>
              {cause === 'all'
                ? 'All causes'
                : (CAUSE_OPTIONS.find((o) => o.slug === cause)?.name ?? cause)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="all">All causes</SelectItem>
            {CAUSE_OPTIONS.map((option) => (
              <SelectItem key={option.slug} value={option.slug}>
                <span style={{ paddingLeft: option.depth * 10 }}>{option.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.yearMin ? String(filters.yearMin) : 'start'}
          onValueChange={(v) => update({ yearMin: v === 'start' ? null : Number(v) })}
          modal={false}
        >
          <SelectTrigger size="sm">
            <SelectValue>{filters.yearMin ? `From ${filters.yearMin}` : 'From start'}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="start">From start</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={String(year)}>
                From {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.yearMax ? String(filters.yearMax) : 'present'}
          onValueChange={(v) => update({ yearMax: v === 'present' ? null : Number(v) })}
          modal={false}
        >
          <SelectTrigger size="sm">
            <SelectValue>{filters.yearMax ? `To ${filters.yearMax}` : 'To present'}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="present">To present</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={String(year)}>
                To {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <a href={csvHref} className="caps-label ml-auto">
          CSV
        </a>
      </div>

      <Table className="table-fixed border-y text-[13px]">
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const numeric = NUMERIC_COLUMNS.has(header.column.id)
                const sortable = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'caps-label h-8 border-l bg-paper-alt px-2.5 first:border-l-0',
                      numeric && 'text-right',
                      COLUMN_WIDTHS[header.column.id],
                      header.column.id === 'actions' && 'px-1 text-center',
                      sortable && 'cursor-pointer select-none hover:text-ink'
                    )}
                    aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
                    onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5',
                        numeric && 'flex-row-reverse'
                      )}
                    >
                      <table.FlexRender header={header} />
                      {sorted === 'asc' && <ChevronUpIcon className="size-3.5 text-brand" />}
                      {sorted === 'desc' && <ChevronDownIcon className="size-3.5 text-brand" />}
                    </span>
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const grant = row.original
            const open = row.getIsExpanded()
            return (
              <Fragment key={row.id}>
                <TableRow
                  className={cn(
                    'group h-7 cursor-pointer',
                    open ? 'border-b-0 bg-card' : 'hover:bg-card'
                  )}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a, button')) return
                    row.toggleExpanded()
                  }}
                  aria-expanded={open}
                >
                  {row.getVisibleCells().map((cell) => {
                    const numeric = NUMERIC_COLUMNS.has(cell.column.id)
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'border-l px-2.5 py-1 first:border-l-0',
                          numeric && 'text-right',
                          cell.column.id === 'actions' && 'px-1'
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    )
                  })}
                </TableRow>
                {open && (
                  <TableRow className="bg-card hover:bg-card">
                    <TableCell colSpan={visibleCount} className="px-2.5 pt-0 pb-2.5">
                      <GrantDetail
                        grant={grant}
                        sourceName={sourceNames.get(grant.sourceId ?? '')}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>

      <div className="mt-2 flex items-baseline gap-4 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {rows.length.toLocaleString()} grants · {rows.some((row) => row.amountEstimated) && '~'}
          {formatMoney(totalUsd)}
        </span>
        {limit < rows.length && (
          <Button variant="link" size="sm" className="px-0" onClick={() => setLimit(limit + PAGE)}>
            Show {Math.min(PAGE, rows.length - limit).toLocaleString()} more
          </Button>
        )}
      </div>
    </div>
  )
}

function GrantDetail(props: { grant: GrantRow; sourceName?: string }) {
  const { grant, sourceName } = props
  const vias = grant.vias.filter((via) => via.slug !== grant.funderSlug)
  type Fact = [string, React.ReactNode]
  const facts: Fact[] = []
  facts.push([
    'Recipient',
    <OrgLink slug={grant.recipientSlug} name={grant.recipientName} className="inline" />,
  ])
  if (vias.length > 0) {
    facts.push([
      'Via',
      vias.map((via, i) => (
        <span key={via.slug}>
          {i > 0 && ', '}
          <OrgLink slug={via.slug} name={via.name} className="inline" />
        </span>
      )),
    ])
  }
  if (grant.sponsorSlug && grant.sponsorName) {
    facts.push([
      'Fiscal sponsor',
      <OrgLink slug={grant.sponsorSlug} name={grant.sponsorName} className="inline" />,
    ])
  }
  if (grant.round) facts.push(['Round', grant.round])
  if (grant.causes.length > 0) facts.push(['Cause', displayCauses(grant.causes).join(', ')])
  if (grant.amount !== null && grant.currency !== 'USD') {
    facts.push(['Original', formatMoney(grant.amount, grant.currency)])
  }
  facts.push([
    'Source',
    grant.url ? (
      <a href={grant.url}>{sourceName ?? grant.sourceId}</a>
    ) : (
      (sourceName ?? grant.sourceId ?? '—')
    ),
  ])
  return (
    <div className="flex flex-col gap-4 border-l-2 border-brand py-2 pl-4 md:flex-row md:gap-10">
      <div className="min-w-0 flex-1">
        <div className="caps-label mb-1 text-[10px]">Purpose</div>
        <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">
          {grant.description ?? <span className="text-muted-foreground">No description.</span>}
        </p>
        {grant.estimateNote && (
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-brand">~</span> {grant.estimateNote}
          </p>
        )}
      </div>
      <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-2.5 self-start text-[13px] md:w-96">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="caps-label text-[10px]">{label}</dt>
            <dd className="truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
