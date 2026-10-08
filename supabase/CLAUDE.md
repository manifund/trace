# Database

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
