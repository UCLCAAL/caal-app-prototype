const pool = require("../db");

const MATERIALIZED_VIEWS = [
  "ui.mv_monuments_caal",
  "kz.mv_archive_combined"
];

async function refreshView(viewName) {
  console.log(`[MV refresh] Refreshing ${viewName}...`);

  await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
  await pool.query(`ANALYZE ${viewName}`);

  console.log(`[MV refresh] Done ${viewName}`);
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