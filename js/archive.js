// ========================================================
// ARCHIVE PAGE LOGIC
// Backend-driven version using:
// - session guard
// - DB label translations from ui.v_label_archive
// - archive API records
// ========================================================

// DOM
// --------------------------------------------------------
const archiveSearch = document.getElementById("archiveSearch");
const toggleArchiveFiltersBtn = document.getElementById("toggleArchiveFiltersBtn");
const archiveFiltersPanel = document.getElementById("archiveFiltersPanel");
const clearArchiveFiltersBtn = document.getElementById("clearArchiveFiltersBtn");

const archiveFilterCaalId = document.getElementById("archiveFilterCaalId");
const filterArchiveRelatedCountries = document.getElementById("filterArchiveRelatedCountries");
const filterArchiveRelatedReligions = document.getElementById("filterArchiveRelatedReligions");
const filterArchiveRelatedSubjects = document.getElementById("filterArchiveRelatedSubjects");
const filterArchiveContentType = document.getElementById("filterArchiveContentType");
const filterArchiveLanguages = document.getElementById("filterArchiveLanguages");

const archiveLoadingIndicator = document.getElementById("archiveLoadingIndicator");

const archiveResultsList = document.getElementById("archiveResultsList");
const archiveResultsCount = document.getElementById("archiveResultsCount");
const archiveFilterResultsCount = document.getElementById("archiveFilterResultsCount");

const archiveActiveFilterStrip = document.getElementById("archiveActiveFilterStrip");
const archiveActiveFilterChips = document.getElementById("archiveActiveFilterChips");

const archiveRecordDetails = document.getElementById("archiveRecordDetails");

const showArchiveWorkspace = document.getElementById("showArchiveWorkspace");
const showArchiveNationalRef = document.getElementById("showArchiveNationalRef");
const showArchiveAllCaal = document.getElementById("showArchiveAllCaal");
const allCaalArchiveToggleWrapper = document.getElementById("allCaalArchiveToggleWrapper");

const refreshArchiveCacheBtn = document.getElementById("refreshArchiveCacheBtn");

const archivePrevBtn = document.getElementById("archivePrevBtn");
const archiveNextBtn = document.getElementById("archiveNextBtn");
const archivePageInfo = document.getElementById("archivePageInfo");

const archivePreviewModal = document.getElementById("archivePreviewModal");
const archivePreviewTitle = document.getElementById("archivePreviewTitle");
const archivePreviewBody = document.getElementById("archivePreviewBody");
const archivePreviewCloseBtn = document.getElementById("archivePreviewCloseBtn");

const addArchiveBtn = document.getElementById("addArchiveBtn");
const archiveActionBar = document.getElementById("archiveActionBar");
const archiveSaveBtn = document.getElementById("archiveSaveBtn");
const archiveCancelEditBtn = document.getElementById("archiveCancelEditBtn");
const archiveEditBtn = document.getElementById("archiveEditBtn");
const archiveDeleteBtn = document.getElementById("archiveDeleteBtn");
const archiveCloseRecordBtn = document.getElementById("archiveCloseRecordBtn");

const archiveCacheStatusLine = document.getElementById("archiveCacheStatusLine");

// API base
// --------------------------------------------------------
//const API_BASE = "http://localhost:3000";


// State
// --------------------------------------------------------
let archiveAllRecords = [];
let archiveVisibleRecords = [];
let archiveSelectedRecord = null;
let archiveIsEditMode = false;
let archiveLabels = {};
let archiveLookups = {};

let archiveTotalCount = 0;
let archiveLimit = 100;
let archiveOffset = 0;

let archivePendingNewRecord = null;    //
let archiveRecordOpenInProgress = false;

let archiveIsDirty = false;      // when entering edit mode and makign a change, save resets it to false
let archivePreviewRecord = null;
let archiveJustSavedRecordId = null;

let archiveRecentlySavedRecords = [];

let archiveLastSaveSummary = null;

const archiveSaveSummaryByCaalId = new Map();

function archiveAnyCaalId(record) {
  return String(
    record?.identity?.caal_id ||
    record?.raw?.["CAAL_ID"] ||
    record?.raw?.caal_id ||
    record?.["CAAL_ID"] ||
    record?.caal_id ||
    ""
  ).trim();
}

function archiveRecentlySavedCaalIdSet() {
  return new Set(
    (archiveRecentlySavedRecords || [])
      .map((record) => archiveAnyCaalId(record).toLowerCase())
      .filter(Boolean)
  );
}

function archiveIsSavedSinceCacheRefresh(record) {
  if (String(record?.source?.storage || "") !== "public_caal") {
    return false;
  }

  const caalId = archiveAnyCaalId(record).toLowerCase();
  if (!caalId) return false;

  return archiveRecentlySavedCaalIdSet().has(caalId);
}

function getRecentlySavedArchiveRecord(record) {
  const caalId = archiveAnyCaalId(record).toLowerCase();
  if (!caalId) return null;

  return (archiveRecentlySavedRecords || []).find((liveRecord) => {
    return archiveAnyCaalId(liveRecord).toLowerCase() === caalId;
  }) || null;
}

async function loadRecentlySavedArchiveRecords() {
  if (!archiveUserCanUseLiveCacheWorkaround()) {
    archiveRecentlySavedRecords = [];
    return [];
  }

  const response = await fetch("/api/archive/live-edited-records", {
    method: "GET",
    credentials: "include"
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data.detail ||
      data.error ||
      "Failed to load recently saved archive records"
    );
  }

  archiveRecentlySavedRecords = Array.isArray(data.records) ? data.records : [];
  return archiveRecentlySavedRecords;
}

function archiveRecordCaalId(record) {
  return String(
    archiveIdentity(record, "caal_id") ||
    archiveRaw(record, "CAAL_ID") ||
    archiveRaw(record, "caal_id") ||
    ""
  ).trim();
}

function getArchiveSaveSummaryForRecord(record) {
  const caalId = archiveRecordCaalId(record);
  if (!caalId) return null;

  return archiveSaveSummaryByCaalId.get(caalId.toLowerCase()) || null;
}

function rememberArchiveSaveSummary(summary) {
  const caalId = String(summary?.caal_id || "").trim();
  if (!caalId) return;

  archiveSaveSummaryByCaalId.set(caalId.toLowerCase(), summary);
  archiveLastSaveSummary = summary;
}

let archiveMessages = {};

let archiveFilterDebounceTimer = null;
let archiveResourceSearchAbortController = null;
let archiveResourceSearchRecords = [];
let archiveResourceSearchPanel = null;

let archiveActiveLanguage = null;

function archiveCurrentLanguageCode(eventOrOverride = null) {
  if (typeof eventOrOverride === "string" && eventOrOverride.trim()) {
    return eventOrOverride.trim();
  }

  const detail = eventOrOverride?.detail || {};
  const detailLang =
    detail.lang ||
    detail.language ||
    detail.languageCode ||
    detail.code;

  if (detailLang) {
    return String(detailLang).trim();
  }

  const langSelect =
    document.getElementById("languageSelect") ||
    document.querySelector("select[data-language-select]") ||
    document.querySelector("select#language");

  if (langSelect?.value) {
    return String(langSelect.value).trim();
  }

  if (archiveActiveLanguage) {
    return archiveActiveLanguage;
  }

  if (typeof window.getCurrentLanguage === "function") {
    const current = window.getCurrentLanguage();
    if (current) return current;
  }

  return window.appSession?.profile?.preferred_language || "en";
}

function archiveInstitutionDisplayName(inst) {
  if (!inst) return "";

  const lang = archiveCurrentLanguageCode();

  if (lang === "ru") {
    return (
      inst.name_ru ||
      inst.primary_name ||
      inst.other_names ||
      inst.caal_id ||
      ""
    );
  }

  if (lang === "kk") {
    return (
      inst.primary_name ||
      inst.name_ru ||
      inst.other_names ||
      inst.caal_id ||
      ""
    );
  }

  return (
    inst.primary_name ||
    inst.name_ru ||
    inst.other_names ||
    inst.caal_id ||
    ""
  );
}

function archiveInstitutionSecondaryName(inst) {
  if (!inst) return "";

  const lang = archiveCurrentLanguageCode();
  const values = [];

  /*
    In Russian UI:
    Main label = name_ru.
    Secondary line = Kazakh/local canonical name first, then English/other names.
  */
  if (lang === "ru") {
    if (inst.primary_name) values.push(inst.primary_name);
    if (inst.other_names) values.push(inst.other_names);
    return values.join(" - ");
  }

  /*
    In Kazakh UI:
    Main label = Primary Name.
    Secondary line = Russian official name first, then English/other names.
  */
  if (lang === "kk") {
    if (inst.name_ru) values.push(inst.name_ru);
    if (inst.other_names) values.push(inst.other_names);
    return values.join(" - ");
  }

  /*
    Other UI languages:
    Main label = Primary Name.
    Secondary line = Russian official name, then English/other names.
  */
  if (inst.name_ru) values.push(inst.name_ru);
  if (inst.other_names) values.push(inst.other_names);

  return values.join(" - ");
}

// labels translation loader 
function archiveText(key, fallback = null) {
  return archiveMessages[key] || archiveLabels[key] || fallback || key;
}

// loading indicator helper
function setArchiveLoading(isLoading, message = "") {
  const browsePane = document.getElementById("browse-pane");
  const detailPane = document.getElementById("detail-pane");

  if (archiveLoadingIndicator) {
    archiveLoadingIndicator.hidden = !isLoading;
    archiveLoadingIndicator.innerHTML = isLoading
      ? `<span class="spinner"></span><span>${message || t("loading", "Loading...")}</span>`
      : "";
  }

  [browsePane, detailPane].forEach((el) => {
    if (!el) return;

    if (isLoading) {
      el.classList.add("is-loading");
    } else {
      el.classList.remove("is-loading");
    }
  });
}

function setArchiveRecordOpening(isOpening) {
  archiveRecordOpenInProgress = isOpening === true;

  const disabled = archiveRecordOpenInProgress;

  document
    .querySelectorAll(
      [
        ".result-card",
        ".archive-associated-id-chip",
        "#archiveCloseRecordBtn",
        "#archiveEditBtn",
        "#addArchiveBtn"
      ].join(",")
    )
    .forEach((el) => {
      if (!el) return;

      if ("disabled" in el) {
        el.disabled = disabled;
      }

      el.classList.toggle("is-disabled", disabled);
      el.setAttribute("aria-busy", disabled ? "true" : "false");
    });
}

function setArchiveResultsCountText(text) {
  if (archiveResultsCount) {
    archiveResultsCount.textContent = text;
  }

  if (archiveFilterResultsCount) {
    archiveFilterResultsCount.textContent = text;
  }
}

function setArchiveResultsCountLoading(message = null) {
  const label = message || t("searching", "Searching...");

  if (archiveResultsCount) {
    archiveResultsCount.innerHTML = `<span class="mini-spinner"></span>${label}`;
  }

  if (archiveFilterResultsCount) {
    archiveFilterResultsCount.innerHTML = `<span class="mini-spinner"></span>${label}`;
  }
}

function showArchiveToast(message, variant = "success", durationMs = 3000) {
  let toast = document.getElementById("archiveToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "archiveToast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `app-toast app-toast-${variant} is-visible`;

  window.clearTimeout(showArchiveToast._timer);
  showArchiveToast._timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, durationMs);
}

function archiveUserIsCaalAdmin() {
  const accessLevel = Number(
    window.appSession?.user?.access_level ??
    window.appSession?.profile?.access_level ??
    0
  );

  const workspaceCode = String(
    window.appSession?.user?.workspace_code ??
    window.appSession?.profile?.workspace_code ??
    ""
  ).trim().toLowerCase();

  return accessLevel === 9 && workspaceCode === "caal";
}

function archiveUserCanUseLiveCacheWorkaround() {
  const session = window.appSession || {};
  const accessLevel = Number(
    session.user?.access_level ??
    session.profile?.access_level ??
    session.permissions?.access_level ??
    0
  );

  return accessLevel === 9;
}

// Cache helper
function archiveCacheLocale() {
  const lang = archiveCurrentLanguageCode();

  const localeByLang = {
    en: "en-GB",
    ru: "ru-RU",
    zh: "zh-CN",
    kk: "kk-KZ",
    ky: "ky-KG",
    tg: "tg-TJ",
    tk: "tk-TM",
    uz: "uz-UZ"
  };

  return localeByLang[lang] || "en-GB";
}

