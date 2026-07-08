// ========================================================
// RESOURCE VIEWER ROUTES
// Read-only multi-layer viewer:
// - RS3 polygons
// - RS3 lines
// - RS3 groups
// - institutions
// - vernacular
// ========================================================

const express = require("express");
const pool = require("./db");

const {
  getSessionWorkspaceCode
} = require("./workspaceStorage");

const router = express.Router();

// ========================================================
// CONFIG
// ========================================================

const VIEWER_BASE_MV = "ui.mv_resource_viewer_base";

const VIEWER_LAYER_MVS = {
  rs3_poly: "ui.mv_resource_viewer_rs3_poly_map",
  rs3_line: "ui.mv_resource_viewer_rs3_line_map",
  rs3_group: "ui.mv_resource_viewer_rs3_group_map",
  institution: "ui.mv_resource_viewer_institution_map",
  vernacular: "ui.mv_resource_viewer_vernacular_map",
  survey_grid_region: "ui.mv_resource_viewer_survey_grid_region_map",
  survey_grid: "ui.mv_resource_viewer_survey_grid_map"
};

const VIEWER_RAW_TABLES = {
  "public.CAAL_RS3_Poly": 'public."CAAL_RS3_Poly"',
  "public.CAAL_RS3_Line": 'public."CAAL_RS3_Line"',
  "public.CAAL_RS3_Group": 'public."CAAL_RS3_Group"',
  "public.CAAL_Institution": 'public."CAAL_Institution"',
  "public.CAAL_Vernacular": 'public."CAAL_Vernacular"',
  "public.caal_grid": "ui.v_caal_grid_survey_status",

  "kz.CAAL_RS3_Poly": 'kz."CAAL_RS3_Poly"',
  "kz.CAAL_RS3_Line": 'kz."CAAL_RS3_Line"',
  "kz.CAAL_RS3_Group": 'kz."CAAL_RS3_Group"',
  "kz.CAAL_Institution": 'kz."CAAL_Institution"',
  "kz.CAAL_Vernacular": 'kz."CAAL_Vernacular"'
};

const ALLOWED_RECORD_TYPES = new Set([
  "rs3_poly",
  "rs3_line",
  "rs3_group",
  "institution",
  "vernacular",
  "monument",
  "archive"
]);

const ALLOWED_VIEWER_LAYER_TYPES = new Set([
  ...ALLOWED_RECORD_TYPES,
  "survey_grid_region",
  "survey_grid",
  "admin_boundary"
]);

const ALLOWED_SCOPES = new Set([
  "workspace",
  "national_ref",
  "all_caal"
]);

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

const VIEWER_REFERENCE_LAYER_CONFIG = {
  survey_grid: {
    mv: "ui.mv_resource_viewer_survey_grid_map",
    geomColumn: "geom_4326",
    propsSql: `
      v.survey_status,
      v.site_count,
      v.checked,
      NULL::integer AS grid_cell_count,
      NULL::integer AS checked_cell_count,
      NULL::text AS boundary_id,
      NULL::integer AS admin_level,
      NULL::text AS boundary_name
    `,
    props: ["survey_status", "site_count", "checked",
            "grid_cell_count", "checked_cell_count"]
  },

  survey_grid_region: {
    mv: "ui.mv_resource_viewer_survey_grid_region_map",
    geomColumn: "geom_4326",
    propsSql: `
      v.survey_status,
      v.site_count,
      NULL::boolean AS checked,
      v.grid_cell_count,
      v.checked_cell_count,
      NULL::text AS boundary_id,
      NULL::integer AS admin_level,
      NULL::text AS boundary_name
    `,
    props: ["survey_status", "site_count", "checked",
            "grid_cell_count", "checked_cell_count"]
  },

  admin_boundary: {
    mv: "ui.mv_admin_boundaries_map",
    geomColumn: "geom",
    propsSql: `
      NULL::text AS survey_status,
      NULL::integer AS site_count,
      NULL::boolean AS checked,
      NULL::integer AS grid_cell_count,
      NULL::integer AS checked_cell_count,
      v.boundary_id::text AS boundary_id,
      v.admin_level,
      v.admin_name AS admin_name        -- display column
    `,
    props: ["boundary_id", "admin_level", "admin_name"]
  }
};

const VIEWER_REFERENCE_LAYERS = new Set(
  Object.keys(VIEWER_REFERENCE_LAYER_CONFIG)
);

function requestedViewerLayerTypes(req) {
  const raw =
    parseCsvParam(req.query.layers).length
      ? parseCsvParam(req.query.layers)
      : parseCsvParam(req.query.recordTypes);

  const types = raw.length
    ? raw
    : Array.from(ALLOWED_RECORD_TYPES);

  return unique(types).filter((type) => ALLOWED_VIEWER_LAYER_TYPES.has(type));
}

async function loadReferenceLayer(recordType, req) {
  const config = VIEWER_REFERENCE_LAYER_CONFIG[recordType];
  if (!config) return emptyFeatureCollection();

  const simplifyTolerance = mapSimplifyToleranceForZoom(req.query.zoom);
  const g = config.geomColumn;

  const result = await pool.query(
    `
    SELECT
      '${recordType}'::text AS record_type,
      ${config.propsSql},
      CASE
        WHEN $1::double precision > 0
          AND GeometryType(v.${g}) IN
              ('MULTIPOLYGON', 'POLYGON', 'MULTILINESTRING', 'LINESTRING')
        THEN ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(v.${g}, $1::double precision)
        )::json
        ELSE ST_AsGeoJSON(v.${g})::json
      END AS geometry
    FROM ${sqlIdentFromSafeMv(config.mv)} v
    WHERE v.${g} IS NOT NULL
    `,
    [simplifyTolerance]
  );

  return {
    type: "FeatureCollection",
    features: result.rows
      .filter((row) => row.geometry)
      .map((row) => {
        const properties = { record_type: row.record_type };
        config.props.forEach((p) => { properties[p] = row[p]; });
        return { type: "Feature", geometry: row.geometry, properties };
      })
  };
}

// ========================================================
// SESSION / PARAM HELPERS
// ========================================================

function currentSession(req) {
  return req.session?.appSession || null;
}

function requireSession(req, res) {
  const session = currentSession(req);

  if (!session) {
    res.status(401).json({
      ok: false,
      error: "No active session"
    });
    return null;
  }

  return session;
}

