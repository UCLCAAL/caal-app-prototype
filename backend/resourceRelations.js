// backend/resourceRelations.js

async function getResourceRelations(db, caalId) {
  if (!caalId) return [];

  const result = await db.query(
    `
    WITH q AS (
      SELECT lower(trim($1::text)) AS caal_id_norm
    )

    SELECT
      e.edge_id,
      e.parent_id AS source_caal_id,
      e.child_id AS related_caal_id,
      e.relation_type,
      'forward'::text AS relation_direction,

      e.parent_id_exists AS source_id_exists,
      e.child_id_exists AS related_id_exists,
      e.parent_id_found_in AS source_id_found_in,
      e.child_id_found_in AS related_id_found_in,

      e.validation_status,
      e.edge_status,
      e.source_kinds,
      e.source_tables,
      e.source_fields,
      e.source_row_ids,
      e.source_relation_ids,
      e.created_at,
      e.created_by,
      e.updated_at,
      e.updated_by,
      e.notes
    FROM public."CAAL_Resource_Relations_edges" e, q
    WHERE lower(trim(e.parent_id)) = q.caal_id_norm
      AND COALESCE(e.edge_status, 'active') = 'active'

    UNION ALL

    SELECT
      e.edge_id,
      e.child_id AS source_caal_id,
      e.parent_id AS related_caal_id,
      e.relation_type,
      'reverse'::text AS relation_direction,

      e.child_id_exists AS source_id_exists,
      e.parent_id_exists AS related_id_exists,
      e.child_id_found_in AS source_id_found_in,
      e.parent_id_found_in AS related_id_found_in,

      e.validation_status,
      e.edge_status,
      e.source_kinds,
      e.source_tables,
      e.source_fields,
      e.source_row_ids,
      e.source_relation_ids,
      e.created_at,
      e.created_by,
      e.updated_at,
      e.updated_by,
      e.notes
    FROM public."CAAL_Resource_Relations_edges" e, q
    WHERE lower(trim(e.child_id)) = q.caal_id_norm
      AND COALESCE(e.edge_status, 'active') = 'active'

    ORDER BY relation_type, related_caal_id
    `,
    [caalId]
  );

  return result.rows.map((row) => ({
    edge_id: row.edge_id,
    source_caal_id: row.source_caal_id,
    related_caal_id: row.related_caal_id,
    relation_type: row.relation_type,
    relation_direction: row.relation_direction,
    source_id_exists: row.source_id_exists,
    related_id_exists: row.related_id_exists,
    source_id_found_in: row.source_id_found_in,
    related_id_found_in: row.related_id_found_in,
    validation_status: row.validation_status,
    edge_status: row.edge_status,
    source_kinds: row.source_kinds || [],
    source_tables: row.source_tables || [],
    source_fields: row.source_fields || [],
    source_row_ids: row.source_row_ids || [],
    source_relation_ids: row.source_relation_ids || [],
    created_at: row.created_at,
    created_by: row.created_by,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    notes: row.notes
  }));
}

module.exports = {
  getResourceRelations
};