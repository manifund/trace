'use client'

import {
  ChevronDownIcon,
  ChevronUpIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
} from '@heroicons/react/16/solid'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
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
import { AmountFilter } from '@/components/amount-filter'
import { DateFilter } from '@/components/date-filter'
import { ListFilter, type ListOption } from '@/components/list-filter'
import { useGrants } from '@/components/use-grants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DEFAULT_FILTERS,
  filtersFromParams,
  filtersToParams,
  type GrantFilters,
} from '@/utils/grant-filters'

const PAGE = 200
const COLUMNS_KEY = 'trace:grant-columns'

// Columns hidden until the "+" in the header row reveals them.
const EXTRA_COLUMNS = ['via', 'cause'] as const
const DEFAULT_VISIBILITY: ColumnVisibilityState = { via: false, cause: false }

// Short source labels so the Source column stays narrow. The full name is
// always in the cell's title attribute, so collapsing several 990 filings to
// one label loses nothing on hover.
const SOURCE_SHORT: Record<string, string> = {
  ea_funds: 'EA Funds',
  sff: 'SFF',
  manifund: 'Manifund',
  vipul_donations: 'Vipul',
  coefficient_giving: 'Coefficient',
  acx_grants: 'ACX',
  fli: 'FLI',
  fli_990: 'Form 990',
  irs_990: 'Form 990',
  lightcone_990: 'Form 990',
  lightcone_commons: 'Lightcone',
  foresight: 'Foresight',
  schmidt_sciences: 'Schmidt',
  longview: 'Longview',
  jefftk: 'jefftk',
  bluedot: 'BlueDot',
  ftx_future_fund: 'FTX Future Fund',
  jaan_online: 'jaan.online',
  fund_estimates: 'Estimates',
  macroscopic: 'Macroscopic',
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
  source: 'w-32',
  recipient: 'w-44',
  via: 'w-32',
  cause: 'w-36',
  actions: 'w-8',
}

const SORT_KEYS: GrantFilters['sort'][] = ['date', 'amount', 'funder', 'recipient']
const isSortKey = (id: string): id is GrantFilters['sort'] => (SORT_KEYS as string[]).includes(id)

// Funder/recipient pickers rank orgs by the dollars behind them.
function orgOptions(rows: GrantRow[], side: 'funder' | 'recipient'): ListOption[] {
  const byOrg = new Map<string, ListOption>()
  for (const row of rows) {
    const slug = side === 'funder' ? row.funderSlug : row.recipientSlug
    const name = side === 'funder' ? row.funderName : row.recipientName
    const option = byOrg.get(slug) ?? { value: slug, label: name, usd: 0 }
    option.usd += row.amountUsd ?? 0
    byOrg.set(slug, option)
  }
  return Array.from(byOrg.values())
}

