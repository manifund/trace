-- Creates Trace's tables inside a dedicated `trace` schema, for hosting them
-- in the Manifund Supabase project so Manifund logins work natively with RLS.
--
-- Everything below is the project's own migrations, replayed verbatim into a
-- schema of their own. Manifund's `public` schema is never touched — which
-- matters because it already has its own `orgs` table.
--
-- After applying: expose `trace` in the project's API settings (Settings ->
-- API -> Exposed schemas) so PostgREST can serve it, and set
-- TRACE_DB_SCHEMA=trace for the app and scripts.

CREATE SCHEMA IF NOT EXISTS trace;

-- The migration runner holds one connection, so this applies to every
-- statement that follows: unqualified objects are created in `trace`, while
-- extensions and auth.users still resolve.
SET search_path = trace, public;


-- ===== from 20260819000000_init.sql =====
-- Grantbook initial schema: a database of AI safety grants aggregated from
-- public sources (EA Funds, SFF, Manifund, Vipul Naik's donations list, ...).
--
-- Design notes:
-- * Raw source rows are preserved verbatim in source_records (jsonb) and
--   canonical grants are derived from them, linked via grant_sources. This is
--   the provenance and idempotency backbone: re-ingesting is always safe, and
--   cross-source duplicates merge without losing either source's record.
-- * One orgs table covers funders, grantees, fiscal sponsors, and individuals;
--   roles are derived from which side of a grant an org appears on (BERI is
--   both a donor and a donee). Renames (Open Philanthropy -> Coefficient
--   Giving, LTFF -> TAIF, ...) are date-ranged rows in org_names.
-- * grants.status anticipates v2 community submissions: ingested grants are
--   'approved'; merge losers become 'superseded'; retracted source rows
--   'rejected'. Public reads only see 'approved'.
-- * Unlike manifund, RLS policies are checked in here so prod is reproducible.

CREATE TABLE IF NOT EXISTS orgs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  org_type      text NOT NULL DEFAULT 'organization'
                CHECK (org_type IN ('organization', 'fund', 'foundation', 'individual', 'government', 'project')),
  website       text,
  description   text,
  needs_review  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_names (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  normalized  text NOT NULL,
  kind        text NOT NULL DEFAULT 'alias'
              CHECK (kind IN ('canonical', 'former_name', 'alias', 'abbreviation')),
  valid_from  date,
  valid_to    date,
  note        text,
  UNIQUE (org_id, normalized)
);
CREATE INDEX IF NOT EXISTS org_names_normalized_idx ON org_names (normalized);

CREATE TABLE IF NOT EXISTS sources (
  id                text PRIMARY KEY,
  name              text NOT NULL,
  url               text,
  license           text,
  tier              int NOT NULL DEFAULT 1,
  last_ingested_at  timestamptz,
  notes             text
);

CREATE TABLE IF NOT EXISTS source_records (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          text NOT NULL REFERENCES sources(id),
  source_record_key  text NOT NULL,
  raw                jsonb NOT NULL,
  content_hash       text NOT NULL,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  removed_at         timestamptz,
  UNIQUE (source_id, source_record_key)
);
CREATE INDEX IF NOT EXISTS source_records_source_idx ON source_records (source_id);

CREATE TABLE IF NOT EXISTS cause_areas (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug      text NOT NULL UNIQUE,
  name      text NOT NULL,
  parent_id uuid REFERENCES cause_areas(id)
);

CREATE TABLE IF NOT EXISTS grants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funder_org_id         uuid NOT NULL REFERENCES orgs(id),
  recipient_org_id      uuid NOT NULL REFERENCES orgs(id),
  -- SFF-style fiscal sponsorship: recipient is who the money is for
  -- ("Organization"); sponsor is who legally receives it ("Receiving
  -- Charity") when the two differ.
  fiscal_sponsor_org_id uuid REFERENCES orgs(id),
  amount                numeric(14, 2),
  currency              text NOT NULL DEFAULT 'USD',
  amount_usd            numeric(14, 2),
  grant_date            date,
  date_precision        text CHECK (date_precision IN ('day', 'month', 'year')),
  description           text,
  round                 text,
  url                   text,
  status                text NOT NULL DEFAULT 'approved'
                        CHECK (status IN ('approved', 'pending', 'rejected', 'superseded')),
  superseded_by         uuid REFERENCES grants(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grants_funder_idx ON grants (funder_org_id);
CREATE INDEX IF NOT EXISTS grants_recipient_idx ON grants (recipient_org_id);
CREATE INDEX IF NOT EXISTS grants_date_idx ON grants (grant_date DESC);
CREATE INDEX IF NOT EXISTS grants_status_idx ON grants (status);
CREATE INDEX IF NOT EXISTS grants_amount_idx ON grants (amount_usd DESC);

CREATE TABLE IF NOT EXISTS grant_cause_areas (
  grant_id      uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  cause_area_id uuid NOT NULL REFERENCES cause_areas(id),
  PRIMARY KEY (grant_id, cause_area_id)
);

CREATE TABLE IF NOT EXISTS grant_sources (
  grant_id         uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  source_record_id uuid NOT NULL REFERENCES source_records(id),
  -- Exactly one primary per grant; the primary record's source wins field
  -- conflicts on merge.
  is_primary       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (grant_id, source_record_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS grant_sources_record_uniq ON grant_sources (source_record_id);

CREATE TABLE IF NOT EXISTS dedup_candidates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id_a  uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  grant_id_b  uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  score       numeric,
  reason      text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'distinct')),
  resolved_at timestamptz,
  UNIQUE (grant_id_a, grant_id_b)
);

-- RLS: everything publicly readable (this is a public dataset); grants only
-- when approved. All writes go through the service role in scripts.
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cause_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_cause_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE dedup_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON orgs;
CREATE POLICY "public read" ON orgs FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read" ON org_names;
CREATE POLICY "public read" ON org_names FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read" ON sources;
CREATE POLICY "public read" ON sources FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read" ON source_records;
CREATE POLICY "public read" ON source_records FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read" ON cause_areas;
CREATE POLICY "public read" ON cause_areas FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read approved" ON grants;
CREATE POLICY "public read approved" ON grants FOR SELECT USING (status = 'approved');
DROP POLICY IF EXISTS "public read" ON grant_cause_areas;
CREATE POLICY "public read" ON grant_cause_areas FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read" ON grant_sources;
CREATE POLICY "public read" ON grant_sources FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read" ON dedup_candidates;
CREATE POLICY "public read" ON dedup_candidates FOR SELECT USING (true);

-- ===== from 20260819120000_add_via_org.sql =====
-- Funding-side intermediary: the vehicle a grant flowed through (Manifund,
-- SFF, EA Funds), distinct from the ultimate funder (Jaan Tallinn, an
-- individual Manifund donor) and from the recipient-side fiscal sponsor.
-- Lets the UI filter by vehicle and by ultimate source independently.

ALTER TABLE grants ADD COLUMN IF NOT EXISTS via_org_id uuid REFERENCES orgs(id);
CREATE INDEX IF NOT EXISTS grants_via_idx ON grants (via_org_id);

-- ===== from 20260820000000_grant_vias.sql =====
-- A grant can flow through more than one vehicle (e.g. Anton Makiievskyi →
-- grantmaking.ai → Manifund → project), so the single via_org_id column
-- becomes a join table.

CREATE TABLE IF NOT EXISTS grant_vias (
  grant_id   uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  via_org_id uuid NOT NULL REFERENCES orgs(id),
  PRIMARY KEY (grant_id, via_org_id)
);
CREATE INDEX IF NOT EXISTS grant_vias_org_idx ON grant_vias (via_org_id);

ALTER TABLE grant_vias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON grant_vias;
CREATE POLICY "public read" ON grant_vias FOR SELECT USING (true);

INSERT INTO grant_vias (grant_id, via_org_id)
  SELECT id, via_org_id FROM grants WHERE via_org_id IS NOT NULL
  ON CONFLICT DO NOTHING;

ALTER TABLE grants DROP COLUMN IF EXISTS via_org_id;

-- ===== from 20260821120000_amount_estimated.sql =====
-- Estimated amounts: flagged per grant, with a note explaining how the
-- figure was derived. Estimates count toward totals; the UI and exports
-- mark them.
alter table grants add column if not exists amount_estimated boolean not null default false;
alter table grants add column if not exists estimate_note text;

-- ===== from 20260825000000_suggestions.sql =====
-- Community suggestions: signed-in people propose new grants or edits to
-- existing ones; an admin accepts or rejects them.
--
-- A suggestion never touches `grants` directly. On acceptance the app writes
-- the change through the same path ingestion uses (a source_record under the
-- `community` source for additions, an overrides-shaped patch for edits), and
-- `bun run export-suggestions` mirrors accepted suggestions into the checked-in
-- data files so a rebuild from scratch reproduces them.
--
-- RLS: anyone signed in may insert; authors read their own; everyone reads
-- accepted ones (they are public data once approved). Admin review happens
-- through the service-role key in server actions, so no admin policy is needed.

CREATE TABLE IF NOT EXISTS suggestions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- auth.users id; kept nullable so a deleted account does not delete history
  user_id       uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  user_email    text,
  kind          text NOT NULL CHECK (kind IN ('new', 'edit')),
  -- edits point at the grant they change; additions leave this null
  grant_id      uuid REFERENCES grants (id) ON DELETE CASCADE,
  -- proposed values: for 'new', the whole grant; for 'edit', changed fields only
  payload       jsonb NOT NULL,
  source_url    text,
  comment       text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewed_at   timestamptz,
  reviewer      text,
  review_note   text,
  -- set when an accepted suggestion has been written into the database
  applied_at    timestamptz
);

CREATE INDEX IF NOT EXISTS suggestions_status_idx ON suggestions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS suggestions_grant_idx ON suggestions (grant_id);
CREATE INDEX IF NOT EXISTS suggestions_user_idx ON suggestions (user_id);

ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signed-in insert" ON suggestions;
CREATE POLICY "signed-in insert" ON suggestions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "authors read own" ON suggestions;
CREATE POLICY "authors read own" ON suggestions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "public read reviewed" ON suggestions;
CREATE POLICY "public read reviewed" ON suggestions
  FOR SELECT USING (status <> 'pending');


-- ===== from 20261006000000_org_reviews.sql =====
-- Third-party reviews of orgs (Zvi Mowshowitz's Big Nonprofits List to
-- start; other reviewers later). One row per reviewer x org x edition, keyed
-- by source_key so re-ingesting a reviews file updates in place. Bodies are
-- markdown as published by the reviewer, with anything reviewer-specific
-- (Zvi's confidence and funding-need ratings) folded into the text; the
-- site renders links and paragraphs only.

CREATE TABLE IF NOT EXISTS org_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_key    text NOT NULL UNIQUE,     -- '<reviews file id>:<normalized org name>'
  reviewer      text NOT NULL,            -- 'Zvi Mowshowitz'
  reviewer_url  text,                     -- where the reviewer publishes these
  source_url    text,                     -- the specific post or page reviewed from
  reviewed_at   date NOT NULL,
  body          text NOT NULL,            -- markdown
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_reviews_org_idx ON org_reviews (org_id);

ALTER TABLE org_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON org_reviews;
CREATE POLICY "public read" ON org_reviews FOR SELECT USING (true);


-- ===== from 20261007000000_org_teams.sql =====
-- Leadership and staff, as listed on each org's own website. One org_teams
-- row per org (headcount and provenance) plus one org_people row per listed
-- person. person_org_id links a staff member to their own Trace page when
-- they appear as an individual in the grants data.

CREATE TABLE IF NOT EXISTS org_teams (
  org_id         uuid PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  headcount      integer,                 -- staff count; null when the site gives no basis
  headcount_note text,                    -- what the number counts and where it came from
  source_url     text,                    -- the team page the names came from
  checked_at     date NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_people (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name           text NOT NULL,
  title          text,
  leadership     boolean NOT NULL DEFAULT false,
  person_org_id  uuid REFERENCES orgs(id) ON DELETE SET NULL,
  sort_order     integer NOT NULL DEFAULT 0,
  UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS org_people_org_idx ON org_people (org_id);
CREATE INDEX IF NOT EXISTS org_people_person_idx ON org_people (person_org_id);

ALTER TABLE org_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON org_teams;
CREATE POLICY "public read" ON org_teams FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read" ON org_people;
CREATE POLICY "public read" ON org_people FOR SELECT USING (true);


-- ===== from 20261008000000_review_authors.sql =====
ALTER TABLE org_reviews
  ADD COLUMN IF NOT EXISTS reviewer_org_id uuid REFERENCES orgs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue text;
CREATE INDEX IF NOT EXISTS org_reviews_reviewer_idx ON org_reviews (reviewer_org_id);

-- ===== from 20261008100000_grants_export.sql =====
DROP FUNCTION IF EXISTS grants_export();
CREATE FUNCTION grants_export()
RETURNS json
LANGUAGE sql
STABLE
-- Table names resolve in the schema the function was created in.
SET search_path FROM CURRENT
AS $$
  WITH vias AS (
    SELECT gv.grant_id,
           json_agg(json_build_object('slug', v.slug, 'name', v.name) ORDER BY v.slug) AS vias
    FROM grant_vias gv JOIN orgs v ON v.id = gv.via_org_id
    GROUP BY gv.grant_id
  ),
  src AS (
    SELECT DISTINCT ON (gs.grant_id) gs.grant_id, sr.source_id
    FROM grant_sources gs JOIN source_records sr ON sr.id = gs.source_record_id
    WHERE gs.is_primary
  ),
  causes AS (
    SELECT gca.grant_id, json_agg(ca.slug ORDER BY ca.slug) AS causes
    FROM grant_cause_areas gca JOIN cause_areas ca ON ca.id = gca.cause_area_id
    GROUP BY gca.grant_id
  ),
  r AS (
    SELECT
      g.grant_date,
      g.id,
      json_build_object(
        'id', g.id,
        'date', g.grant_date,
        'datePrecision', g.date_precision,
        'amount', g.amount,
        'currency', g.currency,
        'amountUsd', g.amount_usd,
        'amountEstimated', g.amount_estimated,
        'estimateNote', g.estimate_note,
        'description', g.description,
        'round', g.round,
        'url', g.url,
        'funderSlug', f.slug,
        'funderName', f.name,
        'recipientSlug', rc.slug,
        'recipientName', rc.name,
        'sponsorSlug', s.slug,
        'sponsorName', s.name,
        'vias', COALESCE(vias.vias, '[]'::json),
        'sourceId', src.source_id,
        'causes', COALESCE(causes.causes, '[]'::json)
      ) AS row
    FROM grants g
    JOIN orgs f ON f.id = g.funder_org_id
    JOIN orgs rc ON rc.id = g.recipient_org_id
    LEFT JOIN orgs s ON s.id = g.fiscal_sponsor_org_id
    LEFT JOIN vias ON vias.grant_id = g.id
    LEFT JOIN src ON src.grant_id = g.id
    LEFT JOIN causes ON causes.grant_id = g.id
    WHERE g.status = 'approved'
  ),
  agg AS (
    SELECT COALESCE(json_agg(row ORDER BY grant_date DESC NULLS LAST, id)::text, '[]') AS rows
    FROM r
  )
  SELECT json_build_object('version', left(md5(rows), 12), 'rows', rows::json) FROM agg;
$$;

GRANT EXECUTE ON FUNCTION grants_export() TO anon, authenticated, service_role;

-- ===== API role grants =====
-- Supabase grants these automatically for `public` only; a new schema needs
-- them spelled out. RLS still governs what anon/authenticated can see —
-- these grants just let PostgREST reach the schema at all.
GRANT USAGE ON SCHEMA trace TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA trace TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA trace TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA trace TO service_role;
GRANT INSERT ON trace.suggestions TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA trace GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA trace GRANT ALL ON TABLES TO service_role;
