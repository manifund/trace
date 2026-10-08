# Ingestion scripts

## Ingester notes

- **EA Funds**: one CSV GET; Airtable rec ids are stable keys. Rounds are "2026 Q2" (newer) or "Q1 2022" (older).
- **SFF**: single index page has all rounds as a real `<table>`; amount cells may carry "+$X‡" speculation top-ups (both count). Bracketed `[Project]` suffixes are stripped from org names. Parse guard: fails if <400 rows.
- **Vipul**: parses raw MySQL INSERT files from GitHub pinned to a SHA (`bun run ingest:vipul [sha]`); v1 keeps only the x-risk/EA cluster (KEEP regex in the script).
- **Manifund**: public API paginates via `?before=` cursor (full history) but has no donor identities; `--direct` reads their Supabase for donor-level grants and is the only mode that tombstones.
- **CLR Fund** (`scripts/ingest-clr.ts`): the "Past Grants" accordion on longtermrisk.org/grantmaking, one `<details>` per grant under `<h3>` year headings; keyed by year + hash of the summary line. Amounts come as "$81,503" or "1,200 GBP"; the first payout date is the grant date. Grantees default to individuals (orgs recognised by name). Parse guard: fails if <40 rows. Funder is Center on Long-Term Risk itself; "CLR Fund" and the pre-2020 "EAF Fund" are its names in `orgs-seed.json`.
- **IRS 990** (`scripts/ingest-990.ts`, not in `ingest-all`): e-file XML from the Giving Tuesday data lake, pinned by IRS object id per filer. Handles 990-PF (Part XV grants paid) and public-charity 990 (Schedule I named grantees; Schedule I Part III / Schedule F individual and foreign-org grants are region-only on the form, so they land on Various Individuals / Various Recipients). A filer can carry a `recipientFilter` to track one grantee out of a large portfolio (Rockefeller → Vox Future Perfect). List only the amended return when a year has both.
