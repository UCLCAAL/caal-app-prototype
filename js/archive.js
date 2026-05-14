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
const archiveRecordDetails = document.getElementById("archiveRecordDetails");

const showArchiveWorkspace = document.getElementById("showArchiveWorkspace");
const showArchiveNationalRef = document.getElementById("showArchiveNationalRef");
const showArchiveAllCaal = document.getElementById("showArchiveAllCaal");
const allCaalArchiveToggleWrapper = document.getElementById("allCaalArchiveToggleWrapper");

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

// API base
// --------------------------------------------------------
//const API_BASE = "http://localhost:3000";

console.log("archive.js loaded");


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
let archiveIsDirty = false;      // when entering edit mode and makign a change, save resets it to false
let archivePreviewRecord = null;
let archiveJustSavedRecordId = null;

let archiveMessages = {};

let archiveFilterDebounceTimer = null;

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

// labels translation loader 
function archiveText(key, fallback = null) {
  return archiveMessages[key] || archiveLabels[key] || fallback || key;
}

// loading indicator helper
function setArchiveLoading(isLoading, message = "") {
  const browsePane = document.getElementById("browse-pane");
  const detailPane = document.getElementById("detail-pane");

  console.log("setArchiveLoading:", isLoading, message);

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

// Label helpers
// --------------------------------------------------------
async function archiveReloadFromFilters() {
  archiveOffset = 0;

  setArchiveLoading(true, t("updating_records", "Updating records..."));

  try {
    await loadArchiveRecords(archiveLimit, 0);
  } catch (error) {
    console.error("Archive filter reload failed:", error);
  } finally {
    setArchiveLoading(false);
  }
}

function archiveScheduleFilterReload() {
  if (archiveFilterDebounceTimer) {
    clearTimeout(archiveFilterDebounceTimer);
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
  switch (scope) {
    case "workspace":
      return t("workspace", "Workspace");
    case "national_ref":
      return t("archives_national_records", "National CAAL records");
    case "all_caal":
      return t("other_caal_records", "Other CAAL records");
    default:
      return scope || t("unknown", "Unknown");
  }
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
    return `<span class="empty-value">${archiveLabel("Not recorded", "Not recorded")}</span>`;
  }
  return value;
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

  items.forEach((item) => {
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
    });

    select.dataset.clickToggleWired = "true";
  });

  archiveRenderAllFilterChips();
}