function currentAppUserIdFromSession(session) {
  const value = session?.user?.user_id ?? null;
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

function isCaalWorkspace(session) {
  return getSessionWorkspaceCode(session) === "caal";
}

function parseCsvParam(value) {
  if (!value) return [];

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

function parseLimit(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .replace(/[-‐-‒–—]+/g, " ")
    .toLowerCase();
}

function parseBboxParam(bboxParam) {
  if (!bboxParam) return null;

  const parts = String(bboxParam)
    .split(",")
    .map((value) => Number(value.trim()));

  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [minLng, minLat, maxLng, maxLat] = parts;

  return {
    minLng,
    minLat,
    maxLng,
    maxLat
  };
}

const ALLOWED_VIEWER_LANGS = new Set([
  "en", "ru", "zh", "kk", "ky", "tg", "tk", "uz"
]);

function safeViewerLang(lang) {
  const value = String(lang || "en").trim().toLowerCase();
  return ALLOWED_VIEWER_LANGS.has(value) ? value : "en";
}

function fallbackViewerLang(lang) {
  return ["kk", "ky", "tg", "tk", "uz"].includes(lang) ? "ru" : "en";
}

function viewerLangFromReq(req, session) {
  return safeViewerLang(
    req.query.lang ||
    session?.profile?.preferred_language ||
    "en"
  );
}

function parseAdminBoundaryId(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

function allowedScopesForSession(session) {
  const scopes = [];

  if (session?.permissions?.can_view_workspace) {
    scopes.push("workspace");
    scopes.push("national_ref");
  }

  if (session?.permissions?.can_view_all_caal) {
    scopes.push("all_caal");
  }

  /*
    Defensive fallback for early testing. Remove later if all sessions reliably
    carry can_view_workspace / can_view_all_caal.
  */
  if (!scopes.length) {
    if (isCaalWorkspace(session)) {
      scopes.push("all_caal");
    } else {
      scopes.push("workspace");
      scopes.push("national_ref");
    }
  }

  return unique(scopes);
}

function requestedScopes(req, session) {
  const requested = parseCsvParam(req.query.scopes);

  const defaults = isCaalWorkspace(session)
    ? ["all_caal"]
    : ["workspace", "national_ref"];

  const rawScopes = requested.length ? requested : defaults;
  const allowed = new Set(allowedScopesForSession(session));

  return unique(rawScopes)
    .filter((scope) => ALLOWED_SCOPES.has(scope))
    .filter((scope) => allowed.has(scope));
}

function requestedRecordTypes(req) {
  const raw =
    parseCsvParam(req.query.recordTypes).length
      ? parseCsvParam(req.query.recordTypes)
      : parseCsvParam(req.query.layers);

  const types = raw.length
    ? raw
    : Array.from(ALLOWED_RECORD_TYPES);

  return unique(types).filter((type) => ALLOWED_RECORD_TYPES.has(type));
}

function surveyMapExtraSelectSql(recordType) {
  if (recordType === "survey_grid") {
    return `
      v.survey_status,
      v.site_count,
      v.checked,
      NULL::integer AS grid_cell_count,
      NULL::integer AS checked_cell_count
    `;
  }

  if (recordType === "survey_grid_region") {
    return `
      v.survey_status,
      v.site_count,
      NULL::boolean AS checked,
      v.grid_cell_count,
      v.checked_cell_count
    `;
  }

  return `
    NULL::text AS survey_status,
    NULL::integer AS site_count,
    NULL::boolean AS checked,
    NULL::integer AS grid_cell_count,
    NULL::integer AS checked_cell_count
  `;
}

function sqlIdentFromSafeMv(mvName) {
  /*
    All MV names are internal constants from VIEWER_LAYER_MVS.
    This is only here to keep dynamic SQL readable.
  */
  return mvName;
}


async function loadViewerRelationsForCaalId(caalId) {
  const id = String(caalId || "").trim();

  if (!id) return [];

  const result = await pool.query(
    `
    SELECT
      edge_id,
      relation_type,
      relation_type_norm,
      relation_direction,

      related_record_type,
      related_dataset_label,
      related_caal_id,
      related_display_label,
      related_source_schema,
      related_source_table,
      related_source_row_id,

      related_found_in_table_norm,
      related_name_blob,

      CASE
        WHEN related_source_row_id IS NOT NULL THEN true
        ELSE false
      END AS related_id_exists
    FROM ui.mv_resource_related_search
    WHERE lower(trim(returned_caal_id)) = lower(trim($1))
    ORDER BY
      related_record_type,
      related_display_label NULLS LAST,
      related_caal_id,
      relation_type
    `,
    [id]
  );

  return result.rows.map((row) => ({
    edge_id: row.edge_id,
    relation_type: row.relation_type,
    relation_type_norm: row.relation_type_norm,
    relation_direction: row.relation_direction,

    related_record_type: row.related_record_type,
    related_dataset_label: row.related_dataset_label,
    related_caal_id: row.related_caal_id,
    related_display_label: row.related_display_label,
    related_source_schema: row.related_source_schema,
    related_source_table: row.related_source_table,
    related_source_row_id: row.related_source_row_id,

    related_id_found_in: row.related_source_table,
    related_id_found_in_norm: row.related_found_in_table_norm,
    related_id_exists: row.related_id_exists,

    related_name_blob: row.related_name_blob
  }));
}

// ========================================================
// SOURCE SCOPE SQL
// ========================================================

function sourceScopeCaseSql(workspaceCodeParam = "$1", tableAlias = "") {
  const p = tableAlias ? `${tableAlias}.` : "";

  return `
    CASE
      WHEN ${p}source_schema = ${workspaceCodeParam} THEN 'workspace'

      WHEN ${workspaceCodeParam} <> 'caal'
           AND ${p}source_schema = 'public'
           AND ${p}assigned_workspace_code = ${workspaceCodeParam}
        THEN 'national_ref'

      ELSE 'all_caal'
    END
  `;
}

function storageScopeCaseSql(alias) {
  const p = alias ? `${alias}.` : "";

  return `
    CASE
      WHEN ${p}source_schema = 'public' THEN 'public_caal'
      ELSE ${p}source_schema || '_workspace'
    END
  `;
}

function viewerMvLangValueSql(alias, baseName, rawSql, lang = "en") {
  const p = alias ? `${alias}.` : "";
  const safeLang = safeViewerLang(lang);
  const fallbackLang = fallbackViewerLang(safeLang);

  return `
    COALESCE(
      ${p}${baseName}_${safeLang},
      ${p}${baseName}_${fallbackLang},
      ${p}${baseName}_en,
      ${rawSql}
    )
  `;
}

function viewerDisplayJsonSql(alias = "v", lang = "en") {
  const p = alias ? `${alias}.` : "";

  return `
    jsonb_strip_nulls(jsonb_build_object(
      'Country', ${viewerMvLangValueSql(alias, "filter_country", `${p}filter_country`, lang)},

      'Monument type1', ${viewerMvLangValueSql(alias, "list_monument_type1", `${p}list_monument_type1`, lang)},
      'Monument type2', ${viewerMvLangValueSql(alias, "list_monument_type2", `${p}list_monument_type2`, lang)},
      'Monument type3', ${viewerMvLangValueSql(alias, "list_monument_type3", `${p}list_monument_type3`, lang)},
      'Monument type4', ${viewerMvLangValueSql(alias, "list_monument_type4", `${p}list_monument_type4`, lang)},

      'Monument type 1', ${viewerMvLangValueSql(alias, "list_monument_type1", `${p}list_monument_type1`, lang)},
      'Monument type 2', ${viewerMvLangValueSql(alias, "list_monument_type2", `${p}list_monument_type2`, lang)},
      'Monument type 3', ${viewerMvLangValueSql(alias, "list_monument_type3", `${p}list_monument_type3`, lang)},
      'Monument type 4', ${viewerMvLangValueSql(alias, "list_monument_type4", `${p}list_monument_type4`, lang)}
    ))
  `;
}

function viewerCanonicalJsonSql(alias = "v") {
  const p = alias ? `${alias}.` : "";

  return `
    jsonb_strip_nulls(jsonb_build_object(
      'Country', ${p}filter_country_canonical,
      'Monument type1', ${p}list_monument_type1_concept_id,
      'Monument type2', ${p}list_monument_type2_concept_id,
      'Monument type3', ${p}list_monument_type3_concept_id,
      'Monument type4', ${p}list_monument_type4_concept_id
    ))
  `;
}

function viewerMonumentTypePathDisplaySql(alias = "v", lang = "en") {
  const p = alias ? `${alias}.` : "";

  return `
    ARRAY_REMOVE(ARRAY[
      ${viewerMvLangValueSql(alias, "list_monument_type1", `${p}list_monument_type1`, lang)},
      ${viewerMvLangValueSql(alias, "list_monument_type2", `${p}list_monument_type2`, lang)},
      ${viewerMvLangValueSql(alias, "list_monument_type3", `${p}list_monument_type3`, lang)},
      ${viewerMvLangValueSql(alias, "list_monument_type4", `${p}list_monument_type4`, lang)}
    ], NULL)::text[]
  `;
}

function viewerMonumentTypeConceptPathSql(alias = "v") {
  const p = alias ? `${alias}.` : "";

  return `
    ARRAY_REMOVE(ARRAY[
      ${p}list_monument_type1_concept_id,
      ${p}list_monument_type2_concept_id,
      ${p}list_monument_type3_concept_id,
      ${p}list_monument_type4_concept_id
    ], NULL)::text[]
  `;
}

function monumentTypeDescendantFilterSql(columnSql, paramSql) {
  return `
    (
      ${columnSql} && (
        WITH RECURSIVE selected_tree AS (
          SELECT concept_id
          FROM ui.v_lkp_site_types_context
          WHERE concept_id = ANY(${paramSql}::text[])

          UNION

          SELECT child.concept_id
          FROM ui.v_lkp_site_types_context child
          JOIN selected_tree parent
            ON child.parent_id = parent.concept_id
        )
        SELECT COALESCE(array_agg(concept_id), ARRAY[]::text[])
        FROM selected_tree
      )
    )
  `;
}

function isEditableSql(workspaceCodeParam = "$1", tableAlias = "") {
  const p = tableAlias ? `${tableAlias}.` : "";

  return `
    CASE
      WHEN ${p}source_schema = ${workspaceCodeParam} THEN true

      WHEN ${workspaceCodeParam} <> 'caal'
           AND ${p}source_schema = 'public'
           AND ${p}assigned_workspace_code = ${workspaceCodeParam}
        THEN true

      ELSE false
    END
  `;
}

function parseIntCsvParam(value) {
  return parseCsvParam(value)
    .map((item) => Number(item))
    .filter((number) => Number.isInteger(number));
}

function parseOptionalInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

// ========================================================
// FILTER SQL BUILDERS
// ========================================================

function buildViewerWhereSql({
  req,
  session,
  baseParamIndex = 1,
  tableAlias = "v"
}) {
  const values = [];
  const clauses = [];
  let index = baseParamIndex;

  const p = tableAlias ? `${tableAlias}.` : "";

  const workspaceCode = getSessionWorkspaceCode(session) || "caal";
  values.push(workspaceCode);
  index += 1;

  const scopes = requestedScopes(req, session);
  const recordTypes = requestedRecordTypes(req);

  if (!scopes.length) {
    clauses.push("false");
  } else {
    clauses.push(`${sourceScopeCaseSql("$1", tableAlias)} = ANY($${index}::text[])`);
    values.push(scopes);
    index += 1;
  }

  if (recordTypes.length) {
    clauses.push(`${p}record_type = ANY($${index}::text[])`);
    values.push(recordTypes);
    index += 1;
  }

  const rawText = String(req.query.text || req.query.q || "").trim();
  const text = normalizeSearchText(rawText);

  if (text) {
    clauses.push(`
      (
        ${p}search_blob ILIKE $${index}
        OR ${p}caal_id ILIKE $${index + 1}
        OR ${p}display_label ILIKE $${index + 1}
      )
    `);

  values.push(`%${text}%`);
  values.push(`%${rawText}%`);
  index += 2;
}

  const caalId = String(req.query.caalId || req.query.caal_id || "").trim();

  if (caalId) {
    clauses.push(`${p}caal_id ILIKE $${index}`);
    values.push(`%${caalId}%`);
    index += 1;
  }

  const countries = parseCsvParam(req.query.countries);

  if (countries.length) {
    clauses.push(`COALESCE(${p}filter_country_canonical, ${p}filter_country) = ANY($${index}::text[])`);
    values.push(countries);
    index += 1;
  }

  const monumentTypes = parseCsvParam(req.query.monumentTypes);

  if (monumentTypes.length) {
    clauses.push(`
      (
        ${monumentTypeDescendantFilterSql(`${p}filter_monument_type_concept_ids`, `$${index}`)}
        OR ${p}filter_monument_types && $${index}::text[]
      )
    `);
    values.push(monumentTypes);
    index += 1;
  }

  const conditionLevels = parseIntCsvParam(req.query.condition);

  if (conditionLevels.length) {
    clauses.push(`${p}filter_condition_levels && $${index}::int[]`);
    values.push(conditionLevels);
    index += 1;
  }

  const deteriorationCauses = parseCsvParam(req.query.deteriorationCause);

  if (deteriorationCauses.length) {
    clauses.push(`${p}filter_deterioration_causes && $${index}::text[]`);
    values.push(deteriorationCauses);
    index += 1;
  }

  const riskTypes = parseCsvParam(req.query.riskType);
  const riskMin = parseOptionalInteger(req.query.riskMin);

  if (riskTypes.length) {
    const effectiveRiskMin = riskMin ?? 2;

    clauses.push(`
      EXISTS (
        SELECT 1
        FROM jsonb_each_text(${p}filter_risk_levels) AS risk(key, value)
        WHERE risk.key = ANY($${index}::text[])
          AND CASE
                WHEN btrim(risk.value) ~ '^-?\\d+$'
                THEN btrim(risk.value)::int
                ELSE NULL
              END >= $${index + 1}::int
      )
    `);

    values.push(riskTypes, effectiveRiskMin);
    index += 2;
  } else if (riskMin !== null) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM jsonb_each_text(${p}filter_risk_levels) AS risk(key, value)
        WHERE CASE
                WHEN btrim(risk.value) ~ '^-?\\d+$'
                THEN btrim(risk.value)::int
                ELSE NULL
              END >= $${index}::int
      )
    `);

    values.push(riskMin);
    index += 1;
  }

  const bbox = parseBboxParam(req.query.bbox);

  if (bbox) {
    clauses.push(`
      ${p}geom_4326 && ST_MakeEnvelope(
        $${index},
        $${index + 1},
        $${index + 2},
        $${index + 3},
        4326
      )
    `);

    values.push(
      bbox.minLng,
      bbox.minLat,
      bbox.maxLng,
      bbox.maxLat
    );

    index += 4;
  }

  const boundaryId = parseAdminBoundaryId(req.query.adminBoundaryId);

  if (boundaryId) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM ui.mv_admin_boundaries_map b
        WHERE b.boundary_id = $${index}
          AND ST_Intersects(${p}geom_4326, b.geom)
      )
    `);

    values.push(boundaryId);
    index += 1;
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
    nextParamIndex: index,
    scopes,
    recordTypes
  };
}

