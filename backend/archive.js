const express = require("express");
const pool = require("./db");

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
  const canEditCaal = canEditCaalArchive(currentSession);

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
    // Internal key remains "workspace" for now.
    // User-facing meaning: My workspace records.
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
        FROM kz.v_archive_grid_base v
        LEFT JOIN public.record_registry rr
          ON rr.source_schema = 'kz'
         AND rr.source_table = 'CAAL_Archive'
         AND rr.source_row_id = v.id
        WHERE v.created_by_app_user_id = ${userId}
          AND COALESCE(rr.status, '') <> 'deleted'

        UNION ALL

        SELECT
          m.*,
          'workspace'::text AS source_scope_override,
          true AS is_editable_override,
          'public_caal'::text AS storage_scope,
          true AS is_promoted
        FROM kz.mv_archive_combined m
        JOIN public.record_registry rr
          ON rr.caal_id = m."CAAL_ID"
         AND ${archiveRegistryMatchSql("rr")}
        WHERE rr.created_by_app_user_id = ${userId}
          AND COALESCE(rr.status, '') <> 'deleted'
      `
    },

    // National public CAAL archive records, excluding my promoted records.
    national_ref: {
      sql: `
        SELECT
          m.*,
          NULL::text AS source_scope_override,
          NULL::boolean AS is_editable_override,
          'public_caal'::text AS storage_scope,
          true AS is_promoted
        FROM kz.mv_archive_combined m
        WHERE m.source_scope = 'national_ref'
          AND ${ownPromotedExclusion}
      `
    },

    // Other public CAAL archive records, excluding my promoted records.
    all_caal: {
      sql: `
        SELECT
          m.*,
          NULL::text AS source_scope_override,
          NULL::boolean AS is_editable_override,
          'public_caal'::text AS storage_scope,
          true AS is_promoted
        FROM kz.mv_archive_combined m
        WHERE m.source_scope = 'all_caal'
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

  const requestedScopes = parseScopes(req.query.scopes);
  const allowedScopes = getAllowedScopes(currentSession);
  const scopes = requestedScopes.filter((scope) => allowedScopes.includes(scope));

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

function canEditArchive(session) {
  return !!session?.permissions?.can_edit_workspace;
}

function canEditCaalArchive(session) {
  return !!session?.permissions?.can_edit_caal;
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

  if (!canEditArchive(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to edit workspace archive records"
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
    console.log("Archive PATCH id:", id);
    console.log("Archive PATCH payload:", payload);
    console.log("Archive PATCH fields:", fields);
    console.log("Archive PATCH values:", values);
    console.log("Archive PATCH setSql:", setSql);

    const userId = currentSession?.user?.user_id ?? null;
    const canEditCaal = canEditCaalArchive(currentSession);

    let result;
    let returnedScope = "workspace";
    let returnedEditable = true;

    if (canEditCaal) {
      // Super user can update either workspace or public CAAL.
      // Try workspace first, then public CAAL.
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

      if (result.rows.length === 0) {
        result = await pool.query(
          `
          UPDATE ${ARCHIVE_CAAL_TABLE}
          SET
            ${setSql},
            "Tstamp" = NOW()
          WHERE id = $${fields.length + 1}
          RETURNING *
          `,
          [...values, id]
        );

        returnedScope = "all_caal";
        returnedEditable = true;
      }
    } else {
      // Normal workspace editor can update own unpromoted workspace records.
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

      // If not found in workspace table, try an owned promoted public CAAL archive record.
      if (result.rows.length === 0) {
        result = await pool.query(
          `
          UPDATE ${ARCHIVE_CAAL_TABLE} a
          SET
            ${setSql},
            "Tstamp" = NOW()
          WHERE a.id = $${fields.length + 1}
            AND EXISTS (
              SELECT 1
              FROM public.record_registry rr
              WHERE rr.caal_id = a."CAAL_ID"
                AND rr.created_by_app_user_id = $${fields.length + 2}
                AND ${archiveRegistryMatchSql("rr")}
                AND COALESCE(rr.status, '') <> 'deleted'
            )
          RETURNING *
          `,
          [...values, id, userId]
        );

        if (result.rows.length > 0) {
          returnedScope = "workspace";
          returnedEditable = true;
        }
      }
    }

    if (result.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        error: canEditCaal
          ? "Archive record not found in workspace or public CAAL tables"
          : "You can only edit your own workspace archive records"
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