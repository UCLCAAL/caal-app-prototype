const express = require("express");
const pool = require("./db");

const router = express.Router();

const MAX_LIMIT = 100;

function normaliseSearchTerm(value) {
  return String(value || "").trim();
}

function parseLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, MAX_LIMIT);
}

function parseContext(value) {
  const context = String(value || "").trim().toLowerCase();

  if (["archive", "monuments", "home", "global"].includes(context)) {
    return context;
  }

  return "home";
}

router.get("/search/resources", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  const q = normaliseSearchTerm(req.query.q || req.query.text);
  const context = parseContext(req.query.context);
  const limit = parseLimit(req.query.limit);

  if (q.length < 2) {
    return res.json({
      ok: true,
      query: q,
      context,
      records: []
    });
  }

  try {
    const result = await pool.query(
      `
      WITH q AS (
        SELECT lower(trim($1::text)) AS term
      ),

      exact_hits AS (
        SELECT
          0 AS rank_group,
          'exact_caal_id'::text AS match_type,

          ri.record_type,
          ri.dataset_label,
          ri.caal_id,
          ri.display_label,
          ri.source_schema,
          ri.source_table,
          ri.source_row_id,

          NULL::text AS matched_related_record_type,
          NULL::text AS matched_related_dataset_label,
          NULL::text AS matched_related_caal_id,
          NULL::text AS matched_related_display_label,
          NULL::text AS relation_type,
          NULL::text AS relation_direction
        FROM ui.mv_resource_identity ri, q
        WHERE lower(trim(ri.caal_id)) = q.term
      ),

      direct_hits AS (
        SELECT
          CASE
            WHEN $2 = 'archive' AND ri.record_type = 'archive' THEN 1
            WHEN $2 = 'monuments' AND ri.record_type = 'monument' THEN 1
            WHEN $2 IN ('home', 'global') THEN 1
            ELSE 3
          END AS rank_group,

          'direct'::text AS match_type,

          ri.record_type,
          ri.dataset_label,
          ri.caal_id,
          ri.display_label,
          ri.source_schema,
          ri.source_table,
          ri.source_row_id,

          NULL::text AS matched_related_record_type,
          NULL::text AS matched_related_dataset_label,
          NULL::text AS matched_related_caal_id,
          NULL::text AS matched_related_display_label,
          NULL::text AS relation_type,
          NULL::text AS relation_direction
        FROM ui.mv_resource_identity ri, q
        WHERE ri.name_blob ILIKE '%' || q.term || '%'
      ),

      related_hits AS (
        SELECT
          CASE
            WHEN $2 = 'archive' AND rs.returned_record_type = 'archive' THEN 2
            WHEN $2 = 'monuments' AND rs.returned_record_type = 'monument' THEN 2
            WHEN $2 IN ('home', 'global') THEN 2
            ELSE 4
          END AS rank_group,

          'related'::text AS match_type,

          rs.returned_record_type AS record_type,
          rs.returned_dataset_label AS dataset_label,
          rs.returned_caal_id AS caal_id,
          rs.returned_display_label AS display_label,
          rs.returned_source_schema AS source_schema,
          rs.returned_source_table AS source_table,
          rs.returned_source_row_id AS source_row_id,

          rs.related_record_type AS matched_related_record_type,
          rs.related_dataset_label AS matched_related_dataset_label,
          rs.related_caal_id AS matched_related_caal_id,
          rs.related_display_label AS matched_related_display_label,
          rs.relation_type,
          rs.relation_direction
        FROM ui.mv_resource_related_search rs, q
        WHERE rs.related_name_blob ILIKE '%' || q.term || '%'
      ),

      combined AS (
        SELECT * FROM exact_hits
        UNION ALL
        SELECT * FROM direct_hits
        UNION ALL
        SELECT * FROM related_hits
      ),

      deduped AS (
        SELECT DISTINCT ON (
          match_type,
          record_type,
          source_schema,
          source_table,
          source_row_id,
          COALESCE(matched_related_caal_id, '')
        )
          *
        FROM combined
        ORDER BY
          match_type,
          record_type,
          source_schema,
          source_table,
          source_row_id,
          COALESCE(matched_related_caal_id, ''),
          rank_group,
          display_label
      ),

      home_unique_resources AS (
        SELECT DISTINCT ON (
          record_type,
          source_schema,
          source_table,
          source_row_id
        )
          *
        FROM deduped
        ORDER BY
          record_type,
          source_schema,
          source_table,
          source_row_id,
          rank_group,
          CASE match_type
            WHEN 'exact_caal_id' THEN 1
            WHEN 'direct' THEN 2
            WHEN 'related' THEN 3
            ELSE 9
          END,
          display_label
      ),

      totals AS (
        SELECT
          COUNT(*)::int AS total
        FROM (
          SELECT DISTINCT
            record_type,
            source_schema,
            source_table,
            source_row_id
          FROM deduped
        ) unique_resources
      ),

      totals_by_type AS (
        SELECT
          COALESCE(
            jsonb_object_agg(record_type, n ORDER BY record_type),
            '{}'::jsonb
          ) AS totals_by_record_type
        FROM (
          SELECT
            record_type,
            COUNT(*)::int AS n
          FROM (
            SELECT DISTINCT
              record_type,
              source_schema,
              source_table,
              source_row_id
            FROM deduped
          ) unique_resources
          GROUP BY record_type
        ) x
      ),

      preview_ranked AS (
        SELECT
          d.*,
          ROW_NUMBER() OVER (
            PARTITION BY d.record_type
            ORDER BY
              d.rank_group,
              d.display_label,
              d.caal_id,
              d.matched_related_display_label
          ) AS rn_by_type,

          ROW_NUMBER() OVER (
            ORDER BY
              d.rank_group,
              d.record_type,
              d.display_label,
              d.caal_id,
              d.matched_related_display_label
          ) AS rn_global
        FROM home_unique_resources d
      ),

      preview AS (
        SELECT *
        FROM preview_ranked
        WHERE
          (
            $2 IN ('home', 'global')
            AND rn_by_type <= 6
          )
          OR
          (
            $2 NOT IN ('home', 'global')
          )
        ORDER BY
          CASE record_type
            WHEN 'monument' THEN 1
            WHEN 'archive' THEN 2
            WHEN 'institution' THEN 3
            WHEN 'dataset' THEN 4
            WHEN 'rs3_poly' THEN 5
            WHEN 'rs3_line' THEN 6
            WHEN 'rs3_group' THEN 7
            WHEN 'vernacular' THEN 8
            ELSE 99
          END,
          rank_group,
          display_label,
          caal_id
      )

      SELECT
        COALESCE(
          jsonb_agg(to_jsonb(preview) - 'rn_by_type' - 'rn_global'),
          '[]'::jsonb
        ) AS records,
        (SELECT total FROM totals) AS total,
        (SELECT totals_by_record_type FROM totals_by_type) AS totals_by_record_type
      FROM preview;
      `,
      [q, context]
    );

    const row = result.rows[0] || {};

    return res.json({
      ok: true,
      query: q,
      context,
      records: Array.isArray(row.records) ? row.records : [],
      total: Number(row.total || 0),
      totals_by_record_type: row.totals_by_record_type || {}
    });
  } catch (error) {
    console.error("Resource search failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Resource search failed",
      detail: error.message
    });
  }
});

module.exports = router;