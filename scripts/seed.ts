// Seeds cause areas, the source registry, and the curated org registry.
// Idempotent: re-run after editing data/orgs-seed.json or data/aliases.json.
// When an alias now points at a canonical org but ingestion already
// auto-created a provisional (needs_review) org under that name, the
// provisional org's grants are repointed and the org is deleted.
import aliasesFile from '@/data/aliases.json'
import orgsSeed from '@/data/orgs-seed.json'
import reviewedFile from '@/data/reviewed-orgs.json'
import { createAdminClient } from '@/db/supabase-admin'
import { CAUSE_TREE } from '@/utils/cause-tree'
import { normalizeName } from './lib/normalize'

const db = createAdminClient()

// Cause areas come from the canonical tree; parent links are wired in a
// second pass once every row exists.
async function seedCauseAreas() {
  await db
    .from('cause_areas')
    .upsert(
      CAUSE_TREE.map((node) => ({ slug: node.slug, name: node.name })),
      { onConflict: 'slug' }
    )
    .throwOnError()
  const { data } = await db.from('cause_areas').select('id, slug').throwOnError()
  const idBySlug = new Map((data ?? []).map((row) => [row.slug, row.id]))
  for (const node of CAUSE_TREE) {
    if (!node.parent) continue
    await db
      .from('cause_areas')
      .update({ parent_id: idBySlug.get(node.parent) ?? null })
      .eq('slug', node.slug)
      .throwOnError()
  }
}

const SOURCES = [
  {
    id: 'ea_funds',
    name: 'EA Funds',
    url: 'https://funds.effectivealtruism.org/grants',
    license: 'unstated',
    tier: 1,
  },
  {
    id: 'sff',
    name: 'Survival and Flourishing Fund',
    url: 'https://survivalandflourishing.fund/recommendations',
    license: 'unstated',
    tier: 1,
  },
  { id: 'manifund', name: 'Manifund', url: 'https://manifund.org/', license: 'unstated', tier: 1 },
  {
    id: 'vipul_donations',
    name: 'Donations List Website',
    url: 'https://github.com/vipulnaik/donations',
    license: 'CC0-1.0',
    tier: 1,
  },
  {
    id: 'coefficient_giving',
    name: 'Coefficient Giving',
    url: 'https://coefficientgiving.org/grants/',
    tier: 2,
  },
  { id: 'acx_grants', name: 'ACX Grants', url: 'https://www.astralcodexten.com/', tier: 2 },
  { id: 'fli', name: 'Future of Life Institute', url: 'https://futureoflife.org/', tier: 2 },
  {
    id: 'lightcone_commons',
    name: 'Lightcone Commons',
    url: 'https://www.lightconecommons.com/',
    tier: 2,
  },
  { id: 'foresight', name: 'Foresight Institute', url: 'https://foresight.org/', tier: 2 },
  {
    id: 'schmidt_sciences',
    name: 'Schmidt Sciences',
    url: 'https://www.schmidtsciences.org/',
    tier: 2,
  },
  { id: 'longview', name: 'Longview Philanthropy', url: 'https://www.longview.org/', tier: 2 },
  { id: 'jefftk', name: 'Jeff Kaufman', url: 'https://www.jefftk.com/donations', tier: 3 },
  {
    id: 'org_reported',
    name: 'Recipient disclosures',
    url: null,
    tier: 3,
  },
  {
    id: 'fund_estimates',
    name: 'Aggregate fund estimates',
    url: null,
    tier: 3,
  },
  {
    id: 'community',
    name: 'Community suggestions',
    url: null,
    tier: 3,
  },
  {
    id: 'fli_990',
    name: 'FLI Form 990',
    url: 'https://projects.propublica.org/nonprofits/organizations/471052538',
    tier: 2,
  },
  {
    id: 'lightcone_990',
    name: 'Lightcone Foundation Form 990',
    url: 'https://projects.propublica.org/nonprofits/organizations/920636259',
    tier: 2,
  },
  {
    id: 'macroscopic',
    name: 'Macroscopic Ventures grants page',
    url: 'https://macroscopic.org/grants',
    tier: 3,
  },
  {
    id: 'jaan_online',
    name: 'Jaan Tallinn donations',
    url: 'https://jaan.online/philanthropy/donations.html',
    tier: 2,
  },
  {
    id: 'ftx_future_fund',
    name: 'FTX Future Fund (archived site)',
    url: 'https://ftxfuturefund.org.cach3.com/index.html%3Fp=758.html',
    license: 'unstated',
    tier: 2,
  },
  {
    id: 'irs_990',
    name: 'IRS Form 990 filings',
    url: 'https://projects.propublica.org/nonprofits/',
    license: 'public record',
    tier: 2,
  },
  { id: 'uk_aisi', name: 'UK AISI', url: 'https://www.aisi.gov.uk/', tier: 3 },
  {
    id: 'grantmaking_ai',
    name: 'grantmaking.ai',
    url: 'https://grantmaking.ai/',
    license: 'CC BY-SA',
    tier: 3,
  },
  {
    id: 'openai_foundation',
    name: 'OpenAI Foundation',
    url: 'https://openaifoundation.org/',
    tier: 2,
  },
  {
    id: 'bluedot',
    name: 'BlueDot Impact grants',
    url: 'https://bluedot.org/grants',
    tier: 2,
  },
]

