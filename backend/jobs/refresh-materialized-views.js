const pool = require("../db-maintenance");

// Arbitrary but fixed lock ID for this job. Any process using the same
// number contends for the same lock, preventing overlapping refresh runs.
const REFRESH_LOCK_ID = 823401;

// Safety bound for change-check skips: even if no Tstamp change is detected,
// force a refresh when the last one is older than this. Covers changes the
// Tstamp check cannot see (row DELETEs, thesaurus/lookup edits that alter
// resolved labels without touching source-row timestamps).
const MAX_SKIP_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

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
    (SELECT max("Tstamp") FROM kz."CAAL_Vernacular")
  ) > (
    SELECT refreshed_at FROM ui.app_cache_status
    WHERE cache_key = 'resource_viewer_base_cache'
  ) AS changed
`;

// Change-check for the monuments family (grid base reads public.CAAL_Monuments).
const MONUMENTS_CHANGED_SQL = `
  SELECT (SELECT max("Tstamp") FROM public."CAAL_Monuments") > (
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
  { name: "ui.mv_resource_viewer_survey_grid_map",  cacheKey: "resource_viewer_survey_grid_map_cache",  dependsOn: "ui.mv_resource_viewer_base" }
];

// Tracks which views were actually refreshed this run (vs skipped), so
// dependents and the boundary rebuild can skip in sympathy.
const refreshedThisRun = new Set();
const skippedThisRun = new Set();

async function cacheAgeMs(cacheKey) {
  const { rows } = await pool.query(
    `SELECT extract(epoch FROM (now() - refreshed_at)) * 1000 AS age_ms
     FROM ui.app_cache_status WHERE cache_key = $1`,
    [cacheKey]
  );
  if (!rows.length || rows[0].age_ms === null) return Infinity;
  return Number(rows[0].age_ms);
}

async function shouldSkip(viewConfig) {
  const { name, cacheKey, changeCheck, dependsOn } = viewConfig;

  // Skip if the view this one derives from was skipped this run.
  if (dependsOn && skippedThisRun.has(dependsOn)) {
    console.log(`[MV refresh] Skipping ${name} (${dependsOn} was skipped)`);
    return true;
  }
  // If the dependency was refreshed, this one must refresh too.
  if (dependsOn && refreshedThisRun.has(dependsOn)) return false;

  if (!changeCheck) return false;

  // Staleness bound: never skip past MAX_SKIP_AGE_MS, so deletes and
  // thesaurus edits (invisible to Tstamp checks) are picked up within 6h.
  const ageMs = await cacheAgeMs(cacheKey);
  if (ageMs > MAX_SKIP_AGE_MS) return false;

  const { rows } = await pool.query(changeCheck);
  const changed = rows.length > 0 && rows[0].changed === true;

  if (!changed) {
    console.log(`[MV refresh] Skipping ${name} (no source changes since last refresh)`);
    return true;
  }
  return false;
}

async function refreshView(viewConfig) {
  const { name: viewName, cacheKey } = viewConfig;

  if (await shouldSkip(viewConfig)) {
    skippedThisRun.add(viewName);
    return;
  }

  console.log(`[MV refresh] Refreshing ${viewName}...`);

  await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
  await pool.query(`ANALYZE ${viewName}`);

  if (cacheKey) {
    await pool.query(
      `
      INSERT INTO ui.app_cache_status (
        cache_key,
        refreshed_at,
        refreshed_by,
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
        refreshed_at = EXCLUDED.refreshed_at,
        refreshed_by = EXCLUDED.refreshed_by,
        note = EXCLUDED.note
      `,
      [
        cacheKey,
        `${viewName} refreshed by materialized-view cron job`
      ]
    );
  }

  refreshedThisRun.add(viewName);
  console.log(`[MV refresh] Done ${viewName}`);
}

async function rebuildMonumentAdminBoundaryMembership() {
  // Membership derives from mv_monuments_caal; if monuments was skipped
  // this run, membership cannot have changed either.
  if (skippedThisRun.has("ui.mv_monuments_caal")) {
    console.log("[MV refresh] Skipping ui.monument_admin_boundary_membership (monuments MV was skipped)");
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

    await client.query(
      `
      INSERT INTO ui.app_cache_status (
        cache_key,
        refreshed_at,
        refreshed_by,
        note
      )
      VALUES (
        'monument_admin_boundary_membership',
        now(),
        'cron',
        'Monument admin boundary membership rebuilt by materialized-view cron job'
      )
      ON CONFLICT (cache_key)
      DO UPDATE SET
        refreshed_at = EXCLUDED.refreshed_at,
        refreshed_by = EXCLUDED.refreshed_by,
        note = EXCLUDED.note
      `
    );
  } finally {
    client.release();
  }

  console.log("[MV refresh] Done ui.monument_admin_boundary_membership");
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