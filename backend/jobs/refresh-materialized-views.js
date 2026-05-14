const pool = require("../db");

const MATERIALIZED_VIEWS = [
  "ui.mv_monuments_caal",
  "ui.mv_monuments_caal_list",
  "kz.mv_archive_combined"
];

async function refreshView(viewName) {
  console.log(`[MV refresh] Refreshing ${viewName}...`);

  await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
  await pool.query(`ANALYZE ${viewName}`);

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

  console.log("[MV refresh] Done ui.monument_admin_boundary_membership");
}

async function main() {
  const startedAt = new Date();

  console.log(`[MV refresh] Started at ${startedAt.toISOString()}`);

  let failed = false;

  for (const viewName of MATERIALIZED_VIEWS) {
    try {
      await refreshView(viewName);
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