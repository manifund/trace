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

-- Scripts write as trace_writer (see supabase/trace-writer-role.sql); on a
-- fresh project the role script's loop adds these, so trace-schema.sql
-- omits them.
DROP POLICY IF EXISTS "trace_writer full access" ON org_teams;
CREATE POLICY "trace_writer full access" ON org_teams
  FOR ALL TO trace_writer USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "trace_writer full access" ON org_people;
CREATE POLICY "trace_writer full access" ON org_people
  FOR ALL TO trace_writer USING (true) WITH CHECK (true);
