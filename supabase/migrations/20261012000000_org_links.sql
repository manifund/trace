-- Profile links for individuals: personal site, Twitter, LinkedIn, Manifund,
-- LessWrong, EA Forum. One jsonb object keyed by kind, owned by
-- data/person-links.json and written by seed. orgs.website stays the
-- homepage that logos are fetched from.

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS links jsonb;
