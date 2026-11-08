-- Run as a database administrator with access to the existing views.
-- The public role continues to see only records in its published catalogue.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

CREATE OR REPLACE VIEW viewer_public.v_monument_cultural_periods AS
SELECT c.source_row_id, c.caal_id, m.cultural_periods_arr::text[] AS concept_ids
FROM viewer_public.v_resource_count_catalogue c
JOIN ui.mv_monuments_caal m
  ON m.id::text = c.source_row_id::text
 AND m."CAAL_ID"::text = c.caal_id
WHERE c.record_type = 'monument'
  AND cardinality(m.cultural_periods_arr) > 0;

REVOKE ALL ON viewer_public.v_monument_cultural_periods FROM PUBLIC;
GRANT SELECT ON viewer_public.v_monument_cultural_periods TO viewer_public_reader;

-- Abort rather than install an empty filter if the view identifiers do not align.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM viewer_public.v_monument_cultural_periods WHERE concept_ids::text ~ 'CP-[1-3]-[0-9]{4,8}'
  ) THEN
    RAISE EXCEPTION 'No published monuments with resolved cultural period IDs; check catalogue and monument MV alignment';
  END IF;
END $$;

COMMIT;
