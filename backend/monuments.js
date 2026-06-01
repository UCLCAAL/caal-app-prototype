const express = require("express");
const pool = require("./db");

const {
  WORKSPACE_STORAGE,
  getWorkspaceStorage,
  getSessionWorkspaceCode,
  workspaceMonumentTableSql,
  workspaceMonumentViewSql,
  workspaceSourceSchemaSql,
  workspaceStorageScopeSql,
  workspaceSourceTableSql,
  storageScopeForSession,
  tableSqlForStorageScope,
  storageFromScope,
  viewSql,
  tableSql,
  inferRecordWorkspaceCodeFromPayload,
  monumentTableForWorkspaceCode,
  storageScopeForWorkspaceCode,
  createStorageTargetForRecord,
  enabledWorkspaceStorageConfigs
} = require("./workspaceStorage");

const {
  getResourceRelations,
  syncResourceRelationsForMonument,
  deactivateResourceRelationsForDeletedRecord
} = require("./resourceRelations");

const { allocateCaalId } = require("./caalIdAllocator");

const router = express.Router();

// ========================================================
// CONFIG
// ========================================================

//const MONUMENTS_WORKSPACE_TABLE = 'kz."CAAL_Monuments"';
const MONUMENTS_CAAL_TABLE = 'public."CAAL_Monuments"';
//const MONUMENTS_VIEW = 'kz.v_monuments_grid_base';
const GEOM_COLUMN_SQL = `"geom"`;

const MONUMENTS_CAAL_MV = "ui.mv_monuments_caal";
const MONUMENTS_CAAL_LIST_MV = "ui.mv_monuments_caal_list";


// ========================================================
// HELPERS
// ========================================================

const ACTIVE_REGISTRY_STATUS_SQL = `
  COALESCE(rr.status, '') <> 'deleted'
`;

function nationalRefWhereSql(alias = "", currentSession = null) {
  const p = alias ? `${alias}.` : "";
  const workspaceCode = getSessionWorkspaceCode(currentSession);

  // CAAL/global users do not have a national reference subset
  if (!workspaceCode || workspaceCode === "caal") {
    return "false";
  }

  return `${p}workspace_code = '${workspaceCode.replace(/'/g, "''")}'`;
}

