const express = require("express");
const pool = require("./db");
const { getResourceRelations } = require("./resourceRelations");

const router = express.Router();


function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

const ALLOWED_MONUMENT_LANGS = new Set([
  "en", "ru", "zh", "kk", "ky", "tg", "tk", "uz"
]);

function safeMonumentLang(lang) {
  const value = String(lang || "en").toLowerCase();
  return ALLOWED_MONUMENT_LANGS.has(value) ? value : "en";
}

function pickLangValue(row, baseName, lang, fallbackOrder = []) {
  const direct = row[`${baseName}_${lang}`];
  if (direct !== undefined && direct !== null && direct !== "") return direct;

  for (const key of fallbackOrder) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return null;
}

function fallbackLangForDisplay(lang) {
  return ["kk", "ky", "tg", "tk", "uz"].includes(String(lang || "").toLowerCase())
    ? "ru"
    : "en";
}

function pickLangValueWithFallback(row, baseName, lang, fallbackOrder = []) {
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLangForDisplay(safeLang);

  const direct = row[`${baseName}_${safeLang}`];
  if (direct !== undefined && direct !== null && direct !== "") {
    return direct;
  }

  const fallback = row[`${baseName}_${fallbackLang}`];
  if (fallback !== undefined && fallback !== null && fallback !== "") {
    return fallback;
  }

  for (const key of fallbackOrder) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function buildGeometry(row) {
  const lng = firstDefined(row["Longitude"], row.longitude);
  const lat = firstDefined(row["Latitude"], row.latitude);

  if (lng === null || lat === null || lng === "" || lat === "") return null;

  const numLng = Number(lng);
  const numLat = Number(lat);

  if (!Number.isFinite(numLng) || !Number.isFinite(numLat)) return null;

  return {
    type: "Point",
    coordinates: [numLng, numLat]
  };
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

function buildResolvedMonumentRecord(row, lang, session) {
  return {
    identity: {
      id: row.id,
      caal_id: row["CAAL_ID"]
    },
    summary: {
      primary_name: firstDefined(row["Primary Name"], row.primary_name),
      primary_name_english: firstDefined(row["Primary Name (English)"], row.primary_name_english),

      country: firstDefined(
        row.country_display,
        pickLangValueWithFallback(row, "country", lang, ["Country"])
      ),

      classification: firstDefined(
        row.classification_display,
        pickLangValueWithFallback(row, "classification", lang, ["Classification"])
      ),

      designation: firstDefined(
        row.designation_display,
        pickLangValueWithFallback(row, "designation", lang, ["Designation"])
      ),

      monument_type1: firstDefined(
        row.monument_type1_display,
        pickLangValueWithFallback(row, "monument_type1", lang, ["Monument Type1"])
      ),

      cultural_period1: firstDefined(
        row.cultural_period1_display,
        pickLangValueWithFallback(row, "cultural_period1", lang, ["Cultural Period1"])
      ),

      religion1: firstDefined(
        row.religion1_display,
        pickLangValueWithFallback(row, "religion1", lang, ["Religion1"])
      )
    },
    raw: row,
    geometry: buildGeometry(row),
    source: {
      scope: row.source_scope,
      is_editable: isEditableResolvedRow(row, session)
    }
  };
}

function buildResolvedArchiveRecord(row, lang, session) {
  return {
    identity: {
      id: row.id,
      caal_id: firstDefined(row["CAAL_ID"], row.caal_id),
      associated_caal_id: firstDefined(row["Associated CAAL_ID"], row.associated_caal_id)
    },
    summary: {
      original_title: firstDefined(row["Original Title"], row.original_title),
      english_title: firstDefined(row["English Title"], row.english_title),
      original_reference: firstDefined(row["Original Reference"], row.original_reference),
      content_type: pickLangValueWithFallback(row, "content_type", lang, ["Content Type", "content_type_en", "content_type"]),
      country: pickLangValueWithFallback(row, "country", lang, ["Country", "country_en", "country"]),
      level: pickLangValueWithFallback(row, "level", lang, ["Level", "level_en", "level"]),
      archive_recorder: firstDefined(row["Archive Recorder"], row.archive_recorder),
      date_of_recording: firstDefined(row["Date of Recording"], row.date_of_recording)
    },
    raw: row,
    source: {
      scope: row.source_scope,
      is_editable: isEditableResolvedRow(row, session)
    }
  };
}

function getAllowedScopes(session) {
  const scopes = [];

  if (session?.permissions?.can_view_workspace) {
    scopes.push("workspace");
    scopes.push("national_ref");
  }

  if (session?.permissions?.can_view_all_caal) {
    scopes.push("all_caal");
  }

  return scopes;
}

function getAccessLevel(session) {
  return Number(
    session?.user?.access_level ??
    session?.profile?.access_level ??
    session?.permissions?.access_level ??
    session?.access_level ??
    0
  );
}

function canEditCaal(session) {
  return (
    session?.permissions?.can_edit_caal === true ||
    getAccessLevel(session) === 9
  );
}

function canEditWorkspace(session) {
  return session?.permissions?.can_edit_workspace === true;
}

function isEditableResolvedRow(row, session) {
  const currentAppUserId = session?.user?.user_id ?? null;
  const recordAppUserId = row?.created_by_app_user_id ?? null;

  const isOwner =
    currentAppUserId !== null &&
    recordAppUserId !== null &&
    Number(currentAppUserId) === Number(recordAppUserId);

  const isSuperUser = canEditCaal(session);
  const isWorkspaceRecord = row?.source_scope === "workspace";
  const isCaalRecord =
    row?.source_scope === "national_ref" ||
    row?.source_scope === "all_caal";

  return (
    (isWorkspaceRecord && canEditWorkspace(session) && (isOwner || isSuperUser)) ||
    (isCaalRecord && isSuperUser)
  );
}

function buildMonumentResolveSql(scopes) {
  const parts = [];

  if (scopes.includes("workspace")) {
    parts.push(`
      SELECT *, 'workspace'::text AS source_scope
      FROM kz.v_monuments_grid_base
      WHERE "CAAL_ID" = $1
    `);
  }

  if (scopes.includes("national_ref")) {
    parts.push(`
      SELECT *, 'national_ref'::text AS source_scope
      FROM ui.mv_monuments_caal
      WHERE "CAAL_ID" = $1
        AND (
          "CAAL_ID" LIKE 'Mon_KZ_%'
          OR btrim(coalesce("Country", '')) IN ('Kazakhstan', 'Казахстан')
        )
    `);
  }

  if (scopes.includes("all_caal")) {
    parts.push(`
      SELECT *, 'all_caal'::text AS source_scope
      FROM ui.mv_monuments_caal
      WHERE "CAAL_ID" = $1
    `);
  }

  return parts.join("\nUNION ALL\n");
}

function buildArchiveResolveSql(scopes) {
  const parts = [];

  if (scopes.includes("workspace")) {
    parts.push(`
      SELECT *, 'workspace'::text AS source_scope
      FROM kz.v_archive_grid_base
      WHERE "CAAL_ID" = $1
    `);
  }

  if (scopes.includes("national_ref")) {
    parts.push(`
      SELECT *
      FROM kz.mv_archive_combined
      WHERE source_scope = 'national_ref'
        AND "CAAL_ID" = $1
    `);
  }

  if (scopes.includes("all_caal")) {
    parts.push(`
      SELECT *
      FROM kz.mv_archive_combined
      WHERE source_scope = 'all_caal'
        AND "CAAL_ID" = $1
    `);
  }

  return parts.join("\nUNION ALL\n");
}

async function sendResolvedRecord(res, recordType, record) {
  record.relations = await getResourceRelations(pool, record.identity?.caal_id);

  return res.json({
    ok: true,
    record_type: recordType,
    record
  });
}

router.get("/check", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  const caalId = String(req.query.caal_id || "").trim();

  if (!caalId) {
    return res.status(400).json({
      ok: false,
      error: "Missing caal_id"
    });
  }

  const scopes = getAllowedScopes(currentSession);

  try {
    // 1. Workspace monument
    if (scopes.includes("workspace")) {
      const result = await pool.query(
        `
        SELECT
          "CAAL_ID" AS caal_id,
          'monument'::text AS record_type,
          'workspace'::text AS source_scope
        FROM kz.v_monuments_grid_base
        WHERE lower(trim("CAAL_ID")) = lower(trim($1))
        LIMIT 1
        `,
        [caalId]
      );

      if (result.rows.length) {
        return res.json({
          ok: true,
          exists: true,
          ...result.rows[0]
        });
      }
    }

    // 2. Public CAAL monument
    if (scopes.includes("national_ref") || scopes.includes("all_caal")) {
      const result = await pool.query(
        `
        SELECT
          "CAAL_ID" AS caal_id,
          'monument'::text AS record_type,
          CASE
            WHEN (
              "CAAL_ID" LIKE 'Mon_KZ_%'
              OR btrim(coalesce("Country", '')) IN ('Kazakhstan', 'Казахстан')
            )
            THEN 'national_ref'
            ELSE 'all_caal'
          END AS source_scope
        FROM ui.mv_monuments_caal
        WHERE lower(trim("CAAL_ID")) = lower(trim($1))
        LIMIT 1
        `,
        [caalId]
      );

      if (result.rows.length) {
        const row = result.rows[0];

        if (
          row.source_scope === "national_ref" ||
          scopes.includes("all_caal")
        ) {
          return res.json({
            ok: true,
            exists: true,
            ...row
          });
        }
      }
    }

    // 3. Workspace archive
    if (scopes.includes("workspace")) {
      const result = await pool.query(
        `
        SELECT
          "CAAL_ID" AS caal_id,
          'archive'::text AS record_type,
          'workspace'::text AS source_scope
        FROM kz.v_archive_grid_base
        WHERE lower(trim("CAAL_ID")) = lower(trim($1))
        LIMIT 1
        `,
        [caalId]
      );

      if (result.rows.length) {
        return res.json({
          ok: true,
          exists: true,
          ...result.rows[0]
        });
      }
    }

    // 4. Public CAAL archive
    if (scopes.includes("national_ref") || scopes.includes("all_caal")) {
      const result = await pool.query(
        `
        SELECT
          "CAAL_ID" AS caal_id,
          'archive'::text AS record_type,
          source_scope
        FROM kz.mv_archive_combined
        WHERE lower(trim("CAAL_ID")) = lower(trim($1))
          AND source_scope = ANY($2)
        ORDER BY
          CASE source_scope
            WHEN 'workspace' THEN 1
            WHEN 'national_ref' THEN 2
            WHEN 'all_caal' THEN 3
            ELSE 99
          END
        LIMIT 1
        `,
        [caalId, scopes]
      );

      if (result.rows.length) {
        return res.json({
          ok: true,
          exists: true,
          ...result.rows[0]
        });
      }
    }

    return res.json({
      ok: true,
      exists: false,
      caal_id: caalId,
      record_type: null,
      source_scope: null
    });
  } catch (error) {
    console.error("CAAL_ID check failed:", error);

    return res.status(500).json({
      ok: false,
      error: "CAAL_ID check failed",
      detail: error.message
    });
  }
});

router.get("/resolve", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const caalId = String(req.query.caal_id || "").trim();

  if (!caalId) {
    return res.status(400).json({ ok: false, error: "Missing caal_id" });
  }

  const lang = req.query.lang || currentSession.profile?.preferred_language || "en";
  const scopes = getAllowedScopes(currentSession);

  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLangForDisplay(safeLang);

  const workspaceCode = String(
    currentSession?.user?.workspace_code ??
    currentSession?.profile?.workspace_code ??
    ""
  ).trim().toLowerCase();

  try {
    // 1. Workspace monument
    if (scopes.includes("workspace")) {
      const result = await pool.query(
        `
        SELECT
          v.*,
          COALESCE(country.display_${safeLang}, country.display_${fallbackLang}, country.display_en, v."Country") AS country_display,
          COALESCE(cls.display_${safeLang}, cls.display_${fallbackLang}, cls.display_en, v."Classification") AS classification_display,
          COALESCE(desig.display_${safeLang}, desig.display_${fallbackLang}, desig.display_en, v."Designation") AS designation_display,
          COALESCE(mt1.display_${safeLang}, mt1.display_${fallbackLang}, mt1.display_en, v."Monument Type1") AS monument_type1_display,
          COALESCE(cp1.display_${safeLang}, cp1.display_${fallbackLang}, cp1.display_en, v."Cultural Period1") AS cultural_period1_display,
          COALESCE(rel1.display_${safeLang}, rel1.display_${fallbackLang}, rel1.display_en, v."Religion1") AS religion1_display,
          'workspace'::text AS source_scope
        FROM kz.v_monuments_grid_base v
        LEFT JOIN ui.v_lkp_countries country
          ON country.canonical_value = v."Country"
        LEFT JOIN ui.v_lkp_classifications cls
          ON cls.canonical_value = v."Classification"
        LEFT JOIN ui.v_lkp_designation_type desig
          ON desig.canonical_value = v."Designation"
        LEFT JOIN ui.v_lkp_site_types_context mt1
          ON mt1.canonical_value = v."Monument Type1"
        LEFT JOIN ui.v_lkp_cultural_periods_context cp1
          ON cp1.canonical_value = v."Cultural Period1"
        LEFT JOIN ui.v_lkp_religion rel1
          ON rel1.canonical_value = v."Religion1"
        WHERE v."CAAL_ID" = $1
        LIMIT 1
        `,
        [caalId]
      );

      if (result.rows.length) {
        const record = buildResolvedMonumentRecord(
          stripMonumentInternalFields(result.rows[0]),
          lang,
          currentSession
        );

        return sendResolvedRecord(res, "monument", record);
      }
    }

    // 2. National/all CAAL monument
    if (scopes.includes("national_ref") || scopes.includes("all_caal")) {
      const result = await pool.query(
        `
        SELECT
          m.*,
          COALESCE(m.country_${safeLang}, m.country_${fallbackLang}, m.country_en, m."Country") AS country_display,
          COALESCE(m.classification_${safeLang}, m.classification_${fallbackLang}, m.classification_en, m."Classification") AS classification_display,
          COALESCE(m.designation_${safeLang}, m.designation_${fallbackLang}, m.designation_en, m."Designation") AS designation_display,
          COALESCE(m.monument_type1_${safeLang}, m.monument_type1_${fallbackLang}, m.monument_type1_en, m."Monument Type1") AS monument_type1_display,
          COALESCE(m.cultural_period1_${safeLang}, m.cultural_period1_${fallbackLang}, m.cultural_period1_en, m."Cultural Period1") AS cultural_period1_display,
          COALESCE(m.religion1_${safeLang}, m.religion1_${fallbackLang}, m.religion1_en, m."Religion1") AS religion1_display,
          CASE
            WHEN NULLIF(m.workspace_code, '') IS NOT NULL
            AND lower(m.workspace_code) = $2
            THEN 'national_ref'
            ELSE 'all_caal'
          END AS source_scope
        FROM ui.mv_monuments_caal m
        WHERE m."CAAL_ID" = $1
        LIMIT 1
        `,
        [caalId, workspaceCode]
      );

      if (result.rows.length) {
        const row = result.rows[0];

        if (
          row.source_scope === "national_ref" ||
          scopes.includes("all_caal")
        ) {
          const record = buildResolvedMonumentRecord(
            stripMonumentInternalFields(row),
            lang,
            currentSession
          );

          return sendResolvedRecord(res, "monument", record);
        }
      }
    }

    // 3. Workspace archive
    if (scopes.includes("workspace")) {
      const result = await pool.query(
        `
        SELECT *, 'workspace'::text AS source_scope
        FROM kz.v_archive_grid_base
        WHERE "CAAL_ID" = $1
        LIMIT 1
        `,
        [caalId]
      );

      if (result.rows.length) {
        const record = buildResolvedArchiveRecord(
          stripMonumentInternalFields(result.rows[0]),
          lang,
          currentSession
        );

        return sendResolvedRecord(res, "archive", record);
      }
    }

    // 4. National/all CAAL archive
    if (scopes.includes("national_ref") || scopes.includes("all_caal")) {
      const result = await pool.query(
        `
        SELECT *
        FROM kz.mv_archive_combined
        WHERE "CAAL_ID" = $1
          AND source_scope = ANY($2)
        ORDER BY
          CASE source_scope
            WHEN 'workspace' THEN 1
            WHEN 'national_ref' THEN 2
            WHEN 'all_caal' THEN 3
            ELSE 99
          END
        LIMIT 1
        `,
        [caalId, scopes]
      );

      if (result.rows.length) {
        const record = buildResolvedArchiveRecord(
          stripMonumentInternalFields(result.rows[0]),
          lang,
          currentSession
        );

        return sendResolvedRecord(res, "archive", record);
      }
    }

    return res.status(404).json({
      ok: false,
      error: "Related record not found"
    });

  } catch (error) {
    console.error("Related record resolve failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Related record resolve failed",
      detail: error.message
    });
  }
});

module.exports = router;