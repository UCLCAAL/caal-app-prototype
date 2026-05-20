// backend/resourceRelations.js
const {
  getWorkspaceStorage,
  storageFromScope,
  enabledWorkspaceStorageConfigs,
  tableSql
} = require("./workspaceStorage");

function relationStorageFromContext(currentSession, storageScope = null) {
  if (storageScope) {
    const storage = storageFromScope(storageScope);
    if (storage?.schema) return storage;
  }

  return getWorkspaceStorage(currentSession);
}

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

function parseRelationIdList(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[,;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normaliseRelationType(value) {
  return String(value || "").trim().toLowerCase();
}

function workspaceRelationMatchSql() {
  const branches = [];

  enabledWorkspaceStorageConfigs().forEach((storage, index) => {
    const basePriority = index * 20;

    if (storage?.schema && storage?.monumentTable) {
      branches.push(`
        SELECT ${sqlTextLiteral(`${storage.schema}.${storage.monumentTable}`)}::text AS found_in_table,
               ${10 + basePriority} AS priority
        FROM ${tableSql(storage.schema, storage.monumentTable)}, q
        WHERE lower(trim("CAAL_ID")) = q.caal_id_norm
      `);
    }

    if (storage?.schema && storage?.archiveTable) {
      branches.push(`
        SELECT ${sqlTextLiteral(`${storage.schema}.${storage.archiveTable}`)}::text AS found_in_table,
               ${15 + basePriority} AS priority
        FROM ${tableSql(storage.schema, storage.archiveTable)}, q
        WHERE lower(trim("CAAL_ID")) = q.caal_id_norm
      `);
    }
  });

  return branches.length
    ? branches.join("\nUNION ALL\n")
    : `
      SELECT NULL::text AS found_in_table, 999999 AS priority
      WHERE false
    `;
}

function sqlTextLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

async function resolveCaalIdMetadata(db, caalId) {
  if (!caalId) {
    return {
      exists: false,
      foundIn: null
    };
  }

  const workspaceMatchesSql = workspaceRelationMatchSql();

  const result = await db.query(
    `
    WITH q AS (
      SELECT lower(trim($1::text)) AS caal_id_norm
    ),
    matches AS (
      ${workspaceMatchesSql}

      UNION ALL
      SELECT 'public.CAAL_Monuments'::text AS found_in_table, 1000 AS priority
      FROM public."CAAL_Monuments", q
      WHERE lower(trim("CAAL_ID")) = q.caal_id_norm

      UNION ALL
      SELECT 'public.CAAL_Archive', 1010
      FROM public."CAAL_Archive", q
      WHERE lower(trim("CAAL_ID")) = q.caal_id_norm

      UNION ALL
      SELECT 'public.CAAL_Cartography', 1020
      FROM public."CAAL_Cartography", q
      WHERE lower(trim("CAAL_ID")) = q.caal_id_norm

      UNION ALL
      SELECT 'public.CAAL_Datasets', 1030
      FROM public."CAAL_Datasets", q
      WHERE lower(trim("CAAL_ID")) = q.caal_id_norm

      UNION ALL
      SELECT 'public.CAAL_Institution', 1040
      FROM public."CAAL_Institution", q
      WHERE lower(trim("CAAL_ID")) = q.caal_id_norm

      UNION ALL
      SELECT 'public.CAAL_RS3_Group', 1050
      FROM public."CAAL_RS3_Group", q
      WHERE lower(trim("CAAL_ID")) = q.caal_id_norm

      UNION ALL
      SELECT 'public.CAAL_RS3_Line', 1060
      FROM public."CAAL_RS3_Line", q
      WHERE lower(trim("CAAL_ID")) = q.caal_id_norm

      UNION ALL
      SELECT 'public.CAAL_RS3_Poly', 1070
      FROM public."CAAL_RS3_Poly", q
      WHERE lower(trim("CAAL_ID")) = q.caal_id_norm

      UNION ALL
      SELECT 'public.CAAL_Vernacular', 1080
      FROM public."CAAL_Vernacular", q
      WHERE lower(trim("CAAL_ID")) = q.caal_id_norm
    )
    SELECT found_in_table
    FROM matches
    WHERE found_in_table IS NOT NULL
    ORDER BY priority
    LIMIT 1
    `,
    [caalId]
  );

  const foundIn = result.rows[0]?.found_in_table || null;

  return {
    exists: Boolean(foundIn),
    foundIn
  };
}

function relationValidationStatus(parentMeta, childMeta) {
  if (parentMeta.exists && childMeta.exists) {
    return "both_ids_found";
  }

  if (!parentMeta.exists && !childMeta.exists) {
    return "both_ids_missing";
  }

  if (!parentMeta.exists) {
    return "parent_id_missing";
  }

  return "child_id_missing";
}

async function upsertResourceRelationEdge(db, {
  parentId,
  childId,
  relationType,
  sourceTable,
  sourceField,
  sourceRowId,
  currentSession = null,
  username = null,
  note = null
}) {
  const effectiveUsername =
    currentSession?.user?.username ||
    username ||
    "web app";

  const parentMeta = await resolveCaalIdMetadata(db, parentId);
  const childMeta = await resolveCaalIdMetadata(db, childId);
  const validationStatus = relationValidationStatus(parentMeta, childMeta);

  const result = await db.query(
    `
    INSERT INTO public."CAAL_Resource_Relations_edges" (
      parent_id,
      child_id,
      relation_type,

      source_kinds,
      source_tables,
      source_fields,
      source_row_ids,
      source_parent_ids,
      source_child_ids,
      source_relation_types,
      source_recorders,
      source_timestamps,

      parent_id_exists,
      child_id_exists,
      parent_id_found_in,
      child_id_found_in,
      validation_status,

      edge_status,
      created_at,
      created_by,
      updated_at,
      updated_by,
      notes
    )
    VALUES (
      $1,
      $2,
      $3,

      ARRAY['web_edit']::text[],
      ARRAY[$4]::text[],
      ARRAY[$5]::text[],
      ARRAY[$6]::text[],
      ARRAY[$1]::text[],
      ARRAY[$2]::text[],
      ARRAY[$3]::text[],
      ARRAY[$7]::text[],
      ARRAY[now()::text]::text[],

      $8,
      $9,
      $10,
      $11,
      $12,

      'active',
      now(),
      $7,
      now(),
      $7,
      $13
    )
    ON CONFLICT (edge_key_a, edge_key_b, relation_type_norm)
    DO UPDATE SET
      edge_status = 'active',

      source_kinds = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(
            COALESCE(public."CAAL_Resource_Relations_edges".source_kinds, ARRAY[]::text[])
            || EXCLUDED.source_kinds
          ) AS x
          WHERE x IS NOT NULL
          ORDER BY x
        )
      ),

      source_tables = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(
            COALESCE(public."CAAL_Resource_Relations_edges".source_tables, ARRAY[]::text[])
            || EXCLUDED.source_tables
          ) AS x
          WHERE x IS NOT NULL
          ORDER BY x
        )
      ),

      source_fields = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(
            COALESCE(public."CAAL_Resource_Relations_edges".source_fields, ARRAY[]::text[])
            || EXCLUDED.source_fields
          ) AS x
          WHERE x IS NOT NULL
          ORDER BY x
        )
      ),

      source_row_ids = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(
            COALESCE(public."CAAL_Resource_Relations_edges".source_row_ids, ARRAY[]::text[])
            || EXCLUDED.source_row_ids
          ) AS x
          WHERE x IS NOT NULL
          ORDER BY x
        )
      ),

      source_parent_ids = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(
            COALESCE(public."CAAL_Resource_Relations_edges".source_parent_ids, ARRAY[]::text[])
            || EXCLUDED.source_parent_ids
          ) AS x
          WHERE x IS NOT NULL
          ORDER BY x
        )
      ),

      source_child_ids = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(
            COALESCE(public."CAAL_Resource_Relations_edges".source_child_ids, ARRAY[]::text[])
            || EXCLUDED.source_child_ids
          ) AS x
          WHERE x IS NOT NULL
          ORDER BY x
        )
      ),

      source_relation_types = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(
            COALESCE(public."CAAL_Resource_Relations_edges".source_relation_types, ARRAY[]::text[])
            || EXCLUDED.source_relation_types
          ) AS x
          WHERE x IS NOT NULL
          ORDER BY x
        )
      ),

      source_recorders = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(
            COALESCE(public."CAAL_Resource_Relations_edges".source_recorders, ARRAY[]::text[])
            || EXCLUDED.source_recorders
          ) AS x
          WHERE x IS NOT NULL
          ORDER BY x
        )
      ),

      source_timestamps = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(
            COALESCE(public."CAAL_Resource_Relations_edges".source_timestamps, ARRAY[]::text[])
            || EXCLUDED.source_timestamps
          ) AS x
          WHERE x IS NOT NULL
          ORDER BY x
        )
      ),

      parent_id_exists = EXCLUDED.parent_id_exists,
      child_id_exists = EXCLUDED.child_id_exists,
      parent_id_found_in = EXCLUDED.parent_id_found_in,
      child_id_found_in = EXCLUDED.child_id_found_in,
      validation_status = EXCLUDED.validation_status,

      updated_at = now(),
      updated_by = EXCLUDED.updated_by,
      notes = COALESCE(public."CAAL_Resource_Relations_edges".notes, EXCLUDED.notes)

    RETURNING edge_id
    `,
    [
      parentId,
      childId,
      relationType,
      sourceTable,
      sourceField,
      String(sourceRowId),
      effectiveUsername,
      parentMeta.exists,
      childMeta.exists,
      parentMeta.foundIn,
      childMeta.foundIn,
      validationStatus,
      note || `Created or updated from ${sourceTable}:${sourceRowId}:${sourceField}`
    ]
  );

  return result.rows[0]?.edge_id ?? null;
}

async function logResourceRelationEdit(db, {
  edgeId = null,
  parentId,
  childId,
  relationType,
  action,
  currentSession = null,
  username = null,
  sourceTable = null,
  sourceField = null,
  sourceRowId = null,
  oldValues = null,
  newValues = null,
  note = null
}) {
  await db.query(
    `
    INSERT INTO public."CAAL_Resource_Relations_web_edit_log" (
      edge_id,
      parent_id,
      child_id,
      relation_type,
      action,
      edited_by_app_user_id,
      edited_by_username,
      source_table,
      source_field,
      source_row_id,
      old_values,
      new_values,
      note
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7,
      $8, $9, $10,
      $11::jsonb, $12::jsonb, $13
    )
    `,
    [
      edgeId,
      parentId,
      childId,
      relationType,
      action,
      currentSession?.user?.user_id ?? null,
      currentSession?.user?.username ?? username ?? null,
      sourceTable,
      sourceField,
      sourceRowId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      note
    ]
  );
}

async function syncResourceRelationsForMonument(db, {
  caalId,
  sourceRowId,
  payload,
  currentSession = null,
  username = null,
  storageScope = null
}) {
  if (!caalId || !sourceRowId || !payload) return;

  const effectiveUsername = currentSession?.user?.username ||
    username ||
    "web app";

  const ws = relationStorageFromContext(currentSession, storageScope);
  const sourceTable = `${ws.schema}.CAAL_Monuments`;

  const relationFields = [
    {
      field: "Monument is part of",
      relationType: "is part of"
    },
    {
      field: "Monument contains",
      relationType: "contains / is contained within"
    },
    {
      field: "Monument is associated with",
      relationType: "is related to"
    }
  ];

  for (const config of relationFields) {
    if (!Object.prototype.hasOwnProperty.call(payload, config.field)) {
      continue;
    }

    const relatedIds = parseRelationIdList(payload[config.field]);

    for (const relatedId of relatedIds) {
      await upsertResourceRelationEdge(db, {
        parentId: caalId,
        childId: relatedId,
        relationType: config.relationType,
        sourceTable,
        sourceField: config.field,
        sourceRowId,
        currentSession,
        username,
        note: `Created or updated from ${sourceTable}:${sourceRowId}:${config.field}`
      });
    }

    /*
      Conservative deactivation:
      Only deactivate web-edit edges from this exact record field where the
      related ID has been removed. This avoids deactivating relations that also
      came from the old batch import or another source.
    */
    const normalisedCurrentRelatedIds = relatedIds.map((id) =>
      id.toLowerCase().trim()
    );

    const deactivateResult = await db.query(
      `
      UPDATE public."CAAL_Resource_Relations_edges" e
      SET
        edge_status = 'inactive',
        updated_at = now(),
        updated_by = $3,
        notes = COALESCE(e.notes, '') || E'\nDeactivated by web edit sync because source field no longer lists this ID.'
      WHERE COALESCE(e.edge_status, 'active') = 'active'
      AND e.source_tables @> ARRAY[$5]::text[]
      AND e.source_fields @> ARRAY[$6]::text[]
      AND e.source_row_ids @> ARRAY[$7]::text[]
        AND e.relation_type_norm = $2
        AND (
          lower(trim(e.parent_id)) = lower(trim($1))
          OR lower(trim(e.child_id)) = lower(trim($1))
        )
        AND lower(trim(
          CASE
            WHEN lower(trim(e.parent_id)) = lower(trim($1))
              THEN e.child_id
            ELSE e.parent_id
          END
        )) <> ALL($4::text[])
      RETURNING
        e.edge_id,
        e.parent_id,
        e.child_id,
        e.relation_type,
        e.source_kinds,
        e.source_tables,
        e.source_fields,
        e.source_row_ids,
        e.validation_status,
        e.edge_status,
        e.updated_at,
        e.updated_by,
        e.notes
      `,
      [
        caalId,
        normaliseRelationType(config.relationType),
        effectiveUsername,
        normalisedCurrentRelatedIds,
        sourceTable,
        config.field,
        String(sourceRowId)
      ]
    );

    for (const row of deactivateResult.rows) {
      await logResourceRelationEdit(db, {
        edgeId: row.edge_id,
        parentId: row.parent_id,
        childId: row.child_id,
        relationType: row.relation_type,
        action: "deactivated",
        username,
        sourceTable,
        sourceField: config.field,
        sourceRowId: String(sourceRowId),
        oldValues: {
          parent_id: row.parent_id,
          child_id: row.child_id,
          relation_type: row.relation_type,
          source_kinds: row.source_kinds,
          source_tables: row.source_tables,
          source_fields: row.source_fields,
          source_row_ids: row.source_row_ids,
          validation_status: row.validation_status
        },
        newValues: {
          edge_status: "inactive"
        },
        note: `Deactivated because ${config.field} no longer lists this related ID.`
      });
    }
  }
}

async function syncResourceRelationsForArchive(db, {
  caalId,
  sourceRowId,
  payload,
  currentSession = null,
  storageScope = null
}) {
  if (!caalId || !sourceRowId || !payload) return;

  const ws = relationStorageFromContext(currentSession, storageScope);
  const sourceTable = `${ws.schema}.CAAL_Archive`;
  const sourceField = "Associated CAAL_ID";
  const relationType = "is related to";

  if (!Object.prototype.hasOwnProperty.call(payload, sourceField)) {
    return;
  }

  const relatedIds = parseRelationIdList(payload[sourceField]);

  for (const relatedId of relatedIds) {
    const edgeId = await upsertResourceRelationEdge(db, {
      parentId: caalId,
      childId: relatedId,
      relationType,
      sourceTable,
      sourceField,
      sourceRowId,
      currentSession,
      note: `Created or updated from ${sourceTable}:${sourceRowId}:${sourceField}`
    });

    await logResourceRelationEdit(db, {
      edgeId,
      parentId: caalId,
      childId: relatedId,
      relationType,
      action: "upserted",
      currentSession,
      sourceTable,
      sourceField,
      sourceRowId: String(sourceRowId),
      newValues: {
        parent_id: caalId,
        child_id: relatedId,
        relation_type: relationType
      },
      note: `Archive relation synced from ${sourceField}`
    });
  }

  const normalisedCurrentRelatedIds = relatedIds.map((id) =>
    id.toLowerCase().trim()
  );

  const deactivateResult = await db.query(
    `
    UPDATE public."CAAL_Resource_Relations_edges" e
    SET
      edge_status = 'inactive',
      updated_at = now(),
      updated_by = $3,
      notes = COALESCE(e.notes, '') || E'\nDeactivated by web edit sync because source field no longer lists this ID.'
    WHERE COALESCE(e.edge_status, 'active') = 'active'
      AND e.source_tables @> ARRAY[$5]::text[]
      AND e.source_fields @> ARRAY[$6]::text[]
      AND e.source_row_ids @> ARRAY[$7]::text[]
      AND e.relation_type_norm = $2
      AND (
        lower(trim(e.parent_id)) = lower(trim($1))
        OR lower(trim(e.child_id)) = lower(trim($1))
      )
      AND lower(trim(
        CASE
          WHEN lower(trim(e.parent_id)) = lower(trim($1))
            THEN e.child_id
          ELSE e.parent_id
        END
      )) <> ALL($4::text[])
    RETURNING
      e.edge_id,
      e.parent_id,
      e.child_id,
      e.relation_type
    `,
    [
    caalId,
    normaliseRelationType(relationType),
    currentSession?.user?.username ?? "web app",
    normalisedCurrentRelatedIds,
    sourceTable,
    sourceField,
    String(sourceRowId)
  ]
  );

  for (const row of deactivateResult.rows) {
    await logResourceRelationEdit(db, {
      edgeId: row.edge_id,
      parentId: row.parent_id,
      childId: row.child_id,
      relationType: row.relation_type,
      action: "deactivated",
      currentSession,
      sourceTable,
      sourceField,
      sourceRowId: String(sourceRowId),
      oldValues: row,
      newValues: {
        edge_status: "inactive"
      },
      note: "Deactivated because Associated CAAL_ID no longer lists this related ID."
    });
  }
}

async function deactivateResourceRelationsForDeletedRecord(db, {
  caalId,
  currentSession = null,
  username = null,
  note = null
}) {
  if (!caalId) return;

  const effectiveUsername =
    currentSession?.user?.username ||
    username ||
    "web app";

  const result = await db.query(
    `
    UPDATE public."CAAL_Resource_Relations_edges" e
    SET
      edge_status = 'inactive',
      updated_at = now(),
      updated_by = $2,
      notes = COALESCE(e.notes, '') || E'\nDeactivated because related resource was deleted.'
    WHERE COALESCE(e.edge_status, 'active') = 'active'
      AND (
        lower(trim(e.parent_id)) = lower(trim($1))
        OR lower(trim(e.child_id)) = lower(trim($1))
      )
    RETURNING
      e.edge_id,
      e.parent_id,
      e.child_id,
      e.relation_type,
      e.source_kinds,
      e.source_tables,
      e.source_fields,
      e.source_row_ids,
      e.validation_status,
      e.edge_status,
      e.updated_at,
      e.updated_by,
      e.notes
    `,
    [caalId, effectiveUsername]
  );

  for (const row of result.rows) {
    await logResourceRelationEdit(db, {
      edgeId: row.edge_id,
      parentId: row.parent_id,
      childId: row.child_id,
      relationType: row.relation_type,
      action: "deactivated",
      currentSession,
      username: effectiveUsername,
      oldValues: {
        parent_id: row.parent_id,
        child_id: row.child_id,
        relation_type: row.relation_type,
        source_kinds: row.source_kinds,
        source_tables: row.source_tables,
        source_fields: row.source_fields,
        source_row_ids: row.source_row_ids,
        validation_status: row.validation_status
      },
      newValues: {
        edge_status: "inactive"
      },
      note: note || `Deactivated because ${caalId} was deleted.`
    });
  }
}

module.exports = {
  getResourceRelations,
  syncResourceRelationsForMonument,
  syncResourceRelationsForArchive,
  deactivateResourceRelationsForDeletedRecord
};