function mapSimplifyToleranceForZoom(zoomValue) {
  const zoom = Number(zoomValue || 0);

  if (!Number.isFinite(zoom)) return 0.02;

  if (zoom < 4) return 0.08;
  if (zoom < 6) return 0.035;
  if (zoom < 8) return 0.015;
  if (zoom < 10) return 0.006;

  return 0;
}

// ========================================================
// RECORD BUILDERS
// ========================================================

function buildViewerRecord(row) {
  return {
    identity: {
      id: row.source_row_id,
      caal_id: row.caal_id,
      record_type: row.record_type,
      dataset_label: row.dataset_label
    },

    summary: {
      display_label: row.display_label,
      source_schema: row.source_schema,
      source_table: row.source_table,
      source_scope: row.source_scope,
      storage_scope: row.storage_scope,
      monument_type_path: row.monument_type_path || [],
      monument_type_concept_path: row.monument_type_concept_path || [],
      monument_type_leaf:
        Array.isArray(row.monument_type_path) && row.monument_type_path.length
          ? row.monument_type_path[row.monument_type_path.length - 1]
          : null,
      monument_type_concept_leaf:
        Array.isArray(row.monument_type_concept_path) && row.monument_type_concept_path.length
          ? row.monument_type_concept_path[row.monument_type_concept_path.length - 1]
          : null
    },

    source: {
      schema: row.source_schema,
      table: row.source_table,
      row_id: row.source_row_id,
      scope: row.source_scope,
      storage: row.storage_scope,
      is_editable: row.is_editable === true || row.is_editable === "true"
    },

    geometry: row.geometry || null,

    raw: row.raw || null,
    display: row.display || {},
    canonical: row.canonical || {},

    relation_summary: row.relation_summary || {
      count: 0,
      items: []
    },

    relations: Array.isArray(row.relations) ? row.relations : []
  };
}

