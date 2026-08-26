import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/db/database.types'
import aliasesFile from '@/data/aliases.json'
import { normalizeName, slugify } from './normalize'

type Db = SupabaseClient<Database>
type OrgType = Database['public']['Tables']['orgs']['Row']['org_type']

const ALIASES: Record<string, string> = (
  aliasesFile as never as { aliases: Record<string, string> }
).aliases

export type OrgRole = 'funder' | 'recipient'

// Aliases that only apply to one side of a grant; see aliases.json.
const BY_ROLE: Record<string, Record<string, string>> =
  (aliasesFile as never as { byRole?: Record<string, Record<string, string>> }).byRole ?? {}

// Exact-match resolution over normalized names + the checked-in alias
// crosswalk. Unknown names auto-create a needs_review org so no data is
// dropped; curation happens later via report-unmatched + data/aliases.json.
export class OrgResolver {
  private idByNormalized = new Map<string, string>()
  private idBySlug = new Map<string, string>()
  private slugByAlias = new Map<string, string>()
  private slugByRoleAlias = new Map<string, string>()
  createdNames: string[] = []

  private constructor(private db: Db) {}

  static async load(db: Db): Promise<OrgResolver> {
    const resolver = new OrgResolver(db)
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from('orgs')
        .select('id, slug')
        .range(from, from + 999)
        .throwOnError()
      for (const org of data ?? []) resolver.idBySlug.set(org.slug, org.id)
      if (!data || data.length < 1000) break
    }
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from('org_names')
        .select('normalized, org_id')
        .range(from, from + 999)
        .throwOnError()
      for (const row of data ?? []) resolver.idByNormalized.set(row.normalized, row.org_id)
      if (!data || data.length < 1000) break
    }
    for (const [alias, slug] of Object.entries(ALIASES)) {
      resolver.slugByAlias.set(normalizeName(alias), slug)
    }
    for (const [role, map] of Object.entries(BY_ROLE)) {
      for (const [alias, slug] of Object.entries(map)) {
        resolver.slugByRoleAlias.set(`${role}:${normalizeName(alias)}`, slug)
      }
    }
    return resolver
  }

  async resolve(name: string, orgType: OrgType = 'organization', role?: OrgRole): Promise<string> {
    // Names that normalize to nothing ("-", " ") fall back to the stable
    // hash slug so they can still round-trip; curation renames them later.
    const normalized = normalizeName(name) || slugify(name)

    // A side-specific alias wins over the general one: it's the more
    // specific statement about what this name means here.
    const roleSlug = role ? this.slugByRoleAlias.get(`${role}:${normalized}`) : undefined
    if (roleSlug) {
      const id = this.idBySlug.get(roleSlug)
      if (!id) throw new Error(`aliases.json maps ${role} "${name}" to unknown slug "${roleSlug}"`)
      return id
    }
    const aliasSlug = this.slugByAlias.get(normalized)
    if (aliasSlug) {
      const id = this.idBySlug.get(aliasSlug)
      if (!id) throw new Error(`aliases.json maps "${name}" to unknown slug "${aliasSlug}"`)
      return id
    }
    const known = this.idByNormalized.get(normalized)
    if (known) return known

    let slug = slugify(name)
    for (let n = 2; this.idBySlug.has(slug); n++) slug = `${slugify(name)}-${n}`

    const { data: org } = await this.db
      .from('orgs')
      .insert({ slug, name: name.trim(), org_type: orgType, needs_review: true })
      .select('id')
      .single()
      .throwOnError()
    await this.db
      .from('org_names')
      .insert({ org_id: org!.id, name: name.trim(), normalized, kind: 'canonical' })
      .throwOnError()

    this.idBySlug.set(slug, org!.id)
    this.idByNormalized.set(normalized, org!.id)
    this.createdNames.push(name.trim())
    return org!.id
  }
}
