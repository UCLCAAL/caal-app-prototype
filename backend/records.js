const express = require("express");
const pool = require("./db");
const {
  getWorkspaceStorage,
  getSessionWorkspaceCode,
  workspaceMonumentViewSql,
  workspaceArchiveViewSql,
  workspaceStorageScopeSql,
  viewSql,
  tableSql,
  enabledWorkspaceStorageConfigs
} = require("./workspaceStorage");

function resolveWorkspaceStoragesForSession(currentSession) {
  const ws = getWorkspaceStorage(currentSession);

  // National users resolve against their own workspace schema.
  if (ws.workspaceCode !== "caal") {
    return [ws];
  }

  // CAAL users resolve against every enabled national workspace schema.
  return enabledWorkspaceStorageConfigs();
}

function monumentResolveViewForStorage(storage) {
  return viewSql(
    storage.schema,
    storage.monumentAppView || storage.monumentView || "v_monuments_grid_base"
  );
}

function archiveResolveViewForStorage(storage) {
  return viewSql(
    storage.schema,
    storage.archiveAppView || storage.archiveView || "v_archive_grid_base"
  );
}

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
      storage: row.storage_scope || null,
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
      storage: row.storage_scope || null,
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
    getAccessLevel(session) === 9 &&
    getSessionWorkspaceCode(session) === "caal"
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

  const lang = req.query.lang || currentSession.profile?.preferred_language || "en";
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLangForDisplay(safeLang);

  const scopes = getAllowedScopes(currentSession);

  const workspaceCode = String(
    currentSession?.user?.workspace_code ??
    currentSession?.profile?.workspace_code ??
    ""
  ).trim().toLowerCase();

  try {
    // 1. Workspace monument
    if (scopes.includes("workspace") || scopes.includes("all_caal")) {
      const workspaceStorages = resolveWorkspaceStoragesForSession(currentSession);

      for (const storage of workspaceStorages) {
        const monumentView = monumentResolveViewForStorage(storage);

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
            'workspace'::text AS source_scope,
            $2::text AS storage_scope
          FROM ${monumentView} v
          LEFT JOIN public.record_registry rr
            ON rr.source_schema = $3
          AND rr.source_table = 'CAAL_Monuments'
          AND rr.source_row_id = v.id
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
          AND COALESCE(rr.status, '') <> 'deleted'
          LIMIT 1
          `,
          [caalId, storage.storageScope, storage.schema]
        );

        if (result.rows.length) {
          return res.json({
            ok: true,
            exists: true,
            caal_id: caalId,
            record_type: "monument",
            source_scope:
              getWorkspaceStorage(currentSession).workspaceCode === "caal"
                ? "all_caal"
                : "workspace",
            storage_scope: storage.storageScope
          });
        }
      }
    }

    // 2. Public CAAL monument
    if (scopes.includes("national_ref") || scopes.includes("all_caal")) {
      const result = await pool.query(
        `
        SELECT
          "CAAL_ID" AS caal_id,
          'monument'::text AS record_type,
          'public_caal'::text AS storage_scope,
          CASE
            WHEN NULLIF(workspace_code, '') IS NOT NULL
              AND lower(workspace_code) = $2
            THEN 'national_ref'
            ELSE 'all_caal'
          END AS source_scope
        FROM ui.mv_monuments_caal
        WHERE lower(trim("CAAL_ID")) = lower(trim($1))
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
          return res.json({
            ok: true,
            exists: true,
            ...row
          });
        }
      }
    }

    // 3. Workspace archive
    if (scopes.includes("workspace") || scopes.includes("all_caal")) {
      const workspaceStorages = resolveWorkspaceStoragesForSession(currentSession);

      for (const storage of workspaceStorages) {
        const archiveView = archiveResolveViewForStorage(storage);

        const result = await pool.query(
          `
          SELECT
            v.*,
            'workspace'::text AS source_scope,
            $2::text AS storage_scope
          FROM ${archiveView} v
          LEFT JOIN public.record_registry rr
            ON rr.source_schema = $3
          AND rr.source_table = 'CAAL_Archive'
          AND rr.source_row_id = v.id
          WHERE v."CAAL_ID" = $1
            AND COALESCE(rr.status, '') <> 'deleted'
          LIMIT 1
          `,
          [caalId, storage.storageScope, storage.schema]
        );

        if (result.rows.length) {
          return res.json({
            ok: true,
            exists: true,
            caal_id: caalId,
            record_type: "archive",
            source_scope:
              getWorkspaceStorage(currentSession).workspaceCode === "caal"
                ? "all_caal"
                : "workspace",
            storage_scope: storage.storageScope
          });
        }
      }
    }

    // 4. Public CAAL archive
    if (scopes.includes("national_ref") || scopes.includes("all_caal")) {

      const result = await pool.query(
        `
        SELECT
          "CAAL_ID" AS caal_id,
          'archive'::text AS record_type,
          'public_caal'::text AS storage_scope,
          CASE
            WHEN NULLIF(workspace_code, '') IS NOT NULL
              AND lower(workspace_code) = $2
            THEN 'national_ref'
            ELSE 'all_caal'
          END AS source_scope
        FROM ui.mv_archive_caal_app
        WHERE lower(trim("CAAL_ID")) = lower(trim($1))
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
          return res.json({
            ok: true,
            exists: true,
            ...row
          });
        }
      }
    }

    // 5. Other public CAAL resource tables
    // This is a lightweight validation check only. It does not expose full records.
    // It lets the related-resource chip turn valid for RS, Vernacular, Institution, etc.
    const otherPublicResult = await pool.query(
      `
      WITH q AS (
        SELECT lower(trim($1::text)) AS caal_id_norm
      ),
      matches AS (
        SELECT
          c."CAAL_ID" AS caal_id,
          'cartography'::text AS record_type,
          'all_caal'::text AS source_scope,
          'public_caal'::text AS storage_scope,
          'public.CAAL_Cartography'::text AS found_in_table,
          c.id::text AS source_row_id,
          10 AS priority
        FROM public."CAAL_Cartography" c, q
        WHERE lower(trim(c."CAAL_ID")) = q.caal_id_norm

        UNION ALL

        SELECT
          d."CAAL_ID" AS caal_id,
          'dataset'::text AS record_type,
          'all_caal'::text AS source_scope,
          'public_caal'::text AS storage_scope,
          'public.CAAL_Datasets'::text AS found_in_table,
          d.id::text AS source_row_id,
          20 AS priority
        FROM public."CAAL_Datasets" d, q
        WHERE lower(trim(d."CAAL_ID")) = q.caal_id_norm

        UNION ALL

        SELECT
          i."CAAL_ID" AS caal_id,
          'institution'::text AS record_type,
          'all_caal'::text AS source_scope,
          'public_caal'::text AS storage_scope,
          'public.CAAL_Institution'::text AS found_in_table,
          i.id::text AS source_row_id,
          30 AS priority
        FROM public."CAAL_Institution" i, q
        WHERE lower(trim(i."CAAL_ID")) = q.caal_id_norm

        UNION ALL

        SELECT
          g."CAAL_ID" AS caal_id,
          'remote_sensing_group'::text AS record_type,
          'all_caal'::text AS source_scope,
          'public_caal'::text AS storage_scope,
          'public.CAAL_RS3_Group'::text AS found_in_table,
          g.id::text AS source_row_id,
          40 AS priority
        FROM public."CAAL_RS3_Group" g, q
        WHERE lower(trim(g."CAAL_ID")) = q.caal_id_norm

        UNION ALL

        SELECT
          l."CAAL_ID" AS caal_id,
          'remote_sensing_line'::text AS record_type,
          'all_caal'::text AS source_scope,
          'public_caal'::text AS storage_scope,
          'public.CAAL_RS3_Line'::text AS found_in_table,
          l.id::text AS source_row_id,
          50 AS priority
        FROM public."CAAL_RS3_Line" l, q
        WHERE lower(trim(l."CAAL_ID")) = q.caal_id_norm

        UNION ALL

        SELECT
          p."CAAL_ID" AS caal_id,
          'remote_sensing_polygon'::text AS record_type,
          'all_caal'::text AS source_scope,
          'public_caal'::text AS storage_scope,
          'public.CAAL_RS3_Poly'::text AS found_in_table,
          p.id::text AS source_row_id,
          60 AS priority
        FROM public."CAAL_RS3_Poly" p, q
        WHERE lower(trim(p."CAAL_ID")) = q.caal_id_norm

        UNION ALL

        SELECT
          v."CAAL_ID" AS caal_id,
          'vernacular'::text AS record_type,
          'all_caal'::text AS source_scope,
          'public_caal'::text AS storage_scope,
          'public.CAAL_Vernacular'::text AS found_in_table,
          v.id::text AS source_row_id,
          70 AS priority
        FROM public."CAAL_Vernacular" v, q
        WHERE lower(trim(v."CAAL_ID")) = q.caal_id_norm

        -- Add later if/when this table exists:
        -- UNION ALL
        -- SELECT
        --   act."CAAL_ID" AS caal_id,
        --   'actor'::text AS record_type,
        --   'all_caal'::text AS source_scope,
        --   'public_caal'::text AS storage_scope,
        --   'public.CAAL_Actors'::text AS found_in_table,
        --   act.id::text AS source_row_id,
        --   80 AS priority
        -- FROM public."CAAL_Actors" act, q
        -- WHERE lower(trim(act."CAAL_ID")) = q.caal_id_norm
      )
      SELECT
        caal_id,
        record_type,
        source_scope,
        storage_scope,
        found_in_table,
        source_row_id
      FROM matches
      ORDER BY priority
      LIMIT 1
      `,
      [caalId]
    );

    if (otherPublicResult.rows.length) {
      return res.json({
        ok: true,
        exists: true,
        ...otherPublicResult.rows[0]
      });
    }

    return res.json({
      ok: true,
      exists: false,
      caal_id: caalId,
      record_type: null,
      source_scope: null,
      storage_scope: null,
      found_in_table: null,
      source_row_id: null
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
    if (scopes.includes("workspace") || scopes.includes("all_caal")) {
      const workspaceStorages = resolveWorkspaceStoragesForSession(currentSession);

      for (const storage of workspaceStorages) {
        if (!storage?.monumentView && !storage?.monumentAppView) continue;

        const monumentView = monumentResolveViewForStorage(storage);

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
            CASE
              WHEN $3::text = 'caal' THEN 'all_caal'
              ELSE 'workspace'
            END AS source_scope,
            $2::text AS storage_scope
          FROM ${monumentView} v
          LEFT JOIN public.record_registry rr
            ON rr.source_schema = $4
          AND rr.source_table = 'CAAL_Monuments'
          AND rr.source_row_id = v.id
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
            AND COALESCE(rr.status, '') <> 'deleted'
          LIMIT 1
          `,
          [
            caalId,
            storage.storageScope,
            String(getWorkspaceStorage(currentSession).workspaceCode || ""),
            storage.schema
          ]
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
          'public_caal'::text AS storage_scope,
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
    if (scopes.includes("workspace") || scopes.includes("all_caal")) {
      const workspaceStorages = resolveWorkspaceStoragesForSession(currentSession);

      for (const storage of workspaceStorages) {
        if (!storage?.archiveView && !storage?.archiveAppView) continue;

        const archiveView = archiveResolveViewForStorage(storage);

        const result = await pool.query(
          `
          SELECT
            v.*,
            CASE
              WHEN $3::text = 'caal' THEN 'all_caal'
              ELSE 'workspace'
            END AS source_scope,
            $2::text AS storage_scope
          FROM ${archiveView} v
          LEFT JOIN public.record_registry rr
            ON rr.source_schema = $4
          AND rr.source_table = 'CAAL_Archive'
          AND rr.source_row_id = v.id
          WHERE v."CAAL_ID" = $1
            AND COALESCE(rr.status, '') <> 'deleted'
          LIMIT 1
          `,
          [
            caalId,
            storage.storageScope,
            String(getWorkspaceStorage(currentSession).workspaceCode || ""),
            storage.schema
          ]
        );

        if (result.rows.length) {
          const record = buildResolvedArchiveRecord(
            result.rows[0],
            lang,
            currentSession
          );

          return sendResolvedRecord(res, "archive", record);
        }
      }
    }

    // 4. National/all CAAL archive
    if (scopes.includes("national_ref") || scopes.includes("all_caal")) {
      const result = await pool.query(
        `
        SELECT
          m.*,
          'public_caal'::text AS storage_scope,
          CASE
            WHEN NULLIF(m.workspace_code, '') IS NOT NULL
              AND lower(m.workspace_code) = $2
            THEN 'national_ref'
            ELSE 'all_caal'
          END AS source_scope
        FROM ui.mv_archive_caal_app m
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
          const record = buildResolvedArchiveRecord(
            stripMonumentInternalFields(row),
            lang,
            currentSession
          );

          return sendResolvedRecord(res, "archive", record);
        }
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

// FOR RELATED RECORDS AUTO COMPLETE SUGGESTIONS
function sqlTextLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function suggestWorkspaceStoragesForSession(currentSession) {
  const ws = getWorkspaceStorage(currentSession);

  if (ws.workspaceCode !== "caal") {
    return [ws];
  }

  return enabledWorkspaceStorageConfigs();
}

function suggestSourceScopeForStorage(currentSession) {
  const ws = getWorkspaceStorage(currentSession);
  return ws.workspaceCode === "caal" ? "all_caal" : "workspace";
}

function wrapSuggestBranch(sql) {
  return `
    SELECT *
    FROM (
      ${sql}
    ) branch
  `;
}

function publicCaalSuggestSqlParts({ safeLang, fallbackLang }) {
  return [
    wrapSuggestBranch(`
      SELECT
        m."CAAL_ID" AS caal_id,
        'monument'::text AS record_type,
        CASE
          WHEN NULLIF(m.workspace_code, '') IS NOT NULL
          AND lower(m.workspace_code) = $3
          THEN 'national_ref'
          ELSE 'all_caal'
        END AS source_scope,
        'public_caal'::text AS storage_scope,
        COALESCE(m."Primary Name", m."Primary Name (English)", '') AS title,
        COALESCE(
          m.monument_type1_${safeLang},
          m.monument_type1_${fallbackLang},
          m.monument_type1_en,
          m."Monument Type1",
          ''
        ) AS subtitle
      FROM ui.mv_monuments_caal m
      WHERE lower(m."CAAL_ID") LIKE lower($1)
    `),

    wrapSuggestBranch(`
      SELECT
        a."CAAL_ID" AS caal_id,
        'archive'::text AS record_type,
        CASE
          WHEN NULLIF(a.workspace_code, '') IS NOT NULL
          AND lower(a.workspace_code) = $3
          THEN 'national_ref'
          ELSE 'all_caal'
        END AS source_scope,
        'public_caal'::text AS storage_scope,
        COALESCE(a."Original Title", a."English Title", a."Original Reference", '') AS title,
        COALESCE(a."Original Reference", '') AS subtitle
      FROM ui.mv_archive_caal_app a
      WHERE lower(a."CAAL_ID") LIKE lower($1)
    `),

    wrapSuggestBranch(`
      SELECT
        c."CAAL_ID" AS caal_id,
        'cartography'::text AS record_type,
        'all_caal'::text AS source_scope,
        'public_caal'::text AS storage_scope,
        COALESCE(c."CAAL_ID", '') AS title,
        'Cartography'::text AS subtitle
      FROM public."CAAL_Cartography" c
      WHERE lower(c."CAAL_ID") LIKE lower($1)
    `),

    wrapSuggestBranch(`
      SELECT
        d."CAAL_ID" AS caal_id,
        'dataset'::text AS record_type,
        'all_caal'::text AS source_scope,
        'public_caal'::text AS storage_scope,
        COALESCE(d."CAAL_ID", '') AS title,
        'Dataset'::text AS subtitle
      FROM public."CAAL_Datasets" d
      WHERE lower(d."CAAL_ID") LIKE lower($1)
    `),

    wrapSuggestBranch(`
      SELECT
        i."CAAL_ID" AS caal_id,
        'institution'::text AS record_type,
        'all_caal'::text AS source_scope,
        'public_caal'::text AS storage_scope,
        COALESCE(i."CAAL_ID", '') AS title,
        'Institution'::text AS subtitle
      FROM public."CAAL_Institution" i
      WHERE lower(i."CAAL_ID") LIKE lower($1)
    `),

    wrapSuggestBranch(`
      SELECT
        g."CAAL_ID" AS caal_id,
        'remote_sensing_group'::text AS record_type,
        'all_caal'::text AS source_scope,
        'public_caal'::text AS storage_scope,
        COALESCE(g."CAAL_ID", '') AS title,
        'Remote sensing group'::text AS subtitle
      FROM public."CAAL_RS3_Group" g
      WHERE lower(g."CAAL_ID") LIKE lower($1)
    `),

    wrapSuggestBranch(`
      SELECT
        l."CAAL_ID" AS caal_id,
        'remote_sensing_line'::text AS record_type,
        'all_caal'::text AS source_scope,
        'public_caal'::text AS storage_scope,
        COALESCE(l."CAAL_ID", '') AS title,
        'Remote sensing line'::text AS subtitle
      FROM public."CAAL_RS3_Line" l
      WHERE lower(l."CAAL_ID") LIKE lower($1)
    `),

    wrapSuggestBranch(`
      SELECT
        p."CAAL_ID" AS caal_id,
        'remote_sensing_polygon'::text AS record_type,
        'all_caal'::text AS source_scope,
        'public_caal'::text AS storage_scope,
        COALESCE(p."CAAL_ID", '') AS title,
        'Remote sensing polygon'::text AS subtitle
      FROM public."CAAL_RS3_Poly" p
      WHERE lower(p."CAAL_ID") LIKE lower($1)
    `),

    wrapSuggestBranch(`
      SELECT
        v."CAAL_ID" AS caal_id,
        'vernacular'::text AS record_type,
        'all_caal'::text AS source_scope,
        'public_caal'::text AS storage_scope,
        COALESCE(v."CAAL_ID", '') AS title,
        'Vernacular'::text AS subtitle
      FROM public."CAAL_Vernacular" v
      WHERE lower(v."CAAL_ID") LIKE lower($1)
    `)
  ];
}

// for dropdown suggestion speed
function workspaceSuggestSqlForStorage(storage, sourceScope = "workspace") {
  const parts = [];

  const storageScopeSql = sqlTextLiteral(storage.storageScope);
  const sourceScopeSql = sqlTextLiteral(sourceScope);
  const sourceSchemaSql = sqlTextLiteral(storage.schema);

  if (storage?.schema && storage?.monumentTable) {
    parts.push(wrapSuggestBranch(`
      SELECT
        m."CAAL_ID" AS caal_id,
        'monument'::text AS record_type,
        ${sourceScopeSql}::text AS source_scope,
        ${storageScopeSql}::text AS storage_scope,
        COALESCE(m."Primary Name", m."Primary Name (English)", m."CAAL_ID", '') AS title,
        COALESCE(m."Primary Name (English)", '') AS subtitle
      FROM ${tableSql(storage.schema, storage.monumentTable)} m
      LEFT JOIN public.record_registry rr
        ON rr.source_schema = ${sourceSchemaSql}
      AND rr.source_table = 'CAAL_Monuments'
      AND rr.source_row_id = m.id
      WHERE lower(m."CAAL_ID") LIKE lower($1)
        AND COALESCE(rr.status, '') <> 'deleted'
      ORDER BY m."CAAL_ID"
    `));
  }

  if (storage?.schema && storage?.archiveTable) {
    parts.push(wrapSuggestBranch(`
      SELECT
        a."CAAL_ID" AS caal_id,
        'archive'::text AS record_type,
        ${sourceScopeSql}::text AS source_scope,
        ${storageScopeSql}::text AS storage_scope,
        COALESCE(a."Original Title", a."English Title", a."Original Reference", a."CAAL_ID", '') AS title,
        COALESCE(a."Original Reference", '') AS subtitle
      FROM ${tableSql(storage.schema, storage.archiveTable)} a
      LEFT JOIN public.record_registry rr
        ON rr.source_schema = ${sourceSchemaSql}
      AND rr.source_table = 'CAAL_Archive'
      AND rr.source_row_id = a.id
      WHERE lower(a."CAAL_ID") LIKE lower($1)
        AND COALESCE(rr.status, '') <> 'deleted'
      ORDER BY a."CAAL_ID"
    `));
  }

  return parts;
}

// actual fetch
router.get("/suggest", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const q = String(req.query.q || "").trim();

  const requestedLimit = Number(req.query.limit) || 50;
  const limit = Math.min(Math.max(requestedLimit, 1), 100);

  const lang = req.query.lang || currentSession.profile?.preferred_language || "en";
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLangForDisplay(safeLang);

  if (q.length < 4) {
    return res.json({ ok: true, suggestions: [] });
  }

  const workspaceCode = String(
    currentSession?.user?.workspace_code ??
    currentSession?.profile?.workspace_code ??
    ""
  ).trim().toLowerCase();

  const scopes = getAllowedScopes(currentSession);

  try {
    const values = [`${q}%`, `%${q}%`, workspaceCode, scopes, limit];
    const parts = [];

    const workspaceStorages = suggestWorkspaceStoragesForSession(currentSession);
    const workspaceSourceScope = suggestSourceScopeForStorage(currentSession);

    if (scopes.includes("workspace") || scopes.includes("all_caal")) {
      workspaceStorages.forEach((storage) => {
        parts.push(...workspaceSuggestSqlForStorage(storage, workspaceSourceScope));
      });
    }

    if (scopes.includes("national_ref") || scopes.includes("all_caal")) {
      parts.push(...publicCaalSuggestSqlParts({ safeLang, fallbackLang }));
    }

    if (!parts.length) {
      return res.json({ ok: true, suggestions: [] });
    }

    const sql = `
      SELECT *
      FROM (
        ${parts.join("\nUNION ALL\n")}
      ) s
      WHERE source_scope = 'workspace'
        OR source_scope = 'national_ref'
        OR source_scope = ANY($4)
      ORDER BY
        CASE
          WHEN lower(caal_id) LIKE lower($1) THEN 0
          WHEN lower(caal_id) LIKE lower($2) THEN 1
          ELSE 2
        END,
        caal_id
      LIMIT $5
    `;

    const result = await pool.query(sql, values);

    return res.json({
      ok: true,
      suggestions: result.rows
    });
  } catch (error) {
    console.error("CAAL_ID suggest failed:", error);

    return res.status(500).json({
      ok: false,
      error: "CAAL_ID suggest failed",
      detail: error.message
    });
  }
});

module.exports = router;