function buildMapFeature(row) {
  const monumentTypePath = Array.isArray(row.monument_type_path)
    ? row.monument_type_path.filter(Boolean)
    : [];

  return {
    type: "Feature",
    geometry: row.geometry,
    properties: {
      record_type: row.record_type,
      dataset_label: row.dataset_label,
      source_schema: row.source_schema,
      source_table: row.source_table,
      source_row_id: row.source_row_id,
      caal_id: row.caal_id,
      display_label: row.display_label,
      source_scope: row.source_scope,
      storage_scope: row.storage_scope,
      is_editable: row.is_editable === true || row.is_editable === "true",

      monument_type_path: monumentTypePath,
      monument_type_leaf: monumentTypePath.length
        ? monumentTypePath[monumentTypePath.length - 1]
        : null,

      survey_status: row.survey_status || null,
      site_count: row.site_count ?? null,
      checked: row.checked ?? null,
      grid_cell_count: row.grid_cell_count ?? null,
      checked_cell_count: row.checked_cell_count ?? null
    }
  };
}

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: []
  };
}

// ========================================================
// ROUTES
// ========================================================

router.get("/lookups", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const lang = viewerLangFromReq(req, session);
  const fallbackLang = fallbackViewerLang(lang);

  try {
    const [countriesResult, monumentTypesResult] = await Promise.all([
      pool.query(
        `
        SELECT
          canonical_value AS value,
          COALESCE(display_${lang}, display_${fallbackLang}, display_en, canonical_value) AS label,
          sort_order,
          jsonb_build_object(
            'canonical_value', canonical_value,
            'display_en', display_en,
            'display_${lang}', display_${lang},
            'display_${fallbackLang}', display_${fallbackLang}
          ) AS raw
        FROM ui.v_lkp_countries
        WHERE canonical_value IS NOT NULL
        ORDER BY sort_order NULLS LAST, label
        `
      ),

      pool.query(
        `
        SELECT
          concept_id AS value,
          concept_id,
          parent_id,
          level,
          COALESCE(display_${lang}, display_${fallbackLang}, display_en, label_en, concept_id) AS label,
          COALESCE(display_${lang}, display_${fallbackLang}, display_en, canonical_value, concept_id) AS chip_label,
          NULL::text AS disambiguation_label,
          sort_order,
          jsonb_build_object(
            'concept_id', concept_id,
            'parent_id', parent_id,
            'canonical_value', canonical_value,
            'display_en', display_en,
            'display_${lang}', display_${lang},
            'display_${fallbackLang}', display_${fallbackLang},
            'level', level,
            'sort_order', sort_order
          ) AS raw
        FROM ui.v_lkp_site_types_context
        WHERE concept_id IS NOT NULL
          AND btrim(concept_id) <> ''
        ORDER BY sort_order NULLS LAST, display_en
        `
      )
    ]);

    return res.json({
      ok: true,
      page: "viewer",
      language: lang,
      lookups: {
        country: countriesResult.rows,
        monument_type: monumentTypesResult.rows,
        monument_type_tree: monumentTypesResult.rows
      }
    });
  } catch (error) {
    console.error("Resource viewer lookups failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load viewer lookups",
      detail: error.message
    });
  }
});


router.get("/labels", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const lang = viewerLangFromReq(req, session);
  const fallbackLang = fallbackViewerLang(lang);

  try {
    const result = await pool.query(
      `
      SELECT
        key AS label_name,
        COALESCE(
          display_${lang},
          display_${fallbackLang},
          display_en,
          key
        ) AS label
      FROM ui.app_translations
      WHERE
        key LIKE 'viewer_%'
        OR key IN (
          'advanced_filters',
          'hide_advanced_filters',
          'clear_filters',
          'results',
          'previous',
          'next',
          'page_x',
          'page_x_of_y',
          'none_recorded',
          'not_recorded',
          'read_only',
          'monuments_workspace_records',
          'monuments_national_records',
          'monuments_other_records',
          'monuments_all_records'
        )

      UNION ALL

      SELECT
        label_name,
        COALESCE(
          display_${lang},
          display_${fallbackLang},
          display_en,
          label_name
        ) AS label
      FROM ui.v_label_viewer

      ORDER BY label_name
      `
    );

    const labels = {};

    for (const row of result.rows) {
      labels[row.label_name] = row.label;
    }

    return res.json({
      ok: true,
      lang,
      labels
    });
  } catch (error) {
    console.error("Resource viewer labels failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load viewer labels",
      detail: error.message
    });
  }
});