function currentAppUserIdFromSession(session) {
  const value = session?.user?.user_id ?? null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

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

const MONUMENT_BROWSE_RAW_COLUMNS = [
  `"id"`,
  `"CAAL_ID"`,
  `"Primary Name"`,
  `"Primary Name (English)"`,
  `"Other Names"`,
  `"Country"`,
  `"Region"`,
  `"Classification"`,
  `"Designation"`,
  `"Monument Type1"`,
  `"Monument Type2"`,
  `"Monument Type3"`,
  `"Monument Type4"`,
  `"Monument Type5"`,
  `"Monument Type6"`,
  `"Religion1"`,
  `"Religion2"`,
  `"Religion3"`,
  `"Cultural Period1"`,
  `"Cultural Period2"`,
  `"Cultural Period3"`,
  `"Cultural Period4"`,
  `"Cultural Period5"`,
  `"Cultural Period6"`,
  `"Longitude"`,
  `"Latitude"`,
  `"Tstamp"`,
  `"created_by_app_user_id"`,
  `"workspace_code"`,

  `"country_en"`,
  `"country_ru"`,
  `"country_zh"`,
  `"country_kk"`,
  `"country_ky"`,
  `"country_tg"`,
  `"country_tk"`,
  `"country_uz"`,

  `"classification_en"`,
  `"classification_ru"`,
  `"classification_zh"`,
  `"classification_kk"`,
  `"classification_ky"`,
  `"classification_tg"`,
  `"classification_tk"`,
  `"classification_uz"`,

  `"designation_en"`,
  `"designation_ru"`,
  `"designation_zh"`,
  `"designation_kk"`,
  `"designation_ky"`,
  `"designation_tg"`,
  `"designation_tk"`,
  `"designation_uz"`,

  `"monument_type1_en"`,
  `"monument_type1_ru"`,
  `"monument_type1_zh"`,
  `"monument_type1_kk"`,
  `"monument_type1_ky"`,
  `"monument_type1_tg"`,
  `"monument_type1_tk"`,
  `"monument_type1_uz"`,

  `"cultural_period1_en"`,
  `"cultural_period1_ru"`,
  `"cultural_period1_zh"`,
  `"cultural_period1_kk"`,
  `"cultural_period1_ky"`,
  `"cultural_period1_tg"`,
  `"cultural_period1_tk"`,
  `"cultural_period1_uz"`,

  `"religion1_en"`,
  `"religion1_ru"`,
  `"religion1_zh"`,
  `"religion1_kk"`,
  `"religion1_ky"`,
  `"religion1_tg"`,
  `"religion1_tk"`,
  `"religion1_uz"`
];

function monumentBrowseRawColumnsSql(alias) {
  return MONUMENT_BROWSE_RAW_COLUMNS
    .map((column) => `${alias}.${column}`)
    .join(",\n      ");
}

function monumentExistingHelperColumnsSql(alias) {
  const p = alias ? `${alias}.` : "";

  return `
    ${p}search_blob_en,
    ${p}search_blob_ru,
    ${p}search_blob_zh,
    ${p}search_blob_kk,
    ${p}search_blob_ky,
    ${p}search_blob_tg,
    ${p}search_blob_tk,
    ${p}search_blob_uz,
    ${p}monument_types_arr,
    ${p}religions_arr,
    ${p}cultural_periods_arr
  `;
}

function ownedWorkspaceStorageConfigs(currentSession) {
  const ws = getWorkspaceStorage(currentSession);

  if (ws.workspaceCode !== "caal") {
    return [ws];
  }

  return enabledWorkspaceStorageConfigs()
    .filter((config) => {
      return (
        config?.monumentTable &&
        (config?.monumentAppView || config?.monumentView)
      );
    });
}

function sqlTextLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function ownedWorkspaceMonumentFullSql(storage, userId) {
  const viewName = viewSql(storage.schema, storage.monumentView);
  const storageScope = sqlTextLiteral(storage.storageScope);
  const sourceSchema = sqlTextLiteral(storage.schema);

  return `
    SELECT
      ${monumentBrowseRawColumnsSql("v")},
      ${monumentHelperColumnsSql("v")},
      'workspace'::text AS source_scope,
      ${storageScope}::text AS storage_scope,
      false AS is_promoted,
      true AS is_editable
    FROM ${viewName} v
    LEFT JOIN public.record_registry rr
      ON rr.source_schema = ${sourceSchema}
     AND rr.source_table = 'CAAL_Monuments'
     AND rr.source_row_id = v.id
    WHERE v.created_by_app_user_id = ${userId}
      AND COALESCE(rr.status, '') <> 'deleted'
  `;
}

function workspaceCardSelectSqlForStorage(storageScopeSql, lang = "en") {
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLookupLang(safeLang);

  return `
    m.id,
    m."CAAL_ID",
    m."Primary Name",
    m."Primary Name (English)",
    m."Other Names",

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
    m."Tstamp",
    m.created_by_app_user_id,
    'workspace'::text AS source_scope,
    ${storageScopeSql}::text AS storage_scope,
    false AS is_promoted,
    true AS is_editable,
    ${workspaceListFilterColumnsSql("m")}
  `;
}

function ownedWorkspaceMonumentListSql(storage, userId, lang = "en") {
  const tableName = tableSql(storage.schema, storage.monumentTable);
  const storageScope = sqlTextLiteral(storage.storageScope);
  const sourceSchema = sqlTextLiteral(storage.schema);

  return `
    SELECT
      ${workspaceCardSelectSqlForStorage(storageScope, lang)}
    FROM ${tableName} m
    LEFT JOIN public.record_registry rr
      ON rr.source_schema = ${sourceSchema}
     AND rr.source_table = 'CAAL_Monuments'
     AND rr.source_row_id = m.id
    ${workspaceCardJoinsSql()}
    WHERE m.created_by_app_user_id = ${userId}
      AND COALESCE(rr.status, '') <> 'deleted'
  `;
}

function allWorkspaceMonumentListSql(storage, currentSession, lang = "en") {
  const tableName = tableSql(storage.schema, storage.monumentTable);
  const storageScope = sqlTextLiteral(storage.storageScope);
  const sourceSchema = sqlTextLiteral(storage.schema);
  const userId = currentAppUserIdFromSession(currentSession) ?? -1;

  return `
    SELECT
      ${workspaceCardSelectSqlForStorage(storageScope, lang)}
    FROM ${tableName} m
    LEFT JOIN public.record_registry rr
      ON rr.source_schema = ${sourceSchema}
     AND rr.source_table = 'CAAL_Monuments'
     AND rr.source_row_id = m.id
    ${workspaceCardJoinsSql()}
    WHERE COALESCE(rr.status, '') <> 'deleted'
      AND COALESCE(m.created_by_app_user_id, -1) <> ${userId}
  `;
}

function allWorkspaceMonumentListSqlForCaalAdmin(currentSession, lang = "en") {
  if (!isCaalAdmin(currentSession)) return "";

  return monumentAllWorkspaceStorageConfigs()
    .map((storage) => allWorkspaceMonumentListSql(storage, currentSession, lang))
    .join("\nUNION ALL\n");
}

function monumentAllWorkspaceStorageConfigs() {
  return enabledWorkspaceStorageConfigs()
    .filter((config) => {
      return (
        config?.monumentTable &&
        (config?.monumentAppView || config?.monumentView)
      );
    });
}

function allWorkspaceMonumentsSqlForCaalAdmin(currentSession) {
  if (!isCaalAdmin(currentSession)) return "";

  const userId = currentAppUserIdFromSession(currentSession) ?? -1;

  return monumentAllWorkspaceStorageConfigs()
    .map((storage) => {
      const monumentView = viewSql(
        storage.schema,
        storage.monumentAppView || storage.monumentView
      );

      const storageScope = sqlTextLiteral(storage.storageScope);
      const sourceSchema = sqlTextLiteral(storage.schema);

      return `
        SELECT
          ${monumentBrowseRawColumnsSql("v")},
          ${monumentHelperColumnsSql("v")},
          'all_caal'::text AS source_scope,
          ${storageScope}::text AS storage_scope,
          false AS is_promoted,
          true AS is_editable
        FROM ${monumentView} v
        LEFT JOIN public.record_registry rr
          ON rr.source_schema = ${sourceSchema}
         AND rr.source_table = 'CAAL_Monuments'
         AND rr.source_row_id = v.id
        WHERE COALESCE(rr.status, '') <> 'deleted'
          AND COALESCE(v.created_by_app_user_id, -1) <> ${userId}
      `;
    })
    .join("\nUNION ALL\n");
}

function makeBrowseScopeConfig(currentSession, options = {}) {
  const caalSource = options.caalSource || MONUMENTS_CAAL_MV;
  const currentAppUserId = currentAppUserIdFromSession(currentSession);
  const userId = currentAppUserId ?? -1;

  const canEditCaal = canEditCaalMonuments(currentSession);
  const workspaceCode = getSessionWorkspaceCode(currentSession);
  const canEditNationalCaal = isNationalAdmin(currentSession);

  const publicEditableSql = canEditCaal
    ? "true"
    : canEditNationalCaal
      ? `m.workspace_code = '${workspaceCode.replace(/'/g, "''")}'`
      : "false";

  const allCaalEditableSql = canEditCaal ? "true" : "false";

  const nationalWhere = nationalRefWhereSql("m", currentSession);

  const workspaceSchemaSql = ownedWorkspaceStorageConfigs(currentSession)
    .map((storage) => ownedWorkspaceMonumentFullSql(storage, userId))
    .join("\nUNION ALL\n");

  const workspacePublicOwnedSql = `
    SELECT
      ${monumentBrowseRawColumnsSql("m")},
      ${monumentExistingHelperColumnsSql("m")},
      'workspace'::text AS source_scope,
      'public_caal'::text AS storage_scope,
      true AS is_promoted,
      true AS is_editable
    FROM ${caalSource} m
    LEFT JOIN public.record_registry rr
      ON rr.caal_id = m."CAAL_ID"
    WHERE (
        rr.created_by_app_user_id = ${userId}
        OR m.created_by_app_user_id = ${userId}
      )
      AND COALESCE(rr.status, '') <> 'deleted'
  `;

  const ownPromotedExclusion = `
    NOT EXISTS (
      SELECT 1
      FROM public.record_registry rr
      WHERE rr.caal_id = m."CAAL_ID"
        AND rr.created_by_app_user_id = ${userId}
        AND (
          rr.record_type = 'monument'
          OR rr.source_table = 'CAAL_Monuments'
        )
        AND COALESCE(rr.status, '') <> 'deleted'
    )
  `;
  const allWorkspaceMonumentsSql = allWorkspaceMonumentsSqlForCaalAdmin(currentSession);

  return {
    workspace: {
      sql: [workspaceSchemaSql, workspacePublicOwnedSql]
        .filter(Boolean)
        .join("\nUNION ALL\n")
    },

    national_ref: {
      sql: `
        SELECT
          ${monumentBrowseRawColumnsSql("m")},
          ${monumentExistingHelperColumnsSql("m")},
          'national_ref'::text AS source_scope,
          'public_caal'::text AS storage_scope,
          true AS is_promoted,
          ${publicEditableSql} AS is_editable
        FROM ${caalSource} m
        WHERE (${nationalWhere})
          AND COALESCE(m.created_by_app_user_id, -1) <> ${userId}
          AND NOT EXISTS (
            SELECT 1
            FROM public.record_registry rr
            WHERE rr.caal_id = m."CAAL_ID"
              AND rr.created_by_app_user_id = ${userId}
              AND COALESCE(rr.status, '') <> 'deleted'
          )
      `
    },

    all_caal: {
      sql: [
        `
          SELECT
            ${monumentBrowseRawColumnsSql("m")},
            ${monumentExistingHelperColumnsSql("m")},
            'all_caal'::text AS source_scope,
            'public_caal'::text AS storage_scope,
            true AS is_promoted,
            ${allCaalEditableSql} AS is_editable
          FROM ${caalSource} m
          WHERE (
              ${workspaceCode && workspaceCode !== "caal"
                ? `m.workspace_code IS DISTINCT FROM '${workspaceCode.replace(/'/g, "''")}'`
                : "true"}
            )
            AND COALESCE(m.created_by_app_user_id, -1) <> ${userId}
            AND ${ownPromotedExclusion}
        `,
        allWorkspaceMonumentsSql
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

function normalizeRequestedScopes(scopes) {
  return Array.from(new Set(scopes));
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

function buildBrowseUnionSql(scopes, currentSession, options = {}) {
  const config = makeBrowseScopeConfig(currentSession, options);

  return scopes
    .filter((scope) => config[scope])
    .map((scope) => config[scope].sql)
    .join("\nUNION ALL\n");
}

function buildBrowseListUnionSql(scopes, currentSession, lang = "en") {
  const currentAppUserId = currentAppUserIdFromSession(currentSession);
  const userId = currentAppUserId ?? -1;
  const workspaceCode = getSessionWorkspaceCode(currentSession);
  const canEditCaal = canEditCaalMonuments(currentSession);
  const canEditNationalCaal = isNationalAdmin(currentSession);

  const publicEditableSqlForListBase = canEditCaal
    ? "true"
    : canEditNationalCaal
      ? `base.workspace_code = '${workspaceCode.replace(/'/g, "''")}'`
      : "false";

  const allCaalEditableSql = canEditCaal ? "true" : "false";

  const workspaceSchemaListSql = ownedWorkspaceStorageConfigs(currentSession)
    .map((storage) => ownedWorkspaceMonumentListSql(storage, userId, lang))
    .join("\nUNION ALL\n");

  const workspacePublicOwnedListSql = `
    SELECT
      ${promotedWorkspaceCardSelectSql("m", lang)}
    FROM ${MONUMENTS_CAAL_LIST_MV} m
    LEFT JOIN public.record_registry rr
      ON rr.caal_id = m."CAAL_ID"
    WHERE (
        rr.created_by_app_user_id = ${userId}
        OR m.created_by_app_user_id = ${userId}
      )
      AND COALESCE(rr.status, '') <> 'deleted'
  `;

  const allWorkspaceMonumentListSql =
    allWorkspaceMonumentListSqlForCaalAdmin(currentSession, lang);

  console.log("[Monuments list all_caal workspace debug]", {
    username: currentSession?.user?.username,
    workspaceCode: getSessionWorkspaceCode(currentSession),
    accessLevel: getAccessLevel(currentSession),
    isCaalAdmin: isCaalAdmin(currentSession),
    enabledWorkspaces: enabledWorkspaceStorageConfigs().map((s) => ({
      workspaceCode: s.workspaceCode,
      schema: s.schema,
      storageScope: s.storageScope,
      monumentTable: s.monumentTable,
      monumentView: s.monumentView,
      monumentAppView: s.monumentAppView,
      enabled: s.enabled
    })),
    monumentAllWorkspaceConfigs: monumentAllWorkspaceStorageConfigs().map((s) => ({
      workspaceCode: s.workspaceCode,
      schema: s.schema,
      storageScope: s.storageScope,
      monumentTable: s.monumentTable,
      monumentView: s.monumentView,
      monumentAppView: s.monumentAppView
    })),
    allWorkspaceSqlPresent: Boolean(allWorkspaceMonumentListSql)
  });

  const config = {
    workspace: [workspaceSchemaListSql, workspacePublicOwnedListSql]
      .filter(Boolean)
      .join("\nUNION ALL\n"),

    national_ref: `
      SELECT
        ${monumentCardSelectSql("m", lang)}
      FROM (
        SELECT
          base.*,
          'national_ref'::text AS source_scope,
          'public_caal'::text AS storage_scope,
          true AS is_promoted,
          ${publicEditableSqlForListBase} AS is_editable
        FROM ${MONUMENTS_CAAL_LIST_MV} base
      ) m
      WHERE (${nationalRefWhereSql("m", currentSession)})
        AND COALESCE(m.created_by_app_user_id, -1) <> ${userId}
        AND NOT EXISTS (
          SELECT 1
          FROM public.record_registry rr
          WHERE rr.caal_id = m."CAAL_ID"
            AND rr.created_by_app_user_id = ${userId}
            AND COALESCE(rr.status, '') <> 'deleted'
        )
    `,

    all_caal: [
      `
        SELECT
          ${monumentCardSelectSql("m", lang)}
        FROM (
          SELECT
            base.*,
            'all_caal'::text AS source_scope,
            'public_caal'::text AS storage_scope,
            true AS is_promoted,
            ${allCaalEditableSql} AS is_editable
          FROM ${MONUMENTS_CAAL_LIST_MV} base
        ) m
        WHERE (
          ${workspaceCode && workspaceCode !== "caal"
            ? `m.workspace_code IS DISTINCT FROM '${workspaceCode.replace(/'/g, "''")}'`
            : "true"}
        )
        AND COALESCE(m.created_by_app_user_id, -1) <> ${userId}
        AND NOT EXISTS (
          SELECT 1
          FROM public.record_registry rr
          WHERE rr.caal_id = m."CAAL_ID"
            AND rr.created_by_app_user_id = ${userId}
            AND (
              rr.record_type = 'monument'
              OR rr.source_table = 'CAAL_Monuments'
            )
            AND COALESCE(rr.status, '') <> 'deleted'
        )
      `,
      allWorkspaceMonumentListSql
    ].filter(Boolean).join("\nUNION ALL\n")
  };

  return scopes
    .filter((scope) => config[scope])
    .map((scope) => config[scope])
    .filter(Boolean)
    .join("\nUNION ALL\n");
}

function workspaceFastBaseWhereSql(alias = "m") {
  const p = alias ? `${alias}.` : "";

  return `
    ${p}created_by_app_user_id = $1
    AND COALESCE(rr.status, '') <> 'deleted'
  `;
}

function workspaceFastRegistryJoinSql(currentSession, alias = "m") {
  const p = alias ? `${alias}.` : "";

  return `
    LEFT JOIN public.record_registry rr
      ON rr.source_schema = ${workspaceSourceSchemaSql(currentSession)}
     AND rr.source_table = ${workspaceSourceTableSql("monument")}
     AND rr.source_row_id = ${p}id
  `;
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

function fallbackLangForDisplay(lang) {
  return ["kk", "ky", "tg", "tk", "uz"].includes(String(lang || "").toLowerCase())
    ? "ru"
    : "en";
}

function pickLangValueWithFallback(row, baseName, lang, fallbackOrder = []) {
  const safeLang = safeMonumentLang(String(lang || "en").toLowerCase());
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
      country: pickLangValueWithFallback(row, "country", lang, ["Country"]),
      classification: pickLangValueWithFallback(row, "classification", lang, ["Classification"]),
      designation: pickLangValueWithFallback(row, "designation", lang, ["Designation"]),

      monument_type1: pickLangValueWithFallback(row, "monument_type1", lang, ["Monument Type1"]),
      cultural_period1: pickLangValueWithFallback(row, "cultural_period1", lang, ["Cultural Period1"]),
      religion1: pickLangValueWithFallback(row, "religion1", lang, ["Religion1"]),
      longitude: firstDefined(row["Longitude"], row.longitude, row.geom_lng),
      latitude: firstDefined(row["Latitude"], row.latitude, row.geom_lat),
      recorder: firstDefined(row["Recorder"], row.recorder),
      date_of_recording: firstDefined(row["Date of Recording"], row.date_of_recording)
    },

    raw: row,

    geometry: buildGeometry(row),

    source: {
      scope: row.source_scope || "workspace",
      storage: row.storage_scope || null,
      is_promoted:
        row.is_promoted === true ||
        row.is_promoted === "true",
      is_editable:
        row.is_editable === true ||
        row.is_editable === "true" ||
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
    "Other Names": row["Other Names"],
    "Country": row["Country"],
    "Designation": row["Designation"],
    "Classification": row["Classification"],
    "Monument Type1": row["Monument Type1"],
    "Longitude": row["Longitude"],
    "Latitude": row["Latitude"],
    created_by_app_user_id: row.created_by_app_user_id,
    source_scope: row.source_scope,
    storage_scope: row.storage_scope,
    is_promoted: row.is_promoted,
    is_editable: row.is_editable
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
      monument_type1:
        row.monument_type1_display ||
        row["Monument Type1"] ||
        row.classification_display ||
        row["Classification"],
      longitude: firstDefined(row["Longitude"], row.longitude, row.geom_lng),
      latitude: firstDefined(row["Latitude"], row.latitude, row.geom_lat)
    },

    raw,

    geometry: buildGeometry(row),

    source: {
      scope: row.source_scope || "workspace",
      storage: row.storage_scope || null,
      is_promoted:
        row.is_promoted === true ||
        row.is_promoted === "true",
      is_editable:
        row.is_editable === true ||
        row.is_editable === "true" ||
        canEditCaal ||
        (
          row.source_scope === "workspace" &&
          currentAppUserId !== null &&
          Number(row.created_by_app_user_id) === Number(currentAppUserId)
        )
    },

    filter_values: {
      monument_types: row["Monument Type1"] ? [row["Monument Type1"]] : [],
      religions: [],
      cultural_periods: [],
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
    source_scope: row.source_scope,
    storage_scope: row.storage_scope,
    is_promoted: row.is_promoted,
    is_editable: row.is_editable
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
      storage: row.storage_scope || null,
      is_promoted:
        row.is_promoted === true ||
        row.is_promoted === "true",
      is_editable:
        row.is_editable === true ||
        row.is_editable === "true" ||
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

// REGIONAL SUMMARY HELPERS
function parseAdminBoundaryId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function nationalClusterCellSizeForZoom(zoom) {
  const z = Number(zoom);

  if (!Number.isFinite(z)) return 0.5;

  if (z < 4) return 1.5;
  if (z < 5) return 1.0;
  if (z < 6) return 0.5;
  if (z < 7) return 0.25;
  if (z < 8) return 0.12;

  return 0;
}

function appendAdminBoundaryFilter({
  sql,
  values,
  tableAlias = "combined",
  boundaryId
}) {
  if (!boundaryId) {
    return {
      sql,
      values: [...values]
    };
  }

  const nextIndex = values.length + 1;
  const p = tableAlias ? `${tableAlias}.` : "";

  const boundaryClause = `
    EXISTS (
      SELECT 1
      FROM ui.mv_admin_boundaries_map b
      WHERE b.boundary_id = $${nextIndex}
        AND ${p}"Longitude" IS NOT NULL
        AND ${p}"Latitude" IS NOT NULL
        AND ST_Intersects(
          ST_SetSRID(
            ST_MakePoint(${p}"Longitude", ${p}"Latitude"),
            4326
          ),
          b.geom
        )
    )
  `;

  if (sql) {
    return {
      sql: `${sql} AND ${boundaryClause}`,
      values: [...values, boundaryId]
    };
  }

  return {
    sql: `WHERE ${boundaryClause}`,
    values: [...values, boundaryId]
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

function appendBboxFilter({
  sql,
  values,
  tableAlias = "",
  bboxParam
}) {
  const bbox = parseBboxParam(bboxParam);

  if (!bbox) {
    return {
      sql,
      values: [...values]
    };
  }

  const p = tableAlias ? `${tableAlias}.` : "";
  const nextIndex = values.length + 1;

  const bboxClause = `
    ${p}"Longitude" BETWEEN $${nextIndex} AND $${nextIndex + 1}
    AND ${p}"Latitude" BETWEEN $${nextIndex + 2} AND $${nextIndex + 3}
  `;

  const nextValues = [
    ...values,
    bbox.minLng,
    bbox.maxLng,
    bbox.minLat,
    bbox.maxLat
  ];

  if (sql) {
    return {
      sql: `${sql} AND ${bboxClause}`,
      values: nextValues
    };
  }

  return {
    sql: `WHERE ${bboxClause}`,
    values: nextValues
  };
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

function publicListFilterColumnsSql(alias = "m") {
  const p = alias ? `${alias}.` : "";

  return `
    ${p}"Country",
    ${p}"Designation",
    ${p}search_blob_en,
    ${p}search_blob_ru,
    ${p}search_blob_zh,
    ${p}search_blob_kk,
    ${p}search_blob_ky,
    ${p}search_blob_tg,
    ${p}search_blob_tk,
    ${p}search_blob_uz,
    ${p}monument_types_arr,
    ${p}religions_arr,
    ${p}cultural_periods_arr
  `;
}

function workspaceListFilterColumnsSql(alias = "m") {
  const p = alias ? `${alias}.` : "";

  const workspaceSearchBlobSql = `
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
    ))
  `;

  return `
    ${p}"Country",
    ${p}"Designation",

    ${workspaceSearchBlobSql} AS search_blob_en,
    ${workspaceSearchBlobSql} AS search_blob_ru,
    ${workspaceSearchBlobSql} AS search_blob_zh,
    ${workspaceSearchBlobSql} AS search_blob_kk,
    ${workspaceSearchBlobSql} AS search_blob_ky,
    ${workspaceSearchBlobSql} AS search_blob_tg,
    ${workspaceSearchBlobSql} AS search_blob_tk,
    ${workspaceSearchBlobSql} AS search_blob_uz,

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

