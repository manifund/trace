import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { queryGrants } from '@/db/api'
import { listGrantsByOrg, listGrantsByVia, type GrantRow } from '@/db/grant'
import { getOrgBySlug } from '@/db/org'
import { getSnapshot } from '@/db/snapshot'
import { expandNameIndex } from '@/utils/snapshot'
import { CAUSE_TREE } from '@/utils/cause-tree'

export const maxDuration = 60

const compact = (row: GrantRow) => ({
  date: row.date,
  funder: row.funderName,
  recipient: row.recipientName,
  vias: row.vias.map((via) => via.name),
  amount_usd: row.amountUsd,
  ...(row.amountEstimated ? { amount_estimated: true, estimate_note: row.estimateNote } : {}),
  causes: row.causes,
  purpose: row.description?.slice(0, 200) ?? null,
  source: row.sourceId,
  url: row.url,
})

const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }],
})

const totals = (rows: GrantRow[]) => ({
  grant_count: rows.length,
  total_usd: Math.round(rows.reduce((sum, row) => sum + (row.amountUsd ?? 0), 0)),
})

const handler = createMcpHandler((server) => {
  server.registerTool(
    'search_grants',
    {
      title: 'Search grants',
      description:
        'Search the grants database. Org filters accept a slug or partial name. cause is a slug from list_causes (default: all causes). Returns totals plus the top matching grants.',
      inputSchema: z.object({
        q: z.string().optional().describe('Free-text search over names and purposes'),
        cause: z.string().optional().describe("Cause slug, e.g. 'ai-safety' or 'interpretability'"),
        funder: z.string().optional(),
        recipient: z.string().optional(),
        via: z.string().optional().describe('Vehicle the money flowed through, e.g. Manifund, SFF'),
        year_min: z.number().int().optional(),
        year_max: z.number().int().optional(),
        sort: z.enum(['date', 'amount']).optional().describe('Default: date, newest first'),
        limit: z.number().int().min(1).max(100).optional().describe('Default 25'),
      }),
    },
    async (args) => {
      const rows = await queryGrants({
        cause: args.cause,
        q: args.q,
        funders: args.funder ? [args.funder] : [],
        recipients: args.recipient ? [args.recipient] : [],
        vias: args.via ? [args.via] : [],
        yearMin: args.year_min ?? null,
        yearMax: args.year_max ?? null,
        sort: args.sort ?? 'date',
        dir: 'desc',
      })
      return json({ ...totals(rows), grants: rows.slice(0, args.limit ?? 25).map(compact) })
    }
  )

  server.registerTool(
    'org_profile',
    {
      title: 'Organization profile',
      description:
        'Look up a funder or recipient by name and return its profile: totals for grants made, received, and routed via it, plus the largest grants on each side.',
      inputSchema: z.object({ name: z.string() }),
    },
    async ({ name }) => {
      const needle = name.toLowerCase()
      const slug = expandNameIndex(await getSnapshot()).find(([alias]) =>
        alias.toLowerCase().includes(needle)
      )?.[1]
      if (!slug) return json({ error: `No organization matching "${name}"` })
      const org = await getOrgBySlug(slug)
      if (!org) return json({ error: `No organization matching "${name}"` })
      const [made, received, via] = await Promise.all([
        listGrantsByOrg('funder_org_id', org),
        listGrantsByOrg('recipient_org_id', org),
        listGrantsByVia(org),
      ])
      const viaOnly = via.filter((g) => g.funderSlug !== org.slug)
      const top = (rows: GrantRow[]) =>
        [...rows]
          .sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))
          .slice(0, 10)
          .map(compact)
      return json({
        slug: org.slug,
        name: org.name,
        type: org.org_type,
        website: org.website,
        other_names: org.names.filter((n) => n.kind !== 'canonical').map((n) => n.name),
        made: { ...totals(made), top: top(made) },
        received: { ...totals(received), top: top(received) },
        via: { ...totals(viaOnly), top: top(viaOnly) },
      })
    }
  )

  server.registerTool(
    'list_causes',
    {
      title: 'List causes',
      description: 'The cause-area taxonomy (slug, name, parent). Slugs feed search_grants.',
      inputSchema: z.object({}),
    },
    async () =>
      json(CAUSE_TREE.map((n) => ({ slug: n.slug, name: n.name, parent: n.parent ?? null })))
  )

  server.registerTool(
    'funding_by_year',
    {
      title: 'Funding by year',
      description:
        'Yearly grant counts and dollar totals, optionally filtered by cause, funder, or recipient. Dollar figures cover grants with disclosed amounts only.',
      inputSchema: z.object({
        cause: z.string().optional(),
        funder: z.string().optional(),
        recipient: z.string().optional(),
      }),
    },
    async (args) => {
      const rows = await queryGrants({
        cause: args.cause,
        funders: args.funder ? [args.funder] : [],
        recipients: args.recipient ? [args.recipient] : [],
      })
      const byYear = new Map<number, { grants: number; total_usd: number }>()
      for (const row of rows) {
        if (!row.date) continue
        const year = Number(row.date.slice(0, 4))
        const entry = byYear.get(year) ?? { grants: 0, total_usd: 0 }
        entry.grants++
        entry.total_usd += row.amountUsd ?? 0
        byYear.set(year, entry)
      }
      return json(
        Array.from(byYear.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([year, entry]) => ({ year, ...entry, total_usd: Math.round(entry.total_usd) }))
      )
    }
  )
})

export { handler as GET, handler as POST, handler as DELETE }