function archiveFormatCacheTimestamp(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(archiveCacheLocale(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function archiveLoadCacheStatus() {
  if (!archiveCacheStatusLine) return;

  try {
    const response = await fetch("/api/archive/cache-status", {
      method: "GET",
      credentials: "include"
    });

    const data = await response.json();

    if (!response.ok || !data.ok || !data.status?.refreshed_at) {
      archiveCacheStatusLine.hidden = true;
      return;
    }

    archiveCacheStatusLine.classList.remove("cache-status-unavailable");

    archiveCacheStatusLine.textContent =
      `${t("caal_browse_data_last_updated", "CAAL browse data last updated")}: ${archiveFormatCacheTimestamp(data.status.refreshed_at)}`;

    archiveCacheStatusLine.hidden = false;
  } catch (error) {
    console.warn("Archive cache status unavailable:", error);

    archiveCacheStatusLine.textContent =
      t("browse_data_update_time_unavailable", "Browse data update time unavailable");

    archiveCacheStatusLine.classList.add("cache-status-unavailable");
    archiveCacheStatusLine.hidden = false;
  }
}

// Label helpers
// --------------------------------------------------------
async function archiveReloadFromFilters() {
  archiveOffset = 0;

  archiveRenderActiveFilterChips();

  setArchiveLoading(true, t("updating_records", "Updating records..."));

  try {
    await loadArchiveRecords(archiveLimit, 0);
  } catch (error) {
    console.error("Archive filter reload failed:", error);
    setArchiveResultsError();
  } finally {
    setArchiveLoading(false);
  }
}

function archiveScheduleFilterReload() {
  if (archiveFilterDebounceTimer) {
    clearTimeout(archiveFilterDebounceTimer);
  }

  archiveRenderActiveFilterChips();

  if (!archiveShouldRunResourceSearch()) {
    archiveRenderResourceSearchResults([]);
  }

  setArchiveResultsCountLoading();

  archiveFilterDebounceTimer = setTimeout(() => {
    archiveReloadFromFilters();
  }, 600);
}

function archiveNormalizeLabelKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function archiveLabel(name, fallback = null) {
  if (!name) return fallback || "";

  if (archiveLabels[name]) {
    return archiveLabels[name];
  }

  const wanted = archiveNormalizeLabelKey(name);

  const matchedKey = Object.keys(archiveLabels).find(
    (key) => archiveNormalizeLabelKey(key) === wanted
  );

  if (matchedKey && archiveLabels[matchedKey]) {
    return archiveLabels[matchedKey];
  }

  return fallback || name;
}

function archiveBoolLabel(value) {
  if (value === true) return archiveLabel("Yes", "Yes");
  if (value === false) return archiveLabel("No", "No");
  return archiveLabel("Unknown", "Unknown");
}

function archiveScopeLabel(scope) {
  const normalisedScope = normaliseArchiveScopeForSession(scope);

  switch (normalisedScope) {
    case "workspace":
      return t("scope_workspace", "Workspace");

    case "national_ref":
      return t("scope_national_caal", "National CAAL");

    case "all_caal":
      return archiveUserIsGlobalCaal()
        ? t("scope_all_caal", "All CAAL")
        : t("scope_other_caal", "Other CAAL");

    default:
      return normalisedScope || t("unknown", "Unknown");
  }
}

function archiveScopeBadgeClass(record) {
  const classes = ["scope-badge"];

  if (record?.source?.is_editable === true) {
    classes.push("scope-badge-editable");
  } else {
    classes.push("scope-badge-readonly");
  }

  return classes.join(" ");
}

// lookup helper
async function loadArchiveLookups(langOverride = null) {
  const lang = archiveCurrentLanguageCode(langOverride);
  archiveActiveLanguage = lang;

  const response = await fetch(
    `/api/lookups/archive?lang=${encodeURIComponent(lang)}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load archive lookups");
  }

  archiveLookups = data.lookups || {};
}

// Generic helpers
// --------------------------------------------------------
function getInitialCaalIdFromUrl() {
  return new URLSearchParams(window.location.search).get("caal_id");
}

function safeArchiveValue(value) {
  if (value === null || value === undefined || value === "") {
    return `<span class="empty-value">${t("not_recorded", "Not recorded")}</span>`;
  }
  return value;
}

function archiveDateOnly(value) {
  if (!value) return value;

  const text = String(value).trim();

  // ISO timestamp: 2026-04-30T13:28:37.313Z
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.slice(0, 10);
  }

  // SQL timestamp: 2026-04-30 13:28:37
  if (/^\d{4}-\d{2}-\d{2}\s/.test(text)) {
    return text.slice(0, 10);
  }

  // Slash date with time: 13/01/2021 11:28
  if (/^\d{1,2}\/\d{1,2}\/\d{4}\s/.test(text)) {
    return text.split(/\s+/)[0];
  }

  return text;
}

function archiveHasRealValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function archiveNormalizeSearchText(value) {
  if (!archiveHasRealValue(value)) return "";
  return String(value).toLowerCase();
}

function archiveUniqueSorted(values) {
  return Array.from(new Set(values.filter(archiveHasRealValue))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function archiveParseAssociatedCaalIds(value) {
  if (!value) return [];

  return String(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function archiveIsLikelyCaalId(value) {
  const text = String(value || "").trim();

  // This checks one parsed ID/chip only. The full field may contain
  // comma/semicolon/newline separated IDs before parsing.
  return text.length > 0 && !/[,;\n]/.test(text);
}

function archiveGetInvalidAssociatedIds(value) {
  return archiveParseAssociatedCaalIds(value).filter(
    (id) => !archiveIsLikelyCaalId(id)
  );
}

function normaliseArchiveAssociatedIdList(value) {
  return Array.from(new Set(archiveParseAssociatedCaalIds(value)))
    .join(", ");
}

function validateArchiveAssociatedIdsBeforeSave() {
  const value = archiveGetInputValue("Associated CAAL_ID");
  const invalid = archiveGetInvalidAssociatedIds(value);

  if (invalid.length) {
    alert(
      t("invalid_associated_ids_intro", "Some Associated CAAL_ID values do not look valid:") +
      "\n\n" +
      invalid.join("\n") +
      "\n\n" +
      t("invalid_associated_ids_instruction", "Please use comma-separated CAAL IDs.")
    );
    return false;
  }

  return true;
}

const archiveCaalIdCheckCache = new Map();

function archiveGetEditableAssociatedIds(record) {
  const relationIds = archiveGetAssociatedRelations(record)
    .map((rel) => String(rel.related_caal_id || "").trim())
    .filter(Boolean);

  if (relationIds.length) {
    return Array.from(new Set(relationIds)).join(", ");
  }

  return archiveIdentity(record, "associated_caal_id") ||
    archiveRaw(record, "Associated CAAL_ID") ||
    "";
}

function archiveRenderCaalIdChipInput(fieldName, label, value, fullWidth = true) {
  const inputId = archiveInputId(fieldName);
  const chipInputId = `${inputId}_chip_input`;
  const chipListId = `${inputId}_chip_list`;
  const ids = archiveParseAssociatedCaalIds(value);

  return `
    <div class="detail-item${fullWidth ? " full-width" : ""} archive-caal-chip-field" data-field-name="${fieldName}">
      <label class="detail-label" for="${chipInputId}">${label}</label>

      <div class="caal-chip-input-box" id="${chipListId}">
        ${ids.map((id) => archiveRenderEditableCaalIdChip(id, "pending")).join("")}

        <input
          type="text"
          id="${chipInputId}"
          class="caal-chip-input"
          placeholder="${t("type_caal_id_press_enter", "Type a CAAL ID and press Enter")}"
          autocomplete="off"
          spellcheck="false"
        >
      </div>

      <input
        type="hidden"
        id="${inputId}"
        value="${ids.join(", ")}"
      >

      <p class="filter-help">
        ${t(
          "related_resource_chip_help",
          "Type one related CAAL ID at a time. Press Enter, comma, semicolon, or Tab to add it."
        )}
      </p>
    </div>
  `;
}

function archiveRenderEditableCaalIdChip(id, status = "pending") {
  const safeId = String(id || "").trim();
  if (!safeId) return "";

  return `
    <span
      class="related-id-chip archive-edit-related-chip related-id-chip-${status}"
      data-caal-id="${safeId}"
      title="${t("checking_related_id", "Checking related ID")}"
    >
      <span class="related-id-chip-spinner" aria-hidden="true"></span>
      <span class="related-id-chip-text">${safeId}</span>
      <button
        type="button"
        class="related-id-chip-remove"
        aria-label="${t("remove_related_id", "Remove related ID")}"
      >
        ×
      </button>
    </span>
  `;
}

function archiveNormaliseTypedCaalId(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function archiveChipIds(fieldEl) {
  return Array.from(fieldEl.querySelectorAll(".archive-edit-related-chip"))
    .map((chip) => String(chip.dataset.caalId || "").trim())
    .filter(Boolean);
}

function archiveSyncCaalChipHiddenInput(fieldEl, { markDirty = true } = {}) {
  const fieldName = fieldEl.dataset.fieldName;
  const hiddenInput = document.getElementById(archiveInputId(fieldName));

  if (!hiddenInput) return;

  hiddenInput.value = Array.from(new Set(archiveChipIds(fieldEl))).join(", ");

  if (markDirty) {
    archiveIsDirty = true;
  }
}

function archiveFindCaalChip(fieldEl, caalId) {
  const wanted = String(caalId || "").trim().toLowerCase();

  return Array.from(fieldEl.querySelectorAll(".archive-edit-related-chip")).find(
    (chip) => String(chip.dataset.caalId || "").trim().toLowerCase() === wanted
  );
}

function archiveSetEditableChipStatus(chip, status, metadata = {}) {
  if (!chip) return;

  const spinner = chip.querySelector(".related-id-chip-spinner");
  if (spinner) {
    spinner.hidden = status !== "pending";
  }

  chip.classList.remove(
    "related-id-chip-pending",
    "related-id-chip-found",
    "related-id-chip-missing",
    "related-id-chip-unresolved",
    "related-id-chip-invalid"
  );

  if (status === "found") {
    chip.classList.add("related-id-chip-found");
    chip.title = metadata.record_type
      ? `${t("related_id_found", "Related ID found")} (${metadata.record_type})`
      : t("related_id_found", "Related ID found");
    return;
  }

  if (status === "invalid") {
    chip.classList.add("related-id-chip-invalid");
    chip.title = t("invalid_related_id_format", "Invalid related ID format");
    return;
  }

  if (status === "missing") {
    chip.classList.add("related-id-chip-missing", "related-id-chip-unresolved");
    chip.title = t("related_id_not_found", "Related ID not found in current resource tables");
    return;
  }

  chip.classList.add("related-id-chip-pending");
  chip.title = t("checking_related_id", "Checking related ID");
}

async function archiveCheckCaalId(caalId) {
  const key = String(caalId || "").trim().toLowerCase();

  if (archiveCaalIdCheckCache.has(key)) {
    return archiveCaalIdCheckCache.get(key);
  }

  const response = await fetch(
    `/api/records/check?caal_id=${encodeURIComponent(caalId)}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  const data = await response.json();

  const result = response.ok && data.ok
    ? data
    : {
        ok: false,
        exists: false,
        error: data.error || "CAAL_ID check failed"
      };

  archiveCaalIdCheckCache.set(key, result);
  return result;
}

async function archiveAddCaalIdChip(fieldEl, rawValue) {
  const parts = String(rawValue || "")
    .split(/[,;\n\t]+/)
    .map(archiveNormaliseTypedCaalId)
    .filter(Boolean);

  for (const id of parts) {
    if (archiveFindCaalChip(fieldEl, id)) {
      continue;
    }

    const input = fieldEl.querySelector(".caal-chip-input");
    if (!input) return;

    input.insertAdjacentHTML("beforebegin", archiveRenderEditableCaalIdChip(id, "pending"));

    const chip = archiveFindCaalChip(fieldEl, id);
    archiveSyncCaalChipHiddenInput(fieldEl);

    if (!archiveIsLikelyCaalId(id)) {
      archiveSetEditableChipStatus(chip, "invalid");
      continue;
    }

    try {
      const check = await archiveCheckCaalId(id);

      archiveSetEditableChipStatus(
        chip,
        check.exists ? "found" : "missing",
        check
      );
    } catch (error) {
      console.warn("CAAL_ID check failed:", id, error);
      archiveSetEditableChipStatus(chip, "missing");
    }
  }

  archiveSyncCaalChipHiddenInput(fieldEl);
}

function archiveWireCaalIdChipInputs() {
  if (!archiveRecordDetails) return;

  const fields = Array.from(
    archiveRecordDetails.querySelectorAll(".archive-caal-chip-field")
  );

  fields.forEach((fieldEl) => {
    if (fieldEl.dataset.caalChipWired === "true") return;

    const input = fieldEl.querySelector(".caal-chip-input");
    if (!input) return;

    fieldEl.addEventListener("click", (event) => {
      const removeBtn = event.target.closest(".related-id-chip-remove");

      if (removeBtn) {
        const chip = removeBtn.closest(".archive-edit-related-chip");
        if (chip) {
          chip.remove();
          archiveSyncCaalChipHiddenInput(fieldEl);
        }
        return;
      }

      input.focus();
    });

    input.addEventListener("keydown", async (event) => {
      const shouldCommit =
        event.key === "Enter" ||
        event.key === "Tab" ||
        event.key === "," ||
        event.key === ";";

      if (!shouldCommit) return;

      if (isRelatedCaalIdSuggestOpen(fieldEl)) {
        return;
      }

      if (input.value.trim()) {
        event.preventDefault();

        const rawValue = input.value;
        input.value = "";

        await archiveAddCaalIdChip(fieldEl, rawValue);
      }
    });

    input.addEventListener("paste", async (event) => {
      const text = event.clipboardData?.getData("text") || "";

      if (/[,\n;\t]/.test(text)) {
        event.preventDefault();
        input.value = "";

        await archiveAddCaalIdChip(fieldEl, text);
      }
    });

    input.addEventListener("blur", async () => {
      setTimeout(async () => {
        if (isRelatedCaalIdSuggestOpen(fieldEl)) {
          return;
        }

        if (input.value.trim()) {
          const rawValue = input.value;
          input.value = "";

          await archiveAddCaalIdChip(fieldEl, rawValue);
        }
      }, 120);
    });

    wireRelatedCaalIdSuggestInput({
      fieldEl,
      input,
      addChip: async (caalId) => {
        await archiveAddCaalIdChip(fieldEl, caalId);
      }
    });

    fieldEl.dataset.caalChipWired = "true";

    Array.from(fieldEl.querySelectorAll(".archive-edit-related-chip")).forEach(async (chip) => {
      const id = String(chip.dataset.caalId || "").trim();

      if (!id) return;

      if (!archiveIsLikelyCaalId(id)) {
        archiveSetEditableChipStatus(chip, "invalid");
        return;
      }

      try {
        const check = await archiveCheckCaalId(id);

        archiveSetEditableChipStatus(
          chip,
          check.exists ? "found" : "missing",
          check
        );
      } catch (error) {
        archiveSetEditableChipStatus(chip, "missing");
      }
    });

    archiveSyncCaalChipHiddenInput(fieldEl);
  });
}

function archiveRenderInstitutionPicker(record) {
  const inst = archiveGetHoldingInstitutionRelation(record);
  const selectedId = inst?.caal_id || "";
  const selectedLabel = archiveInstitutionDisplayName(inst) || selectedId || "";

  return `
    <div class="detail-item full-width archive-institution-picker" data-field-name="Holding Institution">
      <label class="detail-label" for="archiveHoldingInstitutionSearch">
        ${t("holding_institution", "Holding Institution")}
      </label>

      <div class="caal-chip-input-box institution-picker-box">
        <span
          class="related-id-chip institution-chip archive-selected-institution-chip"
          id="archiveSelectedInstitutionChip"
          ${selectedId ? "" : "hidden"}
          data-institution-caal-id="${selectedId}"
        >
          <span class="related-id-chip-text">
            ${safeArchiveValue(selectedLabel)}
          </span>
          <button
            type="button"
            class="related-id-chip-remove"
            id="archiveClearHoldingInstitutionBtn"
            aria-label="${t("remove_holding_institution", "Remove holding institution")}"
          >
            ×
          </button>
        </span>

        <input
          type="text"
          id="archiveHoldingInstitutionSearch"
          class="caal-chip-input"
          placeholder="${t("search_institutions", "Search institutions...")}"
          autocomplete="off"
          spellcheck="false"
        >
      </div>

      <input
        type="hidden"
        id="archiveHoldingInstitutionCaalId"
        value="${selectedId}"
      >

      <div
        id="archiveInstitutionSuggestions"
        class="related-caal-id-suggest-list institution-suggest-list"
        hidden
      ></div>

      <p class="filter-help">
        ${t(
          "holding_institution_help",
          "Required for new records; recommended for existing records. Select the institution that holds or supplied this archive material."
        )}
      </p>
    </div>
  `;
}

let archiveInstitutionSearchTimer = null;

async function archiveSearchInstitutions(query) {
  const params = new URLSearchParams();
  params.set("q", query || "");
  params.set("limit", "30");

  const institutionCountry =
    window.appSession?.profile?.country ||
    window.appSession?.profile?.country_display ||
    window.appSession?.user?.country ||
    window.appSession?.user?.country_display ||
    archiveGetInputValue("Country") ||
    archiveRaw(archiveSelectedRecord, "Country") ||
    "";

  if (institutionCountry) {
    params.set("country", institutionCountry);
  }

  const response = await fetch(`/api/archive/institutions?${params.toString()}`, {
    method: "GET",
    credentials: "include"
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Institution lookup failed");
  }

  return data.institutions || [];
}

function archiveSetHoldingInstitution(inst) {
  const hidden = document.getElementById("archiveHoldingInstitutionCaalId");
  const chip = document.getElementById("archiveSelectedInstitutionChip");
  const text = chip?.querySelector(".related-id-chip-text");
  const input = document.getElementById("archiveHoldingInstitutionSearch");
  const suggestions = document.getElementById("archiveInstitutionSuggestions");

  if (!hidden || !chip || !text) return;

  hidden.value = inst?.caal_id || "";
  chip.dataset.institutionCaalId = inst?.caal_id || "";
  text.innerHTML = safeArchiveValue(
    archiveInstitutionDisplayName(inst) || inst?.caal_id || ""
  );

  chip.hidden = !inst?.caal_id;

  if (input) input.value = "";

  if (suggestions) {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
  }

  archiveIsDirty = true;
}

function archiveRenderInstitutionSuggestions(items) {
  const suggestions = document.getElementById("archiveInstitutionSuggestions");
  if (!suggestions) return;

  if (!Array.isArray(items) || items.length === 0) {
    suggestions.innerHTML = `
      <div class="related-caal-id-suggest-empty">
        ${t("no_matching_institutions", "No matching institutions")}
      </div>
    `;
    suggestions.hidden = false;
    return;
  }

  suggestions.innerHTML = items.map((inst, index) => {
    const subtitle = [
      archiveInstitutionSecondaryName(inst),
      inst.caal_id,
      inst.actor_type,
      inst.country
    ]
      .filter(Boolean)
      .join(" - ");

    return `
      <button
        type="button"
        class="related-caal-id-suggest-item institution-suggest-item"
        data-institution-index="${index}"
      >
        <strong>${safeArchiveValue(archiveInstitutionDisplayName(inst) || inst.caal_id)}</strong>
        <span>${safeArchiveValue(subtitle)}</span>
      </button>
    `;
  }).join("");

  suggestions.hidden = false;

  Array.from(suggestions.querySelectorAll(".institution-suggest-item")).forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.institutionIndex);
      archiveSetHoldingInstitution(items[index]);
    });
  });
}

function archiveWireInstitutionPicker() {
  const input = document.getElementById("archiveHoldingInstitutionSearch");
  const clearBtn = document.getElementById("archiveClearHoldingInstitutionBtn");
  const suggestions = document.getElementById("archiveInstitutionSuggestions");

  if (!input || input.dataset.institutionWired === "true") return;

  input.addEventListener("input", () => {
    window.clearTimeout(archiveInstitutionSearchTimer);

    archiveInstitutionSearchTimer = window.setTimeout(async () => {
      const q = input.value.trim();

      if (q.length < 2) {
        if (suggestions) {
          suggestions.hidden = true;
          suggestions.innerHTML = "";
        }
        return;
      }

      try {
        const items = await archiveSearchInstitutions(q);
        archiveRenderInstitutionSuggestions(items);
      } catch (error) {
        console.error("Institution search failed:", error);
      }
    }, 250);
  });

  input.addEventListener("focus", async () => {
    if (input.value.trim().length >= 2) return;

    try {
      const items = await archiveSearchInstitutions("");
      archiveRenderInstitutionSuggestions(items);
    } catch (error) {
      console.error("Institution initial lookup failed:", error);
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", (event) => {
      event.preventDefault();
      archiveSetHoldingInstitution(null);
    });
  }

  input.dataset.institutionWired = "true";
}

function validateArchiveHoldingInstitutionBeforeSave({ isNewRecord = false } = {}) {
  const value =
    document.getElementById("archiveHoldingInstitutionCaalId")?.value || "";

  if (String(value).trim()) {
    return true;
  }

  if (isNewRecord) {
    alert(
      t(
        "holding_institution_required_error",
        "Please select a Holding Institution before saving this new archive record."
      )
    );
    return false;
  }

  return window.confirm(
    t(
      "holding_institution_missing_warning",
      "No Holding Institution has been selected for this archive record. This should be added where possible so the origin of the archive material is clear. Save anyway?"
    )
  );
}

function archiveArrayValue(value) {
  if (Array.isArray(value)) return value.filter(archiveHasRealValue);

  if (!archiveHasRealValue(value)) return [];

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function archiveSelectedValues(selectEl) {
  if (!selectEl) return [];
  return Array.from(selectEl.selectedOptions).map((option) => option.value);
}

function archivePopulateMultiSelect(selectEl, items) {
  if (!selectEl) return;
  selectEl.innerHTML = "";

  const sortedItems = Array.isArray(items)
    ? [...items].sort((a, b) => {
        return archiveLookupSortLabel(a).localeCompare(
          archiveLookupSortLabel(b),
          archiveCurrentLanguageCode(),
          {
            sensitivity: "base",
            numeric: true
          }
        );
      })
    : [];

  sortedItems.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value ?? "";
    option.textContent = item.label ?? item.value ?? "";
    selectEl.appendChild(option);
  });
}

function archiveSectionHasValues(values) {
  return values.some((value) => archiveHasRealValue(value));
}

function renderArchivePageInfo() {
  const pageInfo = document.getElementById("archivePageInfo");
  if (!pageInfo) return;

  const pageNumber = Math.floor(archiveOffset / archiveLimit) + 1;
  const totalPages = archiveTotalCount
    ? Math.max(1, Math.ceil(archiveTotalCount / archiveLimit))
    : 1;

  pageInfo.textContent = archiveTotalCount
    ? t("page_x_of_y", "Page {page} of {total}")
        .replace("{page}", pageNumber)
        .replace("{total}", totalPages)
    : t("page_x", "Page {page}")
        .replace("{page}", pageNumber);

  if (archivePrevBtn) {
    archivePrevBtn.disabled = archiveOffset === 0;
  }

  if (archiveNextBtn) {
    archiveNextBtn.disabled = archiveTotalCount
      ? archiveOffset + archiveAllRecords.length >= archiveTotalCount
      : archiveAllRecords.length < archiveLimit;
  }
}


function archiveRecordTitleClass(record) {
  if (archiveJustSavedRecordId && archiveJustSavedRecordId === record?.identity?.id) {
    return "record-title record-title-saved";
  }

  return "record-title record-title-selected";
}

function archivePopulateFilterLookups() {
  archivePopulateMultiSelect(filterArchiveRelatedCountries, archiveLookupOptions("related_country"));
  archivePopulateMultiSelect(filterArchiveRelatedReligions, archiveLookupOptions("related_religion"));
  archivePopulateMultiSelect(filterArchiveRelatedSubjects, archiveLookupOptions("related_subject"));
  archivePopulateMultiSelect(filterArchiveContentType, archiveLookupOptions("content_type"));
  archivePopulateMultiSelect(filterArchiveLanguages, archiveLookupOptions("language"));

  archiveWireClickToggleMultiSelects();
  archiveRenderAllFilterChips();
}

const archiveChipFilterConfigs = [
  {
    select: filterArchiveRelatedCountries,
    chipsId: "filterArchiveRelatedCountriesChips"
  },
  {
    select: filterArchiveRelatedReligions,
    chipsId: "filterArchiveRelatedReligionsChips"
  },
  {
    select: filterArchiveRelatedSubjects,
    chipsId: "filterArchiveRelatedSubjectsChips"
  },
  {
    select: filterArchiveContentType,
    chipsId: "filterArchiveContentTypeChips"
  },
  {
    select: filterArchiveLanguages,
    chipsId: "filterArchiveLanguagesChips"
  }
];

function archiveGetSelectedOptionData(selectEl) {
  if (!selectEl) return [];

  return Array.from(selectEl.options)
    .filter((option) => option.selected)
    .map((option) => ({
      value: option.value,
      label: option.textContent || option.value
    }));
}

function archiveRenderFilterChipsForSelect(selectEl, chipsId) {
  const chipsEl = document.getElementById(chipsId);
  if (!selectEl || !chipsEl) return;

  const selected = archiveGetSelectedOptionData(selectEl);
  chipsEl.innerHTML = "";

  if (!selected.length) {
    const empty = document.createElement("span");
    empty.className = "filter-chip-empty";
    empty.textContent = t("no_values_selected", "No values selected");
    chipsEl.appendChild(empty);

    updateArchiveChangedFieldState(selectEl);
    return;
  }

  selected.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filter-chip";
    chip.dataset.value = item.value;
    chip.innerHTML = `
      <span>${item.label}</span>
      <span class="filter-chip-remove" aria-hidden="true">×</span>
    `;

    chip.addEventListener("click", async () => {
      const option = Array.from(selectEl.options).find(
        (opt) => opt.value === item.value
      );

      if (option) option.selected = false;

      archiveRenderAllFilterChips();
      await archiveReloadFromFilters();
    });

    chipsEl.appendChild(chip);
  });
}

function archiveRenderAllFilterChips() {
  archiveChipFilterConfigs.forEach(({ select, chipsId }) => {
    archiveRenderFilterChipsForSelect(select, chipsId);
  });
}

function archiveGetSelectedOptionsForGlobalChip(selectEl, kind) {
  if (!selectEl) return [];

  return Array.from(selectEl.selectedOptions || [])
    .map((option) => ({
      kind,
      value: option.value,
      label: option.textContent?.trim() || option.value
    }))
    .filter((chip) => chip.value && chip.label);
}

function archiveClearSelectedOptionByValue(selectEl, value) {
  if (!selectEl) return;

  Array.from(selectEl.options || []).forEach((option) => {
    if (String(option.value) === String(value)) {
      option.selected = false;
    }
  });
}

function archiveGetActiveFilterChips() {
  const chips = [];

  const text = archiveSearch?.value?.trim();
  if (text) {
    chips.push({
      kind: "text",
      label: text,
      title: t("text_search", "Text search")
    });
  }

  const caalId = archiveFilterCaalId?.value?.trim();
  if (caalId) {
    chips.push({
      kind: "caal_id",
      label: caalId,
      title: "CAAL_ID"
    });
  }

  chips.push(
    ...archiveGetSelectedOptionsForGlobalChip(
      filterArchiveRelatedCountries,
      "related_countries"
    )
  );

  chips.push(
    ...archiveGetSelectedOptionsForGlobalChip(
      filterArchiveRelatedReligions,
      "related_religions"
    )
  );

  chips.push(
    ...archiveGetSelectedOptionsForGlobalChip(
      filterArchiveRelatedSubjects,
      "related_subjects"
    )
  );

  chips.push(
    ...archiveGetSelectedOptionsForGlobalChip(
      filterArchiveContentType,
      "content_type"
    )
  );

  chips.push(
    ...archiveGetSelectedOptionsForGlobalChip(
      filterArchiveLanguages,
      "languages"
    )
  );

  return chips;
}

function archiveRenderActiveFilterChips() {
  if (!archiveActiveFilterStrip || !archiveActiveFilterChips) return;

  const chips = archiveGetActiveFilterChips();

  archiveActiveFilterStrip.hidden = chips.length === 0;
  archiveActiveFilterChips.innerHTML = "";

  chips.forEach((chip) => {
    const chipEl = document.createElement("span");
    chipEl.className = "active-filter-chip";
    chipEl.title = chip.title || "";

    const textEl = document.createElement("span");
    textEl.className = "active-filter-chip-text";
    textEl.textContent = chip.label;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "active-filter-chip-remove";
    removeBtn.textContent = "×";
    removeBtn.setAttribute(
      "aria-label",
      `${t("remove_filter", "Remove filter")}: ${chip.label}`
    );

    removeBtn.addEventListener("click", async () => {
      await archiveRemoveActiveFilterChip(chip);
    });

    chipEl.appendChild(textEl);
    chipEl.appendChild(removeBtn);
    archiveActiveFilterChips.appendChild(chipEl);
  });
}

