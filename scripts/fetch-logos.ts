// Fetches a logo for every org that has a website: the site's largest icon
// (apple-touch-icon, then <link rel=icon>, then /apple-touch-icon.png), with
// Google's favicon service as the fallback and /favicon.ico last, resized to
// at most 128px and saved as public/logos/<slug>.png. data/org-logos.json
// lists the slugs that got one; files for orgs that no longer have a website
// are removed. Orgs that already have a file are skipped.
//
//   bun run fetch-logos [--refresh] [--only slug,slug]
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { load } from 'cheerio'
import sharp from 'sharp'
import { createAdminClient } from '@/db/supabase-admin'

const DIR = 'public/logos'
const MAX_PX = 128
const MIN_PX = 32
const USER_AGENT = 'Mozilla/5.0 (compatible; trace-curation/1.0; +https://trace.manifund.org)'

const args = process.argv.slice(2)
const refresh = args.includes('--refresh')
const onlyIndex = args.indexOf('--only')
const only = onlyIndex >= 0 ? new Set(args[onlyIndex + 1]?.split(',') ?? []) : null

async function get(url: string, accept: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    })
    return res.ok ? res : null
  } catch {
    return null
  }
}

function unique(urls: string[]): string[] {
  return Array.from(new Set(urls))
}

// Icon URLs declared by the page, best first.
function declaredIcons(html: string, base: string): string[] {
  const $ = load(html)
  const touch: { href: string; size: number }[] = []
  const icons: { href: string; size: number; svg: boolean }[] = []
  $('link[rel][href]').each((_, el) => {
    const rel = ($(el).attr('rel') ?? '').toLowerCase().split(/\s+/)
    const href = $(el).attr('href') ?? ''
    let abs: string
    try {
      abs = new URL(href, base).href
    } catch {
      return
    }
    const sizes = ($(el).attr('sizes') ?? '').toLowerCase()
    const size = sizes === 'any' ? 1024 : Number(sizes.match(/(\d+)x/)?.[1] ?? 0)
    const type = ($(el).attr('type') ?? '').toLowerCase()
    const svg = type.includes('svg') || /\.svg(\?|$)/i.test(abs)
    if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) {
      touch.push({ href: abs, size: size || 180 })
    } else if (rel.includes('icon')) {
      icons.push({ href: abs, size, svg })
    }
  })
  touch.sort((a, b) => b.size - a.size)
  icons.sort((a, b) => Number(b.svg) - Number(a.svg) || b.size - a.size)
  return unique([...touch.map((t) => t.href), ...icons.map((i) => i.href)])
}

// Normalize to a PNG no larger than MAX_PX; null when sharp cannot read the
// bytes (ICO, BMP) or the raster is too small to be worth showing.
async function toPng(buffer: Buffer, contentType: string, url: string): Promise<Buffer | null> {
  const svg =
    contentType.includes('svg') ||
    /\.svg(\?|$)/i.test(url) ||
    buffer.subarray(0, 512).toString('utf8').includes('<svg')
  try {
    let image = sharp(buffer, { animated: false })
    const meta = await image.metadata()
    if (!meta.width || !meta.height) return null
    const longest = Math.max(meta.width, meta.height)
    if (svg) {
      // Rasterize at the output size rather than upscaling a 72dpi render.
      image = sharp(buffer, { density: Math.min(2400, Math.max(72, (72 * MAX_PX) / longest)) })
    } else if (longest < MIN_PX) {
      return null
    }
    const png = await image
      .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .png({ palette: true, compressionLevel: 9 })
      .toBuffer()
    // A placeholder: one flat color, or fully transparent.
    const { channels } = await sharp(png).stats()
    if (channels.every((channel) => channel.stdev < 2)) return null
    return png
  } catch {
    return null
  }
}

async function fetchLogo(website: string): Promise<Buffer | null> {
  let origin: string
  try {
    origin = new URL(website).origin
  } catch {
    return null
  }
  const page = await get(website, 'text/html')
  const base = page?.url ?? website
  const declared = page ? declaredIcons(await page.text(), base) : []
  const google = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(origin)}&size=${MAX_PX}`
  const candidates = unique([
    ...declared,
    `${new URL(base).origin}/apple-touch-icon.png`,
    google,
    `${new URL(base).origin}/favicon.ico`,
  ])
  for (const url of candidates) {
    const res = await get(url, 'image/*')
    if (!res) continue
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/') && !type.includes('svg') && url !== google) continue
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > 4_000_000) continue
    const png = await toPng(bytes, type, url)
    if (png) return png
  }
  return null
}

async function main() {
  const db = createAdminClient()
  const orgs: { slug: string; name: string; website: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('orgs')
      .select('slug, name, website')
      .not('website', 'is', null)
      .range(from, from + 999)
      .throwOnError()
    for (const org of data ?? []) orgs.push(org as (typeof orgs)[number])
    if (!data || data.length < 1000) break
  }
  mkdirSync(DIR, { recursive: true })

  const queue = orgs.filter((org) => !only || only.has(org.slug))
  const missing: string[] = []
  let fetched = 0
  let skipped = 0
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let org = queue.shift(); org; org = queue.shift()) {
        const file = `${DIR}/${org.slug}.png`
        if (existsSync(file) && !refresh) {
          skipped++
          continue
        }
        const png = await fetchLogo(org.website)
        if (png) {
          writeFileSync(file, png)
          fetched++
        } else if (!existsSync(file)) {
          missing.push(`${org.name} (${org.website})`)
        }
      }
    })
  )

  // Files are a function of which orgs have a website today.
  const current = new Set(orgs.map((org) => org.slug))
  let pruned = 0
  for (const file of readdirSync(DIR)) {
    if (!file.endsWith('.png')) continue
    if (!current.has(file.slice(0, -4)) && !only) {
      unlinkSync(`${DIR}/${file}`)
      pruned++
    }
  }
  const slugs = readdirSync(DIR)
    .filter((file) => file.endsWith('.png'))
    .map((file) => file.slice(0, -4))
    .sort()
  const comment =
    'Slugs with a logo in public/logos/. Written by `bun run fetch-logos`; do not edit by hand.'
  writeFileSync('data/org-logos.json', JSON.stringify({ _comment: comment, slugs }, null, 2) + '\n')

  if (missing.length > 0) {
    console.log(`No logo found for ${missing.length}:`)
    for (const line of missing.sort()) console.log(`  ${line}`)
  }
  console.log(
    `Fetched ${fetched}, skipped ${skipped} existing, pruned ${pruned}; ${slugs.length} logos in ${DIR}`
  )
}

await main()