function monumentCardSelectSql(alias = "combined", lang = "en") {
  const p = alias ? `${alias}.` : "";
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLookupLang(safeLang);

  return `
    ${p}id,
    ${p}"CAAL_ID",
    ${p}"Primary Name",
    ${p}"Primary Name (English)",
    ${p}"Other Names",
    ${p}"Classification",
    COALESCE(${p}classification_${safeLang}, ${p}classification_${fallbackLang}, ${p}classification_en, ${p}"Classification") AS classification_display,
    ${p}"Monument Type1",
    COALESCE(${p}monument_type1_${safeLang}, ${p}monument_type1_${fallbackLang}, ${p}monument_type1_en, ${p}"Monument Type1") AS monument_type1_display,
    ${p}"Longitude",
    ${p}"Latitude",
    ${p}"Tstamp",
    ${p}created_by_app_user_id,
    ${p}source_scope,
    ${p}storage_scope,
    ${p}is_promoted,
    ${p}is_editable,
    ${publicListFilterColumnsSql(alias)}
  `;
}

function promotedWorkspaceCardSelectSql(alias = "m", lang = "en") {
  const p = alias ? `${alias}.` : "";
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLookupLang(safeLang);

  return `
    ${p}id,
    ${p}"CAAL_ID",
    ${p}"Primary Name",
    ${p}"Primary Name (English)",
    ${p}"Other Names",
    ${p}"Classification",
    COALESCE(${p}classification_${safeLang}, ${p}classification_${fallbackLang}, ${p}classification_en, ${p}"Classification") AS classification_display,
    ${p}"Monument Type1",
    COALESCE(${p}monument_type1_${safeLang}, ${p}monument_type1_${fallbackLang}, ${p}monument_type1_en, ${p}"Monument Type1") AS monument_type1_display,
    ${p}"Longitude",
    ${p}"Latitude",
    ${p}"Tstamp",
    ${p}created_by_app_user_id,
    'workspace'::text AS source_scope,
    'public_caal'::text AS storage_scope,
    true AS is_promoted,
    true AS is_editable,
    ${publicListFilterColumnsSql(alias)}
  `;
}

