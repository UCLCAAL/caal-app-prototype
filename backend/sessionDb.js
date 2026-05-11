const { Pool } = require("pg");
require("dotenv").config();

const sessionPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,

  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

module.exports = sessionPool;