router.get("/records", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const lang = viewerLangFromReq(req, session);

  try {
    const filter = buildViewerWhereSql({
      req,
      session,
      baseParamIndex: 1,
      tableAlias: "v"
    });

    if (!filter.scopes.length || !filter.recordTypes.length) {
      return res.json({
        ok: true,
        records: [],
        total: 0,
        limit,
        offset,
        scopes: filter.scopes,
        record_types: filter.recordTypes,
        record_type_counts: {}
      });
    }

    const countsResult = await pool.query(
      `
      SELECT
        v.record_type,
        COUNT(*)::integer AS count
      FROM ${VIEWER_BASE_MV} v
      ${filter.whereSql}
      GROUP BY v.record_type
      ORDER BY v.record_type
      `,
      filter.values
    );

    const recordTypeCounts = {};

    countsResult.rows.forEach((row) => {
      recordTypeCounts[row.record_type] = Number(row.count || 0);
    });

    const limitParam = filter.values.length + 1;
    const offsetParam = filter.values.length + 2;

    const result = await pool.query(
      `
      WITH filtered AS (
        SELECT
          v.record_type,
          v.source_schema,
          v.source_table,
          v.source_row_id,
          v.caal_id,
          v.caal_id_norm,
          v.display_label,
          COUNT(*) OVER()::integer AS total_count
        FROM ${VIEWER_BASE_MV} v
        ${filter.whereSql}
      ),
      page AS (
        SELECT *
        FROM filtered
        ORDER BY
          CASE record_type
            WHEN 'rs3_poly' THEN 1
            WHEN 'rs3_line' THEN 2
            WHEN 'rs3_group' THEN 3
            WHEN 'institution' THEN 4
            WHEN 'vernacular' THEN 5
            WHEN 'monument' THEN 6
            WHEN 'archive' THEN 7
            ELSE 99
          END,
          display_label NULLS LAST,
          caal_id
        LIMIT $${limitParam}
        OFFSET $${offsetParam}
      )
      SELECT
        p.record_type,
        b.dataset_label,
        p.source_schema,
        p.source_table,
        p.source_row_id,
        p.caal_id,
        p.display_label,
        p.total_count,
        ${sourceScopeCaseSql("$1", "b")} AS source_scope,
        ${storageScopeCaseSql("b")} AS storage_scope,
        ${isEditableSql("$1", "b")} AS is_editable,

        ${viewerDisplayJsonSql("b", lang)} AS display,
        ${viewerMonumentTypePathDisplaySql("b", lang)} AS monument_type_path,
        ${viewerMonumentTypeConceptPathSql("b")} AS monument_type_concept_path,
        ${viewerCanonicalJsonSql("b")} AS canonical,

        CASE
          WHEN b.centroid_4326 IS NOT NULL THEN
            ST_AsGeoJSON(b.centroid_4326, 6)::json
          ELSE NULL::json
        END AS geometry,

        jsonb_build_object(
          'Monument type1', b.list_monument_type1,
          'Monument type2', b.list_monument_type2,
          'Monument type3', b.list_monument_type3,
          'Monument type4', b.list_monument_type4,
          'Interpretation', b.list_interpretation,
          'Comments', b.list_comments,
          'Notes on Condition', b.list_notes_condition,
          'Notes on Risk', b.list_notes_risk
        ) AS raw,

        rel.relation_summary
      FROM page p
      JOIN ${VIEWER_BASE_MV} b
        ON  b.source_schema = p.source_schema
        AND b.source_table  = p.source_table
        AND b.source_row_id = p.source_row_id
        AND b.record_type   = p.record_type
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'count', COUNT(r.edge_id)::integer,
          'items', COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'edge_id', r.edge_id,
                'relation_type', r.relation_type,
                'relation_type_norm', r.relation_type_norm,
                'relation_direction', r.relation_direction,
                'related_record_type', r.related_record_type,
                'related_dataset_label', r.related_dataset_label,
                'related_caal_id', r.related_caal_id,
                'related_display_label', r.related_display_label,
                'related_source_schema', r.related_source_schema,
                'related_source_table', r.related_source_table,
                'related_source_row_id', r.related_source_row_id
              )
              ORDER BY
                r.related_record_type,
                r.related_display_label NULLS LAST,
                r.related_caal_id
            ) FILTER (WHERE r.edge_id IS NOT NULL),
            '[]'::jsonb
          )
        ) AS relation_summary
        FROM ui.mv_resource_related_search r
        WHERE lower(btrim(r.returned_caal_id)) = p.caal_id_norm
      ) rel ON true
      ORDER BY
        CASE p.record_type
          WHEN 'rs3_poly'    THEN 1
          WHEN 'rs3_line'    THEN 2
          WHEN 'rs3_group'   THEN 3
          WHEN 'institution' THEN 4
          WHEN 'vernacular'  THEN 5
          ELSE 99
        END,
        p.display_label NULLS LAST,
        p.caal_id
      `,
      [...filter.values, limit, offset]
    );

    const total = result.rows[0]?.total_count
      ? Number(result.rows[0].total_count)
      : 0;

    return res.json({
      ok: true,
      records: result.rows.map(buildViewerRecord),
      total,
      limit,
      offset,
      scopes: filter.scopes,
      record_types: filter.recordTypes,
      record_type_counts: recordTypeCounts
    });
  } catch (error) {
    console.error("Resource viewer records failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load viewer records",
      detail: error.message
    });
  }
});

