-- Reviews know who wrote them. reviewer_org_id links a review to the
-- reviewer's own Trace page when a name matches (a fund manager, a Manifund
-- regrantor, Zvi), so a review links to its author and an author's page can
-- list the reviews they wrote. venue is the publication the review appeared
-- in when that is not the reviewer themself: "Long-Term Future Fund" for a
-- payout-report write-up, "Manifund" for a regrantor's comment.

ALTER TABLE org_reviews
  ADD COLUMN IF NOT EXISTS reviewer_org_id uuid REFERENCES orgs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue text;
CREATE INDEX IF NOT EXISTS org_reviews_reviewer_idx ON org_reviews (reviewer_org_id);
