# Fast reads: one snapshot, everywhere

Measured on 2026-08-26 against the live `trace` schema (10,590 approved grants,
4,979 orgs, 20 sources).

## What it costs today

|                           |                                                                              |
| ------------------------- | ---------------------------------------------------------------------------- |
| `listGrants('all')`       | **6.0s** — 11 pages × 6 PostgREST embeds; joins are 755ms/page vs 162ms flat |
| `/` HTML                  | **963KB gzip** (7.4MB raw) — the whole `GrantRow[]` inlined as RSC payload   |
| `/charts` HTML            | **973KB gzip** — the same rows again, fetched and shipped separately         |
| `/recipients`, `/funders` | 178KB, 89KB — compact tuples, but still their own copy                       |
| `/org-names.json`         | 110KB — search index, a fourth copy of the org list                          |
| `/orgs/[slug]` cold       | 4 DB queries; prebuilt for the top 150 only                                  |

Every one of the four big pages re-runs its own 6s query at each 10‑minute
revalidate. Walking `/` → `/charts` → `/recipients` downloads ~2.1MB of mostly
identical data, and nothing is shared across navigations.

Where the bytes go (gzipped, per field over all grants): UUID ids **216KB**,
descriptions 173KB, recipient slug+name 110KB, funder slug+name 43KB, everything
else < 35KB each. UUIDs are a quarter of the payload because random bytes don't
compress.

## The whole database is small

A compact snapshot — orgs as a dictionary `[slug, name][]`, grants as arrays
referencing org/cause/source indexes, ids truncated to 8 hex chars (0
collisions) — is:

|                                | raw   | gzip  | brotli    |
| ------------------------------ | ----- | ----- | --------- |
| everything (with descriptions) | 2.6MB | 557KB | **378KB** |
| without descriptions           | 2.4MB | 509KB | 389KB\*   |

\* brotli already handles the prose well; truncating descriptions to 120 chars
saves only 19KB (median length is 40 — it's the row count, not length). `JSON.parse` of the full snapshot: **10ms**. Building it from flat
tables fetched in parallel and joined in JS: **1.4s** (vs 6s with embeds).

So: the entire dataset is one ~380KB brotli file, cheaper than the `/` page is
right now, and it serves every page.

### Where the 375KB goes (marginal brotli saving if the column is dropped)

| column                  | saves    |     | column              | saves     |
| ----------------------- | -------- | --- | ------------------- | --------- |
| description             | 131KB    |     | url                 | 16KB      |
| id (8-hex)              | ~55KB    |     | amount, amountUsd   | 15KB each |
| orgs dictionary (4,806) | 66KB     |     | date                | 12KB      |
| recipient / funder idx  | 18 / 8KB |     | round, causes, rest | ≤6KB each |

The only way to halve it is to lazy-load description + id + url as a second
"details" file (core ≈ 170KB, details ≈ 220KB). **Decided 2026-08-26: one
file.** 375KB is ~100ms on broadband; revisit the split if mobile first paint
turns out to matter.

## Design

**One snapshot, built once, read by both the server and the browser.**

```
Supabase ──(1.4s, flat tables, joined in JS)──► Snapshot { version, orgs, causes, sources, grants }
                                                    │
                       ┌────────────────────────────┼────────────────────────────┐
                       ▼                            ▼                            ▼
             server components               /snapshot/<version>.json      generateStaticParams,
             (filter in memory, ms)          immutable, CDN + browser      /grants.csv, /api/v0, MCP
```

1. **`db/snapshot.ts`** — `buildSnapshot()` fetches `grants`, `orgs`,
   `cause_areas`, `grant_cause_areas`, `grant_vias`, `grant_sources(primary)`,
   `sources` flat and in parallel, joins in JS, returns the compact structure
   plus `version = hash(content)`. `getSnapshot()` wraps it in `'use cache'`
   (`cacheTag('snapshot')`, `cacheLife` ~10 min, stale-while-revalidate). This
   one function replaces `listGrants`, `listGrantsByOrg`, `listGrantsByVia`,
   `listOrgAggregates`, `listBusiestOrgSlugs`, and the `/org-names.json` route.
   `db/grant.ts` shrinks to `getGrantById` (suggest form) and the write path.

2. **`utils/snapshot.ts`** (isomorphic, no `server-only`) — `expand(snapshot)`
   → `GrantRow[]` and the org/name index. Runs in both places, so
   `grant-filters.ts`, charts, `org-index` keep their current inputs unchanged.

3. **Server pages read the snapshot.** `/orgs/[slug]` becomes a filter over the
   in-memory array: cold render goes from seconds to milliseconds, so
   `generateStaticParams` can prebuild every org (~5k pages, one 1.4s fetch)
   or none — it no longer matters. SEO/no-JS output stays as it is.

4. **`app/snapshot/[version]/route.ts`** serves the JSON with
   `Cache-Control: public, max-age=31536000, immutable`. Because the version is
   in the URL, the CDN and browser cache it forever, and a new version is a new
   URL. Vercel brotli-compresses it.

5. **Client: `useSnapshot(version)`.** The server passes only `version` (a
   string) to client components instead of `GrantRow[]`. A module-level promise
   fetches `/snapshot/<version>.json` once per session; every page and every
   client navigation reuses it. That's the entire "sync engine": ~30 lines. If
   the server has moved to a newer version, the next page load's `version`
   prop changes and the client fetches the new file.

   First paint: render the server's rows for the first page of the table (200
   rows ≈ 30KB RSC) so the HTML is complete before the snapshot arrives; the
   client swaps in the full dataset when it lands. Or ship nothing and show a
   skeleton for ~200ms — either is fine; the first keeps SEO.

