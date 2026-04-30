const express = require("express");
const pool = require("./db");

const router = express.Router();

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
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
      country: pickLangValue(row, "country", lang, ["Country"]),
      classification: pickLangValue(row, "classification", lang, ["Classification"]),
      designation: pickLangValue(row, "designation", lang, ["Designation"]),
      monument_type1: pickLangValue(row, "monument_type1", lang, ["Monument Type1"]),
      cultural_period1: pickLangValue(row, "cultural_period1", lang, ["Cultural Period1"])
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
      content_type: pickLangValue(row, "content_type", lang, ["Content Type", "content_type_en", "content_type"]),
      country: pickLangValue(row, "country", lang, ["Country", "country_en", "country"])
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

  try {
    // 1. Workspace monument
    if (scopes.includes("workspace")) {
      const result = await pool.query(
        `
        SELECT *, 'workspace'::text AS source_scope
        FROM kz.v_monuments_grid_base
        WHERE "CAAL_ID" = $1
        LIMIT 1
        `,
        [caalId]
      );

      if (result.rows.length) {
        return res.json({
          ok: true,
          record_type: "monument",
          record: buildResolvedMonumentRecord(
            stripMonumentInternalFields(result.rows[0]),
            lang,
            currentSession
          )
        });
      }
    }

    // 2. National/all CAAL monument
    if (scopes.includes("national_ref") || scopes.includes("all_caal")) {
      const result = await pool.query(
        `
        SELECT *,
          CASE
            WHEN (
              "CAAL_ID" LIKE 'Mon_KZ_%'
              OR btrim(coalesce("Country", '')) IN ('Kazakhstan', 'Казахстан')
            )
            THEN 'national_ref'
            ELSE 'all_caal'
          END AS source_scope
        FROM ui.mv_monuments_caal
        WHERE "CAAL_ID" = $1
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
            record_type: "monument",
            record: buildResolvedMonumentRecord(
              stripMonumentInternalFields(row),
              lang,
              currentSession
            )
          });
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
        return res.json({
          ok: true,
          record_type: "archive",
          record: buildResolvedArchiveRecord(
            stripMonumentInternalFields(result.rows[0]),
            lang,
            currentSession
          )
        });
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
        return res.json({
          ok: true,
          record_type: "archive",
          record: buildResolvedArchiveRecord(
            stripMonumentInternalFields(result.rows[0]),
            lang,
            currentSession
          )
        });
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