const express = require("express");
const pool = require("./db");
const { normaliseLanguage, resolveLabelWithFallback } = require("./session");

const router = express.Router();

/*
  Replace these view names with your real ones where needed.
  The important pattern is:
  - each lookup type is whitelisted
  - each query returns multilingual columns
  - labels are resolved with backend fallback
*/
const MONUMENT_LOOKUP_VIEWS = {
  country: "ui.v_lkp_countries",
  classification: "ui.v_lkp_classifications",
  designation: "ui.v_lkp_designation_type",
  religion: "ui.v_lkp_religion",
  monument_type: "ui.v_lkp_site_types_context",
  cultural_period: "ui.v_lkp_cultural_periods_context",
  location_confidence: "ui.v_lkp_loc_acc_ass",
  admin_subdivision_type: "ui.v_lkp_admin_type",
  measurement_unit: "ui.v_lkp_unit_of_measurement",
  measurement_type: "ui.v_lkp_measurement_type"
};

const ARCHIVE_LOOKUP_VIEWS = {
  level: "ui.v_lkp_level",
  related_country: "ui.v_lkp_countries",
  related_religion: "ui.v_lkp_religion",
  related_subject: "ui.v_lkp_subjects",
  content_type: "ui.v_lkp_content_types",
  language: "ui.v_lkp_languages_abridged",
  script: "ui.v_lkp_scripts",
  writing_system: "ui.v_lkp_writing_systems",
  format: "ui.v_lkp_digital_file_formats",
  colour: "ui.v_lkp_colour",
  copyright_status: "ui.v_lkp_copyright_status",
  size_dimensions_original_material: "ui.v_lkp_size_dimensions_original_material",
  condition_original_material: "ui.v_lkp_condition"
};

function getLookupViewsForPage(page) {
  switch (String(page || "").trim().toLowerCase()) {
    case "monuments":
      return MONUMENT_LOOKUP_VIEWS;
    case "archive":
      return ARCHIVE_LOOKUP_VIEWS;
    default:
      return null;
  }
}

async function fetchLookupSet(viewName, requestedLanguage, { preferCanonical = false } = {}) {
  const result = await pool.query(
    `
    SELECT *
    FROM ${viewName}
    `
  );

  const items = result.rows.map((row) => {
    const value = preferCanonical
    ? (
        row.canonical_value ??
        row.concept_id ??
        row.id ??
        row.label_name ??
        null
      )
    : (
        row.concept_id ??
        row.canonical_value ??
        row.id ??
        row.label_name ??
        null
      );

    return {
      value,
      label: resolveLabelWithFallback(row, requestedLanguage, value),
      raw: row
    };
  });

  items.sort((a, b) => {
    const sortA = a.raw?.sort_order ?? Number.MAX_SAFE_INTEGER;
    const sortB = b.raw?.sort_order ?? Number.MAX_SAFE_INTEGER;

    if (sortA !== sortB) {
      return sortA - sortB;
    }

    return String(a.label ?? "").localeCompare(String(b.label ?? ""));
  });

  return items;
}

function fallbackLookupLanguage(lang) {
  return ["kk", "ky", "tg", "tk", "uz"].includes(lang) ? "ru" : "en";
}

async function fetchHierarchicalLookupTree({
  viewName,
  requestedLanguage,
  includeDates = false
}) {
  const safeLang = normaliseLanguage(requestedLanguage || "en");
  const fallbackLang = fallbackLookupLanguage(safeLang);

  const dateColumnsSql = includeDates
    ? `,
      date_range,
      date_from,
      date_to
    `
    : "";

  const result = await pool.query(`
    SELECT
      concept_id,
      canonical_value,
      parent_id,
      level,
      sort_order,

      label_en,
      label_ru,
      label_zh,
      label_kk,
      label_ky,
      label_tg,
      label_tk,
      label_uz,

      display_en,
      display_ru,
      display_zh,
      display_kk,
      display_ky,
      display_tg,
      display_tk,
      display_uz

      ${dateColumnsSql}
    FROM ${viewName}
    ORDER BY
      parent_id NULLS FIRST,
      sort_order NULLS LAST,
      canonical_value
  `);

  return result.rows.map((row) => {
    const value =
      row.canonical_value ??
      row.concept_id ??
      null;

    const label =
      row[`label_${safeLang}`] ||
      row[`label_${fallbackLang}`] ||
      row.label_en ||
      row.display_en ||
      value;

    const chipLabel =
      row[`display_${safeLang}`] ||
      row[`display_${fallbackLang}`] ||
      row.display_en ||
      label ||
      value;

    return {
      value,
      concept_id: row.concept_id,
      parent_id: row.parent_id,
      level: row.level,
      sort_order: row.sort_order,
      label,
      chip_label: chipLabel,
      date_range: includeDates ? row.date_range : null,
      date_from: includeDates ? row.date_from : null,
      date_to: includeDates ? row.date_to : null,
      raw: row
    };
  });
}

router.get("/:page", async (req, res) => {
  const page = String(req.params.page || "").trim().toLowerCase();
  const requestedLanguage = normaliseLanguage(req.query.lang || req.query.language || "en");

  const lookupViews = getLookupViewsForPage(page);

  if (!lookupViews) {
    return res.status(400).json({
      ok: false,
      error: "Unsupported page. Use /api/lookups/monuments or /api/lookups/archive"
    });
  }

  try {
      const payload = {};

      for (const [lookupName, viewName] of Object.entries(lookupViews)) {
        payload[lookupName] = await fetchLookupSet(
          viewName,
          requestedLanguage,
          {
            preferCanonical: page === "archive"
          }
        );
      }

      if (page === "monuments") {
        payload.monument_type_tree = await fetchHierarchicalLookupTree({
          viewName: "ui.v_lkp_site_types_context",
          requestedLanguage,
          includeDates: false
        });

        payload.cultural_period_tree = await fetchHierarchicalLookupTree({
          viewName: "ui.v_lkp_cultural_periods_context",
          requestedLanguage,
          includeDates: true
        });
      }

      return res.json({
        ok: true,
        page,
        language: requestedLanguage,
        lookups: payload
      });
    } catch (error) {
    console.error("Lookup loading failed:");
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Failed to load lookups",
      detail: error.message
    });
  }
});

module.exports = router;