type SeedOrg = {
  slug: string
  name: string
  org_type: 'organization' | 'fund' | 'foundation' | 'individual' | 'government' | 'project'
  website?: string
  aliases: { name: string; kind?: string; valid_from?: string; valid_to?: string; note?: string }[]
}

async function mergeOrg(fromId: string, toId: string, name: string, why = 'provisional') {
  await db.from('grants').update({ funder_org_id: toId }).eq('funder_org_id', fromId).throwOnError()
  await db
    .from('grants')
    .update({ recipient_org_id: toId })
    .eq('recipient_org_id', fromId)
    .throwOnError()
  await db
    .from('grants')
    .update({ fiscal_sponsor_org_id: toId })
    .eq('fiscal_sponsor_org_id', fromId)
    .throwOnError()
  // grant_vias references orgs without a cascade, so the loser has to be off
  // that table before it can be deleted. Its primary key is
  // (grant_id, via_org_id): a grant already routed through the winner would
  // collide, so drop that row instead of moving it.
  const { data: vias } = await db
    .from('grant_vias')
    .select('grant_id')
    .eq('via_org_id', fromId)
    .throwOnError()
  if ((vias ?? []).length > 0) {
    const { data: existing } = await db
      .from('grant_vias')
      .select('grant_id')
      .eq('via_org_id', toId)
      .throwOnError()
    const alreadyRouted = new Set((existing ?? []).map((row) => row.grant_id))
    for (const row of vias ?? []) {
      if (alreadyRouted.has(row.grant_id)) {
        await db
          .from('grant_vias')
          .delete()
          .eq('grant_id', row.grant_id)
          .eq('via_org_id', fromId)
          .throwOnError()
      } else {
        await db
          .from('grant_vias')
          .update({ via_org_id: toId })
          .eq('grant_id', row.grant_id)
          .eq('via_org_id', fromId)
          .throwOnError()
      }
    }
  }
  const { data: names } = await db
    .from('org_names')
    .select('name, normalized')
    .eq('org_id', fromId)
    .throwOnError()
  for (const row of names ?? []) {
    await db
      .from('org_names')
      .upsert(
        { org_id: toId, name: row.name, normalized: row.normalized, kind: 'alias' },
        { onConflict: 'org_id,normalized', ignoreDuplicates: true }
      )
      .throwOnError()
  }
  await db.from('org_names').delete().eq('org_id', fromId).throwOnError()
  await db.from('orgs').delete().eq('id', fromId).throwOnError()
  console.log(`Merged ${why} org "${name}" into ${toId}`)
}

// Steady-state seed runs re-claim hundreds of names that are already settled;
// prefetch the crosswalk once so those claims are free instead of two
// round-trips each.
// normalized -> "org_id|kind". Kind is part of the key so that renaming a
// seeded org demotes its old name to former_name instead of leaving two rows
// both claiming to be canonical.
const settledNames = new Map<string, string>()
const settled = (orgId: string, kind: string) => `${orgId}|${kind}`
async function loadSettledNames() {
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('org_names')
      .select('normalized, org_id, kind')
      .range(from, from + 999)
      .throwOnError()
    for (const row of data ?? []) {
      settledNames.set(row.normalized, settled(row.org_id, row.kind))
    }
    if (!data || data.length < 1000) break
  }
}

// Point `normalized` at org `toId`; merge away a provisional org holding it.
async function claimName(
  normalized: string,
  displayName: string,
  toId: string,
  kind: string,
  extra: { valid_from?: string; valid_to?: string; note?: string } = {}
) {
  if (settledNames.get(normalized) === settled(toId, kind)) return
  const { data } = await db
    .from('org_names')
    .select('org_id, orgs!inner(needs_review, name)')
    .eq('normalized', normalized)
    .neq('org_id', toId)
    .maybeSingle()
    .throwOnError()
  const holder = data as never as {
    org_id: string
    orgs: { needs_review: boolean; name: string }
  } | null
  if (holder) {
    const org = holder.orgs
    if (org.needs_review) {
      await mergeOrg(holder.org_id, toId, org.name)
    } else {
      console.warn(
        `CONFLICT: "${displayName}" already belongs to curated org "${org.name}" — resolve by hand`
      )
      return
    }
  }
  await db
    .from('org_names')
    .upsert(
      {
        org_id: toId,
        name: displayName,
        normalized,
        kind: kind as never,
        valid_from: extra.valid_from ?? null,
        valid_to: extra.valid_to ?? null,
        note: extra.note ?? null,
      },
      { onConflict: 'org_id,normalized' }
    )
    .throwOnError()
  settledNames.set(normalized, settled(toId, kind))
}

