const express = require("express");
const pool = require("./db");

const router = express.Router();

// ========================================================
// CONFIG
// ========================================================

const MONUMENTS_WORKSPACE_TABLE = 'kz."CAAL_Monuments"';
const MONUMENTS_CAAL_TABLE = 'public."CAAL_Monuments"';
const MONUMENTS_VIEW = 'kz.v_monuments_grid_base';
const GEOM_COLUMN_SQL = `"geom"`;

const MONUMENTS_CAAL_MV = "ui.mv_monuments_caal";


// ========================================================
// HELPERS
// ========================================================

// this uses a national filter on the CAAL dataset as too costly to build MV on CAAL + REF
const NATIONAL_REF_WHERE = `
  "CAAL_ID" LIKE 'Mon_KZ_%'
  OR btrim(coalesce("Country", '')) IN ('Kazakhstan', 'Казахстан')
`;

const ALLOWED_MONUMENT_LANGS = new Set([
  "en", "ru", "zh", "kk", "ky", "tg", "tk", "uz"
]);

function safeMonumentLang(lang) {
  return ALLOWED_MONUMENT_LANGS.has(lang) ? lang : "en";
}

const MONUMENT_INTERNAL_HELPER_FIELDS = [
  "search_blob_en",
  "search_blob_ru",
  "search_blob_zh",
  "search_blob_kk",
  "search_blob_ky",
  "search_blob_tg",
  "search_blob_tk",
  "search_blob_uz",
  "monument_types_arr",
  "religions_arr",
  "cultural_periods_arr"
];

function stripMonumentInternalFields(row) {
  const clean = { ...row };

  for (const field of MONUMENT_INTERNAL_HELPER_FIELDS) {
    delete clean[field];
  }

  return clean;
}

//dynamic helper SQL for workspace compatibility to MV columnes
function monumentHelperColumnsSql(alias = "") {
  const p = alias ? `${alias}.` : "";

  const commonFields = `
    ${p}"CAAL_ID",
    ${p}"Primary Name",
    ${p}"Primary Name (English)",
    ${p}"Other Names",
    ${p}"Region",
    ${p}"Internal Reference",
    ${p}"External Reference",
    ${p}"Monument Passport",
    ${p}"Descriptive Date",
    ${p}"Primary Description",
    ${p}"Primary Description (English)",
    ${p}"Additional Notes",
    ${p}"Primary Address",
    ${p}"Administrative Subdivision Name1",
    ${p}"Administrative Subdivision Name2",
    ${p}"Administrative Subdivision Name3",
    ${p}"Administrative Subdivision Name4",
    ${p}"World Heritage Site Name",

    ${p}"Country",
    ${p}"Classification",
    ${p}"Designation",
    ${p}"Monument Type1",
    ${p}"Monument Type2",
    ${p}"Monument Type3",
    ${p}"Monument Type4",
    ${p}"Monument Type5",
    ${p}"Monument Type6",
    ${p}"Religion1",
    ${p}"Religion2",
    ${p}"Religion3",
    ${p}"Cultural Period1",
    ${p}"Cultural Period2",
    ${p}"Cultural Period3",
    ${p}"Cultural Period4",
    ${p}"Cultural Period5",
    ${p}"Cultural Period6",
    ${p}"Administrative Subdivision Type1",
    ${p}"Administrative Subdivision Type2",
    ${p}"Administrative Subdivision Type3",
    ${p}"Administrative Subdivision Type4"
  `;

  function langBlob(lang) {
    return `
      lower(concat_ws(' ',
        ${commonFields},

        ${p}country_${lang},
        ${p}classification_${lang},
        ${p}designation_${lang},
        ${p}monument_type1_${lang},
        ${p}monument_type2_${lang},
        ${p}monument_type3_${lang},
        ${p}monument_type4_${lang},
        ${p}monument_type5_${lang},
        ${p}monument_type6_${lang},
        ${p}religion1_${lang},
        ${p}religion2_${lang},
        ${p}religion3_${lang},
        ${p}cultural_period1_${lang},
        ${p}cultural_period2_${lang},
        ${p}cultural_period3_${lang},
        ${p}cultural_period4_${lang},
        ${p}cultural_period5_${lang},
        ${p}cultural_period6_${lang},
        ${p}admin_subdivision_type1_${lang},
        ${p}admin_subdivision_type2_${lang},
        ${p}admin_subdivision_type3_${lang},
        ${p}admin_subdivision_type4_${lang}
      )) AS search_blob_${lang}
    `;
  }

  return `
    ${langBlob("en")},
    ${langBlob("ru")},
    ${langBlob("zh")},
    ${langBlob("kk")},
    ${langBlob("ky")},
    ${langBlob("tg")},
    ${langBlob("tk")},
    ${langBlob("uz")},

    ARRAY_REMOVE(ARRAY[
      NULLIF(btrim(${p}"Monument Type1"), ''),
      NULLIF(btrim(${p}"Monument Type2"), ''),
      NULLIF(btrim(${p}"Monument Type3"), ''),
      NULLIF(btrim(${p}"Monument Type4"), ''),
      NULLIF(btrim(${p}"Monument Type5"), ''),
      NULLIF(btrim(${p}"Monument Type6"), '')
    ], NULL) AS monument_types_arr,

    ARRAY_REMOVE(ARRAY[
      NULLIF(btrim(${p}"Religion1"), ''),
      NULLIF(btrim(${p}"Religion2"), ''),
      NULLIF(btrim(${p}"Religion3"), '')
    ], NULL) AS religions_arr,

    ARRAY_REMOVE(ARRAY[
      NULLIF(btrim(${p}"Cultural Period1"), ''),
      NULLIF(btrim(${p}"Cultural Period2"), ''),
      NULLIF(btrim(${p}"Cultural Period3"), ''),
      NULLIF(btrim(${p}"Cultural Period4"), ''),
      NULLIF(btrim(${p}"Cultural Period5"), ''),
      NULLIF(btrim(${p}"Cultural Period6"), '')
    ], NULL) AS cultural_periods_arr
  `;
}

const browseScopeConfig = {
  workspace: {
    sql: `
      SELECT
        v.*,
        ${monumentHelperColumnsSql("v")},
        'workspace'::text AS source_scope,
        true AS is_editable
      FROM kz.v_monuments_grid_base v
    `
  },
  national_ref: {
    sql: `
      SELECT
        *,
        'national_ref'::text AS source_scope,
        false AS is_editable
      FROM ${MONUMENTS_CAAL_MV}
      WHERE ${NATIONAL_REF_WHERE}
    `
  },
  all_caal: {
    sql: `
      SELECT
        *,
        CASE
          WHEN ${NATIONAL_REF_WHERE} THEN 'national_ref'
          ELSE 'all_caal'
        END::text AS source_scope,
        false AS is_editable
      FROM ${MONUMENTS_CAAL_MV}
    `
  }
};

