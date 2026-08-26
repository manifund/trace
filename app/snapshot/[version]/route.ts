import { getSnapshotBytes } from '@/db/snapshot'

// The whole dataset, keyed by content version so browsers and the CDN cache
// it forever; a new build is a new URL. The bytes are pre-compressed brotli,
// served as-is to any client that accepts it (every browser does).
export async function GET(request: Request, ctx: { params: Promise<{ version: string }> }) {
  const { version } = await ctx.params
  const bytes = await getSnapshotBytes()
  if (!bytes) return new Response('{}', { headers: { 'content-type': 'application/json' } })
  // A page rendered before a rebuild may ask for an older version; serve the
  // current one but don't let it get pinned under the stale URL.
  const current = version === bytes.version
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'x-snapshot-version': bytes.version,
    'cache-control': current ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
  }
  if (request.headers.get('accept-encoding')?.includes('br')) {
    headers['content-encoding'] = 'br'
    return new Response(new Uint8Array(bytes.br), { headers })
  }
  const { brotliDecompressSync } = await import('node:zlib')
  return new Response(new Uint8Array(brotliDecompressSync(bytes.br)), { headers })
}
