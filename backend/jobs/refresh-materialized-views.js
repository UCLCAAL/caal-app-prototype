const pool = require("../db-maintenance");

// Arbitrary but fixed lock ID for this job. Any process using the same
// number contends for the same lock, preventing overlapping refresh runs.
const REFRESH_LOCK_ID = 823401;

// Safety bound for change-check skips: even if no Tstamp change is detected,
// force a refresh when the last one is older than this. Covers changes the
// Tstamp check cannot see (row DELETEs, thesaurus/lookup edits that alter
// resolved labels without touching source-row timestamps).
const MAX_SKIP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const FORCE_REFRESH_HOUR_UTC = 2; // overnight UTC

// Change-check for the resource viewer family: any source row edited since
// the last recorded refresh of the base cache?
const VIEWER_SOURCES_CHANGED_SQL = `
  SELECT GREATEST(
    (SELECT max("Tstamp") FROM public."CAAL_RS3_Poly"),
    (SELECT max("Tstamp") FROM kz."CAAL_RS3_Poly"),
    (SELECT max("Tstamp") FROM public."CAAL_RS3_Line"),
    (SELECT max("Tstamp") FROM kz."CAAL_RS3_Line"),
    (SELECT max("Tstamp") FROM public."CAAL_RS3_Group"),
    (SELECT max("Tstamp") FROM kz."CAAL_RS3_Group"),
    (SELECT max("Tstamp") FROM public."CAAL_Institution"),
    (SELECT max("Tstamp") FROM kz."CAAL_Institution"),
    (SELECT max("Tstamp") FROM public."CAAL_Vernacular"),
    (SELECT max("Tstamp") FROM kz."CAAL_Vernacular"),

    (SELECT max("Tstamp") FROM public."CAAL_Monuments"),
    (SELECT max("Tstamp") FROM kz."CAAL_Monuments"),

    (SELECT max("Tstamp") FROM public."CAAL_Archive"),
    (SELECT max("Tstamp") FROM kz."CAAL_Archive"),

    (SELECT max("Tstamp") FROM public."CAAL_Datasets"),
    (SELECT max("Tstamp") FROM public."CAAL_Cartography")
  ) > (
    SELECT refreshed_at FROM ui.app_cache_status
    WHERE cache_key = 'resource_viewer_base_cache'
  ) AS changed
`;

// Change-check for the monuments family (grid base reads public.CAAL_Monuments).
const MONUMENTS_CHANGED_SQL = `
  SELECT GREATEST(
    (SELECT max("Tstamp") FROM public."CAAL_Monuments"),
    (SELECT max("Tstamp") FROM kz."CAAL_Monuments")
  ) > (
    SELECT refreshed_at FROM ui.app_cache_status
    WHERE cache_key = 'monuments_caal_cache'
  ) AS changed
`;

