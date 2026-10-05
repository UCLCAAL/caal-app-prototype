function quoteRestoreColumn(name) {
  if (typeof name !== "string" || !name || name.includes("\0")) {
    throw new Error("Invalid restore column name");
  }
  return '"' + name.replace(/"/g, '""') + '"';
}

const express = require("express");
const pool = require("./db");
const {
  WORKSPACE_STORAGE,
  getWorkspaceStorage,
  getSessionWorkspaceCode,
  workspaceArchiveTableSql,
  workspaceArchiveAppViewSql,
  workspaceSourceSchemaSql,
  workspaceStorageScopeSql,
  workspaceSourceTableSql,
  storageScopeForSession,
  tableSqlForStorageScope,
  storageFromScope,
  tableSql,
  viewSql,
  inferRecordWorkspaceCodeFromPayload,
  archiveTableForWorkspaceCode,
  storageScopeForWorkspaceCode,
  createStorageTargetForRecord,
  enabledWorkspaceStorageConfigs,
  quoteIdent
} = require("./workspaceStorage");

const {
  getResourceRelations,
  syncResourceRelationsForArchive,
  deactivateResourceRelationsForDeletedRecord,
  reactivateResourceRelationsForRestoredRecord
} = require("./resourceRelations");

const { allocateCaalId } = require("./caalIdAllocator");

const router = express.Router();

function parseArchiveAppUserId(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function currentAppUserIdFromSession(session) {
  return parseArchiveAppUserId(session?.user?.user_id);
}

// Called only inside an explicit transaction on this same connection.
async function setPublicArchiveAuditContext(client, currentSession, action) {
  const installed = await client.query(`
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public."CAAL_Archive"'::regclass
      AND tgname = 'trg_log_caal_archive_edit'
      AND NOT tgisinternal AND tgenabled IN ('O', 'A')
  `);
  if (!installed.rows.length) {
    throw new Error("Archive audit trigger is missing or disabled. Install 01-install-archive-audit.sql first.");
  }
  const userId = currentAppUserIdFromSession(currentSession);
  await client.query(`
    SELECT set_config('caal.edit_source', 'web_app', true),
           set_config('caal.app_user_id', $1, true),
           set_config('caal.username', $2, true),
           set_config('caal.audit_action', $3, true),
           set_config('caal.audit_skip', 'false', true)
  `, [String(userId ?? ""), currentSession?.user?.username || "web_app", action]);
}

async function withPublicArchiveAuditTransaction(currentSession, action, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setPublicArchiveAuditContext(client, currentSession, action);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch (rollbackError) { console.error("Archive audit rollback failed:", rollbackError); }
    throw error;
  } finally {
    client.release();
  }
}

function archiveRegistryMatchSql(alias = "rr") {
  const p = alias ? `${alias}.` : "";

  return `
    (
      ${p}record_type = 'archive'
      OR ${p}source_table = 'CAAL_Archive'
    )
  `;
}

function sqlTextLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function archiveOwnedWorkspaceStorageConfigs(currentSession) {
  const ws = getWorkspaceStorage(currentSession);

  if (ws.workspaceCode !== "caal") {
    return [ws];
  }

  return enabledWorkspaceStorageConfigs()
    .filter((config) => {
      return (
        config?.archiveTable &&
        (config?.archiveAppView || config?.archiveView)
      );
    });
}

function archiveAllWorkspaceStorageConfigs() {
  return enabledWorkspaceStorageConfigs()
    .filter((config) => {
      return (
        config?.archiveTable &&
        (config?.archiveAppView || config?.archiveView)
      );
    });
}

function ownedWorkspaceArchiveSql(storage, userId) {
  const archiveView = viewSql(
    storage.schema,
    storage.archiveAppView || storage.archiveView
  );

  const storageScope = sqlTextLiteral(storage.storageScope);
  const sourceSchema = sqlTextLiteral(storage.schema);

  const deletedColumns = ARCHIVE_BROWSE_COLUMNS.map(column =>
    column.startsWith('"search_blob_') ? `(SELECT lower(string_agg(kv.value, ' ')) FROM jsonb_each_text(rr.deleted_record) kv WHERE kv.key NOT IN ('id', 'created_by_app_user_id', 'workspace_code', 'geom', 'Tstamp', 'workspace_assigned_at')) AS ${column}` : `v.${column}`
  ).join(",\n");
  return `
    SELECT
      ${archiveBrowseColumnSql("v")},
      v."Preferred Language" AS preferred_language,
      'workspace'::text AS source_scope,
      true AS is_editable,
      'workspace'::text AS source_scope_override,
      true AS is_editable_override,
      ${storageScope}::text AS storage_scope,
      false AS is_promoted
    FROM ${archiveView} v
    LEFT JOIN public.record_registry rr
      ON rr.source_schema = ${sourceSchema}
     AND rr.source_table = 'CAAL_Archive'
     AND rr.source_row_id = v.id
    WHERE v.created_by_app_user_id = ${userId}
      AND COALESCE(rr.status, '') <> 'deleted'
    UNION ALL
    SELECT ${deletedColumns},
      v."Preferred Language" AS preferred_language,
      'workspace'::text AS source_scope, false AS is_editable,
      'workspace'::text AS source_scope_override, false AS is_editable_override,
      ${storageScope}::text AS storage_scope, false AS is_promoted
    FROM public.record_registry rr
    CROSS JOIN LATERAL jsonb_populate_record(NULL::${archiveView},
      rr.deleted_record || jsonb_build_object('created_by_app_user_id',
        COALESCE(rr.created_by_app_user_id,
          NULLIF(rr.deleted_record->>'created_by_app_user_id', '')::bigint))
    ) v
    WHERE rr.source_schema = ${sourceSchema} AND rr.source_table = 'CAAL_Archive'
      AND rr.status = 'deleted' AND rr.deleted_record IS NOT NULL
      AND v.created_by_app_user_id = ${userId}
      AND rr.deleted_at > COALESCE(
        (SELECT refreshed_at FROM ui.app_cache_status
         WHERE cache_key = 'archive_caal_cache' LIMIT 1), now() - interval '2 hours')
  `;
}

function allWorkspaceArchivesSqlForCaalAdmin(currentSession) {
  if (!isCaalAdmin(currentSession)) return "";

  return enabledWorkspaceStorageConfigs()
    .filter((storage) => storage.archiveAppView || storage.archiveView)
    .map((storage) => {
      const archiveView = viewSql(
        storage.schema,
        storage.archiveAppView || storage.archiveView
      );

      const storageScope = sqlTextLiteral(storage.storageScope);
      const sourceSchema = sqlTextLiteral(storage.schema);

      return `
        SELECT
          ${archiveBrowseColumnSql("v")},
          'all_caal'::text AS source_scope,
          true AS is_editable,
          'all_caal'::text AS source_scope_override,
          true AS is_editable_override,
          ${storageScope}::text AS storage_scope,
          false AS is_promoted
        FROM ${archiveView} v
        LEFT JOIN public.record_registry rr
          ON rr.source_schema = ${sourceSchema}
         AND rr.source_table = 'CAAL_Archive'
         AND rr.source_row_id = v.id
        WHERE COALESCE(rr.status, '') <> 'deleted'
      `;
    })
    .join("\nUNION ALL\n");
}

const ARCHIVE_BROWSE_COLUMNS = [
  `"id"`,
  `"Level"`,
  `"Country"`,
  `"Original Reference"`,
  `"CAAL_ID"`,
  `"Associated CAAL_ID"`,
  `"Original Title"`,
  `"English Title"`,
  `"Description"`,
  `"Description - alternative language"`,
  `"Number and Type of Original Material"`,
  `"Content Type"`,
  `"Size and Dimensions of Original Material"`,
  `"Condition of Original Material"`,
  `"Related Countries"`,
  `"Related Towns and Cities"`,
  `"Related Religions"`,
  `"Related Subjects"`,
  `"Other Subjects"`,
  `"Dates of Original Material"`,
  `"Author of the Original Material"`,
  `"Publisher of the Original Material"`,
  `"Editor of the Original Material"`,
  `"Volume and Issue Number"`,
  `"Languages of Material"`,
  `"Script of Material"`,
  `"Writing System"`,
  `"still_under_copyright"`,
  `"Copyright Holder Name"`,
  `"Copyright Attribution"`,
  `"Digital Folder Name"`,
  `"Digital Files Name"`,
  `"Creation Date of Digital Files"`,
  `"Format of Digital Files"`,
  `"Number of Digital Files"`,
  `"Colour"`,
  `"Resolution"`,
  `"Archive Recorder"`,
  `"Date of Recording"`,
  `"Resource"`,
  `"created_by_app_user_id"`,
  `"workspace_code"`,

  `"level_en"`,
  `"level_ru"`,
  `"level_zh"`,
  `"level_kk"`,
  `"level_ky"`,
  `"level_tg"`,
  `"level_tk"`,
  `"level_uz"`,

  `"country_en"`,
  `"country_ru"`,
  `"country_zh"`,
  `"country_kk"`,
  `"country_ky"`,
  `"country_tg"`,
  `"country_tk"`,
  `"country_uz"`,

  `"content_type_en"`,
  `"content_type_ru"`,
  `"content_type_zh"`,
  `"content_type_kk"`,
  `"content_type_ky"`,
  `"content_type_tg"`,
  `"content_type_tk"`,
  `"content_type_uz"`,

  `"search_blob_en"`,
  `"search_blob_ru"`,
  `"search_blob_zh"`,
  `"search_blob_kk"`,
  `"search_blob_ky"`,
  `"search_blob_tg"`,
  `"search_blob_tk"`,
  `"search_blob_uz"`
];

function archiveBrowseColumnSql(alias) {
  return ARCHIVE_BROWSE_COLUMNS
    .map((column) => `${alias}.${column}`)
    .join(",\n      ");
}

function archiveCurrentPublicSourceSql() {
  const cachedColumns = ARCHIVE_BROWSE_COLUMNS.map((column) => {
    if (['"created_by_app_user_id"', '"workspace_code"'].includes(column)) {
      return `CASE WHEN a.id IS NOT NULL THEN a.${column} ELSE c.${column} END AS ${column}`;
    }
    return `c.${column}`;
  }).join(",\n      ");
  const deletedColumns = ARCHIVE_BROWSE_COLUMNS.map((column) =>
    column.startsWith('"search_blob_')
      ? `(SELECT lower(string_agg(kv.value, ' ')) FROM jsonb_each_text(rr.deleted_record) kv WHERE kv.key NOT IN ('id', 'created_by_app_user_id', 'workspace_code', 'geom', 'Tstamp', 'workspace_assigned_at')) AS ${column}`
      : `v.${column}`
  ).join(",\n      ");
  return `
    WITH threshold AS (
      SELECT COALESCE(
        (SELECT refreshed_at FROM ui.app_cache_status
         WHERE cache_key = 'archive_caal_cache' LIMIT 1),
        now() - interval '2 hours'
      ) AS refreshed_at
    ), changed AS MATERIALIZED (
      -- Identify the small delta using base tables before touching the live view.
      SELECT a.id
      FROM ${ARCHIVE_CAAL_TABLE} a
      CROSS JOIN threshold t
      WHERE a."Tstamp" > t.refreshed_at
         OR EXISTS (
           SELECT 1 FROM public."CAAL_Archive_web_edit_log" log
           WHERE log.caal_id = a."CAAL_ID" AND log.edited_at > t.refreshed_at
         )
         OR NOT EXISTS (
           SELECT 1 FROM ${ARCHIVE_CAAL_MV} c
           WHERE c.id = a.id AND c."CAAL_ID" = a."CAAL_ID"
         )
    )
    SELECT ${cachedColumns}
    FROM ${ARCHIVE_CAAL_MV} c
    LEFT JOIN ${ARCHIVE_CAAL_TABLE} a ON a.id = c.id AND a."CAAL_ID" = c."CAAL_ID"
    WHERE NOT EXISTS (SELECT 1 FROM changed x WHERE x.id = c.id)
      AND (a.id IS NOT NULL OR EXISTS (
        SELECT 1 FROM public.record_registry rr CROSS JOIN threshold t
        WHERE rr.caal_id = c."CAAL_ID" AND ${archiveRegistryMatchSql("rr")}
          AND rr.source_schema = 'public' AND rr.status = 'deleted'
          AND rr.deleted_record IS NOT NULL AND rr.deleted_at > t.refreshed_at
      ))
    UNION ALL
    SELECT ${archiveBrowseColumnSql("v")}
    FROM changed x
    CROSS JOIN LATERAL (
      SELECT v.* FROM ui.v_archive_grid_base_caal_app v
      WHERE v.id = x.id
      OFFSET 0
    ) v
    UNION ALL
    -- A record created and deleted between refreshes has no cached row.
    SELECT ${deletedColumns}
    FROM public.record_registry rr CROSS JOIN threshold t
    CROSS JOIN LATERAL jsonb_populate_record(
      NULL::ui.mv_archive_caal_app, rr.deleted_record || jsonb_build_object(
        'created_by_app_user_id', COALESCE(rr.created_by_app_user_id,
          NULLIF(rr.deleted_record->>'created_by_app_user_id', '')::bigint)
      )
    ) v
    WHERE ${archiveRegistryMatchSql("rr")}
      AND rr.source_schema = 'public' AND rr.status = 'deleted'
      AND rr.deleted_record IS NOT NULL AND rr.deleted_at > t.refreshed_at
      AND NOT EXISTS (SELECT 1 FROM ${ARCHIVE_CAAL_MV} c WHERE c."CAAL_ID" = rr.caal_id)
      AND NOT EXISTS (SELECT 1 FROM ${ARCHIVE_CAAL_TABLE} a WHERE a."CAAL_ID" = rr.caal_id)
  `;
}

function makeArchiveBrowseScopeConfig(currentSession) {
  const currentAppUserId = currentAppUserIdFromSession(currentSession);
  const userId = currentAppUserId ?? -1;
  const workspaceCode = getSessionWorkspaceCode(currentSession);

  const canEditCaal = canEditCaalArchive(currentSession);
  const canEditNationalCaal = isNationalAdmin(currentSession);

  const publicEditableSql = canEditCaal
    ? "true"
    : canEditNationalCaal
      ? `m.workspace_code = '${workspaceCode.replace(/'/g, "''")}'`
      : "false";

  const allCaalEditableSql = canEditCaal ? "true" : "false";

  const nationalWhere =
    workspaceCode && workspaceCode !== "caal"
      ? `m.workspace_code = '${workspaceCode.replace(/'/g, "''")}'`
      : "false";

  const ownPromotedExclusion = `
    NOT EXISTS (
      SELECT 1
      FROM public.record_registry rr
      WHERE rr.caal_id = m."CAAL_ID"
        AND rr.created_by_app_user_id = ${userId}
        AND ${archiveRegistryMatchSql("rr")}
    )
  `;

  const workspaceSchemaSql = archiveOwnedWorkspaceStorageConfigs(currentSession)
    .map((storage) => ownedWorkspaceArchiveSql(storage, userId))
    .join("\nUNION ALL\n");

  const workspacePublicOwnedSql = `
    SELECT
      ${archiveBrowseColumnSql("m")},
      a."Preferred Language" AS preferred_language,
      'workspace'::text AS source_scope,
      true AS is_editable,
      'workspace'::text AS source_scope_override,
      true AS is_editable_override,
      'public_caal'::text AS storage_scope,
      true AS is_promoted
    FROM current_public_archive m
    LEFT JOIN ${ARCHIVE_CAAL_TABLE} a
      ON a.id = m.id
    LEFT JOIN public.record_registry rr
      ON rr.caal_id = m."CAAL_ID"
     AND ${archiveRegistryMatchSql("rr")}
    WHERE (
        rr.created_by_app_user_id = ${userId}
        OR m.created_by_app_user_id = ${userId}
      )
  `;

  const allWorkspaceArchivesSql = "";

  return {
    workspace: {
      sql: [workspaceSchemaSql, workspacePublicOwnedSql]
        .filter(Boolean)
        .join("\nUNION ALL\n")
    },

    national_ref: {
      sql: `
        SELECT
          ${archiveBrowseColumnSql("m")},
          a."Preferred Language" AS preferred_language,
          'national_ref'::text AS source_scope,
          ${publicEditableSql} AS is_editable,
          'national_ref'::text AS source_scope_override,
          ${publicEditableSql} AS is_editable_override,
          'public_caal'::text AS storage_scope,
          true AS is_promoted
        FROM current_public_archive m
        LEFT JOIN ${ARCHIVE_CAAL_TABLE} a
          ON a.id = m.id
        WHERE ${nationalWhere}
          AND COALESCE(m.created_by_app_user_id, -1) <> ${userId}
          AND ${ownPromotedExclusion}
      `
    },


    all_caal: {
      sql: [
        `
          SELECT
            ${archiveBrowseColumnSql("m")},
            a."Preferred Language" AS preferred_language,
            'all_caal'::text AS source_scope,
            ${allCaalEditableSql} AS is_editable,
            'all_caal'::text AS source_scope_override,
            ${allCaalEditableSql} AS is_editable_override,
            'public_caal'::text AS storage_scope,
            true AS is_promoted
          FROM current_public_archive m
          LEFT JOIN ${ARCHIVE_CAAL_TABLE} a
            ON a.id = m.id
          WHERE (
              ${
                workspaceCode && workspaceCode !== "caal"
                  ? `m.workspace_code IS DISTINCT FROM '${workspaceCode.replace(/'/g, "''")}'`
                  : "true"
              }
            )
            AND COALESCE(m.created_by_app_user_id, -1) <> ${userId}
            AND ${ownPromotedExclusion}
        `,
        allWorkspaceArchivesSql
      ]
        .filter(Boolean)
        .join("\nUNION ALL\n")
    }
  };
}

function parseScopes(scopesParam) {
  if (!scopesParam) {
    return ["workspace", "national_ref"];
  }

  return String(scopesParam)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCsvParam(value) {
  if (!value) return [];

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .replace(/[-‐-‒–—]+/g, " ");
}

function archiveMultiValueAnySql(columnName, paramIndex) {
  return `
    EXISTS (
      SELECT 1
      FROM unnest(string_to_array(coalesce("${columnName}", ''), ',')) AS part(value)
      WHERE btrim(part.value) = ANY($${paramIndex}::text[])
    )
  `;
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

function buildBrowseUnionSql(scopes, currentSession) {
  const config = makeArchiveBrowseScopeConfig(currentSession);

  const unionSql = scopes
    .filter((scope) => config[scope])
    .map((scope) => config[scope].sql)
    .join("\nUNION ALL\n");
  return `WITH current_public_archive AS (${archiveCurrentPublicSourceSql()}) ${unionSql}`;
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

function fallbackLangForDisplay(lang) {
  return ["kk", "ky", "tg", "tk", "uz"].includes(String(lang || "").toLowerCase())
    ? "ru"
    : "en";
}

function safeArchiveLang(lang) {
  const value = String(lang || "en").toLowerCase();

  return ["en", "ru", "zh", "kk", "ky", "tg", "tk", "uz"].includes(value)
    ? value
    : "en";
}

function pickLangValueWithFallback(row, baseName, lang, fallbackOrder = []) {
  const safeLang = String(lang || "en").toLowerCase();
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

function splitCanonicalList(value) {
  if (value == null || value === "") return [];
  return String(value)
    .split(", ")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildArchiveRecord(row, lang) {
  const effectiveScope = row.source_scope_override || row.source_scope;
  const effectiveEditable =
    row.is_editable_override !== null &&
    row.is_editable_override !== undefined
      ? row.is_editable_override
      : row.is_editable;

  const caalId = firstDefined(
    row.caal_id_normalized,
    row["CAAL_ID"],
    row.caal_id
  );

  return {
    identity: {
      id: row.id,
      caal_id: caalId,
      associated_caal_id: firstDefined(row["Associated CAAL_ID"], row.associated_caal_id)
    },
    summary: {
      original_title: firstDefined(row["Original Title"], row.original_title),
      english_title: firstDefined(row["English Title"], row.english_title),
      original_reference: firstDefined(row["Original Reference"], row.original_reference),
      content_type: pickLangValueWithFallback(row, "content_type", lang, ["Content Type", "content_type_en", "content_type"]),
      country: pickLangValueWithFallback(row, "country", lang, ["Country", "country_en", "country"]),
      level: pickLangValueWithFallback(row, "level", lang, ["Level", "level_en", "level"]),
      preferred_language: firstDefined(
        row.preferred_language,
        row["Preferred Language"]
      ),
      archive_recorder: firstDefined(
        row["Archive Recorder"],
        row.archive_recorder
      ),
      date_of_recording: firstDefined(
        row["Date of Recording"],
        row.date_of_recording
      )
    },
    raw: {
      ...row,
      "Preferred Language": firstDefined(
        row["Preferred Language"],
        row.preferred_language
      )
    },
    source: {
      scope: effectiveScope,
      storage: row.storage_scope || null,
      is_promoted:
        row.is_promoted === true ||
        row.is_promoted === "true",
      is_editable:
        effectiveEditable === true ||
        effectiveEditable === "true"
    },
    filter_values: {
      related_countries: splitCanonicalList(firstDefined(row["Related Countries"], row.related_countries)),
      related_religions: splitCanonicalList(firstDefined(row["Related Religions"], row.related_religions)),
      related_subjects: splitCanonicalList(firstDefined(row["Related Subjects"], row.related_subjects)),
      languages: splitCanonicalList(firstDefined(row["Languages of Material"], row.languages_of_material)),
      content_type: firstDefined(row["Content Type"], row.content_type),
      country: firstDefined(row["Country"], row.country),
      level: firstDefined(row["Level"], row.level)
    }
  };
}

router.get("/institutions", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  const q = normaliseInstitutionSearchText(req.query.q);
  const country = normaliseInstitutionSearchText(req.query.country);
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const values = [];
  const clauses = [];

  if (q) {
    values.push(`%${q}%`);
    clauses.push(`
      (
        "CAAL_ID" ILIKE $${values.length}
        OR "Primary Name" ILIKE $${values.length}
        OR name_ru ILIKE $${values.length}
        OR "Other Names" ILIKE $${values.length}
        OR "Actor Type" ILIKE $${values.length}
      )
    `);
  }

  if (country) {
    values.push(country);
    clauses.push(`"Country" = $${values.length}`);
  }

  values.push(limit);

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        "CAAL_ID",
        "Primary Name",
        "Other Names",
        name_ru,
        "Country",
        "Actor Type",
        "Description",
        "Address",
        "External Reference",
        "Longitude",
        "Latitude"
      FROM public."CAAL_Institution"
      ${whereSql}
      ORDER BY
        "Primary Name" NULLS LAST,
        name_ru NULLS LAST,
        "CAAL_ID"
      LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      ok: true,
      institutions: result.rows.map(buildInstitutionRecord)
    });
  } catch (error) {
    console.error("Institution lookup failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Institution lookup failed",
      detail: error.message
    });
  }
});

router.get("/institutions/:caalId", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        "CAAL_ID",
        "Primary Name",
        "Other Names",
        name_ru,
        "Country",
        "Actor Type",
        "Description",
        "Address",
        "External Reference",
        "Longitude",
        "Latitude"
      FROM public."CAAL_Institution"
      WHERE "CAAL_ID" = $1
      LIMIT 1
      `,
      [req.params.caalId]
    );

    const institution = buildInstitutionRecord(result.rows[0]);

    if (!institution) {
      return res.status(404).json({
        ok: false,
        error: "Institution not found"
      });
    }

    return res.json({
      ok: true,
      institution
    });
  } catch (error) {
    console.error("Institution fetch failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Institution fetch failed",
      detail: error.message
    });
  }
});