function promotedWorkspaceMapSelectSql(alias = "m", lang = "en") {
  const p = alias ? `${alias}.` : "";
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLookupLang(safeLang);

  return `
    ${p}id,
    ${p}"CAAL_ID",
    ${p}"Primary Name",
    ${p}"Primary Name (English)",
    ${p}"Country",
    COALESCE(${p}country_${safeLang}, ${p}country_${fallbackLang}, ${p}country_en, ${p}"Country") AS country_display,
    ${p}"Region",
    ${p}"Classification",
    COALESCE(${p}classification_${safeLang}, ${p}classification_${fallbackLang}, ${p}classification_en, ${p}"Classification") AS classification_display,
    ${p}"Designation",
    COALESCE(${p}designation_${safeLang}, ${p}designation_${fallbackLang}, ${p}designation_en, ${p}"Designation") AS designation_display,
    ${p}"Monument Type1",
    COALESCE(${p}monument_type1_${safeLang}, ${p}monument_type1_${fallbackLang}, ${p}monument_type1_en, ${p}"Monument Type1") AS monument_type1_display,
    ${p}"Cultural Period1",
    COALESCE(${p}cultural_period1_${safeLang}, ${p}cultural_period1_${fallbackLang}, ${p}cultural_period1_en, ${p}"Cultural Period1") AS cultural_period1_display,
    ${p}"Religion1",
    COALESCE(${p}religion1_${safeLang}, ${p}religion1_${fallbackLang}, ${p}religion1_en, ${p}"Religion1") AS religion1_display,
    ${p}"Longitude",
    ${p}"Latitude",
    ${p}"Tstamp",
    ${p}created_by_app_user_id,
    'workspace'::text AS source_scope,
    'public_caal'::text AS storage_scope,
    true AS is_promoted,
    true AS is_editable
  `;
}

function workspaceCardSelectSql(currentSession, lang = "en") {
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLookupLang(safeLang);

  return `
    m.id,
    m."CAAL_ID",
    m."Primary Name",
    m."Primary Name (English)",
    m."Other Names",

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
    m."Tstamp",
    m.created_by_app_user_id,
    'workspace'::text AS source_scope,
    ${workspaceStorageScopeSql(currentSession)}::text AS storage_scope,
    false AS is_promoted,
    true AS is_editable,
    ${workspaceListFilterColumnsSql("m")}
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

function workspaceMapSelectSql(currentSession, lang = "en") {
  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLookupLang(safeLang);

  return `
    m.id,
    m."CAAL_ID",
    m."Primary Name",
    m."Primary Name (English)",
    m."Country",
    COALESCE(country.display_${safeLang}, country.display_ru, country.display_en, m."Country") AS country_display,
    m."Region",
    m."Classification",
    COALESCE(cls.display_${safeLang}, cls.display_ru, cls.display_en, m."Classification") AS classification_display,
    m."Designation",
    COALESCE(desig.display_${safeLang}, desig.display_ru, desig.display_en, m."Designation") AS designation_display,
    m."Monument Type1",
    COALESCE(mt1.display_${safeLang}, mt1.display_ru, mt1.display_en, m."Monument Type1") AS monument_type1_display,
    m."Cultural Period1",
    COALESCE(cp1.display_${safeLang}, cp1.display_ru, cp1.display_en, m."Cultural Period1") AS cultural_period1_display,
    m."Religion1",
    COALESCE(rel1.display_${safeLang}, rel1.display_ru, rel1.display_en, m."Religion1") AS religion1_display,
    m."Longitude",
    m."Latitude",
    m."Tstamp",
    m.created_by_app_user_id,
    'workspace'::text AS source_scope,
    ${workspaceStorageScopeSql(currentSession)}::text AS storage_scope,
    false AS is_promoted,
    true AS is_editable
  `;
}

function workspaceMapJoinsSql() {
  return `
    LEFT JOIN ui.v_lkp_countries country
      ON country.canonical_value = m."Country"
    LEFT JOIN ui.v_lkp_classifications cls
      ON cls.canonical_value = m."Classification"
    LEFT JOIN ui.v_lkp_designation_type desig
      ON desig.canonical_value = m."Designation"
    LEFT JOIN ui.v_lkp_site_types_context mt1
      ON mt1.canonical_value = m."Monument Type1"
    LEFT JOIN ui.v_lkp_cultural_periods_context cp1
      ON cp1.canonical_value = m."Cultural Period1"
    LEFT JOIN ui.v_lkp_religion rel1
      ON rel1.canonical_value = m."Religion1"
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

function shiftSqlParams(sql, offset) {
  if (!sql || !offset) return sql;

  return sql.replace(/\$(\d+)/g, (_, n) => {
    return `$${Number(n) + offset}`;
  });
}
// ========================================================
// LOOKUPS
// ========================================================

function fallbackLookupLang(lang) {
  return ["kk", "ky", "tg", "tk", "uz"].includes(lang) ? "ru" : "en";
}

router.get("/map/borders", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const bbox = parseBboxParam(req.query.bbox);

  if (!bbox) {
    return res.status(400).json({
      ok: false,
      error: "Missing or invalid bbox"
    });
  }

  const zoom = Number(req.query.zoom || 0);

  // Keep simplification conservative. At high zoom, do not simplify.
  const simplifyTolerance =
    zoom < 4 ? 0.08 :
    zoom < 6 ? 0.03 :
    zoom < 8 ? 0.01 :
    0;

  try {
    const result = await pool.query(
      `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
      ) AS geojson
      FROM (
        SELECT jsonb_build_object(
          'type', 'Feature',
          'id', b.boundary_id,
          'geometry',
            CASE
              WHEN $5::double precision > 0 THEN
                ST_AsGeoJSON(
                  ST_SimplifyPreserveTopology(b.geom, $5::double precision)
                )::jsonb
              ELSE
                ST_AsGeoJSON(b.geom)::jsonb
            END,
          'properties', jsonb_build_object(
            'boundary_id', b.boundary_id,
            'source', b.source,
            'source_version', b.source_version,
            'country_iso3', b.country_iso3,
            'admin_level', b.admin_level,
            'admin_code', b.admin_code,
            'admin_name', b.admin_name,
            'admin_type', b.admin_type,
            'count_all_caal', COALESCE(c.record_count, 0)
          )
        ) AS feature
        FROM ui.mv_admin_boundaries_map b
        LEFT JOIN (
          SELECT
            boundary_id,
            COUNT(*)::integer AS record_count
          FROM ui.monument_admin_boundary_membership
          GROUP BY boundary_id
        ) c
          ON c.boundary_id = b.boundary_id
        WHERE b.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        ORDER BY b.country_iso3, b.admin_name
      ) q;
      `,
      [
        bbox.minLng,
        bbox.minLat,
        bbox.maxLng,
        bbox.maxLat,
        simplifyTolerance
      ]
    );
    return res.json({
      ok: true,
      borders: result.rows[0]?.geojson || {
        type: "FeatureCollection",
        features: []
      }
    });
  } catch (error) {
    console.error("Central Asia borders fetch failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Central Asia borders fetch failed",
      detail: error.message
    });
  }
});

