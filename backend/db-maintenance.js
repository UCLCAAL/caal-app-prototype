// db-maintenance.js — pool for long-running maintenance (cron refreshes).
// NO statement_timeout: CONCURRENTLY refreshes and the boundary rebuild
// legitimately run for minutes.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,   // same source as db.js
  ssl: { rejectUnauthorized: false },           // match db.js exactly
  max: 3,
  statement_timeout: 0
});

module.exports = pool;