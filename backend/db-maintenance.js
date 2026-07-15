// db-maintenance.js — pool for long-running maintenance (cron refreshes).
// NO statement_timeout: CONCURRENTLY refreshes and the boundary rebuild
// legitimately run for minutes.

require("dotenv").config({ quiet: true });

const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL || "";

const host =
  process.env.PGHOST ||
  process.env.DB_HOST ||
  "";

const isLocalDatabase =
  databaseUrl.includes("localhost") ||
  databaseUrl.includes("127.0.0.1") ||
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "";

const ssl = isLocalDatabase
  ? false
  : { rejectUnauthorized: false };

console.log("[db-maintenance]", {
  hasDatabaseUrl: !!databaseUrl,
  host: host || "(not set)",
  isLocalDatabase,
  ssl: ssl ? "on" : "off"
});

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl,
      max: 3,
      statement_timeout: 0
    }
  : {
      host: host || "localhost",
      port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
      database: process.env.PGDATABASE || process.env.DB_NAME,
      user: process.env.PGUSER || process.env.DB_USER,
      password: String(
        process.env.PGPASSWORD ||
        process.env.DB_PASSWORD ||
        process.env.POSTGRES_PASSWORD ||
        ""
      ),
      ssl,
      max: 3,
      statement_timeout: 0
    };

const pool = new Pool(poolConfig);

module.exports = pool;