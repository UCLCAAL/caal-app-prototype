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
  enabledWorkspaceStorageConfigs
} = require("./workspaceStorage");

const {
  getResourceRelations,
  syncResourceRelationsForArchive,
  deactivateResourceRelationsForDeletedRecord
} = require("./resourceRelations");

const { allocateCaalId } = require("./caalIdAllocator");

const router = express.Router();

function currentAppUserIdFromSession(session) {
  const value = session?.user?.user_id ?? null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
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

  return `
    SELECT
      v.*,
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
          v.*,
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
        AND COALESCE(rr.status, '') <> 'deleted'
    )
  `;

  const workspaceSchemaSql = archiveOwnedWorkspaceStorageConfigs(currentSession)
    .map((storage) => ownedWorkspaceArchiveSql(storage, userId))
    .join("\nUNION ALL\n");

  const workspacePublicOwnedSql = `
    SELECT
      m.*,
      'workspace'::text AS source_scope,
      true AS is_editable,
      'workspace'::text AS source_scope_override,
      true AS is_editable_override,
      'public_caal'::text AS storage_scope,
      true AS is_promoted
    FROM ${ARCHIVE_CAAL_MV} m
    LEFT JOIN public.record_registry rr
      ON rr.caal_id = m."CAAL_ID"
     AND ${archiveRegistryMatchSql("rr")}
    WHERE (
        rr.created_by_app_user_id = ${userId}
        OR m.created_by_app_user_id = ${userId}
      )
      AND COALESCE(rr.status, '') <> 'deleted'
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
          m.*,
          'national_ref'::text AS source_scope,
          ${publicEditableSql} AS is_editable,
          'national_ref'::text AS source_scope_override,
          ${publicEditableSql} AS is_editable_override,
          'public_caal'::text AS storage_scope,
          true AS is_promoted
        FROM ${ARCHIVE_CAAL_MV} m
        WHERE ${nationalWhere}
          AND COALESCE(m.created_by_app_user_id, -1) <> ${userId}
          AND ${ownPromotedExclusion}
      `
    },


    all_caal: {
      sql: [
        `
          SELECT
            m.*,
            'all_caal'::text AS source_scope,
            ${allCaalEditableSql} AS is_editable,
            'all_caal'::text AS source_scope_override,
            ${allCaalEditableSql} AS is_editable_override,
            'public_caal'::text AS storage_scope,
            true AS is_promoted
          FROM ${ARCHIVE_CAAL_MV} m
          WHERE (
              ${workspaceCode && workspaceCode !== "caal"
                ? `m.workspace_code IS DISTINCT FROM '${workspaceCode.replace(/'/g, "''")}'`
                : "true"}
            )
            AND COALESCE(m.created_by_app_user_id, -1) <> ${userId}
            AND ${ownPromotedExclusion}
        `,
        allWorkspaceArchivesSql
      ].filter(Boolean).join("\nUNION ALL\n")
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

  return scopes
    .filter((scope) => config[scope])
    .map((scope) => config[scope].sql)
    .join("\nUNION ALL\n");
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
      archive_recorder: firstDefined(
        row["Archive Recorder"],
        row.archive_recorder
      ),
      date_of_recording: firstDefined(
        row["Date of Recording"],
        row.date_of_recording
      )
    },
    raw: row,
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

  console.log("[Archive browse debug]", {
    username: currentSession?.user?.username,
    userId: currentSession?.user?.user_id,
    accessLevel: getAccessLevel(currentSession),
    workspaceCode: getSessionWorkspaceCode(currentSession),
    requestedScopes,
    normalizedScopes,
    allowedScopes,
    scopes
  });

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
    SELECT *
    FROM (
      ${unionSql}
    ) combined
    ${whereSql}
    ORDER BY
      CASE COALESCE(source_scope_override, source_scope)
        WHEN 'workspace' THEN 0
        WHEN 'national_ref' THEN 1
        WHEN 'all_caal' THEN 2
        ELSE 3
      END,
      "Date of Recording" DESC NULLS LAST,
      id DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
      ${unionSql}
    ) combined
    ${whereSql}
  `;

  try {
    const dataValues = values;
    const countValues = values.slice(0, values.length - 2);

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataSql, dataValues),
      pool.query(countSql, countValues)
    ]);

    const records = dataResult.rows.map((row) => buildArchiveRecord(row, lang));

    return res.json({
      ok: true,
      records,
      total: Number(countResult.rows[0].total),
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

async function logPublicCaalArchiveEdit({
  oldRow,
  newRow,
  submittedFields,
  currentSession,
  note = null
}) {
  if (!oldRow || !newRow) return;

  const { changedFields, oldValues, newValues } =
    buildArchiveChangedValueSnapshots(oldRow, newRow, submittedFields);

  if (changedFields.length === 0) return;

  await pool.query(
    `
    INSERT INTO public."CAAL_Archive_web_edit_log" (
      caal_id,
      archive_id,
      edited_by_app_user_id,
      edited_by_username,
      edit_type,
      changed_fields,
      old_values,
      new_values,
      note
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9
    )
    `,
    [
      newRow["CAAL_ID"],
      newRow.id,
      currentSession?.user?.user_id ?? null,
      currentSession?.user?.username ?? null,
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
      } else if (value === true || value === false) {
        payload[field] = value;
      } else if (value === "true") {
        payload[field] = true;
      } else if (value === "false") {
        payload[field] = false;
      } else {
        payload[field] = null;
      }
      continue;
    }

    payload[field] = value;
  }

  return payload;
}

async function getCurrentUserArchivePrefix(userId) {
  if (!userId) return null;

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
  await pool.query(
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

      const oldPublicResult = await pool.query(
        `
        SELECT a.*
        FROM ${ARCHIVE_CAAL_TABLE} a
        WHERE a.id = $1
          ${publicOldCheck.sql}
        `,
        [id, ...publicOldCheck.values]
      );

      oldPublicCaalRow = oldPublicResult.rows[0] || null;
      oldRowForSummary = oldPublicCaalRow;

      result = await pool.query(
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

    if (oldPublicCaalRow) {
      await logPublicCaalArchiveEdit({
        oldRow: oldPublicCaalRow,
        newRow: result.rows[0],
        submittedFields: fields,
        currentSession,
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

    record.relations = await getResourceRelations(pool, record.identity?.caal_id);

    const changedFieldSummary = buildSavedFieldsFromChangedValues({
      oldRow: oldRowForSummary,
      newRow: result.rows[0],
      submittedFields: fields
    });

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
    return res.status(403).json({
      ok: false,
      error: "Public CAAL archive records cannot currently be deleted from this screen"
    });
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
    const ownershipClause = canEditCaal
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
          deleted_record = to_jsonb(target)
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
        error: canEditCaal
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
  const appUserId = currentSession?.user?.user_id ?? null;
  const sessionUsername = currentSession?.user?.username ?? null;
  const preferredLanguage = currentSession?.profile?.preferred_language ?? null;
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

    const result = await pool.query(
      `
      INSERT INTO ${targetTable} (${columnSql})
      VALUES (${valueSql})
      RETURNING *
      `,
      values
    );

    await registerCreatedRecord({
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

  try {
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ui.mv_archive_caal_app`);
    await pool.query(`ANALYZE ui.mv_archive_caal_app`);
    refreshed.push("ui.mv_archive_caal_app");

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

module.exports = router;