// Filter/sort logic shared by the client table and the CSV export route.
import type { GrantRow } from '@/db/grant'
import { searchInAny } from './parse'

export type GrantFilters = {
  q: string
  funders: string[]
  sources: string[]
  yearMin: number | null
  yearMax: number | null
  // Dollar bounds, min inclusive / max exclusive, null = open-ended.
  amountMin: number | null
  amountMax: number | null
  sort: 'date' | 'amount' | 'funder' | 'recipient'
  dir: 'asc' | 'desc'
}

export const DEFAULT_FILTERS: GrantFilters = {
  q: '',
  funders: [],
  sources: [],
  yearMin: null,
  yearMax: null,
  amountMin: null,
  amountMax: null,
  sort: 'date',
  dir: 'desc',
}

export function filtersFromParams(params: URLSearchParams): GrantFilters {
  const list = (key: string) => params.get(key)?.split(',').filter(Boolean) ?? []
  const num = (key: string) => {
    const value = Number(params.get(key))
    return Number.isFinite(value) && value > 0 ? value : null
  }
  const sort = params.get('sort')
  const dir = params.get('dir')
  return {
    q: params.get('q') ?? '',
    funders: list('funders'),
    sources: list('sources'),
    yearMin: num('yearMin'),
    yearMax: num('yearMax'),
    amountMin: num('amountMin'),
    amountMax: num('amountMax'),
    sort: sort === 'amount' || sort === 'funder' || sort === 'recipient' ? sort : 'date',
    dir: dir === 'asc' ? 'asc' : 'desc',
  }
}

export function filtersToParams(filters: GrantFilters, cause: string): URLSearchParams {
  const params = new URLSearchParams()
  if (cause !== 'ai-safety') params.set('cause', cause)
  if (filters.q) params.set('q', filters.q)
  if (filters.funders.length > 0) params.set('funders', filters.funders.join(','))
  if (filters.sources.length > 0) params.set('sources', filters.sources.join(','))
  if (filters.yearMin) params.set('yearMin', String(filters.yearMin))
  if (filters.yearMax) params.set('yearMax', String(filters.yearMax))
  if (filters.amountMin) params.set('amountMin', String(filters.amountMin))
  if (filters.amountMax) params.set('amountMax', String(filters.amountMax))
  if (filters.sort !== 'date') params.set('sort', filters.sort)
  if (filters.dir !== 'desc') params.set('dir', filters.dir)
  return params
}

export function applyFilters(rows: GrantRow[], filters: GrantFilters): GrantRow[] {
  let out = rows
  if (filters.funders.length > 0) {
    const set = new Set(filters.funders)
    out = out.filter((row) => set.has(row.funderSlug))
  }
  if (filters.sources.length > 0) {
    const set = new Set(filters.sources)
    out = out.filter((row) => row.sourceId !== null && set.has(row.sourceId))
  }
  if (filters.yearMin !== null || filters.yearMax !== null) {
    out = out.filter((row) => {
      if (!row.date) return false
      const year = Number(row.date.slice(0, 4))
      return (
        (filters.yearMin === null || year >= filters.yearMin) &&
        (filters.yearMax === null || year <= filters.yearMax)
      )
    })
  }
  if (filters.amountMin !== null || filters.amountMax !== null) {
    // A range implies a known amount, so unknown-amount grants drop out.
    out = out.filter(
      (row) =>
        row.amountUsd !== null &&
        (filters.amountMin === null || row.amountUsd >= filters.amountMin) &&
        (filters.amountMax === null || row.amountUsd < filters.amountMax)
    )
  }
  if (filters.q) {
    out = out.filter((row) =>
      searchInAny(
        filters.q,
        row.funderName,
        row.recipientName,
        row.sponsorName ?? '',
        row.vias.map((via) => via.name).join(' '),
        row.description ?? '',
        row.round ?? ''
      )
    )
  }
  const dir = filters.dir === 'asc' ? 1 : -1
  const key = filters.sort
  out = [...out].sort((a, b) => {
    if (key === 'amount') return ((a.amountUsd ?? -1) - (b.amountUsd ?? -1)) * dir
    if (key === 'funder') return a.funderName.localeCompare(b.funderName) * dir
    if (key === 'recipient') return a.recipientName.localeCompare(b.recipientName) * dir
    return (a.date ?? '').localeCompare(b.date ?? '') * dir
  })
  return out
}
