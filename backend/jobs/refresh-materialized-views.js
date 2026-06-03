const pool = require("../db");

const MATERIALIZED_VIEWS = [
  {
    name: "ui.mv_monuments_caal",
    cacheKey: "monuments_caal_cache"
  },
  {
    name: "ui.mv_monuments_caal_list",
    cacheKey: "monuments_caal_list_cache"
  },
  {
    name: "ui.mv_archive_caal_app",
    cacheKey: "archive_caal_cache"
  }
];

async function refreshView(viewConfig) {
  const viewName =
    typeof viewConfig === "string"
      ? viewConfig
      : viewConfig.name;

  const cacheKey =
    typeof viewConfig === "string"
      ? viewConfig
      : viewConfig.cacheKey;

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

  console.log(`[MV refresh] Done ${viewName}`);
}

async function rebuildMonumentAdminBoundaryMembership() {
  console.log("[MV refresh] Rebuilding ui.monument_admin_boundary_membership...");

  await pool.query(`
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

  await pool.query("BEGIN");

  try {
    await pool.query(`TRUNCATE ui.monument_admin_boundary_membership`);

    await pool.query(`
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

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  await pool.query(`ANALYZE ui.monument_admin_boundary_membership`);

  await pool.query(
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

  console.log("[MV refresh] Done ui.monument_admin_boundary_membership");
}

async function main() {
  const startedAt = new Date();

  console.log(`[MV refresh] Started at ${startedAt.toISOString()}`);

  let failed = false;

  for (const viewConfig of MATERIALIZED_VIEWS) {
    const viewName =
      typeof viewConfig === "string"
        ? viewConfig
        : viewConfig.name;

    try {
      await refreshView(viewConfig);
    } catch (error) {
      failed = true;
      console.error(`[MV refresh] Failed for ${viewName}:`);
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