router.get("/records-by-type", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const recordType = String(req.query.recordType || req.query.record_type || "").trim();
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const lang = viewerLangFromReq(req, session);

  if (!ALLOWED_RECORD_TYPES.has(recordType)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid record type"
    });
  }

  try {
    const filter = buildViewerWhereSql({
      req,
      session,
      baseParamIndex: 1,
      tableAlias: "v"
    });

    if (!filter.scopes.length || !filter.recordTypes.length) {
      return res.json({
        ok: true,
        records: [],
        total: 0,
        limit,
        offset,
        record_type: recordType
      });
    }

    const recordTypeParam = filter.values.length + 1;
    const limitParam = filter.values.length + 2;
    const offsetParam = filter.values.length + 3;

    const result = await pool.query(
      `
      WITH filtered AS (
        SELECT
          v.record_type,
          v.source_schema,
          v.source_table,
          v.source_row_id,
          v.caal_id,
          v.caal_id_norm,
          v.display_label,
          COUNT(*) OVER()::integer AS total_count
        FROM ${VIEWER_BASE_MV} v
        ${filter.whereSql}
          AND v.record_type = $${recordTypeParam}
      ),
      page AS (
        SELECT *
        FROM filtered
        ORDER BY
          display_label NULLS LAST,
          caal_id
        LIMIT $${limitParam}
        OFFSET $${offsetParam}
      )
      SELECT
        p.record_type,
        b.dataset_label,
        p.source_schema,
        p.source_table,
        p.source_row_id,
        p.caal_id,
        p.display_label,
        p.total_count,

        ${sourceScopeCaseSql("$1", "b")} AS source_scope,
        ${storageScopeCaseSql("b")} AS storage_scope,
        ${isEditableSql("$1", "b")} AS is_editable,

        ${viewerDisplayJsonSql("b", lang)} AS display,
        ${viewerMonumentTypePathDisplaySql("b", lang)} AS monument_type_path,
        ${viewerMonumentTypeConceptPathSql("b")} AS monument_type_concept_path,
        ${viewerCanonicalJsonSql("b")} AS canonical,

        CASE
          WHEN b.centroid_4326 IS NOT NULL THEN
            ST_AsGeoJSON(b.centroid_4326, 6)::json
          ELSE NULL::json
        END AS geometry,

        jsonb_build_object(
          'Monument type1', b.list_monument_type1,
          'Monument type2', b.list_monument_type2,
          'Monument type3', b.list_monument_type3,
          'Monument type4', b.list_monument_type4,
          'Interpretation', b.list_interpretation,
          'Comments', b.list_comments,
          'Notes on Condition', b.list_notes_condition,
          'Notes on Risk', b.list_notes_risk
        ) AS raw,

        rel.relation_summary
      FROM page p
      JOIN ${VIEWER_BASE_MV} b
        ON  b.source_schema = p.source_schema
        AND b.source_table  = p.source_table
        AND b.source_row_id = p.source_row_id
        AND b.record_type   = p.record_type
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'count', COUNT(r.edge_id)::integer,
          'items', COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'edge_id', r.edge_id,
                'relation_type', r.relation_type,
                'relation_type_norm', r.relation_type_norm,
                'relation_direction', r.relation_direction,
                'related_record_type', r.related_record_type,
                'related_dataset_label', r.related_dataset_label,
                'related_caal_id', r.related_caal_id,
                'related_display_label', r.related_display_label,
                'related_source_schema', r.related_source_schema,
                'related_source_table', r.related_source_table,
                'related_source_row_id', r.related_source_row_id
              )
              ORDER BY
                r.related_record_type,
                r.related_display_label NULLS LAST,
                r.related_caal_id
            ) FILTER (WHERE r.edge_id IS NOT NULL),
            '[]'::jsonb
          )
        ) AS relation_summary
        FROM ui.mv_resource_related_search r
        WHERE lower(btrim(r.returned_caal_id)) = p.caal_id_norm
      ) rel ON true
      ORDER BY
        p.display_label NULLS LAST,
        p.caal_id
      `,
      [
        ...filter.values,
        recordType,
        limit,
        offset
      ]
    );

    const total = result.rows[0]?.total_count
      ? Number(result.rows[0].total_count)
      : 0;

    return res.json({
      ok: true,
      records: result.rows.map(buildViewerRecord),
      total,
      limit,
      offset,
      record_type: recordType
    });
  } catch (error) {
    console.error("Resource viewer records-by-type failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load viewer records by type",
      detail: error.message
    });
  }
});

router.get("/map", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const requestedLayers = requestedViewerLayerTypes(req);
  const lang = viewerLangFromReq(req, session);

  try {
    const layers = {};

    for (const recordType of requestedLayers) {
      if (VIEWER_REFERENCE_LAYERS.has(recordType)) {
        layers[recordType] = await loadReferenceLayer(recordType, req);
        continue;
      }

      const mvName = VIEWER_LAYER_MVS[recordType];

      if (!mvName) {
        layers[recordType] = emptyFeatureCollection();
        continue;
      }

      const filter = buildViewerWhereSql({
        req,
        session,
        baseParamIndex: 1,
        tableAlias: "v"
      });

      if (!filter.scopes.length) {
        layers[recordType] = emptyFeatureCollection();
        continue;
      }

      /*
        Force this loop query to only its own layer.
        Even if req.query.layers contains several types, each layer MV only contains
        one type, but this keeps filtering explicit.
      */
      const forcedRecordTypeParam = filter.values.length + 1;
      const simplifyParam = filter.values.length + 2;

      const simplifyTolerance = mapSimplifyToleranceForZoom(req.query.zoom);

      const surveyExtraSelectSql = surveyMapExtraSelectSql(recordType);

      const result = await pool.query(
        `
        SELECT
          v.record_type,
          v.dataset_label,
          v.source_schema,
          v.source_table,
          v.source_row_id,
          v.caal_id,
          v.display_label,
          ${viewerMonumentTypePathDisplaySql("b", lang)} AS monument_type_path,

          ${surveyExtraSelectSql},

          ${sourceScopeCaseSql("$1", "v")} AS source_scope,
          ${storageScopeCaseSql("v")} AS storage_scope,
          ${isEditableSql("$1", "v")} AS is_editable,
          CASE
            WHEN $${simplifyParam}::double precision > 0
              AND GeometryType(v.geom_4326) IN ('MULTIPOLYGON', 'POLYGON', 'MULTILINESTRING', 'LINESTRING')
            THEN ST_AsGeoJSON(
              ST_SimplifyPreserveTopology(
                v.geom_4326,
                $${simplifyParam}::double precision
              )
            )::json
            ELSE ST_AsGeoJSON(v.geom_4326)::json
          END AS geometry
        FROM ${sqlIdentFromSafeMv(mvName)} v
        LEFT JOIN ${VIEWER_BASE_MV} b
          ON  b.source_schema = v.source_schema
          AND b.source_table  = v.source_table
          AND b.source_row_id = v.source_row_id
          AND b.record_type   = v.record_type
        ${filter.whereSql}
          AND v.record_type = $${forcedRecordTypeParam}
        ORDER BY
          v.display_label NULLS LAST,
          v.caal_id
        `,
        [
          ...filter.values,
          recordType,
          simplifyTolerance
        ]
      );

      layers[recordType] = {
        type: "FeatureCollection",
        features: result.rows
          .filter((row) => row.geometry)
          .map(buildMapFeature)
      };
    }

    return res.json({
      ok: true,
      layers
    });
  } catch (error) {
    console.error("Resource viewer map failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load viewer map layers",
      detail: error.message
    });
  }
});

router.get("/centroids", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const lang = viewerLangFromReq(req, session);

  try {
    const filter = buildViewerWhereSql({
      req,
      session,
      baseParamIndex: 1,
      tableAlias: "v"
    });

    if (!filter.scopes.length || !filter.recordTypes.length) {
      return res.json({
        ok: true,
        centroids: {
          type: "FeatureCollection",
          features: []
        }
      });
    }

    const result = await pool.query(
      `
      SELECT
        v.record_type,
        v.dataset_label,
        v.source_schema,
        v.source_table,
        v.source_row_id,
        v.caal_id,
        v.display_label,
        ${viewerMonumentTypePathDisplaySql("v", lang)} AS monument_type_path,
        ${sourceScopeCaseSql("$1", "v")} AS source_scope,
        ${storageScopeCaseSql("v")} AS storage_scope,
        ${isEditableSql("$1", "v")} AS is_editable,
        ST_AsGeoJSON(v.centroid_4326, 6)::json AS geometry
      FROM ${VIEWER_BASE_MV} v
      ${filter.whereSql}
      `,
      filter.values
    );

    return res.json({
      ok: true,
      centroids: {
        type: "FeatureCollection",
        features: result.rows
          .filter((row) => row.geometry)
          .map((row) => ({
            type: "Feature",
            geometry: row.geometry,
            properties: {
              record_type: row.record_type,
              dataset_label: row.dataset_label,
              source_schema: row.source_schema,
              source_table: row.source_table,
              source_row_id: row.source_row_id,
              caal_id: row.caal_id,
              display_label: row.display_label,
              source_scope: row.source_scope,
              storage_scope: row.storage_scope,
              is_editable: row.is_editable === true || row.is_editable === "true",
              monument_type_path: Array.isArray(row.monument_type_path)
                ? row.monument_type_path.filter(Boolean)
                : [],
              monument_type_leaf: Array.isArray(row.monument_type_path) && row.monument_type_path.length
                ? row.monument_type_path[row.monument_type_path.length - 1]
                : null,
            }
          }))
      }
    });
  } catch (error) {
    console.error("Resource viewer centroids failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load viewer centroid layer",
      detail: error.message
    });
  }
});

