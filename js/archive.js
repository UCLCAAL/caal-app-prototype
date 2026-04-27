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
let archiveLimit = 10;
let archiveOffset = 0;

let archivePendingNewRecord = null;    //
let archiveIsDirty = false;      // when entering edit mode and makign a change, save resets it to false
let archivePreviewRecord = null;
let archiveJustSavedRecordId = null;

let archiveMessages = {};

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
      ? `<span class="spinner"></span><span>${message || archiveLabel("Loading...", "Loading...")}</span>`
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

// Label helpers
// --------------------------------------------------------
function archiveLabel(name, fallback = null) {
  return archiveLabels[name] || fallback || name;
}

function archiveBoolLabel(value) {
  if (value === true) return archiveLabel("Yes", "Yes");
  if (value === false) return archiveLabel("No", "No");
  return archiveLabel("Unknown", "Unknown");
}

function archiveScopeLabel(scope) {
  switch (scope) {
    case "workspace":
      return archiveLabel("Workspace", "Workspace");
    case "national_ref":
      return archiveLabel("National CAAL", "National CAAL");
    case "all_caal":
      return archiveLabel("All CAAL", "All CAAL");
    default:
      return scope || archiveLabel("Unknown", "Unknown");
  }
}

// lookup helper
async function loadArchiveLookups() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

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