async function archiveRemoveActiveFilterChip(chip) {
  if (!chip) return;

  switch (chip.kind) {
    case "text":
      if (archiveSearch) archiveSearch.value = "";
      break;

    case "caal_id":
      if (archiveFilterCaalId) archiveFilterCaalId.value = "";
      break;

    case "related_countries":
      archiveClearSelectedOptionByValue(filterArchiveRelatedCountries, chip.value);
      break;

    case "related_religions":
      archiveClearSelectedOptionByValue(filterArchiveRelatedReligions, chip.value);
      break;

    case "related_subjects":
      archiveClearSelectedOptionByValue(filterArchiveRelatedSubjects, chip.value);
      break;

    case "content_type":
      archiveClearSelectedOptionByValue(filterArchiveContentType, chip.value);
      break;

    case "languages":
      archiveClearSelectedOptionByValue(filterArchiveLanguages, chip.value);
      break;

    default:
      return;
  }

  archiveRenderAllFilterChips();
  archiveRenderActiveFilterChips();

  await archiveReloadFromFilters();
}

function archiveWireClickToggleMultiSelects() {
  archiveChipFilterConfigs.forEach(({ select, chipsId }) => {
    if (!select || select.dataset.clickToggleWired === "true") return;

    select.addEventListener("mousedown", (event) => {
      const option = event.target;
      if (!option || option.tagName !== "OPTION") return;

      event.preventDefault();
      option.selected = !option.selected;

      archiveRenderFilterChipsForSelect(select, chipsId);

      select.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    });

    select.addEventListener("change", () => {
      archiveRenderFilterChipsForSelect(select, chipsId);
      archiveRenderActiveFilterChips();
    });

    select.dataset.clickToggleWired = "true";
  });

  archiveRenderAllFilterChips();
}

function archiveBuildQueryParams({ limit = archiveLimit, offset = archiveOffset } = {}) {
  const scopes = getArchiveEnabledScopes();

  const lang = archiveCurrentLanguageCode();

  const params = new URLSearchParams();
  if (scopes.length) {
    params.set("scopes", scopes.join(","));
  }
  params.set("lang", lang);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const text = archiveSearch?.value.trim();
  const caalId = archiveFilterCaalId?.value.trim();

  if (text) params.set("text", text);
  if (caalId) params.set("caalId", caalId);

  const relatedCountries = archiveSelectedValues(filterArchiveRelatedCountries);
  const relatedReligions = archiveSelectedValues(filterArchiveRelatedReligions);
  const relatedSubjects = archiveSelectedValues(filterArchiveRelatedSubjects);
  const contentTypes = archiveSelectedValues(filterArchiveContentType);
  const languages = archiveSelectedValues(filterArchiveLanguages);

  if (relatedCountries.length) params.set("relatedCountries", relatedCountries.join(","));
  if (relatedReligions.length) params.set("relatedReligions", relatedReligions.join(","));
  if (relatedSubjects.length) params.set("relatedSubjects", relatedSubjects.join(","));
  if (contentTypes.length) params.set("contentTypes", contentTypes.join(","));
  if (languages.length) params.set("languages", languages.join(","));

  return params;
}

function archiveResourceSearchQuery() {
  return String(archiveSearch?.value || "").trim();
}

function archiveShouldRunResourceSearch() {
  return archiveResourceSearchQuery().length >= 2;
}

function archiveEnsureResourceSearchPanel() {
  if (
    archiveResourceSearchPanel &&
    document.body.contains(archiveResourceSearchPanel)
  ) {
    return archiveResourceSearchPanel;
  }

  if (!archiveResultsList) return null;

  archiveResourceSearchPanel = document.createElement("div");
  archiveResourceSearchPanel.id = "archiveResourceSearchPanel";
  archiveResourceSearchPanel.className = "archive-resource-search-panel";
  archiveResourceSearchPanel.hidden = true;

  archiveResultsList.insertAdjacentElement("afterend", archiveResourceSearchPanel);

  return archiveResourceSearchPanel;
}

function archiveSafeSearchText(value, fallback = "") {
  const text = String(value ?? fallback ?? "").trim();

  if (!text) {
    return `<span class="empty-value">${t("not_recorded", "Not recorded")}</span>`;
  }

  return archiveAttributeValue(text);
}

function archiveResourceTypeLabel(record) {
  const type = String(record?.record_type || "").trim();

  switch (type) {
    case "archive":
      return t("archive_record", "Archive");

    case "monument":
      return archiveLabel("Monuments", "Monuments");

    case "institution":
      return t("institution", "Institution");

    case "dataset":
      return t("dataset", "Dataset");

    case "rs3_poly":
      return t("rs3_polygons", "RS polygons");

    case "rs3_line":
      return t("rs3_line", "RS lines");

    case "rs3_group":
      return t("rs3_group", "RS groups");

    case "vernacular":
      return t("vernacular", "Vernacular");

    default:
      return record?.dataset_label || t("caal_record", "CAAL record");
  }
}

function archiveRelatedToLine(record) {
  const relatedId = String(record?.matched_related_caal_id || "").trim();

  if (!relatedId) return "";

  const relatedLabel = String(record?.matched_related_display_label || "").trim();
  const relatedText = relatedLabel
    ? `${relatedId} - ${relatedLabel}`
    : relatedId;

  return `
    <div class="archive-resource-related-line">
      ${t("related_to", "Related to")} ${archiveSafeSearchText(relatedText)}
    </div>
  `;
}

function archiveRelatedToLines(record, { limit = 3 } = {}) {
  const matches = Array.isArray(record?._relatedMatches) && record._relatedMatches.length
    ? record._relatedMatches
    : [record];

  const visibleMatches = matches.slice(0, limit);

  const lines = visibleMatches.map((match) => {
    return archiveRelatedToLine(match);
  }).join("");

  const remaining = matches.length - visibleMatches.length;

  if (remaining <= 0) {
    return lines;
  }

  return `
    ${lines}
    <div class="archive-resource-related-more">
      ${t("more_related_matches", "+ {count} more related matches").replace("{count}", remaining)}
    </div>
  `;
}

function archiveResourceResultKey(record) {
  return [
    record?.record_type || "",
    record?.caal_id || ""
  ].join("::").toLowerCase();
}

function archiveRelatedMatchKey(record) {
  return [
    record?.matched_related_record_type || "",
    record?.matched_related_caal_id || "",
    record?.matched_related_display_label || ""
  ].join("::").toLowerCase();
}

function archiveCollapseRelatedArchiveRecords(rows) {
  const byArchiveId = new Map();

  rows.forEach((record) => {
    const key = String(record?.caal_id || "").trim().toLowerCase();
    if (!key) return;

    if (!byArchiveId.has(key)) {
      byArchiveId.set(key, {
        ...record,
        _relatedMatches: []
      });
    }

    const collapsed = byArchiveId.get(key);
    const matchKey = archiveRelatedMatchKey(record);

    const alreadyHasMatch = collapsed._relatedMatches.some((match) => {
      return archiveRelatedMatchKey(match) === matchKey;
    });

    if (!alreadyHasMatch) {
      collapsed._relatedMatches.push(record);
    }
  });

  return Array.from(byArchiveId.values());
}

function archiveCollapsePreviewOnlyRecords(rows) {
  const byResource = new Map();

  rows.forEach((record) => {
    const key = archiveResourceResultKey(record);
    if (!key || byResource.has(key)) return;

    byResource.set(key, record);
  });

  return Array.from(byResource.values());
}

function archiveGroupResourceSearchRecords(records) {
  const rows = (Array.isArray(records) ? records : []).map((record, index) => ({
    ...record,
    _resourceSearchIndex: index
  }));

  const nativeRelatedRows = rows.filter((record) => {
    return record.record_type === "archive" && record.match_type === "related";
  });

  const otherPreviewRows = rows.filter((record) => {
    if (record.record_type === "archive") return false;

    return (
      record.match_type === "direct" ||
      record.match_type === "exact_caal_id"
    );
  });

  return {
    nativeRelated: archiveCollapseRelatedArchiveRecords(nativeRelatedRows),
    otherPreview: archiveCollapsePreviewOnlyRecords(otherPreviewRows)
  };
}

async function archiveFetchResourceSearchResults(query) {
  if (archiveResourceSearchAbortController) {
    archiveResourceSearchAbortController.abort();
  }

  archiveResourceSearchAbortController = new AbortController();

  const params = new URLSearchParams();
  params.set("q", query);
  params.set("context", "archive");
  params.set("limit", "40");

  const response = await fetch(`/api/search/resources?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    signal: archiveResourceSearchAbortController.signal
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data.detail ||
      data.error ||
      "Resource search failed"
    );
  }

  return Array.isArray(data.records) ? data.records : [];
}

async function archiveLoadResourceSearchResults() {
  const panel = archiveEnsureResourceSearchPanel();

  if (!panel) return;

  const query = archiveResourceSearchQuery();

  if (query.length < 2) {
    archiveResourceSearchRecords = [];
    archiveRenderResourceSearchResults([]);
    return;
  }

  panel.hidden = false;
  panel.innerHTML = `
    <div class="archive-resource-search-loading">
      <span class="mini-spinner"></span>
      ${t("searching", "Searching...")}
    </div>
  `;

  try {
    const records = await archiveFetchResourceSearchResults(query);
    archiveResourceSearchRecords = records;
    archiveRenderResourceSearchResults(records);
  } catch (error) {
    if (error.name === "AbortError") return;

    console.warn("Archive resource search failed:", error);

    panel.hidden = false;
    panel.innerHTML = `
      <div class="archive-resource-search-error">
        ${t("could_not_load_related_record", "Could not load related record")}
      </div>
    `;
  }
}

function archiveRenderNativeRelatedResourceCard(record, index) {
  const relatedLines = archiveRelatedToLines(record, { limit: 3 });

  const resourceIndex = Number.isInteger(record._resourceSearchIndex)
    ? record._resourceSearchIndex
    : index;

  return `
    <div
      class="archive-resource-search-card archive-resource-search-card-related"
      data-resource-search-index="${resourceIndex}"
      data-resource-search-action="open-archive"
      role="button"
      tabindex="0"
    >
      <div class="archive-resource-card-title">
        ${archiveSafeSearchText(record.display_label || record.caal_id)}
      </div>

      <div class="archive-resource-card-id">
        ${archiveSafeSearchText(record.caal_id)}
      </div>

      ${relatedLines}
    </div>
  `;
}

function archiveRenderPreviewOnlyResourceCard(record, index) {
  const resourceIndex = Number.isInteger(record._resourceSearchIndex)
    ? record._resourceSearchIndex
    : index;

  const typeLabel = archiveResourceTypeLabel(record);
  const caalId = String(record?.caal_id || "").trim();
  const title = record?.display_label || caalId;

  return `
    <div
      class="archive-resource-search-card archive-resource-search-card-preview-only"
      data-resource-search-index="${resourceIndex}"
    >
      <div class="archive-resource-preview-row">
        <div class="archive-resource-preview-text">
          <div class="archive-resource-card-compact-line">
            <span class="archive-resource-type">${archiveSafeSearchText(typeLabel)}</span>
            <span class="archive-resource-card-id">${archiveSafeSearchText(caalId)}</span>
          </div>

          <div class="archive-resource-card-title archive-resource-card-title-compact">
            ${archiveSafeSearchText(title)}
          </div>
        </div>

        <button
          type="button"
          class="archive-resource-preview-btn"
          data-resource-search-index="${resourceIndex}"
          title="${t("preview", "Preview")}"
          aria-label="${t("record_preview", "Record preview")}: ${archiveAttributeValue(caalId)}"
        >
          ${archiveSvgEyeIcon()}
        </button>
      </div>
    </div>
  `;
}

function archiveRenderResourceSearchSection(title, records, renderCard) {
  if (!records.length) return "";

  return `
    <section class="archive-resource-search-section">
      <h4 class="archive-resource-search-heading">
        ${title} <span class="archive-resource-search-count">(${records.length})</span>
      </h4>

      <div class="archive-resource-search-list">
        ${records.map(renderCard).join("")}
      </div>
    </section>
  `;
}

function archiveRenderResourceSearchResults(records) {
  const panel = archiveEnsureResourceSearchPanel();

  if (!panel) return;

  const groups = archiveGroupResourceSearchRecords(records);

  if (!groups.nativeRelated.length && !groups.otherPreview.length) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  panel.hidden = false;

  panel.innerHTML = `
    ${archiveRenderResourceSearchSection(
      t("related_records", "Related records"),
      groups.nativeRelated,
      archiveRenderNativeRelatedResourceCard
    )}

    ${archiveRenderResourceSearchSection(
      t("other_caal_records", "Other CAAL records"),
      groups.otherPreview,
      archiveRenderPreviewOnlyResourceCard
    )}
  `;

  archiveWireResourceSearchCards();
}

async function archiveOpenResourceSearchArchiveRecord(record) {
  const caalId = String(record?.caal_id || "").trim();

  if (!caalId || archiveRecordOpenInProgress) return;
  if (!archiveConfirmLoseChanges()) return;

  setArchiveRecordOpening(true);
  setArchiveLoading(true, t("loading_full_record", "Loading full record..."));

  try {
    const resolved = await loadDirectLinkedRecord(caalId);

    if (resolved?.record_type !== "archive" || !resolved.record) {
      await archivePreviewResourceSearchRecord(record);
      return;
    }

    archivePendingNewRecord = null;
    archiveSelectedRecord = resolved.record;
    archiveIsEditMode = false;
    archiveIsDirty = false;

    archiveRenderRecordDetails(resolved.record);
    archiveUpdateSelectedResultCard();
  } catch (error) {
    console.error("Could not open resource-search archive record:", error);
    alert(
      error.message ||
      t("could_not_load_full_archive_record", "Could not load full archive record")
    );
  } finally {
    setArchiveLoading(false);
    setArchiveRecordOpening(false);
  }
}

function archiveOpenGenericResourceSearchPreview(record) {
  if (!archivePreviewModal || !archivePreviewBody || !archivePreviewTitle) return;

  const title = record?.display_label || record?.caal_id || t("record_preview", "Record preview");
  const typeLabel = archiveResourceTypeLabel(record);
  const fullRecordUrl =
    typeof getRelatedRecordUrl === "function"
      ? getRelatedRecordUrl(record.caal_id, record.record_type, null)
      : null;

  archivePreviewTitle.textContent = title;

  archivePreviewBody.innerHTML = `
    <div class="record-title related-record-title">
      <div>
        <h3>${archiveSafeSearchText(title)}</h3>
        <p>${archiveSafeSearchText(record?.caal_id)}</p>
      </div>

      <span class="related-record-type-badge">
        ${archiveSafeSearchText(typeLabel)}
      </span>

      ${
        fullRecordUrl
          ? `<button type="button" class="action-btn" id="archiveOpenAssociatedFullRecordBtn">
              ${t("open_full_record", "Open full record")}
            </button>`
          : ""
      }
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("record_preview", "Record preview")}</span>
          </div>

          ${archiveCopyableDetailItem(archiveLabel("CAAL_ID", "CAAL_ID"), record?.caal_id)}
          ${archiveRenderDetailItem(t("record_type", "Record type"), typeLabel)}
          ${archiveRenderDetailItem(t("title_or_name", "Title or name"), record?.display_label, true)}
          ${archiveRenderDetailItem(t("source_table", "Source table"), record?.source_table)}
        </div>
      </div>
    </div>
  `;

  archivePreviewModal.hidden = false;
  archiveWireCopyFieldButtons(archivePreviewModal);
  archiveWireAssociatedPreviewButtons(fullRecordUrl);
}

async function archivePreviewResourceSearchRecord(record) {
  const caalId = String(record?.caal_id || "").trim();

  if (!caalId) return;

  if (record.record_type === "archive" || record.record_type === "monument") {
    await archiveOpenAssociatedRecord(caalId);
    return;
  }

  if (record.record_type === "institution") {
    await archiveOpenInstitutionPreview(caalId);
    return;
  }

  archiveOpenGenericResourceSearchPreview(record);
}

function archiveWireResourceSearchCards() {
  const panel = archiveEnsureResourceSearchPanel();

  if (!panel) return;

  panel.querySelectorAll(".archive-resource-preview-btn").forEach((btn) => {
    if (btn.dataset.resourcePreviewWired === "true") return;

    btn.dataset.resourcePreviewWired = "true";

    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const index = Number(btn.dataset.resourceSearchIndex);
      const record = archiveResourceSearchRecords[index];

      if (!record) return;

      await archivePreviewResourceSearchRecord(record);
    });
  });

  panel.querySelectorAll(".archive-resource-search-card-related").forEach((card) => {
    if (card.dataset.resourceCardWired === "true") return;

    card.dataset.resourceCardWired = "true";

    const openOrPreview = async () => {
      const index = Number(card.dataset.resourceSearchIndex);
      const record = archiveResourceSearchRecords[index];

      if (!record) return;

      if (archiveIsEditMode) {
        await archivePreviewResourceSearchRecord(record);
        return;
      }

      await archiveOpenResourceSearchArchiveRecord(record);
    };

    card.addEventListener("click", openOrPreview);

    card.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;

      event.preventDefault();
      await openOrPreview();
    });
  });
}

// edit/add helpers
async function archiveDeleteCurrentRecord() {
  const record = archiveSelectedRecord;

  if (!record?.identity?.id) return;

  if (record.source?.scope !== "workspace") {
    alert(archiveLabel("Only workspace records can be deleted.", "Only workspace records can be deleted."));
    return;
  }

  const caalId = record.identity?.caal_id || archiveLabel("this record", "this record");
  const title = record.summary?.original_title || record.summary?.english_title || "";

  const confirmed = window.confirm(
    `${archiveLabel("Delete archive record", "Delete archive record")} ${caalId}?\n\n${title}\n\n` +
    archiveLabel(
      "This will remove it from the workspace, but a recovery copy will be kept in the registry.",
      "This will remove it from the workspace, but a recovery copy will be kept in the registry."
    )
  );

  if (!confirmed) return;

  const reason = window.prompt(
    archiveLabel("Optional delete reason", "Optional delete reason"),
    ""
  );

  setArchiveLoading(true, archiveLabel(t("deleting_record", "Deleting record...")));

  try {
    const response = await fetch(`/api/archive/${record.identity.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        reason: reason || null,
        _storage_scope: record.source?.storage || null,
        _source_scope: record.source?.scope || null
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.detail || data.error || t("archive_delete_failed", "Archive delete failed"));
      return;
    }

    archivePendingNewRecord = null;
    archiveSelectedRecord = null;
    archiveIsEditMode = false;
    archiveIsDirty = false;

    showArchiveToast(
      archiveLabel(t("archive_record_deleted", "Archive record deleted"))
    );

    await loadArchiveRecords(archiveLimit, archiveOffset);
    renderArchiveEmptyState();
  } catch (error) {
    console.error("Archive delete failed:", error);
    alert(error.message || t("archive_delete_failed", "Archive delete failed"));
  } finally {
    setArchiveLoading(false);
  }
}

function archiveInputId(fieldName) {
  return "archive_fld_" + fieldName.replace(/[^a-zA-Z0-9]+/g, "_");
}

function archiveAttributeValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function archiveRenderTextInput(fieldName, label, value, fullWidth = false) {
  const inputId = archiveInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <input
        type="text"
        id="${inputId}"
        class="form-control"
        value="${archiveAttributeValue(value ?? "")}"
        data-field-name="${archiveAttributeValue(fieldName)}"
        data-original-value="${archiveAttributeValue(value ?? "")}"
      >
    </div>
  `;
}

function archiveRenderTextarea(fieldName, label, value, fullWidth = true) {
  const inputId = archiveInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <textarea
        id="${inputId}"
        class="form-control"
        rows="4"
        data-field-name="${archiveAttributeValue(fieldName)}"
        data-original-value="${archiveAttributeValue(value ?? "")}"
      >${archiveAttributeValue(value ?? "")}</textarea>
    </div>
  `;
}

function archiveLookupSortLabel(item) {
  return String(
    item?.label ||
    item?.display_label ||
    item?.value ||
    ""
  ).trim();
}

const ARCHIVE_ORDERED_LOOKUPS = new Set([
  "condition_original_material",
  "copyright_status"
]);

