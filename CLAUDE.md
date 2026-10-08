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
bun run prune-orphan-orgs # Delete orgs nothing refers to (--apply)
bun run dedup            # Cross-source dup candidates; --apply executes resolutions
bun run verify           # Totals vs data/expected-totals.json
bun run gen-types        # Regenerate db/database.types.ts from Supabase
bun run find-org-links   # Propose websites for orgs without one -> data/org-links.json
bun run fetch-logos      # Site icons for every org with a website -> public/logos/
```

## Key Patterns

- No auth in v1. Scripts use the service-role key from `.env.local`.
- **Provenance backbone:** every source row is stored verbatim in `source_records`; canonical `grants` are derived and linked via `grant_sources` (one `is_primary` record per grant). Re-running any ingester is always safe: unchanged rows are skipped by content hash, vanished rows are tombstoned and their grants become `rejected`.
- **Entity resolution:** exact match on normalized names (`scripts/lib/normalize.ts`) + `data/aliases.json`. Unknown names auto-create `needs_review` orgs. Curation loop: `report-unmatched` → edit `aliases.json` → `bun run seed` (merges provisional orgs into canonical ones).
- **Renames** (Open Philanthropy → Coefficient Giving, LTFF → TAIF, ...) are date-ranged rows in `org_names`, seeded from `data/orgs-seed.json`.
- **Fiscal sponsorship:** `grants.fiscal_sponsor_org_id` (SFF's Receiving Charity). Recipient is who the money is for.
- **Dedup:** `dedup.ts` proposes cross-source pairs; decisions live in `data/dedup-resolutions.json` (keyed by provenance keys, so they survive DB rebuilds); `--apply` merges, losers become `superseded`.
- **Reads:** `getGrants()` in `db/grant.ts` loads every approved grant once per process and memoizes it (10 min, content-hashed `getGrantsVersion()`); server code filters that array in memory, `clearGrants()` runs on suggestion accept. Data pages render a small default view on the server (`firstPaintRows`, first N rows, ...) and pass `version` + `initial` to a client component that does `useGrants(version) ?? initial` — SWR fetches `/grants.json?v=<version>` (immutable) once per browser session and every page shares it. New table = one server page + one client component in that shape.
- **Grant status:** public pages only see `approved`. `pending` is reserved for future community submissions.
- Field fixes go in `data/overrides.json` (keyed `source:record_key`), never by editing the DB by hand.
- **Websites and logos:** `orgs-seed.json` carries websites for curated orgs; `data/org-links.json` (filled by `find-org-links` from the vipul donee table, Manifund profiles and Wikidata, keyed by slug with provenance) covers the rest and is applied by `seed`. `fetch-logos` turns websites into `public/logos/<slug>.png` and lists them in `data/org-logos.json`, which `OrgLogo` reads; rerun it after seed changes websites.

## Git

Small features and fixes are committed directly to `main`. Only larger, multi-session work gets a feature branch and PR.

## Site copy

Keep on-site text minimal — data tables, not prose. No generated descriptions or filler; Caroline writes any copy herself.

## Community suggestions

Signed-in users propose new grants or edits at `/suggest`; admins review at
`/edit`. Auth is Supabase Google OAuth (enable the provider in the
Supabase dashboard); admins are the emails in `ADMIN_EMAILS`.

Accepting writes the change to the database immediately, then
`bun run export-suggestions` mirrors accepted suggestions into the checked-in
files — added grants into `data/curated/community.json` (keys match the
records the app wrote, so re-ingesting updates rather than duplicates), edits
into `data/overrides.json`. Commit those and the rebuild reproduces them.

## Reviews

Third-party write-ups of orgs live in `org_reviews`, one row per reviewer x
org, shown as a "Reviews" section on org pages. Each reviewer edition is a
checked-in file in `data/reviews/` (`zvi-2025.json` from nonprofits.zone via
`fetch-zvi-reviews`; `mdickens-<year>.json` from Michael Dickens's donation
posts via `fetch-mdickens-reviews`; `ltff-<yyyy-mm>.json` from LTFF payout reports
on the EA Forum via `fetch-ltff-reviews`, one review per grant write-up;
`manifund-<username>.json` from each Manifund regrantor's comments on
projects Trace holds grants for, via `fetch-manifund-comments`, Manifund
staff excluded); `bun run ingest-reviews` resolves org names through the
usual crosswalk and upserts. Files with `createOrgs: false` (the LTFF and
Manifund ones, which name hundreds of individuals) skip names the crosswalk
does not know instead of creating stub orgs. The body's first paragraph is
the reviewer's one-line verdict (Zvi's confidence and funding need, Dickens's
classification, LTFF's amount, purpose and evaluator, the Manifund project
and month) and shows collapsed on the org page; the rest opens on click. Apply migrations to the hosted project with
`SUPABASE_PAT=... bun run scripts/apply-trace-migration.ts <file>`.

## Teams

Leadership and staff from each org's own website live in `org_teams`
(headcount, provenance) and `org_people` (one row per listed person), shown
as a line under the org header with the full list behind a toggle. Source
files are `data/teams/<slug>.json`; `bun run ingest-teams` replaces an org's
rows and links people to their own Trace page when a normalized name matches
an org of type individual (never auto-creates). Board members and advisors
are not staff.

## Database Migrations

Hand-written SQL in `supabase/migrations/`, applied to the hosted project (no local Docker flow), then `bun run gen-types`. RLS policies are checked into the migrations — keep it that way. `db/database.types.ts` was hand-written to match the initial migration; regenerate once the project exists.