router.get("/", async (req, res) => {
  //console.log("ARCHIVE route session:", JSON.stringify(req.session, null, 2));
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  function normalizeRequestedScopes(scopes) {
    return Array.from(new Set(scopes));
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

  const limit = Number(req.query.limit) || 10;
  const offset = Number(req.query.offset) || 0;
  const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

  const caalId = String(req.query.caalId || "").trim();

  const text = normalizeSearchText(req.query.text);

  const relatedCountries = parseCsvParam(req.query.relatedCountries);
  const relatedReligions = parseCsvParam(req.query.relatedReligions);
  const relatedSubjects = parseCsvParam(req.query.relatedSubjects);
  const contentTypes = parseCsvParam(req.query.contentTypes);
  const languages = parseCsvParam(req.query.languages);

  const unionSql = buildBrowseUnionSql(scopes, currentSession);

  const whereClauses = [];
  const values = [];

  if (caalId) {
    values.push(`%${caalId}%`);
    whereClauses.push(`coalesce("CAAL_ID", '') ILIKE $${values.length}`);
  }

  if (text) {
    values.push(`%${text}%`);
    const idx = values.length;

    const safeLang = safeArchiveLang(lang);
    const fallbackLang = fallbackLangForDisplay(safeLang);

    whereClauses.push(`
      (
        regexp_replace(coalesce(search_blob_${safeLang}, ''), '[-‐-‒–—]+', ' ', 'g') ILIKE $${idx}
        OR regexp_replace(coalesce(search_blob_${fallbackLang}, ''), '[-‐-‒–—]+', ' ', 'g') ILIKE $${idx}
        OR regexp_replace(coalesce(search_blob_en, ''), '[-‐-‒–—]+', ' ', 'g') ILIKE $${idx}
      )
    `);
  }

  if (relatedCountries.length) {
    values.push(relatedCountries);
    whereClauses.push(archiveMultiValueAnySql("Related Countries", values.length));
  }

  if (relatedReligions.length) {
    values.push(relatedReligions);
    whereClauses.push(archiveMultiValueAnySql("Related Religions", values.length));
  }

  if (relatedSubjects.length) {
    values.push(relatedSubjects);
    whereClauses.push(archiveMultiValueAnySql("Related Subjects", values.length));
  }

  if (contentTypes.length) {
    values.push(contentTypes);
    whereClauses.push(`"Content Type" = ANY($${values.length}::text[])`);
  }

  if (languages.length) {
    values.push(languages);
    whereClauses.push(archiveMultiValueAnySql("Languages of Material", values.length));
  }

  const whereSql = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";

  values.push(limit);
  const limitParam = values.length;

  values.push(offset);
  const offsetParam = values.length;

  const dataSql = `
    WITH filtered AS MATERIALIZED (
      SELECT combined.*, combined."CAAL_ID" AS caal_id_normalized
      FROM (${unionSql}) combined
      ${whereSql}
    ), page AS (
      SELECT * FROM filtered
      ORDER BY
        CASE COALESCE(source_scope_override, source_scope)
          WHEN 'workspace' THEN 0 WHEN 'national_ref' THEN 1
          WHEN 'all_caal' THEN 2 ELSE 3 END,
        "Date of Recording" DESC NULLS LAST, id DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    )
    SELECT (SELECT COUNT(*) FROM filtered) AS total,
           COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY
             CASE COALESCE(source_scope_override, source_scope)
               WHEN 'workspace' THEN 0 WHEN 'national_ref' THEN 1
               WHEN 'all_caal' THEN 2 ELSE 3 END,
             "Date of Recording" DESC NULLS LAST, id DESC
           ) FROM page), '[]'::jsonb) AS records
  `;

  try {
    const startedAt = Date.now();
    const client = await pool.connect();
    let result;

    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL jit = off");

      result = await client.query(dataSql, values);

      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Archive read rollback failed:", rollbackError);
      }

      throw error;
    } finally {
      client.release();
    }

    res.setHeader?.(
      "Server-Timing",
      `archive_db;dur=${Date.now() - startedAt}`
    );
    const page = result.rows[0] || { records: [], total: 0 };
    const records = (page.records || []).map((row) => buildArchiveRecord(row, lang));

    return res.json({
      ok: true,
      records,
      total: Number(page.total),
      limit,
      offset,
      scopes
    });
  } catch (error) {
    console.error("Archive fetch failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Archive fetch failed",
      detail: error.message
    });
  }
});

