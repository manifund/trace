# Monthly curated-source refresh

You are refreshing Trace (trace.manifund.org), a database of AI safety
grants. Your job: check each source below for grants **not yet present** in
its checked-in extraction file, append them following the file's existing
schema and conventions exactly, and write a summary. You have NO database
access (deliberately); a human reviews your changes as a pull request, and
ingestion happens after merge.

## Ground rules
- Only edit files under `data/curated/` (and nothing else).
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
  or "no new grants found". This becomes the pull-request body.

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

Coefficient Giving is refreshed by a deterministic script in the same
workflow — do not handle it.