function archiveBuildQueryParams({ limit = archiveLimit, offset = archiveOffset } = {}) {
  const scopes = getArchiveEnabledScopes();

  const lang = archiveCurrentLanguageCode();

  const params = new URLSearchParams();
  params.set("scopes", scopes.join(","));
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
        reason: reason || null
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

function archiveRenderTextInput(fieldName, label, value, fullWidth = false) {
  const inputId = archiveInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <input type="text" id="${inputId}" class="form-control" value="${value ?? ""}">
    </div>
  `;
}

function archiveRenderTextarea(fieldName, label, value, fullWidth = true) {
  const inputId = archiveInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <textarea id="${inputId}" class="form-control" rows="4">${value ?? ""}</textarea>
    </div>
  `;
}

function archiveLookupOptions(lookupName) {
  return Array.isArray(archiveLookups?.[lookupName]) ? archiveLookups[lookupName] : [];
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

function archiveRenderSelect(fieldName, label, lookupName, currentValue, fullWidth = false) {
  const inputId = archiveInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  const optionsHtml = archiveLookupOptions(lookupName)
    .map((item) => {
      const value = item.value ?? "";
      const selected = String(value) === String(currentValue ?? "") ? "selected" : "";
      return `<option value="${value}" ${selected}>${item.label ?? value}</option>`;
    })
    .join("");

  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <select id="${inputId}" class="form-control">
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
  return {
    "Level": archiveGetInputValue("Level"),
    "Original Reference": archiveGetInputValue("Original Reference"),
    "Associated CAAL_ID": archiveGetInputValue("Associated CAAL_ID"),
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

function archiveRenderResourceRelations(record) {
  const groups = groupRecordRelationsByType(record);
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

  if (!caalId) {
    return record;
  }

  const lang = archiveCurrentLanguageCode(langOverride);

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
    return `<span class="empty-value">${archiveLabel("Not recorded", "Not recorded")}</span>`;
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
            <span class="detail-section-title">${archiveLabel("Material Details", "Material Details")}</span>
          </div>

          ${archiveRenderDetailItem(archiveLabel("CAAL_ID", "CAAL_ID"), record.identity?.caal_id)}
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
            <span class="detail-section-title">${archiveLabel("Publication Details", "Publication Details")}</span>
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
        ${archiveLabel("Monument", "Monument")}
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
            <span class="detail-section-title">${archiveLabel("Basic", "Basic")}</span>
          </div>

          ${archiveRenderDetailItem(archiveLabel("CAAL_ID", "CAAL_ID"), caalId)}
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
            <span class="detail-section-title">${archiveLabel("Monument", "Monument")}</span>
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
            <span class="detail-section-title">${archiveLabel("Location", "Location")}</span>
          </div>

          ${archiveRenderDetailItem(archiveLabel("Longitude", "Longitude"), record.summary?.longitude || record.raw?.["Longitude"])}
          ${archiveRenderDetailItem(archiveLabel("Latitude", "Latitude"), record.summary?.latitude || record.raw?.["Latitude"])}
          ${archiveRenderDetailItem(archiveLabel("Location Notes", "Location Notes"), record.raw?.["Location Notes"], true)}
        </div>
      </div>
    </div>
  `;

  archivePreviewModal.hidden = false;
  archiveWireAssociatedPreviewButtons(fullRecordUrl);
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
            <span class="detail-section-title">${archiveLabel("Material Details", "Material Details")}</span>
          </div>

          ${archiveRenderDetailItem(archiveLabel("CAAL_ID", "CAAL_ID"), archiveIdentity(record, "caal_id"))}
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
            <span class="detail-section-title">${archiveLabel("Publication Details", "Publication Details")}</span>
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
}

function archiveClosePreview() {
  if (!archivePreviewModal) return;
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

  console.log("Archive labels loaded for:", lang, archiveLabels);
}


// Records API
// --------------------------------------------------------
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
    renderArchiveResultsList([]);
    renderArchiveEmptyState();
    return;
  }

  const params = archiveBuildQueryParams({ limit, offset });

  console.log("Archive fetch URL:", `/api/archive?${params.toString()}`);

  const response = await fetch(`/api/archive?${params.toString()}`, {
    method: "GET",
    credentials: "include"
  });

  const data = await response.json();
  console.log("Archive response:", data);

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Failed to load archive records");
  }

  archiveAllRecords = data.records || [];
  archiveTotalCount = data.total || 0;
  archiveLimit = data.limit || limit;
  archiveOffset = data.offset || offset;

  archiveVisibleRecords = archiveAllRecords;

  renderArchiveResultsList(archiveVisibleRecords);
  renderArchivePageInfo();
}

// Search text
// --------------------------------------------------------
function archiveBuildSearchText_old(record) {
  const s = record.summary || {};

  const fields = [
    archiveIdentity(record, "caal_id"),
    archiveIdentity(record, "associated_caal_id"),

    s.original_title,
    s.english_title,
    s.original_reference,
    s.content_type,
    s.country,
    s.level,
    s.archive_recorder,
    s.date_of_recording,

    archiveRaw(record, "Description"),
    archiveRaw(record, "Description - alternative language"),
    archiveRaw(record, "Number and Type of Original Material"),
    archiveRaw(record, "Size and Dimensions of Original Material"),
    archiveRaw(record, "Condition of Original Material"),
    archiveRaw(record, "Related Towns and Cities"),
    archiveRaw(record, "Other Subjects"),
    archiveRaw(record, "Dates of Original Material"),
    archiveRaw(record, "Author of the Original Material"),
    archiveRaw(record, "Publisher of the Original Material"),
    archiveRaw(record, "Editor of the Original Material"),
    archiveRaw(record, "Volume and Issue Number"),
    archiveRaw(record, "Script of Material"),
    archiveRaw(record, "Writing System"),
    archiveRaw(record, "Copyright Holder Name"),
    archiveRaw(record, "Copyright Attribution"),
    archiveRaw(record, "Digital Folder Name"),
    archiveRaw(record, "Digital Files Name"),
    archiveRaw(record, "Creation Date of Digital Files"),
    archiveRaw(record, "Format of Digital Files"),
    archiveRaw(record, "Number of Digital Files"),
    archiveRaw(record, "Colour"),
    archiveRaw(record, "Resolution"),
    archiveRaw(record, "Resource"),

    ...archiveArrayValue(archiveRaw(record, "Related Countries")),
    ...archiveArrayValue(archiveRaw(record, "Related Religions")),
    ...archiveArrayValue(archiveRaw(record, "Related Subjects")),
    ...archiveArrayValue(archiveRaw(record, "Languages of Material"))
  ];

  return fields.map(archiveNormalizeSearchText).join(" ");
}

// Filter option collection
// --------------------------------------------------------
function archiveCollectFilterOptions_old(records) {
  const relatedCountries = [];
  const relatedReligions = [];
  const relatedSubjects = [];
  const contentTypes = [];
  const languages = [];

  records.forEach((record) => {
    relatedCountries.push(...archiveArrayValue(archiveRaw(record, "Related Countries")));
    relatedReligions.push(...archiveArrayValue(archiveRaw(record, "Related Religions")));
    relatedSubjects.push(...archiveArrayValue(archiveRaw(record, "Related Subjects")));
    contentTypes.push(record?.summary?.content_type);
    languages.push(...archiveArrayValue(archiveRaw(record, "Languages of Material")));
  });

  return {
    caalId: archiveFilterCaalId ? archiveFilterCaalId.value.trim() : "",
    relatedCountries: archiveUniqueSorted(relatedCountries),
    relatedReligions: archiveUniqueSorted(relatedReligions),
    relatedSubjects: archiveUniqueSorted(relatedSubjects),
    contentTypes: archiveUniqueSorted(contentTypes),
    languages: archiveUniqueSorted(languages)
  };
}

// Filter logic
// --------------------------------------------------------
function archiveMatchesFilters_old(record, filters) {
  const fv = record.filter_values || {};

  const matchesText =
    !filters.text ||
    archiveBuildSearchText(record).includes(filters.text.toLowerCase());

  const matchesCaalId =
    !filters.caalId ||
    String(archiveIdentity(record, "caal_id") || "")
      .toLowerCase()
      .includes(filters.caalId.toLowerCase());  

  const matchesRelatedCountries =
    filters.relatedCountries.length === 0 ||
    (fv.related_countries || []).some((value) => filters.relatedCountries.includes(value));

  const matchesRelatedReligions =
    filters.relatedReligions.length === 0 ||
    (fv.related_religions || []).some((value) => filters.relatedReligions.includes(value));

  const matchesRelatedSubjects =
    filters.relatedSubjects.length === 0 ||
    (fv.related_subjects || []).some((value) => filters.relatedSubjects.includes(value));

  const matchesContentType =
    filters.contentTypes.length === 0 ||
    filters.contentTypes.includes(fv.content_type);

  const matchesLanguages =
    filters.languages.length === 0 ||
    (fv.languages || []).some((value) => filters.languages.includes(value));

  return (
    matchesText &&
    matchesCaalId &&
    matchesRelatedCountries &&
    matchesRelatedReligions &&
    matchesRelatedSubjects &&
    matchesContentType &&
    matchesLanguages
  );
}

function archiveApplyFilters_old() {
  const filters = {
    text: archiveSearch ? archiveSearch.value.trim() : "",
    caalId: archiveFilterCaalId ? archiveFilterCaalId.value.trim() : "",
    relatedCountries: archiveSelectedValues(filterArchiveRelatedCountries),
    relatedReligions: archiveSelectedValues(filterArchiveRelatedReligions),
    relatedSubjects: archiveSelectedValues(filterArchiveRelatedSubjects),
    contentTypes: archiveSelectedValues(filterArchiveContentType),
    languages: archiveSelectedValues(filterArchiveLanguages)
  };

  archiveVisibleRecords = archiveAllRecords.filter((record) =>
    archiveMatchesFilters(record, filters)
  );

  renderArchiveResultsList(archiveVisibleRecords);
}

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
  try {
    await loadArchiveRecords(archiveLimit, 0);
  } catch (error) {
    console.error("Archive clear filters failed:", error);
  } finally {
    setArchiveLoading(false);
  }
}

// Results rendering
// --------------------------------------------------------
function handleArchiveResultOpen(record) {
  if (archiveIsEditMode) {
    archiveOpenPreview(record);
    return;
  }

  archiveRenderRecordDetails(record);
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
      return `
        <div
          class="result-card ${archiveSelectedRecord?.identity?.id === record.identity?.id ? "is-selected" : ""}"
          data-archive-result-index="${index}"
          data-archive-record-id="${record.identity?.id ?? ""}"
        >
          <div class="result-card-topline">
            <strong>${safeArchiveValue(s.original_title || s.english_title)}</strong>
            <span class="scope-badge">${safeArchiveValue(archiveScopeLabel(record.source?.scope))}</span>
          </div>

          <div class="result-card-meta">${safeArchiveValue(record.identity?.caal_id)}</div>
          <div class="result-card-meta">${safeArchiveValue(s.content_type)}</div>

          <div class="result-card-actions">
            <button type="button" class="action-btn archive-preview-btn" data-archive-preview-index="${index}">
              ${archiveLabel(t("preview", "Preview"))}
            </button>
          </div>
        </div>
      `;
    })
    .join("");

    Array.from(archiveResultsList.querySelectorAll(".result-card")).forEach((card) => {
    card.addEventListener("click", async () => {
      const idx = Number(card.dataset.archiveResultIndex);
      const lightRecord = records[idx];
      if (!lightRecord) return;

      if (!archiveConfirmLoseChanges()) {
        return;
      }

      archiveIsEditMode = false;
      archivePendingNewRecord = null;

      setArchiveLoading(true, t("loading_full_record", "Loading full record..."));

      try {
        const fullRecord = await loadFullArchiveRecord(lightRecord);

        archiveSelectedRecord = fullRecord;
        archiveRenderRecordDetails(fullRecord);
        archiveUpdateSelectedResultCard();
      } catch (error) {
        console.error("Failed to load full archive record:", error);
        alert(error.message || t("could_not_load_full_archive_record", "Could not load full archive record"));
      } finally {
        setArchiveLoading(false);
      }
    });
  });

  Array.from(archiveResultsList.querySelectorAll(".archive-preview-btn")).forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();

      const idx = Number(btn.dataset.archivePreviewIndex);
      const lightRecord = records[idx];
      if (!lightRecord) return;

      setArchiveLoading(true, t("loading_preview", "Loading preview..."));

      try {
        const fullRecord = await loadFullArchiveRecord(lightRecord);
        archiveOpenPreview(fullRecord);
      } catch (error) {
        console.error("Failed to load archive preview:", error);
        alert(error.message || t("could_not_load_full_archive_record", "Could not load full archive record"));
      } finally {
        setArchiveLoading(false);
      }
    });
  });

  archiveUpdateSelectedResultCard();
  renderArchivePageInfo();
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

function archiveUpdateSelectedResultCard() {
  if (!archiveResultsList) return;

  const selectedId = archiveSelectedRecord?.identity?.id;

  Array.from(archiveResultsList.querySelectorAll(".result-card")).forEach((card) => {
    const cardId = Number(card.dataset.archiveRecordId);

    card.classList.toggle(
      "is-selected",
      selectedId !== null && selectedId !== undefined && cardId === Number(selectedId)
    );

    card.classList.toggle(
      "result-card-saved",
      archiveJustSavedRecordId !== null && cardId === archiveJustSavedRecordId
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

  let materialHtml = "";
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
  digitalHtml += archiveRenderDetailItem(archiveLabel("Still under Copyright", "Still under Copyright"), archiveBoolLabel(archiveRaw(record, "still_under_copyright")));
  digitalHtml += archiveRenderDetailItem(archiveLabel("Copyright Holder Name", "Copyright Holder Name"), archiveRaw(record, "Copyright Holder Name"), true);
  digitalHtml += archiveRenderDetailItem(archiveLabel("Copyright Attribution", "Copyright Attribution"), archiveRaw(record, "Copyright Attribution"), true);
  digitalHtml += archiveRenderDetailItem(archiveLabel("Digital Folder Name", "Digital Folder Name"), archiveRaw(record, "Digital Folder Name"), true);
  digitalHtml += archiveRenderDetailItem(archiveLabel("Digital Files Name", "Digital Files Name"), archiveRaw(record, "Digital Files Name"), true);
  digitalHtml += archiveRenderDetailItem(archiveLabel("Creation Date of Digital Files", "Creation Date of Digital Files"), archiveRaw(record, "Creation Date of Digital Files"));
  digitalHtml += archiveRenderDetailItem(archiveLabel("Format of Digital Files", "Format of Digital Files"), archiveRaw(record, "Format of Digital Files"));
  digitalHtml += archiveRenderDetailItem(archiveLabel("Number of Digital Files", "Number of Digital Files"), archiveRaw(record, "Number of Digital Files"));
  digitalHtml += archiveRenderDetailItem(archiveLabel("Colour", "Colour"), archiveRaw(record, "Colour"));
  digitalHtml += archiveRenderDetailItem(archiveLabel("Resolution", "Resolution"), archiveRaw(record, "Resolution"));

  let metadataHtml = "";
  metadataHtml += archiveRenderDetailItem(archiveLabel("Archive Recorder", "Archive Recorder"), s.archive_recorder);
  metadataHtml += archiveRenderDetailItem(archiveLabel("Date of Recording", "Date of Recording"), s.date_of_recording);
  metadataHtml += archiveRenderDetailItem(archiveLabel("Resource", "Resource"), archiveRaw(record, "Resource"), true);
  metadataHtml += archiveRenderDetailItem(archiveLabel("Scope", "Scope"), archiveScopeLabel(record.source?.scope));
  metadataHtml += archiveRenderDetailItem(archiveLabel("Editable", "Editable"), record.source?.is_editable ? archiveLabel("Yes", "Yes") : archiveLabel("No", "No"));

  const materialHasValues = archiveSectionHasValues([
    s.level,
    s.original_reference,
    //archiveIdentity(record, "associated_caal_id"),
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
    archiveRaw(record, "Volume and Issue Number")
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
    archiveRaw(record, "still_under_copyright"),
    archiveRaw(record, "Copyright Holder Name"),
    archiveRaw(record, "Copyright Attribution"),
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
    archiveRaw(record, "Resource"),
    archiveScopeLabel(record.source?.scope)
  ]);

  const canEditThisRecord = canEditArchiveRecord(record);

  const statusBadge = canEditThisRecord
  ? `<span class="record-status-badge record-status-editable">${archiveLabel("Editable", "Editable")}</span>`
  : `<span class="record-status-badge record-status-readonly">${archiveLabel("Read only", "Read only")}</span>`;

  archiveRecordDetails.innerHTML = `
    <div class="${archiveRecordTitleClass(record)}">
      <div class="record-title-row">
        <div>
          <h3>${safeArchiveValue(s.original_title || s.english_title)}</h3>
          <p>${safeArchiveValue(archiveIdentity(record, "caal_id"))}</p>
          <div class="archive-title-associated-id related-id-list">
            <strong>${archiveLabel("Associated CAAL_ID", "Associated CAAL_ID")}:</strong>
            ${archiveRenderAssociatedRelationChips(record)}
          </div>
        </div>
        ${statusBadge}
      </div>
    </div>

    <div class="group-stack">
      ${archiveRenderGroupBlock(archiveLabel("Material Details", "Material Details"), materialHtml, materialHasValues)}
      ${archiveRenderGroupBlock(archiveLabel("Publication Details", "Publication Details"), publicationHtml, publicationHasValues)}
      ${archiveRenderGroupBlock(archiveLabel("Content", "Content"), contentHtml, contentHasValues)}
      ${archiveRenderGroupBlock(archiveLabel("Digital Files", "Digital Files"), digitalHtml, digitalHasValues)}
      ${archiveRenderGroupBlock(archiveLabel("Related resources", "Related resources"), relatedHtml, true)}
      ${archiveRenderGroupBlock(archiveLabel("Metadata", "Metadata"), metadataHtml, metadataHasValues)}
    </div>
  `;

  if (archiveEditBtn) {
    archiveEditBtn.onclick = () => {
      if (!canEditThisRecord) return;
      archiveIsEditMode = true;
      archiveIsDirty = false;
      archiveRenderRecordDetails(record);
    };
  }

  wireArchiveAssociatedCaalIdChips();

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
  //materialHtml += archiveRenderTextInput("Level", archiveLabel("Level", "Level"), archiveRaw(record, "Level"));
   materialHtml += archiveRenderSelect(
    "Level",
    archiveLabel("Level", "Level"),
    "level",
    archiveRaw(record, "Level")
  );
  materialHtml += archiveRenderTextInput("Original Reference", archiveLabel("Original Reference", "Original Reference"), archiveRaw(record, "Original Reference"));
  materialHtml += archiveRenderReadOnlyItem(archiveLabel("CAAL_ID", "CAAL_ID"), archiveIdentity(record, "caal_id"));
  materialHtml += archiveRenderTextInput("Associated CAAL_ID", archiveLabel("Associated CAAL_ID", "Associated CAAL_ID"), archiveRaw(record, "Associated CAAL_ID"));
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
    archiveRaw(record, "Condition of Original Material")
  );

  let publicationHtml = "";
  publicationHtml += archiveRenderTextInput("Dates of Original Material", archiveLabel("Dates of Original Material", "Dates of Original Material"), archiveRaw(record, "Dates of Original Material"));
  publicationHtml += archiveRenderTextarea("Author of the Original Material", archiveLabel("Author of the Original Material", "Author of the Original Material"), archiveRaw(record, "Author of the Original Material"), true);
  publicationHtml += archiveRenderTextarea("Publisher of the Original Material", archiveLabel("Publisher of the Original Material", "Publisher of the Original Material"), archiveRaw(record, "Publisher of the Original Material"), true);
  publicationHtml += archiveRenderTextarea("Editor of the Original Material", archiveLabel("Editor of the Original Material", "Editor of the Original Material"), archiveRaw(record, "Editor of the Original Material"), true);
  publicationHtml += archiveRenderTextInput("Volume and Issue Number", archiveLabel("Volume and Issue Number", "Volume and Issue Number"), archiveRaw(record, "Volume and Issue Number"));

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
  digitalHtml += archiveRenderTextInput("Copyright Holder Name", archiveLabel("Copyright Holder Name", "Copyright Holder Name"), archiveRaw(record, "Copyright Holder Name"), true);
  digitalHtml += archiveRenderTextarea("Copyright Attribution", archiveLabel("Copyright Attribution", "Copyright Attribution"), archiveRaw(record, "Copyright Attribution"), true);
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
    archiveRaw(record, "Date of Recording") || archiveLabel("Set automatically on save", "Set automatically on save")
  );
  metadataHtml += archiveRenderTextarea("Resource", archiveLabel("Resource", "Resource"), archiveRaw(record, "Resource"), true);
  metadataHtml += archiveRenderReadOnlyItem(
    archiveLabel("Preferred Language", "Preferred Language"),
    displayLanguageName(archiveRaw(record, "Preferred Language"))
  );
  metadataHtml += archiveRenderTextInput("Country", archiveLabel("Country", "Country"), archiveRaw(record, "Country"));

  archiveRecordDetails.innerHTML = `
    <div class="${archiveRecordTitleClass(record)}">
      <h3>${safeArchiveValue(record?.summary?.original_title || record?.summary?.english_title)}</h3>
      <p>${safeArchiveValue(archiveIdentity(record, "caal_id") || archiveLabel("Assigned on save", "Assigned on save"))}</p>
      <p>
        <strong>${archiveLabel("Associated CAAL_ID", "Associated CAAL_ID")}:</strong>
        ${safeArchiveValue(archiveIdentity(record, "associated_caal_id") || archiveRaw(record, "Associated CAAL_ID"))}
      </p>
    </div>

    <div class="group-stack">
      ${archiveRenderGroupBlock(archiveLabel("Material Details", "Material Details"), materialHtml, true)}
      ${archiveRenderGroupBlock(archiveLabel("Publication Details", "Publication Details"), publicationHtml, true)}
      ${archiveRenderGroupBlock(archiveLabel("Content", "Content"), contentHtml, true)}
      ${archiveRenderGroupBlock(archiveLabel("Digital Files", "Digital Files"), digitalHtml, true)}
      ${archiveRenderGroupBlock(archiveLabel("Metadata", "Metadata"), metadataHtml, true)}
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
    try {
      const payload = archiveBuildSavePayload();
      const lang =
        (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
        window.appSession?.profile?.preferred_language ||
        "en";

      const isNewRecord = !record?.identity?.id;

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
        const message = data.detail || data.error || t("archive_save_failed", "Archive save failed");
        alert(message);
        showArchiveToast(message, "error");
        return;
      }

      const savedRecord = data.record;

      if (!savedRecord?.identity?.id) {
        throw new Error("Save succeeded, but the saved record was not returned.");
      }

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
          t("archive_record_saved", "Archive record saved"),
          "success",
          3000
        );
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
      const message = error.message || t("archive_save_failed", "Archive save failed");
      alert(message);
      showArchiveToast(message, "error");

      // Keep the form exactly as-is so the user can retry.
      archiveIsEditMode = true;
      archiveIsDirty = true;
      archiveSyncModeVisualState();
    }
  };
}

if (archiveDeleteBtn) {
  archiveDeleteBtn.onclick = archiveDeleteCurrentRecord;
}

  archiveWireEditMultiSelects();

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
      archiveReloadFromFilters();
    });
  }
});