//const ARCHIVE_WORKSPACE_TABLE = 'kz."CAAL_Archive"';
const ARCHIVE_CAAL_TABLE = 'public."CAAL_Archive"';
//const ARCHIVE_WORKSPACE_VIEW = "kz.v_archive_grid_base_app";
const ARCHIVE_CAAL_MV = "ui.mv_archive_caal_app";

const ARCHIVE_EDITABLE_FIELDS = [
  "Level",
  "Original Reference",
  "Associated CAAL_ID",
  "Original Title",
  "English Title",
  "Content Type",
  "Description",
  "Description - alternative language",
  "Number and Type of Original Material",
  "Size and Dimensions of Original Material",
  "Condition of Original Material",
  "Related Countries",
  "Related Towns and Cities",
  "Related Religions",
  "Related Subjects",
  "Other Subjects",
  "Dates of Original Material",
  "Author of the Original Material",
  "Publisher of the Original Material",
  "Editor of the Original Material",
  "Volume and Issue Number",
  "Languages of Material",
  "Script of Material",
  "Writing System",
  "Still under CopyrightYN",
  "Copyright Holder Name",
  "Copyright Attribution",
  "Digital Folder Name",
  "Digital Files Name",
  "Creation Date of Digital Files",
  "Format of Digital Files",
  "Number of Digital Files",
  "Colour",
  "Resolution",
  "Resource",
  "still_under_copyright",
  "Country"
];

function getSubmittedHoldingInstitutionCaalId(body = {}) {
  return String(
    body?._holding_institution_caal_id ||
    body?.holding_institution_caal_id ||
    ""
  ).trim();
}

async function validateHoldingInstitution(pool, caalId) {
  if (!caalId) return null;

  const result = await pool.query(
    `
    SELECT
      id,
      "CAAL_ID",
      "Primary Name",
      "Other Names",
      name_ru,
      "Country",
      "Actor Type",
      "Description",
      "Address",
      "External Reference",
      "Longitude",
      "Latitude"
    FROM public."CAAL_Institution"
    WHERE "CAAL_ID" = $1
    LIMIT 1
    `,
    [caalId]
  );

  return buildInstitutionRecord(result.rows[0]);
}

async function getArchiveHoldingInstitution(pool, archiveCaalId) {
  if (!archiveCaalId) return null;

  const result = await pool.query(
    `
    SELECT
      i.id,
      i."CAAL_ID",
      i."Primary Name",
      i."Other Names",
      i.name_ru,
      i."Country",
      i."Actor Type",
      i."Description",
      i."Address",
      i."External Reference",
      i."Longitude",
      i."Latitude"
    FROM public."CAAL_Resource_Relations_edges" e
    JOIN public."CAAL_Institution" i
      ON i."CAAL_ID" = e.child_id
    WHERE e.parent_id = $1
      AND e.child_id_found_in = 'CAAL_Institution'
      AND COALESCE(e.edge_status, 'active') = 'active'
      AND e.relation_type_norm IN (
        'is created by / created',
        'holding_institution'
      )
    ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC NULLS LAST
    LIMIT 1
    `,
    [archiveCaalId]
  );

  return buildInstitutionRecord(result.rows[0]);
}

function institutionSummaryLabel(instOrId) {
  if (!instOrId) return null;

  if (typeof instOrId === "string") {
    return instOrId.trim() || null;
  }

  return (
    instOrId.primary_name ||
    instOrId.other_names ||
    instOrId.caal_id ||
    null
  );
}

function appendSaveSummaryField(saveSummary, item) {
  if (!saveSummary || !item) return saveSummary;

  const fields = Array.isArray(saveSummary.fields_saved)
    ? saveSummary.fields_saved
    : [];

  saveSummary.fields_saved = [item, ...fields];
  saveSummary.saved_field_count = Number(saveSummary.saved_field_count || fields.length) + 1;
  saveSummary.shown_field_count = saveSummary.fields_saved.length;

  return saveSummary;
}

