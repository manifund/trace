import { NextResponse } from 'next/server'
import { USE_SNAPSHOT } from '@/db/flags'
import { dbConfigured } from '@/db/grant'
import { getSnapshot } from '@/db/snapshot'
import { createPublicSupabaseClient } from '@/db/supabase-server'
import { expandNameIndex } from '@/utils/snapshot'

// Static (ISR) index of every org name and alias, fetched once by the header
// search so typeahead filtering happens entirely in the browser.
export const revalidate = 600

export async function GET() {
  if (!dbConfigured()) return NextResponse.json([])
  if (USE_SNAPSHOT) return NextResponse.json(expandNameIndex(await getSnapshot()))
  const supabase = createPublicSupabaseClient()
  const rows: [string, string, string][] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('org_names')
      .select('name, orgs!inner(slug, name)')
      .range(from, from + 999)
      .throwOnError()
    const page = (data ?? []) as never as { name: string; orgs: { slug: string; name: string } }[]
    for (const row of page) rows.push([row.name, row.orgs.slug, row.orgs.name])
    if (!data || data.length < 1000) break
  }
  return NextResponse.json(rows)
}