6. **Invalidation.** `revalidateTag('snapshot')` inside the suggestions accept
   action (edits appear immediately), and `POST /api/revalidate?secret=…` at
   the end of `ingest-all` (or just let the 10‑minute window lapse — the user
   said daily would be acceptable).

### Expected result

|                                 | today                        | after                                                               |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `/` first load                  | 963KB gzip HTML              | ~40KB HTML + 380KB br snapshot (cached)                             |
| `/` → `/charts` → `/recipients` | +973KB, +178KB               | +~5KB RSC each; zero data fetches                                   |
| Cold ISR regenerate             | 6s per page, ×4 pages        | 1.4s once, shared                                                   |
| Cold org page                   | ~2–4s                        | ~10ms                                                               |
| Search / filter / sort          | client, already instant      | same, plus org typeahead has no extra fetch                         |
| Code                            | 5 paging query fns + 1 route | 1 builder + 1 expander + 1 route + 1 hook; ~200 lines net _removed_ |

## Decisions (2026-08-26)

- One snapshot file, not core + details.
- Grant ids in the snapshot are 8-hex UUID prefixes — the part before the
  first dash. 0 collisions today (6-hex already has 2); expected 0.01 at 10.6k
  rows, ~0.3 at 50k. The builder asserts uniqueness so a collision fails the
  build instead of mislinking. `/suggest`, the API and MCP resolve prefixes
  with `id like 'prefix%'`. SQL keeps the full UUIDs and stays the source of
  truth.
- Feature flag in code: `const USE_SNAPSHOT = true` (e.g. `db/flags.ts`).
  Pages call one query layer; the flag picks the snapshot or the original
  PostgREST functions underneath, so the two can be compared side by side
  before the old path is deleted. Default: snapshot.
- SSR from the in-memory snapshot (first 200 rows / org page), client loads
  the snapshot and hydrates. Crawlable HTML stays.
- Built on demand with `'use cache'`, ~10-min life, `revalidateTag('snapshot')`
  on suggestion accept. No new infrastructure. A `trace.snapshot()` SQL
  function can replace the builder body later if the 1.4s cold build matters.

## Alternatives considered

- **Sync engines** (ElectricSQL, PowerSync, Zero, Replicache, TinyBase, Instant,
  Convex): built for many writers and live partial replication. Trace has one
  writer (ingest scripts + an admin clicking Accept) and a dataset that fits in
  one file, so a versioned immutable snapshot _is_ the sync protocol. Any of
  these would add a service and a client library to solve a problem we don't
  have.
- **DuckDB-wasm / sql.js / Arrow / Parquet**: 400KB of JSON vs. megabytes of
  wasm. Columnar JSON + brotli is within ~20% of Parquet at this size, and
  `JSON.parse` is 10ms.
- **Postgres function (`trace.snapshot()` returning jsonb)**: one round trip
  instead of ~25 parallel ones; probably ~500ms instead of 1.4s. Worth doing
  later as a migration if the 1.4s cold build ever matters; it doesn't change
  the design, only `buildSnapshot`'s body.
- **Build-time snapshot (write file in `next build`, redeploy on ingest)**:
  simplest possible runtime (a static file), but accepted suggestions wouldn't
  show until a redeploy. The `'use cache'` route gets the same static-file
  behaviour via CDN and keeps suggestions live. Revisit if the cache proves
  fiddly.
- **Storing the snapshot in Supabase Storage / Vercel Blob**, regenerated by
  ingest: works, but it's a second place data lives and a second thing to keep
  in sync. Not needed while Next's cache holds it.
- **classes.wtf's approach** (Go + Redis full-text index, server-side search):
  right for 10⁵–10⁶ rows with a complex search language. At 10⁴ rows the
  browser is the fastest search engine available — 0ms round trip.

## Order of work

1. `db/snapshot.ts` + `utils/snapshot.ts`; swap `/`, `/charts`, `/funders`,
   `/recipients` to read from `getSnapshot()` server-side. No client change
   yet; pages still ship rows. Already removes the 6s×4 revalidate cost and
   the org-page cold render (~half a day, mostly deletions).
2. Snapshot route + `useSnapshot`; pages pass `version` instead of rows.
   Payload drops ~10×, navigations become free.
3. `revalidateTag` in suggestions accept; revalidate endpoint for ingest.
4. Optional: `trace.snapshot()` SQL function; prebuild all org pages.
