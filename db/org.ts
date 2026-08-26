import 'server-only'

import { dbConfigured } from './grant'
import { createPublicSupabaseClient } from './supabase-server'

export type OrgDetail = {
  id: string
  slug: string
  name: string
  org_type: string
  website: string | null
  names: { name: string; kind: string; valid_from: string | null; valid_to: string | null }[]
}

export async function getOrgBySlug(slug: string): Promise<OrgDetail | null> {
  if (!dbConfigured()) return null
  const supabase = createPublicSupabaseClient()
  const { data } = await supabase
    .from('orgs')
    .select('id, slug, name, org_type, website, org_names(name, kind, valid_from, valid_to)')
    .eq('slug', slug)
    .maybeSingle()
    .throwOnError()
  if (!data) return null
  const org = data as never as Omit<OrgDetail, 'names'> & { org_names: OrgDetail['names'] }
  return { ...org, names: org.org_names }
}

export type OrgAggregate = {
  slug: string
  name: string
  grantCount: number
  totalUsd: number
  firstYear: number | null
  lastYear: number | null
}

export type AggregateFilters = {
  cause?: string
  yearMin?: number | null
  yearMax?: number | null
}

// Per-org totals over approved grants, from either side of the grant.
export async function listOrgAggregates(
  side: 'funder' | 'recipient',
  filters: AggregateFilters = {}
): Promise<OrgAggregate[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const fkey = side === 'funder' ? 'grants_funder_org_id_fkey' : 'grants_recipient_org_id_fkey'
  const causeFilter = filters.cause && filters.cause !== 'all' ? filters.cause : null
  const causeEmbed = causeFilter ? ', grant_cause_areas!inner(cause_areas!inner(slug))' : ''
  const byOrg = new Map<string, OrgAggregate>()
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from('grants')
      .select(`amount_usd, grant_date, org:orgs!${fkey}(slug, name)${causeEmbed}`)
      .eq('status', 'approved')
      .range(from, from + 999)
    if (causeFilter) query = query.eq('grant_cause_areas.cause_areas.slug', causeFilter)
    if (filters.yearMin) query = query.gte('grant_date', `${filters.yearMin}-01-01`)
    if (filters.yearMax) query = query.lte('grant_date', `${filters.yearMax}-12-31`)

    const { data } = await query.throwOnError()
    for (const grant of (data ?? []) as never as {
      amount_usd: number | null
      grant_date: string | null
      org: { slug: string; name: string } | null
    }[]) {
      if (!grant.org) continue
      const entry = byOrg.get(grant.org.slug) ?? {
        slug: grant.org.slug,
        name: grant.org.name,
        grantCount: 0,
        totalUsd: 0,
        firstYear: null,
        lastYear: null,
      }
      entry.grantCount++
      entry.totalUsd += grant.amount_usd ?? 0
      const year = grant.grant_date ? Number(grant.grant_date.slice(0, 4)) : null
      if (year !== null) {
        entry.firstYear = entry.firstYear === null ? year : Math.min(entry.firstYear, year)
        entry.lastYear = entry.lastYear === null ? year : Math.max(entry.lastYear, year)
      }
      byOrg.set(grant.org.slug, entry)
    }
    if (!data || data.length < 1000) break
  }
  return Array.from(byOrg.values()).sort((a, b) => b.totalUsd - a.totalUsd)
}

// Slugs of the orgs with the most grants, for prebuilding their pages: a
// cold render of a big funder costs seconds, and these are the ones people
// actually click.
export async function listBusiestOrgSlugs(limit = 150): Promise<string[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const counts = new Map<string, number>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('grants')
      .select('funder_org_id, recipient_org_id')
      .eq('status', 'approved')
      .range(from, from + 999)
      .throwOnError()
    for (const row of data ?? []) {
      for (const id of [row.funder_org_id, row.recipient_org_id]) {
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    if (!data || data.length < 1000) break
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
  if (top.length === 0) return []
  const { data: orgs } = await supabase.from('orgs').select('slug').in('id', top).throwOnError()
  return (orgs ?? []).map((org) => org.slug)
}

// Funds and foundations: the orgs that grant other people's money. A grant
// records the donor as funder and the vehicle it was granted through as a
// via, so this is how the flow chart tells a vehicle (SFF, Manifund) apart
// from a host institution (a university named as via by the de-umbrella
// pass).
export async function listVehicleSlugs(): Promise<string[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const slugs: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('orgs')
      .select('slug')
      .in('org_type', ['fund', 'foundation'])
      .range(from, from + 999)
      .throwOnError()
    slugs.push(...(data ?? []).map((org) => org.slug))
    if (!data || data.length < 1000) break
  }
  return slugs
}