router.get("/record", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const lang = viewerLangFromReq(req, session);

  const sourceSchema = String(req.query.source_schema || "").trim();
  const sourceTable = String(req.query.source_table || "").trim();
  const sourceRowId = String(req.query.source_row_id || "").trim();
  const caalId = String(req.query.caal_id || req.query.caalId || "").trim();

  try {
    let identityRow = null;

    if (sourceSchema && sourceTable && sourceRowId) {
      const identityResult = await pool.query(
        `
        SELECT
          v.record_type,
          v.dataset_label,
          v.source_schema,
          v.source_table,
          v.source_row_id,
          v.caal_id,
          v.display_label,
          ${sourceScopeCaseSql("$1", "v")} AS source_scope,
          ${storageScopeCaseSql("v")} AS storage_scope,
          ${isEditableSql("$1", "v")} AS is_editable,
          ${viewerDisplayJsonSql("v", lang)} AS display,
          ${viewerMonumentTypePathDisplaySql("v", lang)} AS monument_type_path,
          ${viewerMonumentTypeConceptPathSql("v")} AS monument_type_concept_path,
          ${viewerCanonicalJsonSql("v")} AS canonical,
          ST_AsGeoJSON(v.geom_4326)::json AS geometry
        FROM ${VIEWER_BASE_MV} v
        WHERE v.source_schema = $2
          AND v.source_table = $3
          AND v.source_row_id = $4
        LIMIT 1
        `,
        [
          getSessionWorkspaceCode(session) || "caal",
          sourceSchema,
          sourceTable,
          sourceRowId
        ]
      );

      identityRow = identityResult.rows[0] || null;
    } else if (caalId) {
      const identityResult = await pool.query(
        `
        SELECT
          v.record_type,
          v.dataset_label,
          v.source_schema,
          v.source_table,
          v.source_row_id,
          v.caal_id,
          v.display_label,
          ${sourceScopeCaseSql("$1", "v")} AS source_scope,
          ${storageScopeCaseSql()} AS storage_scope,
          ${isEditableSql("$1", "v")} AS is_editable,
          ${viewerDisplayJsonSql("v", lang)} AS display,
          ${viewerMonumentTypePathDisplaySql("v", lang)} AS monument_type_path,
          ${viewerMonumentTypeConceptPathSql("v")} AS monument_type_concept_path,
          ${viewerCanonicalJsonSql("v")} AS canonical,
          ST_AsGeoJSON(v.geom_4326)::json AS geometry
        FROM ${VIEWER_BASE_MV} v
        WHERE lower(trim(v.caal_id)) = lower(trim($2))
        ORDER BY
          CASE WHEN v.source_schema = $1 THEN 0 ELSE 1 END,
          v.record_type,
          v.source_row_id
        LIMIT 1
        `,
        [
          getSessionWorkspaceCode(session) || "caal",
          caalId
        ]
      );

      identityRow = identityResult.rows[0] || null;
    } else {
      return res.status(400).json({
        ok: false,
        error: "Provide source_schema, source_table and source_row_id, or provide caal_id"
      });
    }

    if (!identityRow) {
      return res.status(404).json({
        ok: false,
        error: "Viewer record not found"
      });
    }

    const tableKey = `${identityRow.source_schema}.${identityRow.source_table}`;
    const rawTableSql = VIEWER_RAW_TABLES[tableKey];

    if (!rawTableSql) {
      return res.status(400).json({
        ok: false,
        error: "Unsupported viewer source table",
        detail: tableKey
      });
    }

    const rawResult = await pool.query(
      `
      SELECT
        to_jsonb(t) - 'geom' AS raw
      FROM ${rawTableSql} t
      WHERE t.id::text = $1
      LIMIT 1
      `,
      [identityRow.source_row_id]
    );

    const raw = rawResult.rows[0]?.raw || null;

    const record = buildViewerRecord({
      ...identityRow,
      raw
    });

    record.relations = await loadViewerRelationsForCaalId(identityRow.caal_id);

    return res.json({
      ok: true,
      record
    });
  } catch (error) {
    console.error("Resource viewer record failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load viewer record",
      detail: error.message
    });
  }
});

router.get("/counts", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const filter = buildViewerWhereSql({
      req,
      session,
      baseParamIndex: 1,
      tableAlias: "v"
    });

    if (!filter.scopes.length || !filter.recordTypes.length) {
      return res.json({
        ok: true,
        total: 0,
        by_record_type: [],
        by_scope: []
      });
    }

    const result = await pool.query(
      `
      WITH filtered AS (
        SELECT
          v.record_type,
          ${sourceScopeCaseSql("$1", "v")} AS source_scope
        FROM ${VIEWER_BASE_MV} v
        ${filter.whereSql}
      )
      SELECT jsonb_build_object(
        'total', COUNT(*)::integer,
        'by_record_type', COALESCE(
          (
            SELECT jsonb_agg(row_to_json(x) ORDER BY x.record_type)
            FROM (
              SELECT record_type, COUNT(*)::integer AS count
              FROM filtered
              GROUP BY record_type
            ) x
          ),
          '[]'::jsonb
        ),
        'by_scope', COALESCE(
          (
            SELECT jsonb_agg(row_to_json(y) ORDER BY y.source_scope)
            FROM (
              SELECT source_scope, COUNT(*)::integer AS count
              FROM filtered
              GROUP BY source_scope
            ) y
          ),
          '[]'::jsonb
        )
      ) AS payload
      FROM filtered
      `,
      filter.values
    );

    return res.json({
      ok: true,
      ...(result.rows[0]?.payload || {
        total: 0,
        by_record_type: [],
        by_scope: []
      })
    });
  } catch (error) {
    console.error("Resource viewer counts failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load viewer counts",
      detail: error.message
    });
  }
});