// SUMMARY FOR REGIONAL MAPPING
router.get("/map/admin-boundaries/:boundaryId/summary", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  const boundaryId = Number(req.params.boundaryId);

  if (!Number.isInteger(boundaryId)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid boundary id"
    });
  }

  const lang =
    req.query.lang ||
    currentSession.profile?.preferred_language ||
    "en";

  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLookupLang(safeLang);

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

  try {
    const boundaryResult = await pool.query(
      `
      SELECT
        boundary_id,
        country_iso3,
        admin_level,
        admin_code,
        admin_name,
        admin_type,
        geom
      FROM ui.mv_admin_boundaries_map
      WHERE boundary_id = $1
      `,
      [boundaryId]
    );

    const boundary = boundaryResult.rows[0];

    if (!boundary) {
      return res.status(404).json({
        ok: false,
        error: "Boundary not found"
      });
    }

    /*
      True total:
      Counts public CAAL monument records in the boundary,
      regardless of the current user's visible scopes.
    */
    const trueCountResult = await pool.query(
      `
      SELECT COUNT(*)::integer AS total
      FROM ui.monument_admin_boundary_membership
      WHERE boundary_id = $1
      `,
      [boundaryId]
    );

    /*
      Visible total:
      Counts the records the user can actually browse,
      using the same scoped union and filters as the map/list APIs.
    */
    const unionSql = buildBrowseUnionSql(scopes, currentSession);
    const filter = buildMonumentFilterWhere(req, lang);

    const boundaryParamIndex = filter.values.length + 1;

    const visibleWhere = filter.whereSql || "";

    const visibleCountResult = await pool.query(
      `
      SELECT COUNT(*)::integer AS total
      FROM (
        ${unionSql}
      ) combined
      JOIN ui.monument_admin_boundary_membership abm
        ON abm.caal_id = combined."CAAL_ID"
      AND abm.boundary_id = $${boundaryParamIndex}
      ${visibleWhere}
      `,
      [...filter.values, boundaryId]
    );

    const classificationResult = await pool.query(
      `
      SELECT
        COALESCE(
          cls.display_${safeLang},
          cls.display_${fallbackLang},
          cls.display_en,
          NULLIF(m."Classification", ''),
          'Unspecified'
        ) AS label,
        NULLIF(m."Classification", '') AS value,
        COUNT(*)::integer AS count
      FROM ui.monument_admin_boundary_membership abm
      JOIN ${MONUMENTS_CAAL_MV} m
        ON m."CAAL_ID" = abm.caal_id
      LEFT JOIN ui.v_lkp_classifications cls
        ON cls.canonical_value = NULLIF(m."Classification", '')
      WHERE abm.boundary_id = $1
      GROUP BY
        COALESCE(
          cls.display_${safeLang},
          cls.display_${fallbackLang},
          cls.display_en,
          NULLIF(m."Classification", ''),
          'Unspecified'
        ),
        NULLIF(m."Classification", '')
      ORDER BY count DESC, label
      LIMIT 5
      `,
      [boundaryId]
    );

    const typeResult = await pool.query(
      `
      WITH scoped_records AS (
        SELECT
          m."CAAL_ID",
          m.monument_types_arr
        FROM ui.monument_admin_boundary_membership abm
        JOIN ${MONUMENTS_CAAL_MV} m
          ON m."CAAL_ID" = abm.caal_id
        WHERE abm.boundary_id = $1
      ),
      specified AS (
        SELECT
          NULLIF(btrim(type_value), '') AS value,
          COUNT(*)::integer AS count
        FROM scoped_records
        CROSS JOIN LATERAL unnest(monument_types_arr) AS type_value
        WHERE NULLIF(btrim(type_value), '') IS NOT NULL
        GROUP BY NULLIF(btrim(type_value), '')
      ),
      unspecified AS (
        SELECT
          NULL::text AS value,
          COUNT(*)::integer AS count
        FROM scoped_records
        WHERE COALESCE(array_length(monument_types_arr, 1), 0) = 0
      ),
      combined AS (
        SELECT value, count FROM specified
        UNION ALL
        SELECT value, count FROM unspecified WHERE count > 0
      )
      SELECT
        COALESCE(
          mt.display_${safeLang},
          mt.display_${fallbackLang},
          mt.display_en,
          combined.value,
          'Unspecified'
        ) AS label,
        combined.value,
        combined.count
      FROM combined
      LEFT JOIN ui.v_lkp_site_types_context mt
        ON mt.canonical_value = combined.value
      ORDER BY combined.count DESC, label
      LIMIT 5
      `,
      [boundaryId]
    );

    const periodResult = await pool.query(
      `
      WITH scoped_records AS (
        SELECT
          m."CAAL_ID",
          m.cultural_periods_arr
        FROM ui.monument_admin_boundary_membership abm
        JOIN ${MONUMENTS_CAAL_MV} m
          ON m."CAAL_ID" = abm.caal_id
        WHERE abm.boundary_id = $1
      ),
      specified AS (
        SELECT
          NULLIF(btrim(period_value), '') AS value,
          COUNT(*)::integer AS count
        FROM scoped_records
        CROSS JOIN LATERAL unnest(cultural_periods_arr) AS period_value
        WHERE NULLIF(btrim(period_value), '') IS NOT NULL
        GROUP BY NULLIF(btrim(period_value), '')
      ),
      unspecified AS (
        SELECT
          NULL::text AS value,
          COUNT(*)::integer AS count
        FROM scoped_records
        WHERE COALESCE(array_length(cultural_periods_arr, 1), 0) = 0
      ),
      combined AS (
        SELECT value, count FROM specified
        UNION ALL
        SELECT value, count FROM unspecified WHERE count > 0
      )
      SELECT
        COALESCE(
          cp.display_${safeLang},
          cp.display_${fallbackLang},
          cp.display_en,
          combined.value,
          'Unspecified'
        ) AS label,
        combined.value,
        combined.count
      FROM combined
      LEFT JOIN ui.v_lkp_cultural_periods_context cp
        ON cp.canonical_value = combined.value
      ORDER BY combined.count DESC, label
      LIMIT 5
      `,
      [boundaryId]
    );

    return res.json({
      ok: true,
      boundary: {
        boundary_id: boundary.boundary_id,
        country_iso3: boundary.country_iso3,
        admin_level: boundary.admin_level,
        admin_code: boundary.admin_code,
        admin_name: boundary.admin_name,
        admin_type: boundary.admin_type
      },
      counts: {
        total_all_caal_records: Number(trueCountResult.rows[0]?.total || 0),
        visible_records: Number(visibleCountResult.rows[0]?.total || 0)
      },
      top: {
        classifications: classificationResult.rows,
        monument_types: typeResult.rows,
        cultural_periods: periodResult.rows
      }
    });
  } catch (error) {
    console.error("Admin boundary summary failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Admin boundary summary failed",
      detail: error.message
    });
  }
});

