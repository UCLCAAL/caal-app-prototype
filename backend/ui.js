const express = require("express");
const pool = require("./db");
const { normaliseLanguage, resolveLabelWithFallback } = require("./session");

const router = express.Router();

function cleanLabelText(value) {
  if (value === null || value === undefined) return value;

  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function viewNameForPage(page) {
  switch (String(page || "").trim().toLowerCase()) {
    case "monuments":
      return "ui.v_label_monuments";
    case "archive":
      return "ui.v_label_archive";
    default:
      return null;
  }
}

router.get("/labels", async (req, res) => {
  const page = String(req.query.page || "").trim().toLowerCase();
  const requestedLanguage = normaliseLanguage(req.query.lang || req.query.language || "en");

  const viewName = viewNameForPage(page);

  if (!viewName) {
    return res.status(400).json({
      ok: false,
      error: "Unsupported page. Use page=monuments or page=archive"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        label_name,
        display_en,
        display_ru,
        display_zh,
        display_kk,
        display_ky,
        display_tg,
        display_tk,
        display_uz,
        sort_order
      FROM ${viewName}
      ORDER BY sort_order NULLS LAST, label_name
      `
    );

    const labels = {};

    for (const row of result.rows) {
      labels[row.label_name] = cleanLabelText(
        resolveLabelWithFallback(row, requestedLanguage, row.label_name)
      );
    }

    return res.json({
      ok: true,
      page,
      language: requestedLanguage,
      labels
    });
  } catch (error) {
    console.error("UI labels lookup failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load labels",
      detail: error.message
    });
  }
});

router.get("/translations", async (req, res) => {
  const requestedLanguage = normaliseLanguage(
    req.query.lang || req.query.language || "en"
  );

  const fallbackLanguage =
    ["kk", "ky", "tg", "tk", "uz"].includes(requestedLanguage)
      ? "ru"
      : "en";

  try {
    const result = await pool.query(`
      SELECT
        key,
        display_en,
        display_ru,
        display_zh,
        display_kk,
        display_ky,
        display_tg,
        display_tk,
        display_uz
      FROM ui.app_translations
      ORDER BY key
    `);

    const translations = {};

    for (const row of result.rows) {
      translations[row.key] =
        row[`display_${requestedLanguage}`] ||
        row[`display_${fallbackLanguage}`] ||
        row.display_en ||
        row.key;
    }

    return res.json({
      ok: true,
      language: requestedLanguage,
      translations
    });
  } catch (error) {
    console.error("UI translations lookup failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load translations",
      detail: error.message
    });
  }
});

module.exports = router;

