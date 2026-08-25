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