router.get("/monuments/map-national-clusters", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({ ok: false, error: "No active session" });
  }

  if (!getAllowedScopes(currentSession).includes("national_ref")) {
    return res.status(403).json({
      ok: false,
      error: "No permission to view national CAAL records"
    });
  }

  const lang =
    req.query.lang ||
    currentSession.profile?.preferred_language ||
    "en";

  const safeLang = safeMonumentLang(lang);
  const fallbackLang = fallbackLookupLang(safeLang);
  const zoom = Number(req.query.zoom || 0);
  const cellSize = nationalClusterCellSizeForZoom(zoom);
  const bbox = parseBboxParam(req.query.bbox);

  if (!bbox) {
    return res.status(400).json({
      ok: false,
      error: "Missing or invalid bbox"
    });
  }

  const nationalWhere = nationalRefWhereSql("m", currentSession);
  const currentAppUserId = currentAppUserIdFromSession(currentSession) ?? -1;

  const filter = buildMonumentFilterWhere(req, lang);

  const values = [...filter.values];
  let nextIndex = values.length + 1;

  const extraClauses = [
    `(${nationalWhere})`,
    `
    NOT EXISTS (
      SELECT 1
      FROM public.record_registry rr
      WHERE rr.caal_id = m."CAAL_ID"
        AND rr.created_by_app_user_id = ${currentAppUserId}
        AND COALESCE(rr.status, '') <> 'deleted'
    )
    `,
    `
    m."Longitude" BETWEEN $${nextIndex} AND $${nextIndex + 1}
    AND m."Latitude" BETWEEN $${nextIndex + 2} AND $${nextIndex + 3}
    `
  ];

  values.push(
    bbox.minLng,
    bbox.maxLng,
    bbox.minLat,
    bbox.maxLat
  );
  nextIndex += 4;

  const filterBbox = parseBboxParam(req.query.filterBbox);

  if (filterBbox) {
    extraClauses.push(`
      m."Longitude" BETWEEN $${nextIndex} AND $${nextIndex + 1}
      AND m."Latitude" BETWEEN $${nextIndex + 2} AND $${nextIndex + 3}
    `);

    values.push(
      filterBbox.minLng,
      filterBbox.maxLng,
      filterBbox.minLat,
      filterBbox.maxLat
    );

    nextIndex += 4;
  }

  const adminBoundaryId = parseAdminBoundaryId(req.query.adminBoundaryId);

  if (adminBoundaryId) {
    extraClauses.push(`
      EXISTS (
        SELECT 1
        FROM ui.monument_admin_boundary_membership abm
        WHERE abm.caal_id = m."CAAL_ID"
          AND abm.boundary_id = $${nextIndex}
      )
    `);

    values.push(adminBoundaryId);
    nextIndex += 1;
  }

  const filterWhere = filter.whereSql
    ? filter.whereSql.replace(/^WHERE\s+/i, "")
    : "";

  if (filterWhere) {
    extraClauses.push(filterWhere);
  }

  const whereSql = `WHERE ${extraClauses.join(" AND ")}`;

  try {
    if (cellSize > 0) {
      const result = await pool.query(
        `
        WITH filtered AS (
          SELECT
            m."CAAL_ID",
            m."Longitude",
            m."Latitude",
            ST_SnapToGrid(
              ST_SetSRID(ST_MakePoint(m."Longitude", m."Latitude"), 4326),
              $${nextIndex}
            ) AS grid_geom
          FROM ${MONUMENTS_CAAL_MV} m
          ${whereSql}
          AND m."Longitude" IS NOT NULL
          AND m."Latitude" IS NOT NULL
        ),
        grouped AS (
          SELECT
            grid_geom,
            COUNT(*)::integer AS count,
            AVG("Longitude")::double precision AS longitude,
            AVG("Latitude")::double precision AS latitude
          FROM filtered
          GROUP BY grid_geom
        )
        SELECT
          ('national-cluster-' || row_number() OVER ()) AS id,
          'cluster'::text AS feature_type,
          count,
          longitude,
          latitude,
          'national_ref'::text AS source_scope
        FROM grouped
        ORDER BY count DESC
        `,
        [...values, cellSize]
      );

      return res.json({
        ok: true,
        mode: "clusters",
        cell_size: cellSize,
        clusters: result.rows,
        points: []
      });
    }

    const result = await pool.query(
      `
      SELECT
        m.id,
        m."CAAL_ID",
        m."Primary Name",
        m."Primary Name (English)",
        m."Country",
        COALESCE(m.country_${safeLang}, m.country_${fallbackLang}, m.country_en, m."Country") AS country_display,
        m."Region",
        m."Classification",
        COALESCE(m.classification_${safeLang}, m.classification_${fallbackLang}, m.classification_en, m."Classification") AS classification_display,
        m."Designation",
        COALESCE(m.designation_${safeLang}, m.designation_${fallbackLang}, m.designation_en, m."Designation") AS designation_display,
        m."Monument Type1",
        COALESCE(m.monument_type1_${safeLang}, m.monument_type1_${fallbackLang}, m.monument_type1_en, m."Monument Type1") AS monument_type1_display,
        m."Cultural Period1",
        COALESCE(m.cultural_period1_${safeLang}, m.cultural_period1_${fallbackLang}, m.cultural_period1_en, m."Cultural Period1") AS cultural_period1_display,
        m."Religion1",
        COALESCE(m.religion1_${safeLang}, m.religion1_${fallbackLang}, m.religion1_en, m."Religion1") AS religion1_display,
        m."Longitude",
        m."Latitude",
        m.created_by_app_user_id,
        'national_ref'::text AS source_scope,
        'public_caal'::text AS storage_scope,
        true AS is_promoted,
        false AS is_editable
      FROM ${MONUMENTS_CAAL_MV} m
      ${whereSql}
      AND m."Longitude" IS NOT NULL
      AND m."Latitude" IS NOT NULL
      `,
      values
    );

    const records = result.rows.map((row) =>
      buildMonumentMapRecord(row, lang, currentAppUserId, false)
    );

    return res.json({
      ok: true,
      mode: "points",
      cell_size: 0,
      clusters: [],
      points: records
    });
  } catch (error) {
    console.error("National monument cluster fetch failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "National monument cluster fetch failed",
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

  const workspaceOnly =
    scopes.length === 1 &&
    scopes[0] === "workspace" &&
    getSessionWorkspaceCode(currentSession) !== "caal";

  if (workspaceOnly) {
    try {
      const userId = currentAppUserIdFromSession(currentSession);

      if (!userId) {
        return res.status(403).json({
          ok: false,
          error: "No app user id found for workspace map query"
        });
      }

      const filter = buildWorkspaceMonumentFilterWhere(req, "m");
      const shiftedWhereSql = shiftSqlParams(filter.whereSql, 1);
      const values = [userId, ...filter.values];

      const bbox = parseBboxParam(req.query.bbox);

      const extraClauses = [
        `
        m.created_by_app_user_id = $1
        AND COALESCE(rr.status, '') <> 'deleted'
        `
      ];

      let nextIndex = values.length + 1;

      if (bbox) {
        extraClauses.push(`
          m."Longitude" BETWEEN $${nextIndex} AND $${nextIndex + 1}
          AND m."Latitude" BETWEEN $${nextIndex + 2} AND $${nextIndex + 3}
        `);

        values.push(bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat);
        nextIndex += 4;
      }

      let workspaceWhere = shiftedWhereSql;

      workspaceWhere = workspaceWhere
        ? `${workspaceWhere} AND ${extraClauses.join(" AND ")}`
        : `WHERE ${extraClauses.join(" AND ")}`;

      const promotedExtraClauses = [
        `
        rr.created_by_app_user_id = $1
        AND COALESCE(rr.status, '') <> 'deleted'
        `
      ];

      let promotedWhere = `WHERE ${promotedExtraClauses.join(" AND ")}`;

      if (bbox) {
        promotedWhere += `
          AND m."Longitude" BETWEEN $${nextIndex - 4} AND $${nextIndex - 3}
          AND m."Latitude" BETWEEN $${nextIndex - 2} AND $${nextIndex - 1}
        `;
      }

      const dataSql = `
        WITH workspace_rows AS (
          SELECT
            ${workspaceMapSelectSql(currentSession, lang)}
          FROM ${workspaceMonumentTableSql(currentSession)} m
          ${workspaceFastRegistryJoinSql(currentSession, "m")}
          ${workspaceMapJoinsSql()}
          ${workspaceWhere}

          UNION ALL

          SELECT
            ${promotedWorkspaceMapSelectSql("m", lang)}
          FROM ${MONUMENTS_CAAL_MV} m
          JOIN public.record_registry rr
            ON rr.caal_id = m."CAAL_ID"
          ${promotedWhere}
        )
        SELECT *
        FROM workspace_rows
        ORDER BY
          "Tstamp" DESC NULLS LAST,
          id DESC
      `;

      const result = await pool.query(dataSql, values);

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
  const unionSql = buildBrowseUnionSql(scopes, currentSession);
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

  const adminBoundaryId = parseAdminBoundaryId(req.query.adminBoundaryId);

  const boundaryFiltered = appendAdminBoundaryFilter({
    sql: combinedWhere,
    values: extraValues,
    tableAlias: "combined",
    boundaryId: adminBoundaryId
  });

  const bboxFiltered = appendBboxFilter({
    sql: boundaryFiltered.sql,
    values: boundaryFiltered.values,
    tableAlias: "combined",
    bboxParam: req.query.filterBbox
  });

  combinedWhere = bboxFiltered.sql;
  const finalMapValues = bboxFiltered.values;

  // --- final query ---
  try {
    //console.log("MAP scopes:", scopes);
    //console.log("MAP where:", combinedWhere);
    //console.log("MAP values:", extraValues);

    const safeLang = safeMonumentLang(lang);
    const fallbackLang = fallbackLookupLang(safeLang);

    const dataSql = `
      SELECT
        id,
        "CAAL_ID",
        "Primary Name",
        "Primary Name (English)",
        "Country",
        COALESCE(country_${safeLang}, country_${fallbackLang}, country_en, "Country") AS country_display,
        "Region",
        "Classification",
        COALESCE(classification_${safeLang}, classification_${fallbackLang}, classification_en, "Classification") AS classification_display,
        "Designation",
        COALESCE(designation_${safeLang}, designation_${fallbackLang}, designation_en, "Designation") AS designation_display,
        "Monument Type1",
        COALESCE(monument_type1_${safeLang}, monument_type1_${fallbackLang}, monument_type1_en, "Monument Type1") AS monument_type1_display,
        "Cultural Period1",
        COALESCE(cultural_period1_${safeLang}, cultural_period1_${fallbackLang}, cultural_period1_en, "Cultural Period1") AS cultural_period1_display,
        "Religion1",
        COALESCE(religion1_${safeLang}, religion1_${fallbackLang}, religion1_en, "Religion1") AS religion1_display,
        "Longitude",
        "Latitude",
        created_by_app_user_id,
        source_scope,
        storage_scope,
        is_promoted,
        is_editable
      FROM (
        ${unionSql}
      ) combined
      ${combinedWhere}
    `;

    const result = await pool.query(dataSql, finalMapValues);

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

  const workspaceOnly =
    scopes.length === 1 &&
    scopes[0] === "workspace" &&
    getSessionWorkspaceCode(currentSession) !== "caal";

  if (workspaceOnly) {
    try {
      const userId = currentAppUserIdFromSession(currentSession);

      if (!userId) {
        return res.status(403).json({
          ok: false,
          error: "No app user id found for workspace query"
        });
      }

      const filter = buildWorkspaceMonumentFilterWhere(req, "m");
      const shiftedWhereSql = shiftSqlParams(filter.whereSql, 1);
      const shiftedValues = [userId, ...filter.values];

      const extraWhere = `
        m.created_by_app_user_id = $1
        AND COALESCE(rr.status, '') <> 'deleted'
      `;

      let workspaceWhere = shiftedWhereSql;

      workspaceWhere = workspaceWhere
        ? `${workspaceWhere} AND ${extraWhere}`
        : `WHERE ${extraWhere}`;

      const dataSql = `
        WITH workspace_rows AS (
          SELECT
            ${workspaceCardSelectSql(currentSession, lang)}
          FROM ${workspaceMonumentTableSql(currentSession)} m
          ${workspaceFastRegistryJoinSql(currentSession, "m")}
          ${workspaceCardJoinsSql()}
          ${workspaceWhere}

          UNION ALL

          SELECT
            ${promotedWorkspaceCardSelectSql("m", lang)}
          FROM ${MONUMENTS_CAAL_MV} m
          JOIN public.record_registry rr
            ON rr.caal_id = m."CAAL_ID"
          WHERE rr.created_by_app_user_id = $1
            AND COALESCE(rr.status, '') <> 'deleted'
        )
        SELECT *
        FROM workspace_rows
        ORDER BY
          "Tstamp" DESC NULLS LAST,
          id DESC
        LIMIT $${shiftedValues.length + 1} OFFSET $${shiftedValues.length + 2}
      `;

      const dataResult = await pool.query(dataSql, [
        ...shiftedValues,
        limit,
        offset
      ]);

      const countSql = `
        WITH workspace_rows AS (
          SELECT m.id
          FROM ${workspaceMonumentTableSql(currentSession)} m
          ${workspaceFastRegistryJoinSql(currentSession, "m")}
          ${workspaceWhere}

          UNION ALL

          SELECT m.id
          FROM ${MONUMENTS_CAAL_MV} m
          JOIN public.record_registry rr
            ON rr.caal_id = m."CAAL_ID"
          WHERE rr.created_by_app_user_id = $1
            AND COALESCE(rr.status, '') <> 'deleted'
        )
        SELECT COUNT(*) AS total
        FROM workspace_rows
      `;

      const countResult = await pool.query(countSql, shiftedValues);

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
    const unionSql = buildBrowseListUnionSql(scopes, currentSession, lang);

    const { whereSql, values } = buildMonumentFilterWhere(req, lang);

    const adminBoundaryId = parseAdminBoundaryId(req.query.adminBoundaryId);

    const boundaryFiltered = appendAdminBoundaryFilter({
      sql: whereSql,
      values,
      tableAlias: "combined",
      boundaryId: adminBoundaryId
    });

    const bboxFiltered = appendBboxFilter({
      sql: boundaryFiltered.sql,
      values: boundaryFiltered.values,
      tableAlias: "combined",
      bboxParam: req.query.filterBbox
    });

    const finalWhereSql = bboxFiltered.sql;
    const finalValues = bboxFiltered.values;

    const safeLang = safeMonumentLang(lang);

    const dataSql = `
      SELECT
        combined.id,
        combined."CAAL_ID",
        combined."Primary Name",
        combined."Primary Name (English)",
        combined."Other Names",
        combined."Country",
        combined."Designation",
        combined."Classification",
        combined.classification_display,
        combined."Monument Type1",
        combined.monument_type1_display,
        combined."Longitude",
        combined."Latitude",
        combined."Tstamp",
        combined.created_by_app_user_id,
        combined.source_scope,
        combined.storage_scope,
        combined.is_promoted,
        combined.is_editable
      FROM (
        ${unionSql}
      ) combined
      ${finalWhereSql}
      ORDER BY
        CASE combined.source_scope
          WHEN 'workspace' THEN 0
          WHEN 'national_ref' THEN 1
          WHEN 'all_caal' THEN 2
          ELSE 3
        END,
        combined."Tstamp" DESC NULLS LAST,
        combined.id DESC
      LIMIT $${finalValues.length + 1} OFFSET $${finalValues.length + 2}
    `;

    const hasFreeTextSearch = hasExpensiveFreeTextSearch(req);

    const dataResult = await pool.query(dataSql, [...finalValues, limit, offset]);

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
        ${finalWhereSql}
      `;

      const countResult = await pool.query(countSql, finalValues);
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

function isCaalAdmin(session) {
  return getAccessLevel(session) === 9 && getSessionWorkspaceCode(session) === "caal";
}

function isNationalAdmin(session) {
  const workspaceCode = getSessionWorkspaceCode(session);
  return getAccessLevel(session) === 9 && workspaceCode && workspaceCode !== "caal";
}

function canEditMonuments(session) {
  return !!session?.permissions?.can_edit_workspace;
}

// This now means "global CAAL admin", not any level-9 user.
function canEditCaalMonuments(session) {
  return isCaalAdmin(session);
}

function canEditPublicCaalMonuments(session) {
  return (
    isCaalAdmin(session) ||
    isNationalAdmin(session) ||
    canEditMonuments(session)
  );
}

function publicCaalMonumentEditWhereSql(session, tableAlias = "m", paramIndex) {
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
          AND COALESCE(rr.status, '') <> 'deleted'
      )
    `,
    values: [currentAppUserIdFromSession(session) ?? -1]
  };
}

function normaliseLogValue(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();

  // Keep null as null.
  if (value === null) return null;

  // Avoid tiny differences between numeric strings and numbers being missed.
  return value;
}

function valuesDifferForLog(oldValue, newValue) {
  return JSON.stringify(normaliseLogValue(oldValue)) !==
    JSON.stringify(normaliseLogValue(newValue));
}

function buildChangedValueSnapshots(oldRow, newRow, submittedFields) {
  const changedFields = [];
  const oldValues = {};
  const newValues = {};

  submittedFields.forEach((field) => {
    const oldValue = oldRow?.[field] ?? null;
    const newValue = newRow?.[field] ?? null;

    if (valuesDifferForLog(oldValue, newValue)) {
      changedFields.push(field);
      oldValues[field] = normaliseLogValue(oldValue);
      newValues[field] = normaliseLogValue(newValue);
    }
  });

  return {
    changedFields,
    oldValues,
    newValues
  };
}

function classifyMonumentEdit(changedFields = []) {
  const set = new Set(changedFields);

  if (set.has("Longitude") || set.has("Latitude") || set.has("Altitude") || set.has("Location Notes")) {
    return "location";
  }

  if (
    set.has("Classification") ||
    Array.from(set).some((field) => field.startsWith("Monument Type")) ||
    Array.from(set).some((field) => field.startsWith("Cultural Period")) ||
    Array.from(set).some((field) => field.startsWith("Religion"))
  ) {
    return "classification";
  }

  if (
    set.has("Monument is part of") ||
    set.has("Monument contains") ||
    set.has("Monument is associated with") ||
    set.has("MasterID")
  ) {
    return "relations";
  }

  return "metadata";
}

async function logPublicCaalMonumentEdit({
  oldRow,
  newRow,
  submittedFields,
  currentSession,
  note = null
}) {
  if (!oldRow || !newRow) return;

  const {
    changedFields,
    oldValues,
    newValues
  } = buildChangedValueSnapshots(oldRow, newRow, submittedFields);

  // Do not log a no-op PATCH.
  if (changedFields.length === 0) return;

  await pool.query(
    `
    INSERT INTO public."CAAL_Monuments_web_edit_log" (
      caal_id,
      monument_id,
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
      classifyMonumentEdit(changedFields),
      changedFields,
      JSON.stringify(oldValues),
      JSON.stringify(newValues),
      note
    ]
  );
}

async function logResourceRelationEdit(db, {
  edgeId = null,
  parentId,
  childId,
  relationType,
  action,
  currentSession = null,
  sourceTable = null,
  sourceField = null,
  sourceRowId = null,
  oldValues = null,
  newValues = null,
  note = null
}) {
  await db.query(
    `
    INSERT INTO public."CAAL_Resource_Relations_web_edit_log" (
      edge_id,
      parent_id,
      child_id,
      relation_type,
      action,
      edited_by_app_user_id,
      edited_by_username,
      source_table,
      source_field,
      source_row_id,
      old_values,
      new_values,
      note
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7,
      $8, $9, $10,
      $11::jsonb, $12::jsonb, $13
    )
    `,
    [
      edgeId,
      parentId,
      childId,
      relationType,
      action,
      currentSession?.user?.user_id ?? null,
      currentSession?.user?.username ?? null,
      sourceTable,
      sourceField,
      sourceRowId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      note
    ]
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
  "Start Date",
  "End Date",
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
      field === "Start Date" ||
      field === "End Date" ||
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
  if (!Object.prototype.hasOwnProperty.call(payload, "MasterID")) {
    return false;
  }

  const value = payload.MasterID;

  return value !== null &&
    value !== undefined &&
    String(value).trim() !== "";
}

async function fetchMonumentRowById(id, currentSession) {
  const ws = getWorkspaceStorage(currentSession);

  if (ws.workspaceCode === "caal") {
    return fetchPublicMonumentRowById(id);
  }

  const viewName = workspaceMonumentViewSql(currentSession);

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
    FROM ${viewName} v
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
      'public_caal'::text AS storage_scope,
      true AS is_promoted,
      true AS is_editable,
      CASE
        WHEN m.geom IS NOT NULL THEN ST_X(m.geom::geometry)
        ELSE NULL
      END AS geom_lng,
      CASE
        WHEN m.geom IS NOT NULL THEN ST_Y(m.geom::geometry)
        ELSE NULL
      END AS geom_lat
    FROM ${MONUMENTS_CAAL_TABLE} m
    WHERE m.id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function fetchWorkspaceMonumentRowById(id, storageScope) {
      const storage = storageFromScope(storageScope);
      const viewName = viewSql(storage.schema, storage.monumentView);

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
        FROM ${viewName} v
        WHERE v.id = $1
        `,
        [id]
      );

    return result.rows[0] || null;
  }

async function getCurrentUserMonumentPrefix(userId) {
  if (!userId) return null;

  const result = await pool.query(
    `
    SELECT monument_id_prefix
    FROM public.app_users
    WHERE user_id = $1
      AND is_enabled = true
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0]?.monument_id_prefix || null;
}    

function canCreateMonumentInWorkspaceCode(workspaceCode) {
  const code = String(workspaceCode || "").trim().toLowerCase();

  if (code === "caal") return true;

  const storage = WORKSPACE_STORAGE?.[code];

  return Boolean(
    storage?.enabled === true &&
    storage?.schema &&
    storage?.monumentTable
  );
}

// to move to shared
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

    if (!valuesDifferForLog(oldValue, newValue)) {
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

  // For now, only global CAAL admins can change MasterID.
  // If a non-CAAL user sends a blank MasterID field, ignore it rather than blocking save.
  if (!canEditCaal && Object.prototype.hasOwnProperty.call(payload, "MasterID")) {
    const masterIdValue = payload.MasterID;

    if (
      masterIdValue !== null &&
      masterIdValue !== undefined &&
      String(masterIdValue).trim() !== ""
    ) {
      return res.status(403).json({
        ok: false,
        error: "Only CAAL superusers can change MasterID"
      });
    }

    delete payload.MasterID;
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
  payload["Tstamp"] = new Date();
  payload.created_by_app_user_id = appUserId;

  const createTarget = createStorageTargetForRecord(
    "monument",
    payload,
    currentSession
  );

  if (!createTarget.ok) {
    return res.status(400).json({
      ok: false,
      error: createTarget.error
    });
  }

  const recordWorkspaceCode = createTarget.recordWorkspaceCode;

  /*
    This is record attribution, not physical storage.
    For CAAL users this may be "kz", "tj", etc. even though the row is inserted into public."CAAL_Monuments".
  */
  payload.workspace_code = recordWorkspaceCode;
  payload.workspace_assignment_method =
    currentSession?.user?.workspace_code === "caal"
      ? "caal_user_country_inference"
      : "session_workspace";
  payload.workspace_assigned_at = new Date();

  const prefix =
    currentSession?.user?.monument_id_prefix ||
    currentSession?.profile?.monument_id_prefix ||
    await getCurrentUserMonumentPrefix(appUserId);

  if (!prefix || !String(prefix).trim()) {
    return res.status(400).json({
      ok: false,
      error: "No monument CAAL_ID prefix is configured for this user."
    });
  }

  try {
    const caalId = await allocateCaalId(pool, {
      recordType: "monument",
      prefix
    });

    payload["CAAL_ID"] = caalId;
  } catch (error) {
    console.error("Monument CAAL_ID allocation failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Monument CAAL_ID allocation failed",
      detail: error.message
    });
  }

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

    const targetTable = createTarget.tableSql;
    const targetStorage = createTarget.storageScope;

    const insertSql = `
      INSERT INTO ${targetTable} (${columnSql}${geomSql})
      VALUES (${fields.map((_, i) => `$${i + 1}`).join(", ")}${geomValueSql})
      RETURNING id
    `;

    const insertResult = await pool.query(insertSql, queryValues);
    const newId = insertResult.rows[0].id;

    const freshRow = createTarget.isPublicCaalStorage
      ? await fetchPublicMonumentRowById(newId)
      : await fetchWorkspaceMonumentRowById(newId, targetStorage);

    if (!freshRow) {
      return res.status(500).json({
        ok: false,
        error: "Monument created but refreshed record could not be loaded",
        detail: `Created id ${newId} in ${targetStorage}, but fetch returned no row`
      });
    }

    await registerCreatedRecord({
      sourceSchema: createTarget.schema,
      sourceTable: "CAAL_Monuments",
      sourceRowId: freshRow.id,
      caalId: freshRow["CAAL_ID"],
      recordType: "monument",
      createdBy: sessionUsername,
      createdByAppUserId: appUserId,
      workspaceCode: recordWorkspaceCode,
      storageScope: createTarget.storageScope,
      createdByWorkspaceCode: getSessionWorkspaceCode(currentSession),
      notes: createTarget.isPublicCaalStorage
        ? `Created through CAAL web app into public CAAL table; record workspace_code=${recordWorkspaceCode}`
        : `Created through CAAL web app into ${createTarget.storageScope}`
    });

    if (freshRow["CAAL_ID"]) {
      await syncResourceRelationsForMonument(pool, {
        caalId: freshRow["CAAL_ID"],
        sourceRowId: freshRow.id,
        payload,
        currentSession,
        storageScope: targetStorage
      });
    }

    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

    const record = buildMonumentRecord(
      {
        ...stripMonumentInternalFields(freshRow),
        source_scope: "workspace",
        storage_scope: targetStorage,
        is_promoted: createTarget.isPublicCaalStorage,
        is_editable: true
      },
      lang,
      appUserId,
      canEditCaalMonuments(currentSession)
    );

    record.relations = await getResourceRelations(pool, record.identity?.caal_id);

    const save_summary = buildSaveSummary({
      action: "create",
      recordType: "monument",
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
    console.error("Monument create failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Monument create failed",
      detail: error.message
    });
  }
});

// cache update for CAAL superuser
router.post("/monuments/admin/refresh-caal-cache", async (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!isCaalAdmin(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "CAAL admin only"
    });
  }

  const refreshed = [];

  try {
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ui.mv_monuments_caal`);
    refreshed.push("ui.mv_monuments_caal");

    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ui.mv_monuments_caal_list`);
    refreshed.push("ui.mv_monuments_caal_list");

    return res.json({
      ok: true,
      refreshed
    });
  } catch (error) {
    console.error("Monument CAAL cache refresh failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Monument CAAL cache refresh failed",
      detail: error.message,
      refreshed
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

  if (!canEditMonuments(currentSession) && !canEditPublicCaalMonuments(currentSession)) {
    return res.status(403).json({
      ok: false,
      error: "You do not have permission to edit monument records"
    });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ ok: false, error: "Invalid monument id" });
  }

  const payload = normaliseMonumentPayload(req.body || {});
  delete payload["CAAL_ID"];

  const canEditCaal = canEditCaalMonuments(currentSession);

  // For now, only global CAAL admins can change MasterID.
  // If a non-CAAL user sends a blank MasterID field, ignore it rather than blocking save.
  if (!canEditCaal && Object.prototype.hasOwnProperty.call(payload, "MasterID")) {
    const masterIdValue = payload.MasterID;

    if (
      masterIdValue !== null &&
      masterIdValue !== undefined &&
      String(masterIdValue).trim() !== ""
    ) {
      return res.status(403).json({
        ok: false,
        error: "Only CAAL superusers can change MasterID"
      });
    }

    delete payload.MasterID;
  }

  const fields = Object.keys(payload);

  if (fields.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "No editable fields supplied"
    });
  }

  const setParts = fields.map((field, index) => `"${field}" = $${index + 1}`);

  const requestedStorageScope = String(req.body?._storage_scope || "").trim();
  const requestedSourceScope = String(req.body?._source_scope || "").trim();

  const isPublicTarget = requestedStorageScope === "public_caal";
  const isWorkspaceTarget = requestedStorageScope.endsWith("_workspace");

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

    let updateResult = { rows: [] };
    let updatedScope = requestedSourceScope || "workspace";
    let oldRowForSummary = null;
    let oldPublicCaalRow = null;

    if (isPublicTarget) {
      const publicEditCheck = publicCaalMonumentEditWhereSql(
        currentSession,
        "m",
        values.length + 2
      );

      const publicOldCheck = publicCaalMonumentEditWhereSql(
        currentSession,
        "m",
        2
      );

      const oldPublicResult = await pool.query(
        `
        SELECT m.*
        FROM ${MONUMENTS_CAAL_TABLE} m
        WHERE m.id = $1
          ${publicOldCheck.sql}
        `,
        [id, ...publicOldCheck.values]
      );

      oldPublicCaalRow = oldPublicResult.rows[0] || null;
      oldRowForSummary = oldPublicCaalRow;

      updateResult = await pool.query(
        `
        UPDATE ${MONUMENTS_CAAL_TABLE} m
        SET ${setParts.join(", ")}
        WHERE m.id = $${values.length + 1}
          ${publicEditCheck.sql}
        RETURNING m.*
        `,
        [...values, id, ...publicEditCheck.values]
      );

      if (updateResult.rows.length > 0) {
        updatedScope =
          requestedSourceScope ||
          (
            isCaalAdmin(currentSession)
              ? "all_caal"
              : isNationalAdmin(currentSession)
                ? "national_ref"
                : "workspace"
          );
      }
    } else if (isWorkspaceTarget) {
      const ownStorageScope = storageScopeForSession(currentSession);

      if (requestedStorageScope !== ownStorageScope && !isCaalAdmin(currentSession)) {
        return res.status(403).json({
          ok: false,
          error: "You can only edit records in your own workspace"
        });
      }

      const targetTable = tableSqlForStorageScope(requestedStorageScope, "monument");

      oldRowForSummary = await fetchWorkspaceMonumentRowById(id, requestedStorageScope);

      updateResult = await pool.query(
        `
        UPDATE ${targetTable}
        SET ${setParts.join(", ")}
        WHERE id = $${values.length + 1}
          AND (
            $${values.length + 2}::boolean = true
            OR created_by_app_user_id = $${values.length + 3}
          )
          AND (
            $${values.length + 2}::boolean = true
            OR COALESCE("MasterID", '') = ''
          )
        RETURNING *
        `,
        [...values, id, isCaalAdmin(currentSession), userId]
      );

      updatedScope = "workspace";
    } else {
      return res.status(400).json({
        ok: false,
        error: "Missing or unsupported record storage source"
      });
    }

    if (updateResult.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        error: "Monument record not found, or you do not have permission to edit it"
      });
    }

    const freshRow =
      isPublicTarget
        ? await fetchPublicMonumentRowById(id)
        : await fetchWorkspaceMonumentRowById(id, requestedStorageScope);

    if (!freshRow) {
      return res.status(500).json({
        ok: false,
        error: "Monument updated but refreshed record could not be loaded"
      });
    }

    await syncResourceRelationsForMonument(pool, {
      caalId: freshRow["CAAL_ID"],
      sourceRowId: freshRow.id,
      payload,
      currentSession,
      storageScope: requestedStorageScope
    });

    if (isPublicTarget && oldPublicCaalRow) {
      await logPublicCaalMonumentEdit({
        oldRow: oldPublicCaalRow,
        newRow: freshRow,
        submittedFields: fields,
        currentSession,
        note: "Edited through CAAL web app"
      });
    }

    const lang = req.query.lang || currentSession.profile?.preferred_language || "en";

    const record = buildMonumentRecord(
      {
        ...stripMonumentInternalFields(freshRow),
        source_scope: updatedScope || requestedSourceScope || freshRow.source_scope,
        storage_scope: requestedStorageScope || freshRow.storage_scope,
        is_promoted: isPublicTarget ? true : freshRow.is_promoted,
        is_editable: true
      },
      lang,
      userId,
      canEditCaalMonuments(currentSession)
    );

    record.relations = await getResourceRelations(pool, record.identity?.caal_id);

    const changedFieldSummary = buildSavedFieldsFromChangedValues({
      oldRow: oldRowForSummary,
      newRow: freshRow,
      submittedFields: fields
    });

    const save_summary = buildSaveSummary({
      action: "update",
      recordType: "monument",
      caalId: record.identity?.caal_id,
      payload,
      currentSession,
      storageScope: requestedStorageScope || record.source?.storage || null,
      sourceScope: updatedScope || requestedSourceScope || record.source?.scope || "workspace",
      recordWorkspaceCode:
        freshRow.workspace_code ||
        record.raw?.workspace_code ||
        null,
      cacheRefreshRequired: requestedStorageScope === "public_caal",
      savedFields: changedFieldSummary
    });

    return res.json({
      ok: true,
      record,
      save_summary
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

/// ========================================================
// DELETE
// ========================================================
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

  const requestedStorageScope = String(req.body?._storage_scope || "").trim();
  const isPublicTarget = requestedStorageScope === "public_caal";
  const isWorkspaceTarget = requestedStorageScope.endsWith("_workspace");

  if (isPublicTarget) {
    return res.status(403).json({
      ok: false,
      error: "Public CAAL records cannot currently be deleted from this screen"
    });
  }

  if (!isWorkspaceTarget) {
    return res.status(400).json({
      ok: false,
      error: "Missing or unsupported record storage source"
    });
  }

  try {
    const ownStorageScope = storageScopeForSession(currentSession);

    if (requestedStorageScope !== ownStorageScope && !isCaalAdmin(currentSession)) {
      return res.status(403).json({
        ok: false,
        error: "You can only delete records in your own workspace"
      });
    }

    const targetTable = tableSqlForStorageScope(requestedStorageScope, "monument");
    const storage = storageFromScope(requestedStorageScope);

    if (!storage?.schema) {
      return res.status(400).json({
        ok: false,
        error: "Unsupported record storage source"
      });
    }

    /*
      Non-CAAL users may only delete their own workspace records.
      CAAL admins may delete workspace records only if you allow that by reaching this branch.
      Public CAAL deletion is blocked above.
    */
    const ownershipClause = canEditCaal
      ? ""
      : `AND m.created_by_app_user_id = $2`;

    const masterIdClause = canEditCaal
      ? ""
      : `AND COALESCE(m."MasterID", '') = ''`;

    const deleteSql = `
      WITH target AS (
        SELECT *
        FROM ${targetTable} m
        WHERE m.id = $1
          ${ownershipClause}
          ${masterIdClause}
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
          $5,
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
        DELETE FROM ${targetTable} m
        USING target
        WHERE m.id = target.id
        RETURNING m.id, m."CAAL_ID"
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
          ? "Monument record not found in workspace table"
          : "You can only delete your own workspace monument records, and records linked to a MasterID cannot be deleted"
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