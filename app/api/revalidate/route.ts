import { revalidatePath } from 'next/cache'
import { invalidateSnapshot } from '@/db/snapshot'

// Ingest scripts call this after writing so the site picks up new grants
// before the cache window lapses. `POST /api/revalidate` with
// `Authorization: Bearer $REVALIDATE_SECRET`.
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  invalidateSnapshot()
  revalidatePath('/', 'layout')
  return Response.json({ revalidated: true })
}