function archiveLookupOptions(lookupName, { sort = true } = {}) {
  const options = Array.isArray(archiveLookups?.[lookupName])
    ? [...archiveLookups[lookupName]]
    : [];

  const shouldSort = sort && !ARCHIVE_ORDERED_LOOKUPS.has(lookupName);

  if (!shouldSort) {
    return options;
  }

  return options.sort((a, b) => {
    return archiveLookupSortLabel(a).localeCompare(
      archiveLookupSortLabel(b),
      archiveCurrentLanguageCode(),
      {
        sensitivity: "base",
        numeric: true
      }
    );
  });
}

function archiveLookupLabel(lookupName, value) {
  const options = archiveLookupOptions(lookupName);
  const match = options.find((item) => String(item.value ?? "") === String(value ?? ""));
  return match ? (match.label ?? match.value ?? value) : value;
}

function archiveRenderLookupMultiValue(lookupName, rawValue) {
  return archiveArrayValue(rawValue)
    .map((value) => archiveLookupLabel(lookupName, value))
    .join(", ");
}

function archiveRenderLookupSingleValue(lookupName, rawValue) {
  if (!archiveHasRealValue(rawValue)) return rawValue;
  return archiveLookupLabel(lookupName, rawValue);
}

function archiveRenderSelect(fieldName, label, lookupName, currentValue, fullWidth = false, lookupOptions = {}) {
  const inputId = archiveInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  const optionsHtml = archiveLookupOptions(lookupName, lookupOptions)
    .map((item) => {
      const value = item.value ?? "";
      const selected = String(value) === String(currentValue ?? "") ? "selected" : "";
      return `<option value="${value}" ${selected}>${item.label ?? value}</option>`;
    })
    .join("");

  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <select
        id="${inputId}"
        class="form-control"
        data-field-name="${archiveAttributeValue(fieldName)}"
        data-original-value="${archiveAttributeValue(currentValue ?? "")}"
      >
        <option value=""></option>
        ${optionsHtml}
      </select>
    </div>
  `;
}

function archiveRenderMultiSelect(fieldName, label, lookupName, currentValue, fullWidth = false) {
  const inputId = archiveInputId(fieldName);
  const chipsId = `${inputId}_chips`;
  const fullWidthClass = fullWidth ? " full-width" : "";
  const selectedValues = archiveArrayValue(currentValue).map(String);

  const optionsHtml = archiveLookupOptions(lookupName)
    .map((item) => {
      const value = String(item.value ?? "");
      const selected = selectedValues.includes(value) ? "selected" : "";
      return `<option value="${value}" ${selected}>${item.label ?? value}</option>`;
    })
    .join("");

  return `
    <div class="detail-item${fullWidthClass} archive-edit-chip-multiselect">
      <label class="detail-label" for="${inputId}">${label}</label>
      <div class="selected-filter-chips archive-edit-selected-chips" id="${chipsId}"></div>
      <select
        id="${inputId}"
        class="form-control chip-multiselect archive-edit-multiselect"
        multiple
        data-chip-target="${chipsId}"
        data-field-name="${archiveAttributeValue(fieldName)}"
        data-original-value="${archiveAttributeValue(selectedValues.join(", "))}"
      >
        ${optionsHtml}
      </select>
      <p class="filter-help">${t("filter_click_toggle_help", "Click values to select or deselect. Selected values appear above.")}</p>
    </div>
  `;
}

function archiveRenderEditMultiSelectChips(selectEl) {
  if (!selectEl) return;

  const chipsId = selectEl.dataset.chipTarget;
  const chipsEl = chipsId ? document.getElementById(chipsId) : null;

  if (!chipsEl) return;

  const selected = Array.from(selectEl.options)
    .filter((option) => option.selected)
    .map((option) => ({
      value: option.value,
      label: option.textContent || option.value
    }));

  chipsEl.innerHTML = "";

  if (!selected.length) {
    const empty = document.createElement("span");
    empty.className = "filter-chip-empty";
    empty.textContent = t("no_values_selected", "No values selected");
    chipsEl.appendChild(empty);
    return;
  }

  selected.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filter-chip";
    chip.dataset.value = item.value;
    chip.innerHTML = `
      <span>${item.label}</span>
      <span class="filter-chip-remove" aria-hidden="true">×</span>
    `;

    chip.addEventListener("click", () => {
      const option = Array.from(selectEl.options).find(
        (opt) => opt.value === item.value
      );

      if (option) {
        option.selected = false;
      }

      archiveIsDirty = true;
      archiveRenderEditMultiSelectChips(selectEl);

      selectEl.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    });

    chipsEl.appendChild(chip);
  });
  updateArchiveChangedFieldState(selectEl);
}

function archiveWireEditMultiSelects() {
  if (!archiveRecordDetails) return;

  const selects = Array.from(
    archiveRecordDetails.querySelectorAll("select.archive-edit-multiselect")
  );

  selects.forEach((selectEl) => {
    if (selectEl.dataset.editChipWired === "true") {
      archiveRenderEditMultiSelectChips(selectEl);
      return;
    }

    selectEl.addEventListener("mousedown", (event) => {
      const option = event.target;

      if (!option || option.tagName !== "OPTION") return;

      event.preventDefault();

      option.selected = !option.selected;
      archiveIsDirty = true;

      archiveRenderEditMultiSelectChips(selectEl);

      selectEl.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    });

    selectEl.addEventListener("change", () => {
      archiveRenderEditMultiSelectChips(selectEl);
    });

    selectEl.dataset.editChipWired = "true";
    archiveRenderEditMultiSelectChips(selectEl);
  });
}

function normaliseArchiveEditCompareValue(value) {
  return String(value ?? "").trim();
}

function getArchiveFieldCurrentCompareValue(fieldEl) {
  if (!fieldEl) return "";

  if (fieldEl.multiple) {
    return Array.from(fieldEl.selectedOptions || [])
      .map((option) => option.value)
      .filter(Boolean)
      .join(", ");
  }

  return fieldEl.value;
}

function updateArchiveChangedFieldState(fieldEl) {
  if (!fieldEl) return;

  const original = normaliseArchiveEditCompareValue(fieldEl.dataset.originalValue);
  const current = normaliseArchiveEditCompareValue(
    getArchiveFieldCurrentCompareValue(fieldEl)
  );

  const changed = original !== current;

  const wrapper = fieldEl.closest(".detail-item");

  if (wrapper) {
    wrapper.classList.toggle("field-changed", changed);
  }

  fieldEl.classList.toggle("field-changed-input", changed);
}

function wireArchiveChangedFieldHighlights(root = archiveRecordDetails) {
  if (!root) return;

  const fields = root.querySelectorAll(
    "input[data-field-name], textarea[data-field-name], select[data-field-name]"
  );

  fields.forEach((field) => {
    if (field.dataset.changeHighlightWired === "true") {
      updateArchiveChangedFieldState(field);
      return;
    }

    const handler = () => {
      updateArchiveChangedFieldState(field);
    };

    field.addEventListener("input", handler);
    field.addEventListener("change", handler);

    field.dataset.changeHighlightWired = "true";
    updateArchiveChangedFieldState(field);
  });
}

function archiveRenderReadOnlyItem(label, value, fullWidth = false) {
  return archiveRenderDetailItem(label, value, fullWidth);
}

function archiveGetInputValue(fieldName) {
  const el = document.getElementById(archiveInputId(fieldName));
  return el ? el.value : "";
}

function archiveGetMultiSelectValue(fieldName) {
  const el = document.getElementById(archiveInputId(fieldName));
  if (!el) return "";

  return Array.from(el.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean)
    .join(", ");
}

function archiveBuildSavePayload() {
  const payload = {
    "Level": archiveGetInputValue("Level"),
    "Original Reference": archiveGetInputValue("Original Reference"),
    "Associated CAAL_ID": normaliseArchiveAssociatedIdList(
      archiveGetInputValue("Associated CAAL_ID")
    ),
    "Original Title": archiveGetInputValue("Original Title"),
    "English Title": archiveGetInputValue("English Title"),
    "Content Type": archiveGetInputValue("Content Type"),
    "Description": archiveGetInputValue("Description"),
    "Description - alternative language": archiveGetInputValue("Description - alternative language"),
    "Number and Type of Original Material": archiveGetInputValue("Number and Type of Original Material"),
    "Size and Dimensions of Original Material": archiveGetInputValue("Size and Dimensions of Original Material"),
    "Condition of Original Material": archiveGetInputValue("Condition of Original Material"),
    "Related Countries": archiveGetMultiSelectValue("Related Countries"),
    "Related Towns and Cities": archiveGetInputValue("Related Towns and Cities"),
    "Related Religions": archiveGetMultiSelectValue("Related Religions"),
    "Related Subjects": archiveGetMultiSelectValue("Related Subjects"),
    "Other Subjects": archiveGetInputValue("Other Subjects"),
    "Dates of Original Material": archiveGetInputValue("Dates of Original Material"),
    "Author of the Original Material": archiveGetInputValue("Author of the Original Material"),
    "Publisher of the Original Material": archiveGetInputValue("Publisher of the Original Material"),
    "Editor of the Original Material": archiveGetInputValue("Editor of the Original Material"),
    "Volume and Issue Number": archiveGetInputValue("Volume and Issue Number"),
    "Languages of Material": archiveGetMultiSelectValue("Languages of Material"),
    "Script of Material": archiveGetInputValue("Script of Material"),
    "Writing System": archiveGetInputValue("Writing System"),
    "still_under_copyright": archiveGetInputValue("still_under_copyright"),
    "Copyright Holder Name": archiveGetInputValue("Copyright Holder Name"),
    "Copyright Attribution": archiveGetInputValue("Copyright Attribution"),
    "Digital Folder Name": archiveGetInputValue("Digital Folder Name"),
    "Digital Files Name": archiveGetInputValue("Digital Files Name"),
    "Creation Date of Digital Files": archiveGetInputValue("Creation Date of Digital Files"),
    "Format of Digital Files": archiveGetInputValue("Format of Digital Files"),
    "Number of Digital Files": archiveGetInputValue("Number of Digital Files"),
    "Colour": archiveGetInputValue("Colour"),
    "Resolution": archiveGetInputValue("Resolution"),
    "Resource": archiveGetInputValue("Resource"),
    "Country": archiveGetInputValue("Country")
  };

  payload._storage_scope = archiveSelectedRecord?.source?.storage || null;
  payload._source_scope = archiveSelectedRecord?.source?.scope || null;

  payload._holding_institution_caal_id =
    document.getElementById("archiveHoldingInstitutionCaalId")?.value || "";

  return payload;
}

// add helper

function makeNewBlankArchiveRecord() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const sessionCountry = window.appSession?.profile?.country || "";
  const sessionUsername = window.appSession?.user?.username || "";
  const today = new Date().toISOString().slice(0, 10);

  return {
    identity: {
      id: null,
      caal_id: t("assigned_on_save", "Assigned on save"),
      associated_caal_id: ""
    },
    summary: {
      original_title: "",
      english_title: "",
      original_reference: "",
      content_type: "",
      country: sessionCountry,
      level: "",
      archive_recorder: sessionUsername,
      date_of_recording: today
    },
    raw: {
      "Level": "",
      "Original Reference": "",
      "CAAL_ID": "",
      "Associated CAAL_ID": "",
      "Original Title": "",
      "English Title": "",
      "Content Type": "",
      "Description": "",
      "Description - alternative language": "",
      "Number and Type of Original Material": "",
      "Size and Dimensions of Original Material": "",
      "Condition of Original Material": "",
      "Related Countries": "",
      "Related Towns and Cities": "",
      "Related Religions": "",
      "Related Subjects": "",
      "Other Subjects": "",
      "Dates of Original Material": "",
      "Author of the Original Material": "",
      "Publisher of the Original Material": "",
      "Editor of the Original Material": "",
      "Volume and Issue Number": "",
      "Languages of Material": "",
      "Script of Material": "",
      "Writing System": "",
      "Still under CopyrightYN": "",
      "Copyright Holder Name": "",
      "Copyright Attribution": "",
      "Digital Folder Name": "",
      "Digital Files Name": "",
      "Creation Date of Digital Files": "",
      "Format of Digital Files": "",
      "Number of Digital Files": "",
      "Colour": "",
      "Resolution": "",
      "Archive Recorder": sessionUsername,
      "Date of Recording": today,
      "Resource": "",
      "Preferred Language": lang,
      "still_under_copyright": null,
      "Tstamp": "",
      "Country": sessionCountry
    },
    source: {
      scope: "workspace",
      is_editable: true,
      is_new: true
    }
  };
}

const archiveDetailPane = document.getElementById("archiveDetailPane");

function archiveSyncModeVisualState() {
  if (!archiveDetailPane) return;
  archiveDetailPane.classList.toggle("archive-editing", archiveIsEditMode);
}


// Record field helpers
// --------------------------------------------------------
function archiveRaw(record, fieldName) {
  return record?.raw?.[fieldName] ?? null;
}

function archiveSummary(record, fieldName) {
  return record?.summary?.[fieldName] ?? null;
}

function archiveIdentity(record, fieldName) {
  return record?.identity?.[fieldName] ?? null;
}

// Render helpers
// --------------------------------------------------------
function archiveRenderDetailItem(label, value, fullWidth = false) {
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <span class="detail-label">${label}</span>
      <div class="detail-value">${safeArchiveValue(value)}</div>
    </div>
  `;
}

function archiveRenderDetailHtmlItem(label, htmlValue, fullWidth = false) {
  const fullWidthClass = fullWidth ? " full-width" : "";

  return `
    <div class="detail-item${fullWidthClass}">
      <span class="detail-label">${label}</span>
      <div class="detail-value">${htmlValue}</div>
    </div>
  `;
}

function archiveNormaliseDoi(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?(dx\.)?doi\.org\//i, "")
    .replace(/^(www\.)?(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

function archiveRenderDoiValue(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return safeArchiveValue("");
  }

  const doi = archiveNormaliseDoi(raw);

  if (!doi) {
    return safeArchiveValue(raw);
  }

  const href = `https://doi.org/${encodeURIComponent(doi).replace(/%2F/g, "/")}`;

  return `
    <a
      href="${archiveAttributeValue(href)}"
      target="_blank"
      rel="noopener noreferrer"
      class="archive-doi-link"
    >
      ${safeArchiveValue(href)}
    </a>
  `;
}

function archiveSvgCopyIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
      <path
        d="M8 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V7Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      />
      <path
        d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function archiveSvgEyeIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.8"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      />
    </svg>
  `;
}

function archiveCopyableDetailItem(label, value, fullWidth = false) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue) {
    return archiveRenderDetailItem(label, safeArchiveValue(""), fullWidth);
  }

  return `
    <div class="detail-item${fullWidth ? " full-width" : ""}">
      <span class="detail-label">${label}</span>
      <div class="detail-value copyable-field">
        <span class="copyable-field-text">${safeArchiveValue(cleanValue)}</span>
        <button
          type="button"
          class="copy-field-btn"
          data-copy-value="${safeArchiveValue(cleanValue)}"
          title="${t("copy_to_clipboard", "Copy to clipboard")}"
          aria-label="${t("copy_to_clipboard", "Copy to clipboard")}: ${cleanValue}"
        >
          ${archiveSvgCopyIcon()}
        </button>
      </div>
    </div>
  `;
}

function archiveWireCopyFieldButtons(root = document) {
  root.querySelectorAll(".copy-field-btn").forEach((btn) => {
    if (btn.dataset.copyWired === "true") return;

    btn.dataset.copyWired = "true";

    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const value = btn.dataset.copyValue || "";
      if (!value) return;

      try {
        await navigator.clipboard.writeText(value);

        btn.classList.remove("copied", "copy-pulse");

        // Restart animation if clicked repeatedly.
        void btn.offsetWidth;

        btn.classList.add("copied", "copy-pulse");
        btn.title = t("copied", "Copied");

        const oldLabel = btn.querySelector(".copy-confirm-label");
        if (oldLabel) oldLabel.remove();

        const label = document.createElement("span");
        label.className = "copy-confirm-label";
        label.textContent = t("copied", "Copied");
        btn.appendChild(label);

        setTimeout(() => {
          btn.classList.remove("copied", "copy-pulse");
          btn.title = t("copy_to_clipboard", "Copy to clipboard");

          const currentLabel = btn.querySelector(".copy-confirm-label");
          if (currentLabel) currentLabel.remove();
        }, 1200);
      } catch (error) {
        console.warn("Clipboard copy failed:", error);
      }
    });
  });
}

function archiveRelationGroupLabel(rel) {
  if (rel.relation_direction === "reverse") {
    return t("referenced_by_resources", "Referenced by resources");
  }

  return rel.relation_type || t("related_resources", "Related resources");
}

function groupArchiveRelationsByDisplayLabel(record) {
  const relations = getRecordRelations(record);
  const groups = {};

  relations.forEach((rel) => {
    const key = archiveRelationGroupLabel(rel);

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(rel);
  });

  return groups;
}

function archiveRenderResourceRelations(record) {
  const groups = groupArchiveRelationsByDisplayLabel(record);
  const entries = Object.entries(groups);

  if (!entries.length) {
    return `
      <div class="detail-item full-width">
        <div class="detail-value">
          ${archiveLabel("No related resources are recorded for this resource.", "No related resources are recorded for this resource.")}
        </div>
      </div>
    `;
  }

  return entries.map(([relationType, relations]) => {
    const chips = relations.map((rel) => {
      const relatedId = rel.related_caal_id || "";
      const unresolved = rel.related_id_exists === false;

      return `
        <button
          type="button"
          class="${relationChipClass(rel)} archive-associated-id-chip"
          data-associated-caal-id="${relatedId}"
          data-relation-edge-id="${rel.edge_id || ""}"
          title="${
            unresolved
              ? t("related_id_not_found", "Related ID not found in current resource tables")
              : t("open_related_record", "Open related record")
          }"
        >
          ${relatedId}
        </button>
      `;
    }).join("");

    return `
      <div class="detail-item full-width">
        <span class="detail-label">${archiveLabel(relationType, relationType)}</span>
        <div class="detail-value related-id-list archive-associated-id-list">
          ${chips}
        </div>
      </div>
    `;
  }).join("");
}

async function loadFullArchiveRecord(record, langOverride = null) {
  const caalId = archiveIdentity(record, "caal_id") || archiveRaw(record, "CAAL_ID");
  const recordId = archiveIdentity(record, "id") || record?.identity?.id;

  if (!caalId) {
    return record;
  }

  const lang = archiveCurrentLanguageCode(langOverride);

  if (
    archiveUserCanUseLiveCacheWorkaround() &&
    recordId !== null &&
    recordId !== undefined &&
    String(record?.source?.storage || "") === "public_caal"
  ) {
    const liveResponse = await fetch(
      `/api/archive/${encodeURIComponent(recordId)}/live-full-record?lang=${encodeURIComponent(lang)}`,
      {
        method: "GET",
        credentials: "include"
      }
    );

    const liveData = await liveResponse.json();

    if (!liveResponse.ok || !liveData.ok || !liveData.record) {
      throw new Error(
        liveData.detail ||
        liveData.error ||
        t("could_not_load_full_archive_record", "Could not load full archive record")
      );
    }

    liveData.record.source = liveData.record.source || {};

    if (record?.source) {
      liveData.record.source.scope = record.source.scope;
      liveData.record.source.storage = record.source.storage;
      liveData.record.source.is_promoted = record.source.is_promoted;
      liveData.record.source.is_editable = record.source.is_editable === true;
    } else {
      liveData.record.source.is_editable = false;
    }

    return liveData.record;
  }

  const response = await fetch(
    `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}&lang=${encodeURIComponent(lang)}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok || !data.record) {
    throw new Error(
      data.detail ||
      data.error ||
      t("could_not_load_full_archive_record", "Could not load full archive record")
    );
  }

  if (data.record_type !== "archive") {
    throw new Error(t("resolved_record_not_archive", "Resolved record is not an archive record"));
  }

  data.record.source = data.record.source || {};

  if (record?.source) {
    data.record.source.scope = record.source.scope;
    data.record.source.storage = record.source.storage;
    data.record.source.is_promoted = record.source.is_promoted;
    data.record.source.is_editable = record.source.is_editable === true;
  } else {
    data.record.source.is_editable = false;
  }

  return data.record;
}