function updatePaginationUI() {
  if (!archivePageInfo) return;

  const start = archiveTotalCount === 0 ? 0 : archiveOffset + 1;
  const end = archiveOffset + archiveAllRecords.length;

  archivePageInfo.textContent = `${start}-${end} shown`;

  if (archivePrevBtn) {
    archivePrevBtn.disabled = archiveOffset === 0;
  }

  if (archiveNextBtn) {
    archiveNextBtn.disabled = archiveAllRecords.length < archiveLimit;
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
}

// edit/add helpers
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
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <select id="${inputId}" class="form-control" multiple>
        ${optionsHtml}
      </select>
    </div>
  `;
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
      caal_id: "[new record - unsaved]",
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

function archiveRenderGroupBlock(title, innerHtml, hasValues = true) {
  const content = hasValues
    ? innerHtml
    : `<div class="section-empty">${archiveLabel("No populated fields in this section.", "No populated fields in this section.")}</div>`;

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
          ${archiveRenderDetailItem(archiveLabel("Associated CAAL_ID", "Associated CAAL_ID"), archiveIdentity(record, "associated_caal_id"))}
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
function archiveRenderActionBar({ hasRecord = false, canEdit = false } = {}) {
  const isEditing = archiveIsEditMode;

  if (addArchiveBtn) addArchiveBtn.hidden = isEditing;
  if (archiveEditBtn) archiveEditBtn.hidden = isEditing || !hasRecord;
  if (archiveSaveBtn) archiveSaveBtn.hidden = !isEditing;
  if (archiveCancelEditBtn) archiveCancelEditBtn.hidden = !isEditing;

  if (archiveEditBtn) {
    archiveEditBtn.disabled = !canEdit;
    archiveEditBtn.title = canEdit ? "" : archiveLabel("Read only", "Read only");
  }

  if (addArchiveBtn) addArchiveBtn.classList.toggle("is-active", !isEditing && !hasRecord);
  if (archiveEditBtn) archiveEditBtn.classList.toggle("is-active", !isEditing && hasRecord);
  if (archiveSaveBtn) archiveSaveBtn.classList.toggle("is-active", isEditing);
}


// Labels API
// --------------------------------------------------------
async function loadArchiveLabels() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

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

async function loadArchiveRecords(limit = 100, offset = 0) {
  const scopes = getArchiveEnabledScopes();

  archiveAllRecords = [];
  archiveVisibleRecords = [];
  archiveSelectedRecord = null;
  archiveIsEditMode = false;
  archiveSyncModeVisualState();

  if (scopes.length === 0) {
    renderArchiveResultsList([]);
    renderArchiveEmptyState();
    return;
  }

  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const params = new URLSearchParams();
  params.set("scopes", scopes.join(","));
  params.set("lang", lang);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  if (archiveFilterCaalId?.value.trim()) {
    params.set("caalId", archiveFilterCaalId.value.trim());
  }

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
  archiveApplyFilters();

  updatePaginationUI();
}

// Search text
// --------------------------------------------------------
function archiveBuildSearchText(record) {
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
function archiveCollectFilterOptions(records) {
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
function archiveMatchesFilters(record, filters) {
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

function archiveApplyFilters() {
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

  setArchiveLoading(true, archiveLabel("Updating records...", "Updating records..."));

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

  if (archiveResultsCount) {
    archiveResultsCount.textContent = `${records.length} ${archiveLabel("records", "records")} (${archiveTotalCount} total)`;
  }

  if (records.length === 0) {
    archiveResultsList.innerHTML = `
      <div class="results-empty">
        <p>${archiveLabel("No matching records.", "No matching records.")}</p>
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
              ${archiveLabel("Preview", "Preview")}
            </button>
          </div>
        </div>
      `;
    })
    .join("");

    Array.from(archiveResultsList.querySelectorAll(".result-card")).forEach((card) => {
    card.addEventListener("click", () => {
      const idx = Number(card.dataset.archiveResultIndex);
      const record = records[idx];
      if (!record) return;

      if (!archiveConfirmLoseChanges()) {
        return;
      }

      archiveIsEditMode = false;
      archivePendingNewRecord = null;
      archiveRenderRecordDetails(record);
      archiveUpdateSelectedResultCard();
    });
  });

  Array.from(archiveResultsList.querySelectorAll(".archive-preview-btn")).forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const idx = Number(btn.dataset.archivePreviewIndex);
      const record = records[idx];
      if (!record) return;
      archiveOpenPreview(record);
    });
  });

  archiveUpdateSelectedResultCard();
  updatePaginationUI();
}

// Detail rendering
// --------------------------------------------------------
function renderArchiveEmptyState() {
  if (!archiveRecordDetails) return;

  archiveSyncModeVisualState();

  archiveRecordDetails.innerHTML = `
    <div class="empty-state">
      <p>${archiveLabel("No record selected yet.", "No record selected yet.")}</p>
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
  materialHtml += archiveRenderDetailItem(archiveLabel("Associated CAAL_ID", "Associated CAAL_ID"), archiveIdentity(record, "associated_caal_id"));
  materialHtml += archiveRenderDetailItem(archiveLabel("Original Title", "Original Title"), s.original_title, true);
  materialHtml += archiveRenderDetailItem(archiveLabel("English Title", "English Title"), s.english_title, true);
  materialHtml += archiveRenderDetailItem(archiveLabel("Content Type", "Content Type"), s.content_type);
  materialHtml += archiveRenderDetailItem(archiveLabel("Number and Type of Original Material", "Number and Type of Original Material"), archiveRaw(record, "Number and Type of Original Material"), true);
  materialHtml += archiveRenderDetailItem(archiveLabel("Size and Dimensions of Original Material", "Size and Dimensions of Original Material"), archiveRaw(record, "Size and Dimensions of Original Material"));
  materialHtml += archiveRenderDetailItem(archiveLabel("Condition of Original Material", "Condition of Original Material"), archiveRaw(record, "Condition of Original Material"));

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
    archiveIdentity(record, "associated_caal_id"),
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

  const currentUsername = window.appSession?.user?.username;
  const recordRecorder =
    record?.summary?.archive_recorder ||
    record?.raw?.["Archive Recorder"];

  const isOwner =
    currentUsername != null &&
    recordRecorder != null &&
    String(currentUsername) === String(recordRecorder);

  const canEditThisRecord =
    record.source?.is_editable &&
    isOwner;

  const statusBadge = canEditThisRecord
  ? `<span class="record-status-badge record-status-editable">${archiveLabel("Editable", "Editable")}</span>`
  : `<span class="record-status-badge record-status-readonly">${archiveLabel("Read only", "Read only")}</span>`;

  archiveRecordDetails.innerHTML = `
    <div class="${archiveRecordTitleClass(record)}">
      <div class="record-title-row">
        <h3>${safeArchiveValue(s.original_title || s.english_title)}</h3>
        ${statusBadge}
      </div>
      <p>${safeArchiveValue(s.original_reference || archiveIdentity(record, "caal_id"))}</p>
    </div>

    <div class="group-stack">
      ${archiveRenderGroupBlock(archiveLabel("Material Details", "Material Details"), materialHtml, materialHasValues)}
      ${archiveRenderGroupBlock(archiveLabel("Publication Details", "Publication Details"), publicationHtml, publicationHasValues)}
      ${archiveRenderGroupBlock(archiveLabel("Content", "Content"), contentHtml, contentHasValues)}
      ${archiveRenderGroupBlock(archiveLabel("Digital Files", "Digital Files"), digitalHtml, digitalHasValues)}
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
  metadataHtml += archiveRenderReadOnlyItem(archiveLabel("Preferred Language", "Preferred Language"),archiveRaw(record, "Preferred Language"));
  metadataHtml += archiveRenderTextInput("Country", archiveLabel("Country", "Country"), archiveRaw(record, "Country"));

  archiveRecordDetails.innerHTML = `
    <div class="${archiveRecordTitleClass(record)}">
      <h3>${safeArchiveValue(record?.summary?.original_title || record?.summary?.english_title)}</h3>
      <p>${safeArchiveValue(record?.identity?.caal_id || archiveRaw(record, "Original Reference"))}</p>
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
    canEdit: false
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
        alert(data.detail || data.error || "Archive save failed");
        return;
      }

      archivePendingNewRecord = null;
      archiveIsEditMode = false;
      archiveIsDirty = false;
      archiveRenderActionBar();

      await loadArchiveRecords(archiveLimit, archiveOffset);
      archiveJustSavedRecordId = data.record?.identity?.id || null;

      const refreshedRecord = archiveAllRecords.find(
        (item) => item?.identity?.id === data.record?.identity?.id
      );

      if (refreshedRecord) {
        archiveRenderRecordDetails(refreshedRecord);
        archiveUpdateSelectedResultCard();

        setTimeout(() => {
          archiveJustSavedRecordId = null;
          archiveUpdateSelectedResultCard();

          if (archiveSelectedRecord?.identity?.id === refreshedRecord.identity?.id) {
            archiveRenderRecordDetails(refreshedRecord);
          }
        }, 2500);
      } else {
        renderArchiveEmptyState();
      }
    } catch (error) {
      console.error("Archive save failed:", error);
      alert(error.message || "Archive save failed");
    }
  };
}

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
      ? archiveLabel("Hide advanced filters", "Hide advanced filters")
      : archiveLabel("Advanced filters", "Advanced filters");
  });
}