async function main() {
  await seedCauseAreas()
  await db.from('sources').upsert(SOURCES, { onConflict: 'id' }).throwOnError()
  // aliases.json merges: two curated orgs that turned out to be one body.
  // An alias cannot do this — claimName refuses to merge an org a human has
  // already reviewed, which is the right default and the wrong answer once
  // someone has looked and decided. Stated here, it is deliberate and it
  // replays on a rebuild. The loser's names survive as aliases of the winner,
  // so source data using the old spelling still resolves.
  //
  // Runs before the seed pass and before the crosswalk prefetch. A rename that
  // both folds a duplicate and renames the survivor would otherwise try to
  // claim names the doomed row still holds, warn CONFLICT, and need a second
  // run to settle; merging first leaves nothing to collide with, and
  // loadSettledNames() then caches the post-merge truth.
  const merges = (aliasesFile as never as { merges?: Record<string, string> }).merges ?? {}
  for (const [loserSlug, winnerSlug] of Object.entries(merges)) {
    const { data: pair } = await db
      .from('orgs')
      .select('id, slug, name')
      .in('slug', [loserSlug, winnerSlug])
      .throwOnError()
    const loser = (pair ?? []).find((org) => org.slug === loserSlug)
    const winner = (pair ?? []).find((org) => org.slug === winnerSlug)
    if (!winner) {
      console.warn(`aliases.json merges: unknown target "${winnerSlug}"`)
      continue
    }
    // Already merged on an earlier run.
    if (!loser) continue
    await mergeOrg(loser.id, winner.id, loser.name, 'curated')
  }

  await loadSettledNames()

  const orgs = (orgsSeed as never as { orgs: SeedOrg[] }).orgs
  for (const seed of orgs) {
    const { data: existing } = await db
      .from('orgs')
      .select('id')
      .eq('slug', seed.slug)
      .maybeSingle()
      .throwOnError()
    let orgId: string
    if (existing) {
      orgId = existing.id
      await db
        .from('orgs')
        .update({
          name: seed.name,
          org_type: seed.org_type,
          website: seed.website ?? null,
          needs_review: false,
        })
        .eq('id', orgId)
        .throwOnError()
    } else {
      const { data: created } = await db
        .from('orgs')
        .insert({
          slug: seed.slug,
          name: seed.name,
          org_type: seed.org_type,
          website: seed.website ?? null,
        })
        .select('id')
        .single()
        .throwOnError()
      orgId = created!.id
    }
    await claimName(normalizeName(seed.name), seed.name, orgId, 'canonical')
    for (const alias of seed.aliases) {
      await claimName(normalizeName(alias.name), alias.name, orgId, alias.kind ?? 'alias', alias)
    }
  }

  // aliases.json: raw source-data names -> canonical slugs.
  const aliases = (aliasesFile as never as { aliases: Record<string, string> }).aliases
  for (const [raw, slug] of Object.entries(aliases)) {
    const { data: target } = await db
      .from('orgs')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
      .throwOnError()
    if (!target) {
      console.warn(`aliases.json: unknown slug "${slug}" for "${raw}"`)
      continue
    }
    await claimName(normalizeName(raw), raw, target.id, 'alias')
  }

  // aliases.json byRole: side-specific folds. The resolver applies these to
  // anything ingested from now on, but rows already in the table were matched
  // under the old rule and are repointed here. Idempotent — after the first
  // run there is nothing left on that side to move.
  const byRole = (aliasesFile as never as { byRole?: Record<string, Record<string, string>> })
    .byRole
  for (const [role, map] of Object.entries(byRole ?? {})) {
    const column = role === 'funder' ? 'funder_org_id' : 'recipient_org_id'
    for (const [raw, slug] of Object.entries(map)) {
      const { data: target } = await db
        .from('orgs')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
        .throwOnError()
      if (!target) {
        console.warn(`aliases.json byRole: unknown slug "${slug}" for "${raw}"`)
        continue
      }
      const { data: holder } = await db
        .from('org_names')
        .select('org_id')
        .eq('normalized', normalizeName(raw))
        .maybeSingle()
        .throwOnError()
      if (!holder || holder.org_id === target.id) continue
      const { count } = await db
        .from('grants')
        .select('id', { count: 'exact', head: true })
        .eq(column, holder.org_id)
        .throwOnError()
      if (!count) continue
      await db
        .from('grants')
        .update(role === 'funder' ? { funder_org_id: target.id } : { recipient_org_id: target.id })
        .eq(column, holder.org_id)
        .throwOnError()
      console.log(`Folded ${count} grants: "${raw}" as ${role} -> ${slug}`)
    }
  }

  // reviewed-orgs.json: auto-created orgs a human has confirmed as distinct
  // and correctly named; clears the needs_review flag without seeding them.
  const reviewed = (reviewedFile as never as { slugs: string[] }).slugs
  for (let from = 0; from < reviewed.length; from += 200) {
    await db
      .from('orgs')
      .update({ needs_review: false })
      .in('slug', reviewed.slice(from, from + 200))
      .throwOnError()
  }

  console.log(
    `Seeded ${CAUSE_TREE.length} cause areas, ${SOURCES.length} sources, ${orgs.length} orgs`
  )
}

await main()
