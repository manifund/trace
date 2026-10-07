import 'server-only'

import { dbConfigured } from './grant'
import { createPublicSupabaseClient } from './supabase-server'

export type OrgReview = {
  id: string
  reviewer: string
  reviewerSlug: string | null
  reviewerUrl: string | null
  venue: string | null
  sourceUrl: string | null
  reviewedAt: string
  body: string
}

const REVIEW_SELECT =
  'id, reviewer, reviewer_url, venue, source_url, reviewed_at, body, author:orgs!org_reviews_reviewer_org_id_fkey(slug)'

type ReviewRow = {
  id: string
  reviewer: string
  reviewer_url: string | null
  venue: string | null
  source_url: string | null
  reviewed_at: string
  body: string
  author: { slug: string } | null
}

function mapReview(row: ReviewRow): OrgReview {
  return {
    id: row.id,
    reviewer: row.reviewer,
    reviewerSlug: row.author?.slug ?? null,
    reviewerUrl: row.reviewer_url,
    venue: row.venue,
    sourceUrl: row.source_url,
    reviewedAt: row.reviewed_at,
    body: row.body,
  }
}

export async function getReviewsForOrg(orgId: string): Promise<OrgReview[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const { data } = await supabase
    .from('org_reviews')
    .select(REVIEW_SELECT)
    .eq('org_id', orgId)
    .order('reviewed_at', { ascending: false })
    .throwOnError()
  return ((data ?? []) as never as ReviewRow[]).map(mapReview)
}

// What this org (a person, usually) has written about others.
export type WrittenReview = OrgReview & { orgSlug: string; orgName: string }

export async function getReviewsByOrg(orgId: string): Promise<WrittenReview[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const { data } = await supabase
    .from('org_reviews')
    .select(`${REVIEW_SELECT}, subject:orgs!org_reviews_org_id_fkey(slug, name)`)
    .eq('reviewer_org_id', orgId)
    .order('reviewed_at', { ascending: false })
    .throwOnError()
  return ((data ?? []) as never as (ReviewRow & { subject: { slug: string; name: string } })[]).map(
    (row) => ({ ...mapReview(row), orgSlug: row.subject.slug, orgName: row.subject.name })
  )
}
