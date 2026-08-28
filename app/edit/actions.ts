'use server'

// Admin review actions. These run with the service-role key, so every one of
// them re-checks that the caller is an admin — never trust the client.
//
// Accepting writes the change into the database immediately so the site
// reflects it, and `bun run export-suggestions` mirrors accepted suggestions
// into the checked-in data files so a rebuild reproduces them.
import { revalidatePath } from 'next/cache'
import type { Database } from '@/db/database.types'
import { invalidateSnapshot } from '@/db/snapshot'
import { createAdminClient } from '@/db/supabase-admin'
import { getUser, isAdminEmail } from '@/db/supabase-auth'
import { OrgResolver } from '@/scripts/lib/resolve-org'
import { withAncestors } from '@/scripts/lib/causes'
import { sha256 } from '@/scripts/lib/normalize'

type Payload = Record<string, string>

async function requireAdmin() {
  const user = await getUser()
  if (!isAdminEmail(user?.email)) throw new Error('Not authorized')
  return user!
}

const splitList = (raw: string) =>
  raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

// Replace a grant's vias with the suggested ones. Suggesters give names, so
// each is resolved the same way ingestion resolves them.
async function applyVias(
  db: ReturnType<typeof createAdminClient>,
  grantId: string,
  names: string[]
) {
  const resolver = await OrgResolver.load(db)
  await db.from('grant_vias').delete().eq('grant_id', grantId).throwOnError()
  for (const name of names) {
    const orgId = await resolver.resolve(name, 'fund')
    await db
      .from('grant_vias')
      .upsert({ grant_id: grantId, via_org_id: orgId }, { ignoreDuplicates: true })
      .throwOnError()
  }
}

// Cause tags are stored with every ancestor, so filtering on any level of the
// tree works — the same rule ingestion follows.
async function applyCauses(
  db: ReturnType<typeof createAdminClient>,
  grantId: string,
  slugs: string[]
) {
  const { data: areas } = await db.from('cause_areas').select('id, slug').throwOnError()
  const idBySlug = new Map((areas ?? []).map((area) => [area.slug, area.id]))
  const ids = withAncestors(slugs)
    .map((slug) => idBySlug.get(slug))
    .filter((id): id is string => Boolean(id))
  await db.from('grant_cause_areas').delete().eq('grant_id', grantId).throwOnError()
  if (ids.length > 0) {
    await db
      .from('grant_cause_areas')
      .insert(ids.map((causeAreaId) => ({ grant_id: grantId, cause_area_id: causeAreaId })))
      .throwOnError()
  }
}

function parseDate(raw: string): { date: string; precision: 'day' | 'month' | 'year' } | null {
  const value = raw.trim()
  if (/^\d{4}$/.test(value)) return { date: `${value}-01-01`, precision: 'year' }
  if (/^\d{4}-\d{2}$/.test(value)) return { date: `${value}-01`, precision: 'month' }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, precision: 'day' }
  return null
}

export async function acceptSuggestion(id: string, note: string) {
  const admin = await requireAdmin()
  const db = createAdminClient()
  const { data: suggestion } = await db
    .from('suggestions')
    .select('*')
    .eq('id', id)
    .single()
    .throwOnError()
  if (suggestion.status !== 'pending') throw new Error('Already reviewed')
  const payload = (suggestion.payload ?? {}) as Payload

  if (suggestion.kind === 'edit') {
    if (!suggestion.grant_id) throw new Error('Edit without a grant')
    type GrantPatch = Database['public']['Tables']['grants']['Update']
    const patch: GrantPatch = {}
    if (payload.description !== undefined) patch.description = payload.description
    if (payload.url !== undefined) patch.url = payload.url
    if (payload.amount_usd !== undefined) {
      const amount = Number(payload.amount_usd.replace(/[$,\s]/g, ''))
      if (Number.isFinite(amount)) {
        patch.amount_usd = amount
        patch.amount = amount
        patch.currency = 'USD'
      }
    }
    if (payload.grant_date !== undefined) {
      const parsed = parseDate(payload.grant_date)
      if (parsed) {
        patch.grant_date = parsed.date
        patch.date_precision = parsed.precision
      }
    }
    const resolver = await OrgResolver.load(db)
    if (payload.funder_name)
      patch.funder_org_id = await resolver.resolve(payload.funder_name, 'organization')
    if (payload.recipient_name)
      patch.recipient_org_id = await resolver.resolve(payload.recipient_name, 'organization')
    if (Object.keys(patch).length > 0)
      await db.from('grants').update(patch).eq('id', suggestion.grant_id).throwOnError()
    if (payload.via_names !== undefined)
      await applyVias(db, suggestion.grant_id, splitList(payload.via_names))
    if (payload.causes !== undefined)
      await applyCauses(db, suggestion.grant_id, splitList(payload.causes))
  } else {
    const resolver = await OrgResolver.load(db)
    const funderId = await resolver.resolve(payload.funder_name, 'organization')
    const recipientId = await resolver.resolve(payload.recipient_name, 'organization')
    const parsed = payload.grant_date ? parseDate(payload.grant_date) : null
    const amount = payload.amount_usd
      ? Number(payload.amount_usd.replace(/[$,\s]/g, ''))
      : Number.NaN
    const key = await sha256(`suggestion:${suggestion.id}`)
    const now = new Date().toISOString()
    const { data: record } = await db
      .from('source_records')
      .upsert(
        {
          source_id: 'community',
          source_record_key: key,
          raw: { ...payload, suggestion_id: suggestion.id, suggested_by: suggestion.user_email },
          content_hash: key,
          first_seen_at: now,
          last_seen_at: now,
        },
        { onConflict: 'source_id,source_record_key' }
      )
      .select('id')
      .single()
      .throwOnError()
    const { data: grant } = await db
      .from('grants')
      .insert({
        funder_org_id: funderId,
        recipient_org_id: recipientId,
        amount: Number.isFinite(amount) ? amount : null,
        amount_usd: Number.isFinite(amount) ? amount : null,
        currency: Number.isFinite(amount) ? 'USD' : 'USD',
        grant_date: parsed?.date ?? null,
        date_precision: parsed?.precision ?? null,
        description: payload.description ?? null,
        url: payload.url ?? suggestion.source_url ?? null,
        status: 'approved',
      })
      .select('id')
      .single()
      .throwOnError()
    await db
      .from('grant_sources')
      .insert({ grant_id: grant.id, source_record_id: record.id, is_primary: true })
      .throwOnError()
    if (payload.via_names) await applyVias(db, grant.id, splitList(payload.via_names))
    if (payload.causes) await applyCauses(db, grant.id, splitList(payload.causes))
  }

  await db
    .from('suggestions')
    .update({
      status: 'accepted',
      reviewed_at: new Date().toISOString(),
      reviewer: admin.email,
      review_note: note.trim() || null,
      applied_at: new Date().toISOString(),
    })
    .eq('id', id)
    .throwOnError()
  invalidateSnapshot()
  revalidatePath('/edit')
  revalidatePath('/', 'layout')
}

export async function rejectSuggestion(id: string, note: string) {
  const admin = await requireAdmin()
  const db = createAdminClient()
  await db
    .from('suggestions')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewer: admin.email,
      review_note: note.trim() || null,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .throwOnError()
  revalidatePath('/edit')
}
