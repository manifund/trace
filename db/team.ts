import 'server-only'

import { dbConfigured } from './grant'
import { createPublicSupabaseClient } from './supabase-server'

export type OrgPerson = {
  name: string
  title: string | null
  leadership: boolean
  slug: string | null
}
export type OrgTeam = {
  headcount: number | null
  headcountNote: string | null
  sourceUrl: string | null
  checkedAt: string
  people: OrgPerson[]
}

export async function getTeamForOrg(orgId: string): Promise<OrgTeam | null> {
  if (!dbConfigured()) return null
  const supabase = createPublicSupabaseClient()
  const [{ data: team }, { data: people }] = await Promise.all([
    supabase
      .from('org_teams')
      .select('headcount, headcount_note, source_url, checked_at')
      .eq('org_id', orgId)
      .maybeSingle()
      .throwOnError(),
    supabase
      .from('org_people')
      .select(
        'name, title, leadership, sort_order, person:orgs!org_people_person_org_id_fkey(slug)'
      )
      .eq('org_id', orgId)
      .order('sort_order')
      .throwOnError(),
  ])
  if (!team) return null
  return {
    headcount: team.headcount,
    headcountNote: team.headcount_note,
    sourceUrl: team.source_url,
    checkedAt: team.checked_at,
    people: (people ?? []).map((row) => ({
      name: row.name,
      title: row.title,
      leadership: row.leadership,
      slug: (row.person as never as { slug: string } | null)?.slug ?? null,
    })),
  }
}

export type PersonRole = { title: string | null; orgName: string; orgSlug: string }

// Where a person works, read off the team lists of the orgs that name them.
export async function getRolesForPerson(orgId: string): Promise<PersonRole[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const { data } = await supabase
    .from('org_people')
    .select('title, leadership, org:orgs!org_people_org_id_fkey(name, slug)')
    .eq('person_org_id', orgId)
    .order('leadership', { ascending: false })
    .throwOnError()
  return (data ?? []).map((row) => {
    const org = row.org as never as { name: string; slug: string }
    return { title: row.title, orgName: org.name, orgSlug: org.slug }
  })
}
