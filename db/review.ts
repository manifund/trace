import 'server-only'

import { dbConfigured } from './grant'
import { createPublicSupabaseClient } from './supabase-server'

export type OrgReview = {
  id: string
  reviewer: string
  reviewerUrl: string | null
  sourceUrl: string | null
  reviewedAt: string
  body: string
}

export async function getReviewsForOrg(orgId: string): Promise<OrgReview[]> {
  if (!dbConfigured()) return []
  const supabase = createPublicSupabaseClient()
  const { data } = await supabase
    .from('org_reviews')
    .select('id, reviewer, reviewer_url, source_url, reviewed_at, body')
    .eq('org_id', orgId)
    .order('reviewed_at', { ascending: false })
    .throwOnError()
  return (data ?? []).map((row) => ({
    id: row.id,
    reviewer: row.reviewer,
    reviewerUrl: row.reviewer_url,
    sourceUrl: row.source_url,
    reviewedAt: row.reviewed_at,
    body: row.body,
  }))
}
