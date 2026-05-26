const WORKSPACE_STORAGE = {
  caal: {
    schema: "public",
    storageScope: "public_caal",
    monumentTable: "CAAL_Monuments",
    archiveTable: "CAAL_Archive",
    monumentView: null,
    archiveView: null,
    archiveAppView: null,
    enabled: true
  },

  kz: {
    schema: "kz",
    storageScope: "kz_workspace",
    monumentTable: "CAAL_Monuments",
    archiveTable: "CAAL_Archive",
    monumentView: "v_monuments_grid_base",
    archiveView: "v_archive_grid_base",
    archiveAppView: "v_archive_grid_base_app",
    enabled: true
  }
};

function quoteIdent(value) {
  const text = String(value || "").trim();

  if (!/^[a-z_][a-z0-9_]*$/i.test(text)) {
    throw new Error(`Unsafe SQL identifier: ${text}`);
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function sqlLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function getSessionWorkspaceCode(session) {
  return String(
    session?.user?.workspace_code ??
    session?.profile?.workspace_code ??
    ""
  ).trim().toLowerCase();
}

function getWorkspaceStorage(session) {
  const workspaceCode = getSessionWorkspaceCode(session);

  const configured = WORKSPACE_STORAGE[workspaceCode];

  if (!configured) {
    throw new Error(`Unsupported workspace_code: ${workspaceCode || "(blank)"}`);
  }

  return {
    workspaceCode,
    ...configured
  };
}

function tableSql(schema, table) {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

function viewSql(schema, view) {
  if (!view) return null;
  return `${quoteIdent(schema)}.${quoteIdent(view)}`;
}

function workspaceMonumentTableSql(session) {
  const ws = getWorkspaceStorage(session);
  return tableSql(ws.schema, ws.monumentTable);
}

function workspaceArchiveTableSql(session) {
  const ws = getWorkspaceStorage(session);
  return tableSql(ws.schema, ws.archiveTable);
}

function workspaceMonumentViewSql(session) {
  const ws = getWorkspaceStorage(session);
  return viewSql(ws.schema, ws.monumentView);
}

function workspaceArchiveViewSql(session) {
  const ws = getWorkspaceStorage(session);
  return viewSql(ws.schema, ws.archiveView);
}

function workspaceArchiveAppViewSql(session) {
  const ws = getWorkspaceStorage(session);
  return viewSql(ws.schema, ws.archiveAppView);
}

function workspaceSourceSchemaSql(session) {
  return sqlLiteral(getWorkspaceStorage(session).schema);
}

function workspaceStorageScopeSql(session) {
  return sqlLiteral(getWorkspaceStorage(session).storageScope);
}

function workspaceSourceTable(resourceType) {
  if (resourceType === "monument") return "CAAL_Monuments";
  if (resourceType === "archive") return "CAAL_Archive";
  throw new Error(`Unsupported resource type: ${resourceType}`);
}

function workspaceSourceTableSql(resourceType) {
  return sqlLiteral(workspaceSourceTable(resourceType));
}

function storageScopeForSession(session) {
  const ws = getWorkspaceStorage(session);
  return ws.storageScope;
}

function storageFromScope(storageScope) {
  const wanted = String(storageScope || "").trim().toLowerCase();

  const match = Object.entries(WORKSPACE_STORAGE).find(([, config]) => {
    return String(config.storageScope).toLowerCase() === wanted;
  });

  if (!match) {
    return null;
  }

  const [workspaceCode, config] = match;

  return {
    workspaceCode,
    ...config
  };
}

function tableSqlForStorageScope(storageScope, resourceType) {
  const storage = storageFromScope(storageScope);

  if (!storage) {
    throw new Error(`Unsupported storage_scope: ${storageScope || "(blank)"}`);
  }

  const table =
    resourceType === "monument"
      ? storage.monumentTable
      : resourceType === "archive"
        ? storage.archiveTable
        : null;

  if (!table) {
    throw new Error(`Unsupported resource type: ${resourceType}`);
  }

  return tableSql(storage.schema, table);
}

function inferRecordWorkspaceCodeFromPayload(payload, currentSession) {
  const sessionWorkspaceCode = getSessionWorkspaceCode(currentSession);

  // National users always create into their own national workspace.
  if (sessionWorkspaceCode && sessionWorkspaceCode !== "caal") {
    return sessionWorkspaceCode;
  }

  // CAAL users create into the national workspace inferred from the record.
  const country = String(payload["Country"] || "")
    .trim()
    .toLowerCase();

  const countryToWorkspace = {
    kazakhstan: "kz",
    "казахстан": "kz",

    kyrgyzstan: "kg",
    "кыргызстан": "kg",
    "киргизия": "kg",

    tajikistan: "tj",
    "таджикистан": "tj",

    turkmenistan: "tm",
    "туркменистан": "tm",

    uzbekistan: "uz",
    "узбекистан": "uz"
  };

  return countryToWorkspace[country] || null;
}

function storageForWorkspaceCode(workspaceCode) {
  const code = String(workspaceCode || "").trim().toLowerCase();
  const storage = WORKSPACE_STORAGE[code];

  if (!storage || storage.enabled !== true) {
    throw new Error(`Workspace is not yet enabled for create: ${code || "(blank)"}`);
  }

  return {
    workspaceCode: code,
    ...storage
  };
}

function monumentTableForWorkspaceCode(workspaceCode) {
  const storage = storageForWorkspaceCode(workspaceCode);
  return tableSql(storage.schema, storage.monumentTable);
}

function archiveTableForWorkspaceCode(workspaceCode) {
  const storage = storageForWorkspaceCode(workspaceCode);
  return tableSql(storage.schema, storage.archiveTable);
}

function storageScopeForWorkspaceCode(workspaceCode) {
  const storage = storageForWorkspaceCode(workspaceCode);
  return storage.storageScope;
}

function isCaalWorkspaceSession(session) {
  return getSessionWorkspaceCode(session) === "caal";
}

function createStorageTargetForRecord(resourceType, payload, currentSession) {
  const recordWorkspaceCode = inferRecordWorkspaceCodeFromPayload(
    payload,
    currentSession
  );

  if (!recordWorkspaceCode) {
    return {
      ok: false,
      error: "A country is required so the record can be assigned to a national workspace"
    };
  }

  const sessionWorkspaceCode = getSessionWorkspaceCode(currentSession);
  const isCaalUser = sessionWorkspaceCode === "caal";

  const table =
    resourceType === "monument"
      ? "CAAL_Monuments"
      : resourceType === "archive"
        ? "CAAL_Archive"
        : null;

  if (!table) {
    return {
      ok: false,
      error: `Unsupported resource type: ${resourceType}`
    };
  }

  /*
    CAAL users write directly to public CAAL tables,
    but the record still keeps its inferred national workspace_code.
  */
  if (isCaalUser) {
    return {
      ok: true,
      resourceType,
      recordWorkspaceCode,
      storageWorkspaceCode: "caal",
      schema: "public",
      table,
      tableSql: tableSql("public", table),
      storageScope: "public_caal",
      sourceScope: "workspace",
      isPublicCaalStorage: true
    };
  }

  /*
    National users continue to write to their configured national workspace.
    Public fallback for unconfigured national workspaces can be added here later.
  */
  try {
    const storage = storageForWorkspaceCode(recordWorkspaceCode);

    return {
      ok: true,
      resourceType,
      recordWorkspaceCode,
      storageWorkspaceCode: recordWorkspaceCode,
      schema: storage.schema,
      table,
      tableSql: tableSql(storage.schema, table),
      storageScope: storage.storageScope,
      sourceScope: "workspace",
      isPublicCaalStorage: storage.storageScope === "public_caal"
    };
  } catch (error) {
    return {
      ok: false,
      error: `Records for this country cannot yet be saved because workspace '${recordWorkspaceCode}' is not configured for web entry.`
    };
  }
}

function enabledWorkspaceStorageConfigs() {
  return Object.entries(WORKSPACE_STORAGE)
    .filter(([workspaceCode, config]) => {
      return (
        workspaceCode !== "caal" &&
        config?.enabled === true &&
        config?.schema
      );
    })
    .map(([workspaceCode, config]) => ({
      workspaceCode,
      ...config
    }));
}

module.exports = {
  WORKSPACE_STORAGE,
  getSessionWorkspaceCode,
  getWorkspaceStorage,
  quoteIdent,
  sqlLiteral,
  tableSql,
  viewSql,
  workspaceMonumentTableSql,
  workspaceArchiveTableSql,
  workspaceMonumentViewSql,
  workspaceArchiveViewSql,
  workspaceArchiveAppViewSql,
  workspaceSourceSchemaSql,
  workspaceStorageScopeSql,
  workspaceSourceTable,
  workspaceSourceTableSql,
  storageScopeForSession,
  storageFromScope,
  tableSqlForStorageScope,
  inferRecordWorkspaceCodeFromPayload,
  storageForWorkspaceCode,
  monumentTableForWorkspaceCode,
  archiveTableForWorkspaceCode,
  storageScopeForWorkspaceCode,
  isCaalWorkspaceSession,
  createStorageTargetForRecord,
  enabledWorkspaceStorageConfigs
};