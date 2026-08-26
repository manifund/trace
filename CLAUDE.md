# Trace

Database of AI safety grants aggregated from public sources. Next.js + Supabase, read-only site; all writes happen through ingestion scripts.

## Quick Commands

```bash
bun run dev              # Dev server
bun run build            # Production build (the CI gate)
bun run format           # oxfmt
bun test                 # Parser/normalize unit tests only
bun run seed             # Seed cause areas, sources, curated orgs; applies alias merges
bun run ingest           # All tier-1 ingesters, then dedup report
bun run report-unmatched # needs_review orgs ranked by $ affected
bun run dedup            # Cross-source dup candidates; --apply executes resolutions
bun run verify           # Totals vs data/expected-totals.json
bun run gen-types        # Regenerate db/database.types.ts from Supabase
```

## Tech Stack

- Next.js 16 (App Router only), TypeScript strict, React 19
- Supabase (Postgres), no ORM — direct supabase-js; types in `db/database.types.ts`
- Tailwind CSS; Bun; Vercel
- No auth in v1. Scripts use the service-role key from `.env.local`.

## Project Structure

```
app/              # Pages: / (grants table), /orgs/[slug], /funders, /about, /grants.csv
components/       # grants-table.tsx (client filters/sort/pagination)
db/               # Supabase clients, query layer (grant.ts, org.ts), generated types
scripts/          # Ingestion + curation, run with bun
  lib/            # ingest core, org resolver, parsers (tested)
data/             # Checked-in curation files — the git-audited crosswalk
supabase/         # Migrations (RLS policies live HERE, unlike manifund)
utils/            # format, parse, grant-filters (shared by table + CSV route)
```

## Key Patterns

- **Provenance backbone:** every source row is stored verbatim in `source_records`; canonical `grants` are derived and linked via `grant_sources` (one `is_primary` record per grant). Re-running any ingester is always safe: unchanged rows are skipped by content hash, vanished rows are tombstoned and their grants become `rejected`.
- **Entity resolution:** exact match on normalized names (`scripts/lib/normalize.ts`) + `data/aliases.json`. Unknown names auto-create `needs_review` orgs. Curation loop: `report-unmatched` → edit `aliases.json` → `bun run seed` (merges provisional orgs into canonical ones).
- **Renames** (Open Philanthropy → Coefficient Giving, LTFF → TAIF, ...) are date-ranged rows in `org_names`, seeded from `data/orgs-seed.json`.
- **Fiscal sponsorship:** `grants.fiscal_sponsor_org_id` (SFF's Receiving Charity). Recipient is who the money is for.
- **Dedup:** `dedup.ts` proposes cross-source pairs; decisions live in `data/dedup-resolutions.json` (keyed by provenance keys, so they survive DB rebuilds); `--apply` merges, losers become `superseded`.
- **Grant status:** public pages only see `approved`. `pending` is reserved for future community submissions.
- Field fixes go in `data/overrides.json` (keyed `source:record_key`), never by editing the DB by hand.

## Data snapshot (fast reads)

Public pages don't query Postgres per render. `db/snapshot.ts` builds the whole
approved dataset as one compact structure (`utils/snapshot.ts`, ~400KB brotli),
cached with `unstable_cache` under the `snapshot` tag for 10 minutes. Server
components filter it in memory; the browser fetches the same bytes once from
`/snapshot/<version>` (immutable, version = content hash) via `useSnapshot()`
and reuses them across pages. Grant ids in the snapshot are 8-hex UUID
prefixes; `getGrantById` resolves prefixes, full UUIDs stay in SQL.
`invalidateSnapshot()` runs on suggestion accept and via `POST /api/revalidate`
(bearer `REVALIDATE_SECRET`, called by `ingest-all` when `REVALIDATE_URL` is
set). `USE_SNAPSHOT` in `db/flags.ts` falls back to the per-page PostgREST path.

## Code Style

Same as manifund: oxfmt (no semicolons, single quotes, 2-space), kebab-case files, PascalCase components, `@/` alias.

## Site copy

Keep on-site text minimal — data tables, not prose. No generated descriptions or filler; Caroline writes any copy herself.

## Community suggestions

Signed-in users propose new grants or edits at `/suggest`; admins review at
`/suggestions`. Auth is Supabase Google OAuth (enable the provider in the
Supabase dashboard); admins are the emails in `ADMIN_EMAILS`.

Accepting writes the change to the database immediately, then
`bun run export-suggestions` mirrors accepted suggestions into the checked-in
files — added grants into `data/curated/community.json` (keys match the
records the app wrote, so re-ingesting updates rather than duplicates), edits
into `data/overrides.json`. Commit those and the rebuild reproduces them.

## Database Migrations

Hand-written SQL in `supabase/migrations/`, applied to the hosted project (no local Docker flow), then `bun run gen-types`. RLS policies are checked into the migrations — keep it that way. `db/database.types.ts` was hand-written to match the initial migration; regenerate once the project exists.

## Hosting inside the Manifund project

Trace's tables are moving into a `trace` schema in Manifund's Supabase
project, so Manifund logins work with RLS natively (`auth.uid()` resolves).
Manifund's `public` schema is never touched — it has its own `orgs` table, so
a shared schema was never an option.

- `supabase/trace-schema.sql` replays every migration into `trace`
  (`SET search_path`, one connection). Apply with `apply-migration.ts`.
- `scripts/copy-database.ts` copies table-by-table between projects in
  dependency order; `--verify-only` compares row counts, `--wipe` clears the
  target first. Within one project, `INSERT INTO trace.x SELECT * FROM
  public.x` is faster.
- `NEXT_PUBLIC_TRACE_DB_SCHEMA=trace` switches the app and scripts over; every
  client reads it, so the cutover is configuration, not code.
- The target project must expose `trace` under Settings -> API -> Exposed
  schemas, or PostgREST answers "Invalid schema".

## Environment

`.env.local` (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (scripts only), optional `MANIFUND_SUPABASE_URL`/`MANIFUND_SUPABASE_ANON_KEY` for `ingest-manifund --direct`.

## Ingester notes

- **EA Funds**: one CSV GET; Airtable rec ids are stable keys. Rounds are "2026 Q2" (newer) or "Q1 2022" (older).
- **SFF**: single index page has all rounds as a real `<table>`; amount cells may carry "+$X‡" speculation top-ups (both count). Bracketed `[Project]` suffixes are stripped from org names. Parse guard: fails if <400 rows.
- **Vipul**: parses raw MySQL INSERT files from GitHub pinned to a SHA (`bun run ingest:vipul [sha]`); v1 keeps only the x-risk/EA cluster (KEEP regex in the script).
- **Manifund**: public API paginates via `?before=` cursor (full history) but has no donor identities; `--direct` reads their Supabase for donor-level grants and is the only mode that tombstones.
