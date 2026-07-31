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

const VIEWER_RS_DISPLAY_MV =
  "ui.mv_resource_rs_display_geometry";

const VIEWER_RS_RECORD_TYPES = new Set([
  "rs3_poly",
  "rs3_line",
  "rs3_group"
]);

const VIEWER_LAYER_MVS = {
  rs3_poly: "ui.mv_resource_viewer_rs3_poly_map",
  rs3_line: "ui.mv_resource_viewer_rs3_line_map",
  rs3_group: "ui.mv_resource_viewer_rs3_group_map",
  institution: "ui.mv_resource_viewer_institution_map",
  vernacular: "ui.mv_resource_viewer_vernacular_map",
  monument: "ui.mv_resource_viewer_monument_map",
  dataset: "ui.mv_resource_viewer_dataset_map",
  cartography: "ui.mv_resource_viewer_cartography_map",

  survey_grid_region: "ui.mv_resource_viewer_survey_grid_region_map",
  survey_grid: "ui.mv_resource_viewer_survey_grid_map"
};

const VIEWER_RAW_TABLES = {
  "public.CAAL_RS3_Poly": 'public."CAAL_RS3_Poly"',
  "public.CAAL_RS3_Line": 'public."CAAL_RS3_Line"',
  "public.CAAL_RS3_Group": 'public."CAAL_RS3_Group"',
  "public.CAAL_Institution": 'public."CAAL_Institution"',
  "public.CAAL_Vernacular": 'public."CAAL_Vernacular"',
  "public.CAAL_Monuments": 'public."CAAL_Monuments"',
  "public.CAAL_Archive": 'public."CAAL_Archive"',
  "public.CAAL_Datasets": 'public."CAAL_Datasets"',
  "public.CAAL_Cartography": 'public."CAAL_Cartography"',
  "public.caal_grid": "ui.v_caal_grid_survey_status",

  "kz.CAAL_RS3_Poly": 'kz."CAAL_RS3_Poly"',
  "kz.CAAL_RS3_Line": 'kz."CAAL_RS3_Line"',
  "kz.CAAL_RS3_Group": 'kz."CAAL_RS3_Group"',
  "kz.CAAL_Institution": 'kz."CAAL_Institution"',
  "kz.CAAL_Vernacular": 'kz."CAAL_Vernacular"',
  "kz.CAAL_Monuments": 'kz."CAAL_Monuments"',
  "kz.CAAL_Archive": 'kz."CAAL_Archive"'
};

