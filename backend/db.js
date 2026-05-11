const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,

  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

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
}, 5000);

module.exports = pool;