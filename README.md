# Trace

Database of AI safety grants — [trace.manifund.org](https://trace.manifund.org). See `CLAUDE.md` for architecture and commands.

## Run the site locally (read-only, against the live database)

```bash
bun install
cp .env.example .env.local
bun run dev
```

Fill `.env.local` with the two public values (safe to share — they are in every page load of the live site):

```
NEXT_PUBLIC_SUPABASE_URL=https://fkousziwzbnkdkldjper.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_78BXUfMCNmv9fkC22jxXxg_e_hgeM1T
```

The database is read-only for anonymous users; no other keys are needed.

## Rebuild the database from scratch (your own Supabase project)

1. Create a Supabase project and apply `supabase/migrations/` in order.
2. Put your project's URL, anon key, and service-role key in `.env.local` (the
   service-role key is used by scripts only — never expose it with a
   `NEXT_PUBLIC_` prefix or commit it).
3. `bun run seed`, then `bun run ingest`. Every ingester is idempotent; the
   checked-in files under `data/` (aliases, overrides, dedup resolutions,
   curated snapshots) reproduce all curation decisions.
4. `ingest-manifund --direct` reads Manifund's own tables from the same
   Supabase project (Trace lives in its `trace` schema), so it only works
   there; elsewhere run it without `--direct` for the coarser API version.

If you just want the data, the live site serves it without any setup:
`/api/v0` (JSON, CC0), `/api/mcp` (MCP), and `/grants.csv`.