async function replaceArchiveHoldingInstitutionRelation(pool, {
  archiveCaalId,
  archiveRowId,
  institutionCaalId,
  currentSession,
  storageScope
}) {
  if (!archiveCaalId) return;

  /*
    Replace only the archive-to-institution provenance relation.
    This treats the existing imported relation type and any earlier web-test
    holding_institution rows as the same UI concept.
  */
  await pool.query(
    `
    DELETE FROM public."CAAL_Resource_Relations_edges"
    WHERE parent_id = $1
      AND child_id_found_in = 'CAAL_Institution'
      AND relation_type_norm IN (
        'is created by / created',
        'holding_institution'
      )
    `,
    [archiveCaalId]
  );

  if (!institutionCaalId) return;

  await pool.query(
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
      created_by,
      updated_by,
      notes
    )
    VALUES (
      $1,
      $2,
      'is created by / created',
      ARRAY['web_app'],
      ARRAY['CAAL_Archive'],
      ARRAY['Holding Institution'],
      ARRAY[$3::text],
      ARRAY[$1],
      ARRAY[$2],
      ARRAY['is created by / created'],
      ARRAY[$4::text],
      ARRAY[now()],
      true,
      true,
      'CAAL_Archive',
      'CAAL_Institution',
      'both_ids_found',
      'active',
      $4,
      $4,
      $5
    )
    ON CONFLICT (edge_key_a, edge_key_b, relation_type_norm)
    DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      child_id = EXCLUDED.child_id,
      relation_type = EXCLUDED.relation_type,
      source_kinds = EXCLUDED.source_kinds,
      source_tables = EXCLUDED.source_tables,
      source_fields = EXCLUDED.source_fields,
      source_row_ids = EXCLUDED.source_row_ids,
      source_parent_ids = EXCLUDED.source_parent_ids,
      source_child_ids = EXCLUDED.source_child_ids,
      source_relation_types = EXCLUDED.source_relation_types,
      source_recorders = EXCLUDED.source_recorders,
      source_timestamps = EXCLUDED.source_timestamps,
      parent_id_exists = EXCLUDED.parent_id_exists,
      child_id_exists = EXCLUDED.child_id_exists,
      parent_id_found_in = EXCLUDED.parent_id_found_in,
      child_id_found_in = EXCLUDED.child_id_found_in,
      validation_status = EXCLUDED.validation_status,
      edge_status = 'active',
      updated_at = now(),
      updated_by = EXCLUDED.updated_by,
      notes = EXCLUDED.notes
    `,
    [
      archiveCaalId,
      institutionCaalId,
      String(archiveRowId || ""),
      currentSession?.user?.username || currentSession?.user?.email || "web_app",
      `Archive holding/source institution relation saved through CAAL web app; storage_scope=${storageScope || ""}`
    ]
  );
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

function isCaalAdmin(session) {
  return getAccessLevel(session) === 9 && getSessionWorkspaceCode(session) === "caal";
}

function isNationalAdmin(session) {
  const workspaceCode = getSessionWorkspaceCode(session);
  return getAccessLevel(session) === 9 && workspaceCode && workspaceCode !== "caal";
}

function canEditArchive(session) {
  return !!session?.permissions?.can_edit_workspace;
}

// Global CAAL admin only.
function canEditCaalArchive(session) {
  return isCaalAdmin(session);
}

function canEditPublicCaalArchive(session) {
  return (
    isCaalAdmin(session) ||
    isNationalAdmin(session) ||
    canEditArchive(session)
  );
}

function normaliseArchiveLogValue(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value === null) return null;
  return value;
}

function archiveValuesDifferForLog(oldValue, newValue) {
  return JSON.stringify(normaliseArchiveLogValue(oldValue)) !==
    JSON.stringify(normaliseArchiveLogValue(newValue));
}

function buildArchiveChangedValueSnapshots(oldRow, newRow, submittedFields) {
  const changedFields = [];
  const oldValues = {};
  const newValues = {};

  submittedFields.forEach((field) => {
    const oldValue = oldRow?.[field] ?? null;
    const newValue = newRow?.[field] ?? null;

    if (archiveValuesDifferForLog(oldValue, newValue)) {
      changedFields.push(field);
      oldValues[field] = normaliseArchiveLogValue(oldValue);
      newValues[field] = normaliseArchiveLogValue(newValue);
    }
  });

  return { changedFields, oldValues, newValues };
}

function classifyArchiveEdit(changedFields = []) {
  const set = new Set(changedFields);

  if (
    set.has("Associated CAAL_ID") ||
    set.has("Related Countries") ||
    set.has("Related Towns and Cities") ||
    set.has("Related Religions") ||
    set.has("Related Subjects") ||
    set.has("Other Subjects")
  ) {
    return "relations_or_subjects";
  }

  if (
    set.has("Content Type") ||
    set.has("Level") ||
    set.has("Languages of Material") ||
    set.has("Script of Material") ||
    set.has("Writing System")
  ) {
    return "classification";
  }

  if (
    set.has("Digital Folder Name") ||
    set.has("Digital Files Name") ||
    set.has("Format of Digital Files") ||
    set.has("Number of Digital Files") ||
    set.has("Colour") ||
    set.has("Resolution")
  ) {
    return "digital_files";
  }

  if (
    set.has("Copyright Holder Name") ||
    set.has("Copyright Attribution") ||
    set.has("still_under_copyright")
  ) {
    return "copyright";
  }

  return "metadata";
}

// Public CAAL_Archive row changes are audited by trg_log_caal_archive_edit.
// Do not add an application INSERT for the same row event.

async function logWorkspaceArchiveEdit({
  oldRow,
  newRow,
  submittedFields,
  currentSession,
  sourceSchema,
  storageScope,
  note = null
}) {
  if (!oldRow || !newRow) return;

  const { changedFields, oldValues, newValues } =
    buildArchiveChangedValueSnapshots(oldRow, newRow, submittedFields);

  if (changedFields.length === 0) return;

  await pool.query(
    `
    INSERT INTO public."CAAL_Archive_workspace_web_edit_log" (
      source_schema,
      source_table,
      source_row_id,
      caal_id,
      edited_by_app_user_id,
      edited_by_username,
      workspace_code,
      storage_scope,
      edit_type,
      changed_fields,
      old_values,
      new_values,
      note
    )
    VALUES (
      $1, 'CAAL_Archive', $2, $3,
      $4, $5, $6, $7,
      $8, $9, $10::jsonb, $11::jsonb, $12
    )
    `,
    [
      sourceSchema,
      newRow.id,
      newRow["CAAL_ID"],
      currentSession?.user?.user_id ?? null,
      currentSession?.user?.username ?? null,
      newRow.workspace_code || null,
      storageScope || null,
      classifyArchiveEdit(changedFields),
      changedFields,
      JSON.stringify(oldValues),
      JSON.stringify(newValues),
      note
    ]
  );
}

function publicCaalArchiveEditWhereSql(session, tableAlias = "a", paramIndex) {
  const workspaceCode = getSessionWorkspaceCode(session);

  if (isCaalAdmin(session)) {
    return {
      sql: "",
      values: []
    };
  }

  if (isNationalAdmin(session)) {
    return {
      sql: `AND ${tableAlias}.workspace_code = $${paramIndex}`,
      values: [workspaceCode]
    };
  }

  return {
    sql: `
      AND EXISTS (
        SELECT 1
        FROM public.record_registry rr
        WHERE rr.caal_id = ${tableAlias}."CAAL_ID"
          AND rr.created_by_app_user_id = $${paramIndex}
          AND ${archiveRegistryMatchSql("rr")}
          AND COALESCE(rr.status, '') <> 'deleted'
      )
    `,
    values: [currentAppUserIdFromSession(session) ?? -1]
  };
}

// Non-admin scope: rows the current user created (registry creator or the row's own creator column).
function archiveOwnRecordWhereSql(tableAlias, paramIndex) {
  return `
    AND (
      ${tableAlias}.created_by_app_user_id = $${paramIndex}
      OR EXISTS (
        SELECT 1
        FROM public.record_registry rr
        WHERE rr.caal_id = ${tableAlias}."CAAL_ID"
          AND rr.created_by_app_user_id = $${paramIndex}
          AND ${archiveRegistryMatchSql("rr")}
          AND COALESCE(rr.status, '') <> 'deleted'
      )
    )
  `;
}

function deletedArchiveWorkspaceCode(registryRow) {
  return String(
    registryRow?.workspace_code ||
    registryRow?.deleted_record?.workspace_code ||
    (
      registryRow?.source_schema &&
      registryRow.source_schema !== "public"
        ? registryRow.source_schema
        : ""
    )
  )
    .trim()
    .toLowerCase();
}

// Same as delete: CAAL admin, national admin in their own workspace, or the creator.
function canReinstateDeletedArchive(currentSession, registryRow) {
  if (isCaalAdmin(currentSession)) {
    return true;
  }

  if (!canEditArchive(currentSession) && !isNationalAdmin(currentSession)) {
    return false;
  }

  const sessionWorkspace = getSessionWorkspaceCode(currentSession);
  const recordWorkspace = deletedArchiveWorkspaceCode(registryRow);

  if (
    isNationalAdmin(currentSession) &&
    sessionWorkspace &&
    recordWorkspace &&
    sessionWorkspace === recordWorkspace
  ) {
    return true;
  }

  const userId = currentAppUserIdFromSession(currentSession);

  const creatorId =
    registryRow?.created_by_app_user_id ??
    registryRow?.deleted_record?.created_by_app_user_id ??
    null;

  return (
    userId !== null &&
    userId !== undefined &&
    creatorId !== null &&
    creatorId !== undefined &&
    Number(userId) === parseArchiveAppUserId(creatorId)
  );
}

function deletedArchiveSourceScope(registryRow, currentSession) {
  const userId = currentAppUserIdFromSession(currentSession);

  const creatorId =
    registryRow?.created_by_app_user_id ??
    registryRow?.deleted_record?.created_by_app_user_id ??
    null;

  if (
    userId !== null &&
    creatorId !== null &&
    Number(userId) === parseArchiveAppUserId(creatorId)
  ) {
    return "workspace";
  }

  const sessionWorkspace = getSessionWorkspaceCode(currentSession);
  const recordWorkspace = deletedArchiveWorkspaceCode(registryRow);

  if (
    sessionWorkspace &&
    sessionWorkspace !== "caal" &&
    recordWorkspace === sessionWorkspace
  ) {
    return "national_ref";
  }

  return "all_caal";
}

function deletedArchiveStorageScope(registryRow) {
  const stored = String(registryRow?.storage_scope || "").trim();

  if (stored) return stored;

  const schema = String(registryRow?.source_schema || "").trim();

  if (schema === "public") return "public_caal";

  return schema ? `${schema}_workspace` : null;
}

function buildDeletedArchiveRecord(registryRow, lang, currentSession) {
  const raw = { ...(registryRow?.deleted_record || {}) };

  const sourceScope = deletedArchiveSourceScope(registryRow, currentSession);
  const storageScope = deletedArchiveStorageScope(registryRow);
  const canReinstate = canReinstateDeletedArchive(currentSession, registryRow);

  const record = buildArchiveRecord(
    {
      ...raw,
      source_scope: sourceScope,
      storage_scope: storageScope,
      is_promoted: storageScope === "public_caal",
      is_editable: false
    },
    lang
  );

  record.source = {
    ...(record.source || {}),
    scope: sourceScope,
    storage: storageScope,
    is_deleted: true,
    is_editable: false
  };

  record.deletion = {
    deleted_since_cache: true,
    can_reinstate: canReinstate
  };

  // Audit details only for people allowed to restore this record.
  if (canReinstate) {
    record.deletion.deleted_at = registryRow.deleted_at || null;
    record.deletion.deleted_by = registryRow.deleted_by || null;
    record.deletion.delete_reason = registryRow.delete_reason || null;
  }

  return record;
}

function normaliseArchivePayload(input = {}) {
  const payload = {};

  for (const field of ARCHIVE_EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      continue;
    }

    let value = input[field];

    // convert empty strings to null for all fields first
    value = blankToNull(value);

    // integer fields
    if (field === "Number of Digital Files") {
      if (value === null) {
        payload[field] = null;
      } else {
        const parsed = Number(value);
        payload[field] = Number.isInteger(parsed) ? parsed : value;
      }
      continue;
    }

    // boolean field
    if (field === "still_under_copyright") {
      if (value === null) {
        payload[field] = null;
        continue;
      }

      if (value === true || value === false) {
        payload[field] = value;
        continue;
      }

      const text = String(value).trim().toLowerCase();

      if (["true", "yes", "y", "1"].includes(text)) {
        payload[field] = true;
      } else if (["false", "no", "n", "0"].includes(text)) {
        payload[field] = false;
      } else {
        // Unknown, blank, unrecognised, legacy null-equivalent
        payload[field] = null;
      }

      continue;
    }

    payload[field] = value;
  }

  return payload;
}

async function getCurrentUserArchivePrefix(userId) {
  userId = parseArchiveAppUserId(userId);
  if (userId === null) return null;

  const result = await pool.query(
    `
    SELECT archive_id_prefix
    FROM public.app_users
    WHERE user_id = $1
      AND is_enabled = true
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0]?.archive_id_prefix || null;
}