function archiveRenderAssociatedCaalIdChips(label, value, fullWidth = true) {
  const ids = archiveParseAssociatedCaalIds(value);

  const inner = ids.length
    ? ids.map((id) => {
        const looksValid = archiveIsLikelyCaalId(id);

        if (!looksValid) {
          return `
            <span
              class="related-id-chip related-id-chip-invalid"
              title="${t("invalid_related_id_format", "Invalid related ID format")}"
            >
              ${id}
            </span>
          `;
        }

        return `
          <button
            type="button"
            class="related-id-chip archive-associated-id-chip"
            data-associated-caal-id="${id}"
            title="${t("open_related_record", "Open related record")}"
          >
            ${id}
          </button>
        `;
      }).join("")
    : safeArchiveValue("");

  return `
    <div class="detail-item${fullWidth ? " full-width" : ""}">
      <span class="detail-label">${label}</span>
      <div class="detail-value related-id-list archive-associated-id-list">
        ${inner}
      </div>
    </div>
  `;
}

function archiveRenderAssociatedCaalIdChipList(value) {
  const ids = archiveParseAssociatedCaalIds(value);

  if (!ids.length) {
    return safeArchiveValue("");
  }

  return ids.map((id) => {
    const looksValid = archiveIsLikelyCaalId(id);

    if (!looksValid) {
      return `
        <span
          class="related-id-chip related-id-chip-invalid archive-associated-id-chip-static"
          title="${t("invalid_related_id_format", "Invalid related ID format")}"
        >
          ${id}
        </span>
      `;
    }

    return `
      <button
        type="button"
        class="related-id-chip archive-associated-id-chip"
        data-associated-caal-id="${id}"
        title="${t("open_related_record", "Open related record")}"
      >
        ${id}
      </button>
    `;
  }).join("");
}

function archiveGetAssociatedRelations(record) {
  const relations = Array.isArray(record?.relations) ? record.relations : [];

  return relations.filter((rel) => {
    const relatedId = String(rel.related_caal_id || "").trim();
    if (!relatedId) return false;

    return (
      rel.source_fields?.includes?.("Associated CAAL_ID") ||
      rel.related_id_found_in === "CAAL_Monuments" ||
      relatedId.startsWith("Mon_")
    );
  });
}

function archiveRenderAssociatedRelationChips(record) {
  const relations = archiveGetAssociatedRelations(record);

  if (!relations.length) {
    return `<span class="empty-value">${t("not_recorded", "Not recorded")}</span>`;
  }

  return relations.map((rel) => {
    const relatedId = rel.related_caal_id || "";
    const missing = rel.related_id_exists === false;

    return `
      <button
        type="button"
        class="${relationChipClass(rel)} archive-associated-id-chip"
        data-associated-caal-id="${relatedId}"
        data-relation-edge-id="${String(rel.edge_id || "")}"
        title="${
          missing
            ? t("related_id_not_found", "Related ID not found in current resource tables")
            : t("open_related_record", "Open related record")
        }"
      >
        ${relatedId}
      </button>
    `;
  }).join("");
}

function archiveGetHoldingInstitutionRelation(record) {
  const direct = record?.holding_institution;
  if (direct?.caal_id) return direct;

  const relations = Array.isArray(record?.relations) ? record.relations : [];

  const rel = relations.find((item) => {
    const relationType = String(
      item.relation_type_norm ||
      item.relation_type ||
      ""
    ).trim().toLowerCase();

    const relatedId = String(item.related_caal_id || "").trim();

    return (
      relationType === "holding_institution" ||
      relationType === "holding institution" ||
      relationType === "is created by / created" ||
      relatedId.startsWith("Act_")
    );
  });

  if (!rel) return null;

  return {
    caal_id: rel.related_caal_id,
    primary_name:
      rel.related_primary_name ||
      rel.related_label ||
      rel.related_title ||
      rel.related_name ||
      rel.related_caal_id,
    name_ru: rel.related_name_ru || "",
    actor_type: rel.related_actor_type || "",
    country: rel.related_country || ""
  };
}

function archiveRenderHoldingInstitutionChip(record) {
  const inst = archiveGetHoldingInstitutionRelation(record);

  if (!inst?.caal_id) {
    return `
      <span class="empty-value">
        ${t("holding_institution_missing", "No holding institution recorded")}
      </span>
    `;
  }

  const label = archiveInstitutionDisplayName(inst) || inst.caal_id;
  const subtitle = [
    archiveInstitutionSecondaryName(inst),
    inst.actor_type,
    inst.country,
    inst.caal_id
  ]

  return `
    <button
      type="button"
      class="related-id-chip institution-chip archive-holding-institution-chip"
      data-institution-caal-id="${inst.caal_id}"
      title="${subtitle || ""}"
    >
      ${safeArchiveValue(label)}
    </button>
  `;
}

function archiveRenderHoldingInstitutionDetail(record, { fullWidth = false } = {}) {
  return `
    <div class="detail-item${fullWidth ? " full-width" : ""} holding-institution-detail">
      <span class="detail-label">
        ${t("holding_institution", "Holding Institution")}
      </span>
      <div class="detail-value related-id-list archive-institution-chip-list">
        ${archiveRenderHoldingInstitutionChip(record)}
      </div>
    </div>
  `;
}

function archiveRenderTitleCard(record, statusBadge = "") {
  const caalId =
    archiveIdentity(record, "caal_id") ||
    archiveRaw(record, "CAAL_ID") ||
    archiveLabel("Assigned on save", "Assigned on save");

  return `
    <div class="${archiveRecordTitleClass(record)} archive-title-card">
      <div class="record-title-row">
        <div>
          <h3 class="archive-title-caal-id">${safeArchiveValue(caalId)}</h3>
          <div class="archive-title-associated-id related-id-list">
            <strong>${archiveLabel("Associated CAAL_ID", "Associated CAAL_ID")}:</strong>
            ${archiveRenderAssociatedRelationChips(record)}
          </div>
        </div>
        ${statusBadge}
      </div>
    </div>
  `;
}

function archiveRenderIdentityStrip(record, { isNew = false } = {}) {
  const caalId = archiveIdentity(record, "caal_id") || archiveRaw(record, "CAAL_ID");
  const associatedId =
    archiveIdentity(record, "associated_caal_id") ||
    archiveRaw(record, "Associated CAAL_ID");

  return `
    <div class="record-identity-strip">
      <div class="record-identity-item">
        <span class="record-identity-label">${archiveLabel("CAAL_ID", "CAAL_ID")}</span>
        <strong>${safeArchiveValue(isNew || !caalId ? archiveLabel("Assigned on save", "Assigned on save") : caalId)}</strong>
      </div>

      <div class="record-identity-item">
        <span class="record-identity-label">${archiveLabel("Associated CAAL_ID", "Associated CAAL_ID")}</span>
        <strong>${safeArchiveValue(associatedId)}</strong>
      </div>
    </div>
  `;
}

function archiveRenderGroupBlock(title, innerHtml, hasValues = true) {
  const content = hasValues
    ? innerHtml
    : `<div class="section-empty">${t("no_populated_fields", "No populated fields in this section.")}</div>`;

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${title}</span>
        </div>
        ${content}
      </div>
    </div>
  `;
}

// related
function wireArchiveAssociatedCaalIdChips() {
  Array.from(document.querySelectorAll(".archive-associated-id-chip")).forEach((btn) => {
    if (btn.dataset.associatedChipWired === "true") return;

    btn.dataset.associatedChipWired = "true";

    btn.addEventListener("click", async () => {
      const caalId = btn.dataset.associatedCaalId;
      if (!caalId) return;

      await archiveOpenAssociatedRecord(caalId);
    });
  });
}

async function archiveOpenAssociatedRecord(caalId) {
  if (!caalId) return;
  if (archiveRecordOpenInProgress) return;

  setArchiveRecordOpening(true);
  setArchiveLoading(true, t("loading_preview", "Loading preview..."));

  try {
    const response = await fetch(
      `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}`,
      {
        method: "GET",
        credentials: "include"
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok || !data.record) {
      alert(
        data.detail ||
        data.error ||
        t("could_not_load_related_record", "Could not load related record")
      );
      return;
    }

    archiveOpenAssociatedRecordPreview(data.record, data.record_type, caalId);
  } catch (error) {
    console.error("Could not load associated CAAL_ID:", error);
    alert(
      error.message ||
      t("could_not_load_related_record", "Could not load related record")
    );
  } finally {
    setArchiveLoading(false);
    setArchiveRecordOpening(false);
  }
}

function archiveOpenAssociatedRecordPreview(record, recordType, caalId) {
  if (!archivePreviewModal || !archivePreviewBody || !archivePreviewTitle) return;

  const fullRecordUrl = getRelatedRecordUrl?.(
    caalId,
    recordType,
    record?.source?.scope
  );

  if (recordType === "archive") {
    archiveRenderAssociatedArchivePreview(record, caalId, fullRecordUrl);
    return;
  }

  if (recordType === "monument") {
    archiveRenderAssociatedMonumentPreview(record, caalId, fullRecordUrl);
    return;
  }

  archivePreviewTitle.textContent = caalId;

  archivePreviewBody.innerHTML = `
    <div class="record-title related-record-title">
      <div>
        <h3>${safeArchiveValue(caalId)}</h3>
        <p>${t("unknown_record_type", "Unknown record type")}</p>
      </div>
    </div>
  `;

  archivePreviewModal.hidden = false;
}

function archiveRenderAssociatedArchivePreview(record, caalId, fullRecordUrl) {
  const s = record.summary || {};

  const title =
    s.original_title ||
    s.english_title ||
    archiveRaw(record, "Original Title") ||
    archiveRaw(record, "English Title") ||
    caalId;

  archivePreviewTitle.textContent = title;

  archivePreviewBody.innerHTML = `
    <div class="record-title related-record-title">
      <div>
        <h3>${safeArchiveValue(title)}</h3>
        <p>${safeArchiveValue(caalId)}</p>
      </div>

      <span class="related-record-type-badge">
        ${archiveLabel("Archive", "Archive")}
      </span>

      ${
        fullRecordUrl
          ? `<button type="button" class="action-btn" id="archiveOpenAssociatedFullRecordBtn">
              ${t("open_full_record", "Open full record")}
            </button>`
          : ""
      }
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("material_details", "Material Details")}</span>
          </div>

          ${archiveCopyableDetailItem(
            archiveLabel("CAAL_ID", "CAAL_ID"),
            record.identity?.caal_id || caalId
          )}
          ${archiveRenderAssociatedCaalIdChips(
            archiveLabel("Associated CAAL_ID", "Associated CAAL_ID"),
            record.identity?.associated_caal_id || archiveRaw(record, "Associated CAAL_ID"),
            true
          )}
          ${archiveRenderDetailItem(archiveLabel("Original Reference", "Original Reference"), s.original_reference)}
          ${archiveRenderDetailItem(archiveLabel("Content Type", "Content Type"), s.content_type)}
          ${archiveRenderDetailItem(archiveLabel("Country", "Country"), s.country)}
          ${archiveRenderDetailItem(archiveLabel("Level", "Level"), s.level)}
          ${archiveRenderDetailItem(archiveLabel("Original Title", "Original Title"), s.original_title, true)}
          ${archiveRenderDetailItem(archiveLabel("English Title", "English Title"), s.english_title, true)}
          ${archiveRenderDetailItem(archiveLabel("Description", "Description"), archiveRaw(record, "Description"), true)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("publication_details", "Publication Details")}</span>
          </div>

          ${archiveRenderDetailItem(archiveLabel("Dates of Original Material", "Dates of Original Material"), archiveRaw(record, "Dates of Original Material"))}
          ${archiveRenderDetailItem(archiveLabel("Author of the Original Material", "Author of the Original Material"), archiveRaw(record, "Author of the Original Material"), true)}
          ${archiveRenderDetailItem(archiveLabel("Publisher of the Original Material", "Publisher of the Original Material"), archiveRaw(record, "Publisher of the Original Material"), true)}
          ${archiveRenderDetailItem(archiveLabel("Editor of the Original Material", "Editor of the Original Material"), archiveRaw(record, "Editor of the Original Material"), true)}
          ${archiveRenderDetailItem(archiveLabel("Volume and Issue Number", "Volume and Issue Number"), archiveRaw(record, "Volume and Issue Number"))}
        </div>
      </div>
    </div>
  `;

  archivePreviewModal.hidden = false;
  archiveWireCopyFieldButtons(archivePreviewModal);
  archiveWireAssociatedPreviewButtons(fullRecordUrl);
  wireArchiveAssociatedCaalIdChips();
}

function archiveRenderAssociatedMonumentPreview(record, caalId, fullRecordUrl) {
  const title =
    record.summary?.primary_name ||
    record.summary?.primary_name_english ||
    record.raw?.["Primary Name"] ||
    caalId;

  archivePreviewTitle.textContent = title;

  archivePreviewBody.innerHTML = `
    <div class="record-title related-record-title">
      <div>
        <h3>${safeArchiveValue(title)}</h3>
        <p>${safeArchiveValue(caalId)}</p>
      </div>

      <span class="related-record-type-badge">
        ${archiveLabel("Monuments", "Monuments")}
      </span>

      ${
        fullRecordUrl
          ? `<button type="button" class="action-btn" id="archiveOpenAssociatedFullRecordBtn">
              ${t("open_full_record", "Open full record")}
            </button>`
          : ""
      }
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("basic", "Basic")}</span>
          </div>

          ${archiveCopyableDetailItem(
            archiveLabel("CAAL_ID", "CAAL_ID"),
            record.identity?.caal_id || caalId
          )}
          ${archiveRenderDetailItem(archiveLabel("Primary Name", "Primary Name"), record.summary?.primary_name, true)}
          ${archiveRenderDetailItem(archiveLabel("Primary Name (English)", "Primary Name (English)"), record.summary?.primary_name_english, true)}
          ${archiveRenderDetailItem(archiveLabel("Country", "Country"), record.summary?.country)}
          ${archiveRenderDetailItem(archiveLabel("Region", "Region"), record.summary?.region)}
          ${archiveRenderDetailItem(archiveLabel("Classification", "Classification"), record.summary?.classification)}
          ${archiveRenderDetailItem(archiveLabel("Designation", "Designation"), record.summary?.designation)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${archiveLabel("Monuments", "Monuments")}</span>
          </div>

          ${archiveRenderDetailItem(archiveLabel("Monument Type1", "Monument Type1"), record.summary?.monument_type1)}
          ${archiveRenderDetailItem(archiveLabel("Cultural Period1", "Cultural Period1"), record.summary?.cultural_period1)}
          ${archiveRenderDetailItem(archiveLabel("Religion1", "Religion1"), record.summary?.religion1)}
          ${archiveRenderDetailItem(archiveLabel("Primary Description", "Primary Description"), record.raw?.["Primary Description"], true)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("location", "Location")}</span>
          </div>

          ${archiveRenderDetailItem(archiveLabel("Longitude", "Longitude"), record.summary?.longitude || record.raw?.["Longitude"])}
          ${archiveRenderDetailItem(archiveLabel("Latitude", "Latitude"), record.summary?.latitude || record.raw?.["Latitude"])}
          ${archiveRenderDetailItem(archiveLabel("Location Notes", "Location Notes"), record.raw?.["Location Notes"], true)}
        </div>
      </div>
    </div>
  `;

  archivePreviewModal.hidden = false;
  archiveWireCopyFieldButtons(archivePreviewModal);
  archiveWireAssociatedPreviewButtons(fullRecordUrl);
}

async function archiveOpenInstitutionPreview(caalId) {
  if (!caalId) return;

  setArchiveLoading(true, t("loading_preview", "Loading preview..."));

  try {
    const response = await fetch(
      `/api/archive/institutions/${encodeURIComponent(caalId)}`,
      {
        method: "GET",
        credentials: "include"
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok || !data.institution) {
      alert(
        data.detail ||
        data.error ||
        t("could_not_load_institution", "Could not load institution")
      );
      return;
    }

    archiveRenderInstitutionPreview(data.institution);
  } catch (error) {
    console.error("Could not load institution:", error);
    alert(error.message || t("could_not_load_institution", "Could not load institution"));
  } finally {
    setArchiveLoading(false);
  }
}

function archiveRenderInstitutionPreview(inst) {
  if (!archivePreviewModal || !archivePreviewBody || !archivePreviewTitle) return;

  const title = archiveInstitutionDisplayName(inst) || inst.caal_id;

  archivePreviewTitle.textContent = title;

  archivePreviewBody.innerHTML = `
    <div class="record-title related-record-title">
      <div>
        <h3>${safeArchiveValue(title)}</h3>
        <p>${safeArchiveValue(inst.caal_id)}</p>
      </div>

      <span class="related-record-type-badge">
        ${t("institution", "Institution")}
      </span>
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("institution_details", "Institution Details")}</span>
          </div>

          ${archiveCopyableDetailItem(archiveLabel("CAAL_ID", "CAAL_ID"), inst.caal_id)}
          ${archiveRenderDetailItem(t("primary_name", "Primary Name"), inst.primary_name, true)}
          ${archiveRenderDetailItem(t("name_ru", "Russian Name"), inst.name_ru, true)}
          ${archiveRenderDetailItem(t("other_names", "Other Names"), inst.other_names, true)}
          ${archiveRenderDetailItem(t("actor_type", "Actor Type"), inst.actor_type)}
          ${archiveRenderDetailItem(archiveLabel("Country", "Country"), inst.country)}
          ${archiveRenderDetailItem(t("address", "Address"), inst.address, true)}
          ${archiveRenderDetailItem(archiveLabel("Description", "Description"), inst.description, true)}
          ${archiveRenderDetailItem(t("external_reference", "External Reference"), inst.external_reference, true)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("institution_location", "Institution Location")}</span>
          </div>

          ${archiveRenderDetailItem(archiveLabel("Longitude", "Longitude"), inst.longitude)}
          ${archiveRenderDetailItem(archiveLabel("Latitude", "Latitude"), inst.latitude)}

          <div class="detail-item full-width">
            <div
              id="archiveInstitutionMiniMap"
              class="institution-mini-map"
              data-longitude="${inst.longitude ?? ""}"
              data-latitude="${inst.latitude ?? ""}"
            ></div>
          </div>
        </div>
      </div>
    </div>
  `;

  archivePreviewModal.hidden = false;
  archiveWireCopyFieldButtons(archivePreviewModal);
  setTimeout(() => {
    archiveRenderInstitutionMiniMap(inst);
  }, 50);
}

let archiveInstitutionMiniMap = null;

function archiveRenderInstitutionMiniMap(inst) {
  const mapEl = document.getElementById("archiveInstitutionMiniMap");
  if (!mapEl) return;

  const lon = Number(inst?.longitude);
  const lat = Number(inst?.latitude);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    mapEl.innerHTML = `
      <div class="section-empty">
        ${t("no_location_recorded", "No location recorded")}
      </div>
    `;
    return;
  }

  if (archiveInstitutionMiniMap) {
    try {
      archiveInstitutionMiniMap.remove();
    } catch (error) {
      console.warn("Could not remove previous institution mini map:", error);
    }
    archiveInstitutionMiniMap = null;
  }

  if (typeof maplibregl === "undefined") {
    mapEl.innerHTML = `
      <div class="section-empty">
        ${t("map_unavailable", "Map unavailable")}
      </div>
    `;
    return;
  }

  archiveInstitutionMiniMap = new maplibregl.Map({
    container: mapEl,
    style: "https://api.maptiler.com/maps/streets/style.json?key=wZNaIRIPfJrrJLopqgo0",
    center: [lon, lat],
    zoom: 13,
    interactive: true,
    attributionControl: false
  });

  archiveInstitutionMiniMap.addControl(
    new maplibregl.NavigationControl({
      showCompass: false
    }),
    "top-right"
  );

  new maplibregl.Marker()
    .setLngLat([lon, lat])
    .addTo(archiveInstitutionMiniMap);

  archiveInstitutionMiniMap.once("load", () => {
    archiveInstitutionMiniMap.resize();
  });

  setTimeout(() => {
    archiveInstitutionMiniMap?.resize();
  }, 150);
}

function archiveWireHoldingInstitutionChips() {
  Array.from(document.querySelectorAll(".archive-holding-institution-chip")).forEach((btn) => {
    if (btn.dataset.institutionChipWired === "true") return;

    btn.dataset.institutionChipWired = "true";

    btn.addEventListener("click", async () => {
      await archiveOpenInstitutionPreview(btn.dataset.institutionCaalId);
    });
  });
}

function archiveWireAssociatedPreviewButtons(fullRecordUrl) {
  const openBtn = document.getElementById("archiveOpenAssociatedFullRecordBtn");

  if (openBtn && fullRecordUrl) {
    openBtn.addEventListener("click", () => {
      window.open(fullRecordUrl, "_blank");
    });
  }
}

// popup
function archiveOpenPreview(record) {
  archivePreviewRecord = record;

  if (!archivePreviewModal || !archivePreviewBody || !archivePreviewTitle) return;

  const s = record.summary || {};

  archivePreviewTitle.textContent = safeArchiveValue(s.original_title || s.english_title || "Record preview");

  archivePreviewBody.innerHTML = `
    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("material_details", "Material Details")}</span>
          </div>

          ${archiveCopyableDetailItem(
            archiveLabel("CAAL_ID", "CAAL_ID"),
            archiveIdentity(record, "caal_id") || archiveRaw(record, "CAAL_ID")
          )}
          ${archiveRenderAssociatedCaalIdChips(
            archiveLabel("Associated CAAL_ID", "Associated CAAL_ID"),
            archiveIdentity(record, "associated_caal_id") || archiveRaw(record, "Associated CAAL_ID"),
            true
          )}
          ${archiveRenderDetailItem(archiveLabel("Original Reference", "Original Reference"), s.original_reference)}
          ${archiveRenderDetailItem(archiveLabel("Content Type", "Content Type"), s.content_type)}
          ${archiveRenderDetailItem(archiveLabel("Country", "Country"), s.country)}
          ${archiveRenderDetailItem(archiveLabel("Level", "Level"), s.level)}
          ${archiveRenderDetailItem(archiveLabel("Original Title", "Original Title"), s.original_title, true)}
          ${archiveRenderDetailItem(archiveLabel("English Title", "English Title"), s.english_title, true)}
          ${archiveRenderDetailItem(archiveLabel("Description", "Description"), archiveRaw(record, "Description"), true)}
          ${archiveRenderDetailItem(
            archiveLabel("Languages of Material", "Languages of Material"),
            archiveArrayValue(archiveRaw(record, "Languages of Material")).join(", "),
            true
          )}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("publication_details", "Publication Details")}</span>
          </div>

          ${archiveRenderDetailItem(archiveLabel("Dates of Original Material", "Dates of Original Material"), archiveRaw(record, "Dates of Original Material"))}
          ${archiveRenderDetailItem(archiveLabel("Author of the Original Material", "Author of the Original Material"), archiveRaw(record, "Author of the Original Material"), true)}
          ${archiveRenderDetailItem(archiveLabel("Publisher of the Original Material", "Publisher of the Original Material"), archiveRaw(record, "Publisher of the Original Material"), true)}
          ${archiveRenderDetailItem(archiveLabel("Editor of the Original Material", "Editor of the Original Material"), archiveRaw(record, "Editor of the Original Material"), true)}
          ${archiveRenderDetailItem(archiveLabel("Volume and Issue Number", "Volume and Issue Number"), archiveRaw(record, "Volume and Issue Number"))}
        </div>
      </div>
    </div>
  `;

  archivePreviewModal.hidden = false;

  wireArchiveAssociatedCaalIdChips();
  archiveWireCopyFieldButtons(archivePreviewModal);
}

function archiveClosePreview() {
  if (!archivePreviewModal) return;

  if (archiveInstitutionMiniMap) {
    try {
      archiveInstitutionMiniMap.remove();
    } catch (error) {
      console.warn("Could not remove institution mini map:", error);
    }
    archiveInstitutionMiniMap = null;
  }

  archivePreviewModal.hidden = true;
  archivePreviewRecord = null;
}

function archiveConfirmLoseChanges() {
  if (!archiveIsEditMode || !archiveIsDirty) {
    return true;
  }

  return window.confirm(
    archiveLabel(
      "Unsaved changes prompt",
      "You have unsaved changes. Do you want to discard them?"
        //return window.confirm(getResponseText("unsaved_changes_message", "You have unsaved changes. Do you want to discard them?"));
    )
  );
}

window.archiveCanChangeLanguage = function () {
  if (!archiveIsEditMode || !archiveIsDirty) {
    return true;
  }

  const confirmed = window.confirm(
    archiveLabel(
      "Language change cancels editing",
      "Changing language will cancel the current edit. Continue?"
    )
  );

  if (!confirmed) {
    return false;
  }

  archiveIsEditMode = false;
  archiveIsDirty = false;
  archivePendingNewRecord = null;
  archiveClosePreview();

  if (archiveSelectedRecord) {
    archiveRenderRecordDetails(archiveSelectedRecord);
  } else {
    renderArchiveEmptyState();
  }

  return true;
};

// for buttons
function canEditArchiveRecord(record) {
  return record?.source?.is_editable === true;
}

function archiveRenderActionBar({ hasRecord = false, canEdit = false } = {}) {
  const isEditing = archiveIsEditMode;
  const canDelete =
    isEditing &&
    hasRecord &&
    canEdit &&
    archiveSelectedRecord?.source?.scope === "workspace" &&
    archiveSelectedRecord?.identity?.id;

  if (addArchiveBtn) addArchiveBtn.hidden = isEditing;
  if (archiveEditBtn) archiveEditBtn.hidden = isEditing || !hasRecord || !canEdit;
  if (archiveSaveBtn) archiveSaveBtn.hidden = !isEditing;
  if (archiveCancelEditBtn) archiveCancelEditBtn.hidden = !isEditing;
  if (archiveDeleteBtn) archiveDeleteBtn.hidden = !canDelete;

  if (archiveCloseRecordBtn) {
    archiveCloseRecordBtn.hidden = isEditing || !hasRecord;
  }

  if (archiveEditBtn) {
    archiveEditBtn.disabled = false;
    archiveEditBtn.title = "";
  }

  if (addArchiveBtn) addArchiveBtn.classList.toggle("is-active", !isEditing && !hasRecord);
  if (archiveEditBtn) archiveEditBtn.classList.toggle("is-active", !isEditing && hasRecord);
  if (archiveSaveBtn) archiveSaveBtn.classList.toggle("is-active", isEditing);
}

// Labels API
// --------------------------------------------------------
function applyArchiveStaticLabels() {
  document.querySelectorAll("[data-archive-label]").forEach((el) => {
    const key = el.dataset.archiveLabel;
    el.textContent = archiveLabel(key, el.textContent);
  });
}

async function loadArchiveLabels(langOverride = null) {
  const lang = archiveCurrentLanguageCode(langOverride);
  archiveActiveLanguage = lang;

  const response = await fetch(
    `/api/ui/labels?page=archive&lang=${encodeURIComponent(lang)}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load archive labels");
  }

  archiveLabels = data.labels || {};
}



