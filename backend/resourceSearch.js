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

  if (["archive", "monuments", "home"].includes(context)) {
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
          caal_id,
          COALESCE(matched_related_caal_id, '')
        )
          *
        FROM combined
        ORDER BY
          match_type,
          caal_id,
          COALESCE(matched_related_caal_id, ''),
          rank_group,
          display_label
      )

      SELECT *
      FROM deduped
      ORDER BY
        rank_group,
        record_type,
        display_label,
        matched_related_display_label
      LIMIT $3
      `,
      [q, context, limit]
    );

    return res.json({
      ok: true,
      query: q,
      context,
      records: result.rows
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