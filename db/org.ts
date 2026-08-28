import 'server-only'

import { dbConfigured, getGrants } from './grant'
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

// Slugs of the orgs with the most grants, for prebuilding their pages:
// these are the ones people actually click.
export async function listBusiestOrgSlugs(limit = 150): Promise<string[]> {
  const counts = new Map<string, number>()
  for (const grant of await getGrants()) {
    for (const slug of [grant.funderSlug, grant.recipientSlug]) {
      if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([slug]) => slug)
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