if (clearArchiveFiltersBtn) {
  clearArchiveFiltersBtn.addEventListener("click", async () => {
    await archiveClearFilters();
  });
}

if (archiveSearch) {
  archiveSearch.addEventListener("input", archiveApplyFilters);
}

if (archiveFilterCaalId) {
  archiveFilterCaalId.addEventListener("input", async () => {
    archiveOffset = 0;

    setArchiveLoading(true, archiveLabel("Updating records...", "Updating records..."));

    try {
      await loadArchiveRecords(archiveLimit, 0);
    } catch (error) {
      console.error("Archive CAAL_ID search failed:", error);
    } finally {
      setArchiveLoading(false);
    }
  });
}

[
  filterArchiveRelatedCountries,
  filterArchiveRelatedReligions,
  filterArchiveRelatedSubjects,
  filterArchiveContentType,
  filterArchiveLanguages
].forEach((selectEl) => {
  if (selectEl) {
    selectEl.addEventListener("change", archiveApplyFilters);
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
      setArchiveLoading(true, archiveLabel("Updating records...", "Updating records..."));

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

document.addEventListener("app:languageChanged", async () => {
  const selectedId = archiveSelectedRecord?.identity?.id || null;

  try {
    await loadArchiveLabels();
    await loadArchiveLookups();
    archivePopulateFilterLookups();
  } catch (error) {
    console.error("Archive labels/lookups refresh failed:", error);
    archiveLabels = {};
    archiveLookups = {};
  }

  try {
    await loadArchiveRecords(archiveLimit, archiveOffset);

    if (selectedId) {
      const refreshedRecord = archiveAllRecords.find(
        (record) => record?.identity?.id === selectedId
      );

      if (refreshedRecord) {
        archiveRenderRecordDetails(refreshedRecord);
      } else {
        renderArchiveEmptyState();
      }
    }
  } catch (error) {
    console.error("Archive records refresh failed:", error);
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

    setArchiveLoading(true, archiveLabel("Loading page...", "Loading page..."));

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

    setArchiveLoading(true, archiveLabel("Loading page...", "Loading page..."));

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
      ? archiveLabel("Loading linked record...", "Loading linked record...")
      : archiveLabel("Loading records...", "Loading records...")
  );

  try {
    await loadArchiveLabels();
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

    await loadArchiveRecords(100, 0);

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