// Institution relations
function normaliseInstitutionSearchText(value) {
  return String(value || "").trim();
}

function buildInstitutionRecord(row) {
  if (!row) return null;

  return {
    id: row.id,
    caal_id: row["CAAL_ID"],
    primary_name: row["Primary Name"],
    name_ru: row.name_ru,
    other_names: row["Other Names"],
    country: row["Country"],
    actor_type: row["Actor Type"],
    description: row["Description"],
    address: row["Address"],
    external_reference: row["External Reference"],
    longitude: row["Longitude"],
    latitude: row["Latitude"]
  };
}

// to move to shared
function canCreateArchiveInWorkspaceCode(workspaceCode) {
  const code = String(workspaceCode || "").trim().toLowerCase();

  if (code === "caal") return true;

  const storage = WORKSPACE_STORAGE?.[code];

  return Boolean(
    storage?.enabled === true &&
    storage?.schema &&
    storage?.archiveTable
  );
}

async function registerCreatedRecord({
  db = pool,
  sourceSchema,
  sourceTable,
  sourceRowId,
  caalId,
  recordType,
  createdBy,
  createdByAppUserId,
  workspaceCode = null,
  storageScope = null,
  createdByWorkspaceCode = null,
  notes = null
}) {
  await db.query(
    `
    INSERT INTO public.record_registry (
      source_schema,
      source_table,
      source_row_id,
      caal_id,
      created_at,
      created_by,
      status,
      notes,
      record_type,
      created_by_app_user_id,
      workspace_code,
      storage_scope,
      created_by_workspace_code
    )
    VALUES (
      $1, $2, $3, $4,
      now(), $5, 'new', $6,
      $7, $8,
      $9, $10, $11
    )
    ON CONFLICT DO NOTHING
    `,
    [
      sourceSchema,
      sourceTable,
      sourceRowId,
      caalId,
      createdBy,
      notes,
      recordType,
      createdByAppUserId,
      workspaceCode,
      storageScope,
      createdByWorkspaceCode
    ]
  );
}

const SAVE_SUMMARY_EXCLUDED_FIELDS = new Set([
  "_storage_scope",
  "_source_scope",
  "Tstamp",
  "created_by_app_user_id",
  "workspace_code",
  "Preferred Language"
]);

function normaliseSaveSummaryValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function buildSavedFieldsFromPayload(payload = {}, options = {}) {
  const {
    exclude = SAVE_SUMMARY_EXCLUDED_FIELDS,
    maxFields = 18
  } = options;

  const fields = Object.entries(payload)
    .filter(([field]) => !exclude.has(field))
    .map(([field, value]) => ({
      field,
      label: field,
      value: normaliseSaveSummaryValue(value)
    }))
    .filter((item) => item.value !== null);

  return {
    fields_saved: fields.slice(0, maxFields),
    saved_field_count: fields.length,
    shown_field_count: Math.min(fields.length, maxFields)
  };
}

function buildSavedFieldsFromChangedValues({
  oldRow,
  newRow,
  submittedFields = [],
  maxFields = 18
}) {
  const fields = [];

  for (const field of submittedFields) {
    const oldValue = oldRow?.[field] ?? null;
    const newValue = newRow?.[field] ?? null;

    if (!archiveValuesDifferForLog(oldValue, newValue)) {
      continue;
    }

    const normalisedNewValue = normaliseSaveSummaryValue(newValue);

    fields.push({
      field,
      label: field,
      old_value: normaliseSaveSummaryValue(oldValue),
      new_value: normalisedNewValue,
      value: normalisedNewValue
    });
  }

  return {
    fields_saved: fields.slice(0, maxFields),
    saved_field_count: fields.length,
    shown_field_count: Math.min(fields.length, maxFields),
    summary_mode: "changed_fields"
  };
}

function storageLabelForSaveSummary(storageScope, recordWorkspaceCode = null) {
  const storage = String(storageScope || "").trim();

  if (storage === "public_caal") {
    return "Public CAAL table";
  }

  if (storage.endsWith("_workspace")) {
    const code = storage.replace(/_workspace$/, "").toUpperCase();
    return `${code} workspace`;
  }

  if (recordWorkspaceCode) {
    return `${String(recordWorkspaceCode).toUpperCase()} workspace`;
  }

  return storage || "Database";
}

function buildSaveSummary({
  action,
  recordType,
  caalId,
  payload,
  currentSession,
  storageScope,
  sourceScope = "workspace",
  recordWorkspaceCode = null,
  cacheRefreshRequired = false,
  savedFields = null
}) {
  const savedFieldSummary = savedFields || buildSavedFieldsFromPayload(payload);

  return {
    action,
    record_type: recordType,
    caal_id: caalId || null,
    saved_at: new Date().toISOString(),
    saved_by:
      currentSession?.user?.display_name ||
      currentSession?.user?.username ||
      currentSession?.user?.email ||
      null,
    storage_scope: storageScope || null,
    source_scope: sourceScope || null,
    storage_label: storageLabelForSaveSummary(storageScope, recordWorkspaceCode),
    cache_refresh_required: cacheRefreshRequired,
    ...savedFieldSummary
  };
}