const MATERIALIZED_VIEWS = [
  // --------------------------------------------------------------------
  // Lookup match MVs. Tiny (milliseconds each); always refreshed so that
  // thesaurus edits propagate. MUST come before their consumers.
  // --------------------------------------------------------------------
  { name: "ui.mv_lkp_country_match",           cacheKey: "lkp_country_match_cache" },
  { name: "ui.mv_lkp_site_type_match",         cacheKey: "lkp_site_type_match_cache" },
  { name: "ui.mv_lkp_site_type_display_match", cacheKey: "lkp_site_type_display_match_cache" },
  { name: "ui.mv_lkp_classification_match",    cacheKey: "lkp_classification_match_cache" },
  { name: "ui.mv_lkp_religion_match",          cacheKey: "lkp_religion_match_cache" },
  { name: "ui.mv_lkp_cultural_period_match",   cacheKey: "lkp_cultural_period_match_cache" },
  { name: "ui.mv_lkp_loc_conf_match",          cacheKey: "lkp_loc_conf_match_cache" },
  { name: "ui.mv_lkp_admin_type_match",        cacheKey: "lkp_admin_type_match_cache" },
  { name: "ui.mv_lkp_meas_unit_match",         cacheKey: "lkp_meas_unit_match_cache" },
  { name: "ui.mv_lkp_meas_type_match",         cacheKey: "lkp_meas_type_match_cache" },
  { name: "ui.mv_lkp_designation_match",       cacheKey: "lkp_designation_match_cache" },

  // --------------------------------------------------------------------
  // Monuments family.
  // --------------------------------------------------------------------
  {
    name: "ui.mv_monuments_caal",
    cacheKey: "monuments_caal_cache",
    changeCheck: MONUMENTS_CHANGED_SQL
  },
  {
    name: "ui.mv_monuments_caal_list",
    cacheKey: "monuments_caal_list_cache",
    dependsOn: "ui.mv_monuments_caal"
  },

  // --------------------------------------------------------------------
  // Archive + shared search caches (no change-check yet; add one when the
  // archive source tables have Tstamp columns).
  // --------------------------------------------------------------------
  { name: "ui.mv_archive_caal_app",        cacheKey: "archive_caal_cache" },
  { name: "ui.mv_resource_identity",       cacheKey: "resource_identity_cache" },
  { name: "ui.mv_resource_related_search", cacheKey: "resource_related_search_cache" },

  // --------------------------------------------------------------------
  // Resource Viewer family. Base must refresh before per-layer map MVs;
  // map MVs are skipped automatically when the base is skipped.
  // --------------------------------------------------------------------
  {
    name: "ui.mv_resource_viewer_base",
    cacheKey: "resource_viewer_base_cache",
    changeCheck: VIEWER_SOURCES_CHANGED_SQL
  },
  { name: "ui.mv_resource_viewer_rs3_poly_map",     cacheKey: "resource_viewer_rs3_poly_map_cache",     dependsOn: "ui.mv_resource_viewer_base" },
  { name: "ui.mv_resource_viewer_rs3_line_map",     cacheKey: "resource_viewer_rs3_line_map_cache",     dependsOn: "ui.mv_resource_viewer_base" },
  { name: "ui.mv_resource_viewer_rs3_group_map",    cacheKey: "resource_viewer_rs3_group_map_cache",    dependsOn: "ui.mv_resource_viewer_base" },
  { name: "ui.mv_resource_viewer_institution_map",  cacheKey: "resource_viewer_institution_map_cache",  dependsOn: "ui.mv_resource_viewer_base" },
  { name: "ui.mv_resource_viewer_vernacular_map",   cacheKey: "resource_viewer_vernacular_map_cache",   dependsOn: "ui.mv_resource_viewer_base" },
  { name: "ui.mv_resource_viewer_monument_map",     cacheKey: "resource_viewer_monument_map_cache",     dependsOn: "ui.mv_resource_viewer_base" },
  { name: "ui.mv_resource_viewer_dataset_map",      cacheKey: "resource_viewer_dataset_map_cache",      dependsOn: "ui.mv_resource_viewer_base" },
  { name: "ui.mv_resource_viewer_cartography_map",  cacheKey: "resource_viewer_cartography_map_cache",  dependsOn: "ui.mv_resource_viewer_base" },
  { name: "ui.mv_resource_viewer_survey_grid_region_map", cacheKey: "resource_viewer_survey_grid_region_map_cache", dependsOn: "ui.mv_resource_viewer_base" },
  { name: "ui.mv_resource_viewer_survey_grid_map",  cacheKey: "resource_viewer_survey_grid_map_cache",  dependsOn: "ui.mv_resource_viewer_base" }

];

// Tracks which views were actually refreshed this run (vs skipped), so
// dependents and the boundary rebuild can skip in sympathy.
const refreshedThisRun = new Set();
const skippedThisRun = new Set();
const failedThisRun = new Set();

async function cacheAgeMs(cacheKey) {
  const { rows } = await pool.query(
    `SELECT extract(epoch FROM (now() - refreshed_at)) * 1000 AS age_ms
     FROM ui.app_cache_status WHERE cache_key = $1`,
    [cacheKey]
  );
  if (!rows.length || rows[0].age_ms === null) return Infinity;
  return Number(rows[0].age_ms);
}

function isOvernightForceRefreshWindow(now = new Date()) {
  return now.getUTCHours() === FORCE_REFRESH_HOUR_UTC;
}

async function shouldSkip(viewConfig) {
  const { name, cacheKey, changeCheck, dependsOn } = viewConfig;

  // Skip if the view this one derives from failed this run.
  if (dependsOn && failedThisRun.has(dependsOn)) {
    console.log(`[MV refresh] Skipping ${name} (${dependsOn} failed this run)`);
    return true;
  }

  // Skip if the view this one derives from was skipped this run.
  if (dependsOn && skippedThisRun.has(dependsOn)) {
    console.log(`[MV refresh] Skipping ${name} (${dependsOn} was skipped)`);
    return true;
  }

  // If the dependency was refreshed, this one must refresh too.
  if (dependsOn && refreshedThisRun.has(dependsOn)) return false;

  if (!changeCheck) return false;

  // Staleness bound: only force heavy refreshes in the overnight window.
  // This still catches deletes / lookup edits, but avoids surprise heavy
  // refreshes during daytime hourly runs.
  const ageMs = await cacheAgeMs(cacheKey);

  if (ageMs > MAX_SKIP_AGE_MS && isOvernightForceRefreshWindow()) {
    console.log(`[MV refresh] Forcing ${name}; cache age exceeds overnight threshold`);
    return false;
  }

  const { rows } = await pool.query(changeCheck);
  const changed = rows.length > 0 && rows[0].changed === true;

  if (!changed) {
    console.log(`[MV refresh] Skipping ${name} (no source changes since last refresh)`);
    return true;
  }
  return false;
}

