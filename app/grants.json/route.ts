import { getGrants } from '@/db/grant'

// The whole dataset for the browser, fetched once per session by useGrants().
// The URL carries the content version, so browser and CDN keep it forever
// and a new dataset is simply a new URL.
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(await getGrants(), {
    headers: { 'cache-control': 'public, max-age=31536000, immutable' },
  })
}
