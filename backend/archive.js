const express = require("express");
const pool = require("./db");
const {
  getResourceRelations,
  syncResourceRelationsForArchive,
  deactivateResourceRelationsForDeletedRecord
} = require("./resourceRelations");

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

  return {
    workspace: {
      sql: `
        SELECT
          v.*,
          'workspace'::text AS source_scope,
          true AS is_editable,
          'workspace'::text AS source_scope_override,
          true AS is_editable_override,
          'kz_workspace'::text AS storage_scope,
          false AS is_promoted
        FROM ${ARCHIVE_WORKSPACE_VIEW} v
        LEFT JOIN public.record_registry rr
          ON rr.source_schema = 'kz'
         AND rr.source_table = 'CAAL_Archive'
         AND rr.source_row_id = v.id
        WHERE v.created_by_app_user_id = ${userId}
          AND COALESCE(rr.status, '') <> 'deleted'

        UNION ALL

        SELECT
          m.*,
          'workspace'::text AS source_scope,
          true AS is_editable,
          'workspace'::text AS source_scope_override,
          true AS is_editable_override,
          'public_caal'::text AS storage_scope,
          true AS is_promoted
        FROM ${ARCHIVE_CAAL_MV} m
        JOIN public.record_registry rr
          ON rr.caal_id = m."CAAL_ID"
         AND ${archiveRegistryMatchSql("rr")}
        WHERE rr.created_by_app_user_id = ${userId}
          AND COALESCE(rr.status, '') <> 'deleted'
      `
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
          AND ${ownPromotedExclusion}
      `
    },

    all_caal: {
      sql: `
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
          AND ${ownPromotedExclusion}
      `
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

function sqlArchiveSearchExpr(columnName) {
  return `regexp_replace(coalesce("${columnName}", ''), '[-‐-‒–—]+', ' ', 'g') ILIKE`;
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
      content_type: pickLangValue(row, "content_type", lang, ["Content Type", "content_type_en", "content_type"]),
      country: pickLangValue(row, "country", lang, ["Country", "country_en", "country"]),
      level: pickLangValue(row, "level", lang, ["Level", "level_en", "level"]),
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

    const freeTextFields = [
      "CAAL_ID",
      "Associated CAAL_ID",
      "Original Reference",
      "Original Title",
      "English Title",
      "Description",
      "Description - alternative language",
      "Number and Type of Original Material",
      "Related Towns and Cities",
      "Other Subjects",
      "Dates of Original Material",
      "Author of the Original Material",
      "Publisher of the Original Material",
      "Editor of the Original Material",
      "Volume and Issue Number",
      "Script of Material",
      "Writing System",
      "Copyright Holder Name",
      "Copyright Attribution",
      "Digital Folder Name",
      "Digital Files Name",
      "Creation Date of Digital Files",
      "Format of Digital Files",
      "Number of Digital Files",
      "Colour",
      "Resolution",
      "Archive Recorder",
      "Resource",
      "Level",
      "Content Type",
      "Country",
      "Related Countries",
      "Related Religions",
      "Related Subjects",
      "Languages of Material"
    ];

    whereClauses.push(`
      (
        ${freeTextFields.map((field) => `${sqlArchiveSearchExpr(field)} $${idx}`).join("\n OR ")}
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

const ARCHIVE_WORKSPACE_TABLE = 'kz."CAAL_Archive"';
const ARCHIVE_CAAL_TABLE = 'public."CAAL_Archive"';

const ARCHIVE_WORKSPACE_VIEW = "kz.v_archive_grid_base_app";
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

function getSessionWorkspaceCode(session) {
  return String(
    session?.user?.workspace_code ??
    session?.profile?.workspace_code ??
    ""
  ).trim().toLowerCase();
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

router.patch("/:id", async (req, res) => {
  const currentSession = req.session?.appSession || null;

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

    let result;
    let returnedScope = "workspace";
    let returnedEditable = true;
    let oldPublicCaalRow = null;

    // 1. Try KZ workspace table first.
    // CAAL admins and national admins can edit any workspace row.
    // Regular users can edit only their own workspace rows.
    if (isCaalAdmin(currentSession) || isNationalAdmin(currentSession)) {
      result = await pool.query(
        `
        UPDATE ${ARCHIVE_WORKSPACE_TABLE}
        SET
          ${setSql},
          "Tstamp" = NOW()
        WHERE id = $${fields.length + 1}
        RETURNING *
        `,
        [...values, id]
      );
    } else {
      result = await pool.query(
        `
        UPDATE ${ARCHIVE_WORKSPACE_TABLE}
        SET
          ${setSql},
          "Tstamp" = NOW()
        WHERE id = $${fields.length + 1}
          AND created_by_app_user_id = $${fields.length + 2}
        RETURNING *
        `,
        [...values, id, userId]
      );
    }

    // 2. If not found in workspace table, try public CAAL with role-aware rule.
    if (result.rows.length === 0) {
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
        if (isCaalAdmin(currentSession)) {
          returnedScope = "all_caal";
        } else if (isNationalAdmin(currentSession)) {
          returnedScope = "national_ref";
        } else {
          returnedScope = "workspace";
        }

        returnedEditable = true;
      }
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
      currentSession
    });

    record.relations = await getResourceRelations(pool, record.identity?.caal_id);

    return res.json({
      ok: true,
      record
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

// delete
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

  try {
    const ownershipClause = canEditCaal
      ? ""
      : `AND a.created_by_app_user_id = $2`;

    const values = canEditCaal
      ? [id, userId, username, deleteReason]
      : [id, userId, username, deleteReason];

    const deleteSql = `
      WITH target AS (
        SELECT *
        FROM ${ARCHIVE_WORKSPACE_TABLE} a
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
        WHERE rr.source_schema = 'kz'
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
          'kz',
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
        DELETE FROM ${ARCHIVE_WORKSPACE_TABLE} a
        USING target
        WHERE a.id = target.id
        RETURNING a.id, a."CAAL_ID"
      )
      SELECT * FROM deleted;
    `;

    const result = await pool.query(deleteSql, values);

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
      note: "Deactivated because monument record was deleted through CAAL web app."
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

router.post("/", async (req, res) => {
  const currentSession = req.session?.appSession || null;
  console.log("Archive POST currentSession:", JSON.stringify(currentSession, null, 2));

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
  const appUserId = currentSession?.user?.user_id ?? null;
  const sessionUsername = currentSession?.user?.username ?? null;
  const preferredLanguage = currentSession?.profile?.preferred_language ?? null;
  const sessionCountry = currentSession?.profile?.country ?? null;

  payload.created_by_app_user_id = appUserId;
  payload["Archive Recorder"] = sessionUsername;
  payload["Preferred Language"] = preferredLanguage;
  payload.workspace_code = getSessionWorkspaceCode(currentSession);

  if (!payload["Country"]) {
    payload["Country"] = sessionCountry;
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
    const result = await pool.query(
      `
      INSERT INTO ${ARCHIVE_WORKSPACE_TABLE} (${columnSql})
      VALUES (${valueSql})
      RETURNING *
      `,
      values
    );

    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";
    const record = buildArchiveRecord(
      {
        ...result.rows[0],
        source_scope: "workspace",
        is_editable: true
      },
      lang
    );

    await syncResourceRelationsForArchive(pool, {
      caalId: result.rows[0]["CAAL_ID"],
      sourceRowId: result.rows[0].id,
      payload,
      currentSession
    });

    record.relations = await getResourceRelations(pool, record.identity?.caal_id);

    return res.status(201).json({
      ok: true,
      record
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

module.exports = router;