// -----------------------------------------------------
// UPDATE 
// -----------------------------------------------------
router.patch("/:id", async (req, res) => {
  const currentSession = req.session?.appSession || null;
  const requestedStorageScope = String(req.body?._storage_scope || "").trim();
  const requestedSourceScope = String(req.body?._source_scope || "").trim();

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  if (!canEditArchive(currentSession) && !canEditPublicCaalArchive(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to edit archive records"
    });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid archive id"
    });
  }

  const payload = normaliseArchivePayload(req.body || {});
  const fields = Object.keys(payload);

  const holdingInstitutionCaalId = getSubmittedHoldingInstitutionCaalId(req.body || {});
  let holdingInstitution = null;

  const holdingInstitutionWasSubmitted =
    Object.prototype.hasOwnProperty.call(req.body || {}, "_holding_institution_caal_id");

  if (holdingInstitutionWasSubmitted && holdingInstitutionCaalId) {
    holdingInstitution = await validateHoldingInstitution(pool, holdingInstitutionCaalId);

    if (!holdingInstitution) {
      return res.status(400).json({
        ok: false,
        error: "The selected holding institution could not be found."
      });
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "No editable fields supplied"
    });
  }

  const setSql = fields.map((field, index) => `"${field}" = $${index + 1}`).join(", ");
  const values = fields.map((field) => payload[field]);

  try {
    const userId = currentSession?.user?.user_id ?? null;

    let result = { rows: [] };
    let returnedScope = requestedSourceScope || "workspace";
    let returnedEditable = true;
    let oldRowForSummary = null;
    let oldPublicCaalRow = null;

    const isPublicTarget = requestedStorageScope === "public_caal";
    const isWorkspaceTarget = requestedStorageScope.endsWith("_workspace");

    if (isPublicTarget) {
      const publicEditCheck = publicCaalArchiveEditWhereSql(
        currentSession,
        "a",
        fields.length + 2
      );

      const publicOldCheck = publicCaalArchiveEditWhereSql(
        currentSession,
        "a",
        2
      );

      await withPublicArchiveAuditTransaction(currentSession, "update", async (client) => {
        const oldPublicResult = await client.query(
          `
          SELECT a.*
          FROM ${ARCHIVE_CAAL_TABLE} a
          WHERE a.id = $1
            ${publicOldCheck.sql}
          FOR UPDATE
          `,
          [id, ...publicOldCheck.values]
        );

        oldPublicCaalRow = oldPublicResult.rows[0] || null;
        oldRowForSummary = oldPublicCaalRow;

        result = await client.query(
          `
          UPDATE ${ARCHIVE_CAAL_TABLE} a
          SET
            ${setSql},
            "Tstamp" = NOW()
          WHERE a.id = $${fields.length + 1}
            ${publicEditCheck.sql}
          RETURNING *
          `,
          [...values, id, ...publicEditCheck.values]
        );

      });

      if (result.rows.length > 0) {
        returnedScope =
          requestedSourceScope ||
          (
            isCaalAdmin(currentSession)
              ? "all_caal"
              : isNationalAdmin(currentSession)
                ? "national_ref"
                : "workspace"
          );

        returnedEditable = true;
      }
    } else if (isWorkspaceTarget) {
      const ownStorageScope = storageScopeForSession(currentSession);

      if (requestedStorageScope !== ownStorageScope && !isCaalAdmin(currentSession)) {
        return res.status(403).json({
          ok: false,
          error: "You can only edit records in your own workspace"
        });
      }

      const targetTable = tableSqlForStorageScope(requestedStorageScope, "archive");

      const oldWorkspaceResult = await pool.query(
        `
        SELECT *
        FROM ${targetTable}
        WHERE id = $1
        `,
        [id]
      );

      oldRowForSummary = oldWorkspaceResult.rows[0] || null;

      result = await pool.query(
        `
        UPDATE ${targetTable}
        SET
          ${setSql},
          "Tstamp" = NOW()
        WHERE id = $${fields.length + 1}
          AND (
            $${fields.length + 2}::boolean = true
            OR created_by_app_user_id = $${fields.length + 3}
          )
        RETURNING *
        `,
        [...values, id, isCaalAdmin(currentSession), userId]
      );

      returnedScope = "workspace";
      returnedEditable = true;
    } else {
      return res.status(400).json({
        ok: false,
        error: "Missing or unsupported archive storage source"
      });
    }
    if (result.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        error: "Archive record not found, or you do not have permission to edit it"
      });
    }

    if (isWorkspaceTarget && oldRowForSummary) {
      const storage = storageFromScope(requestedStorageScope);

      await logWorkspaceArchiveEdit({
        oldRow: oldRowForSummary,
        newRow: result.rows[0],
        submittedFields: fields,
        currentSession,
        sourceSchema: storage?.schema || null,
        storageScope: requestedStorageScope,
        note: "Edited through CAAL web app"
      });
    }
  
    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";
    const record = buildArchiveRecord(
      {
        ...result.rows[0],
        source_scope: returnedScope,
        is_editable: returnedEditable
      },
      lang
    );

    await syncResourceRelationsForArchive(pool, {
      caalId: result.rows[0]["CAAL_ID"],
      sourceRowId: result.rows[0].id,
      payload,
      currentSession,
      storageScope: requestedStorageScope
    });

    let oldHoldingInstitution = null;

    if (holdingInstitutionWasSubmitted) {
      oldHoldingInstitution = await getArchiveHoldingInstitution(
        pool,
        result.rows[0]["CAAL_ID"]
      );
    }

    if (holdingInstitutionWasSubmitted) {
      await replaceArchiveHoldingInstitutionRelation(pool, {
        archiveCaalId: result.rows[0]["CAAL_ID"],
        archiveRowId: result.rows[0].id,
        institutionCaalId: holdingInstitutionCaalId || null,
        currentSession,
        storageScope: requestedStorageScope
      });
    }

    record.relations = await getResourceRelations(pool, record.identity?.caal_id);
    if (holdingInstitution) {
      record.holding_institution = holdingInstitution;
    }

    const changedFieldSummary = buildSavedFieldsFromChangedValues({
      oldRow: oldRowForSummary,
      newRow: result.rows[0],
      submittedFields: fields
    });

    if (holdingInstitutionWasSubmitted) {
      const oldInstitutionId = oldHoldingInstitution?.caal_id || null;
      const newInstitutionId = holdingInstitutionCaalId || null;

      if (oldInstitutionId !== newInstitutionId) {
        changedFieldSummary.fields_saved = [
          {
            field: "Holding Institution",
            label: "Holding Institution",
            old_value: institutionSummaryLabel(oldHoldingInstitution),
            new_value: institutionSummaryLabel(holdingInstitution) || newInstitutionId,
            value: institutionSummaryLabel(holdingInstitution) || newInstitutionId
          },
          ...(changedFieldSummary.fields_saved || [])
        ];

        changedFieldSummary.saved_field_count =
          Number(changedFieldSummary.saved_field_count || 0) + 1;

        changedFieldSummary.shown_field_count =
          changedFieldSummary.fields_saved.length;
      }
    }

    const save_summary = buildSaveSummary({
      action: "update",
      recordType: "archive",
      caalId: record.identity?.caal_id,
      payload,
      currentSession,
      storageScope: record.source?.storage || requestedStorageScope || null,
      sourceScope: record.source?.scope || requestedSourceScope || "workspace",
      recordWorkspaceCode: record.raw?.workspace_code || null,
      cacheRefreshRequired: (record.source?.storage || requestedStorageScope) === "public_caal",
      savedFields: changedFieldSummary
    });

    return res.json({
      ok: true,
      record,
      save_summary
    });
  } catch (error) {
    console.error("Archive update failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Archive update failed",
      detail: error.message
    });
  }
});

// ---------------------------------------------------
// delete
// ---------------------------------------------------
router.delete("/:id", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  if (!canEditArchive(currentSession) && !canEditCaalArchive(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to delete archive records"
    });
  }

  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid archive id"
    });
  }

  const userId = currentSession?.user?.user_id ?? null;
  const username = currentSession?.user?.username ?? null;
  const canEditCaal = canEditCaalArchive(currentSession);
  const deleteReason = String(req.body?.reason || "").trim() || null;

  const requestedStorageScope = String(req.body?._storage_scope || "").trim();
  const isPublicTarget = requestedStorageScope === "public_caal";
  const isWorkspaceTarget = requestedStorageScope.endsWith("_workspace");

  if (isPublicTarget) {
    if (!canEditPublicCaalArchive(currentSession)) {
      return res.status(403).json({
        ok: false,
        error: "You do not have permission to delete public CAAL archive records"
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await setPublicArchiveAuditContext(client, currentSession, "delete");

      const targetResult = await client.query(
        `
        SELECT a.*
        FROM ${ARCHIVE_CAAL_TABLE} a
        WHERE a.id = $1
          AND (
            $2::boolean = true

            OR (
              $4::boolean = true
              AND lower(trim(COALESCE(a.workspace_code, ''))) = lower(trim($5))
            )

            OR EXISTS (
              SELECT 1
              FROM public.record_registry rr
              WHERE rr.caal_id = a."CAAL_ID"
                AND rr.created_by_app_user_id = $3
                AND ${archiveRegistryMatchSql("rr")}
                AND COALESCE(rr.status, '') <> 'deleted'
            )

            OR a.created_by_app_user_id = $3
          )
        `,
        [
          id,
          isCaalAdmin(currentSession),
          userId,
          Boolean(isNationalAdmin(currentSession)),
          getSessionWorkspaceCode(currentSession) || ""
        ]
      );

      const target = targetResult.rows[0];

      if (!target) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          ok: false,
          error: "Public CAAL archive record not found, or you do not have permission to delete it"
        });
      }

      await client.query(
        `
        WITH registry_update AS (
          UPDATE public.record_registry rr
          SET
            status = 'deleted',

            workspace_code = COALESCE(
              NULLIF(rr.workspace_code, ''),
              NULLIF($7, '')
            ),

            storage_scope = COALESCE(
              NULLIF(rr.storage_scope, ''),
              'public_caal'
            ),

            deleted_at = now(),
            deleted_by_app_user_id = $2,
            deleted_by = $3,
            delete_reason = $4,
            deleted_record = $5::jsonb,

            restored_at = NULL,
            restored_by_app_user_id = NULL,
            restored_by = NULL,
            restore_notes = NULL
          WHERE (
              rr.caal_id = $1
              OR (
                rr.source_schema = 'public'
                AND rr.source_table = 'CAAL_Archive'
                AND rr.source_row_id = $6
              )
            )
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
            workspace_code,
            storage_scope,
            status,
            notes,
            deleted_at,
            deleted_by_app_user_id,
            deleted_by,
            delete_reason,
            deleted_record
          )
          SELECT
            'public',
            'CAAL_Archive',
            $6,
            $1,
            'archive',
            now(),
            COALESCE($9, $3),
            $8,
            $7,
            'public_caal',
            'deleted',
            'Registry row created during public CAAL web app delete',
            now(),
            $2,
            $3,
            $4,
            $5::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM registry_update)
          RETURNING id
        )
        SELECT
          COALESCE(
            (SELECT id FROM registry_update LIMIT 1),
            (SELECT id FROM registry_insert LIMIT 1)
          ) AS registry_id
        `,
        [
          target["CAAL_ID"],                       // $1
          userId,                                  // $2 deleter
          username,                                // $3 deleter
          deleteReason,                            // $4
          JSON.stringify(target),                  // $5
          target.id,                               // $6
          target.workspace_code || null,           // $7
          target.created_by_app_user_id ?? null,   // $8
          target["Archive Recorder"] || null       // $9
        ]
      );

      const deleteResult = await client.query(
        `
        DELETE FROM ${ARCHIVE_CAAL_TABLE}
        WHERE id = $1
        RETURNING id, "CAAL_ID"
        `,
        [target.id]
      );

      await client.query("COMMIT");

      await deactivateResourceRelationsForDeletedRecord(pool, {
        caalId: target["CAAL_ID"],
        currentSession,
        note: "Deactivated because public CAAL archive record was deleted through CAAL web app."
      });

      return res.json({
        ok: true,
        deleted: {
          id: deleteResult.rows[0].id,
          CAAL_ID: deleteResult.rows[0]["CAAL_ID"],
          storage_scope: "public_caal",
          physically_deleted: true
        },
        cache_refresh_required: true
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Public CAAL archive delete failed:");
      console.error(error);

      return res.status(500).json({
        ok: false,
        error: "Public CAAL archive delete failed",
        detail: error.message
      });
    } finally {
      client.release();
    }
  }

  if (!isWorkspaceTarget) {
    return res.status(400).json({
      ok: false,
      error: "Missing or unsupported archive storage source"
    });
  }

  const ownStorageScope = storageScopeForSession(currentSession);

  if (requestedStorageScope !== ownStorageScope && !canEditCaal) {
    return res.status(403).json({
      ok: false,
      error: "You can only delete records in your own workspace"
    });
  }

  const targetTable = tableSqlForStorageScope(requestedStorageScope, "archive");
  const storage = storageFromScope(requestedStorageScope);
    if (!storage?.schema) {
    return res.status(400).json({
      ok: false,
      error: "Unsupported archive storage source"
    });
  }

  try {
    // Same rule as monuments: CAAL admins, or national admins in their own workspace.
    const canAdministerWorkspace =
      canEditCaal ||
      (
        isNationalAdmin(currentSession) &&
        requestedStorageScope === ownStorageScope
      );

    const ownershipClause = canAdministerWorkspace
      ? ""
      : `AND a.created_by_app_user_id = $2`;

    const deleteSql = `
      WITH target AS (
        SELECT *
        FROM ${targetTable} a
        WHERE a.id = $1
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
          deleted_record = to_jsonb(target),
          restored_at = NULL,
          restored_by_app_user_id = NULL,
          restored_by = NULL,
          restore_notes = NULL
        FROM target
        WHERE rr.source_schema = $5
          AND rr.source_table = 'CAAL_Archive'
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
          $5,
          'CAAL_Archive',
          target.id,
          target."CAAL_ID",
          'archive',
          now(),
          COALESCE(target."Archive Recorder", $3),
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
        DELETE FROM ${targetTable} a
        USING target
        WHERE a.id = target.id
        RETURNING a.id, a."CAAL_ID"
      )
      SELECT * FROM deleted;
    `;

    const result = await pool.query(deleteSql, [
      id,
      userId,
      username,
      deleteReason,
      storage.schema
    ]);

    if (result.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        error: canAdministerWorkspace
          ? "Archive record not found in workspace table"
          : "You can only delete your own workspace archive records"
      });
    }
    
    await deactivateResourceRelationsForDeletedRecord(pool, {
      caalId: result.rows[0]["CAAL_ID"],
      currentSession,
      note: "Deactivated because archive record was deleted through CAAL web app."
    });

    return res.json({
      ok: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    console.error("Archive delete failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Archive delete failed",
      detail: error.message
    });
  }
});