[showArchiveWorkspace, showArchiveNationalRef, showArchiveAllCaal].forEach((el) => {
  if (el) {
    el.addEventListener("change", () => {
      if (!archiveConfirmLoseChanges()) {
        el.checked = !el.checked;
        return;
      }

      archiveOffset = 0;
      archivePendingNewRecord = null;
      archiveIsEditMode = false;
      setArchiveLoading(true, t("updating_records", "Updating records..."));

      loadArchiveRecords(archiveLimit, 0)
        .catch((error) => {
          console.error("Archive scope reload failed:", error);
        })
        .finally(() => {
          setArchiveLoading(false);
        });
    });
  }
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
        renderArchiveEmptyState();
      }
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
    } finally {
      setArchiveLoading(false);
    }
  });
}

// Initial load
// --------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  if (session.permissions?.can_view_all_caal && allCaalArchiveToggleWrapper) {
    allCaalArchiveToggleWrapper.hidden = false;
  }

  const initialCaalId = getInitialCaalIdFromUrl();
  const initialScope = getInitialScopeFromUrl();

  let directLinkedRecord = null;

  if (initialCaalId && archiveFilterCaalId) {
    archiveFilterCaalId.value = initialCaalId;
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

    await loadArchiveLookups();
    archivePopulateFilterLookups();

    if (initialCaalId) {
      const resolved = await loadDirectLinkedRecord(initialCaalId);

      if (resolved?.record_type === "archive" && resolved.record) {
        directLinkedRecord = resolved.record;

        const resolvedScope = resolved.record.source?.scope || initialScope;

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
    } else if (initialScope) {
      if (showArchiveWorkspace) showArchiveWorkspace.checked = false;
      if (showArchiveNationalRef) showArchiveNationalRef.checked = false;
      if (showArchiveAllCaal) showArchiveAllCaal.checked = false;

      if (initialScope === "workspace" && showArchiveWorkspace) {
        showArchiveWorkspace.checked = true;
      }

      if (initialScope === "national_ref" && showArchiveNationalRef) {
        showArchiveNationalRef.checked = true;
      }

      if (initialScope === "all_caal" && showArchiveAllCaal) {
        showArchiveAllCaal.checked = true;
      }
    }

    await loadArchiveRecords(archiveLimit, 0);

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