const ALLOWED_RECORD_TYPES = new Set([
  "rs3_poly",
  "rs3_line",
  "rs3_group",
  "institution",
  "vernacular",
  "monument",
  "archive",
  "dataset",
  "cartography"
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

function requireExportCapability(req, res, session) {
  if (session?.permissions?.can_export_data) return true;
  res.status(403).json({
    ok: false,
    error: "export_not_permitted",
    detail: "This account can view data but not download it."
  });
  return false;
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

function parseSpatialPolygonParam(value) {
  if (!value) return null;

  let geometry;

  try {
    geometry = JSON.parse(String(value));
  } catch {
    return null;
  }

  if (
    !geometry ||
    geometry.type !== "Polygon" ||
    !Array.isArray(geometry.coordinates) ||
    !geometry.coordinates.length
  ) {
    return null;
  }

  let vertexCount = 0;

  for (const ring of geometry.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return null;
    }

    for (const coordinate of ring) {
      if (
        !Array.isArray(coordinate) ||
        coordinate.length < 2
      ) {
        return null;
      }

      const lng = Number(coordinate[0]);
      const lat = Number(coordinate[1]);

      if (
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        lng < -180 ||
        lng > 180 ||
        lat < -90 ||
        lat > 90
      ) {
        return null;
      }

      vertexCount += 1;

      if (vertexCount > 200) {
        return null;
      }
    }
  }

  return geometry;
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
  }

  if (session?.permissions?.can_view_national_ref) {
    scopes.push("national_ref");
  }

  if (session?.permissions?.can_view_all_caal) {
    scopes.push("all_caal");
  }

  /*
    Temporary compatibility fallback.
    Remove once all active sessions reliably contain permissions.
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
  const allowedScopes = allowedScopesForSession(session);
  const allowed = new Set(allowedScopes);

  const rawScopes = requested.length
    ? requested
    : allowedScopes;

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

// =========================================================
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
      'Monument type5', ${viewerMvLangValueSql(alias, "list_monument_type5", `${p}list_monument_type5`, lang)},
      'Monument type6', ${viewerMvLangValueSql(alias, "list_monument_type6", `${p}list_monument_type6`, lang)},

      'Monument type 1', ${viewerMvLangValueSql(alias, "list_monument_type1", `${p}list_monument_type1`, lang)},
      'Monument type 2', ${viewerMvLangValueSql(alias, "list_monument_type2", `${p}list_monument_type2`, lang)},
      'Monument type 3', ${viewerMvLangValueSql(alias, "list_monument_type3", `${p}list_monument_type3`, lang)},
      'Monument type 4', ${viewerMvLangValueSql(alias, "list_monument_type4", `${p}list_monument_type4`, lang)},
      'Monument type 5', ${viewerMvLangValueSql(alias, "list_monument_type5", `${p}list_monument_type5`, lang)},
      'Monument type 6', ${viewerMvLangValueSql(alias, "list_monument_type6", `${p}list_monument_type6`, lang)}
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
      'Monument type4', ${p}list_monument_type4_concept_id,
      'Monument type5', ${p}list_monument_type5_concept_id,
      'Monument type6', ${p}list_monument_type6_concept_id
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
      ${viewerMvLangValueSql(alias, "list_monument_type4", `${p}list_monument_type4`, lang)},
      ${viewerMvLangValueSql(alias, "list_monument_type5", `${p}list_monument_type5`, lang)},
      ${viewerMvLangValueSql(alias, "list_monument_type6", `${p}list_monument_type6`, lang)}
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
      ${p}list_monument_type4_concept_id,
      ${p}list_monument_type5_concept_id,
      ${p}list_monument_type6_concept_id
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

  // "strict" reproduces the pre-change behaviour for A/B comparison.
  const filterMode =
    String(req.query.filterMode || "scoped") === "strict" ? "strict" : "scoped";
  const scopedFilters = [];

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
    clauses.push(scopeFilterSql(
      "country",
      `COALESCE(${p}filter_country_canonical, ${p}filter_country) = ANY($${index}::text[])`,
      p, filterMode
    ));
    scopedFilters.push("country");
    values.push(countries);
    index += 1;
  }

  const monumentTypes = parseCsvParam(req.query.monumentTypes);

  if (monumentTypes.length) {
    clauses.push(scopeFilterSql(
      "monument_types",
      `${monumentTypeDescendantFilterSql(`${p}filter_monument_type_concept_ids`, `$${index}`)}
        OR ${p}filter_monument_types && $${index}::text[]`,
      p, filterMode
    ));
    scopedFilters.push("monument_types");
    values.push(monumentTypes);
    index += 1;
  }

  const conditionLevels = parseIntCsvParam(req.query.condition);

  if (conditionLevels.length) {
    clauses.push(scopeFilterSql(
      "condition_levels",
      `${p}filter_condition_levels && $${index}::int[]`,
      p, filterMode
    ));
    scopedFilters.push("condition_levels");
    values.push(conditionLevels);
    index += 1;
  }

  const deteriorationCauses = parseCsvParam(req.query.deteriorationCause);

  if (deteriorationCauses.length) {
    clauses.push(scopeFilterSql(
      "deterioration_causes",
      `${p}filter_deterioration_causes && $${index}::text[]`,
      p, filterMode
    ));
    scopedFilters.push("deterioration_causes");
    values.push(deteriorationCauses);
    index += 1;
  }

  const riskTypes = parseCsvParam(req.query.riskType);
  const riskMin = parseOptionalInteger(req.query.riskMin);

  if (riskTypes.length) {
    const effectiveRiskMin = riskMin ?? 2;

    clauses.push(scopeFilterSql("risk_levels", `
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
    `, p, filterMode));
    scopedFilters.push("risk_levels");

    values.push(riskTypes, effectiveRiskMin);
    index += 2;
  } else if (riskMin !== null) {
    clauses.push(scopeFilterSql("risk_levels", `
      EXISTS (
        SELECT 1
        FROM jsonb_each_text(${p}filter_risk_levels) AS risk(key, value)
        WHERE CASE
                WHEN btrim(risk.value) ~ '^-?\\d+$'
                THEN btrim(risk.value)::int
                ELSE NULL
              END >= $${index}::int
      )
    `, p, filterMode));
    scopedFilters.push("risk_levels");

    values.push(riskMin);
    index += 1;
  }

  const spatialPolygon = parseSpatialPolygonParam(
    req.query.spatialPolygon
  );

  if (req.query.spatialPolygon && !spatialPolygon) {
    clauses.push("false");
  } else if (spatialPolygon) {
    clauses.push(`
      (
        ST_IsValid(
          ST_SetSRID(
            ST_GeomFromGeoJSON($${index}),
            4326
          )
        )
        AND NOT ST_IsEmpty(
          ST_SetSRID(
            ST_GeomFromGeoJSON($${index}),
            4326
          )
        )
        AND ${p}geom_4326 && ST_SetSRID(
          ST_GeomFromGeoJSON($${index}),
          4326
        )
        AND ST_Intersects(
          ${p}geom_4326,
          ST_SetSRID(
            ST_GeomFromGeoJSON($${index}),
            4326
          )
        )
      )
    `);

    values.push(JSON.stringify(spatialPolygon));
    index += 1;
  }

  const bbox = spatialPolygon
    ? null
    : parseBboxParam(req.query.bbox);

  if (bbox) {
    clauses.push(`
      (
        ${p}geom_4326 && ST_MakeEnvelope(
          $${index},
          $${index + 1},
          $${index + 2},
          $${index + 3},
          4326
        )
        AND ST_Intersects(
          ${p}geom_4326,
          ST_MakeEnvelope(
            $${index},
            $${index + 1},
            $${index + 2},
            $${index + 3},
            4326
          )
        )
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
    recordTypes,
    filterMode,
    scopedFilters
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

function viewerRsDisplayZoomBand(zoomValue) {
  const zoom = Number(zoomValue);

  if (!Number.isFinite(zoom)) {
    return null;
  }

  const zoomBand = Math.floor(zoom);

  return zoomBand >= 7 && zoomBand <= 8
    ? zoomBand
    : null;
}

// ========================================================
// RECORD BUILDERS
// ========================================================

async function loadViewerRawSourceRow(identityRow) {
  const sourceSchema = String(identityRow?.source_schema || "").trim();
  const sourceTable = String(identityRow?.source_table || "").trim();
  const sourceRowId = String(identityRow?.source_row_id || "").trim();

  if (!sourceSchema || !sourceTable || !sourceRowId) {
    return null;
  }

  const rawTableKey = `${sourceSchema}.${sourceTable}`;
  const safeTableSql = VIEWER_RAW_TABLES[rawTableKey];

  if (!safeTableSql) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT
      jsonb_strip_nulls(
        to_jsonb(t)
          - 'geom'
          - 'geometry'
          - 'geom_4326'
          - 'centroid_4326'
      ) AS raw
    FROM ${safeTableSql} t
    WHERE t.id::text = $1
    LIMIT 1
    `,
    [sourceRowId]
  );

  return result.rows[0]?.raw || null;
}

function viewerStructuredDetailSections(detailsJson) {
  if (
    detailsJson &&
    typeof detailsJson === "object" &&
    !Array.isArray(detailsJson) &&
    Array.isArray(detailsJson.sections)
  ) {
    return detailsJson.sections;
  }

  return [];
}

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

    raw: row.raw || {},
    display: row.display || {},
    canonical: row.canonical || {},
    detail_sections: Array.isArray(row.detail_sections) ? row.detail_sections : [],

    relation_summary: row.relation_summary || {
      count: 0,
      items: []
    },

    relations: Array.isArray(row.relations) ? row.relations : [],

    details: row.details_json || null,
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
      display_geometry:
        row.is_display_geometry === true ||
        row.is_display_geometry === "true",

      display_zoom_band:
        row.display_zoom_band !== null &&
        row.display_zoom_band !== undefined
          ? Number(row.display_zoom_band)
          : null,

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
// ============================================================
// EXPORT
const EXPORT_LIMITS = Object.freeze({
  csv: 60000,
  gpkg: 60000,
  kml: 2000
});

function exportLimitFor(format) {
  const key = String(format || "").trim().toLowerCase();

  return Object.prototype.hasOwnProperty.call(
    EXPORT_LIMITS,
    key
  )
    ? EXPORT_LIMITS[key]
    : null;
}

const EXPORT_STRUCTURED_KML_MAX_SELECTED = 1500;
// Centroids-only roughly halves per-record node cost, so allow a
// larger node budget when the caller has requested it.
const EXPORT_KML_NODE_BUDGET_CENTROIDS = 8000;
const EXPORT_KML_NODE_BUDGET = 4000;        // structured-KML sidebar budget

function buildExportEstimateSql({ whereSql, scopesParam, includeRelated }) {
  // Selection = exactly what /records counts, deduplicated on caal_id_norm.
  // Related = one hop via mv_resource_related_search, re-checked for
  // visibility with the same scope rules, never silently exposing a
  // restricted endpoint (dropped edges are counted, not shown).
  const relatedCtes = includeRelated
    ? `,
    edges AS (
      SELECT
        r.edge_id,
        lower(btrim(r.returned_caal_id)) AS from_norm,
        lower(btrim(r.related_caal_id))  AS to_norm,
        r.relation_type_norm
      FROM ui.mv_resource_related_search r
      JOIN sel_dedup s
        ON lower(btrim(r.returned_caal_id)) = s.caal_id_norm
      WHERE r.related_caal_id IS NOT NULL
    ),
    visible_related AS (
      SELECT DISTINCT v.caal_id_norm
      FROM ${VIEWER_BASE_MV} v
      JOIN (SELECT DISTINCT to_norm FROM edges) e
        ON v.caal_id_norm = e.to_norm
      WHERE ${sourceScopeCaseSql("$1", "v")} = ANY(${scopesParam}::text[])
        AND v.caal_id_norm NOT IN (SELECT caal_id_norm FROM sel_dedup)
    ),
    export_set AS (
      SELECT caal_id_norm FROM sel_dedup
      UNION
      SELECT caal_id_norm FROM visible_related
    ),
    edges_kept AS (
      SELECT e.*
      FROM edges e
      WHERE e.to_norm IN (SELECT caal_id_norm FROM export_set)
    )`
    : `,
    visible_related AS (SELECT NULL::text AS caal_id_norm WHERE false),
    edges_kept AS (
      SELECT NULL::bigint AS edge_id, NULL::text AS from_norm,
             NULL::text AS to_norm, NULL::text AS relation_type_norm
      WHERE false
    )`;

  return `
    WITH sel_dedup AS (
      SELECT DISTINCT v.caal_id_norm, v.record_type, v.source_schema
      FROM ${VIEWER_BASE_MV} v
      ${whereSql}
    )${relatedCtes}
    SELECT
      (SELECT COUNT(*) FROM sel_dedup)::integer            AS selected_record_count,
      (SELECT COUNT(*) FROM visible_related)::integer      AS related_record_count,
      (SELECT COUNT(DISTINCT edge_id) FROM edges_kept)::integer AS unique_relationship_count,
      (SELECT COUNT(*) FROM edges_kept)::integer           AS membership_count,
      (SELECT COUNT(DISTINCT (from_norm, relation_type_norm))
         FROM edges_kept)::integer                         AS relation_folder_count
  `;
}

router.get("/export/estimate", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  if (!requireExportCapability(req, res, session)) return;

  const lang = viewerLangFromReq(req, session);
  const includeRelated = String(req.query.includeRelated || "true") !== "false";
  const centroidsOnly = String(req.query.centroidsOnly || "false") === "true";

  const format = String(
    req.query.format || ""
  ).trim().toLowerCase();

  const cap = exportLimitFor(format);

  if (!cap) {
    return res.status(400).json({
      ok: false,
      error: "invalid_export_format",
      detail: "Choose csv, gpkg or kml."
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
        lang,
        includeRelated,
        selectedRecordCount: 0,
        relatedRecordCount: 0,
        totalUniqueRecordCount: 0,
        uniqueRelationshipCount: 0,
        selectedRelationshipMembershipCount: 0,
        eligible: false,
        eligibleWithoutRelated: false,
        kmlMode: null,
        projectedKmlNodeCount: 0,
        limit: cap
      });
    }

    // Visibility scopes for the related-record re-check ride as one
    // extra parameter after everything the filter builder produced.
    const values = filter.values.slice();
    let scopesParam = null;
    if (includeRelated) {
      scopesParam = `$${values.length + 1}`;
      values.push(filter.scopes);
    }

    const sql = buildExportEstimateSql({
      whereSql: filter.whereSql,
      scopesParam,
      includeRelated
    });

    const result = await pool.query(sql, values);
    const row = result.rows[0] || {};

    const selected = Number(row.selected_record_count || 0);
    const related = Number(row.related_record_count || 0);
    const total = selected + related;
    const membership = Number(row.membership_count || 0);
    const relationFolders = Number(row.relation_folder_count || 0);

    // Sidebar-node projection for structured KML:
    // per selected record: its folder + "Primary" subfolder + placemark (3)
    // per kept edge membership: relation entry + duplicate placemark (2)
    // plus one node per distinct (record, relation-type) subfolder.
    const withinCap = total > 0 && total <= cap;
    const perRecordNodes = centroidsOnly ? 2 : 3;
    const perEdgeNodes = centroidsOnly ? 1 : 2;
    const projectedKmlNodeCount =
      selected * perRecordNodes + membership * perEdgeNodes + relationFolders;
 
    const nodeBudget = centroidsOnly
      ? EXPORT_KML_NODE_BUDGET_CENTROIDS
      : EXPORT_KML_NODE_BUDGET;
    const kmlMode = !withinCap
      ? null
      : selected <= EXPORT_STRUCTURED_KML_MAX_SELECTED &&
        projectedKmlNodeCount <= nodeBudget
        ? "structured"
        : "flat";

    return res.json({
      ok: true,
      lang,
      includeRelated,
      selectedRecordCount: selected,
      relatedRecordCount: related,
      totalUniqueRecordCount: total,
      uniqueRelationshipCount: Number(row.unique_relationship_count || 0),
      selectedRelationshipMembershipCount: membership,
      eligible: withinCap,
      eligibleWithoutRelated:
        selected > 0 && selected <= cap,
      kmlMode,
      projectedKmlNodeCount,
      limit: cap
    });
  } catch (error) {
    console.error("viewer export estimate failed", error);
    return res.status(500).json({ ok: false, error: "estimate_failed" });
  }
});

// ============================================================
// RESULT EXTENT endpoint — true bounds of the filtered result set,
// independent of the current viewport. Powers "zoom to all results".
//
// Add to resourceViewerRoutes.js near the other viewer GET routes
// (e.g. beside /export/estimate). Reuses buildViewerWhereSql, so the
// extent always matches exactly what the results count reflects.
// ============================================================

router.get("/results-extent", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const filter = buildViewerWhereSql({
      req, session, baseParamIndex: 1, tableAlias: "v"
    });

    // No visible record types / scopes => nothing to fit.
    if (!filter.scopes.length || !filter.recordTypes.length) {
      return res.json({ ok: true, extent: null });
    }

    // ST_Extent over the matching geometries — one row, cheap, and
    // spans the whole result set regardless of what's on screen.
    const sql = `
      SELECT ST_XMin(e) AS min_lon, ST_YMin(e) AS min_lat,
             ST_XMax(e) AS max_lon, ST_YMax(e) AS max_lat
      FROM (
        SELECT ST_Extent(v.geom_4326) AS e
        FROM ${VIEWER_BASE_MV} v
        ${filter.whereSql}
      ) x
      WHERE e IS NOT NULL
    `;

    const result = await pool.query(sql, filter.values);
    const row = result.rows[0];

    if (!row) {
      // Result set has no geometry at all (e.g. only archives/datasets).
      return res.json({ ok: true, extent: null });
    }

    return res.json({
      ok: true,
      extent: [
        Number(row.min_lon), Number(row.min_lat),
        Number(row.max_lon), Number(row.max_lat)
      ]
    });
  } catch (error) {
    console.error("viewer results-extent failed", error);
    return res.status(500).json({ ok: false, error: "extent_failed" });
  }
});


// EXPORT 
// pinned to v7: v8.0.0 (July 2026) rewrote the API to classes; migrate via streamZip() helper once 8.x matures
const archiver = require("archiver");

const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeGeoPackage } = require("./viewerGeoPackage");
const { buildKml } = require("./viewerKml");

const {
  COMMON_FIELDS, fieldsForRecordType, commonFields, rowValues,
  CONDITIONAL_FIELDS, scopeFilterSql, vocabArrayJoinsFor,
  EXPORT_SPECS, exportTypeRecordsSql
} = require("./viewerFieldMap");

const EXPORT_LANG_SUFFIXES = {
  en: "en", ru: "ru", zh: "zh", kk: "kk",
  ky: "ky", tg: "tg", tk: "tk", uz: "uz"
};
const EXPORT_WKT_MAX_CHARS = 30000; // Excel cell limit is 32,767
// Confirm this matches the key used by /cache-status for the base MV:
const EXPORT_BASE_CACHE_KEY = "resource_viewer_base_cache";

// ---------- CSV helpers ----------

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Formula-injection guard: neutralise leading =, +, -, @, tab, CR
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function csvFile(headerCells, rows) {
  const lines = [headerCells.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 (Cyrillic/Chinese) correctly
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// ---------- SQL builders ----------

function exportCtesSql({ whereSql, scopesParam, includeRelated }) {
  // Same selection semantics Stage 1 verified, kept in one place.
  const related = includeRelated
    ? `,
    edges AS (
      SELECT r.edge_id, r.relation_type, r.relation_type_norm,
             r.relation_direction,
             lower(btrim(r.returned_caal_id)) AS from_norm,
             lower(btrim(r.related_caal_id))  AS to_norm
      FROM ui.mv_resource_related_search r
      JOIN sel_dedup s ON lower(btrim(r.returned_caal_id)) = s.caal_id_norm
      WHERE r.related_caal_id IS NOT NULL
    ),
    visible_related AS (
      SELECT DISTINCT v.caal_id_norm
      FROM ${VIEWER_BASE_MV} v
      JOIN (SELECT DISTINCT to_norm FROM edges) e ON v.caal_id_norm = e.to_norm
      WHERE ${sourceScopeCaseSql("$1", "v")} = ANY(${scopesParam}::text[])
        AND v.caal_id_norm NOT IN (SELECT caal_id_norm FROM sel_dedup)
    ),
    export_set AS (
      SELECT caal_id_norm FROM sel_dedup
      UNION
      SELECT caal_id_norm FROM visible_related
    ),
    edges_kept AS (
      SELECT e.* FROM edges e
      WHERE e.to_norm IN (SELECT caal_id_norm FROM export_set)
    )`
    : `,
    export_set AS (SELECT caal_id_norm FROM sel_dedup),
    edges_kept AS (
      SELECT NULL::bigint AS edge_id, NULL::text AS relation_type,
             NULL::text AS relation_type_norm, NULL::text AS relation_direction,
             NULL::text AS from_norm, NULL::text AS to_norm
      WHERE false
    )`;

  return `
    WITH sel_dedup AS (
      SELECT DISTINCT v.caal_id_norm
      FROM ${VIEWER_BASE_MV} v
      ${whereSql}
    )${related}`;
}

/**
 * Body of the `picked` CTE: one row per resource identity, with localised
 * value columns. Extracted so the thin export and each per-type export
 * build on an identical selection and cannot drift apart.
 */
function pickedCteBody(sfx) {
  return `
      SELECT DISTINCT ON (v.caal_id_norm)
        v.caal_id, v.caal_id_norm, v.record_type, v.dataset_label,
        v.display_label,
        COALESCE(v.filter_country_${sfx}, v.filter_country_en,
                 v.filter_country_canonical, v.filter_country) AS country,
        (SELECT string_agg(t, '; ')
           FROM unnest(ARRAY[
             COALESCE(v.list_monument_type1_${sfx}, v.list_monument_type1_en, v.list_monument_type1),
             COALESCE(v.list_monument_type2_${sfx}, v.list_monument_type2_en, v.list_monument_type2),
             COALESCE(v.list_monument_type3_${sfx}, v.list_monument_type3_en, v.list_monument_type3),
             COALESCE(v.list_monument_type4_${sfx}, v.list_monument_type4_en, v.list_monument_type4),
             COALESCE(v.list_monument_type5_${sfx}, v.list_monument_type5_en, v.list_monument_type5),
             COALESCE(v.list_monument_type6_${sfx}, v.list_monument_type6_en, v.list_monument_type6)
           ]) AS t WHERE t IS NOT NULL) AS monument_types,
        array_to_string(v.filter_condition_levels, '; ')     AS condition_levels,
        array_to_string(v.filter_deterioration_causes, '; ') AS deterioration_causes,
        CASE
          WHEN v.filter_risk_levels IS NULL THEN NULL
          WHEN jsonb_typeof(v.filter_risk_levels) = 'array' THEN
            (SELECT string_agg(elem, '; ')
               FROM jsonb_array_elements_text(v.filter_risk_levels) AS t(elem))
          WHEN jsonb_typeof(v.filter_risk_levels) = 'object' THEN
            (SELECT string_agg(key || ': ' || value, '; ')
               FROM jsonb_each_text(v.filter_risk_levels) AS t(key, value))
          ELSE v.filter_risk_levels #>> '{}'
        END                                                 AS risk_levels,
        v.source_schema, v.source_table, v.source_row_id,
        CASE WHEN v.centroid_4326 IS NOT NULL THEN ST_X(v.centroid_4326) END AS centroid_lon,
        CASE WHEN v.centroid_4326 IS NOT NULL THEN ST_Y(v.centroid_4326) END AS centroid_lat,
        wkt.txt      AS geometry_wkt,
        wkt.truncated AS geometry_truncated,
        CASE WHEN v.caal_id_norm IN (SELECT caal_id_norm FROM sel_dedup)
             THEN 'selected' ELSE 'related' END AS export_role
      FROM ${VIEWER_BASE_MV} v
      JOIN export_set es ON es.caal_id_norm = v.caal_id_norm
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN v.geom_4326 IS NULL THEN NULL
                 WHEN length(ST_AsText(v.geom_4326)) > ${EXPORT_WKT_MAX_CHARS} THEN NULL
                 ELSE ST_AsText(v.geom_4326)
               END AS txt,
               (v.geom_4326 IS NOT NULL
                AND length(ST_AsText(v.geom_4326)) > ${EXPORT_WKT_MAX_CHARS}) AS truncated
        OFFSET 0
      ) wkt
      ORDER BY v.caal_id_norm, v.record_type
  `;
}

function exportRecordsSql(ctes, sfx) {
  // One row per resource identity; localised value columns fall back
  // lang -> en -> canonical/raw (matches viewer display behaviour).
  return `${ctes}
    , picked AS (${pickedCteBody(sfx)})
    SELECT * FROM picked
    ORDER BY export_role, record_type, caal_id`;
}

function exportRelationshipsSql(ctes, sfx) {
  // One row per edge. When both perspectives were kept (both endpoints
  // selected), the forward row wins; orientation is therefore stable.
  return `${ctes}
    , picked_edge AS (
      SELECT DISTINCT ON (edge_id) *
      FROM edges_kept
      ORDER BY edge_id, (relation_direction = 'forward') DESC
    )
    SELECT
      p.edge_id,
      bf.caal_id       AS from_caal_id,
      bf.display_label AS from_display_label,
      bf.record_type   AS from_record_type,
      COALESCE(lf.label_${sfx}, lf.label_en, p.relation_type) AS relationship,
      bt.caal_id       AS to_caal_id,
      bt.display_label AS to_display_label,
      bt.record_type   AS to_record_type,
      COALESCE(li.label_${sfx}, li.label_en)                  AS inverse_relationship,
      CASE WHEN p.from_norm IN (SELECT caal_id_norm FROM sel_dedup)
           THEN 'selected' ELSE 'related' END AS from_role,
      CASE WHEN p.to_norm IN (SELECT caal_id_norm FROM sel_dedup)
           THEN 'selected' ELSE 'related' END AS to_role
    FROM picked_edge p
    CROSS JOIN LATERAL (
      SELECT caal_id, display_label, record_type FROM ${VIEWER_BASE_MV}
      WHERE caal_id_norm = p.from_norm ORDER BY record_type LIMIT 1
    ) bf
    CROSS JOIN LATERAL (
      SELECT caal_id, display_label, record_type FROM ${VIEWER_BASE_MV}
      WHERE caal_id_norm = p.to_norm ORDER BY record_type LIMIT 1
    ) bt
    LEFT JOIN ui.relation_type_labels lf
      ON lf.relation_type_norm = p.relation_type_norm
     AND lf.relation_direction = p.relation_direction
    LEFT JOIN ui.relation_type_labels li
      ON li.relation_type_norm = p.relation_type_norm
     AND li.relation_direction = CASE p.relation_direction
                                   WHEN 'forward' THEN 'reverse'
                                   ELSE 'forward' END
    ORDER BY p.edge_id`;
}

function exportRecordsGpkgSql(ctes, sfx) {
  return `${ctes}
    , picked AS (
      SELECT DISTINCT ON (v.caal_id_norm, v.record_type, v.source_schema)
        v.caal_id, v.caal_id_norm, v.record_type, v.dataset_label,
        v.display_label,
        COALESCE(v.filter_country_${sfx}, v.filter_country_en,
                 v.filter_country_canonical, v.filter_country) AS country,
        (SELECT string_agg(t, '; ')
           FROM unnest(ARRAY[
             COALESCE(v.list_monument_type1_${sfx}, v.list_monument_type1_en, v.list_monument_type1),
             COALESCE(v.list_monument_type2_${sfx}, v.list_monument_type2_en, v.list_monument_type2),
             COALESCE(v.list_monument_type3_${sfx}, v.list_monument_type3_en, v.list_monument_type3),
             COALESCE(v.list_monument_type4_${sfx}, v.list_monument_type4_en, v.list_monument_type4),
             COALESCE(v.list_monument_type5_${sfx}, v.list_monument_type5_en, v.list_monument_type5),
             COALESCE(v.list_monument_type6_${sfx}, v.list_monument_type6_en, v.list_monument_type6)
           ]) AS t WHERE t IS NOT NULL) AS monument_types,
        array_to_string(v.filter_condition_levels, '; ')     AS condition_levels,
        array_to_string(v.filter_deterioration_causes, '; ') AS deterioration_causes,
        CASE
          WHEN v.filter_risk_levels IS NULL THEN NULL
          WHEN jsonb_typeof(v.filter_risk_levels) = 'array' THEN
            (SELECT string_agg(elem, '; ')
               FROM jsonb_array_elements_text(v.filter_risk_levels) AS t(elem))
          WHEN jsonb_typeof(v.filter_risk_levels) = 'object' THEN
            (SELECT string_agg(key || ': ' || value, '; ')
               FROM jsonb_each_text(v.filter_risk_levels) AS t(key, value))
          ELSE v.filter_risk_levels #>> '{}'
        END                                                 AS risk_levels,
        v.source_schema, v.source_table, v.source_row_id,
        CASE WHEN v.centroid_4326 IS NOT NULL THEN ST_X(v.centroid_4326) END AS centroid_lon,
        CASE WHEN v.centroid_4326 IS NOT NULL THEN ST_Y(v.centroid_4326) END AS centroid_lat,
        ST_AsBinary(v.geom_4326)                            AS geom_wkb,
        CASE WHEN v.geom_4326 IS NOT NULL THEN ST_XMin(v.geom_4326) END AS min_x,
        CASE WHEN v.geom_4326 IS NOT NULL THEN ST_YMin(v.geom_4326) END AS min_y,
        CASE WHEN v.geom_4326 IS NOT NULL THEN ST_XMax(v.geom_4326) END AS max_x,
        CASE WHEN v.geom_4326 IS NOT NULL THEN ST_YMax(v.geom_4326) END AS max_y,
        CASE WHEN v.caal_id_norm IN (SELECT caal_id_norm FROM sel_dedup)
             THEN 'selected' ELSE 'related' END AS export_role
      FROM ${VIEWER_BASE_MV} v
      JOIN export_set es ON es.caal_id_norm = v.caal_id_norm
      ORDER BY v.caal_id_norm, v.record_type, v.source_schema, v.source_row_id
    )
    SELECT * FROM picked
    ORDER BY export_role, record_type, caal_id`;
}

function exportRecordsKmlSql(ctes, sfx) {
  return `${ctes}
    , picked AS (
      SELECT DISTINCT ON (v.caal_id_norm)
        v.caal_id, v.caal_id_norm, v.record_type, v.dataset_label,
        v.display_label,
        COALESCE(v.filter_country_${sfx}, v.filter_country_en,
                 v.filter_country_canonical, v.filter_country) AS country,
        (SELECT string_agg(t, '; ')
           FROM unnest(ARRAY[
             COALESCE(v.list_monument_type1_${sfx}, v.list_monument_type1_en, v.list_monument_type1),
             COALESCE(v.list_monument_type2_${sfx}, v.list_monument_type2_en, v.list_monument_type2),
             COALESCE(v.list_monument_type3_${sfx}, v.list_monument_type3_en, v.list_monument_type3),
             COALESCE(v.list_monument_type4_${sfx}, v.list_monument_type4_en, v.list_monument_type4),
             COALESCE(v.list_monument_type5_${sfx}, v.list_monument_type5_en, v.list_monument_type5),
             COALESCE(v.list_monument_type6_${sfx}, v.list_monument_type6_en, v.list_monument_type6)
           ]) AS t WHERE t IS NOT NULL) AS monument_types,
        array_to_string(v.filter_condition_levels, '; ')     AS condition_levels,
        CASE
          WHEN v.filter_risk_levels IS NULL THEN NULL
          WHEN jsonb_typeof(v.filter_risk_levels) = 'object' THEN
            (SELECT string_agg(key || ': ' || value, '; ')
               FROM jsonb_each_text(v.filter_risk_levels) AS t(key, value))
          WHEN jsonb_typeof(v.filter_risk_levels) = 'array' THEN
            (SELECT string_agg(elem, '; ')
               FROM jsonb_array_elements_text(v.filter_risk_levels) AS t(elem))
          ELSE v.filter_risk_levels #>> '{}'
        END                                                 AS risk_levels,
        ST_AsGeoJSON(v.geom_4326)                           AS geom_geojson,
        CASE WHEN v.centroid_4326 IS NOT NULL THEN ST_X(v.centroid_4326) END AS centroid_lon,
        CASE WHEN v.centroid_4326 IS NOT NULL THEN ST_Y(v.centroid_4326) END AS centroid_lat,
        CASE WHEN v.caal_id_norm IN (SELECT caal_id_norm FROM sel_dedup)
             THEN 'selected' ELSE 'related' END AS export_role
      FROM ${VIEWER_BASE_MV} v
      JOIN export_set es ON es.caal_id_norm = v.caal_id_norm
      ORDER BY v.caal_id_norm, v.record_type
    )
    SELECT * FROM picked
    ORDER BY export_role, record_type, caal_id`;
}

// ---------- Route ----------

router.get("/export", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  if (!requireExportCapability(req, res, session)) return;

  const startedMs = Date.now();
  const lang = viewerLangFromReq(req, session);
  const sfx = EXPORT_LANG_SUFFIXES[lang] || "en";
  const includeRelated = String(req.query.includeRelated || "true") !== "false";
  const centroidsOnly = String(req.query.centroidsOnly || "false") === "true";
  const relationshipLines = String(req.query.relationshipLines || "false") === "true";
  const format = String(req.query.format || "csv").toLowerCase();

  if (format !== "csv" && format !== "gpkg" && format !== "kml") {
    return res.status(400).json({
      ok: false, error: "format_not_available",
      detail: "csv, gpkg and kml are available"
    });
  }

  try {
    const filter = buildViewerWhereSql({
      req, session, baseParamIndex: 1, tableAlias: "v"
    });
    if (!filter.scopes.length || !filter.recordTypes.length) {
      return res.status(400).json({ ok: false, error: "empty_selection" });
    }

    const values = filter.values.slice();
    let scopesParam = null;
    if (includeRelated) {
      scopesParam = `$${values.length + 1}`;
      values.push(filter.scopes);
    }

    // 1. Enforce the cap server-side with the verified estimate
    const estimateSql = buildExportEstimateSql({
      whereSql: filter.whereSql, scopesParam, includeRelated
    });
    const est = (await pool.query(estimateSql, values)).rows[0] || {};
    const selected = Number(est.selected_record_count || 0);
    const total = selected + Number(est.related_record_count || 0);
    if (!selected) {
      return res.status(400).json({ ok: false, error: "empty_selection" });
    }
    const cap = exportLimitFor(format);
    if (total > cap) {
      return res.status(413).json({
        ok: false, error: "over_limit",
        totalUniqueRecordCount: total, limit: cap,
        detail: "Narrow the selection, or untick related records"
      });
    }

    if (format === "gpkg") {
      const ctes = exportCtesSql({
        whereSql: filter.whereSql, scopesParam, includeRelated
      });
      const recordRows =
        (await pool.query(exportRecordsGpkgSql(ctes, sfx), values)).rows;
      const relationshipRows = includeRelated
        ? (await pool.query(exportRelationshipsSql(ctes, sfx), values)).rows
        : [];
 
      let refreshedAt = null;
      try {
        const cache = await pool.query(
          `SELECT COALESCE(checked_at, refreshed_at) AS at
           FROM ui.app_cache_status WHERE cache_key = $1`,
          [EXPORT_BASE_CACHE_KEY]
        );
        refreshedAt = cache.rows[0] ? cache.rows[0].at : null;
      } catch (e) { /* non-fatal */ }
 
      const infoRows = [
        { key: "generated_at", value: new Date().toISOString() },
        { key: "language", value: lang },
        { key: "include_related", value: String(includeRelated) },
        { key: "selected_record_count", value: String(selected) },
        { key: "related_record_count",
          value: String(Number(est.related_record_count || 0)) },
        { key: "relationship_count", value: String(relationshipRows.length) },
        { key: "record_limit", value: String(exportLimitFor(format)) },
        { key: "data_refreshed_at",
          value: refreshedAt ? new Date(refreshedAt).toISOString() : "unknown" },
        { key: "coordinate_reference_system", value: "EPSG:4326 (WGS84 lon/lat)" },
        { key: "geometry_note",
          value: "Full-resolution source geometry; no simplification applied" },
        { key: "filters", value: req.originalUrl.split("?")[1] || "" },
        { key: "source", value: "CAAL Viewer export" }
      ];
 
      const tmpPath = path.join(
        os.tmpdir(),
        `caal_export_${Date.now()}_${Math.random().toString(36).slice(2)}.gpkg`
      );
 
      try {
        writeGeoPackage({
          filePath: tmpPath, recordRows, relationshipRows, infoRows
        });
      } catch (buildError) {
        fs.rm(tmpPath, { force: true }, () => {});
        throw buildError;
      }
 
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const filename = `caal_export_${lang}_${stamp}.gpkg`;
 
      console.log(
        `[viewer export] gpkg lang=${lang} related=${includeRelated} ` +
        `records=${recordRows.length} edges=${relationshipRows.length} ` +
        `ms=${Date.now() - startedMs}`
      );
 
      return res.download(tmpPath, filename, downloadError => {
        fs.rm(tmpPath, { force: true }, () => {});
        if (downloadError) {
          console.error("viewer export gpkg stream failed", downloadError);
        }
      });
    }

    if (format === "kml") {
      const ctes = exportCtesSql({
        whereSql: filter.whereSql, scopesParam, includeRelated
      });
      const recordRows =
        (await pool.query(exportRecordsKmlSql(ctes, sfx), values)).rows;
      const relationshipRows = includeRelated
        ? (await pool.query(exportRelationshipsSql(ctes, sfx), values)).rows
        : [];
 
      // Recompute mode with the same rule the estimate used, honouring centroidsOnly.
      const membership = Number(est.membership_count || 0);
      const relationFolders = Number(est.relation_folder_count || 0);
      const perRecordNodes = centroidsOnly ? 2 : 3;
      const perEdgeNodes = centroidsOnly ? 1 : 2;
      const projectedNodes =
        selected * perRecordNodes + membership * perEdgeNodes + relationFolders;
      const nodeBudget = centroidsOnly ? 8000 : EXPORT_KML_NODE_BUDGET;
      const mode = (selected <= EXPORT_STRUCTURED_KML_MAX_SELECTED &&
                    projectedNodes <= nodeBudget) ? "structured" : "flat";
 
      let refreshedAt = null;
      try {
        const cache = await pool.query(
          `SELECT COALESCE(checked_at, refreshed_at) AS at
           FROM ui.app_cache_status WHERE cache_key = $1`,
          [EXPORT_BASE_CACHE_KEY]
        );
        refreshedAt = cache.rows[0] ? cache.rows[0].at : null;
      } catch (e) { /* non-fatal */ }
 
      const kml = buildKml({
        recordRows,
        relationshipRows,
        mode,
        options: { centroidsOnly, relationshipLines },
        meta: {
          lang,
          selected,
          related: Number(est.related_record_count || 0),
          refreshedAt: refreshedAt ? new Date(refreshedAt).toISOString() : null
        }
      });
 
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const filename = `caal_export_${lang}_${stamp}.kml`;
 
      console.log(
        `[viewer export] kml lang=${lang} mode=${mode} centroids=${centroidsOnly} ` +
        `lines=${relationshipLines} records=${recordRows.length} ` +
        `edges=${relationshipRows.length} ms=${Date.now() - startedMs}`
      );
 
      res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(kml);
    }

    // 2. Fetch rows (bounded by the cap, so in-memory is fine)
    const ctes = exportCtesSql({
      whereSql: filter.whereSql, scopesParam, includeRelated
    });
    const records = (await pool.query(exportRecordsSql(ctes, sfx), values)).rows;
    const relationships = includeRelated
      ? (await pool.query(exportRelationshipsSql(ctes, sfx), values)).rows
      : [];

    // 3. Data-currency stamp for export_information
    let refreshedAt = null;
    try {
      const cache = await pool.query(
        `SELECT COALESCE(checked_at, refreshed_at) AS at
         FROM ui.app_cache_status WHERE cache_key = $1`,
        [EXPORT_BASE_CACHE_KEY]
      );
      refreshedAt = cache.rows[0] ? cache.rows[0].at : null;
    } catch (e) { /* non-fatal */ }

    // 4. Compose the CSV bundle.
    //    records.csv  - common columns only, every row
    //    <type>.csv   - one per record type present, with that type's columns
    //    manifest.csv - what is in the zip and what each file's columns are
    const commonCols = commonFields("csv");
    const recordsCsv = csvFile(
      commonCols,
      records.map(r => rowValues(r, commonCols))
    );

    const byRecordType = new Map();
    for (const r of records) {
      const t = r.record_type || "unknown";
      if (!byRecordType.has(t)) byRecordType.set(t, []);
      byRecordType.get(t).push(r);
    }

    // Record types with an export spec get the full column set from their
    // own MV; everything else keeps the thin common+applicable columns.
    // A failed rich query falls back rather than failing the whole export,
    // and the manifest records which path each file took.
    const layerFiles = [];
    for (const [recordType, rows] of [...byRecordType.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))) {

      let file = null;

      if (EXPORT_SPECS[recordType]) {
        try {
          const typeQuery = exportTypeRecordsSql({
            ctes,
            pickedSql: pickedCteBody(sfx),
            recordType,
            lang,
            commonCols
          });
          const typeRows = (await pool.query(typeQuery.sql, values)).rows;

          // An inner join to the per-type MV can silently drop rows the
          // thin query found — e.g. a workspace whose MV does not exist.
          const dropped = rows.length - typeRows.length;
          if (dropped !== 0) {
            console.warn(
              `[viewer/export] ${recordType}: spec query returned ` +
              `${typeRows.length} of ${rows.length} rows (${dropped} unmatched)`
            );
          }

          file = {
            name: `${recordType}.csv`,
            recordType,
            columns: typeQuery.columns,
            rowCount: typeRows.length,
            columnsSource: dropped === 0 ? "spec" : `spec (${dropped} rows unmatched)`,
            content: csvFile(
              typeQuery.columns,
              typeRows.map(r => rowValues(r, typeQuery.columns))
            )
          };
        } catch (err) {
          console.warn(
            `[viewer/export] ${recordType}: spec query failed, ` +
            `falling back to common columns — ${err.message}`
          );
        }
      }

      if (!file) {
        const cols = fieldsForRecordType(recordType, "csv");
        file = {
          name: `${recordType}.csv`,
          recordType,
          columns: cols,
          rowCount: rows.length,
          columnsSource: "common",
          content: csvFile(cols, rows.map(r => rowValues(r, cols)))
        };
      }

      layerFiles.push(file);
    }

    const RELATIONSHIP_HEADER = [
      "edge_id","from_caal_id","from_display_label","from_record_type",
      "from_role","relationship","to_caal_id","to_display_label",
      "to_record_type","to_role","inverse_relationship"
    ];
    const relationshipsCsv = csvFile(
      RELATIONSHIP_HEADER,
      relationships.map(r => RELATIONSHIP_HEADER.map(f => r[f]))
    );

    const infoRows = [
      ["generated_at", new Date().toISOString()],
      ["language", lang],
      ["include_related", String(includeRelated)],
      ["selected_record_count", String(selected)],
      ["related_record_count", String(Number(est.related_record_count || 0))],
      ["relationship_count", String(relationships.length)],
      ["record_limit", String(exportLimitFor(format))],
      ["data_refreshed_at", refreshedAt ? new Date(refreshedAt).toISOString() : "unknown"],
      ["coordinate_reference_system", "EPSG:4326 (WGS84 lon/lat)"],
      ["geometry_note",
       `geometry_wkt omitted and geometry_truncated=true when WKT exceeds ${EXPORT_WKT_MAX_CHARS} chars; use centroid or a GIS format for full geometry`],
      ["column_note",
       "Per-record-type files carry only the columns that apply to that type. A column absent from a file means the concept does not exist for that record type, not that the value is unrecorded."],
      ["filters", req.originalUrl.split("?")[1] || ""],
      ["source", "CAAL Viewer export"]
    ];
    const infoCsv = csvFile(["key", "value"], infoRows);

    const manifestCsv = csvFile(
      ["file", "record_type", "row_count", "column_count", "columns_source", "columns"],
      [
        ["records.csv", "(all types)", String(records.length),
         String(commonCols.length), commonCols.join("; ")],
        ...layerFiles.map(f => [
          f.name, f.recordType, String(f.rowCount),
          String(f.columns.length), f.columnsSource, f.columns.join("; ")
        ]),
        ...(includeRelated ? [[
          "relationships.csv", "(edges)", String(relationships.length),
          String(RELATIONSHIP_HEADER.length), RELATIONSHIP_HEADER.join("; ")
        ]] : []),
        ["export_information.csv", "(provenance)", String(infoRows.length),
         "2", "key; value"]
      ]
    );

    // 5. Stream the zip
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const filename = `caal_export_${lang}_${stamp}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const zip = archiver("zip", { zlib: { level: 6 } });
    zip.on("error", err => { throw err; });
    zip.pipe(res);
    zip.append(manifestCsv, { name: "manifest.csv" });
    zip.append(recordsCsv, { name: "records.csv" });
    for (const f of layerFiles) zip.append(f.content, { name: f.name });
    if (includeRelated) zip.append(relationshipsCsv, { name: "relationships.csv" });
    zip.append(infoCsv, { name: "export_information.csv" });
    await zip.finalize();

    console.log(
      `[viewer export] csv lang=${lang} related=${includeRelated} ` +
      `records=${records.length} edges=${relationships.length} ` +
      `ms=${Date.now() - startedMs}`
    );
  } catch (error) {
    console.error("viewer export failed", error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "export_failed" });
    } else {
      res.end();
    }
  }
});



// cache status bar read endpoint
router.get("/cache-status", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const result = await pool.query(
      `
      SELECT
        cache_key,
        refreshed_at,
        refreshed_by,
        checked_at,
        checked_by,
        COALESCE(checked_at, refreshed_at) AS display_at,
        note
      FROM ui.app_cache_status
      WHERE cache_key = 'resource_viewer_base_cache'
      LIMIT 1
      `
    );

    return res.json({
      ok: true,
      status: result.rows[0] || null
    });
  } catch (error) {
    console.error("Viewer cache status fetch failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Viewer cache status fetch failed",
      detail: error.message
    });
  }
});

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
      fieldApplicability: CONDITIONAL_FIELDS,
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
          lower(btrim(v.caal_id)) AS caal_id_norm,
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
            WHEN 'monument' THEN 1
            WHEN 'rs3_poly' THEN 2
            WHEN 'rs3_line' THEN 3
            WHEN 'rs3_group' THEN 4
            WHEN 'vernacular' THEN 5
            WHEN 'archive' THEN 6
            WHEN 'institution' THEN 7
            WHEN 'dataset' THEN 8
            WHEN 'cartography' THEN 9
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
          'Monument type5', b.list_monument_type5,
          'Monument type6', b.list_monument_type6,
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
          lower(btrim(v.caal_id)) AS caal_id_norm,
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
          'Monument type5', b.list_monument_type5,
          'Monument type6', b.list_monument_type6,
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

  const requestedLayers =
    requestedViewerLayerTypes(req);

  const lang =
    viewerLangFromReq(req, session);

  const rsDisplayZoomBand =
    viewerRsDisplayZoomBand(req.query.zoom);

  try {
    const layers = {};

    for (const recordType of requestedLayers) {
      if (
        VIEWER_REFERENCE_LAYERS.has(recordType)
      ) {
        layers[recordType] =
          await loadReferenceLayer(
            recordType,
            req
          );

        continue;
      }

      const mvName =
        VIEWER_LAYER_MVS[recordType];

      if (!mvName) {
        layers[recordType] =
          emptyFeatureCollection();

        continue;
      }

      const filter = buildViewerWhereSql({
        req,
        session,
        baseParamIndex: 1,
        tableAlias: "v"
      });

      if (!filter.scopes.length) {
        layers[recordType] =
          emptyFeatureCollection();

        continue;
      }

      const useRsDisplayGeometry =
        rsDisplayZoomBand !== null &&
        VIEWER_RS_RECORD_TYPES.has(
          recordType
        );

      const forcedRecordTypeParam =
        filter.values.length + 1;

      const surveyExtraSelectSql =
        surveyMapExtraSelectSql(recordType);

      let displayJoinSql = "";
      let geometrySelectSql = "";
      let queryValues = [];

      if (useRsDisplayGeometry) {
        const displayZoomBandParam =
          filter.values.length + 2;

        displayJoinSql = `
          LEFT JOIN ${VIEWER_RS_DISPLAY_MV} d
            ON  d.source_schema =
                v.source_schema
            AND d.source_table =
                v.source_table
            AND d.source_row_id =
                v.source_row_id
            AND d.record_type =
                v.record_type
            AND d.zoom_band =
                $${displayZoomBandParam}::integer
        `;

        /*
          The display MV has already been simplified,
          buffered and repaired. Do not simplify it again.
        */
        geometrySelectSql = `
          CASE
            WHEN d.display_geom_4326
                 IS NOT NULL
            THEN ST_AsGeoJSON(
              d.display_geom_4326,
              6
            )::json

            ELSE ST_AsGeoJSON(
              v.geom_4326,
              6
            )::json
          END AS geometry,

          (
            d.display_geom_4326 IS NOT NULL
          ) AS is_display_geometry,

          d.zoom_band AS display_zoom_band
        `;

        queryValues = [
          ...filter.values,
          recordType,
          rsDisplayZoomBand
        ];
      } else {
        const simplifyParam =
          filter.values.length + 2;

        const simplifyTolerance =
          mapSimplifyToleranceForZoom(
            req.query.zoom
          );

        geometrySelectSql = `
          CASE
            WHEN
              $${simplifyParam}::double precision
                > 0

              AND GeometryType(
                v.geom_4326
              ) IN (
                'MULTIPOLYGON',
                'POLYGON',
                'MULTILINESTRING',
                'LINESTRING'
              )

            THEN ST_AsGeoJSON(
              ST_SimplifyPreserveTopology(
                v.geom_4326,
                $${simplifyParam}
                  ::double precision
              ),
              6
            )::json

            ELSE ST_AsGeoJSON(
              v.geom_4326,
              6
            )::json
          END AS geometry,

          false AS is_display_geometry,

          NULL::integer AS display_zoom_band
        `;

        queryValues = [
          ...filter.values,
          recordType,
          simplifyTolerance
        ];
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

          ${
            viewerMonumentTypePathDisplaySql(
              "b",
              lang
            )
          } AS monument_type_path,

          ${surveyExtraSelectSql},

          ${
            sourceScopeCaseSql("$1", "v")
          } AS source_scope,

          ${
            storageScopeCaseSql("v")
          } AS storage_scope,

          ${
            isEditableSql("$1", "v")
          } AS is_editable,

          ${geometrySelectSql}

        FROM ${sqlIdentFromSafeMv(mvName)} v

        LEFT JOIN ${VIEWER_BASE_MV} b
          ON  b.source_schema =
              v.source_schema
          AND b.source_table =
              v.source_table
          AND b.source_row_id =
              v.source_row_id
          AND b.record_type =
              v.record_type

        ${displayJoinSql}

        ${filter.whereSql}
          AND v.record_type =
              $${forcedRecordTypeParam}

        ORDER BY
          v.display_label NULLS LAST,
          v.caal_id
        `,
        queryValues
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
      rs_display_zoom_band:
        rsDisplayZoomBand,
      layers
    });
  } catch (error) {
    console.error(
      "Resource viewer map failed:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Failed to load viewer map layers",
      detail: error.message
    });
  }
});