// ------------------------------------------------
// CREATE 
// ------------------------------------------------
router.post("/", async (req, res) => {
  const currentSession = req.session?.appSession || null;
  
  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  if (!canEditArchive(currentSession) && !canEditCaalArchive(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to edit archive records"
    });
  }

  const payload = normaliseArchivePayload(req.body || {});
  delete payload["CAAL_ID"];

  const holdingInstitutionCaalId = getSubmittedHoldingInstitutionCaalId(req.body || {});

  if (!holdingInstitutionCaalId) {
    return res.status(400).json({
      ok: false,
      error: "A holding institution is required for archive records."
    });
  }

  const holdingInstitution = await validateHoldingInstitution(pool, holdingInstitutionCaalId);

  if (!holdingInstitution) {
    return res.status(400).json({
      ok: false,
      error: "The selected holding institution could not be found."
    });
  }

  const appUserId = currentSession?.user?.user_id ?? null;
  const sessionUsername = currentSession?.user?.username ?? null;
  const preferredLanguage =
    String(req.body?.["Preferred Language"] || "").trim() ||
    String(req.query.lang || "").trim() ||
    String(currentSession?.profile?.preferred_language || "").trim() ||
    null;
  const sessionCountry = currentSession?.profile?.country ?? null;

  payload.created_by_app_user_id = appUserId;
  payload["Archive Recorder"] = sessionUsername;
  payload["Preferred Language"] = preferredLanguage;
  payload["Tstamp"] = new Date();
  payload["Date of Recording"] = new Date().toISOString().slice(0, 10);

  if (!payload["Country"]) {
    payload["Country"] = sessionCountry;
  }

  const createTarget = createStorageTargetForRecord(
    "archive",
    payload,
    currentSession
  );

  if (!createTarget.ok) {
    return res.status(400).json({
      ok: false,
      error: createTarget.error ===
        "A country is required so the record can be assigned to a national workspace"
          ? "A country is required so the archive record can be assigned to a national workspace"
          : createTarget.error
    });
  }

  const recordWorkspaceCode = createTarget.recordWorkspaceCode;

  /*
    This is record attribution, not physical storage.
  */
  payload.workspace_code = recordWorkspaceCode;

  const prefix =
    currentSession?.user?.archive_id_prefix ||
    currentSession?.profile?.archive_id_prefix ||
    await getCurrentUserArchivePrefix(appUserId);

  if (!prefix || !String(prefix).trim()) {
    return res.status(400).json({
      ok: false,
      error: "No archive CAAL_ID prefix is configured for this user."
    });
  }

  try {
    const caalId = await allocateCaalId(pool, {
      recordType: "archive",
      prefix
    });

    payload["CAAL_ID"] = caalId;
  } catch (error) {
    console.error("Archive CAAL_ID allocation failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Archive CAAL_ID allocation failed",
      detail: error.message
    });
  }

  const fields = Object.keys(payload);

  if (fields.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "No editable fields supplied"
    });
  }

  const columnSql = fields.map((field) => `"${field}"`).join(", ");
  const valueSql = fields.map((_, index) => `$${index + 1}`).join(", ");
  const values = fields.map((field) => payload[field]);

  try {
    const targetTable = createTarget.tableSql;
    const targetStorage = createTarget.storageScope;

    const insertAndRegister = async (db) => {
      const result = await db.query(
        `
        INSERT INTO ${targetTable} (${columnSql})
        VALUES (${valueSql})
        RETURNING *
        `,
        values
      );

      await registerCreatedRecord({
        db,
        sourceSchema: createTarget.schema,
        sourceTable: "CAAL_Archive",
        sourceRowId: result.rows[0].id,
        caalId: result.rows[0]["CAAL_ID"],
        recordType: "archive",
        createdBy: sessionUsername,
        createdByAppUserId: appUserId,
        workspaceCode: recordWorkspaceCode,
        storageScope: createTarget.storageScope,
        createdByWorkspaceCode: getSessionWorkspaceCode(currentSession),
        notes: createTarget.isPublicCaalStorage
          ? `Created through CAAL web app into public CAAL archive table; record workspace_code=${recordWorkspaceCode}`
          : `Created through CAAL web app into ${createTarget.storageScope}`
      });

      return result;
    };
    const result = createTarget.isPublicCaalStorage
      ? await withPublicArchiveAuditTransaction(currentSession, "create", insertAndRegister)
      : await insertAndRegister(pool);

    await replaceArchiveHoldingInstitutionRelation(pool, {
      archiveCaalId: result.rows[0]["CAAL_ID"],
      archiveRowId: result.rows[0].id,
      institutionCaalId: holdingInstitutionCaalId,
      currentSession,
      storageScope: targetStorage
    });

    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

    const record = buildArchiveRecord(
      {
        ...result.rows[0],
        source_scope: "workspace",
        source_scope_override: "workspace",
        storage_scope: targetStorage,
        is_promoted: createTarget.isPublicCaalStorage,
        is_editable: true,
        is_editable_override: true
      },
      lang
    );

    if (result.rows[0]["CAAL_ID"]) {
      await syncResourceRelationsForArchive(pool, {
        caalId: result.rows[0]["CAAL_ID"],
        sourceRowId: result.rows[0].id,
        payload,
        currentSession,
        storageScope: targetStorage
      });
    }

    record.relations = await getResourceRelations(pool, record.identity?.caal_id);
    record.holding_institution = holdingInstitution;

    const save_summary = buildSaveSummary({
      action: "create",
      recordType: "archive",
      caalId: record.identity?.caal_id,
      payload,
      currentSession,
      storageScope: targetStorage,
      sourceScope: "workspace",
      recordWorkspaceCode,
      cacheRefreshRequired: createTarget.isPublicCaalStorage
    });

    appendSaveSummaryField(save_summary, {
      field: "Holding Institution",
      label: "Holding Institution",
      value: institutionSummaryLabel(holdingInstitution) || holdingInstitutionCaalId
    });

    return res.status(201).json({
      ok: true,
      record,
      save_summary
    });
  } catch (error) {
    console.error("Archive create failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Archive create failed",
      detail: error.message
    });
  }
});

// cache update for CAAL superuser
router.post("/admin/refresh-caal-cache", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!isCaalAdmin(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "CAAL admin only"
    });
  }

  const refreshed = [];
  const refreshedBy = currentSession?.user?.username || "web_admin";

  async function refreshMaterializedView(viewName, cacheKey, note) {
    // Snapshot time captured BEFORE the refresh, matching the cron job.
    const { rows: startRows } = await pool.query(
      `SELECT clock_timestamp() - interval '30 seconds' AS snapshot_at`
    );
    const snapshotAt = startRows[0].snapshot_at;

    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
    refreshed.push(viewName);

    await pool.query(`ANALYZE ${viewName}`);

    if (cacheKey) {
      await pool.query(
        `
        INSERT INTO ui.app_cache_status (
          cache_key,
          refreshed_at,
          refreshed_by,
          checked_at,
          checked_by,
          note
        )
        VALUES (
          $1,
          $4::timestamptz,
          $2,
          now(),
          $2,
          $3
        )
        ON CONFLICT (cache_key)
        DO UPDATE SET
          refreshed_at = EXCLUDED.refreshed_at,
          refreshed_by = EXCLUDED.refreshed_by,
          checked_at = EXCLUDED.checked_at,
          checked_by = EXCLUDED.checked_by,
          note = EXCLUDED.note
        `,
        [cacheKey, refreshedBy, note, snapshotAt]
      );
    }
  }

  try {
    await refreshMaterializedView(
      "ui.mv_archive_caal_app",
      "archive_caal_cache",
      "ui.mv_archive_caal_app refreshed from archive web admin button"
    );

    await refreshMaterializedView(
      "ui.mv_resource_identity",
      "resource_identity_cache",
      "ui.mv_resource_identity refreshed from archive web admin button"
    );

    await refreshMaterializedView(
      "ui.mv_resource_related_search",
      "resource_related_search_cache",
      "ui.mv_resource_related_search refreshed from archive web admin button"
    );

    return res.json({
      ok: true,
      refreshed
    });
  } catch (error) {
    console.error("Archive CAAL cache refresh failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Archive CAAL cache refresh failed",
      detail: error.message,
      refreshed
    });
  }
});

