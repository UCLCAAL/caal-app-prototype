const express = require("express");
const pool = require("./db");
const { buildSessionFromRow } = require("./session");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      error: "Username and password are required"
    });
  }

  try {
    const authResult = await pool.query(
      `
      SELECT
        user_id,
        username,
        must_reset_password
      FROM public.app_users
      WHERE username = $1
        AND password_hash = crypt($2, password_hash)
        AND is_enabled = true
      `,
      [username, password]
    );

    if (authResult.rows.length === 0) {
      return res.status(401).json({
        ok: false,
        error: "Invalid username or password"
      });
    }

    const sessionResult = await pool.query(
      `
      SELECT *
      FROM public.v_app_user_session_profile
      WHERE username = $1
        AND user_is_enabled = true
        AND workspace_is_enabled = true
      `,
      [username]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        error: "No active session profile found"
      });
    }

    const sessionData = buildSessionFromRow(sessionResult.rows[0]);

    req.session.appSession = sessionData;

    return res.json({
      ok: true,
      must_reset_password: authResult.rows[0].must_reset_password,
      session: sessionData
    });
  } catch (error) {
    console.error("Login failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Login failed",
      detail: error.message
    });
  }
});

router.get("/session", (req, res) => {
  const currentSession = req.session?.appSession || null;

  if (!currentSession) {
    return res.status(401).json({
      ok: false,
      error: "No active session"
    });
  }

  return res.json({
    ok: true,
    session: currentSession
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        ok: false,
        error: "Logout failed"
      });
    }

    res.clearCookie("connect.sid");

    return res.json({
      ok: true
    });
  });
});

module.exports = router;