function sourceLabel(sourceId: string | null, names: Map<string, string>) {
  if (!sourceId) return '\u2014'
  return SOURCE_SHORT[sourceId] ?? names.get(sourceId) ?? sourceId
}

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
  version: string
  initial: GrantRow[]
  sources: { id: string; name: string }[]
}) {
  const grants = useGrants(props.version) ?? props.initial
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
        // Only the toggleable extras persist. A stale entry for a column that
        // is now always shown must not go on hiding it.
        const record = parsed as Record<string, unknown>
        setColumnVisibility({
          ...DEFAULT_VISIBILITY,
          ...Object.fromEntries(
            EXTRA_COLUMNS.filter((id) => typeof record[id] === 'boolean').map((id) => [
              id,
              record[id] as boolean,
            ])
          ),
        })
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
    () => (cause === 'all' ? grants : grants.filter((row) => row.causes.includes(cause))),
    [grants, cause]
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

  const sourceNames = useMemo(
    () => new Map(props.sources.map((source) => [source.id, source.name])),
    [props.sources]
  )

  // Filtering and sorting stay in grant-filters so the CSV route matches
  // exactly; the table runs with manualSorting and only owns the header UI.
  const rows = useMemo(() => applyFilters(causeRows, filters), [causeRows, filters])
  // Each histogram shows what the *other* filters leave, so its bars describe
  // exactly the set that slider is about to slice.
  const amountPool = useMemo(
    () =>
      applyFilters(causeRows, { ...filters, amountMin: null, amountMax: null }).map(
        (row) => row.amountUsd
      ),
    [causeRows, filters]
  )
  const datePool = useMemo(
    () =>
      applyFilters(causeRows, { ...filters, yearMin: null, yearMax: null }).map((row) => row.date),
    [causeRows, filters]
  )
  const funderOptions = useMemo(
    () => orgOptions(applyFilters(causeRows, { ...filters, funders: [] }), 'funder'),
    [causeRows, filters]
  )
  const recipientOptions = useMemo(
    () => orgOptions(applyFilters(causeRows, { ...filters, recipients: [] }), 'recipient'),
    [causeRows, filters]
  )
  const sourceOptions = useMemo(() => {
    const usd = new Map<string, number>()
    for (const row of applyFilters(causeRows, { ...filters, sources: [] })) {
      if (row.sourceId) usd.set(row.sourceId, (usd.get(row.sourceId) ?? 0) + (row.amountUsd ?? 0))
    }
    return props.sources.map((source) => ({
      value: source.id,
      label: source.name,
      usd: usd.get(source.id) ?? 0,
    }))
  }, [causeRows, filters, props.sources])
  // Cause is the page's scope, so its totals come from every cause with the
  // other filters applied.
  const causeOptions = useMemo((): ListOption[] => {
    const scoped = applyFilters(grants, filters)
    const usd = new Map<string, number>()
    let all = 0
    for (const row of scoped) {
      all += row.amountUsd ?? 0
      for (const slug of row.causes) usd.set(slug, (usd.get(slug) ?? 0) + (row.amountUsd ?? 0))
    }
    return [
      { value: 'all', label: 'All causes', usd: all },
      ...CAUSE_OPTIONS.map((option) => ({
        value: option.slug,
        label: option.name,
        usd: usd.get(option.slug) ?? 0,
        depth: option.depth + 1,
      })),
    ]
  }, [grants, filters])
  const anyFilter =
    filters.q !== '' ||
    filters.funders.length > 0 ||
    filters.recipients.length > 0 ||
    filters.sources.length > 0 ||
    filters.yearMin !== null ||
    filters.yearMax !== null ||
    filters.amountMin !== null ||
    filters.amountMax !== null
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
        helper.accessor('recipientName', {
          id: 'recipient',
          header: 'Recipient',
          cell: ({ row }) => (
            <OrgLink slug={row.original.recipientSlug} name={row.original.recipientName} />
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
            const title = sourceNames.get(grant.sourceId ?? '')
            const label = sourceLabel(grant.sourceId, sourceNames)
            return (
              <span className="block truncate whitespace-nowrap text-xs">
                {grant.url ? (
                  <a href={grant.url} title={title}>
                    {label}
                  </a>
                ) : (
                  <span title={title}>{label}</span>
                )}
              </span>
            )
          },
        }),
        helper.display({
          id: 'via',
          header: 'Via',
          cell: ({ row }) => {
            const grant = row.original
            // The via is only news when it isn't the funder or the source itself.
            const sourceName = sourceNames.get(grant.sourceId ?? '')
            const label = sourceLabel(grant.sourceId, sourceNames)
            const vias = grant.vias.filter(
              (via) =>
                via.slug !== grant.funderSlug && via.name !== sourceName && via.name !== label
            )
            if (vias.length === 0) return null
            return (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <a
                      href={`/orgs/${vias[0].slug}`}
                      className="block truncate text-xs text-muted-foreground"
                    />
                  }
                >
                  {vias[0].name}
                </TooltipTrigger>
                <TooltipContent>Via {vias.map((via) => via.name).join(', ')}</TooltipContent>
              </Tooltip>
            )
          },
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
      <div className="mb-2 flex items-baseline gap-3">
        <ListFilter
          options={causeOptions}
          selected={[cause]}
          onChange={([next]) => next && setCause(next)}
          multi={false}
          order="given"
          searchPlaceholder="Search causes"
          trigger="scope"
        />
        <span className="text-sm text-muted-foreground tabular-nums">
          {rows.length.toLocaleString()} grants · {rows.some((row) => row.amountEstimated) && '~'}
          {formatMoney(totalUsd)}
        </span>
        {anyFilter && (
          <button
            type="button"
            onClick={() => update({ ...DEFAULT_FILTERS, sort: filters.sort, dir: filters.dir })}
            className="text-xs text-brand hover:underline"
          >
            Clear filters
          </button>
        )}
        <a href={csvHref} className="caps-label ml-auto">
          CSV
        </a>
      </div>

      <Table className="table-fixed border-y text-[13px]">
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="border-b-0! hover:bg-transparent">
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
          {/* The filter strip shares the header's fill and sits under it with
              no rule between, so the two rows read as one thick header. */}
          <TableRow className="border-b border-ink/30 bg-paper-alt hover:bg-transparent">
            {table.getVisibleLeafColumns().map((column) => (
              <TableHead
                key={column.id}
                className={cn('h-8 border-l p-0 first:border-l-0', COLUMN_WIDTHS[column.id])}
              >
                {column.id === 'date' && (
                  <DateFilter
                    dates={datePool}
                    min={filters.yearMin}
                    max={filters.yearMax}
                    onChange={update}
                  />
                )}
                {column.id === 'purpose' && (
                  <div className="relative">
                    <MagnifyingGlassIcon
                      aria-hidden="true"
                      strokeWidth={2.25}
                      className={cn(
                        'pointer-events-none absolute top-2.5 left-2.5 size-3',
                        filters.q ? 'text-brand' : 'text-ink/30'
                      )}
                    />
                    <Input
                      type="search"
                      placeholder="Search"
                      aria-label="Search grants"
                      value={filters.q}
                      onChange={(e) => update({ q: e.target.value })}
                      className={cn(
                        'h-8 rounded-none border-0 bg-transparent pl-7 text-[12px]! shadow-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
                        filters.q && 'font-medium text-brand'
                      )}
                    />
                  </div>
                )}
                {column.id === 'funder' && (
                  <ListFilter
                    options={funderOptions}
                    selected={filters.funders}
                    onChange={(funders) => update({ funders })}
                    multi
                    searchPlaceholder="Search funders"
                  />
                )}
                {column.id === 'recipient' && (
                  <ListFilter
                    options={recipientOptions}
                    selected={filters.recipients}
                    onChange={(recipients) => update({ recipients })}
                    multi
                    searchPlaceholder="Search recipients"
                  />
                )}
                {column.id === 'amount' && (
                  <AmountFilter
                    amounts={amountPool}
                    min={filters.amountMin}
                    max={filters.amountMax}
                    onChange={update}
                  />
                )}
                {column.id === 'source' && (
                  <ListFilter
                    options={sourceOptions}
                    selected={filters.sources}
                    onChange={(sources) => update({ sources })}
                    multi
                    searchPlaceholder="Search sources"
                  />
                )}
              </TableHead>
            ))}
          </TableRow>
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

      {limit < rows.length && (
        <div className="mt-2 text-sm">
          <Button variant="link" size="sm" className="px-0" onClick={() => setLimit(limit + PAGE)}>
            Show {Math.min(PAGE, rows.length - limit).toLocaleString()} more of{' '}
            {rows.length.toLocaleString()}
          </Button>
        </div>
      )}
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
