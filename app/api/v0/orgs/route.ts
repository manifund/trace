import { NextResponse } from 'next/server'
import { CORS_HEADERS } from '@/db/api'
import { USE_SNAPSHOT } from '@/db/flags'
import { dbConfigured } from '@/db/grant'
import { getSnapshot } from '@/db/snapshot'
import { createPublicSupabaseClient } from '@/db/supabase-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (!dbConfigured()) return NextResponse.json({ total: 0, orgs: [] }, { headers: CORS_HEADERS })
  const q = searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 1000)
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)
  if (USE_SNAPSHOT) {
    const needle = q.toLowerCase()
    const orgs = (await getSnapshot()).orgs
      .filter(([, name]) => !needle || name.toLowerCase().includes(needle))
      .map(([slug, name, org_type, website]) => ({ slug, name, org_type, website }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json(
      { total: orgs.length, limit, offset, orgs: orgs.slice(offset, offset + limit) },
      { headers: CORS_HEADERS }
    )
  }
  const supabase = createPublicSupabaseClient()
  let query = supabase
    .from('orgs')
    .select('slug, name, org_type, website', { count: 'exact' })
    .order('name')
    .range(offset, offset + limit - 1)
  if (q) query = query.ilike('name', `%${q.replace(/[%_\\]/g, '\\$&')}%`)
  const { data, count } = await query.throwOnError()
  return NextResponse.json(
    { total: count ?? 0, limit, offset, orgs: data ?? [] },
    { headers: CORS_HEADERS }
  )
}

export function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS })
}
