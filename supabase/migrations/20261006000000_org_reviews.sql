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

-- Scripts write as trace_writer (see supabase/trace-writer-role.sql), which
-- RLS still applies to; on a fresh project the role script's loop adds this
-- for every table, so it is omitted from trace-schema.sql.
DROP POLICY IF EXISTS "trace_writer full access" ON org_reviews;
CREATE POLICY "trace_writer full access" ON org_reviews
  FOR ALL TO trace_writer USING (true) WITH CHECK (true);
