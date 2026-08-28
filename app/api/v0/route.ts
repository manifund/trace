import { NextResponse } from 'next/server'
import { CORS_HEADERS } from '@/db/api'

export function GET() {
  return NextResponse.json(
    {
      endpoints: {
        '/api/v0/grants':
          'Grants. Params: cause (slug, default all), q, funders, recipients, vias, sources (comma-separated slugs or names), yearMin, yearMax, amountMin, amountMax (USD), sort (date|amount|funder|recipient), dir (asc|desc), limit (default 100, max 1000), offset.',
        '/api/v0/orgs': 'Organizations. Params: q, limit (default 100, max 1000), offset.',
        '/api/v0/sources': 'Data sources.',
        '/api/mcp': 'MCP endpoint (streamable HTTP).',
        '/grants.csv': 'CSV export; same filter params as /api/v0/grants.',
      },
      license: 'CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/',
    },
    { headers: CORS_HEADERS }
  )
}

export function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS })
}
