# Monthly curated-source refresh

You are refreshing Trace (trace.manifund.org), a database of AI safety
grants. You have two jobs this month: refresh the curated sources, and sweep
the curation backlog. You have NO database access (deliberately); a human
reviews your changes as a pull request, and ingestion happens after merge.

# Part 1 — refresh the curated sources

Check each source below for grants **not yet present** in its checked-in
extraction file and append them, following the file's existing schema and
conventions exactly.

## Ground rules
- Only edit files under `data/curated/`, plus `data/aliases.json` and
  `data/reviewed-orgs.json` for part 2. Nothing else.
- Match each file's existing row schema, field names, and conventions.
  Read several existing rows first.
- Never invent amounts. If a source states no amount, leave `amount` null.
  If a source gives a total over N grants or a range, you may estimate
  (average / geometric mean) with `"amountEstimated": true` and an
  `estimateNote` that states the calculation — mirror the tone of existing
  notes.
- Do not modify existing rows unless the source itself corrected them; note
  any such change in the summary.
- Do not edit `fund-estimates.json` (generated) or `ftx-future-fund.json`
  (dead source).
- Validate every file you touch parses: `python3 -m json.tool <file>`.
- Write a markdown summary to `/tmp/refresh-summary.md`: one section per
  source with a table of new grants (recipient, amount, date, source URL),
  or "no new grants found"; then a section for the curation sweep listing
  what you aliased, what you marked reviewed, and what you left undecided
  and why. This becomes the pull-request body.

## Sources
- **Longview Philanthropy** (`longview.json`): their published grants at
  longview.org (grants/annual report pages).
- **Macroscopic Ventures** (`macroscopic.json`): macroscopic.org/grants.
  Grants also appear in recipient announcements. GovAI/IAPS support is
  already recorded elsewhere — skip those.
- **UK AI Security Institute** (`uk-aisi.json`): aisi.gov.uk grant
  programmes (Alignment Project, Systemic AI Safety, Challenge Fund).
- **Schmidt Sciences** (`schmidt-sciences.json`): schmidtsciences.org —
  AI2050 fellows cohorts and AI safety science awardees. Per-cohort amount
  conventions are in the existing estimate notes.
- **Future of Life Institute** (`fli.json`): futureoflife.org grant
  program pages.
- **Foresight Institute** (`foresight.json`): foresight.org AI safety
  grants (their WordPress REST API at foresight.org/wp-json is pollable).
- **Recipient disclosures** (`org-reported.json`): transparency/funders
  pages of the recipient orgs already present in the file. STRICT RULE:
  only add a row if the (funder, recipient) pair has no grant in the
  database — check with the public API, e.g.
  `https://trace.manifund.org/api/v0/grants?funder=<slug>&recipient=<slug>`
  (see /api/v0 for usage). Money that came via an intermediary counts as
  covered if the via matches.

Coefficient Giving is refreshed weekly by a deterministic script — do
not handle it.

# Part 2 — sweep the curation backlog

Ingestion auto-creates an org whenever it meets a name it doesn't know, and
flags it `needs_review`. The backlog never reaches zero, which is why it is
swept here once a month instead of being reported every week.

Read `/tmp/queue/unmatched.txt` — flagged orgs ranked by dollars affected,
each with near-miss suggestions after `~`. Also read `/tmp/queue/dedup.txt`
(pending duplicate-grant pairs) and `/tmp/queue/untagged.txt` (grants that
fell through to the 'other' cause).

Work top-down by dollars; that ordering is the whole point. For each flagged
org decide one of three things:

- **It is the same body as an existing org** — add `"<raw name>": "<slug>"`
  to the `aliases` map in `data/aliases.json`. Only when you are certain:
  shared surname is not evidence, and two researchers with similar names are
  the common case. Check the near-misses rather than trusting them.
- **It is genuinely distinct and correctly named** — add its slug to
  `slugs` in `data/reviewed-orgs.json`, which clears the flag.
- **You cannot tell** — leave it. An unresolved row costs nothing; a wrong
  merge silently moves someone else's money.

Do not edit `merges` in `data/aliases.json`: merging two orgs a human has
already reviewed is a human's call.

Aim for the entries worth a person's attention rather than the whole list —
the top of the file by dollars, and any obvious cluster below it. Say in the
summary how far down you got and what you deliberately left.
