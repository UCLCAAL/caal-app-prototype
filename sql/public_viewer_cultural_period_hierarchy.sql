-- Run once as the database administrator in caal_devmaster, before deploying the patch.
-- Exposes vocabulary metadata only. Published record visibility is unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

-- Use the same hierarchy source as vocabulary publication and the Workbench.
CREATE OR REPLACE VIEW viewer_public.v_cultural_period_context AS
SELECT v.id::text AS concept_id, NULLIF(v.parent_id::text,'') AS parent_id,
       CASE WHEN to_jsonb(v)->>'sort_order' ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (to_jsonb(v)->>'sort_order')::numeric END AS sort_order,
       jsonb_build_object(
         'display_en',to_jsonb(v)->>'display_en','display_ru',to_jsonb(v)->>'display_ru',
         'display_zh',to_jsonb(v)->>'display_zh','display_kk',to_jsonb(v)->>'display_kk',
         'display_ky',to_jsonb(v)->>'display_ky','display_tg',to_jsonb(v)->>'display_tg',
         'display_tk',to_jsonb(v)->>'display_tk','display_uz',to_jsonb(v)->>'display_uz'
       ) AS translations
FROM ui.v_lkp_cultural_periods_raw v;

REVOKE ALL ON viewer_public.v_cultural_period_context FROM PUBLIC;
GRANT SELECT ON viewer_public.v_cultural_period_context TO viewer_public_reader;

DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM viewer_public.v_cultural_period_context WHERE parent_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Cultural Period hierarchy has no parent links. Check ui.v_lkp_cultural_periods_raw before proceeding.';
 END IF;
 IF EXISTS(SELECT 1 FROM viewer_public.v_cultural_period_context c
           WHERE c.parent_id IS NOT NULL AND NOT EXISTS(
             SELECT 1 FROM viewer_public.v_cultural_period_context p WHERE p.concept_id=c.parent_id)) THEN
   RAISE EXCEPTION 'Cultural Period hierarchy contains missing parents. Correct the source before proceeding.';
 END IF;
 IF EXISTS(SELECT concept_id FROM viewer_public.v_cultural_period_context GROUP BY concept_id HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Cultural Period hierarchy contains duplicate IDs.';
 END IF;
 IF EXISTS(
   WITH RECURSIVE paths AS (
     SELECT concept_id,parent_id,ARRAY[concept_id] AS seen,false AS cycle
     FROM viewer_public.v_cultural_period_context
     UNION ALL
     SELECT c.concept_id,c.parent_id,p.seen||c.concept_id,c.concept_id=ANY(p.seen)
     FROM paths p JOIN viewer_public.v_cultural_period_context c ON c.concept_id=p.parent_id
     WHERE NOT p.cycle
   ) SELECT 1 FROM paths WHERE cycle
 ) THEN RAISE EXCEPTION 'Cultural Period hierarchy contains a cycle.'; END IF;
END $$;

COMMIT;

SELECT count(*) AS concepts,count(*) FILTER (WHERE parent_id IS NULL) AS roots,
       count(*) FILTER (WHERE parent_id IS NOT NULL) AS children
FROM viewer_public.v_cultural_period_context;
SELECT has_table_privilege('viewer_public_reader','viewer_public.v_cultural_period_context','SELECT') AS reader_can_read;