router.get("/related-summary", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const caalId = String(req.query.caal_id || "").trim();

  if (!caalId) {
    return res.status(400).json({ ok: false, error: "caal_id is required" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        r.related_record_type AS record_type,
        COUNT(DISTINCT lower(btrim(r.related_caal_id)))::integer AS count
      FROM ui.mv_resource_related_search r
      WHERE lower(btrim(r.returned_caal_id)) = lower(btrim($1::text))
        AND r.related_caal_id IS NOT NULL
      GROUP BY r.related_record_type
      ORDER BY r.related_record_type
      `,
      [caalId]
    );

    return res.json({ ok: true, summary: result.rows });
  } catch (error) {
    console.error("Related summary failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Related summary failed",
      detail: error.message
    });
  }
});

router.get("/boundary-summary", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const boundaryId = String(req.query.boundary_id || "").trim();

  if (!boundaryId) {
    return res.status(400).json({ ok: false, error: "boundary_id is required" });
  }

  try {
    const lang = viewerLangFromReq(req, session);
    const safeLang = safeViewerLang(lang);   // same helper the MV lang columns use

    const result = await pool.query(
      `
      WITH members AS (
        SELECT record_type, source_schema, source_table, source_row_id
        FROM ui.resource_admin_boundary_membership
        WHERE boundary_id = $1
      ),

      type_counts AS (
        SELECT record_type, COUNT(*)::integer AS n
        FROM members
        GROUP BY record_type

        UNION ALL

        SELECT 'monument' AS record_type, COUNT(*)::integer AS n
        FROM ui.monument_admin_boundary_membership
        WHERE boundary_id::text = $1
      ),

      base_rows AS (
        SELECT b.*
        FROM members m
        JOIN ui.mv_resource_viewer_base b
          ON  b.source_schema = m.source_schema
          AND b.source_table  = m.source_table
          AND b.source_row_id = m.source_row_id
          AND b.record_type   = m.record_type
      ),

      top_types AS (
        SELECT
          COALESCE(
            b.list_monument_type1_${safeLang},
            b.list_monument_type1_en,
            b.list_monument_type1,
            'Unspecified'
          ) AS monument_type,
          COUNT(*)::integer AS n
        FROM base_rows b
        WHERE b.record_type IN ('rs3_poly', 'rs3_line', 'rs3_group')
        GROUP BY 1
        ORDER BY n DESC
        LIMIT 5
      ),

      condition_stats AS (
        SELECT
          ROUND(AVG(c.level)::numeric, 1)::float AS avg_condition,
          COUNT(DISTINCT (b.source_schema, b.source_table, b.source_row_id))
            ::integer AS records_with_condition
        FROM base_rows b
        CROSS JOIN LATERAL unnest(b.filter_condition_levels) AS c(level)
      )

      SELECT
        (SELECT jsonb_agg(jsonb_build_object('record_type', record_type, 'count', n)
                          ORDER BY n DESC)
           FROM type_counts WHERE n > 0)                       AS counts_by_type,
        (SELECT jsonb_agg(jsonb_build_object('monument_type', monument_type, 'count', n)
                          ORDER BY n DESC)
           FROM top_types)                                     AS top_monument_types,
        (SELECT avg_condition FROM condition_stats)            AS avg_condition,
        (SELECT records_with_condition FROM condition_stats)   AS records_with_condition
      `,
      [boundaryId]
    );

    const row = result.rows[0] || {};

    return res.json({
      ok: true,
      summary: {
        counts_by_type: row.counts_by_type || [],
        top_monument_types: row.top_monument_types || [],
        avg_condition: row.avg_condition,
        records_with_condition: row.records_with_condition || 0
      }
    });
  } catch (error) {
    console.error("Boundary summary failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Boundary summary failed",
      detail: error.message
    });
  }
});

router.get("/related-map", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const caalId = String(req.query.caal_id || "").trim();

  if (!caalId) {
    return res.status(400).json({ ok: false, error: "caal_id is required" });
  }

  try {
    const result = await pool.query(
      `
      WITH sel AS (
        SELECT *
        FROM ui.v_related_map_features
        WHERE caal_id_norm = lower(btrim($1::text))
        LIMIT 1
      ),

      -- One row per distinct related record, relation types aggregated
      edges AS (
        SELECT
          lower(btrim(r.related_caal_id)) AS related_caal_id_norm,
          array_agg(DISTINCT r.relation_type)      AS relation_types,
          array_agg(DISTINCT r.relation_direction) AS relation_directions
        FROM ui.mv_resource_related_search r
        WHERE lower(btrim(r.returned_caal_id)) = lower(btrim($1::text))
          AND r.related_caal_id IS NOT NULL
          AND lower(btrim(r.related_caal_id)) <> lower(btrim($1::text))
        GROUP BY lower(btrim(r.related_caal_id))
      ),

      rel AS (
        SELECT DISTINCT ON (f.caal_id_norm)
          e.relation_types,
          e.relation_directions,
          f.*
        FROM edges e
        JOIN ui.v_related_map_features f
          ON f.caal_id_norm = e.related_caal_id_norm
        ORDER BY
          f.caal_id_norm,
          CASE f.record_type
            WHEN 'monument'  THEN 1
            WHEN 'rs3_poly'  THEN 2
            WHEN 'rs3_group' THEN 3
            WHEN 'rs3_line'  THEN 4
            ELSE 5
          END,
          f.source_schema,
          f.source_row_id
      )

      SELECT
        (SELECT jsonb_build_object(
            'caal_id', s.caal_id,
            'record_type', s.record_type,
            'display_label', s.display_label,
            'source_schema', s.source_schema,
            'source_table', s.source_table,
            'source_row_id', s.source_row_id,
            'geometry', ST_AsGeoJSON(s.geom, 6)::jsonb,
            'representative_point', ST_AsGeoJSON(s.rep_point, 6)::jsonb
          ) FROM sel s
        ) AS selected,

        jsonb_build_object(
          'type', 'FeatureCollection',
          'features', COALESCE(
            (SELECT jsonb_agg(
               jsonb_build_object(
                 'type', 'Feature',
                 'geometry', ST_AsGeoJSON(rel.geom, 6)::jsonb,
                 'properties', jsonb_build_object(
                   'caal_id', rel.caal_id,
                   'record_type', rel.record_type,
                   'display_label', rel.display_label,
                   'relation_types', to_jsonb(rel.relation_types),
                   'relation_directions', to_jsonb(rel.relation_directions),
                   'source_schema', rel.source_schema,
                   'source_table', rel.source_table,
                   'source_row_id', rel.source_row_id
                 )
               )
             ) FROM rel),
            '[]'::jsonb
          )
        ) AS related,

        jsonb_build_object(
          'type', 'FeatureCollection',
          'features', COALESCE(
            (SELECT jsonb_agg(
               jsonb_build_object(
                 'type', 'Feature',
                 'geometry', ST_AsGeoJSON(
                   ST_MakeLine(s.rep_point, rel.rep_point), 6)::jsonb,
                 'properties', jsonb_build_object(
                   'related_caal_id', rel.caal_id,
                   'related_record_type', rel.record_type,
                   'relation_types', to_jsonb(rel.relation_types)
                 )
               )
             ) FROM rel, sel s
             WHERE rel.rep_point IS NOT NULL AND s.rep_point IS NOT NULL),
            '[]'::jsonb
          )
        ) AS relationship_lines
      `,
      [caalId]
    );

    const row = result.rows[0] || {};

    if (!row.selected) {
      return res.status(404).json({
        ok: false,
        error: "No mapped record found for this CAAL ID"
      });
    }

    return res.json({
      ok: true,
      selected: row.selected,
      related: row.related,
      relationship_lines: row.relationship_lines
    });
  } catch (error) {
    console.error("Related map failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Related map failed",
      detail: error.message
    });
  }
});

module.exports = router;