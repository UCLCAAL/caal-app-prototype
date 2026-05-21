const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,

  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 15000)
});

if (process.env.DB_POOL_DEBUG === "true") {
  pool.on("connect", () => {
    console.log("[PG pool] client connected");
  });

  pool.on("acquire", () => {
    console.log("[PG pool] client acquired");
  });

  pool.on("remove", () => {
    console.log("[PG pool] client removed");
  });

  setInterval(() => {
    console.log("[PG pool stats]", {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    });
  }, Number(process.env.DB_POOL_DEBUG_INTERVAL_MS || 30000));
}

module.exports = pool;