async function markCacheChecked(cacheKey, note) {
  if (!cacheKey) return;

  await pool.query(
    `
    INSERT INTO ui.app_cache_status (
      cache_key,
      checked_at,
      checked_by,
      note
    )
    VALUES (
      $1,
      now(),
      'cron',
      $2
    )
    ON CONFLICT (cache_key)
    DO UPDATE SET
      checked_at = EXCLUDED.checked_at,
      checked_by = EXCLUDED.checked_by,
      note = EXCLUDED.note
    `,
    [
      cacheKey,
      note || `${cacheKey} checked by materialized-view cron job`
    ]
  );
}

async function markCacheRefreshed(cacheKey, viewName) {
  if (!cacheKey) return;

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
      now(),
      'cron',
      now(),
      'cron',
      $2
    )
    ON CONFLICT (cache_key)
    DO UPDATE SET
      refreshed_at = EXCLUDED.refreshed_at,
      refreshed_by = EXCLUDED.refreshed_by,
      checked_at = EXCLUDED.checked_at,
      checked_by = EXCLUDED.checked_by,
      note = EXCLUDED.note
    `,
    [
      cacheKey,
      `${viewName} refreshed by materialized-view cron job`
    ]
  );
}

async function refreshView(viewConfig) {
  const { name: viewName, cacheKey } = viewConfig;

  if (await shouldSkip(viewConfig)) {
    skippedThisRun.add(viewName);

    await markCacheChecked(
      cacheKey,
      `${viewName} checked by materialized-view cron job; refresh skipped because cache is current`
    );

    return;
  }

  console.log(`[MV refresh] Refreshing ${viewName}...`);

  await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
  await pool.query(`ANALYZE ${viewName}`);

  await markCacheRefreshed(cacheKey, viewName);

  refreshedThisRun.add(viewName);
  console.log(`[MV refresh] Done ${viewName}`);
}

async function rebuildMonumentAdminBoundaryMembership() {
  // Membership derives from mv_monuments_caal; if monuments was skipped
  // this run, membership cannot have changed either.
  if (skippedThisRun.has("ui.mv_monuments_caal")) {
    console.log("[MV refresh] Skipping ui.monument_admin_boundary_membership (monuments MV was skipped)");

    await markCacheChecked(
      "monument_admin_boundary_membership",
      "Monument admin boundary membership checked by materialized-view cron job; rebuild skipped because monuments cache is current"
    );

    return;
  }

  console.log("[MV refresh] Rebuilding ui.monument_admin_boundary_membership...");

  // TEMP TABLE + TRUNCATE/INSERT must share one connection: temp tables are
  // session-scoped and pool.query may hop connections between statements.
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TEMP TABLE tmp_monument_admin_boundary_membership AS
      SELECT
        m."CAAL_ID" AS caal_id,
        m.id AS monument_id,
        b.boundary_id,
        b.admin_level,
        b.source,
        b.country_iso3,
        now() AS matched_at
      FROM ui.mv_monuments_caal m
      JOIN ui.mv_admin_boundaries_map b
        ON ST_Intersects(
          ST_SetSRID(ST_MakePoint(m."Longitude", m."Latitude"), 4326),
          b.geom
        )
      WHERE m."CAAL_ID" IS NOT NULL
        AND m."Longitude" IS NOT NULL
        AND m."Latitude" IS NOT NULL
    `);

    await client.query("BEGIN");

    try {
      await client.query(`TRUNCATE ui.monument_admin_boundary_membership`);

      await client.query(`
        INSERT INTO ui.monument_admin_boundary_membership (
          caal_id,
          monument_id,
          boundary_id,
          admin_level,
          source,
          country_iso3,
          matched_at
        )
        SELECT
          caal_id,
          monument_id,
          boundary_id,
          admin_level,
          source,
          country_iso3,
          matched_at
        FROM tmp_monument_admin_boundary_membership
      `);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    await client.query(`ANALYZE ui.monument_admin_boundary_membership`);
  } finally {
    client.release();
  }

  await markCacheRefreshed(
    "monument_admin_boundary_membership",
    "ui.monument_admin_boundary_membership"
  );

  console.log("[MV refresh] Done ui.monument_admin_boundary_membership");
}