// Records API
// --------------------------------------------------------
function getArchiveSessionWorkspaceCode(session = window.appSession) {
  return String(
    session?.user?.workspace_code ??
    session?.profile?.workspace_code ??
    session?.permissions?.workspace_code ??
    session?.workspace_code ??
    ""
  ).trim().toLowerCase();
}

function archiveUserIsGlobalCaal(session = window.appSession) {
  return getArchiveSessionWorkspaceCode(session) === "caal";
}

function archiveUserCanViewAllCaal(session = window.appSession) {
  return session?.permissions?.can_view_all_caal === true || archiveUserIsGlobalCaal(session);
}

function normaliseArchiveScopeForSession(scope, session = window.appSession) {
  if (archiveUserIsGlobalCaal(session) && scope === "national_ref") {
    return "all_caal";
  }

  return scope;
}

function renderArchiveNoScopeSelectedState() {
  archiveAllRecords = [];
  archiveVisibleRecords = [];
  archiveTotalCount = 0;
  archiveOffset = 0;

  if (archiveResultsList) {
    archiveResultsList.innerHTML = `
      <div class="results-empty">
        <p>${t(
          "no_archive_sources_selected",
          "No archive record sources are selected. Tick one or more sources to show results."
        )}</p>
      </div>
    `;
  }

  setArchiveResultsCountText(
    t("no_record_scopes_sources_short", "No record scopes selected")
  );

  archiveRenderResourceSearchResults([]);
  renderArchivePageInfo();
}

function setArchiveScopeLabelForInput(inputEl, key, fallback) {
  const labelEl = inputEl?.closest("label");
  const span = labelEl?.querySelector("[data-i18n]");

  if (!span) return;

  span.dataset.i18n = key;
  span.textContent = t(key, fallback);
}

function applyArchiveScopeUiForSession(
  session = window.appSession,
  { setDefault = false } = {}
) {
  const isGlobalCaalUser = archiveUserIsGlobalCaal(session);
  const canViewAllCaal = archiveUserCanViewAllCaal(session);

  const nationalWrapper = showArchiveNationalRef?.closest("label");
  const workspaceWrapper = showArchiveWorkspace?.closest("label");

  if (isGlobalCaalUser) {
    if (nationalWrapper) {
      nationalWrapper.hidden = true;
    }

    if (showArchiveNationalRef) {
      showArchiveNationalRef.checked = false;
      showArchiveNationalRef.disabled = true;
    }

    if (allCaalArchiveToggleWrapper) {
      allCaalArchiveToggleWrapper.hidden = !canViewAllCaal;
    }

    if (showArchiveAllCaal) {
      showArchiveAllCaal.disabled = !canViewAllCaal;
    }

    setArchiveScopeLabelForInput(
      showArchiveAllCaal,
      "archive_all_records",
      t("archive_all_records", "All CAAL records")
    );

    if (setDefault && canViewAllCaal) {
      if (showArchiveWorkspace) showArchiveWorkspace.checked = true;
      if (showArchiveNationalRef) showArchiveNationalRef.checked = false;
      if (showArchiveAllCaal) showArchiveAllCaal.checked = true;
    }

    if (workspaceWrapper) {
      workspaceWrapper.title = t(
        "global_workspace_scope_help",
        "Records directly editable through this account, if any."
      );
    }

    return;
  }

  // National users and national admins.
  if (nationalWrapper) {
    nationalWrapper.hidden = false;
  }

  if (showArchiveNationalRef) {
    showArchiveNationalRef.disabled = false;
  }

  if (allCaalArchiveToggleWrapper) {
    allCaalArchiveToggleWrapper.hidden = !canViewAllCaal;
  }

  if (showArchiveAllCaal) {
    showArchiveAllCaal.disabled = !canViewAllCaal;
  }

  setArchiveScopeLabelForInput(
    showArchiveAllCaal,
    "archive_other_records",
    t("archive_other_records", "Other CAAL records")
  );

  if (setDefault) {
    if (showArchiveWorkspace) showArchiveWorkspace.checked = true;
    if (showArchiveNationalRef) showArchiveNationalRef.checked = true;
    if (showArchiveAllCaal) showArchiveAllCaal.checked = false;
  }

  if (workspaceWrapper) {
    workspaceWrapper.title = "";
  }
}

function getArchiveEnabledScopes() {
  const scopes = [];

  if (showArchiveWorkspace?.checked) scopes.push("workspace");
  if (showArchiveNationalRef?.checked) scopes.push("national_ref");
  if (showArchiveAllCaal?.checked) scopes.push("all_caal");

  return scopes;
}

async function loadArchiveRecords(limit = 100, offset = 0, options = {}) {
  const { preserveSelection = false } = options;
  const scopes = getArchiveEnabledScopes();

  archiveAllRecords = [];
  archiveVisibleRecords = [];

  if (!preserveSelection) {
    archiveSelectedRecord = null;
    archiveIsEditMode = false;
    archivePendingNewRecord = null;
    archiveSyncModeVisualState();
  }

  if (scopes.length === 0) {
    renderArchiveNoScopeSelectedState();

    if (!preserveSelection) {
      renderArchiveEmptyState();
    }

    return;
  }

  const params = archiveBuildQueryParams({ limit, offset });

  //console.log("Archive fetch URL:", `/api/archive?${params.toString()}`);

  const response = await fetch(`/api/archive?${params.toString()}`, {
    method: "GET",
    credentials: "include"
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Failed to load archive records");
  }

  archiveAllRecords = data.records || [];
  archiveTotalCount = data.total || 0;
  archiveLimit = data.limit || limit;
  archiveOffset = data.offset || offset;

  archiveVisibleRecords = archiveAllRecords;

  try {
    await loadRecentlySavedArchiveRecords();
  } catch (error) {
    console.warn("Recently saved archive records unavailable:", error);
    archiveRecentlySavedRecords = [];
  }

    renderArchiveResultsList(archiveVisibleRecords);
    renderArchivePageInfo();

    await archiveLoadResourceSearchResults();
  }


// Filter logic
// --------------------------------------------------------
async function archiveClearFilters() {
  if (archiveSearch) archiveSearch.value = "";
  if (archiveFilterCaalId) archiveFilterCaalId.value = "";

  [
    filterArchiveRelatedCountries,
    filterArchiveRelatedReligions,
    filterArchiveRelatedSubjects,
    filterArchiveContentType,
    filterArchiveLanguages
  ].forEach((selectEl) => {
    if (!selectEl) return;
    Array.from(selectEl.options).forEach((option) => {
      option.selected = false;
    });
  });

  // Remove deep-link params so the page no longer behaves as a targeted record view
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, "", cleanUrl);

  archiveOffset = 0;

  setArchiveLoading(true, t("updating_records", "Updating records..."));

  archiveRenderAllFilterChips();
  archiveRenderActiveFilterChips();

  try {
    await loadArchiveRecords(archiveLimit, 0);
  } catch (error) {
    console.error("Archive clear filters failed:", error);
    setArchiveResultsError();
  } finally {
    setArchiveLoading(false);
  }
}

function setArchiveResultsError(message = null) {
  const label = message || t(
    "archive_results_update_failed",
    "Archive results could not be updated. Please try again."
  );

  setArchiveResultsCountText(label);

  if (archiveResultsList) {
    archiveResultsList.innerHTML = `
      <div class="results-empty">
        <p>${label}</p>
      </div>
    `;
  }
}

// Results rendering
// --------------------------------------------------------
async function previewArchiveFromLightRecord(lightRecord) {
  if (!lightRecord) return;
  if (archiveRecordOpenInProgress) return;

  setArchiveRecordOpening(true);
  setArchiveLoading(true, t("loading_preview", "Loading preview..."));

  try {
    const fullRecord = await loadFullArchiveRecord(lightRecord);
    archiveOpenPreview(fullRecord);
  } catch (error) {
    console.error("Failed to load archive preview:", error);
    alert(
      error.message ||
      t("could_not_load_full_archive_record", "Could not load full archive record")
    );
  } finally {
    setArchiveLoading(false);
    setArchiveRecordOpening(false);
  }
}

async function openArchiveLightRecordInDetails(lightRecord) {
  if (!lightRecord) return;
  if (archiveRecordOpenInProgress) return;
  if (!archiveConfirmLoseChanges()) return;

  setArchiveRecordOpening(true);
  setArchiveLoading(true, t("loading_full_record", "Loading full record..."));

  try {
    const fullRecord = await loadFullArchiveRecord(lightRecord);

    archivePendingNewRecord = null;
    archiveSelectedRecord = fullRecord;
    archiveIsEditMode = false;
    archiveIsDirty = false;

    archiveRenderRecordDetails(fullRecord);
    archiveUpdateSelectedResultCard();
  } catch (error) {
    console.error("Failed to load full archive record:", error);
    alert(
      error.message ||
      t("could_not_load_full_archive_record", "Could not load full archive record")
    );
  } finally {
    setArchiveLoading(false);
    setArchiveRecordOpening(false);
  }
}

async function handleArchiveResultOpen(lightRecord) {
  if (!lightRecord) return;
  if (archiveRecordOpenInProgress) return;

  if (archiveIsEditMode) {
    await previewArchiveFromLightRecord(lightRecord);
    return;
  }

  await openArchiveLightRecordInDetails(lightRecord);
}

function renderArchiveResultsList(records) {
  if (!archiveResultsList) return;

  const start = records.length === 0 ? 0 : archiveOffset + 1;
  const end = archiveOffset + records.length;

  const countText = archiveTotalCount
    ? t("results_count_total", "{start}-{end} ({total} total)")
        .replace("{start}", start)
        .replace("{end}", end)
        .replace("{total}", archiveTotalCount)
    : t("zero_records", "0 records");

  setArchiveResultsCountText(countText);

  if (records.length === 0) {
    archiveResultsList.innerHTML = `
      <div class="results-empty">
        <p>${archiveLabel(t("no_matching_records", "No matching records."))}</p>
      </div>
    `;
    return;
  }

  archiveResultsList.innerHTML = records
    .map((record, index) => {
      const s = record.summary || {};

      const isRecentSave = archiveIsSavedSinceCacheRefresh(record);

      const caalId =
        record.identity?.caal_id ||
        record.raw?.["CAAL_ID"] ||
        record.raw?.caal_id ||
        "";

      const title =
        s.original_title ||
        s.english_title ||
        caalId;

      return `
        <div
          class="result-card ${archiveSelectedRecord?.identity?.id === record.identity?.id ? "is-selected" : ""} ${isRecentSave ? "recent-save-card" : ""}"
          data-archive-result-index="${index}"
          data-archive-record-id="${record.identity?.id ?? ""}"
          title="${
            isRecentSave
              ? t(
                  "saved_since_cache_refresh_help",
                  "This record was saved after the last cache refresh. Opening it loads the current saved record."
                )
              : ""
          }"
        >
          <div class="result-card-topline">
            <strong>${safeArchiveValue(title)}</strong>
            <span class="${archiveScopeBadgeClass(record)}">
              ${safeArchiveValue(archiveScopeLabel(record.source?.scope))}
            </span>
          </div>

          <div class="result-card-meta">${safeArchiveValue(caalId)}</div>
          <div class="result-card-meta">${safeArchiveValue(s.content_type)}</div>
        </div>
      `;
    })
    .join("");

    Array.from(archiveResultsList.querySelectorAll(".result-card")).forEach((card) => {
      card.addEventListener("click", async () => {
        const idx = Number(card.dataset.archiveResultIndex);
        const lightRecord = records[idx];

        await handleArchiveResultOpen(lightRecord);
      });
    });

  archiveUpdateSelectedResultCard();
  renderArchivePageInfo();
}

