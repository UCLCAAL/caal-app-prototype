const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");
const authRoutes = require("./auth");
const uiRoutes = require("./ui");
const lookupRoutes = require("./lookups");
const archiveRoutes = require("./archive");
const monumentsRoutes = require("./monuments");
const recordsRoutes = require("./records");

const app = express();
const PORT = process.env.PORT || 3000;
const appRoot = path.join(__dirname, "..");

// --------------------------------------------------------
// Middleware
// --------------------------------------------------------
app.use(cors({
  origin: process.env.APP_ORIGIN || true,
  credentials: true
}));

app.use(express.json());

app.set("trust proxy", 1);

app.use(session({
  store: new pgSession({
    pool,
    tableName: "user_sessions"
  }),
  secret: process.env.SESSION_SECRET || "change-this-for-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  }
}));

app.use((req, res, next) => {
  console.log("Incoming request:", req.method, req.url);
  console.log("Cookie header:", req.headers.cookie || "[none]");
  console.log("Session ID:", req.sessionID || "[no session id]");
  console.log("Session keys:", req.session ? Object.keys(req.session) : "[no req.session]");
  console.log("appSession present:", !!req.session?.appSession);
  next();
});

// --------------------------------------------------------
// API routes
// --------------------------------------------------------
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS server_time");
    res.json({
      ok: true,
      message: "Backend is running",
      db_time: result.rows[0].server_time
    });
  } catch (error) {
    console.error("Health check failed:");
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Database connection failed",
      detail: error.message
    });
  }
});

app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "server route works" });
});

app.use("/api/auth", authRoutes);
app.use("/api/ui", uiRoutes);
app.use("/api/lookups", lookupRoutes);
app.use("/api/archive", archiveRoutes);
app.use("/api", monumentsRoutes);
app.use("/api/records", recordsRoutes);

// --------------------------------------------------------
// Static frontend
// --------------------------------------------------------
app.use(express.static(appRoot));

app.get("/", (req, res) => {
  res.sendFile(path.join(appRoot, "index.html"));
});

// Optional direct routes for convenience
app.get("/home.html", (req, res) => {
  res.sendFile(path.join(appRoot, "home.html"));
});

app.get("/archive.html", (req, res) => {
  res.sendFile(path.join(appRoot, "archive.html"));
});

app.get("/monuments.html", (req, res) => {
  res.sendFile(path.join(appRoot, "monuments.html"));
});

// --------------------------------------------------------
// Start server
// --------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});