const express = require("express");
const pool = require("./db");

const router = express.Router();

const browseScopeConfig = {
  workspace: {
    sql: `
      SELECT
        *,
        'workspace'::text AS source_scope,
        true AS is_editable
      FROM kz.v_archive_grid_base
    `
  },
  national_ref: {
    sql: `
      SELECT *
      FROM kz.mv_archive_combined
      WHERE source_scope = 'national_ref'
    `
  },
  all_caal: {
    sql: `
      SELECT *
      FROM kz.mv_archive_combined
      WHERE source_scope = 'all_caal'
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

function buildArchiveRecord(row, lang) {
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
      scope: row.source_scope,
      is_editable: row.is_editable === true || row.is_editable === "true"
    }
  };
}

router.get("/", async (req, res) => {
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

  const unionSql = buildBrowseUnionSql(scopes);

  const dataSql = `
    SELECT *
    FROM (
      ${unionSql}
    ) combined
    ORDER BY id DESC
    LIMIT $1 OFFSET $2
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
      ${unionSql}
    ) combined
  `;

  try {
    const [dataResult, countResult] = await Promise.all([
      pool.query(dataSql, [limit, offset]),
      pool.query(countSql)
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

const ARCHIVE_TABLE = 'kz."CAAL_Archive"';

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
    const result = await pool.query(
      `
      UPDATE ${ARCHIVE_TABLE}
      SET
        ${setSql},
        "Tstamp" = NOW()
      WHERE id = $${fields.length + 1}
        AND created_by_app_user_id = $${fields.length + 2}
      RETURNING *
      `,
      [...values, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        error: "You can only edit your own records"
      });
    }

    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";
    const record = buildArchiveRecord(
      {
        ...result.rows[0],
        source_scope: "workspace",
        is_editable: true
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

router.post("/", async (req, res) => {
  const currentSession = req.session?.appSession || null;
  console.log("Archive POST currentSession:", JSON.stringify(currentSession, null, 2));

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  if (!canEditArchive(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to create workspace archive records"
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
      INSERT INTO ${ARCHIVE_TABLE} (${columnSql})
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