async function archiveOpenAssociatedRecord(caalId) {
  if (archiveRecordOpenInProgress) return;

  setArchiveRecordOpening(true);
  setArchiveLoading(true, t("loading_preview", "Loading preview..."));

  try {
    const response = await fetch(
      `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}`,
      {
        method: "GET",
        credentials: "include"
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok || !data.record) {
      alert(data.error || t("could_not_load_related_record", "Could not load related record"));
      return;
    }

    archiveOpenAssociatedRecordPreview(data.record, data.record_type, caalId);
  } catch (error) {
    console.error("Could not load associated CAAL_ID:", error);
    alert(error.message || t("could_not_load_related_record", "Could not load related record"));
  } finally {
    setArchiveLoading(false);
    setArchiveRecordOpening(false);
  }
}

// Detail rendering
// --------------------------------------------------------
function renderArchiveEmptyState() {
  if (!archiveRecordDetails) return;

  archiveSyncModeVisualState();

  archiveRecordDetails.innerHTML = `
    <div class="empty-state">
      <p>${t("no_record_selected", "No record selected yet.")}</p>
    </div>
  `;

  archiveRenderActionBar();
}

function clearSelectedArchiveRecord() {
  if (!archiveConfirmLoseChanges()) return;

  archiveSelectedRecord = null;
  archivePendingNewRecord = null;
  archiveIsEditMode = false;
  archiveIsDirty = false;

  archiveClosePreview();
  archiveSyncModeVisualState();
  archiveUpdateSelectedResultCard();
  renderArchiveEmptyState();
}

function archiveUpdateSelectedResultCard() {
  if (!archiveResultsList) return;

  const selectedId = archiveSelectedRecord?.identity?.id;

  Array.from(archiveResultsList.querySelectorAll(".result-card")).forEach((card) => {
    const idx = Number(card.dataset.archiveResultIndex);
    const record = archiveVisibleRecords[idx] || archiveAllRecords[idx];
    const cardId = Number(card.dataset.archiveRecordId);

    card.classList.toggle(
      "is-selected",
      selectedId !== null && selectedId !== undefined && cardId === Number(selectedId)
    );

    card.classList.toggle(
      "recent-save-card",
      archiveIsSavedSinceCacheRefresh(record)
    );
  });
}

function archiveRenderRecordDetails(record) {
  archiveSelectedRecord = record;

  archiveSyncModeVisualState();

  if (archiveIsEditMode) {
    archiveRenderEditMode(record);
  } else {
    archiveRenderDisplayMode(record);
  }
}

function archiveRenderDisplayMode(record) {
  archiveSelectedRecord = record;

  const s = record.summary || {};

  const caalId =
    archiveIdentity(record, "caal_id") ||
    archiveRaw(record, "CAAL_ID") ||
    archiveRaw(record, "caal_id");

  const title =
    s.original_title ||
    s.english_title ||
    caalId;

  let materialHtml = "";
  materialHtml += archiveCopyableDetailItem(
    archiveLabel("CAAL_ID", "CAAL_ID"),
    caalId
  );

  materialHtml += archiveRenderHoldingInstitutionDetail(record);
  materialHtml += archiveRenderDetailItem(archiveLabel("Level", "Level"), s.level);
  materialHtml += archiveRenderDetailItem(archiveLabel("Original Reference", "Original Reference"), s.original_reference);
  materialHtml += archiveRenderDetailItem(archiveLabel("Original Title", "Original Title"), s.original_title, true);
  materialHtml += archiveRenderDetailItem(archiveLabel("English Title", "English Title"), s.english_title, true);
  materialHtml += archiveRenderDetailItem(archiveLabel("Content Type", "Content Type"), s.content_type);
  materialHtml += archiveRenderDetailItem(archiveLabel("Number and Type of Original Material", "Number and Type of Original Material"), archiveRaw(record, "Number and Type of Original Material"), true);
  materialHtml += archiveRenderDetailItem(archiveLabel("Size and Dimensions of Original Material", "Size and Dimensions of Original Material"), archiveRaw(record, "Size and Dimensions of Original Material"));
  materialHtml += archiveRenderDetailItem(archiveLabel("Condition of Original Material", "Condition of Original Material"), archiveRaw(record, "Condition of Original Material"));

  const relatedHtml = archiveRenderResourceRelations(record);
  const relatedHasValues = getRecordRelations(record).length > 0;

  let publicationHtml = "";
  publicationHtml += archiveRenderDetailItem(archiveLabel("Dates of Original Material", "Dates of Original Material"), archiveRaw(record, "Dates of Original Material"));
  publicationHtml += archiveRenderDetailItem(archiveLabel("Author of the Original Material", "Author of the Original Material"), archiveRaw(record, "Author of the Original Material"), true);
  publicationHtml += archiveRenderDetailItem(archiveLabel("Publisher of the Original Material", "Publisher of the Original Material"), archiveRaw(record, "Publisher of the Original Material"), true);
  publicationHtml += archiveRenderDetailItem(archiveLabel("Editor of the Original Material", "Editor of the Original Material"), archiveRaw(record, "Editor of the Original Material"), true);
  publicationHtml += archiveRenderDetailItem(archiveLabel("Volume and Issue Number", "Volume and Issue Number"), archiveRaw(record, "Volume and Issue Number"));
  publicationHtml += archiveRenderDetailItem(
    archiveLabel("Still under CopyrightYN", "Still under Copyright?"),
    archiveRenderLookupSingleValue(
      "copyright_status",
      archiveRaw(record, "still_under_copyright") ??
      archiveRaw(record, "Still under CopyrightYN")
    )
  );

  publicationHtml += archiveRenderDetailItem(
    archiveLabel("Copyright Holder Name", "Copyright Holder Name"),
    archiveRaw(record, "Copyright Holder Name"),
    true
  );

  publicationHtml += archiveRenderDetailItem(
    archiveLabel("Copyright Attribution", "Copyright Attribution"),
    archiveRaw(record, "Copyright Attribution"),
    true
  );

  let contentHtml = "";
  contentHtml += archiveRenderDetailItem(archiveLabel("Description", "Description"), archiveRaw(record, "Description"), true);
  contentHtml += archiveRenderDetailItem(archiveLabel("Description - alternative language", "Description - alternative language"), archiveRaw(record, "Description - alternative language"), true);
  contentHtml += archiveRenderDetailItem(
    archiveLabel("Related Countries", "Related Countries"),
    archiveRenderLookupMultiValue("related_country", archiveRaw(record, "Related Countries")),
    true
  );
  contentHtml += archiveRenderDetailItem(archiveLabel("Related Towns and Cities", "Related Towns and Cities"), archiveRaw(record, "Related Towns and Cities"), true);
  contentHtml += archiveRenderDetailItem(
    archiveLabel("Related Religions", "Related Religions"),
    archiveRenderLookupMultiValue("related_religion", archiveRaw(record, "Related Religions")),
    true
  );

  contentHtml += archiveRenderDetailItem(
    archiveLabel("Related Subjects", "Related Subjects"),
    archiveRenderLookupMultiValue("related_subject", archiveRaw(record, "Related Subjects")),
    true
  );
  contentHtml += archiveRenderDetailItem(archiveLabel("Other Subjects", "Other Subjects"), archiveRaw(record, "Other Subjects"), true);
  contentHtml += archiveRenderDetailItem(
    archiveLabel("Languages of Material", "Languages of Material"),
    archiveRenderLookupMultiValue("language", archiveRaw(record, "Languages of Material")),
    true
  );
  contentHtml += archiveRenderDetailItem(archiveLabel("Script of Material", "Script of Material"), archiveRaw(record, "Script of Material"));
  contentHtml += archiveRenderDetailItem(archiveLabel("Writing System", "Writing System"), archiveRaw(record, "Writing System"));

  let digitalHtml = "";
  digitalHtml += archiveRenderDetailItem(archiveLabel("Digital Folder Name", "Digital Folder Name"), archiveRaw(record, "Digital Folder Name"), true);
  digitalHtml += archiveRenderDetailItem(archiveLabel("Digital Files Name", "Digital Files Name"), archiveRaw(record, "Digital Files Name"), true);
  digitalHtml += archiveRenderDetailItem(archiveLabel("Creation Date of Digital Files", "Creation Date of Digital Files"), archiveRaw(record, "Creation Date of Digital Files"));
  digitalHtml += archiveRenderDetailItem(archiveLabel("Format of Digital Files", "Format of Digital Files"), archiveRaw(record, "Format of Digital Files"));
  digitalHtml += archiveRenderDetailItem(archiveLabel("Number of Digital Files", "Number of Digital Files"), archiveRaw(record, "Number of Digital Files"));
  digitalHtml += archiveRenderDetailItem(archiveLabel("Colour", "Colour"), archiveRaw(record, "Colour"));
  digitalHtml += archiveRenderDetailItem(archiveLabel("Resolution", "Resolution"), archiveRaw(record, "Resolution"));

  let metadataHtml = "";
  metadataHtml += archiveRenderDetailItem(
    archiveLabel("Archive Recorder", "Archive Recorder"),
    s.archive_recorder
  );
  metadataHtml += archiveRenderDetailItem(
    archiveLabel("Date of Recording", "Date of Recording"),
    archiveDateOnly(s.date_of_recording)
  );
  metadataHtml += archiveRenderDetailItem(
    t("recorded_language", "Recorded Language"),
    displayLanguageName(archiveRaw(record, "Preferred Language"))
  );
  metadataHtml += archiveRenderDetailHtmlItem(
    archiveLabel("Resource", "DOI"),
    archiveRenderDoiValue(archiveRaw(record, "Resource"))
  );

  const holdingInstitution = archiveGetHoldingInstitutionRelation(record);

  const materialHasValues = archiveSectionHasValues([
    caalId,
    holdingInstitution?.caal_id,
    s.level,
    s.original_reference,
    s.original_title,
    s.english_title,
    s.content_type,
    archiveRaw(record, "Number and Type of Original Material"),
    archiveRaw(record, "Size and Dimensions of Original Material"),
    archiveRaw(record, "Condition of Original Material")
  ]);

  const publicationHasValues = archiveSectionHasValues([
    archiveRaw(record, "Dates of Original Material"),
    archiveRaw(record, "Author of the Original Material"),
    archiveRaw(record, "Publisher of the Original Material"),
    archiveRaw(record, "Editor of the Original Material"),
    archiveRaw(record, "Volume and Issue Number"),
    archiveRaw(record, "still_under_copyright"),
    archiveRaw(record, "Still under CopyrightYN"),
    archiveRaw(record, "Copyright Holder Name"),
    archiveRaw(record, "Copyright Attribution")
  ]);

  const contentHasValues = archiveSectionHasValues([
    archiveRaw(record, "Description"),
    archiveRaw(record, "Description - alternative language"),
    archiveRaw(record, "Related Towns and Cities"),
    archiveRaw(record, "Other Subjects"),
    archiveRaw(record, "Script of Material"),
    archiveRaw(record, "Writing System"),
    ...archiveArrayValue(archiveRaw(record, "Related Countries")),
    ...archiveArrayValue(archiveRaw(record, "Related Religions")),
    ...archiveArrayValue(archiveRaw(record, "Related Subjects")),
    ...archiveArrayValue(archiveRaw(record, "Languages of Material"))
  ]);

  const digitalHasValues = archiveSectionHasValues([
    archiveRaw(record, "Digital Folder Name"),
    archiveRaw(record, "Digital Files Name"),
    archiveRaw(record, "Creation Date of Digital Files"),
    archiveRaw(record, "Format of Digital Files"),
    archiveRaw(record, "Number of Digital Files"),
    archiveRaw(record, "Colour"),
    archiveRaw(record, "Resolution")
  ]);

  const metadataHasValues = archiveSectionHasValues([
    s.archive_recorder,
    s.date_of_recording,
    archiveRaw(record, "Preferred Language"),
    archiveRaw(record, "Resource")
  ]);

  const canEditThisRecord = canEditArchiveRecord(record);

  const saveSummary = getArchiveSaveSummaryForRecord(record);

  const statusBadge = canEditThisRecord
  ? `<span class="record-status-badge record-status-editable">${archiveLabel("Editable", "Editable")}</span>`
  : `<span class="record-status-badge record-status-readonly">${archiveLabel("Read only", "Read only")}</span>`;

  archiveRecordDetails.innerHTML = `
    <div class="${archiveRecordTitleClass(record)}">
      <div class="record-title-row">
        <div>
          <h3>${safeArchiveValue(title)}</h3>
          <p class="copyable-field archive-title-caal-id">
            <span class="copyable-field-text">${safeArchiveValue(caalId)}</span>
            ${
              caalId
                ? `
                  <button
                    type="button"
                    class="copy-field-btn"
                    data-copy-value="${safeArchiveValue(caalId)}"
                    title="${t("copy_to_clipboard", "Copy to clipboard")}"
                    aria-label="${t("copy_to_clipboard", "Copy to clipboard")}: ${safeArchiveValue(caalId)}"
                  >
                    ${archiveSvgCopyIcon()}
                  </button>
                `
                : ""
            }
          </p>
          <div class="archive-title-associated-id related-id-list">
            <strong>${archiveLabel("Associated CAAL_ID", "Associated CAAL_ID")}:</strong>
            ${archiveRenderAssociatedRelationChips(record)}
          </div>
        </div>
        ${statusBadge}
      </div>
    </div>

    ${
      saveSummary && typeof window.renderSaveSummaryCard === "function"
        ? window.renderSaveSummaryCard(saveSummary)
        : ""
    }

    <div class="group-stack">
      ${archiveRenderGroupBlock(t("material_details", "Material Details"), materialHtml, materialHasValues)}
      ${archiveRenderGroupBlock(t("publication_details", "Publication Details"), publicationHtml, publicationHasValues)}
      ${archiveRenderGroupBlock(t("content", "Content"), contentHtml, contentHasValues)}
      ${archiveRenderGroupBlock(t("digital_files", "Digital Files"), digitalHtml, digitalHasValues)}
      ${archiveRenderGroupBlock(t("related_resources", "Related resources"), relatedHtml, true)}
      ${archiveRenderGroupBlock(t("metadata", "Metadata"), metadataHtml, metadataHasValues)}
    </div>
  `;

  if (archiveEditBtn) {
    archiveEditBtn.onclick = () => {
      if (!canEditThisRecord) return;
      archiveLastSaveSummary = null;
      archiveIsEditMode = true;
      archiveIsDirty = false;
      archiveRenderRecordDetails(record);
    };
  }

  wireArchiveAssociatedCaalIdChips();
  archiveWireCopyFieldButtons(archiveRecordDetails);
  archiveWireHoldingInstitutionChips();
  window.wireSaveSummaryDismiss?.(archiveRecordDetails);

  archiveRenderActionBar({
    hasRecord: true,
    canEdit: canEditThisRecord
  });
}

// Edit mode scaffolding
// --------------------------------------------------------
function archiveRenderEditMode(record) {
  archiveSelectedRecord = record;

  const r = record.raw || {};

  let materialHtml = "";

  materialHtml += archiveRenderInstitutionPicker(record);

  materialHtml += archiveRenderSelect(
    "Level",
    archiveLabel("Level", "Level"),
    "level",
    archiveRaw(record, "Level")
  );

  materialHtml += archiveRenderTextInput("Original Reference", archiveLabel("Original Reference", "Original Reference"), archiveRaw(record, "Original Reference"));
  let relatedHtml = "";
  relatedHtml += archiveRenderCaalIdChipInput(
    "Associated CAAL_ID",
    archiveLabel("Associated CAAL_ID", "Associated CAAL_ID"),
    archiveGetEditableAssociatedIds(record),
    true
  );
  materialHtml += archiveRenderTextarea("Original Title", archiveLabel("Original Title", "Original Title"), archiveRaw(record, "Original Title"), true);
  materialHtml += archiveRenderTextarea("English Title", archiveLabel("English Title", "English Title"), archiveRaw(record, "English Title"), true);
  materialHtml += archiveRenderSelect("Content Type", archiveLabel("Content Type", "Content Type"),   "content_type", archiveRaw(record, "Content Type") );
  materialHtml += archiveRenderTextarea("Number and Type of Original Material", archiveLabel("Number and Type of Original Material", "Number and Type of Original Material"), archiveRaw(record, "Number and Type of Original Material"), true);
  materialHtml += archiveRenderSelect(
    "Size and Dimensions of Original Material",
    archiveLabel("Size and Dimensions of Original Material", "Size and Dimensions of Original Material"),
    "size_dimensions_original_material",
    archiveRaw(record, "Size and Dimensions of Original Material")
  );
  materialHtml += archiveRenderSelect(
    "Condition of Original Material",
    archiveLabel("Condition of Original Material", "Condition of Original Material"),
    "condition_original_material",
    archiveRaw(record, "Condition of Original Material"),
    false,
    { sort: false }
  );

  let publicationHtml = "";
  publicationHtml += archiveRenderTextInput("Dates of Original Material", archiveLabel("Dates of Original Material", "Dates of Original Material"), archiveRaw(record, "Dates of Original Material"));
  publicationHtml += archiveRenderTextarea("Author of the Original Material", archiveLabel("Author of the Original Material", "Author of the Original Material"), archiveRaw(record, "Author of the Original Material"), true);
  publicationHtml += archiveRenderTextarea("Publisher of the Original Material", archiveLabel("Publisher of the Original Material", "Publisher of the Original Material"), archiveRaw(record, "Publisher of the Original Material"), true);
  publicationHtml += archiveRenderTextarea("Editor of the Original Material", archiveLabel("Editor of the Original Material", "Editor of the Original Material"), archiveRaw(record, "Editor of the Original Material"), true);
  publicationHtml += archiveRenderTextInput("Volume and Issue Number", archiveLabel("Volume and Issue Number", "Volume and Issue Number"), archiveRaw(record, "Volume and Issue Number"));
  publicationHtml += archiveRenderSelect(
    "still_under_copyright",
    archiveLabel("Still under CopyrightYN", "Still under Copyright?"),
    "copyright_status",
    archiveRaw(record, "still_under_copyright") ?? archiveRaw(record, "Still under CopyrightYN")
  );
  publicationHtml += archiveRenderTextInput(
    "Copyright Holder Name",
    archiveLabel("Copyright Holder Name", "Copyright Holder Name"),
    archiveRaw(record, "Copyright Holder Name"),
    true
  );
  publicationHtml += archiveRenderTextarea(
    "Copyright Attribution",
    archiveLabel("Copyright Attribution", "Copyright Attribution"),
    archiveRaw(record, "Copyright Attribution"),
    true
  );

  let contentHtml = "";
  contentHtml += archiveRenderTextarea("Description", archiveLabel("Description", "Description"), archiveRaw(record, "Description"), true);
  contentHtml += archiveRenderTextarea("Description - alternative language", archiveLabel("Description - alternative language", "Description - alternative language"), archiveRaw(record, "Description - alternative language"), true);
  contentHtml += archiveRenderMultiSelect(
    "Related Countries",
    archiveLabel("Related Countries", "Related Countries"),
    "related_country",
    archiveRaw(record, "Related Countries"),
    true
  );
  contentHtml += archiveRenderTextarea("Related Towns and Cities", archiveLabel("Related Towns and Cities", "Related Towns and Cities"), archiveRaw(record, "Related Towns and Cities"), true);
  contentHtml += archiveRenderMultiSelect(
    "Related Religions",
    archiveLabel("Related Religions", "Related Religions"),
    "related_religion",
    archiveRaw(record, "Related Religions"),
    true
  );
  contentHtml += archiveRenderMultiSelect(
    "Related Subjects",
    archiveLabel("Related Subjects", "Related Subjects"),
    "related_subject",
    archiveRaw(record, "Related Subjects"),
    true
  );
  contentHtml += archiveRenderTextarea("Other Subjects", archiveLabel("Other Subjects", "Other Subjects"), archiveRaw(record, "Other Subjects"), true);
  contentHtml += archiveRenderMultiSelect(
    "Languages of Material",
    archiveLabel("Languages of Material", "Languages of Material"),
    "language",
    archiveRaw(record, "Languages of Material"),
    true
  );
  contentHtml += archiveRenderSelect(
    "Script of Material",
    archiveLabel("Script of Material", "Script of Material"),
    "script",
    archiveRaw(record, "Script of Material")
  );
  contentHtml += archiveRenderSelect(
    "Writing System",
    archiveLabel("Writing System", "Writing System"),
    "writing_system",
    archiveRaw(record, "Writing System")
  );

  let digitalHtml = "";
  digitalHtml += archiveRenderTextInput("Digital Folder Name", archiveLabel("Digital Folder Name", "Digital Folder Name"), archiveRaw(record, "Digital Folder Name"), true);
  digitalHtml += archiveRenderTextarea("Digital Files Name", archiveLabel("Digital Files Name", "Digital Files Name"), archiveRaw(record, "Digital Files Name"), true);
  digitalHtml += archiveRenderTextInput("Creation Date of Digital Files", archiveLabel("Creation Date of Digital Files", "Creation Date of Digital Files"), archiveRaw(record, "Creation Date of Digital Files"));
  digitalHtml += archiveRenderSelect(
    "Format of Digital Files",
    archiveLabel("Format of Digital Files", "Format of Digital Files"),
    "format",
    archiveRaw(record, "Format of Digital Files")
  );
  digitalHtml += archiveRenderTextInput("Number of Digital Files", archiveLabel("Number of Digital Files", "Number of Digital Files"), archiveRaw(record, "Number of Digital Files"));
  digitalHtml += archiveRenderSelect(
    "Colour",
    archiveLabel("Colour", "Colour"),
    "colour",
    archiveRaw(record, "Colour")
  );  
  digitalHtml += archiveRenderTextInput("Resolution", archiveLabel("Resolution", "Resolution"), archiveRaw(record, "Resolution"));

  let metadataHtml = "";
    metadataHtml += archiveRenderReadOnlyItem(
    archiveLabel("Archive Recorder", "Archive Recorder"),
    archiveRaw(record, "Archive Recorder")
  );
  metadataHtml += archiveRenderReadOnlyItem(
    archiveLabel("Date of Recording", "Date of Recording"),
    archiveDateOnly(archiveRaw(record, "Date of Recording")) ||
      archiveLabel("Set automatically on save", "Set automatically on save")
  );
  metadataHtml += archiveRenderTextarea(
    "Resource",
    archiveLabel("Resource", "DOI"),
    archiveRaw(record, "Resource"),
    true
  );
  metadataHtml += archiveRenderReadOnlyItem(
    t("recorded_language", "Recorded Language"),
    displayLanguageName(archiveRaw(record, "Preferred Language"))
  );
  metadataHtml += archiveRenderSelect(
    "Country",
    archiveLabel("Country", "Country"),
    "country",
    archiveRaw(record, "Country")
  );

  const editCaalId =
  archiveIdentity(record, "caal_id") ||
  archiveRaw(record, "CAAL_ID") ||
  archiveLabel("Assigned on save", "Assigned on save");

  archiveRecordDetails.innerHTML = `
  <div class="${archiveRecordTitleClass(record)}">
    <h3>${safeArchiveValue(record?.summary?.original_title || record?.summary?.english_title)}</h3>
    <p>${safeArchiveValue(archiveIdentity(record, "caal_id") || archiveLabel("Assigned on save", "Assigned on save"))}</p>
  </div>

    <div class="group-stack">
      ${archiveRenderGroupBlock(t("material_details", "Material Details"), materialHtml, true)}
      ${archiveRenderGroupBlock(t("related_resources", "Related resources"), relatedHtml, true)}
      ${archiveRenderGroupBlock(t("publication_details", "Publication Details"), publicationHtml, true)}
      ${archiveRenderGroupBlock(t("content", "Content"), contentHtml, true)}
      ${archiveRenderGroupBlock(t("digital_files", "Digital Files"), digitalHtml, true)}
      ${archiveRenderGroupBlock(t("metadata", "Metadata"), metadataHtml, true)}
    </div>
  `;

  archiveRenderActionBar({
  hasRecord: true,
  canEdit: canEditArchiveRecord(record)
});


if (archiveCancelEditBtn) {
  archiveCancelEditBtn.onclick = () => {
    if (archivePendingNewRecord && record === archivePendingNewRecord) {
      archivePendingNewRecord = null;
      archiveSelectedRecord = null;
      archiveIsEditMode = false;
      archiveIsDirty = false;
      archiveRenderActionBar();
      renderArchiveEmptyState();
      archiveUpdateSelectedResultCard();
      return;
    }

    archiveIsEditMode = false;
    archiveIsDirty = false;
    archiveRenderActionBar();
    archiveRenderRecordDetails(record);
  };
}

if (archiveSaveBtn) {
  archiveSaveBtn.onclick = async () => {
    if (archiveSaveBtn.disabled) return;

    archiveSaveBtn.disabled = true;
    archiveSaveBtn.classList.add("is-disabled");
    archiveSaveBtn.setAttribute("aria-busy", "true");

    if (archiveCancelEditBtn) {
      archiveCancelEditBtn.disabled = true;
      archiveCancelEditBtn.classList.add("is-disabled");
    }

    if (archiveDeleteBtn) {
      archiveDeleteBtn.disabled = true;
      archiveDeleteBtn.classList.add("is-disabled");
    }

    try {
      if (!validateArchiveAssociatedIdsBeforeSave()) return;

      const isNewRecord = !record?.identity?.id;

      if (!validateArchiveHoldingInstitutionBeforeSave({ isNewRecord })) return;

      const payload = archiveBuildSavePayload();
      const lang =
        (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
        window.appSession?.profile?.preferred_language ||
        "en";

      const url = isNewRecord
        ? `/api/archive?lang=${encodeURIComponent(lang)}`
        : `/api/archive/${record.identity.id}?lang=${encodeURIComponent(lang)}`;

      const method = isNewRecord ? "POST" : "PATCH";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        console.error("Archive save response:", data);

        const message =
          data.detail ||
          data.error ||
          t("archive_save_failed", "Archive save failed");

        alert(message);
        showArchiveToast(message, "error");
        return;
      }

      const savedRecord = data.record;

      if (!savedRecord?.identity?.id) {
        throw new Error("Save succeeded, but the saved record was not returned.");
      }

      const saveSummary = data.save_summary || null;
      rememberArchiveSaveSummary(saveSummary);

      // Keep the saved record visible immediately, even if list reload fails.
      archivePendingNewRecord = null;
      archiveSelectedRecord = savedRecord;
      archiveIsEditMode = false;
      archiveIsDirty = false;
      archiveJustSavedRecordId = savedRecord.identity.id;

      archiveRenderRecordDetails(savedRecord);
      archiveRenderActionBar({
        hasRecord: true,
        canEdit: canEditArchiveRecord(savedRecord)
      });

      const savedStorage =
        savedRecord?.source?.storage ||
        record?.source?.storage ||
        archiveSelectedRecord?.source?.storage ||
        null;

      const isPublicCaalArchiveRecord = savedStorage === "public_caal";

      if (isNewRecord && isPublicCaalArchiveRecord) {
        showArchiveToast(
          t(
            "caal_archive_record_created_cache_pending",
            "Archive record saved to the public CAAL table. It may not appear in search/list results until the CAAL cache refreshes."
          ),
          "success",
          10000
        );

        setTimeout(() => {
          archiveJustSavedRecordId = null;
          archiveUpdateSelectedResultCard();
        }, 2500);

        return;
      }

      if (isNewRecord) {
        showArchiveToast(
          t("archive_record_created", "Archive record created"),
          "success",
          3000
        );
      } else if (isPublicCaalArchiveRecord) {
        showArchiveToast(
          t(
            "caal_archive_record_saved_cache_pending",
            "Record saved. This is a CAAL archive record, so search/list values may not update until the CAAL cache refreshes. Your changes have been saved, but they may not appear immediately in the results list."
          ),
          "success",
          12000
        );
      } else {
        showArchiveToast(
          saveSummary?.caal_id
            ? `${t("archive_record_saved", "Archive record saved")}: ${saveSummary.caal_id}`
            : t("archive_record_saved", "Archive record saved"),
          "success",
          3000
        );
      }
      
      if (!isNewRecord && isPublicCaalArchiveRecord && data.record) {
        const currentRecord = {
          ...data.record,
          source: {
            ...(data.record.source || {}),
            scope: data.record.source?.scope || record.source?.scope || "all_caal",
            storage: data.record.source?.storage || savedStorage,
            is_promoted: data.record.source?.is_promoted ?? true,
            is_editable: true
          }
        };

        archivePendingNewRecord = null;
        archiveSelectedRecord = currentRecord;
        archiveIsEditMode = false;
        archiveIsDirty = false;
        archiveJustSavedRecordId = currentRecord.identity.id;

        archiveRenderRecordDetails(currentRecord);
        archiveRenderActionBar({
          hasRecord: true,
          canEdit: canEditArchiveRecord(currentRecord)
        });

        try {
          await loadRecentlySavedArchiveRecords();
          archiveUpdateSelectedResultCard();
        } catch (error) {
          console.warn("Could not refresh recently saved archive markers:", error);
        }

        showArchiveToast(
          t(
            "caal_archive_record_saved_cache_pending",
            "Record saved. This is a CAAL archive record, so search/list values may not update until the CAAL cache refreshes. Your changes have been saved, but they may not appear immediately in the results list."
          ),
          "success",
          12000
        );

        return;
      }
      
      try {
        await loadArchiveRecords(archiveLimit, archiveOffset, {
          preserveSelection: true
        });

        const refreshedLightRecord = archiveAllRecords.find(
          (item) => Number(item?.identity?.id) === Number(savedRecord.identity.id)
        );

        if (refreshedLightRecord) {
          try {
            const refreshedFullRecord = await loadFullArchiveRecord(refreshedLightRecord);

            archiveSelectedRecord = refreshedFullRecord;
            archiveRenderRecordDetails(refreshedFullRecord);
            applyArchiveStaticLabels();
          } catch (error) {
            console.error("Failed to reload full archive record after save:", error);

            archiveSelectedRecord = savedRecord;
            archiveRenderRecordDetails(savedRecord);
          }
        } else {
          archiveSelectedRecord = savedRecord;
          archiveRenderRecordDetails(savedRecord);
        }

        archiveUpdateSelectedResultCard();
      } catch (reloadError) {
        console.error("Archive reload after save failed:", reloadError);

        archiveSelectedRecord = savedRecord;
        archiveRenderRecordDetails(savedRecord);

        showArchiveToast(
          t(
            "archive_saved_reload_failed",
            "Record was saved, but the results list could not be refreshed."
          ),
          "warning"
        );
      }

      setTimeout(() => {
        archiveJustSavedRecordId = null;
        archiveUpdateSelectedResultCard();
      }, 2500);
    } catch (error) {
      console.error("Archive save failed:", error);

      const message =
        error.message ||
        t("archive_save_failed", "Archive save failed");

      alert(message);
      showArchiveToast(message, "error");

      // Keep the form exactly as-is so the user can retry.
      archiveIsEditMode = true;
      archiveIsDirty = true;
      archiveSyncModeVisualState();
    } finally {
      archiveSaveBtn.disabled = false;
      archiveSaveBtn.classList.remove("is-disabled");
      archiveSaveBtn.setAttribute("aria-busy", "false");

      if (archiveCancelEditBtn) {
        archiveCancelEditBtn.disabled = false;
        archiveCancelEditBtn.classList.remove("is-disabled");
      }

      if (archiveDeleteBtn) {
        archiveDeleteBtn.disabled = false;
        archiveDeleteBtn.classList.remove("is-disabled");
      }
    }
  };
}

if (archiveDeleteBtn) {
  archiveDeleteBtn.onclick = archiveDeleteCurrentRecord;
}

  archiveWireEditMultiSelects();
  archiveWireCaalIdChipInputs();
  archiveWireInstitutionPicker();
  wireArchiveChangedFieldHighlights(archiveRecordDetails);

  Array.from(archiveRecordDetails.querySelectorAll("input, textarea, select")).forEach((el) => {
    el.addEventListener("input", () => {
      archiveIsDirty = true;
    });
    el.addEventListener("change", () => {
      archiveIsDirty = true;
    });
  });
}



// Events
// --------------------------------------------------------
if (toggleArchiveFiltersBtn && archiveFiltersPanel) {
  toggleArchiveFiltersBtn.addEventListener("click", () => {
    const isHidden = archiveFiltersPanel.hidden;
    archiveFiltersPanel.hidden = !isHidden;
    toggleArchiveFiltersBtn.textContent = isHidden
      ? t("hide_advanced_filters", "Hide advanced filters")
      : t("advanced_filters", "Advanced filters");
  });
}

if (clearArchiveFiltersBtn) {
  clearArchiveFiltersBtn.addEventListener("click", async () => {
    await archiveClearFilters();
  });
}

if (archiveSearch) {
  archiveSearch.addEventListener("input", archiveScheduleFilterReload);
}

if (archiveFilterCaalId) {
  archiveFilterCaalId.addEventListener("input", archiveScheduleFilterReload);
}

[
  filterArchiveRelatedCountries,
  filterArchiveRelatedReligions,
  filterArchiveRelatedSubjects,
  filterArchiveContentType,
  filterArchiveLanguages
].forEach((selectEl) => {
  if (selectEl) {
    selectEl.addEventListener("change", () => {
      archiveRenderAllFilterChips();
      archiveRenderActiveFilterChips();
      archiveReloadFromFilters();
    });
  }
});

[showArchiveWorkspace, showArchiveNationalRef, showArchiveAllCaal].forEach((el) => {
  if (!el) return;

  el.addEventListener("change", async () => {
    if (!archiveConfirmLoseChanges()) {
      el.checked = !el.checked;
      return;
    }

    archiveOffset = 0;
    archivePendingNewRecord = null;
    archiveSelectedRecord = null;
    archiveIsEditMode = false;
    archiveIsDirty = false;
    archiveClosePreview();
    archiveSyncModeVisualState();

    const scopes = getArchiveEnabledScopes();

    if (!scopes.length) {
      setArchiveLoading(false);
      renderArchiveNoScopeSelectedState();
      renderArchiveEmptyState();
      archiveRenderActionBar();
      return;
    }

    setArchiveLoading(true, t("updating_records", "Updating records..."));
    setArchiveResultsCountLoading();

    try {
      await loadArchiveRecords(archiveLimit, 0);
      renderArchiveEmptyState();
    } catch (error) {
      console.error("Archive scope reload failed:", error);
      setArchiveResultsError(
        t("archive_scope_update_failed", "Archive scope update failed. Please try again.")
      );
    } finally {
      setArchiveLoading(false);
    }
  });
});

document.addEventListener("app:languageChanged", async (event) => {
  const selectedId = archiveSelectedRecord?.identity?.id || null;
  const lang = archiveCurrentLanguageCode(event);

  archiveActiveLanguage = lang;

  setArchiveLoading(true, t("switching_language", "Switching language..."));

  try {
    await loadArchiveLabels(lang);
    applyArchiveStaticLabels();
  } catch (error) {
    console.error("Archive label refresh failed:", error);
    // Do not wipe archiveLabels here. Keeping old labels is safer than forcing English fallback.
  } finally {
    await archiveLoadCacheStatus();
  }

  try {
    await loadArchiveLookups(lang);
    archivePopulateFilterLookups();
  } catch (error) {
    console.error("Archive lookup refresh failed:", error);
    // Do not wipe archiveLookups here. Keeping old lookups is safer than blanking controls.
  }

  if (typeof refreshArchivePaginationSoon === "function") {
    try {
      refreshArchivePaginationSoon();
    } catch (error) {
      console.warn("Archive pagination refresh failed:", error);
    }
  }

  try {
    await loadArchiveRecords(archiveLimit, archiveOffset, {
      preserveSelection: true
    });

    if (selectedId) {
      const refreshedLightRecord = archiveAllRecords.find(
        (record) => Number(record?.identity?.id) === Number(selectedId)
      );

      if (refreshedLightRecord) {
        const refreshedFullRecord = await loadFullArchiveRecord(refreshedLightRecord, lang);

        archiveSelectedRecord = refreshedFullRecord;
        archiveRenderRecordDetails(refreshedFullRecord);
        archiveUpdateSelectedResultCard();
        applyArchiveStaticLabels();
      } else {
        archiveSelectedRecord = null;
        archivePendingNewRecord = null;
        archiveIsEditMode = false;
        archiveIsDirty = false;
        archiveSyncModeVisualState();
        renderArchiveEmptyState();
      }
    } else {
      archiveSelectedRecord = null;
      archivePendingNewRecord = null;
      archiveIsEditMode = false;
      archiveIsDirty = false;
      archiveSyncModeVisualState();
      renderArchiveEmptyState();
    }
  } catch (error) {
    console.error("Archive records refresh failed:", error);

  } finally {
    setArchiveLoading(false);
  }
});

if (archivePreviewCloseBtn) {
  archivePreviewCloseBtn.addEventListener("click", archiveClosePreview);
}

if (archivePreviewModal) {
  archivePreviewModal.addEventListener("click", (event) => {
    if (event.target === archivePreviewModal) {
      archiveClosePreview();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (!archivePreviewModal || archivePreviewModal.hidden) return;

  event.preventDefault();
  archiveClosePreview();
});

if (addArchiveBtn) {
  addArchiveBtn.addEventListener("click", () => {
    if (!archiveConfirmLoseChanges()) return;

    const newRecord = makeNewBlankArchiveRecord();
    archivePendingNewRecord = newRecord;
    archiveSelectedRecord = newRecord;
    archiveIsEditMode = true;
    archiveIsDirty = false;
    archiveRenderRecordDetails(newRecord);
    archiveUpdateSelectedResultCard();
  });
}

if (archiveCloseRecordBtn) {
  archiveCloseRecordBtn.addEventListener("click", clearSelectedArchiveRecord);
}

// Pagination
if (archivePrevBtn) {
  archivePrevBtn.addEventListener("click", async () => {
    if (!archiveConfirmLoseChanges()) return;

    const newOffset = Math.max(0, archiveOffset - archiveLimit);

    archivePendingNewRecord = null;
    archiveIsEditMode = false;

    setArchiveLoading(true, t("loading_page", "Loading page..."));

    try {
      await loadArchiveRecords(archiveLimit, newOffset);
    } catch (error) {
      console.error("Archive page load failed:", error);
      setArchiveResultsError(
        t("archive_page_load_failed", "Archive page could not be loaded. Please try again.")
      );
    } finally {
      setArchiveLoading(false);
    }
  });
}

if (archiveNextBtn) {
  archiveNextBtn.addEventListener("click", async () => {
    if (!archiveConfirmLoseChanges()) return;

    const newOffset = archiveOffset + archiveLimit;

    archivePendingNewRecord = null;
    archiveIsEditMode = false;

    setArchiveLoading(true, t("loading_page", "Loading page..."));

    try {
      await loadArchiveRecords(archiveLimit, newOffset);
    } catch (error) {
      console.error("Archive page load failed:", error);
      setArchiveResultsError(
        t("archive_page_load_failed", "Archive page could not be loaded. Please try again.")
      );
    } finally {
      setArchiveLoading(false);
    }
  });
}

// Initial load
// --------------------------------------------------------
window.addEventListener("beforeunload", (event) => {
  if (!archiveIsEditMode || !archiveIsDirty) {
    return;
  }

  event.preventDefault();

  // Required for Chrome/Edge/Firefox. Browser controls the actual text shown.
  event.returnValue = "";
});

function getInitialTextFromUrl() {
  return new URLSearchParams(window.location.search).get("text");
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  if (archiveUserIsCaalAdmin() && refreshArchiveCacheBtn) {
    refreshArchiveCacheBtn.hidden = false;

    refreshArchiveCacheBtn.addEventListener("click", async () => {
      refreshArchiveCacheBtn.disabled = true;
      refreshArchiveCacheBtn.textContent = t("refreshing", "Refreshing...");
      setArchiveLoading(true, t("refreshing_caal_cache", "Refreshing CAAL cache..."));

      try {
        const response = await fetch("/api/archive/admin/refresh-caal-cache", {
          method: "POST",
          credentials: "include"
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          alert(data.detail || data.error || t("cache_refresh_failed", "Cache refresh failed"));
          return;
        }

        showArchiveToast(
          t("caal_cache_refreshed", "Archive cache refreshed"),
          "success",
          3000
        );

        await loadArchiveRecords(archiveLimit, archiveOffset, {
          preserveSelection: true
        });
        await archiveLoadCacheStatus();
      } catch (error) {
        console.error("Archive cache refresh failed:", error);
        alert(error.message || t("cache_refresh_failed", "Cache refresh failed"));
      } finally {
        refreshArchiveCacheBtn.disabled = false;
        refreshArchiveCacheBtn.textContent = t("refresh_archive_cache", "Refresh archive cache");
        setArchiveLoading(false);
      }
    });
  }

  const initialCaalId = getInitialCaalIdFromUrl();
  const initialScope = getInitialScopeFromUrl();

  const initialText = getInitialTextFromUrl();

  const normalisedInitialScope = normaliseArchiveScopeForSession(initialScope, session);

  applyArchiveScopeUiForSession(session, {
    setDefault: !initialCaalId && !normalisedInitialScope
  });

  let directLinkedRecord = null;

  if (initialCaalId && archiveFilterCaalId) {
    archiveFilterCaalId.value = initialCaalId;
  }

  if (!initialCaalId && initialText && archiveSearch) {
    archiveSearch.value = initialText;
  }

  renderArchiveEmptyState();

  setArchiveLoading(
    true,
    initialCaalId
      ? t("loading_linked_record", "Loading linked record...")
      : t("loading_records", "Loading records...")
  );

  try {
    await loadArchiveLabels();
    applyArchiveStaticLabels();
    await archiveLoadCacheStatus();

    await loadArchiveLookups();
    archivePopulateFilterLookups();

    if (initialCaalId) {
      const resolved = await loadDirectLinkedRecord(initialCaalId);

      if (resolved?.record_type === "archive" && resolved.record) {
        directLinkedRecord = resolved.record;

        const resolvedScope = normaliseArchiveScopeForSession(
          resolved.record.source?.scope || initialScope,
          session
        );

        if (resolvedScope) {
          if (showArchiveWorkspace) showArchiveWorkspace.checked = false;
          if (showArchiveNationalRef) showArchiveNationalRef.checked = false;
          if (showArchiveAllCaal) showArchiveAllCaal.checked = false;

          if (resolvedScope === "workspace" && showArchiveWorkspace) {
            showArchiveWorkspace.checked = true;
          }

          if (resolvedScope === "national_ref" && showArchiveNationalRef) {
            showArchiveNationalRef.checked = true;
          }

          if (resolvedScope === "all_caal" && showArchiveAllCaal) {
            showArchiveAllCaal.checked = true;
          }
        }

        archiveSelectedRecord = directLinkedRecord;
        archiveRenderRecordDetails(directLinkedRecord);
        archiveUpdateSelectedResultCard();
      }
      } else if (normalisedInitialScope) {
        if (showArchiveWorkspace) showArchiveWorkspace.checked = false;
        if (showArchiveNationalRef) showArchiveNationalRef.checked = false;
        if (showArchiveAllCaal) showArchiveAllCaal.checked = false;

        if (normalisedInitialScope === "workspace" && showArchiveWorkspace) {
          showArchiveWorkspace.checked = true;
        }

        if (normalisedInitialScope === "national_ref" && showArchiveNationalRef) {
          showArchiveNationalRef.checked = true;
        }

        if (normalisedInitialScope === "all_caal" && showArchiveAllCaal) {
          showArchiveAllCaal.checked = true;
        }
      }

    await loadArchiveRecords(archiveLimit, 0);
    archiveRenderActiveFilterChips();

    if (directLinkedRecord) {
      archiveSelectedRecord = directLinkedRecord;
      archiveRenderRecordDetails(directLinkedRecord);
      archiveUpdateSelectedResultCard();
    }
  } catch (error) {
    console.error("Archive initial load failed:", error);

    if (!directLinkedRecord) {
      renderArchiveEmptyState();
    }
  } finally {
    setArchiveLoading(false);
  }
});