async function rebuildResourceAdminBoundaryMembership() {
  // Derives from mv_resource_viewer_base; if the base was skipped or failed
  // this run, membership cannot be safely rebuilt.
  if (
    skippedThisRun.has("ui.mv_resource_viewer_base") ||
    failedThisRun.has("ui.mv_resource_viewer_base")
  ) {
    console.log("[MV refresh] Skipping ui.resource_admin_boundary_membership (viewer base skipped or failed)");

    await markCacheChecked(
      "resource_admin_boundary_membership",
      "Resource admin boundary membership checked by materialized-view cron job; rebuild skipped because viewer base cache was skipped or failed"
    );

    return;
  }

  console.log("[MV refresh] Rebuilding ui.resource_admin_boundary_membership...");

  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TEMP TABLE tmp_resource_admin_boundary_membership AS
      SELECT
        b.record_type,
        b.source_schema,
        b.source_table,
        b.source_row_id,
        b.caal_id,
        ab.boundary_id::text AS boundary_id,
        ab.admin_level,
        ab.country_iso3,
        now() AS matched_at
      FROM ui.mv_resource_viewer_base b
      JOIN ui.mv_admin_boundaries_map ab
        ON ST_Intersects(b.centroid_4326, ab.geom)
      WHERE b.centroid_4326 IS NOT NULL
    `);

    await client.query("BEGIN");

    try {
      await client.query(`TRUNCATE ui.resource_admin_boundary_membership`);

      await client.query(`
        INSERT INTO ui.resource_admin_boundary_membership (
          record_type,
          source_schema,
          source_table,
          source_row_id,
          caal_id,
          boundary_id,
          admin_level,
          country_iso3,
          matched_at
        )
        SELECT
          record_type,
          source_schema,
          source_table,
          source_row_id,
          caal_id,
          boundary_id,
          admin_level,
          country_iso3,
          matched_at
        FROM tmp_resource_admin_boundary_membership
      `);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    await client.query(`ANALYZE ui.resource_admin_boundary_membership`);
  } finally {
    client.release();
  }

  await markCacheRefreshed(
    "resource_admin_boundary_membership",
    "ui.resource_admin_boundary_membership"
  );

  console.log("[MV refresh] Done ui.resource_admin_boundary_membership");
}

async function main() {
  const startedAt = new Date();

  console.log(`[MV refresh] Started at ${startedAt.toISOString()}`);

  // Dedicated connection to hold the advisory lock for the whole run.
  // Advisory locks are session-scoped; pool.query would hop connections.
  const lockClient = await pool.connect();

  let failed = false;

  try {
    const lockResult = await lockClient.query(
      "SELECT pg_try_advisory_lock($1) AS ok",
      [REFRESH_LOCK_ID]
    );

    if (!lockResult.rows[0].ok) {
      console.log("[MV refresh] Previous run still active, skipping this run.");
      lockClient.release();
      await pool.end();
      process.exit(0);
    }

    for (const viewConfig of MATERIALIZED_VIEWS) {
      try {
        await refreshView(viewConfig);
      } catch (error) {
        failed = true;
        failedThisRun.add(viewConfig.name);

        console.error(`[MV refresh] Failed for ${viewConfig.name}:`);
        console.error(error);
      }
    }

    try {
      await rebuildMonumentAdminBoundaryMembership();
    } catch (error) {
      failed = true;
      console.error("[MV refresh] Failed rebuilding ui.monument_admin_boundary_membership:");
      console.error(error);
    }
    try {
      await rebuildResourceAdminBoundaryMembership();
    } catch (error) {
      failed = true;
      console.error("[MV refresh] Failed rebuilding ui.resource_admin_boundary_membership:");
      console.error(error);
    }
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [REFRESH_LOCK_ID]);
    } catch (error) {
      console.error("[MV refresh] Failed to release advisory lock:");
      console.error(error);
    }
    lockClient.release();
  }

  try {
    await pool.end();
  } catch (error) {
    console.error("[MV refresh] Failed to close database pool:");
    console.error(error);
  }

  const finishedAt = new Date();
  console.log(`[MV refresh] Finished at ${finishedAt.toISOString()}`);

  process.exit(failed ? 1 : 0);
}

main();