// cache status bar read endpoint
router.get("/cache-status", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        cache_key,
        refreshed_at,
        refreshed_by,
        note
      FROM ui.app_cache_status
      WHERE cache_key = 'archive_caal_cache'
      LIMIT 1
      `
    );

    return res.json({
      ok: true,
      status: result.rows[0] || null
    });
  } catch (error) {
    console.error("Archive cache status fetch failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Archive cache status fetch failed",
      detail: error.message
    });
  }
});

// show updated full record before cache refresh
router.get("/live-edited-records", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const currentAppUserId = currentAppUserIdFromSession(currentSession);

  try {
    const values = [];
    let scopeWhere = "";

    if (isCaalAdmin(currentSession)) {
      // CAAL admins: all uncached rows
    } else if (isNationalAdmin(currentSession)) {
      values.push(getSessionWorkspaceCode(currentSession));
      scopeWhere = `AND a.workspace_code = $${values.length}`;
    } else {
      // Everyone else: only the records they created
      if (currentAppUserId === null) {
        return res.json({
          ok: true,
          records: [],
          total: 0,
          source_mode: "archive_uncached_live_edits",
          cache_refreshed_at: null
        });
      }

      values.push(currentAppUserId);
      scopeWhere = archiveOwnRecordWhereSql("a", values.length);
    }

    const result = await pool.query(
      `
      WITH cache_status AS (
        SELECT refreshed_at
        FROM ui.app_cache_status
        WHERE cache_key = 'archive_caal_cache'
        LIMIT 1
      ),
      threshold AS (
        SELECT
          COALESCE(
            (SELECT refreshed_at FROM cache_status),
            'epoch'::timestamptz
          ) AS changed_after
      )
      SELECT
        a.id,
        a."CAAL_ID",
        a."Tstamp",
        threshold.changed_after AS cache_refreshed_at
      FROM ${ARCHIVE_CAAL_TABLE} a
      CROSS JOIN threshold
      WHERE (
          a."Tstamp" > threshold.changed_after
          OR EXISTS (
            SELECT 1 FROM public."CAAL_Archive_web_edit_log" log
            WHERE log.caal_id = a."CAAL_ID"
              AND log.edited_at > threshold.changed_after
          )
          OR NOT EXISTS (
            SELECT 1
            FROM ${ARCHIVE_CAAL_MV} c
            WHERE c."CAAL_ID" = a."CAAL_ID"
          )
        )
        ${scopeWhere}
        AND NOT EXISTS (
          SELECT 1 FROM public.record_registry rr
          WHERE rr.caal_id = a."CAAL_ID" AND ${archiveRegistryMatchSql("rr")}
            AND rr.status = 'deleted'
        )
      ORDER BY a."Tstamp" DESC NULLS LAST
      `,
      values
    );

    return res.json({
      ok: true,
      records: result.rows,
      total: result.rows.length,
      source_mode: "archive_uncached_live_edits",
      cache_refreshed_at: result.rows[0]?.cache_refreshed_at || null
    });
  } catch (error) {
    console.error("Uncached live archive records fetch failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Uncached live archive records fetch failed",
      detail: error.message
    });
  }
});

router.get("/:id/live-full-record", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid archive id"
    });
  }

  const lang =
    req.query.lang ||
    currentSession.profile?.preferred_language ||
    "en";

  try {
    const values = [id];
    let scopeWhere = "";

    if (isCaalAdmin(currentSession)) {
      // CAAL admins: any record
    } else if (isNationalAdmin(currentSession)) {
      values.push(getSessionWorkspaceCode(currentSession));
      scopeWhere = `AND a.workspace_code = $${values.length}`;
    } else {
      const currentAppUserId = currentAppUserIdFromSession(currentSession);

      if (currentAppUserId === null) {
        return res.status(404).json({
          ok: false,
          error: "Archive record not found"
        });
      }

      values.push(currentAppUserId);
      scopeWhere = archiveOwnRecordWhereSql("a", values.length);
    }

    const result = await pool.query(
      `
      SELECT
        a.*,
        'all_caal'::text AS source_scope,
        true AS is_editable,
        'all_caal'::text AS source_scope_override,
        true AS is_editable_override,
        'public_caal'::text AS storage_scope,
        true AS is_promoted
      FROM ${ARCHIVE_CAAL_TABLE} a
      WHERE a.id = $1
        ${scopeWhere}
      LIMIT 1
      `,
      values
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "Archive record not found"
      });
    }

    const record = buildArchiveRecord(result.rows[0], lang);

    record.relations = await getResourceRelations(pool, record.identity?.caal_id);
    record.holding_institution = await getArchiveHoldingInstitution(
      pool,
      record.identity?.caal_id
    );

    return res.json({
      ok: true,
      record,
      source_mode: "archive_live_full_record"
    });
  } catch (error) {
    console.error("Live full archive record fetch failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Live full archive record fetch failed",
      detail: error.message
    });
  }
});

// Archive records deleted since the last cache refresh (shown as tombstones).
router.get("/deleted-since-cache", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const lang =
    req.query.lang ||
    currentSession.profile?.preferred_language ||
    "en";

  const allowedScopes = getAllowedScopes(currentSession);
  const requestedScopes = Array.from(new Set(parseScopes(req.query.scopes)));
  const scopes = requestedScopes.filter((scope) => allowedScopes.includes(scope));

  if (!scopes.length) {
    return res.json({ ok: true, records: [], total: 0 });
  }

  try {
    const result = await pool.query(
      `
      WITH cache_status AS (
        SELECT refreshed_at
        FROM ui.app_cache_status
        WHERE cache_key = 'archive_caal_cache'
        LIMIT 1
      ),
      threshold AS (
        SELECT COALESCE(
          (SELECT refreshed_at FROM cache_status),
          now() - interval '2 hours'
        ) AS changed_after
      )
      SELECT rr.*
      FROM public.record_registry rr
      CROSS JOIN threshold
      WHERE rr.status = 'deleted'
        AND ${archiveRegistryMatchSql("rr")}
        AND rr.deleted_record IS NOT NULL
        AND rr.deleted_at > threshold.changed_after
      ORDER BY rr.deleted_at DESC
      `
    );

    const records = result.rows
      .map((row) => buildDeletedArchiveRecord(row, lang, currentSession))
      .filter((record) => scopes.includes(record.source?.scope));

    return res.json({
      ok: true,
      records,
      total: records.length,
      source_mode: "archive_deleted_since_cache"
    });
  } catch (error) {
    console.error("Deleted archive cache reconciliation failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Deleted archive cache reconciliation failed",
      detail: error.message
    });
  }
});

router.post("/:caalId/reinstate", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  if (
    !canEditArchive(currentSession) &&
    !canEditCaalArchive(currentSession) &&
    !isNationalAdmin(currentSession)
  ) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to reinstate archive records"
    });
  }

  const caalId = String(req.params.caalId || "").trim();

  if (!caalId) {
    return res.status(400).json({ ok: false, error: "Missing CAAL_ID" });
  }

  const restoreNotes = String(req.body?.notes || "").trim() || null;
  const userId = currentSession?.user?.user_id ?? null;
  const username = currentSession?.user?.username ?? null;

  const client = await pool.connect();

  let registryRow = null;
  let restoredRow = null;

  try {
    await client.query("BEGIN");

    const registryResult = await client.query(
      `
      SELECT *
      FROM public.record_registry rr
      WHERE lower(trim(rr.caal_id)) = lower(trim($1))
        AND rr.status = 'deleted'
        AND ${archiveRegistryMatchSql("rr")}
      ORDER BY rr.deleted_at DESC NULLS LAST
      LIMIT 1
      FOR UPDATE
      `,
      [caalId]
    );

    registryRow = registryResult.rows[0] || null;

    if (!registryRow) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        error: "Deleted archive record not found"
      });
    }

    if (!canReinstateDeletedArchive(currentSession, registryRow)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: "You do not have permission to reinstate this archive record"
      });
    }

    if (!registryRow.deleted_record) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "This registry entry does not contain a recovery copy"
      });
    }

    const sourceSchema = String(registryRow.source_schema || "");
    const sourceTable = String(registryRow.source_table || "");

    if (sourceTable !== "CAAL_Archive") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Unsupported archive source table"
      });
    }

    // Only configured storage may be restored; never trust identifiers
    // stored in record_registry blindly.
    const isPublicSource = sourceSchema === "public";

    const configuredStorage = Object.entries(WORKSPACE_STORAGE)
      .map(([workspaceCode, config]) => ({ workspaceCode, ...config }))
      .find(
        (storage) =>
          storage.schema === sourceSchema &&
          storage.archiveTable === sourceTable
      );

    if (!isPublicSource && !configuredStorage) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "The original archive storage location is not configured"
      });
    }

    const targetTable = tableSql(sourceSchema, sourceTable);

    const duplicateResult = await client.query(
      `
      SELECT id, "CAAL_ID"
      FROM ${targetTable}
      WHERE id = $1
         OR lower(trim("CAAL_ID")) = lower(trim($2))
      LIMIT 1
      `,
      [registryRow.source_row_id, registryRow.caal_id]
    );

    if (duplicateResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "The record already exists in its original table"
      });
    }

    const columnsResult = await client.query(
      `
      SELECT column_name, is_generated, is_identity
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
      `,
      [sourceSchema, sourceTable]
    );

    const writableColumns = columnsResult.rows
      .filter((column) => column.is_generated === "NEVER")
      .map((column) => column.column_name);

    const hasIdentity = columnsResult.rows.some(
      (column) => column.is_identity === "YES"
    );

    if (!writableColumns.length) {
      throw new Error("No writable columns found for restore");
    }

    // Newer than the current cache so the record shows as pending (yellow) until the next refresh.
    const recoveryCopy = {
      ...registryRow.deleted_record,
      Tstamp: new Date().toISOString()
    };

    const columnSql = writableColumns.map(quoteRestoreColumn).join(", ");
    const restoredSelectSql = writableColumns
      .map((column) => `restored.${quoteRestoreColumn(column)}`)
      .join(", ");
    const overridingSql = hasIdentity ? "OVERRIDING SYSTEM VALUE" : "";

    if (isPublicSource) {
      await setPublicArchiveAuditContext(client, currentSession, "restore");
    }

    const restoreResult = await client.query(
      `
      WITH restored AS (
        SELECT (
          jsonb_populate_record(NULL::${targetTable}, $1::jsonb)
        ).*
      )
      INSERT INTO ${targetTable} (${columnSql})
      ${overridingSql}
      SELECT ${restoredSelectSql}
      FROM restored
      RETURNING *
      `,
      [JSON.stringify(recoveryCopy)]
    );

    restoredRow = restoreResult.rows[0] || null;

    if (!restoredRow) {
      throw new Error("The deleted archive record could not be restored");
    }

    await client.query(
      `
      UPDATE public.record_registry
      SET
        status = 'restored',
        restored_at = now(),
        restored_by_app_user_id = $2,
        restored_by = $3,
        restore_notes = $4
      WHERE id = $1
      `,
      [registryRow.id, userId, username, restoreNotes]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Archive reinstate failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Archive reinstate failed",
      detail: error.message
    });
  } finally {
    client.release();
  }

  try {
    await reactivateResourceRelationsForRestoredRecord(pool, {
      caalId: registryRow.caal_id,
      deletedAt: registryRow.deleted_at,
      sourceSchema: registryRow.source_schema,
      sourceTable: registryRow.source_table,
      currentSession
    });
  } catch (error) {
    // The record itself is restored; surface the relation problem for diagnostics only.
    console.error("Archive restored but relation reactivation failed:", error);
  }

  const lang =
    req.query.lang ||
    currentSession.profile?.preferred_language ||
    "en";

  const sourceScope = deletedArchiveSourceScope(registryRow, currentSession);
  const storageScope = deletedArchiveStorageScope(registryRow);

  const record = buildArchiveRecord(
    {
      ...restoredRow,
      source_scope: sourceScope,
      storage_scope: storageScope,
      is_promoted: storageScope === "public_caal",
      is_editable: true
    },
    lang
  );

  record.source.is_deleted = false;
  record.relations = await getResourceRelations(pool, registryRow.caal_id);
  record.holding_institution = await getArchiveHoldingInstitution(
    pool,
    registryRow.caal_id
  );

  return res.json({
    ok: true,
    record,
    cache_refresh_required: storageScope === "public_caal"
  });
});

module.exports = router;