const express = require("express");
const pool = require("./db");

const router = express.Router();

// ========================================================
// CONFIG
// ========================================================

const MONUMENTS_TABLE = 'kz."CAAL_Monuments"';
const MONUMENTS_VIEW = 'kz.v_monuments_grid_base';
const GEOM_COLUMN_SQL = `"geom"`;


// ========================================================
// HELPERS
// ========================================================

// this uses a national filter on the CAAL dataset as too costly to build MV on CAAL + REF
const NATIONAL_REF_WHERE = `
  "CAAL_ID" LIKE 'Mon_KZ_%'
  OR btrim(coalesce("Country", '')) IN ('Kazakhstan', 'Казахстан')
`;

const browseScopeConfig = {
  workspace: {
    sql: `
      SELECT
        *,
        'workspace'::text AS source_scope,
        true AS is_editable
      FROM kz.v_monuments_grid_base
    `
  },
  national_ref: {
    sql: `
      SELECT
        *,
        'national_ref'::text AS source_scope,
        false AS is_editable
      FROM ui.mv_monuments_caal
      WHERE ${NATIONAL_REF_WHERE}
    `
  },
  all_caal: {
    sql: `
      SELECT
        *,
        'all_caal'::text AS source_scope,
        false AS is_editable
      FROM ui.mv_monuments_caal
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
  const lng = firstDefined(row["Longitude"], row.longitude);
  const lat = firstDefined(row["Latitude"], row.latitude);

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

function buildMonumentRecord(row, lang) {
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
      longitude: firstDefined(row["Longitude"], row.longitude),
      latitude: firstDefined(row["Latitude"], row.latitude),
      recorder: firstDefined(row["Recorder"], row.recorder),
      date_of_recording: firstDefined(row["Date of Recording"], row.date_of_recording)
    },

    raw: row,

    geometry: buildGeometry(row),

    source: {
      scope: row.source_scope || "workspace",
      is_editable: row.is_editable === true || row.is_editable === "true"
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

function buildMonumentFilterWhere(req) {
  const clauses = [];
  const values = [];
  let index = 1;

  const text = req.query.text?.trim();
  const monumentTypes = parseCsvParam(req.query.monumentTypes);
  const classifications = parseCsvParam(req.query.classifications);
  const designations = parseCsvParam(req.query.designations);
  const religions = parseCsvParam(req.query.religions);
  const culturalPeriods = parseCsvParam(req.query.culturalPeriods);
  const countries = parseCsvParam(req.query.countries);

  if (text) {
    clauses.push(`
      (
        coalesce("CAAL_ID",'') ILIKE $${index}
        OR coalesce("Primary Name",'') ILIKE $${index}
        OR coalesce("Primary Name (English)",'') ILIKE $${index}
        OR coalesce("Other Names",'') ILIKE $${index}
        OR coalesce("Primary Description",'') ILIKE $${index}
        OR coalesce("Primary Description (English)",'') ILIKE $${index}
        OR coalesce("Additional Notes",'') ILIKE $${index}
      )
    `);
    values.push(`%${text}%`);
    index += 1;
  }

  if (classifications.length) {
    clauses.push(`"Classification" = ANY($${index})`);
    values.push(classifications);
    index += 1;
  }

  if (designations.length) {
    clauses.push(`"Designation" = ANY($${index})`);
    values.push(designations);
    index += 1;
  }

  if (countries.length) {
    clauses.push(`"Country" = ANY($${index})`);
    values.push(countries);
    index += 1;
  }

  if (monumentTypes.length) {
    clauses.push(`
      (
        "Monument Type1" = ANY($${index})
        OR "Monument Type2" = ANY($${index})
        OR "Monument Type3" = ANY($${index})
        OR "Monument Type4" = ANY($${index})
        OR "Monument Type5" = ANY($${index})
        OR "Monument Type6" = ANY($${index})
      )
    `);
    values.push(monumentTypes);
    index += 1;
  }

  if (religions.length) {
    clauses.push(`
      (
        "Religion1" = ANY($${index})
        OR "Religion2" = ANY($${index})
        OR "Religion3" = ANY($${index})
      )
    `);
    values.push(religions);
    index += 1;
  }

  if (culturalPeriods.length) {
    clauses.push(`
      (
        "Cultural Period1" = ANY($${index})
        OR "Cultural Period2" = ANY($${index})
        OR "Cultural Period3" = ANY($${index})
        OR "Cultural Period4" = ANY($${index})
        OR "Cultural Period5" = ANY($${index})
        OR "Cultural Period6" = ANY($${index})
      )
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

async function fetchLookupRows(sql, lang) {
  const result = await pool.query(sql);
  return result.rows.map((row) => ({
    value: row.canonical_value,
    label:
      row[`display_${lang}`] ||
      row.display_en ||
      row.canonical_value
  }));
}

router.get("/lookups/monuments", async (req, res) => {
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
      measurementTypes
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
      fetchLookupRows(`SELECT canonical_value, display_en, display_ru, display_zh, display_kk, display_ky, display_tg, display_tk, display_uz FROM ui.v_lkp_measurement_type ORDER BY display_en NULLS LAST, canonical_value`, lang)
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
        measurement_type: measurementTypes
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

  const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

  try {
    const unionSql = buildBrowseUnionSql(scopes);
    const { whereSql, values } = buildMonumentFilterWhere(req);

    const dataSql = `
      SELECT *
      FROM (
        ${unionSql}
      ) combined
      ${whereSql}
    `;

    const result = await pool.query(dataSql, values);
    const records = result.rows.map((row) => buildMonumentRecord(row, lang));

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

  try {
    const unionSql = buildBrowseUnionSql(scopes);

    const { whereSql, values } = buildMonumentFilterWhere(req);

    const dataSql = `
      SELECT *
      FROM (
        ${unionSql}
      ) combined
      ${whereSql}
      ORDER BY id DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM (
        ${unionSql}
      ) combined
      ${whereSql}
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataSql, [...values, limit, offset]),
      pool.query(countSql, values)
    ]);
    
    const records = dataResult.rows.map((row) => buildMonumentRecord(row, lang));

    return res.json({
      ok: true,
      records,
      total: Number(countResult.rows[0].total),
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

async function fetchMonumentRowById(id) {
  const result = await pool.query(
    `SELECT * FROM ${MONUMENTS_VIEW} WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// ========================================================
// CREATE
// ========================================================

router.post("/monuments", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  if (!canEditMonuments(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to create workspace monuments"
    });
  }

  const payload = normaliseMonumentPayload(req.body || {});
  const appUserId = currentSession?.user?.user_id ?? null;
  const sessionUsername = currentSession?.user?.username ?? null;
  const preferredLanguage = currentSession?.profile?.preferred_language ?? null;
  const sessionCountry = currentSession?.profile?.country ?? null;

  if (!payload["Country"]) {
    payload["Country"] = sessionCountry;
  }

  payload["Recorder"] = sessionUsername;
  payload["Preferred Language"] = preferredLanguage;
  payload["Date of Recording"] = new Date().toISOString().slice(0, 10);
  payload.created_by_app_user_id = appUserId;

  const lng = payload["Longitude"];
  const lat = payload["Latitude"];

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
      INSERT INTO ${MONUMENTS_TABLE} (${columnSql}${geomSql})
      VALUES (${fields.map((_, i) => `$${i + 1}`).join(", ")}${geomValueSql})
      RETURNING id
    `;

    const insertResult = await pool.query(insertSql, queryValues);
    const newId = insertResult.rows[0].id;

    const freshRow = await fetchMonumentRowById(newId);
    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

    return res.status(201).json({
      ok: true,
      record: buildMonumentRecord(freshRow, lang)
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

// ========================================================
// UPDATE
// ========================================================

router.patch("/monuments/:id", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  if (!canEditMonuments(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to edit workspace monuments"
    });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ ok: false, error: "Invalid monument id" });
  }

  const payload = normaliseMonumentPayload(req.body || {});
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

    const updateSql = `
      UPDATE ${MONUMENTS_TABLE}
      SET ${setParts.join(", ")}
      WHERE id = $${values.length + 1}
        AND created_by_app_user_id = $${values.length + 2}
      RETURNING id
    `;

    const updateResult = await pool.query(updateSql, [...values, id, userId]);

    if (updateResult.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        error: "You can only edit your own records"
      });
    }

    const freshRow = await fetchMonumentRowById(id);
    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

    return res.json({
      ok: true,
      record: buildMonumentRecord(freshRow, lang)
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

module.exports = router;