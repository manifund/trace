-- The whole approved dataset in one call. Every page renders from the full
-- grants table held in memory; rebuilding it on a cold function instance
-- took 13 paged queries (seconds, and a statement-timeout risk when several
-- pages built at once). grants_export() returns the rows already in the
-- shape the app uses, with a content version, so a cold load is one request
-- and no hashing. Row order is grant_date desc, id, as the paged query was.
-- Built with json (text) rather than jsonb and with the per-grant lists
-- pre-aggregated: about 0.9 s for 12k rows against 2 s the other way.

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