function parseScopes(scopesParam) {
  if (!scopesParam) {
    return ["workspace", "national_ref"];
  }

  return String(scopesParam)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeRequestedScopes(scopes) {
  const set = new Set(scopes);

  // national_ref is a subset of all_caal, so do not query both
  if (set.has("all_caal") && set.has("national_ref")) {
    set.delete("national_ref");
  }

  return Array.from(set);
}

function unique(values) {
  return Array.from(new Set(values));
}

function getAllowedScopes(session) {
  const allowed = [];

  if (session?.permissions?.can_view_workspace) {
    allowed.push("workspace");
    allowed.push("national_ref");
  }

  if (session?.permissions?.can_view_all_caal) {
    allowed.push("all_caal");
  }

  return unique(allowed);
}

function buildBrowseUnionSql(scopes) {
  return scopes.map((scope) => browseScopeConfig[scope].sql).join("\nUNION ALL\n");
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function blankToNull(value) {
  return value === "" ? null : value;
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function validateMonumentCreateLocation(payload) {
  const lngRaw = payload["Longitude"];
  const latRaw = payload["Latitude"];

  const hasLng =
    lngRaw !== null &&
    lngRaw !== undefined &&
    String(lngRaw).trim() !== "";

  const hasLat =
    latRaw !== null &&
    latRaw !== undefined &&
    String(latRaw).trim() !== "";

  if (!hasLng && !hasLat) {
    return {
      ok: false,
      error: "New monument records require either a map point or manual longitude and latitude."
    };
  }

  if (!hasLng || !hasLat) {
    return {
      ok: false,
      error: "Both longitude and latitude are required for new monument records."
    };
  }

  const lng = Number(lngRaw);
  const lat = Number(latRaw);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return {
      ok: false,
      error: "Longitude and latitude must be valid numbers."
    };
  }

  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return {
      ok: false,
      error: "Longitude must be between -180 and 180, and latitude must be between -90 and 90."
    };
  }

  return {
    ok: true,
    lng,
    lat
  };
}

function pickLangValue(row, baseName, lang, fallbackOrder = []) {
  const direct = row[`${baseName}_${lang}`];
  if (direct !== undefined && direct !== null && direct !== "") {
    return direct;
  }

  for (const key of fallbackOrder) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function getRepeatedValues(row, fieldNames) {
  return fieldNames
    .map((field) => row[field])
    .filter((value) => value !== null && value !== undefined && value !== "");
}

function buildGeometry(row) {
  const lng = firstDefined(row["Longitude"], row.longitude, row.geom_lng);
  const lat = firstDefined(row["Latitude"], row.latitude, row.geom_lat);

  if (
    lng === null || lng === undefined || lng === "" ||
    lat === null || lat === undefined || lat === ""
  ) {
    return null;
  }

  const numLng = Number(lng);
  const numLat = Number(lat);

  if (!Number.isFinite(numLng) || !Number.isFinite(numLat)) {
    return null;
  }

  return {
    type: "Point",
    coordinates: [numLng, numLat]
  };
}

function buildMonumentRecord(row, lang, currentAppUserId = null, canEditCaal = false) {
  return {
    identity: {
      id: row.id,
      caal_id: row["CAAL_ID"]
    },

    summary: {
      primary_name: firstDefined(row["Primary Name"], row.primary_name),
      primary_name_english: firstDefined(row["Primary Name (English)"], row.primary_name_english),
      country: pickLangValue(row, "country", lang, ["Country"]),
      region: firstDefined(row["Region"], row.region),
      classification: pickLangValue(row, "classification", lang, ["Classification"]),
      designation: pickLangValue(row, "designation", lang, ["Designation"]),
      monument_type1: pickLangValue(row, "monument_type1", lang, ["Monument Type1"]),
      cultural_period1: pickLangValue(row, "cultural_period1", lang, ["Cultural Period1"]),
      religion1: pickLangValue(row, "religion1", lang, ["Religion1"]),
      longitude: firstDefined(row["Longitude"], row.longitude, row.geom_lng),
      latitude: firstDefined(row["Latitude"], row.latitude, row.geom_lat),
      recorder: firstDefined(row["Recorder"], row.recorder),
      date_of_recording: firstDefined(row["Date of Recording"], row.date_of_recording)
    },

    raw: row,

    geometry: buildGeometry(row),

    source: {
      scope: row.source_scope || "workspace",
      is_editable:
        canEditCaal ||
        (
          row.source_scope === "workspace" &&
          currentAppUserId !== null &&
          Number(row.created_by_app_user_id) === Number(currentAppUserId)
        )
    },

    filter_values: {
      monument_types: getRepeatedValues(row, [
        "Monument Type1", "Monument Type2", "Monument Type3",
        "Monument Type4", "Monument Type5", "Monument Type6"
      ]),
      religions: getRepeatedValues(row, ["Religion1", "Religion2", "Religion3"]),
      cultural_periods: getRepeatedValues(row, [
        "Cultural Period1", "Cultural Period2", "Cultural Period3",
        "Cultural Period4", "Cultural Period5", "Cultural Period6"
      ]),
      classification: firstDefined(row["Classification"], row.classification),
      designation: firstDefined(row["Designation"], row.designation),
      country: firstDefined(row["Country"], row.country)
    }
  };
}

function buildMonumentListRecord(row, lang, currentAppUserId = null, canEditCaal = false) {
  const raw = {
    id: row.id,
    "CAAL_ID": row["CAAL_ID"],
    "Primary Name": row["Primary Name"],
    "Primary Name (English)": row["Primary Name (English)"],
    "Classification": row["Classification"],
    "Monument Type1": row["Monument Type1"],
    "Longitude": row["Longitude"],
    "Latitude": row["Latitude"],
    created_by_app_user_id: row.created_by_app_user_id,
    source_scope: row.source_scope
  };

  return {
    identity: {
      id: row.id,
      caal_id: row["CAAL_ID"]
    },

    summary: {
      primary_name: row["Primary Name"],
      primary_name_english: row["Primary Name (English)"],
      classification: row.classification_display || row["Classification"],
      monument_type1: row.monument_type1_display || row["Monument Type1"],
      longitude: firstDefined(row["Longitude"], row.longitude, row.geom_lng),
      latitude: firstDefined(row["Latitude"], row.latitude, row.geom_lat)
    },

    raw,

    geometry: buildGeometry(row),

    source: {
      scope: row.source_scope || "workspace",
      is_editable:
        canEditCaal ||
        (
          row.source_scope === "workspace" &&
          currentAppUserId !== null &&
          Number(row.created_by_app_user_id) === Number(currentAppUserId)
        )
    },

    filter_values: {
      monument_types: row["Monument Type1"] ? [row["Monument Type1"]] : [],
      religions: row["Religion1"] ? [row["Religion1"]] : [],
      cultural_periods: row["Cultural Period1"] ? [row["Cultural Period1"]] : [],
      classification: row["Classification"],
      designation: row["Designation"],
      country: row["Country"]
    },

    is_lightweight_record: true
  };
}

function buildMonumentMapRecord(row, lang, currentAppUserId = null, canEditCaal = false) {
  const raw = {
    id: row.id,
    "CAAL_ID": row["CAAL_ID"],
    "Primary Name": row["Primary Name"],
    "Primary Name (English)": row["Primary Name (English)"],
    "Country": row["Country"],
    "Region": row["Region"],
    "Classification": row["Classification"],
    "Designation": row["Designation"],
    "Monument Type1": row["Monument Type1"],
    "Cultural Period1": row["Cultural Period1"],
    "Religion1": row["Religion1"],
    "Longitude": row["Longitude"],
    "Latitude": row["Latitude"],
    created_by_app_user_id: row.created_by_app_user_id,
    source_scope: row.source_scope
  };

  return {
    identity: {
      id: row.id,
      caal_id: row["CAAL_ID"]
    },

    summary: {
      primary_name: row["Primary Name"],
      primary_name_english: row["Primary Name (English)"],
      country: row.country_display || row["Country"],
      region: row["Region"],
      classification: row.classification_display || row["Classification"],
      designation: row.designation_display || row["Designation"],
      monument_type1: row.monument_type1_display || row["Monument Type1"],
      cultural_period1: row.cultural_period1_display || row["Cultural Period1"],
      religion1: row.religion1_display || row["Religion1"],
      longitude: firstDefined(row["Longitude"], row.longitude, row.geom_lng),
      latitude: firstDefined(row["Latitude"], row.latitude, row.geom_lat)
    },

    raw,

    geometry: buildGeometry(row),

    source: {
      scope: row.source_scope || "workspace",
      is_editable:
        canEditCaal ||
        (
          row.source_scope === "workspace" &&
          currentAppUserId !== null &&
          Number(row.created_by_app_user_id) === Number(currentAppUserId)
        )
    },

    filter_values: {
      monument_types: row["Monument Type1"] ? [row["Monument Type1"]] : [],
      religions: row["Religion1"] ? [row["Religion1"]] : [],
      cultural_periods: row["Cultural Period1"] ? [row["Cultural Period1"]] : [],
      classification: row["Classification"],
      designation: row["Designation"],
      country: row["Country"]
    },

    is_map_record: true
  };
}

function canEditMonuments(session) {
  return !!session?.permissions?.can_edit_workspace;
}

function parseCsvParam(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .replace(/[-‐-‒–—]+/g, " ");
}

function hasExpensiveFreeTextSearch(req) {
  return Boolean(normalizeSearchText(req.query.text));
}

function estimateReturnedTotal({ offset, limit, rowCount, exactTotal = null }) {
  if (exactTotal !== null && exactTotal !== undefined) {
    return Number(exactTotal);
  }

  // If a full page came back, report one extra row so the frontend can still allow Next.
  return offset + rowCount + (rowCount === limit ? 1 : 0);
}

function buildMonumentFilterWhere(req, lang = "en") {
  const clauses = [];
  const values = [];
  let index = 1;

  const safeLang = safeMonumentLang(lang);
  const text = normalizeSearchText(req.query.text).toLowerCase();
  const caalId = String(req.query.caalId || "").trim();

  const monumentTypes = parseCsvParam(req.query.monumentTypes);
  const classifications = parseCsvParam(req.query.classifications);
  const designations = parseCsvParam(req.query.designations);
  const religions = parseCsvParam(req.query.religions);
  const culturalPeriods = parseCsvParam(req.query.culturalPeriods);
  const countries = parseCsvParam(req.query.countries);

  if (caalId) {
    clauses.push(`"CAAL_ID" ILIKE $${index}`);
    values.push(`%${caalId}%`);
    index += 1;
  }

  if (text) {
    clauses.push(`search_blob_${safeLang} ILIKE $${index}`);
    values.push(`%${text}%`);
    index += 1;
  }

  if (classifications.length) {
    clauses.push(`"Classification" = ANY($${index}::text[])`);
    values.push(classifications);
    index += 1;
  }

  if (designations.length) {
    clauses.push(`"Designation" = ANY($${index}::text[])`);
    values.push(designations);
    index += 1;
  }

  if (countries.length) {
    clauses.push(`"Country" = ANY($${index}::text[])`);
    values.push(countries);
    index += 1;
  }

  if (monumentTypes.length) {
    clauses.push(`monument_types_arr && $${index}::text[]`);
    values.push(monumentTypes);
    index += 1;
  }

  if (religions.length) {
    clauses.push(`religions_arr && $${index}::text[]`);
    values.push(religions);
    index += 1;
  }

  if (culturalPeriods.length) {
    clauses.push(`cultural_periods_arr && $${index}::text[]`);
    values.push(culturalPeriods);
    index += 1;
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values
  };
}

//bbox helper
function parseBboxParam(bboxParam) {
  if (!bboxParam) return null;

  const parts = String(bboxParam)
    .split(",")
    .map((v) => Number(v.trim()));

  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }

  const [minLng, minLat, maxLng, maxLat] = parts;
  return { minLng, minLat, maxLng, maxLat };
}

async function applyCulturalPeriodDatesToPayload(payload) {
  const periodValues = [
    payload["Cultural Period1"],
    payload["Cultural Period2"],
    payload["Cultural Period3"],
    payload["Cultural Period4"],
    payload["Cultural Period5"],
    payload["Cultural Period6"]
  ]
    .filter((value) => value !== null && value !== undefined && value !== "");

  if (periodValues.length === 0) {
    payload["Start Date"] = null;
    payload["End Date"] = null;
    return payload;
  }

  const result = await pool.query(
    `
    SELECT
      MIN(NULLIF(date_from, '')::integer) AS start_date,
      MAX(NULLIF(date_to, '')::integer) AS end_date
    FROM ui.v_lkp_cultural_periods_context
    WHERE canonical_value = ANY($1)
    `,
    [periodValues]
  );

  payload["Start Date"] = result.rows[0]?.start_date ?? null;
  payload["End Date"] = result.rows[0]?.end_date ?? null;

  return payload;
}

function monumentCardSelectSql(alias = "combined", lang = "en") {
  const p = alias ? `${alias}.` : "";
  const safeLang = safeMonumentLang(lang);

  return `
    ${p}id,
    ${p}"CAAL_ID",
    ${p}"Primary Name",
    ${p}"Primary Name (English)",
    ${p}"Classification",
    ${p}classification_${safeLang} AS classification_display,
    ${p}"Monument Type1",
    ${p}monument_type1_${safeLang} AS monument_type1_display,
    ${p}"Longitude",
    ${p}"Latitude",
    ${p}created_by_app_user_id,
    ${p}source_scope,
    ${p}is_editable
  `;
}

function workspaceCardSelectSql(lang = "en") {
  const safeLang = safeMonumentLang(lang);

  return `
    m.id,
    m."CAAL_ID",
    m."Primary Name",
    m."Primary Name (English)",

    m."Classification",
    COALESCE(
      cls.display_${safeLang},
      cls.display_ru,
      cls.display_en,
      m."Classification"
    ) AS classification_display,

    m."Monument Type1",
    COALESCE(
      mt1.display_${safeLang},
      mt1.display_ru,
      mt1.display_en,
      m."Monument Type1"
    ) AS monument_type1_display,

    m."Longitude",
    m."Latitude",
    m.created_by_app_user_id,
    'workspace'::text AS source_scope,
    true AS is_editable
  `;
}

function workspaceCardJoinsSql() {
  return `
    LEFT JOIN ui.v_lkp_classifications cls
      ON cls.canonical_value = m."Classification"
    LEFT JOIN ui.v_lkp_site_types_context mt1
      ON mt1.canonical_value = m."Monument Type1"
  `;
}

function buildWorkspaceMonumentFilterWhere(req, alias = "m") {
  const clauses = [];
  const values = [];
  let index = 1;

  const p = alias ? `${alias}.` : "";

  const text = normalizeSearchText(req.query.text).toLowerCase();
  const caalId = String(req.query.caalId || "").trim();

  const monumentTypes = parseCsvParam(req.query.monumentTypes);
  const classifications = parseCsvParam(req.query.classifications);
  const designations = parseCsvParam(req.query.designations);
  const religions = parseCsvParam(req.query.religions);
  const culturalPeriods = parseCsvParam(req.query.culturalPeriods);
  const countries = parseCsvParam(req.query.countries);

  if (caalId) {
    clauses.push(`${p}"CAAL_ID" ILIKE $${index}`);
    values.push(`%${caalId}%`);
    index += 1;
  }

  if (text) {
    clauses.push(`
      lower(concat_ws(' ',
        ${p}"CAAL_ID",
        ${p}"Primary Name",
        ${p}"Primary Name (English)",
        ${p}"Other Names",
        ${p}"Country",
        ${p}"Region",
        ${p}"Classification",
        ${p}"Designation",
        ${p}"Monument Type1",
        ${p}"Monument Type2",
        ${p}"Monument Type3",
        ${p}"Monument Type4",
        ${p}"Monument Type5",
        ${p}"Monument Type6",
        ${p}"Religion1",
        ${p}"Religion2",
        ${p}"Religion3",
        ${p}"Cultural Period1",
        ${p}"Cultural Period2",
        ${p}"Cultural Period3",
        ${p}"Cultural Period4",
        ${p}"Cultural Period5",
        ${p}"Cultural Period6",
        ${p}"Internal Reference",
        ${p}"External Reference",
        ${p}"Monument Passport",
        ${p}"Descriptive Date",
        ${p}"Primary Description",
        ${p}"Primary Description (English)",
        ${p}"Additional Notes",
        ${p}"Primary Address",
        ${p}"Administrative Subdivision Name1",
        ${p}"Administrative Subdivision Name2",
        ${p}"Administrative Subdivision Name3",
        ${p}"Administrative Subdivision Name4",
        ${p}"World Heritage Site Name"
      )) ILIKE $${index}
    `);
    values.push(`%${text}%`);
    index += 1;
  }

  if (classifications.length) {
    clauses.push(`${p}"Classification" = ANY($${index}::text[])`);
    values.push(classifications);
    index += 1;
  }

  if (designations.length) {
    clauses.push(`${p}"Designation" = ANY($${index}::text[])`);
    values.push(designations);
    index += 1;
  }

  if (countries.length) {
    clauses.push(`${p}"Country" = ANY($${index}::text[])`);
    values.push(countries);
    index += 1;
  }

  if (monumentTypes.length) {
    clauses.push(`
      ARRAY_REMOVE(ARRAY[
        NULLIF(btrim(${p}"Monument Type1"), ''),
        NULLIF(btrim(${p}"Monument Type2"), ''),
        NULLIF(btrim(${p}"Monument Type3"), ''),
        NULLIF(btrim(${p}"Monument Type4"), ''),
        NULLIF(btrim(${p}"Monument Type5"), ''),
        NULLIF(btrim(${p}"Monument Type6"), '')
      ], NULL) && $${index}::text[]
    `);
    values.push(monumentTypes);
    index += 1;
  }

  if (religions.length) {
    clauses.push(`
      ARRAY_REMOVE(ARRAY[
        NULLIF(btrim(${p}"Religion1"), ''),
        NULLIF(btrim(${p}"Religion2"), ''),
        NULLIF(btrim(${p}"Religion3"), '')
      ], NULL) && $${index}::text[]
    `);
    values.push(religions);
    index += 1;
  }

  if (culturalPeriods.length) {
    clauses.push(`
      ARRAY_REMOVE(ARRAY[
        NULLIF(btrim(${p}"Cultural Period1"), ''),
        NULLIF(btrim(${p}"Cultural Period2"), ''),
        NULLIF(btrim(${p}"Cultural Period3"), ''),
        NULLIF(btrim(${p}"Cultural Period4"), ''),
        NULLIF(btrim(${p}"Cultural Period5"), ''),
        NULLIF(btrim(${p}"Cultural Period6"), '')
      ], NULL) && $${index}::text[]
    `);
    values.push(culturalPeriods);
    index += 1;
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values
  };
}
// ========================================================
// LOOKUPS
// ========================================================

function fallbackLookupLang(lang) {
  return ["kk", "ky", "tg", "tk", "uz"].includes(lang) ? "ru" : "en";
}

async function fetchLookupRows(sql, lang) {
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLookupLang(safeLang);

  const result = await pool.query(sql);

  return result.rows.map((row) => ({
    value: row.canonical_value,
    label:
      row[`display_${safeLang}`] ||
      row[`display_${fallbackLang}`] ||
      row.display_en ||
      row.canonical_value
  }));
}

router.get("/lookups/monuments", async (req, res) => {
  //console.log("MONUMENTS route session:", JSON.stringify(req.session, null, 2));
  //console.log("MONUMENTS query:", req.query);
  //console.log("MONUMENTS appSession:", req.session?.appSession || null);
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

  try {
    const [
      countries,
      classifications,
      designations,
      monumentTypes,
      religions,
      culturalPeriods,
      locationConfidence,
      adminTypes,
      units,
      measurementTypes,
      languageDisplay
    ] = await Promise.all([
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_countries ORDER BY display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_classifications ORDER BY display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_designation_type ORDER BY display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_site_types_context ORDER BY sort_order NULLS LAST, display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_religion ORDER BY display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_cultural_periods_context ORDER BY sort_order NULLS LAST, display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_loc_acc_ass ORDER BY display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_admin_type ORDER BY display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_unit_of_measurement ORDER BY display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_measurement_type ORDER BY display_en NULLS LAST, canonical_value`, lang),
      fetchLookupRows(`
        SELECT canonical_value, display_en, display_ru, display_zh,
              display_kk, display_ky, display_tg, display_tk, display_uz
        FROM ui.v_lkp_langdisplay
        ORDER BY sort_order NULLS LAST, display_en NULLS LAST, canonical_value
      `, lang)
    ]);

    return res.json({
      ok: true,
      lookups: {
        country: countries,
        classification: classifications,
        designation: designations,
        monument_type: monumentTypes,
        religion: religions,
        cultural_period: culturalPeriods,
        location_confidence: locationConfidence,
        admin_subdivision_type: adminTypes,
        measurement_unit: units,
        measurement_type: measurementTypes,
        language_display: languageDisplay
      }
    });
  } catch (error) {
    console.error("Monuments lookups failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load monuments lookups",
      detail: error.message
    });
  }
});

router.get("/monuments/map", async (req, res) => {
  //console.log("MONUMENTS route session:", JSON.stringify(req.session, null, 2));
  //console.log("MONUMENTS query:", req.query);

  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  // --- scopes ---
  const requestedScopes = parseScopes(req.query.scopes);
  const normalizedScopes = normalizeRequestedScopes(requestedScopes);
  const allowedScopes = getAllowedScopes(currentSession);
  const scopes = normalizedScopes.filter((s) => allowedScopes.includes(s));

  if (scopes.length === 0) {
    return res.status(403).json({
      ok: false,
      error: "No permitted scopes requested"
    });
  }

  const lang =
    req.query.lang ||
    currentSession.profile?.preferred_language ||
    "en";

  const workspaceOnly = scopes.length === 1 && scopes[0] === "workspace";

  if (workspaceOnly) {
    try {
      const { whereSql, values } = buildWorkspaceMonumentFilterWhere(req);
      const bbox = parseBboxParam(req.query.bbox);

      const extraClauses = [];
      const extraValues = [...values];
      let nextIndex = extraValues.length + 1;

      if (bbox) {
        extraClauses.push(`
          m."Longitude" BETWEEN $${nextIndex} AND $${nextIndex + 1}
          AND m."Latitude" BETWEEN $${nextIndex + 2} AND $${nextIndex + 3}
        `);

        extraValues.push(bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat);
        nextIndex += 4;
      }

      let combinedWhere = whereSql;

      if (extraClauses.length) {
        combinedWhere = combinedWhere
          ? `${combinedWhere} AND ${extraClauses.join(" AND ")}`
          : `WHERE ${extraClauses.join(" AND ")}`;
      }

      const limitParamIndex = extraValues.length + 1;

      const dataSql = `
        SELECT
          ${workspaceCardSelectSql(lang)}
        FROM ${MONUMENTS_WORKSPACE_TABLE} m
        ${workspaceCardJoinsSql()}
        ${combinedWhere}
        LIMIT $${limitParamIndex}
      `;

      const result = await pool.query(dataSql, [...extraValues, 5000]);

      const currentAppUserId = currentSession?.user?.user_id ?? null;
      const canEditCaal = canEditCaalMonuments(currentSession);

      const records = result.rows.map((row) =>
        buildMonumentMapRecord(row, lang, currentAppUserId, canEditCaal)
      );

      return res.json({
        ok: true,
        total: records.length,
        records
      });
    } catch (error) {
      console.error("Workspace monument map fast fetch failed:");
      console.error(error);

      return res.status(500).json({
        ok: false,
        error: "Workspace monument map fetch failed",
        detail: error.message
      });
    }
  }
  // --- base SQL parts ---
  const unionSql = buildBrowseUnionSql(scopes);
  const { whereSql, values } = buildMonumentFilterWhere(req, lang);

  // --- bbox handling ---
  const bbox = parseBboxParam(req.query.bbox);

  const extraClauses = [];
  const extraValues = [...values];
  let nextIndex = extraValues.length + 1;

  if (bbox) {
    extraClauses.push(`
      "Longitude" BETWEEN $${nextIndex} AND $${nextIndex + 1}
      AND "Latitude" BETWEEN $${nextIndex + 2} AND $${nextIndex + 3}
    `);

    extraValues.push(
      bbox.minLng,
      bbox.maxLng,
      bbox.minLat,
      bbox.maxLat
    );

    nextIndex += 4;
  }

  // --- combine WHERE clauses ---
  let combinedWhere = whereSql;

  if (extraClauses.length) {
    if (combinedWhere) {
      combinedWhere += ` AND ${extraClauses.join(" AND ")}`;
    } else {
      combinedWhere = `WHERE ${extraClauses.join(" AND ")}`;
    }
  }

  // --- final query ---
  try {
    //console.log("MAP scopes:", scopes);
    //console.log("MAP where:", combinedWhere);
    //console.log("MAP values:", extraValues);

    const safeLang = safeMonumentLang(lang);
    const hasFreeTextSearch = hasExpensiveFreeTextSearch(req);
    const mapLimit = hasFreeTextSearch ? 1500 : 5000;

    const limitParamIndex = extraValues.length + 1;

    const dataSql = `
      SELECT
        id,
        "CAAL_ID",
        "Primary Name",
        "Primary Name (English)",
        "Country",
        country_${safeLang} AS country_display,
        "Region",
        "Classification",
        classification_${safeLang} AS classification_display,
        "Designation",
        designation_${safeLang} AS designation_display,
        "Monument Type1",
        monument_type1_${safeLang} AS monument_type1_display,
        "Cultural Period1",
        cultural_period1_${safeLang} AS cultural_period1_display,
        "Religion1",
        religion1_${safeLang} AS religion1_display,
        "Longitude",
        "Latitude",
        created_by_app_user_id,
        source_scope,
        is_editable
      FROM (
        ${unionSql}
      ) combined
      ${combinedWhere}
      LIMIT $${limitParamIndex}
    `;

    const result = await pool.query(dataSql, [...extraValues, mapLimit]);

    //console.log("MAP raw rows:", result.rows.length);

    const currentAppUserId = currentSession?.user?.user_id ?? null;
    const canEditCaal = canEditCaalMonuments(currentSession);

    const records = result.rows.map((row) =>
      buildMonumentMapRecord(
        row,
        lang,
        currentAppUserId,
        canEditCaal
      )
    );

    //console.log("MAP final records:", records.length);

    return res.json({
      ok: true,
      total: records.length,
      records
    });

  } catch (error) {
    console.error("Monument map fetch failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Monument map fetch failed",
      detail: error.message
    });
  }
});

// ========================================================
// GET RECORDS
// ========================================================

router.get("/monuments", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const requestedScopes = parseScopes(req.query.scopes);
  const normalizedScopes = normalizeRequestedScopes(requestedScopes);
  const allowedScopes = getAllowedScopes(currentSession);
  const scopes = normalizedScopes.filter((scope) => allowedScopes.includes(scope));

  if (scopes.length === 0) {
    return res.status(403).json({
      ok: false,
      error: "No permitted scopes requested"
    });
  }

  const limit = Number(req.query.limit) || 100;
  const offset = Number(req.query.offset) || 0;
  const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

  const workspaceOnly = scopes.length === 1 && scopes[0] === "workspace";

  if (workspaceOnly) {
    try {
      const { whereSql, values } = buildWorkspaceMonumentFilterWhere(req);

      const dataSql = `
        SELECT
          ${workspaceCardSelectSql(lang)}
        FROM ${MONUMENTS_WORKSPACE_TABLE} m
        ${workspaceCardJoinsSql()}
        ${whereSql}
        ORDER BY m.id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;

      const dataResult = await pool.query(dataSql, [...values, limit, offset]);

      const countSql = `
        SELECT COUNT(*) AS total
        FROM ${MONUMENTS_WORKSPACE_TABLE} m
        ${whereSql}
      `;

      const countResult = await pool.query(countSql, values);

      const currentAppUserId = currentSession?.user?.user_id ?? null;
      const canEditCaal = canEditCaalMonuments(currentSession);

      const records = dataResult.rows.map((row) =>
        buildMonumentListRecord(row, lang, currentAppUserId, canEditCaal)
      );

      return res.json({
        ok: true,
        records,
        total: Number(countResult.rows[0].total),
        total_is_exact: true,
        limit,
        offset,
        scopes
      });
    } catch (error) {
      console.error("Workspace monuments fast fetch failed:");
      console.error(error);

      return res.status(500).json({
        ok: false,
        error: "Workspace monuments fetch failed",
        detail: error.message
      });
    }
  }

  try {
    const unionSql = buildBrowseUnionSql(scopes);

    const { whereSql, values } = buildMonumentFilterWhere(req, lang);

    const safeLang = safeMonumentLang(lang);

    const dataSql = `
      SELECT
        ${monumentCardSelectSql("combined", lang)}
      FROM (
        ${unionSql}
      ) combined
      ${whereSql}
      ORDER BY id DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const hasFreeTextSearch = hasExpensiveFreeTextSearch(req);

    const dataResult = await pool.query(dataSql, [...values, limit, offset]);

    let totalIsExact = false;
    let total = estimateReturnedTotal({
      offset,
      limit,
      rowCount: dataResult.rows.length
    });

    if (!hasFreeTextSearch) {
      const countSql = `
        SELECT COUNT(*) AS total
        FROM (
          ${unionSql}
        ) combined
        ${whereSql}
      `;

      const countResult = await pool.query(countSql, values);
      total = Number(countResult.rows[0].total);
      totalIsExact = true;
    }
    
    const currentAppUserId = currentSession?.user?.user_id ?? null;
    const canEditCaal = canEditCaalMonuments(currentSession);

    const records = dataResult.rows.map((row) =>
      buildMonumentListRecord(
        row,
        lang,
        currentAppUserId,
        canEditCaal
      )
    );

    return res.json({
      ok: true,
      records,
      total,
      total_is_exact: totalIsExact,
      limit,
      offset,
      scopes
    });
  } catch (error) {
    console.error("Monuments fetch failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Monuments fetch failed",
      detail: error.message
    });
  }
});

function getAccessLevel(session) {
  return Number(
    session?.user?.access_level ??
    session?.profile?.access_level ??
    session?.permissions?.access_level ??
    session?.access_level ??
    0
  );
}

function canEditCaalMonuments(session) {
  return (
    session?.permissions?.can_edit_caal === true ||
    getAccessLevel(session) === 9
  );
}

// ========================================================
// SAVE HELPERS
// ========================================================

const MONUMENT_EDITABLE_FIELDS = [
  "Primary Name",
  "Primary Name (English)",
  "Other Names",
  "Country",
  "Region",
  "Classification",
  "Internal Reference",
  "External Reference",
  "Monument Passport",
  "Monument Type1",
  "Monument Type2",
  "Monument Type3",
  "Monument Type4",
  "Monument Type5",
  "Monument Type6",
  "Religion1",
  "Religion2",
  "Religion3",
  "Descriptive Date",
  "Cultural Period1",
  "Cultural Period2",
  "Cultural Period3",
  "Cultural Period4",
  "Cultural Period5",
  "Cultural Period6",
  "Primary Description",
  "Primary Description (English)",
  "Additional Notes",
  "Longitude",
  "Latitude",
  "Altitude",
  "Location Confidence",
  "Location Notes",
  "Primary Address",
  "Administrative Subdivision Name1",
  "Administrative Subdivision Type1",
  "Administrative Subdivision Name2",
  "Administrative Subdivision Type2",
  "Administrative Subdivision Name3",
  "Administrative Subdivision Type3",
  "Administrative Subdivision Name4",
  "Administrative Subdivision Type4",
  "Measurement Value1",
  "Measurement Unit1",
  "Measurement Type1",
  "Measurement Value2",
  "Measurement Unit2",
  "Measurement Type2",
  "Measurement Value3",
  "Measurement Unit3",
  "Measurement Type3",
  "Measurement Value4",
  "Measurement Unit4",
  "Measurement Type4",
  "Designation",
  "World Heritage Site Name",
  "Monument is part of",
  "Monument contains",
  "Monument is associated with",
  "MasterID"
];

function normaliseMonumentPayload(input = {}) {
  const payload = {};

  for (const field of MONUMENT_EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;

    let value = input[field];
    value = blankToNull(value);

    if (
      field === "Longitude" ||
      field === "Latitude" ||
      field === "Altitude" ||
      field.startsWith("Measurement Value")
    ) {
      payload[field] = numberOrNull(value);
      continue;
    }

    payload[field] = value;
  }

  return payload;
}

function payloadIncludesMasterId(payload = {}) {
  return Object.prototype.hasOwnProperty.call(payload, "MasterID");
}

async function fetchMonumentRowById(id) {
  const result = await pool.query(
    `
    SELECT
      v.*,
      CASE
        WHEN v.geom IS NOT NULL THEN ST_X(v.geom::geometry)
        ELSE NULL
      END AS geom_lng,
      CASE
        WHEN v.geom IS NOT NULL THEN ST_Y(v.geom::geometry)
        ELSE NULL
      END AS geom_lat
    FROM ${MONUMENTS_VIEW} v
    WHERE v.id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function fetchPublicMonumentRowById(id) {
  const result = await pool.query(
    `
    SELECT
      m.*,
      'all_caal'::text AS source_scope,
      CASE
        WHEN m.geom IS NOT NULL THEN ST_X(m.geom::geometry)
        ELSE NULL
      END AS geom_lng,
      CASE
        WHEN m.geom IS NOT NULL THEN ST_Y(m.geom::geometry)
        ELSE NULL
      END AS geom_lat
    FROM ui.mv_monuments_caal m
    WHERE m.id = $1
    `,
    [id]
  );

  const row = result.rows[0] || null;
  return row ? stripMonumentInternalFields(row) : null;
}

// ========================================================
// CREATE
// ========================================================

router.post("/monuments", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  if (!canEditMonuments(currentSession) && !canEditCaalMonuments(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to edit monument records"
    });
  }

  const payload = normaliseMonumentPayload(req.body || {});
  const canEditCaal = canEditCaalMonuments(currentSession);

  if (!canEditCaal && payloadIncludesMasterId(payload)) {
    return res.status(403).json({
      ok: false,
      error: "Only super users can assign MasterID"
    });
  }

  const appUserId = currentSession?.user?.user_id ?? null;
  const sessionUsername = currentSession?.user?.username ?? null;
  const preferredLanguage = currentSession?.profile?.preferred_language ?? null;
  const sessionCountry = currentSession?.profile?.country ?? null;

  const locationCheck = validateMonumentCreateLocation(payload);

  if (!locationCheck.ok) {
    return res.status(400).json({
      ok: false,
      error: locationCheck.error
    });
  }

  if (!payload["Country"]) {
    payload["Country"] = sessionCountry;
  }

  payload["Recorder"] = sessionUsername;
  payload["Preferred Language"] = preferredLanguage;
  payload["Date of Recording"] = new Date().toISOString().slice(0, 10);
  payload.created_by_app_user_id = appUserId;

  const lng = locationCheck.lng;
  const lat = locationCheck.lat;

  payload["Longitude"] = lng;
  payload["Latitude"] = lat;

  const fields = Object.keys(payload);
  const values = fields.map((field) => payload[field]);

  const geomSql = (
    lng !== null && lng !== undefined &&
    lat !== null && lat !== undefined &&
    Number.isFinite(Number(lng)) &&
    Number.isFinite(Number(lat))
  )
    ? `, ${GEOM_COLUMN_SQL}`
    : "";

  const geomValueSql = geomSql
    ? `, ST_SetSRID(ST_MakePoint($${fields.length + 1}, $${fields.length + 2}), 4326)`
    : "";

  const columnSql = fields.map((field) => `"${field}"`).join(", ");

  try {
    const queryValues = geomSql ? [...values, Number(lng), Number(lat)] : values;

    const insertSql = `
      INSERT INTO ${MONUMENTS_WORKSPACE_TABLE} (${columnSql}${geomSql})
      VALUES (${fields.map((_, i) => `$${i + 1}`).join(", ")}${geomValueSql})
      RETURNING id
    `;

    const insertResult = await pool.query(insertSql, queryValues);
    const newId = insertResult.rows[0].id;

    const freshRow = await fetchMonumentRowById(newId);
    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

    return res.status(201).json({
      ok: true,
      record: buildMonumentRecord(
      freshRow,
      lang,
      appUserId,
      canEditCaalMonuments(currentSession)
    )
    });
  } catch (error) {
    console.error("Monument create failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Monument create failed",
      detail: error.message
    });
  }
});

// cache update for super user
router.post("/monuments/admin/refresh-caal-cache", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession?.permissions?.can_edit_caal) {
    return res.status(403).json({
      ok: false,
      error: "Admin only"
    });
  }

  try {
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ui.mv_monuments_caal`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "CAAL cache refresh failed",
      detail: error.message
    });
  }
});

// ========================================================
// UPDATE
// ========================================================

router.patch("/monuments/:id", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  if (!canEditMonuments(currentSession) && !canEditCaalMonuments(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to edit monument records"
    });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ ok: false, error: "Invalid monument id" });
  }

  const canEditCaal = canEditCaalMonuments(currentSession);
  const payload = normaliseMonumentPayload(req.body || {});

  if (!canEditCaal && payloadIncludesMasterId(payload)) {
    return res.status(403).json({
      ok: false,
      error: "Only super users can change MasterID"
    });
  }

  const fields = Object.keys(payload);

  if (fields.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "No editable fields supplied"
    });
  }

  const setParts = fields.map((field, index) => `"${field}" = $${index + 1}`);
  const values = fields.map((field) => payload[field]);

  const lng = payload["Longitude"];
  const lat = payload["Latitude"];

  if (
    Number.isFinite(Number(lng)) &&
    Number.isFinite(Number(lat))
  ) {
    setParts.push(
      `${GEOM_COLUMN_SQL} = ST_SetSRID(ST_MakePoint($${fields.length + 1}, $${fields.length + 2}), 4326)`
    );
    values.push(Number(lng), Number(lat));
  }

  setParts.push(`"Tstamp" = NOW()`);

  try {
    const userId = currentSession?.user?.user_id ?? null;
    //const canEditCaal = canEditCaalMonuments(currentSession);

    console.log("Monument PATCH permissions:", {
      userId,
      accessLevel: getAccessLevel(currentSession),
      canEditWorkspace: canEditMonuments(currentSession),
      canEditCaal,
      permissions: currentSession?.permissions,
      user: currentSession?.user,
      profile: currentSession?.profile
    });

    let updateResult;
    let updatedScope = "workspace";

    let updateSql;
    let updateValues;

    if (!canEditCaal) {
      const targetCheck = await pool.query(
        `
        SELECT id, created_by_app_user_id, "MasterID"
        FROM ${MONUMENTS_WORKSPACE_TABLE}
        WHERE id = $1
        `,
        [id]
      );

      const target = targetCheck.rows[0];

      if (!target) {
        return res.status(404).json({
          ok: false,
          error: "Monument record not found"
        });
      }

      if (Number(target.created_by_app_user_id) !== Number(userId)) {
        return res.status(403).json({
          ok: false,
          error: "You can only edit your own workspace records"
        });
      }

      if (String(target["MasterID"] || "").trim() !== "") {
        return res.status(403).json({
          ok: false,
          error: "Records linked to a MasterID are read-only"
        });
      }
    }

    if (canEditCaal) {
      console.log("Trying workspace monument update:", {
        table: MONUMENTS_WORKSPACE_TABLE,
        id,
        canEditCaal
      });

      updateSql = `
        UPDATE ${MONUMENTS_WORKSPACE_TABLE}
        SET ${setParts.join(", ")}
        WHERE id = $${values.length + 1}
        RETURNING id
      `;
      updateValues = [...values, id];

      updateResult = await pool.query(updateSql, updateValues);

      console.log("Workspace update row count:", updateResult.rows.length);

      if (updateResult.rows.length === 0) {
        console.log("Trying public CAAL monument update:", {
          table: MONUMENTS_CAAL_TABLE,
          id,
          canEditCaal
        });

        updateSql = `
          UPDATE ${MONUMENTS_CAAL_TABLE}
          SET ${setParts.join(", ")}
          WHERE id = $${values.length + 1}
          RETURNING id
        `;
        updateValues = [...values, id];

        updateResult = await pool.query(updateSql, updateValues);

        console.log("Public CAAL update row count:", updateResult.rows.length);

        updatedScope = "all_caal";
      }
    } else {
      // Normal editor: own workspace records only.
      updateSql = `
        UPDATE ${MONUMENTS_WORKSPACE_TABLE}
        SET ${setParts.join(", ")}
        WHERE id = $${values.length + 1}
          AND created_by_app_user_id = $${values.length + 2}
        RETURNING id
      `;
      updateValues = [...values, id, userId];

      updateResult = await pool.query(updateSql, updateValues);
    }

    if (updateResult.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        error: canEditCaal
        ? "Monument record not found in workspace or public CAAL tables"
        : "You can only edit your own workspace records"
      });
    }

    const freshRow =
      updatedScope === "workspace"
        ? await fetchMonumentRowById(id)
        : await fetchPublicMonumentRowById(id);

    if (!freshRow) {
      return res.status(500).json({
        ok: false,
        error: "Monument updated but refreshed record could not be loaded"
      });
    }
    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

    return res.json({
      ok: true,
      record: buildMonumentRecord(
        stripMonumentInternalFields(freshRow),
        lang,
        userId,
        canEditCaalMonuments(currentSession)
      )
    });
  } catch (error) {
    console.error("Monument update failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Monument update failed",
      detail: error.message
    });
  }
});

// DELETE
// ---------------------------
router.delete("/monuments/:id", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  if (!canEditMonuments(currentSession) && !canEditCaalMonuments(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to delete monument records"
    });
  }

  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid monument id"
    });
  }

  const userId = currentSession?.user?.user_id ?? null;
  const username = currentSession?.user?.username ?? null;
  const canEditCaal = canEditCaalMonuments(currentSession);
  const deleteReason = String(req.body?.reason || "").trim() || null;

  try {
    if (!canEditCaal) {
      const targetCheck = await pool.query(
        `
        SELECT id, created_by_app_user_id, "MasterID"
        FROM ${MONUMENTS_WORKSPACE_TABLE}
        WHERE id = $1
        `,
        [id]
      );

      const target = targetCheck.rows[0];

      if (!target) {
        return res.status(404).json({
          ok: false,
          error: "Monument record not found"
        });
      }

      if (Number(target.created_by_app_user_id) !== Number(userId)) {
        return res.status(403).json({
          ok: false,
          error: "You can only delete your own workspace monument records"
        });
      }

      if (String(target["MasterID"] || "").trim() !== "") {
        return res.status(403).json({
          ok: false,
          error: "Records linked to a MasterID are read-only and cannot be deleted"
        });
      }
    }

    const ownershipClause = canEditCaal
      ? ""
      : `AND m.created_by_app_user_id = $2`;

    const values = [id, userId, username, deleteReason];

    const deleteSql = `
      WITH target AS (
        SELECT *
        FROM ${MONUMENTS_WORKSPACE_TABLE} m
        WHERE m.id = $1
          ${ownershipClause}
      ),
      registry_update AS (
        UPDATE public.record_registry rr
        SET
          status = 'deleted',
          deleted_at = now(),
          deleted_by_app_user_id = $2,
          deleted_by = $3,
          delete_reason = $4,
          deleted_record = to_jsonb(target)
        FROM target
        WHERE rr.source_schema = 'kz'
          AND rr.source_table = 'CAAL_Monuments'
          AND rr.source_row_id = target.id
        RETURNING rr.id
      ),
      registry_insert AS (
        INSERT INTO public.record_registry (
          source_schema,
          source_table,
          source_row_id,
          caal_id,
          record_type,
          created_at,
          created_by,
          created_by_app_user_id,
          status,
          notes,
          deleted_at,
          deleted_by_app_user_id,
          deleted_by,
          delete_reason,
          deleted_record
        )
        SELECT
          'kz',
          'CAAL_Monuments',
          target.id,
          target."CAAL_ID",
          'monument',
          now(),
          COALESCE(target."Recorder", $3),
          target.created_by_app_user_id,
          'deleted',
          'Registry row created during web app delete',
          now(),
          $2,
          $3,
          $4,
          to_jsonb(target)
        FROM target
        WHERE NOT EXISTS (SELECT 1 FROM registry_update)
        RETURNING id
      ),
      deleted AS (
        DELETE FROM ${MONUMENTS_WORKSPACE_TABLE} m
        USING target
        WHERE m.id = target.id
        RETURNING m.id, m."CAAL_ID"
      )
      SELECT * FROM deleted;
    `;

    const result = await pool.query(deleteSql, values);

    if (result.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        error: canEditCaal
          ? "Monument record not found in workspace table"
          : "You can only delete your own workspace monument records"
      });
    }

    return res.json({
      ok: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    console.error("Monument delete failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Monument delete failed",
      detail: error.message
    });
  }
});

module.exports = router;