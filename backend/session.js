const SUPPORTED_LANGUAGES = ["en", "ru", "zh", "kk", "ky", "tg", "tk", "uz"];

/**
 * Normalise language values from app_users / legacy sources into 2-letter codes.
 * Defaults to "en" if unknown.
 */
function normaliseLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (["en", "english"].includes(raw)) return "en";
  if (["ru", "russian", "русский"].includes(raw)) return "ru";
  if (["zh", "chinese", "中文", "chinese simplified", "simplified chinese"].includes(raw)) return "zh";
  if (["kk", "kazakh", "қазақ", "казахский"].includes(raw)) return "kk";
  if (["ky", "kyrgyz", "киргизский", "кыргыз", "кыргызча"].includes(raw)) return "ky";
  if (["tg", "tajik", "таджикский", "тоҷикӣ"].includes(raw)) return "tg";
  if (["tk", "turkmen", "туркменский", "türkmen", "türkmençe"].includes(raw)) return "tk";
  if (["uz", "uzbek", "узбекский", "o'zbek", "o‘zbek", "o`zbek"].includes(raw)) return "uz";

  return "en";
}

/**
 * Returns the ordered fallback chain for a requested language.
 *
 * Project rule:
 * - kk, ky, tg, tk, uz fall back to ru first
 * - ru falls back to en
 * - zh falls back to en
 * - en falls back to raw/canonical
 */
function languageFallbackChain(lang) {
  const code = normaliseLanguage(lang);

  switch (code) {
    case "kk":
    case "ky":
    case "tg":
    case "tk":
    case "uz":
      return [code, "ru", "en"];

    case "ru":
      return ["ru", "en"];

    case "zh":
      return ["zh", "en"];

    case "en":
    default:
      return ["en"];
  }
}

/**
 * Safely get a multilingual field from an object using either:
 * - display_en / display_ru / ...
 * - label_en / label_ru / ...
 *
 * baseName should usually be "display" or "label".
 */
function getLanguageField(record, baseName, lang) {
  if (!record || !baseName || !lang) return null;

  const key = `${baseName}_${lang}`;
  const value = record[key];

  if (value === null || value === undefined) return null;

  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Resolve the best display label for a record using the requested language
 * and the project's fallback policy.
 *
 * It tries, in order:
 * 1. requested language (and fallbacks) from display_*
 * 2. requested language (and fallbacks) from label_*
 * 3. canonical_value
 * 4. en_label
 * 5. raw value supplied by caller
 * 6. null
 *
 * Example:
 * resolveLabelWithFallback(row, "kk")
 */
function resolveLabelWithFallback(record, requestedLanguage, rawValue = null) {
  const lang = normaliseLanguage(requestedLanguage);
  const chain = languageFallbackChain(lang);

  // First prefer display_* columns
  for (const code of chain) {
    const value = getLanguageField(record, "display", code);
    if (value) return value;
  }

  // Then allow label_* columns for any legacy/special cases
  for (const code of chain) {
    const value = getLanguageField(record, "label", code);
    if (value) return value;
  }

  // Then fall back to canonical or English helper fields if present
  if (record && record.canonical_value && String(record.canonical_value).trim() !== "") {
    return String(record.canonical_value).trim();
  }

  if (record && record.en_label && String(record.en_label).trim() !== "") {
    return String(record.en_label).trim();
  }

  if (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== "") {
    return String(rawValue).trim();
  }

  return null;
}

/**
 * Map access levels to browser-safe permission flags.
 * Backend should remain the source of truth for permissions.
 */
function permissionsFromAccessLevel(accessLevel) {
  switch (Number(accessLevel)) {
    case 1:
      return {
        can_view_workspace: true,
        can_edit_workspace: false,
        can_view_national_ref: false,
        can_view_all_caal: false,
        can_edit_caal: false,
        can_delete: false,
        can_promote: false,
        role_label: "read_only"
      };

    case 2:
      return {
        can_view_workspace: true,
        can_edit_workspace: true,
        can_view_national_ref: true,
        can_view_all_caal: false,
        can_edit_caal: false,
        can_delete: false,
        can_promote: false,
        role_label: "workspace_editor_plus_national_ref"
      };

    case 3:
      return {
        can_view_workspace: true,
        can_edit_workspace: true,
        can_view_national_ref: true,
        can_view_all_caal: true,
        can_edit_caal: false,
        can_delete: false,
        can_promote: false,
        role_label: "workspace_editor_plus_all_caal_view"
      };

    case 9:
      return {
        can_view_workspace: true,
        can_edit_workspace: true,
        can_view_national_ref: true,
        can_view_all_caal: true,
        can_edit_caal: true,
        can_delete: false,
        can_promote: true,
        role_label: "caal_admin"
      };

    default:
      return {
        can_view_workspace: false,
        can_edit_workspace: false,
        can_view_national_ref: false,
        can_view_all_caal: false,
        can_edit_caal: false,
        can_delete: false,
        can_promote: false,
        role_label: "unknown"
      };
  }
}

/**
 * Build the clean session object returned by the API from a row in
 * public.v_app_user_session_profile.
 */
function buildSessionFromRow(sessionRow) {
  const preferredLanguage = normaliseLanguage(sessionRow.preferred_language);

  return {
    user: {
      user_id: sessionRow.user_id,
      username: sessionRow.username
    },
    profile: {
      preferred_language: preferredLanguage,
      country: sessionRow.country,
      workspace_code: sessionRow.workspace_code,
      effective_monument_id_prefix: sessionRow.effective_monument_id_prefix,
      effective_archive_id_prefix: sessionRow.effective_archive_id_prefix
    },
    workspace: {
      workspace_label: sessionRow.workspace_label,
      schema_name: sessionRow.schema_name,
      default_country_value: sessionRow.default_country_value
    },
    permissions: permissionsFromAccessLevel(sessionRow.access_level)
  };
}

module.exports = {
  SUPPORTED_LANGUAGES,
  normaliseLanguage,
  languageFallbackChain,
  getLanguageField,
  resolveLabelWithFallback,
  permissionsFromAccessLevel,
  buildSessionFromRow
};