-- Rejected suggestions are not public. The page already hides them, but the
-- read policy still exposed them to anyone querying the API directly; this
-- makes the database agree with the page. Authors keep reading their own (via
-- the existing "authors read own" policy) so they can see why, and admins
-- review through the service-scoped key.

DROP POLICY IF EXISTS "public read reviewed" ON trace.suggestions;
CREATE POLICY "public read accepted" ON trace.suggestions
  FOR SELECT USING (status = 'accepted');