function viewerClusterCellSizeForZoom(zoomValue) {
  const zoom = Number(zoomValue);

  if (!Number.isFinite(zoom)) return 2.5;

  if (zoom < 4) return 4.0;
  if (zoom < 5) return 2.5;
  if (zoom < 6) return 1.4;
  if (zoom < 7) return 0.7;
  if (zoom < 8) return 0.35;

  return 0;
}

router.get("/clusters", async (req, res) => {
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
        mode: "clusters",
        clusters: {
          type: "FeatureCollection",
          features: []
        }
      });
    }

    const cellSize = viewerClusterCellSizeForZoom(req.query.zoom);

    if (cellSize <= 0) {
      return res.json({
        ok: true,
        mode: "clusters",
        clusters: {
          type: "FeatureCollection",
          features: []
        }
      });
    }

    const cellParam = filter.values.length + 1;

    const result = await pool.query(
      `
      WITH filtered AS (
        SELECT
          v.record_type,
          v.centroid_4326
        FROM ${VIEWER_BASE_MV} v
        ${filter.whereSql}
          AND v.centroid_4326 IS NOT NULL
      ),
      grouped AS (
        SELECT
          record_type,
          ST_SnapToGrid(centroid_4326, $${cellParam}::double precision) AS grid_geom,
          COUNT(*)::integer AS point_count,
          ST_X(ST_Centroid(ST_Collect(centroid_4326)))::double precision AS lng,
          ST_Y(ST_Centroid(ST_Collect(centroid_4326)))::double precision AS lat
        FROM filtered
        GROUP BY
          record_type,
          ST_SnapToGrid(centroid_4326, $${cellParam}::double precision)
      )
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(
                ST_SetSRID(ST_MakePoint(lng, lat), 4326),
                6
              )::jsonb,
              'properties', jsonb_build_object(
                'record_type', record_type,
                'point_count', point_count
              )
            )
            ORDER BY point_count DESC
          ),
          '[]'::jsonb
        )
      ) AS geojson
      FROM grouped
      `,
      [...filter.values, cellSize]
    );

    return res.json({
      ok: true,
      mode: "clusters",
      cell_size: cellSize,
      clusters: result.rows[0]?.geojson || {
        type: "FeatureCollection",
        features: []
      }
    });
  } catch (error) {
    console.error("Resource viewer clusters failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load viewer clusters",
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
          v.details_json,
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
          v.details_json,
          ${sourceScopeCaseSql("$1", "v")} AS source_scope,
          ${storageScopeCaseSql("v")} AS storage_scope,
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

    const rawSourceRow = await loadViewerRawSourceRow(identityRow);

    const record = buildViewerRecord({
      ...identityRow,

      // Full detail pane uses original table fields.
      raw: rawSourceRow || {},

      // Optional structured sections stay separate.
      detail_sections: viewerStructuredDetailSections(identityRow.details_json)
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
        SELECT
          record_type,
          COUNT(DISTINCT (source_schema, source_table, source_row_id, record_type))::integer AS n
        FROM members
        GROUP BY record_type
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
          COUNT(DISTINCT (b.source_schema, b.source_table, b.source_row_id, b.record_type))::integer AS n
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
  const session = requireSession(req, res);
  if (!session) return;

  const caalId = String(
    req.query.caal_id ||
    req.query.caalId ||
    ""
  ).trim();

  if (!caalId) {
    return res.status(400).json({
      ok: false,
      error: "caal_id is required"
    });
  }

  const workspaceCode =
    getSessionWorkspaceCode(session) || "caal";

  const allowedScopes = allowedScopesForSession(session);

  if (!allowedScopes.length) {
    return res.status(403).json({
      ok: false,
      error: "No permitted viewer scopes"
    });
  }

  try {
    const result = await pool.query(
      `
      WITH selected_candidates AS (
        SELECT
          v.*,
          ${sourceScopeCaseSql("$2", "v")} AS source_scope
        FROM ${VIEWER_BASE_MV} v
        WHERE lower(btrim(v.caal_id)) =
              lower(btrim($1::text))
          AND v.geom_4326 IS NOT NULL
          AND ${sourceScopeCaseSql("$2", "v")} =
              ANY($3::text[])
      ),

      selected_record AS (
        SELECT *
        FROM selected_candidates
        ORDER BY
          CASE record_type
            WHEN 'monument' THEN 1
            WHEN 'archive' THEN 2
            WHEN 'rs3_poly' THEN 3
            WHEN 'rs3_group' THEN 4
            WHEN 'rs3_line' THEN 5
            WHEN 'institution' THEN 6
            WHEN 'vernacular' THEN 7
            WHEN 'dataset' THEN 8
            WHEN 'cartography' THEN 9
            ELSE 99
          END,
          source_schema,
          source_table,
          source_row_id
        LIMIT 1
      ),

      relation_edges AS (
        SELECT
          r.edge_id,
          lower(btrim(r.related_caal_id))
            AS related_caal_id_norm,

          r.relation_type,
          r.relation_type_norm,
          r.relation_direction
        FROM ui.mv_resource_related_search r
        WHERE lower(btrim(r.returned_caal_id)) =
              lower(btrim($1::text))
          AND r.related_caal_id IS NOT NULL
          AND btrim(r.related_caal_id) <> ''
          AND lower(btrim(r.related_caal_id)) <>
              lower(btrim($1::text))
      ),

      related_candidates AS (
        SELECT
          e.edge_id,
          e.relation_type,
          e.relation_type_norm,
          e.relation_direction,

          v.*,
          ${sourceScopeCaseSql("$2", "v")} AS source_scope
        FROM relation_edges e
        JOIN ${VIEWER_BASE_MV} v
          ON lower(btrim(v.caal_id)) =
             e.related_caal_id_norm
        WHERE v.geom_4326 IS NOT NULL
          AND ${sourceScopeCaseSql("$2", "v")} =
              ANY($3::text[])
      ),

      /*
        One mapped representation per related CAAL_ID.

        This prevents the same relationship appearing several times where
        the identity MV contains more than one source representation.
      */
      related_records AS (
        SELECT DISTINCT ON (
          lower(btrim(caal_id))
        )
          *
        FROM related_candidates
        ORDER BY
          lower(btrim(caal_id)),

          CASE record_type
            WHEN 'monument' THEN 1
            WHEN 'archive' THEN 2
            WHEN 'rs3_poly' THEN 3
            WHEN 'rs3_group' THEN 4
            WHEN 'rs3_line' THEN 5
            WHEN 'institution' THEN 6
            WHEN 'vernacular' THEN 7
            WHEN 'dataset' THEN 8
            WHEN 'cartography' THEN 9
            ELSE 99
          END,

          source_schema,
          source_table,
          source_row_id
      ),

      related_aggregated AS (
        SELECT
          lower(btrim(caal_id)) AS caal_id_norm,

          min(caal_id) AS caal_id,
          min(record_type) AS record_type,
          min(dataset_label) AS dataset_label,
          min(display_label) AS display_label,
          min(source_schema) AS source_schema,
          min(source_table) AS source_table,
          min(source_row_id::text) AS source_row_id,
          min(source_scope) AS source_scope,

          (array_agg(geom_4326))[1] AS geom_4326,

          array_agg(
            DISTINCT relation_type
          ) FILTER (
            WHERE relation_type IS NOT NULL
          ) AS relation_types,

          array_agg(
            DISTINCT relation_type_norm
          ) FILTER (
            WHERE relation_type_norm IS NOT NULL
          ) AS relation_type_norms,

          array_agg(
            DISTINCT relation_direction
          ) FILTER (
            WHERE relation_direction IS NOT NULL
          ) AS relation_directions,

          array_agg(
            DISTINCT edge_id
          ) FILTER (
            WHERE edge_id IS NOT NULL
          ) AS edge_ids
        FROM related_records
        GROUP BY lower(btrim(caal_id))
      )

      SELECT
        (
          SELECT jsonb_build_object(
            'caal_id', s.caal_id,
            'record_type', s.record_type,
            'dataset_label', s.dataset_label,
            'display_label', s.display_label,
            'source_schema', s.source_schema,
            'source_table', s.source_table,
            'source_row_id', s.source_row_id,
            'source_scope', s.source_scope,

            'geometry',
              ST_AsGeoJSON(s.geom_4326, 6)::jsonb,

            'representative_point',
              ST_AsGeoJSON(
                ST_PointOnSurface(s.geom_4326),
                6
              )::jsonb
          )
          FROM selected_record s
        ) AS selected,

        jsonb_build_object(
          'type',
          'FeatureCollection',

          'features',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'type',
                  'Feature',

                  'geometry',
                  ST_AsGeoJSON(
                    r.geom_4326,
                    6
                  )::jsonb,

                  'properties',
                  jsonb_build_object(
                    'caal_id',
                    r.caal_id,

                    'record_type',
                    r.record_type,

                    'dataset_label',
                    r.dataset_label,

                    'display_label',
                    r.display_label,

                    'source_schema',
                    r.source_schema,

                    'source_table',
                    r.source_table,

                    'source_row_id',
                    r.source_row_id,

                    'source_scope',
                    r.source_scope,

                    'relation_types',
                    to_jsonb(
                      COALESCE(
                        r.relation_types,
                        ARRAY[]::text[]
                      )
                    ),

                    'relation_type_norms',
                    to_jsonb(
                      COALESCE(
                        r.relation_type_norms,
                        ARRAY[]::text[]
                      )
                    ),

                    'relation_directions',
                    to_jsonb(
                      COALESCE(
                        r.relation_directions,
                        ARRAY[]::text[]
                      )
                    ),

                    'edge_ids',
                    to_jsonb(
                      COALESCE(
                        r.edge_ids,
                        ARRAY[]::bigint[]
                      )
                    )
                  )
                )
                ORDER BY
                  r.record_type,
                  r.display_label NULLS LAST,
                  r.caal_id
              )
              FROM related_aggregated r
            ),
            '[]'::jsonb
          )
        ) AS related,

        jsonb_build_object(
          'type',
          'FeatureCollection',

          'features',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'type',
                  'Feature',

                  'geometry',
                  ST_AsGeoJSON(
                    ST_MakeLine(
                      ST_PointOnSurface(s.geom_4326),
                      ST_PointOnSurface(r.geom_4326)
                    ),
                    6
                  )::jsonb,

                  'properties',
                  jsonb_build_object(
                    'related_caal_id',
                    r.caal_id,

                    'related_record_type',
                    r.record_type,

                    'relation_types',
                    to_jsonb(
                      COALESCE(
                        r.relation_types,
                        ARRAY[]::text[]
                      )
                    ),

                    'relation_directions',
                    to_jsonb(
                      COALESCE(
                        r.relation_directions,
                        ARRAY[]::text[]
                      )
                    )
                  )
                )
              )
              FROM related_aggregated r
              CROSS JOIN selected_record s
            ),
            '[]'::jsonb
          )
        ) AS relationship_lines,

        (
          SELECT count(*)::integer
          FROM related_aggregated
        ) AS mapped_related_count
      `,
      [
        caalId,
        workspaceCode,
        allowedScopes
      ]
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

      related: row.related || {
        type: "FeatureCollection",
        features: []
      },

      relationship_lines:
        row.relationship_lines || {
          type: "FeatureCollection",
          features: []
        },

      mapped_related_count:
        Number(row.mapped_related_count || 0)
    });
  } catch (error) {
    console.error("Related map failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Related map failed",
      detail: error.message
    });
  }
});

module.exports = router;