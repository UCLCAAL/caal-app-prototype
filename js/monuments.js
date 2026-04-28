// ========================================================
// MONUMENTS PAGE LOGIC
// Backend-driven MVP
// ========================================================

// --------------------------------------------------------
// DOM
// --------------------------------------------------------
const recordDetails = document.getElementById("recordDetails");
const siteSearch = document.getElementById("siteSearch");

const toggleFiltersBtn = document.getElementById("toggleFiltersBtn");
const filtersPanel = document.getElementById("filtersPanel");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");

const filterCaalId = document.getElementById("filterCaalId");
const filterMonumentType = document.getElementById("filterMonumentType");
const filterClassification = document.getElementById("filterClassification");
const filterDesignation = document.getElementById("filterDesignation");
const filterReligion = document.getElementById("filterReligion");
const filterCulturalPeriod = document.getElementById("filterCulturalPeriod");
const filterCountry = document.getElementById("filterCountry");

const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");

const basemapSelect = document.getElementById("basemapSelect");

const showWorkspaceRecords = document.getElementById("showWorkspaceRecords");
const showNationalRecords = document.getElementById("showNationalRecords");
const showAllCaalRecords = document.getElementById("showAllCaalRecords");
const allCaalMonumentsToggleWrapper = document.getElementById("allCaalMonumentsToggleWrapper");
//buttons
const monumentPrevBtn = document.getElementById("monumentPrevBtn");
const monumentNextBtn = document.getElementById("monumentNextBtn");
const monumentPageInfo = document.getElementById("monumentPageInfo");

const monumentsActionBar = document.getElementById("monumentsActionBar");
const addMonumentBtn = document.getElementById("addMonumentBtn");
const monumentEditBtn = document.getElementById("monumentEditBtn");
const monumentSaveBtn = document.getElementById("monumentSaveBtn");
const monumentCancelEditBtn = document.getElementById("monumentCancelEditBtn");

const monumentMapActionBar = document.getElementById("monumentMapActionBar");
const monumentPickPointBtn = document.getElementById("monumentPickPointBtn");
const monumentCancelPickPointBtn = document.getElementById("monumentCancelPickPointBtn");
// modal
const monumentPreviewModal = document.getElementById("monumentPreviewModal");
const monumentPreviewTitle = document.getElementById("monumentPreviewTitle");
const monumentPreviewBody = document.getElementById("monumentPreviewBody");
const monumentPreviewCloseBtn = document.getElementById("monumentPreviewCloseBtn");


// --------------------------------------------------------
// State
// --------------------------------------------------------
let monumentMapRecords = [];
let monumentListRecords = [];
let monumentSelectedRecord = null;

let monumentIsEditMode = false;
let monumentIsAddMode = false;
let monumentPendingNewRecord = null;
let monumentIsDirty = false;

let monumentLabels = {};
let monumentLookups = {};

let monumentTotalCount = 0;
let monumentPageLimit = 100;
let monumentPageOffset = 0;

let monumentsIsLoading = false;

let monumentMoveDebounceTimer = null;
let monumentFilterDebounceTimer = null;

let monumentListRequestSeq = 0;
let monumentMapRequestSeq = 0;

let monumentTotalIsExact = true;
let monumentMapIsStale = false;

// --------------------------------------------------------
// MapLibre map
// --------------------------------------------------------
const mapElement = document.getElementById("map");
let map = null;
let mapLoaded = false;
let monumentsLayerEventsBound = false;

function drawSelectedMonumentHighlight(record) {
  if (!map || !mapLoaded || !record?.geometry?.coordinates) return;

  const feature = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: record.geometry,
        properties: {
          id: record.identity?.id,
          caal_id: record.identity?.caal_id,
          primary_name: record.summary?.primary_name
        }
      }
    ]
  };

  if (map.getLayer("monument-selected-ring")) {
    map.removeLayer("monument-selected-ring");
  }
  if (map.getSource("monument-selected")) {
    map.removeSource("monument-selected");
  }

  map.addSource("monument-selected", {
    type: "geojson",
    data: feature
  });

  map.addLayer({
    id: "monument-selected-ring",
    type: "circle",
    source: "monument-selected",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 7,
        8, 9,
        12, 11
      ],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffd54f"
    }
  });
}

function ensureRecordVisibleOnMap(record) {
  if (!map || !record?.geometry?.coordinates) return;

  const [lng, lat] = record.geometry.coordinates;
  const bounds = map.getBounds();
  const isSatellite = basemapSelect?.value === "satellite";
  const targetZoom = isSatellite ? 4.5 : 5;

  if (!bounds.contains([lng, lat])) {
    map.easeTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), targetZoom),
      duration: 500
    });
  }
}

function drawPendingPickPoint(latlng) {
  if (!map || !mapLoaded) return;

  const lng = Number(latlng.lng);
  const lat = Number(latlng.lat);

  const feature = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lng, lat]
        },
        properties: {}
      }
    ]
  };

  if (map.getLayer("monument-pick-point")) {
    map.removeLayer("monument-pick-point");
  }
  if (map.getSource("monument-pick-point")) {
    map.removeSource("monument-pick-point");
  }

  map.addSource("monument-pick-point", {
    type: "geojson",
    data: feature
  });

  map.addLayer({
    id: "monument-pick-point",
    type: "circle",
    source: "monument-pick-point",
    paint: {
      "circle-radius": 7,
      "circle-color": "#2a9d8f",
      "circle-opacity": 0.95,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff"
    }
  });
}

function clearPendingPickPoint() {
  if (!map) return;

  if (map.getLayer("monument-pick-point")) {
    map.removeLayer("monument-pick-point");
  }
  if (map.getSource("monument-pick-point")) {
    map.removeSource("monument-pick-point");
  }
}

// --------------------------------------------------------
// Helpers
// --------------------------------------------------------
function moveSelection(direction) {
  if (!monumentListRecords.length) return;

  const currentIndex = monumentListRecords.findIndex(
    r => r.identity?.id === monumentSelectedRecord?.identity?.id
  );

  let newIndex = currentIndex + direction;

  if (newIndex < 0) newIndex = 0;
  if (newIndex >= monumentListRecords.length) newIndex = monumentListRecords.length - 1;

  const record = monumentListRecords[newIndex];
  if (!record) return;

  monumentSelectedRecord = record;
  renderMonumentRecordDetails(record);
  updateSelectedResultCard();
  drawSelectedMonumentHighlight(record);
}

function updateSelectedResultCard() {
  if (!resultsList) return;

  const selectedId = Number(monumentSelectedRecord?.identity?.id);

  Array.from(resultsList.querySelectorAll(".result-card")).forEach((resultCard) => {
    const idx = Number(resultCard.dataset.resultIndex);
    const record = monumentListRecords[idx];

    const isSelected =
      Number(record?.identity?.id) === selectedId;

    resultCard.classList.toggle("is-selected", isSelected);
  });
}

const monumentDetailPane = document.getElementById("monumentDetailPane");

function monumentSyncModeVisualState() {
  if (!monumentDetailPane) return;
  monumentDetailPane.classList.toggle("monument-editing", monumentIsEditMode);
}

function setMonumentsLoading(isLoading, message = "") {
  monumentsIsLoading = isLoading;

  const indicator = document.getElementById("monumentsLoadingIndicator");
  const browsePane = document.getElementById("browse-pane");
  const mapPane = document.getElementById("map-pane");
  const detailPane = document.getElementById("detail-pane");

  console.log("setMonumentsLoading:", isLoading, message);

  if (indicator) {
    indicator.hidden = !isLoading;
    indicator.innerHTML = isLoading
      ? `<span class="spinner"></span><span>${message || "Loading..."}</span>`
      : "";
  }

  [browsePane, mapPane, detailPane].forEach((el) => {
    if (el) {
      if (isLoading) {
        el.classList.add("is-loading");
      } else {
        el.classList.remove("is-loading");
      }
    }
  });
}

function setResultsCountLoading(message = null) {
  if (!resultsCount) return;

  const label = message || mLabel("Searching...", "Searching...");
  resultsCount.innerHTML = `<span class="mini-spinner"></span>${label}`;
}

function setMapStaleState(isStale, message = null) {
  monumentMapIsStale = isStale;

  const mapPane = document.getElementById("map-pane");
  if (!mapPane) return;

  mapPane.classList.toggle("map-is-stale", isStale);

  let notice = document.getElementById("mapStatusNotice");

  if (!notice) {
    notice = document.createElement("div");
    notice.id = "mapStatusNotice";
    notice.className = "map-status-notice";
    mapPane.appendChild(notice);
  }

  notice.hidden = !isStale;
  notice.innerHTML = isStale
    ? `<span class="mini-spinner"></span>${message || mLabel("Redrawing map...", "Redrawing map...")}`
    : "";
}

function scheduleMonumentSearchAndMapRedraw() {
  if (monumentFilterDebounceTimer) {
    clearTimeout(monumentFilterDebounceTimer);
  }

  setResultsCountLoading();
  setMapStaleState(true, mLabel("Map will update after search...", "Map will update after search..."));

  monumentFilterDebounceTimer = setTimeout(async () => {
    await applyMonumentFilters({ includeMap: true, listFirst: true });
  }, 500);
}

function mLabel(name, fallback = null) {
  return monumentLabels[name] || fallback || name;
}

function mSafeValue(value) {
  if (value === null || value === undefined || value === "") {
    return `<span class="empty-value">${mLabel("Not recorded", "Not recorded")}</span>`;
  }
  return value;
}

function mHasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function mNormalizeSearchText(value) {
  if (!mHasValue(value)) return "";
  return String(value).toLowerCase();
}

function mUniqueSorted(values) {
  return Array.from(new Set(values.filter(mHasValue))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function mSelectedValues(selectEl) {
  if (!selectEl) return [];
  return Array.from(selectEl.selectedOptions).map((option) => option.value);
}

function mPopulateMultiSelect(selectEl, items) {
  if (!selectEl) return;
  selectEl.innerHTML = "";

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value ?? "";
    option.textContent = item.label ?? item.value ?? "";
    selectEl.appendChild(option);
  });
}

function mInputId(fieldName) {
  return "mon_fld_" + fieldName.replace(/[^a-zA-Z0-9]+/g, "_");
}

function mGetInputValue(fieldName) {
  const el = document.getElementById(mInputId(fieldName));
  return el ? el.value : "";
}

function mRaw(record, fieldName) {
  return record?.raw?.[fieldName] ?? null;
}

function mSummary(record, fieldName) {
  return record?.summary?.[fieldName] ?? null;
}

function mIdentity(record, fieldName) {
  return record?.identity?.[fieldName] ?? null;
}

function mGeometry(record) {
  return record?.geometry ?? null;
}

function mLookupOptions(lookupName) {
  return Array.isArray(monumentLookups?.[lookupName]) ? monumentLookups[lookupName] : [];
}

function mLookupLabel(lookupName, value) {
  const options = mLookupOptions(lookupName);
  const match = options.find((item) => String(item.value ?? "") === String(value ?? ""));
  return match ? (match.label ?? match.value ?? value) : value;
}

function mRecordSearchText(record) {
  const fields = [
    mIdentity(record, "caal_id"),
    mSummary(record, "primary_name"),
    mSummary(record, "primary_name_english"),
    mSummary(record, "country"),
    mSummary(record, "region"),
    mSummary(record, "classification"),
    mSummary(record, "designation"),
    mSummary(record, "monument_type1"),
    mSummary(record, "cultural_period1"),
    mSummary(record, "religion1"),
    mRaw(record, "Other Names"),
    mRaw(record, "Internal Reference"),
    mRaw(record, "External Reference"),
    mRaw(record, "Monument Passport"),
    mRaw(record, "Descriptive Date"),
    mRaw(record, "Primary Description"),
    mRaw(record, "Primary Description (English)"),
    mRaw(record, "Additional Notes"),
    mRaw(record, "Location Notes"),
    mRaw(record, "Primary Address"),
    mRaw(record, "World Heritage Site Name"),
    mRaw(record, "Monument is part of"),
    mRaw(record, "Monument contains"),
    mRaw(record, "Monument is associated with"),
    ...(record?.filter_values?.monument_types || []),
    ...(record?.filter_values?.religions || []),
    ...(record?.filter_values?.cultural_periods || [])
  ];

  return fields.map(mNormalizeSearchText).join(" ");
}

function mBuildSavePayload() {
  return {
    "Primary Name": mGetInputValue("Primary Name"),
    "Primary Name (English)": mGetInputValue("Primary Name (English)"),
    "Other Names": mGetInputValue("Other Names"),
    "Country": mGetInputValue("Country"),
    "Region": mGetInputValue("Region"),
    "Classification": mGetInputValue("Classification"),
    "Internal Reference": mGetInputValue("Internal Reference"),
    "External Reference": mGetInputValue("External Reference"),
    "Monument Passport": mGetInputValue("Monument Passport"),
    "Monument Type1": mGetInputValue("Monument Type1"),
    "Monument Type2": mGetInputValue("Monument Type2"),
    "Monument Type3": mGetInputValue("Monument Type3"),
    "Monument Type4": mGetInputValue("Monument Type4"),
    "Monument Type5": mGetInputValue("Monument Type5"),
    "Monument Type6": mGetInputValue("Monument Type6"),
    "Religion1": mGetInputValue("Religion1"),
    "Religion2": mGetInputValue("Religion2"),
    "Religion3": mGetInputValue("Religion3"),
    "Descriptive Date": mGetInputValue("Descriptive Date"),
    "Cultural Period1": mGetInputValue("Cultural Period1"),
    "Cultural Period2": mGetInputValue("Cultural Period2"),
    "Cultural Period3": mGetInputValue("Cultural Period3"),
    "Cultural Period4": mGetInputValue("Cultural Period4"),
    "Cultural Period5": mGetInputValue("Cultural Period5"),
    "Cultural Period6": mGetInputValue("Cultural Period6"),
    "Start Date": mGetInputValue("Start Date"),
    "End Date": mGetInputValue("End Date"),
    "Primary Description": mGetInputValue("Primary Description"),
    "Primary Description (English)": mGetInputValue("Primary Description (English)"),
    "Additional Notes": mGetInputValue("Additional Notes"),
    "Longitude": mGetInputValue("Longitude"),
    "Latitude": mGetInputValue("Latitude"),
    "Altitude": mGetInputValue("Altitude"),
    "Location Confidence": mGetInputValue("Location Confidence"),
    "Location Notes": mGetInputValue("Location Notes"),
    "Primary Address": mGetInputValue("Primary Address"),
    "Administrative Subdivision Name1": mGetInputValue("Administrative Subdivision Name1"),
    "Administrative Subdivision Type1": mGetInputValue("Administrative Subdivision Type1"),
    "Administrative Subdivision Name2": mGetInputValue("Administrative Subdivision Name2"),
    "Administrative Subdivision Type2": mGetInputValue("Administrative Subdivision Type2"),
    "Administrative Subdivision Name3": mGetInputValue("Administrative Subdivision Name3"),
    "Administrative Subdivision Type3": mGetInputValue("Administrative Subdivision Type3"),
    "Administrative Subdivision Name4": mGetInputValue("Administrative Subdivision Name4"),
    "Administrative Subdivision Type4": mGetInputValue("Administrative Subdivision Type4"),
    "Measurement Value1": mGetInputValue("Measurement Value1"),
    "Measurement Unit1": mGetInputValue("Measurement Unit1"),
    "Measurement Type1": mGetInputValue("Measurement Type1"),
    "Measurement Value2": mGetInputValue("Measurement Value2"),
    "Measurement Unit2": mGetInputValue("Measurement Unit2"),
    "Measurement Type2": mGetInputValue("Measurement Type2"),
    "Measurement Value3": mGetInputValue("Measurement Value3"),
    "Measurement Unit3": mGetInputValue("Measurement Unit3"),
    "Measurement Type3": mGetInputValue("Measurement Type3"),
    "Measurement Value4": mGetInputValue("Measurement Value4"),
    "Measurement Unit4": mGetInputValue("Measurement Unit4"),
    "Measurement Type4": mGetInputValue("Measurement Type4"),
    "Designation": mGetInputValue("Designation"),
    "World Heritage Site Name": mGetInputValue("World Heritage Site Name"),
    "Monument is part of": normaliseRelatedIdList(mGetInputValue("Monument is part of")),
    "Monument contains": normaliseRelatedIdList(mGetInputValue("Monument contains")),
    "Monument is associated with": normaliseRelatedIdList(mGetInputValue("Monument is associated with")),
    "MasterID": normaliseRelatedIdList(mGetInputValue("MasterID"))
  };
}

function mSectionHasValues(values) {
  return values.some((value) => mHasValue(value));
}

function mRenderDetailItem(label, value, fullWidth = false) {
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <span class="detail-label">${label}</span>
      <div class="detail-value">${mSafeValue(value)}</div>
    </div>
  `;
}

function mRenderGroupBlock(title, innerHtml, hasValues = true) {
  const content = hasValues
    ? innerHtml
    : `<div class="section-empty">${mLabel("No populated fields in this section.", "No populated fields in this section.")}</div>`;

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

function mRenderTextInput(fieldName, label, value, fullWidth = false) {
  const inputId = mInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <input type="text" id="${inputId}" class="form-control" value="${value ?? ""}">
    </div>
  `;
}

function mRenderTextarea(fieldName, label, value, fullWidth = true) {
  const inputId = mInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <textarea id="${inputId}" class="form-control" rows="4">${value ?? ""}</textarea>
    </div>
  `;
}

function mRenderNumberInput(fieldName, label, value, step = "any", fullWidth = false) {
  const inputId = mInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <input type="number" id="${inputId}" class="form-control" step="${step}" value="${value ?? ""}">
    </div>
  `;
}

function mRenderReadOnlyItem(label, value, fullWidth = false) {
  return mRenderDetailItem(label, value, fullWidth);
}

function mRenderSelect(fieldName, label, lookupName, currentValue, fullWidth = false) {
  const inputId = mInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  const optionsHtml = mLookupOptions(lookupName)
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

function monumentConfirmLoseChanges() {
  if (!monumentIsEditMode || !monumentIsDirty) {
    return true;
  }

  return window.confirm(
    mLabel(
      "Unsaved changes prompt",
      "You have unsaved changes. Do you want to discard them?"
    )
  );
}

// switches add/edit with save/cancel
function updateMonumentActionBar() {
  const record = monumentSelectedRecord;

  const hasSelectedRecord = !!record;

  const currentAppUserId = window.appSession?.user?.user_id ?? null;
  const recordAppUserId = record?.raw?.created_by_app_user_id ?? null;

  const isOwner =
    currentAppUserId !== null &&
    recordAppUserId !== null &&
    Number(currentAppUserId) === Number(recordAppUserId);

  const isSuperUser =
    window.appSession?.permissions?.can_edit_caal === true;

  const isWorkspaceRecord = record?.source?.scope === "workspace";
  const isCaalRecord =
    record?.source?.scope === "national_ref" ||
    record?.source?.scope === "all_caal";

  const canEditThisRecord =
    !!record &&
    (
      (isWorkspaceRecord && (isOwner || isSuperUser)) ||
      (isCaalRecord && isSuperUser)
    );

  if (addMonumentBtn) {
    addMonumentBtn.hidden = monumentIsEditMode;
  }

  if (monumentEditBtn) {
    monumentEditBtn.hidden = monumentIsEditMode || !hasSelectedRecord;
    monumentEditBtn.disabled = !canEditThisRecord;
    monumentEditBtn.title = canEditThisRecord ? "" : mLabel("Read only", "Read only");
    monumentEditBtn.classList.toggle("is-disabled", !canEditThisRecord);
  }

  if (monumentSaveBtn) {
    monumentSaveBtn.hidden = !monumentIsEditMode;
  }

  if (monumentCancelEditBtn) {
    monumentCancelEditBtn.hidden = !monumentIsEditMode;
  }
}

function getMonumentEnabledScopes() {
  const scopes = [];

  if (showWorkspaceRecords?.checked) scopes.push("workspace");
  if (showNationalRecords?.checked) scopes.push("national_ref");
  if (showAllCaalRecords?.checked) scopes.push("all_caal");

  return scopes;
}

function monumentScopeLabel(scope) {
  switch (scope) {
    case "workspace":
      return mLabel("Workspace", "Workspace");
    case "national_ref":
      return mLabel("National CAAL", "National CAAL");
    case "all_caal":
      return mLabel("All CAAL", "All CAAL");
    default:
      return scope || mLabel("Unknown", "Unknown");
  }
}

function getMonumentCurrentFilters() {
  return {
    text: siteSearch ? siteSearch.value.trim() : "",
    caalId: filterCaalId ? filterCaalId.value.trim() : "",
    monumentTypes: mSelectedValues(filterMonumentType),
    classifications: mSelectedValues(filterClassification),
    designations: mSelectedValues(filterDesignation),
    religions: mSelectedValues(filterReligion),
    culturalPeriods: mSelectedValues(filterCulturalPeriod),
    countries: mSelectedValues(filterCountry)
  };
}

function buildMonumentQueryParams({ includePaging = true } = {}) {
  const scopes = getMonumentEnabledScopes();
  const filters = getMonumentCurrentFilters();

  const params = new URLSearchParams();

  if (scopes.length) {
    params.set("scopes", scopes.join(","));
  }

  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  params.set("lang", lang);

  if (filters.text) params.set("text", filters.text);
  if (filters.caalId) params.set("caalId", filters.caalId);
  if (filters.monumentTypes.length) params.set("monumentTypes", filters.monumentTypes.join(","));
  if (filters.classifications.length) params.set("classifications", filters.classifications.join(","));
  if (filters.designations.length) params.set("designations", filters.designations.join(","));
  if (filters.religions.length) params.set("religions", filters.religions.join(","));
  if (filters.culturalPeriods.length) params.set("culturalPeriods", filters.culturalPeriods.join(","));
  if (filters.countries.length) params.set("countries", filters.countries.join(","));

  if (includePaging) {
    params.set("limit", String(monumentPageLimit));
    params.set("offset", String(monumentPageOffset));
  }

  return params;
}


// determine dates
let culturalPeriodLookup = {};

function buildCulturalPeriodLookup() {
  culturalPeriodLookup = {};

  (monumentLookups.cultural_period || []).forEach((item) => {
    const key = item.value ?? item.raw?.canonical_value;
    if (!key) return;

    culturalPeriodLookup[key] = {
      date_from: item.raw?.date_from,
      date_to: item.raw?.date_to
    };
  });
}

function recalculateMonumentDates(record) {
  if (!culturalPeriodLookup || !Object.keys(culturalPeriodLookup).length) return;
  if (!record?.raw) return;

  const cpFields = [
    "Cultural Period1",
    "Cultural Period2",
    "Cultural Period3",
    "Cultural Period4",
    "Cultural Period5",
    "Cultural Period6"
  ];

  const starts = [];
  const ends = [];

  cpFields.forEach((field) => {
    const cpValue = String(mRaw(record, field) || "").trim();
    if (!cpValue) return;

    const row = culturalPeriodLookup[cpValue];
    if (!row) return;

    const from = Number(row.date_from);
    const to = Number(row.date_to);

    if (!Number.isNaN(from)) starts.push(from);
    if (!Number.isNaN(to)) ends.push(to);
  });

  record.raw["Start Date"] = starts.length ? Math.min(...starts) : null;
  record.raw["End Date"] = ends.length ? Math.max(...ends) : null;

  // update display values in edit view
  const startInput = document.getElementById(mInputId("Start Date"));
  const endInput = document.getElementById(mInputId("End Date"));

  if (startInput) startInput.value = record.raw["Start Date"];
  if (endInput) endInput.value = record.raw["End Date"];
}

function wireMonumentCulturalPeriodDateRecalc() {
  [
    "Cultural Period1",
    "Cultural Period2",
    "Cultural Period3",
    "Cultural Period4",
    "Cultural Period5",
    "Cultural Period6"
  ].forEach((fieldName) => {
    const select = document.getElementById(mInputId(fieldName));
    if (!select) return;

    select.addEventListener("change", (e) => {
      if (!monumentSelectedRecord?.raw) return;
      monumentSelectedRecord.raw[fieldName] = e.target.value || "";
      recalculateMonumentDates(monumentSelectedRecord);
    });
  });
}

// super user cache button
// -------------------------------------
const refreshMonumentsCacheBtn = document.getElementById("refreshMonumentsCacheBtn");

if (window.appSession?.permissions?.can_edit_caal && refreshMonumentsCacheBtn) {
  refreshMonumentsCacheBtn.hidden = false;

  refreshMonumentsCacheBtn.addEventListener("click", async () => {
    refreshMonumentsCacheBtn.disabled = true;
    refreshMonumentsCacheBtn.textContent = "Refreshing...";
    setMonumentsLoading(true, "Refreshing CAAL cache...");

    try {
      const response = await fetch("/api/monuments/admin/refresh-caal-cache", {
        method: "POST",
        credentials: "include"
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        alert(data.detail || data.error || "Cache refresh failed");
        return;
      }

      showToast("CAAL cache refreshed");

      await loadMonumentMapRecords();
      await loadMonumentListRecords();
    } catch (error) {
      console.error("Cache refresh failed:", error);
      alert(error.message || "Cache refresh failed");
    } finally {
      refreshMonumentsCacheBtn.disabled = false;
      refreshMonumentsCacheBtn.textContent = "Refresh cache";
      setMonumentsLoading(false);
    }
  });
}

/// related resource helpers
// ----------------------------------------------

function parseRelatedIds(value) {
  if (!value) return [];

  return String(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normaliseRelatedIdList(value) {
  return Array.from(new Set(parseRelatedIds(value))).join(", ");
}

function isLikelyRelatedId(value) {
  return /^[^\s,;]+-\d+$/.test(String(value).trim());
}

function getInvalidRelatedIds(value) {
  return parseRelatedIds(value).filter((id) => !isLikelyRelatedId(id));
}

function mRenderRelatedIdList(label, value, fullWidth = true) {
  const ids = parseRelatedIds(value);

  const inner = ids.length
    ? ids.map((id) => `
        <button
          type="button"
          class="related-id-chip"
          data-related-id="${id}"
        >
          ${id}
        </button>
      `).join("")
    : mSafeValue("");

  return `
    <div class="detail-item${fullWidth ? " full-width" : ""}">
      <span class="detail-label">${label}</span>
      <div class="detail-value related-id-list">
        ${inner}
      </div>
    </div>
  `;
}

function wireRelatedRecordChips() {
  Array.from(document.querySelectorAll(".related-id-chip")).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const caalId = btn.dataset.relatedId;
      if (!caalId) return;

      await openRelatedRecordPreview(caalId);
    });
  });
}

async function openRelatedRecordPreview(caalId) {
  const response = await fetch(
    `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}`,
    { method: "GET", credentials: "include" }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    alert(data.error || "Could not load related record");
    return;
  }

  renderRelatedRecordModal(data.record, data.record_type, caalId);
}


function validateRelatedFieldsBeforeSave() {
  const fields = [
    "Monument is part of",
    "Monument contains",
    "Monument is associated with",
    "MasterID"
  ];

  const invalid = [];

  fields.forEach((field) => {
    const value = mGetInputValue(field);
    getInvalidRelatedIds(value).forEach((id) => {
      invalid.push(`${field}: ${id}`);
    });
  });

  if (invalid.length) {
    alert(
      "Some related IDs do not look valid:\n\n" +
      invalid.join("\n") +
      "\n\nPlease use comma-separated CAAL IDs."
    );
    return false;
  }

  return true;
}



// modal helpers
// ================================
//only populated fields
function getPopulatedPreviewFields(record, fields) {
  return fields
    .map(({ label, value }) => ({ label, value }))
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
}

// preview rows
function renderPreviewRows(items) {
  if (!items.length) {
    return `<p class="section-empty">${mLabel("No populated fields in this section.", "No populated fields in this section.")}</p>`;
  }

  return items.map((item) => `
    <div class="detail-item">
      <span class="detail-label">${item.label}</span>
      <div class="detail-value">${mSafeValue(item.value)}</div>
    </div>
  `).join("");
}

// summary list from repeated fields
function getSummaryValues(record, fieldNames, lookupName = null) {
  const values = fieldNames
    .map((field) => mRaw(record, field))
    .filter((value) => value !== null && value !== undefined && value !== "");

  if (lookupName) {
    return values.map((value) => mLookupLabel(lookupName, value));
  }

  return values;
}

//modal renderer
function renderMonumentPreviewModal(record) {
  const modal = document.getElementById("monumentPreviewModal");
  const titleEl = document.getElementById("monumentPreviewTitle");
  const bodyEl = document.getElementById("monumentPreviewBody");

  if (!modal || !titleEl || !bodyEl || !record) return;

  const basicFields = getPopulatedPreviewFields(record, [
    { label: mLabel("Primary Name", "Primary Name"), value: mSummary(record, "primary_name") },
    { label: mLabel("Primary Name (English)", "Primary Name (English)"), value: mSummary(record, "primary_name_english") },
    { label: mLabel("Other Names", "Other Names"), value: mRaw(record, "Other Names") },
    { label: mLabel("Country", "Country"), value: mSummary(record, "country") },
    { label: mLabel("Region", "Region"), value: mSummary(record, "region") },
    { label: mLabel("Classification", "Classification"), value: mSummary(record, "classification") },
    { label: mLabel("CAAL_ID", "CAAL_ID"), value: mIdentity(record, "caal_id") },
    { label: mLabel("Internal Reference", "Internal Reference"), value: mRaw(record, "Internal Reference") },
    { label: mLabel("External Reference", "External Reference"), value: mRaw(record, "External Reference") },
    { label: mLabel("Designation", "Designation"), value: mSummary(record, "designation") },
    { label: mLabel("World Heritage Site Name", "World Heritage Site Name"), value: mRaw(record, "World Heritage Site Name") }
  ]);

  const monumentTypes = getSummaryValues(record, [
    "Monument Type1", "Monument Type2", "Monument Type3",
    "Monument Type4", "Monument Type5", "Monument Type6"
  ], "monument_type");

  const culturalPeriods = getSummaryValues(record, [
    "Cultural Period1", "Cultural Period2", "Cultural Period3",
    "Cultural Period4", "Cultural Period5", "Cultural Period6"
  ], "cultural_period");

  titleEl.textContent = mSafeValue(mSummary(record, "primary_name"));

  bodyEl.innerHTML = `
    <div class="record-title">
      <h3>${mSafeValue(mSummary(record, "primary_name"))}</h3>
      <p>${mSafeValue(mIdentity(record, "caal_id"))}</p>
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Basic", "Basic")}</span>
          </div>
          ${renderPreviewRows(basicFields)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Monument type summary", "Monument type summary")}</span>
          </div>
          <div class="detail-item full-width">
            <div class="detail-value">${monumentTypes.length ? monumentTypes.join(", ") : mLabel("Not recorded", "Not recorded")}</div>
          </div>
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Cultural period summary", "Cultural period summary")}</span>
          </div>
          <div class="detail-item full-width">
            <div class="detail-value">${culturalPeriods.length ? culturalPeriods.join(", ") : mLabel("Not recorded", "Not recorded")}</div>
          </div>
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Location", "Location")}</span>
          </div>
          <div class="detail-item full-width">
            <div id="monumentPreviewMiniMap" style="height: 220px; border-radius: 10px; overflow: hidden;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.hidden = false;
  initMonumentPreviewMiniMap(record);
}

// related record modal 
function renderRelatedRecordModal(record, recordType, caalId) {
    if (!monumentPreviewModal || !monumentPreviewTitle || !monumentPreviewBody) return;

  const fullRecordUrl = getRelatedRecordUrl(
    caalId,
    recordType,
    record?.source?.scope
  );

  if (recordType === "monument") {
    renderRelatedMonumentModal(record, caalId, fullRecordUrl);
    return;
  }

  if (recordType === "archive") {
    renderRelatedArchiveModal(record, caalId, fullRecordUrl);
    return;
  }

  const title =
    recordType === "archive"
      ? mRaw(record, "English Title") || mRaw(record, "Original Title") || caalId
      : mSummary(record, "primary_name") || mRaw(record, "Primary Name") || caalId;

  monumentPreviewTitle.textContent = title;

  monumentPreviewBody.innerHTML = `
    <div class="record-title">
      <h3>${mSafeValue(title)}</h3>
      <p>${mSafeValue(caalId)}</p>
      <span class="related-record-type-badge">
        ${recordType === "archive" ? mLabel("Archive", "Archive") : mLabel("Monument", "Monument")}
      </span>

      ${
        fullRecordUrl
          ? `<button type="button" class="action-btn" id="openRelatedFullRecordBtn">
              ${mLabel("Open full record", "Open full record")}
            </button>`
          : ""
      }
    </div>
  `;

  monumentPreviewModal.hidden = false;

  const openBtn = document.getElementById("openRelatedFullRecordBtn");

  if (openBtn && fullRecordUrl) {
    openBtn.addEventListener("click", () => {
      window.open(fullRecordUrl, "_blank");
    });
  }
}
function renderRelatedMonumentModal(record, caalId, fullRecordUrl) {
  const title = mSummary(record, "primary_name") || mRaw(record, "Primary Name") || caalId;

  monumentPreviewTitle.textContent = title;

  const basicFields = getPopulatedPreviewFields(record, [
    { label: mLabel("Primary Name", "Primary Name"), value: mSummary(record, "primary_name") },
    { label: mLabel("Primary Name (English)", "Primary Name (English)"), value: mSummary(record, "primary_name_english") },
    { label: mLabel("Country", "Country"), value: mSummary(record, "country") },
    { label: mLabel("Classification", "Classification"), value: mSummary(record, "classification") },
    { label: mLabel("CAAL_ID", "CAAL_ID"), value: caalId },
    { label: mLabel("Designation", "Designation"), value: mSummary(record, "designation") }
  ]);

  const monumentTypes = getSummaryValues(record, [
    "Monument Type1", "Monument Type2", "Monument Type3",
    "Monument Type4", "Monument Type5", "Monument Type6"
  ], "monument_type");

  const culturalPeriods = getSummaryValues(record, [
    "Cultural Period1", "Cultural Period2", "Cultural Period3",
    "Cultural Period4", "Cultural Period5", "Cultural Period6"
  ], "cultural_period");

  monumentPreviewBody.innerHTML = `
    <div class="record-title related-record-title">
      <div>
        <h3>${mSafeValue(title)}</h3>
        <p>${mSafeValue(caalId)}</p>
      </div>

      <span class="related-record-type-badge">
        ${mLabel("Monument", "Monument")}
      </span>

      ${
        fullRecordUrl
          ? `<button type="button" class="action-btn" id="openRelatedFullRecordBtn">
              ${mLabel("Open full record", "Open full record")}
            </button>`
          : ""
      }
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Basic", "Basic")}</span>
          </div>
          ${renderPreviewRows(basicFields)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Monument type summary", "Monument type summary")}</span>
          </div>
          <div class="detail-item full-width">
            <div class="detail-value">${monumentTypes.length ? monumentTypes.join(", ") : mSafeValue("")}</div>
          </div>
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Cultural period summary", "Cultural period summary")}</span>
          </div>
          <div class="detail-item full-width">
            <div class="detail-value">${culturalPeriods.length ? culturalPeriods.join(", ") : mSafeValue("")}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  monumentPreviewModal.hidden = false;
  wireOpenRelatedFullRecordButton(fullRecordUrl);
}

function renderRelatedArchiveModal(record, caalId, fullRecordUrl) {
  const s = record.summary || {};

  const title =
    s.english_title ||
    s.original_title ||
    mRaw(record, "English Title") ||
    mRaw(record, "Original Title") ||
    caalId;

  monumentPreviewTitle.textContent = title;

  monumentPreviewBody.innerHTML = `
    <div class="record-title related-record-title">
      <div>
        <h3>${mSafeValue(title)}</h3>
        <p>${mSafeValue(caalId)}</p>
      </div>

      <span class="related-record-type-badge">
        ${mLabel("Archive", "Archive")}
      </span>

      ${
        fullRecordUrl
          ? `<button type="button" class="action-btn" id="openRelatedFullRecordBtn">
              ${mLabel("Open full record", "Open full record")}
            </button>`
          : ""
      }
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Material Details", "Material Details")}</span>
          </div>

          ${mRenderDetailItem(mLabel("CAAL_ID", "CAAL_ID"), record.identity?.caal_id)}
          ${mRenderDetailItem(mLabel("Associated CAAL_ID", "Associated CAAL_ID"), record.identity?.associated_caal_id)}
          ${mRenderDetailItem(mLabel("Original Reference", "Original Reference"), s.original_reference)}
          ${mRenderDetailItem(mLabel("Content Type", "Content Type"), s.content_type)}
          ${mRenderDetailItem(mLabel("Country", "Country"), s.country)}
          ${mRenderDetailItem(mLabel("Level", "Level"), s.level)}
          ${mRenderDetailItem(mLabel("Original Title", "Original Title"), s.original_title, true)}
          ${mRenderDetailItem(mLabel("English Title", "English Title"), s.english_title, true)}
          ${mRenderDetailItem(mLabel("Description", "Description"), mRaw(record, "Description"), true)}
          ${mRenderDetailItem(
            mLabel("Languages of Material", "Languages of Material"),
            parseRelatedIds(mRaw(record, "Languages of Material")).join(", "),
            true
          )}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Publication Details", "Publication Details")}</span>
          </div>

          ${mRenderDetailItem(mLabel("Dates of Original Material", "Dates of Original Material"), mRaw(record, "Dates of Original Material"))}
          ${mRenderDetailItem(mLabel("Author of the Original Material", "Author of the Original Material"), mRaw(record, "Author of the Original Material"), true)}
          ${mRenderDetailItem(mLabel("Publisher of the Original Material", "Publisher of the Original Material"), mRaw(record, "Publisher of the Original Material"), true)}
          ${mRenderDetailItem(mLabel("Editor of the Original Material", "Editor of the Original Material"), mRaw(record, "Editor of the Original Material"), true)}
          ${mRenderDetailItem(mLabel("Volume and Issue Number", "Volume and Issue Number"), mRaw(record, "Volume and Issue Number"))}
        </div>
      </div>
    </div>
  `;

  monumentPreviewModal.hidden = false;
  wireOpenRelatedFullRecordButton(fullRecordUrl);
}

function wireOpenRelatedFullRecordButton(fullRecordUrl) {
  const openBtn = document.getElementById("openRelatedFullRecordBtn");

  if (openBtn && fullRecordUrl) {
    openBtn.addEventListener("click", () => {
      window.open(fullRecordUrl, "_blank");
    });
  }
}

// mini map
let monumentPreviewMap = null;

function initMonumentPreviewMiniMap(record) {
  const mapEl = document.getElementById("monumentPreviewMiniMap");
  if (!mapEl || !record?.geometry?.coordinates || typeof maplibregl === "undefined") return;

  const [lng, lat] = record.geometry.coordinates;

  if (monumentPreviewMap) {
    monumentPreviewMap.remove();
    monumentPreviewMap = null;
  }

  monumentPreviewMap = new maplibregl.Map({
    container: "monumentPreviewMiniMap",
    style: getBasemapStyle("osm"),
    center: [lng, lat],
    zoom: 12,
    interactive: false
  });

  monumentPreviewMap.on("load", () => {
    if (monumentPreviewMap.getLayer("preview-point")) {
      monumentPreviewMap.removeLayer("preview-point");
    }
    if (monumentPreviewMap.getSource("preview-point")) {
      monumentPreviewMap.removeSource("preview-point");
    }

    monumentPreviewMap.addSource("preview-point", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lng, lat]
          },
          properties: {}
        }]
      }
    });

    monumentPreviewMap.addLayer({
      id: "preview-point",
      type: "circle",
      source: "preview-point",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3, 2,
          8, 4.5,
          12, 6
        ],
        "circle-color": "#c95a4a",
        "circle-opacity": 0.7,
        "circle-stroke-width": 0.7,
        "circle-stroke-color": "rgba(255,255,255,0.9)"
      }
    });
  });
}

//modal close
function closeMonumentPreviewModal() {
  const modal = document.getElementById("monumentPreviewModal");
  if (modal) modal.hidden = true;

  if (monumentPreviewMap) {
    monumentPreviewMap.remove();
    monumentPreviewMap = null;
  }
}



// --------------------------------------------------------
// Labels + lookups API
// --------------------------------------------------------
async function loadMonumentLabels() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const response = await fetch(
    `/api/ui/labels?page=monuments&lang=${encodeURIComponent(lang)}`,
    { method: "GET", credentials: "include" }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load monuments labels");
  }

  monumentLabels = data.labels || {};
}

async function loadMonumentLookups() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const response = await fetch(
    `/api/lookups/monuments?lang=${encodeURIComponent(lang)}`,
    { method: "GET", credentials: "include" }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load monuments lookups");
  }

  monumentLookups = data.lookups || {};
  buildCulturalPeriodLookup();
}

function populateMonumentFilterLookups() {
  mPopulateMultiSelect(filterMonumentType, mLookupOptions("monument_type"));
  mPopulateMultiSelect(filterClassification, mLookupOptions("classification"));
  mPopulateMultiSelect(filterDesignation, mLookupOptions("designation"));
  mPopulateMultiSelect(filterReligion, mLookupOptions("religion"));
  mPopulateMultiSelect(filterCulturalPeriod, mLookupOptions("cultural_period"));
  mPopulateMultiSelect(filterCountry, mLookupOptions("country"));

  wireClickToggleMultiSelects();
  renderAllFilterChips();
}

const monumentChipFilterConfigs = [
  {
    select: filterMonumentType,
    chipsId: "filterMonumentTypeChips"
  },
  {
    select: filterClassification,
    chipsId: "filterClassificationChips"
  },
  {
    select: filterDesignation,
    chipsId: "filterDesignationChips"
  },
  {
    select: filterReligion,
    chipsId: "filterReligionChips"
  },
  {
    select: filterCulturalPeriod,
    chipsId: "filterCulturalPeriodChips"
  },
  {
    select: filterCountry,
    chipsId: "filterCountryChips"
  }
];

function getSelectedOptionData(selectEl) {
  if (!selectEl) return [];

  return Array.from(selectEl.options)
    .filter((option) => option.selected)
    .map((option) => ({
      value: option.value,
      label: option.textContent || option.value
    }));
}

function renderFilterChipsForSelect(selectEl, chipsId) {
  const chipsEl = document.getElementById(chipsId);
  if (!selectEl || !chipsEl) return;

  const selected = getSelectedOptionData(selectEl);

  chipsEl.innerHTML = "";

  if (!selected.length) {
    const empty = document.createElement("span");
    empty.className = "filter-chip-empty";
    empty.textContent = "No values selected";
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

      if (option) {
        option.selected = false;
      }

      renderAllFilterChips();
      await applyMonumentFilters({ includeMap: true, listFirst: true });
    });

    chipsEl.appendChild(chip);
  });
}

function renderAllFilterChips() {
  monumentChipFilterConfigs.forEach(({ select, chipsId }) => {
    renderFilterChipsForSelect(select, chipsId);
  });
}

function wireClickToggleMultiSelects() {
  monumentChipFilterConfigs.forEach(({ select, chipsId }) => {
    if (!select || select.dataset.clickToggleWired === "true") return;

    select.addEventListener("mousedown", (event) => {
      const option = event.target;

      if (!option || option.tagName !== "OPTION") return;

      event.preventDefault();

      option.selected = !option.selected;

      renderFilterChipsForSelect(select, chipsId);

      select.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    });

    select.addEventListener("change", () => {
      renderFilterChipsForSelect(select, chipsId);
    });

    select.dataset.clickToggleWired = "true";
  });

  renderAllFilterChips();
}

function getMapBboxParam() {
  if (!map) return null;

  const bounds = map.getBounds();
  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth()
  ].join(",");
}

// --------------------------------------------------------
// Records API
// --------------------------------------------------------
async function loadMonumentMapRecords() {
  const requestSeq = ++monumentMapRequestSeq;
  const scopes = getMonumentEnabledScopes();

  if (!scopes.length) {
    monumentMapRecords = [];
    drawMonumentRecords([]);
    setMapStaleState(false);
    return;
  }

  const params = buildMonumentQueryParams({ includePaging: false });

  const bbox = getMapBboxParam();
  if (bbox) {
    params.set("bbox", bbox);
  }

  setMapStaleState(true, mLabel("Redrawing map...", "Redrawing map..."));

  try {
    const response = await fetch(`/api/monuments/map?${params.toString()}`, {
      method: "GET",
      credentials: "include"
    });

    const data = await response.json();

    if (requestSeq !== monumentMapRequestSeq) {
      return;
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.detail || data.error || "Failed to load monument map records");
    }

    monumentMapRecords = data.records || [];
    drawMonumentRecords(monumentMapRecords);
  } finally {
    if (requestSeq === monumentMapRequestSeq) {
      setMapStaleState(false);
    }
  }
}

async function loadMonumentListRecords() {
  const requestSeq = ++monumentListRequestSeq;
  const scopes = getMonumentEnabledScopes();

  if (!scopes.length) {
    monumentListRecords = [];
    monumentTotalCount = 0;
    monumentTotalIsExact = true;
    renderMonumentResultsList([]);
    renderMonumentEmptyState();
    return;
  }

  setResultsCountLoading();

  const params = buildMonumentQueryParams({ includePaging: true });

  const response = await fetch(`/api/monuments?${params.toString()}`, {
    method: "GET",
    credentials: "include"
  });

  const data = await response.json();

  if (requestSeq !== monumentListRequestSeq) {
    return;
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Failed to load monument list records");
  }

  monumentListRecords = data.records || [];
  monumentTotalCount = data.total || 0;
  monumentTotalIsExact = data.total_is_exact !== false;

  renderMonumentResultsList(monumentListRecords);
  renderMonumentPageInfo();
}

async function loadFullMonumentRecordForMapClick(mapRecord) {
  const caalId = mapRecord?.identity?.caal_id;

  if (!caalId) {
    return mapRecord;
  }

  const response = await fetch(
    `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Could not load full monument record");
  }

  if (data.record_type !== "monument" || !data.record) {
    throw new Error("Resolved record is not a monument");
  }

  return data.record;
}

function renderMonumentPageInfo() {
  const pageInfo = document.getElementById("monumentPageInfo");
  if (!pageInfo) return;

  const totalPages = Math.max(1, Math.ceil(monumentTotalCount / monumentPageLimit));
  const pageNumber = Math.floor(monumentPageOffset / monumentPageLimit) + 1;

  if (monumentTotalIsExact) {
    pageInfo.textContent = `Page ${pageNumber} of ${totalPages}`;
  } else {
    pageInfo.textContent = `Page ${pageNumber}`;
  }
}

async function loadFullMonumentRecordForMapClick(mapRecord) {
  const caalId = mapRecord?.identity?.caal_id;

  if (!caalId) {
    return mapRecord;
  }

  const response = await fetch(
    `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Could not load full monument record");
  }

  if (data.record_type !== "monument" || !data.record) {
    throw new Error("Resolved record is not a monument");
  }

  return data.record;
}

// --------------------------------------------------------
// Filters
// --------------------------------------------------------
function monumentMatchesFilters(record, filters) {
  const fv = record.filter_values || {};

  const matchesText =
    !filters.text ||
    mRecordSearchText(record).includes(filters.text.toLowerCase());

  const matchesMonumentType =
    filters.monumentTypes.length === 0 ||
    (fv.monument_types || []).some((value) => filters.monumentTypes.includes(value));

  const matchesClassification =
    filters.classifications.length === 0 ||
    filters.classifications.includes(fv.classification);

  const matchesDesignation =
    filters.designations.length === 0 ||
    filters.designations.includes(fv.designation);

  const matchesReligion =
    filters.religions.length === 0 ||
    (fv.religions || []).some((value) => filters.religions.includes(value));

  const matchesCulturalPeriod =
    filters.culturalPeriods.length === 0 ||
    (fv.cultural_periods || []).some((value) => filters.culturalPeriods.includes(value));

  const matchesCountry =
    filters.countries.length === 0 ||
    filters.countries.includes(fv.country);

  return (
    matchesText &&
    matchesMonumentType &&
    matchesClassification &&
    matchesDesignation &&
    matchesReligion &&
    matchesCulturalPeriod &&
    matchesCountry
  );
}

async function applyMonumentFilters({ includeMap = true, listFirst = true } = {}) {
  monumentPageOffset = 0;
  monumentSelectedRecord = null;
  monumentPendingNewRecord = null;
  monumentIsEditMode = false;
  monumentSyncModeVisualState();

  if (map) {
    if (map.getLayer("monument-selected-ring")) {
      map.removeLayer("monument-selected-ring");
    }
    if (map.getSource("monument-selected")) {
      map.removeSource("monument-selected");
    }
  }

  setMonumentsLoading(true, mLabel("Updating results...", "Updating results..."));

  try {
    if (listFirst) {
      await loadMonumentListRecords();

      if (includeMap) {
        setMonumentsLoading(true, mLabel("Redrawing map...", "Redrawing map..."));
        await loadMonumentMapRecords();
      }
    } else {
      if (includeMap) {
        await loadMonumentMapRecords();
      }

      await loadMonumentListRecords();
    }

    renderMonumentEmptyState();
  } catch (error) {
    console.error("Failed to reload monuments after filter change:", error);
  } finally {
    setMonumentsLoading(false);
  }
}

async function clearMonumentFilters() {
  if (siteSearch) siteSearch.value = "";
  if (filterCaalId) filterCaalId.value = "";

  [
    filterMonumentType,
    filterClassification,
    filterDesignation,
    filterReligion,
    filterCulturalPeriod,
    filterCountry
  ].forEach((selectEl) => {
    if (!selectEl) return;
    Array.from(selectEl.options).forEach((option) => {
      option.selected = false;
    });
  });

  await applyMonumentFilters({ includeMap: true, listFirst: true });
}

// --------------------------------------------------------
// Map
// --------------------------------------------------------
function getBasemapStyle(name) {
  if (name === "osm") {
    return {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        }
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
          minzoom: 0,
          maxzoom: 19
        }
      ]
    };
  }

  if (name === "satellite") {
    return "https://api.maptiler.com/maps/satellite/style.json?key=wZNaIRIPfJrrJLopqgo0";
  }

  return "https://demotiles.maplibre.org/style.json";
}

function monumentRecordToFeature(record) {
  if (!record?.geometry?.coordinates) return null;

  return {
    type: "Feature",
    geometry: record.geometry,
    properties: {
      id: record.identity?.id,
      caal_id: record.identity?.caal_id,
      primary_name: record.summary?.primary_name,
      source_scope: record.source?.scope || "unknown"
    }
  };
}

function bindMonumentLayerEvents() {
  if (!map || monumentsLayerEventsBound) return;

  map.on("click", "monument-ref-clusters", (e) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: ["monument-ref-clusters"]
    });

    const clusterId = features[0]?.properties?.cluster_id;
    if (clusterId == null) return;

    map.getSource("monuments-ref").getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;

      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom
      });
    });
  });

  function handleMonumentPointClick(e) {
    const feature = e.features?.[0];
    if (!feature) return;

    const clickedId = Number(feature.properties?.id);
    const record = monumentMapRecords.find(
      (r) => Number(r.identity?.id) === clickedId
    );

    if (!record?.geometry?.coordinates) return;

    new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(record.geometry.coordinates)
      .setHTML(`
        <div class="map-popup">
          <button
            type="button"
            class="map-popup-title-btn"
            data-monument-id="${record.identity?.id}"
          >
            ${mSafeValue(mSummary(record, "primary_name"))}
          </button><br>
          <span>${mSafeValue(mIdentity(record, "caal_id"))}</span><br>
          <span>${mSafeValue(mSummary(record, "classification"))}</span><br>
          <span>${mSafeValue(mSummary(record, "monument_type1"))}</span>
        </div>
      `)
      .addTo(map);

    setTimeout(() => {
      const popupTitleBtn = document.querySelector(
        `.map-popup-title-btn[data-monument-id="${record.identity?.id}"]`
      );

      if (!popupTitleBtn) return;

      popupTitleBtn.addEventListener("click", async () => {
        if (!monumentConfirmLoseChanges()) return;

        setMonumentsLoading(true, mLabel("Loading full record...", "Loading full record..."));

        try {
          const fullRecord = await loadFullMonumentRecordForMapClick(record);

          monumentIsEditMode = false;
          monumentSyncModeVisualState();
          monumentPendingNewRecord = null;
          monumentSelectedRecord = fullRecord;

          renderMonumentRecordDetails(fullRecord);
          updateSelectedResultCard();

          if (fullRecord.geometry?.coordinates) {
            drawSelectedMonumentHighlight(fullRecord);
          } else if (record.geometry?.coordinates) {
            drawSelectedMonumentHighlight(record);
          }
        } catch (error) {
          console.error("Failed to load full monument record from map click:", error);
          alert(error.message || "Could not load full monument record");
        } finally {
          setMonumentsLoading(false);
        }
      });
    }, 0);
  }

  map.on("click", "monuments-ref-layer", handleMonumentPointClick);
  map.on("click", "monuments-workspace-layer", handleMonumentPointClick);

  ["monuments-ref-layer", "monuments-workspace-layer"].forEach((layerId) => {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  });

  monumentsLayerEventsBound = true;
}

function drawMonumentRecords(records) {
  if (!map || !mapLoaded) return;

  const workspaceRecords = records.filter(
    (r) => r.source?.scope === "workspace"
  );

  const referenceRecords = records.filter(
    (r) => r.source?.scope !== "workspace"
  );

  const workspaceGeojson = {
    type: "FeatureCollection",
    features: workspaceRecords
      .map(monumentRecordToFeature)
      .filter(Boolean)
  };

  const referenceGeojson = {
    type: "FeatureCollection",
    features: referenceRecords
      .map(monumentRecordToFeature)
      .filter(Boolean)
  };

  const existingRefSource = map.getSource("monuments-ref");
  const existingWorkspaceSource = map.getSource("monuments-workspace");

  if (
    existingRefSource &&
    typeof existingRefSource.setData === "function" &&
    existingWorkspaceSource &&
    typeof existingWorkspaceSource.setData === "function"
  ) {
    existingRefSource.setData(referenceGeojson);
    existingWorkspaceSource.setData(workspaceGeojson);
    return;
  }

  [
    "monument-ref-clusters",
    "monument-ref-cluster-count",
    "monuments-ref-layer",
    "monuments-workspace-layer"
  ].forEach((layer) => {
    if (map.getLayer(layer)) map.removeLayer(layer);
  });

  ["monuments-ref", "monuments-workspace"].forEach((source) => {
    if (map.getSource(source)) map.removeSource(source);
  });

  map.addSource("monuments-ref", {
    type: "geojson",
    data: referenceGeojson,
    cluster: true,
    clusterMaxZoom: 9,
    clusterRadius: 40
  });

  map.addSource("monuments-workspace", {
    type: "geojson",
    data: workspaceGeojson,
    cluster: false
  });

  map.addLayer({
    id: "monument-ref-clusters",
    type: "circle",
    source: "monuments-ref",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": [
        "step",
        ["get", "point_count"],
        14, 20, 18, 100, 22, 500, 26
      ],
      "circle-color": "#c95a4a",
      "circle-opacity": 0.75,
      "circle-stroke-width": 1,
      "circle-stroke-color": "rgba(255,255,255,0.9)"
    }
  });

  map.addLayer({
    id: "monument-ref-cluster-count",
    type: "symbol",
    source: "monuments-ref",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "monuments-ref-layer",
    type: "circle",
    source: "monuments-ref",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 4.5,
        8, 6,
        12, 8
      ],
      "circle-color": "#c95a4a",
      "circle-opacity": 0.85,
      "circle-stroke-width": 1.2,
      "circle-stroke-color": "rgba(255,255,255,0.9)"
    }
  });

  map.addLayer({
    id: "monuments-workspace-layer",
    type: "circle",
    source: "monuments-workspace",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 5,
        8, 7,
        12, 9
      ],
      "circle-color": "#2e7d32",
      "circle-opacity": 0.95,
      "circle-stroke-width": 1.6,
      "circle-stroke-color": "rgba(255,255,255,0.95)"
    }
  });

  bindMonumentLayerEvents();
}


// --------------------------------------------------------
// Results list
// --------------------------------------------------------
function renderMonumentResultsList(records) {
  if (!resultsList) return;

  if (resultsCount) {
    const start = records.length === 0 ? 0 : monumentPageOffset + 1;
    const end = monumentPageOffset + records.length;

    if (monumentTotalIsExact) {
      resultsCount.textContent = `${start}-${end} (${monumentTotalCount} total)`;
    } else {
      resultsCount.textContent = `${start}-${end} matching records`;
    }
  }

  if (records.length === 0) {
    resultsList.innerHTML = `
      <div class="results-empty">
        <p>${mLabel("No matching records.", "No matching records.")}</p>
      </div>
    `;
    return;
  }

  resultsList.innerHTML = records
  .map((record, index) => {
    return `
      <div
        class="result-card ${Number(monumentSelectedRecord?.identity?.id) === Number(record.identity?.id) ? "is-selected" : ""}"
        data-result-index="${index}"
      >
        <div class="result-card-topline">
          <strong>${mSafeValue(mSummary(record, "primary_name"))}</strong>
          <span class="scope-badge">${mSafeValue(monumentScopeLabel(record.source?.scope))}</span>
        </div>

        <div class="result-card-meta">${mSafeValue(mIdentity(record, "caal_id"))}</div>
        <div class="result-card-meta">${mSafeValue(mSummary(record, "classification"))}</div>
        <div class="result-card-meta">${mSafeValue(mSummary(record, "monument_type1"))}</div>

        <div class="result-card-actions">
          <button
            type="button"
            class="action-btn result-preview-btn"
            data-preview-index="${index}"
          >
            ${mLabel("Preview", "Preview")}
          </button>
        </div>
      </div>
    `;
  })
  .join("");

  Array.from(resultsList.querySelectorAll(".result-card")).forEach((card) => {
    card.addEventListener("click", () => {
      if (!monumentConfirmLoseChanges()) return;

      const idx = Number(card.dataset.resultIndex);
      const record = records[idx];
      if (!record) return;

      monumentIsEditMode = false;
      monumentSyncModeVisualState();
      monumentPendingNewRecord = null;
      renderMonumentRecordDetails(record);
      updateSelectedResultCard();

      if (map && record.geometry?.coordinates) {
        drawSelectedMonumentHighlight(record);
      }
    });

    card.addEventListener("mouseenter", () => {
      const idx = Number(card.dataset.resultIndex);
      const record = records[idx];
      if (!record?.geometry?.coordinates) return;

      drawSelectedMonumentHighlight(record);
    });
  });
  Array.from(resultsList.querySelectorAll(".result-preview-btn")).forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();

      const idx = Number(btn.dataset.previewIndex);
      const record = records[idx];
      if (!record) return;

      renderMonumentPreviewModal(record);
    });
  });
}

// --------------------------------------------------------
// Empty state
// --------------------------------------------------------
function renderMonumentEmptyState() {
  if (!recordDetails) return;

  recordDetails.innerHTML = `
    <div class="empty-state">
      <p>${mLabel("No record selected yet.", "No record selected yet.")}</p>
    </div>
  `;

  updateMonumentActionBar();
  clearPendingPickPoint();
  updateAddModeUI();
}

// --------------------------------------------------------
// Display mode
// --------------------------------------------------------
function renderMonumentRecordDetails(record) {
  monumentSelectedRecord = record;

  if (monumentIsEditMode) {
    renderMonumentEditMode(record);
  } else {
    renderMonumentDisplayMode(record);
  }

  updateMonumentActionBar();
  updateAddModeUI();
}

function renderMonumentDisplayMode(record) {
  const appSession = window.appSession || null;
  const accessLevel =
    Number(
      window.appSession?.user?.access_level ??
      window.appSession?.profile?.access_level ??
      0
    );

  const currentAppUserId = window.appSession?.user?.user_id ?? null;
  const recordAppUserId = record?.raw?.created_by_app_user_id ?? null;

  const isOwner =
    currentAppUserId !== null &&
    recordAppUserId !== null &&
    Number(currentAppUserId) === Number(recordAppUserId);

  const isSuperUser =
    window.appSession?.permissions?.can_edit_caal === true;

  const isWorkspaceRecord = record.source?.scope === "workspace";
  const isCaalRecord =
    record.source?.scope === "national_ref" ||
    record.source?.scope === "all_caal";

  const canEditThisRecord =
  (isWorkspaceRecord && (isOwner || isSuperUser)) ||
  (isCaalRecord && isSuperUser);

  const statusBadge = canEditThisRecord
    ? `<span class="record-status-badge record-status-editable">${mLabel("Editable", "Editable")}</span>`
    : `<span class="record-status-badge record-status-readonly">${mLabel("Read only", "Read only")}</span>`;
    
  const basicHtml = [
    mRenderDetailItem(mLabel("Primary Name", "Primary Name"), mSummary(record, "primary_name"), true),
    mRenderDetailItem(mLabel("Primary Name (English)", "Primary Name (English)"), mSummary(record, "primary_name_english"), true),
    mRenderDetailItem(mLabel("Other Names", "Other Names"), mRaw(record, "Other Names"), true),
    mRenderDetailItem(mLabel("Country", "Country"), mSummary(record, "country")),
    mRenderDetailItem(mLabel("Region", "Region"), mSummary(record, "region")),
    mRenderDetailItem(mLabel("Classification", "Classification"), mSummary(record, "classification")),
    mRenderDetailItem(mLabel("CAAL_ID", "CAAL_ID"), mIdentity(record, "caal_id")),
    mRenderDetailItem(mLabel("Internal Reference", "Internal Reference"), mRaw(record, "Internal Reference")),
    mRenderDetailItem(mLabel("External Reference", "External Reference"), mRaw(record, "External Reference")),
    mRenderDetailItem(mLabel("Designation", "Designation"), mSummary(record, "designation")),
    mRenderDetailItem(mLabel("World Heritage Site Name", "World Heritage Site Name"), mRaw(record, "World Heritage Site Name"))
  ].join("");

  const monumentHtml = [
    mRenderDetailItem(mLabel("Monument Passport", "Monument Passport"), mRaw(record, "Monument Passport"), true),
    mRenderDetailItem(mLabel("Monument Type1", "Monument Type1"), mLookupLabel("monument_type", mRaw(record, "Monument Type1"))),
    mRenderDetailItem(mLabel("Monument Type2", "Monument Type2"), mLookupLabel("monument_type", mRaw(record, "Monument Type2"))),
    mRenderDetailItem(mLabel("Monument Type3", "Monument Type3"), mLookupLabel("monument_type", mRaw(record, "Monument Type3"))),
    mRenderDetailItem(mLabel("Monument Type4", "Monument Type4"), mLookupLabel("monument_type", mRaw(record, "Monument Type4"))),
    mRenderDetailItem(mLabel("Monument Type5", "Monument Type5"), mLookupLabel("monument_type", mRaw(record, "Monument Type5"))),
    mRenderDetailItem(mLabel("Monument Type6", "Monument Type6"), mLookupLabel("monument_type", mRaw(record, "Monument Type6"))),
    mRenderDetailItem(mLabel("Religion1", "Religion1"), mLookupLabel("religion", mRaw(record, "Religion1"))),
    mRenderDetailItem(mLabel("Religion2", "Religion2"), mLookupLabel("religion", mRaw(record, "Religion2"))),
    mRenderDetailItem(mLabel("Religion3", "Religion3"), mLookupLabel("religion", mRaw(record, "Religion3"))),
    mRenderDetailItem(mLabel("Descriptive Date", "Descriptive Date"), mRaw(record, "Descriptive Date"), true),
    mRenderDetailItem(mLabel("Cultural Period1", "Cultural Period1"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period1"))),
    mRenderDetailItem(mLabel("Cultural Period2", "Cultural Period2"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period2"))),
    mRenderDetailItem(mLabel("Cultural Period3", "Cultural Period3"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period3"))),
    mRenderDetailItem(mLabel("Cultural Period4", "Cultural Period4"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period4"))),
    mRenderDetailItem(mLabel("Cultural Period5", "Cultural Period5"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period5"))),
    mRenderDetailItem(mLabel("Cultural Period6", "Cultural Period6"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period6"))),
    mRenderDetailItem(mLabel("Start Date", "Start Date"), mRaw(record, "Start Date")),
    mRenderDetailItem(mLabel("End Date", "End Date"), mRaw(record, "End Date")),
    mRenderDetailItem(mLabel("Primary Description", "Primary Description"), mRaw(record, "Primary Description"), true),
    mRenderDetailItem(mLabel("Primary Description (English)", "Primary Description (English)"), mRaw(record, "Primary Description (English)"), true),
    mRenderDetailItem(mLabel("Additional Notes", "Additional Notes"), mRaw(record, "Additional Notes"), true)
  ].join("");

  const adminHtml = [
    mRenderDetailItem(mLabel("Primary Address", "Primary Address"), mRaw(record, "Primary Address"), true),
    mRenderDetailItem(mLabel("Longitude", "Longitude"), mSummary(record, "longitude")),
    mRenderDetailItem(mLabel("Latitude", "Latitude"), mSummary(record, "latitude")),
    mRenderDetailItem(mLabel("Altitude", "Altitude"), mRaw(record, "Altitude")),
    mRenderDetailItem(mLabel("Location Confidence", "Location Confidence"), mLookupLabel("location_confidence", mRaw(record, "Location Confidence"))),
    mRenderDetailItem(mLabel("Location Notes", "Location Notes"), mRaw(record, "Location Notes"), true),
    mRenderDetailItem(mLabel("Administrative Subdivision Name1", "Administrative Subdivision Name1"), mRaw(record, "Administrative Subdivision Name1")),
    mRenderDetailItem(mLabel("Administrative Subdivision Type1", "Administrative Subdivision Type1"), mLookupLabel("admin_subdivision_type", mRaw(record, "Administrative Subdivision Type1"))),
    mRenderDetailItem(mLabel("Administrative Subdivision Name2", "Administrative Subdivision Name2"), mRaw(record, "Administrative Subdivision Name2")),
    mRenderDetailItem(mLabel("Administrative Subdivision Type2", "Administrative Subdivision Type2"), mLookupLabel("admin_subdivision_type", mRaw(record, "Administrative Subdivision Type2"))),
    mRenderDetailItem(mLabel("Administrative Subdivision Name3", "Administrative Subdivision Name3"), mRaw(record, "Administrative Subdivision Name3")),
    mRenderDetailItem(mLabel("Administrative Subdivision Type3", "Administrative Subdivision Type3"), mLookupLabel("admin_subdivision_type", mRaw(record, "Administrative Subdivision Type3"))),
    mRenderDetailItem(mLabel("Administrative Subdivision Name4", "Administrative Subdivision Name4"), mRaw(record, "Administrative Subdivision Name4")),
    mRenderDetailItem(mLabel("Administrative Subdivision Type4", "Administrative Subdivision Type4"), mLookupLabel("admin_subdivision_type", mRaw(record, "Administrative Subdivision Type4")))
  ].join("");

  const measurementsHtml = [
    mRenderDetailItem(mLabel("Measurement Value1", "Measurement Value1"), mRaw(record, "Measurement Value1")),
    mRenderDetailItem(mLabel("Measurement Unit1", "Measurement Unit1"), mLookupLabel("measurement_unit", mRaw(record, "Measurement Unit1"))),
    mRenderDetailItem(mLabel("Measurement Type1", "Measurement Type1"), mLookupLabel("measurement_type", mRaw(record, "Measurement Type1"))),
    mRenderDetailItem(mLabel("Measurement Value2", "Measurement Value2"), mRaw(record, "Measurement Value2")),
    mRenderDetailItem(mLabel("Measurement Unit2", "Measurement Unit2"), mLookupLabel("measurement_unit", mRaw(record, "Measurement Unit2"))),
    mRenderDetailItem(mLabel("Measurement Type2", "Measurement Type2"), mLookupLabel("measurement_type", mRaw(record, "Measurement Type2"))),
    mRenderDetailItem(mLabel("Measurement Value3", "Measurement Value3"), mRaw(record, "Measurement Value3")),
    mRenderDetailItem(mLabel("Measurement Unit3", "Measurement Unit3"), mLookupLabel("measurement_unit", mRaw(record, "Measurement Unit3"))),
    mRenderDetailItem(mLabel("Measurement Type3", "Measurement Type3"), mLookupLabel("measurement_type", mRaw(record, "Measurement Type3"))),
    mRenderDetailItem(mLabel("Measurement Value4", "Measurement Value4"), mRaw(record, "Measurement Value4")),
    mRenderDetailItem(mLabel("Measurement Unit4", "Measurement Unit4"), mLookupLabel("measurement_unit", mRaw(record, "Measurement Unit4"))),
    mRenderDetailItem(mLabel("Measurement Type4", "Measurement Type4"), mLookupLabel("measurement_type", mRaw(record, "Measurement Type4")))
  ].join("");

  const metadataHtml = [
    mRenderDetailItem(mLabel("Preferred Language", "Preferred Language"), mRaw(record, "Preferred Language")),
    mRenderDetailItem(mLabel("Recorder", "Recorder"), mSummary(record, "recorder")),
    mRenderDetailItem(mLabel("Date of Recording", "Date of Recording"), mSummary(record, "date_of_recording")),
    mRenderDetailItem(mLabel("Tstamp", "Tstamp"), mRaw(record, "Tstamp")),
    mRenderDetailItem(mLabel("MasterID", "MasterID"), mRaw(record, "MasterID"))
  ].join("");

  const relatedHtml = [
    mRenderRelatedIdList(mLabel("Monument is part of", "Monument is part of"), mRaw(record, "Monument is part of"), true),
    mRenderRelatedIdList(mLabel("Monument contains", "Monument contains"), mRaw(record, "Monument contains"), true),
    mRenderRelatedIdList(mLabel("Monument is associated with", "Monument is associated with"), mRaw(record, "Monument is associated with"), true)
  ].join("");

  recordDetails.innerHTML = `
    <div class="record-title">
      <div class="record-title-row">
        <h3>${mSafeValue(mSummary(record, "primary_name"))}</h3>
        ${statusBadge}
      </div>
      <p>${mSafeValue(mIdentity(record, "caal_id"))}</p>
      <p></p>
      <button type="button" class="action-btn" id="zoomToSelectedMonumentBtn">
        Centre on map
      </button>
    </div>

    <div class="group-stack">
      ${mRenderGroupBlock(mLabel("Basic", "Basic"), basicHtml, true)}
      ${mRenderGroupBlock(mLabel("Monument", "Monument"), monumentHtml, true)}
      ${mRenderGroupBlock(mLabel("Administration", "Administration"), adminHtml, true)}
      ${mRenderGroupBlock(mLabel("Measurements", "Measurements"), measurementsHtml, true)}
      ${mRenderGroupBlock(mLabel("Metadata", "Metadata"), metadataHtml, true)}
      ${mRenderGroupBlock(mLabel("Related resources", "Related resources"), relatedHtml, true)}
    </div>
  `;
  const zoomBtn = document.getElementById("zoomToSelectedMonumentBtn");

  if (zoomBtn) {
    zoomBtn.addEventListener("click", () => {
      if (!record?.geometry?.coordinates || !map) return;

      drawSelectedMonumentHighlight(record);

      map.easeTo({
        center: record.geometry.coordinates,
  //      zoom: Math.max(map.getZoom(), 10),
        duration: 600
      });
    });
  }
  wireRelatedRecordChips();
}

// --------------------------------------------------------
// Edit mode
// --------------------------------------------------------
function renderMonumentEditMode(record) {
  recordDetails.innerHTML = `
    <div class="record-title">
      <h3>${mSafeValue(mSummary(record, "primary_name"))}</h3>
      <p>${mSafeValue(mIdentity(record, "caal_id"))}</p>
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Basic", "Basic")}</span>
          </div>

          ${mRenderTextInput("Primary Name", mLabel("Primary Name", "Primary Name"), mRaw(record, "Primary Name"), true)}
          ${mRenderTextInput("Primary Name (English)", mLabel("Primary Name (English)", "Primary Name (English)"), mRaw(record, "Primary Name (English)"), true)}
          ${mRenderTextInput("Other Names", mLabel("Other Names", "Other Names"), mRaw(record, "Other Names"), true)}

          ${mRenderSelect("Country", mLabel("Country", "Country"), "country", mRaw(record, "Country"))}
          ${mRenderTextInput("Region", mLabel("Region", "Region"), mRaw(record, "Region"))}

          ${mRenderSelect("Classification", mLabel("Classification", "Classification"), "classification", mRaw(record, "Classification"))}
          ${mRenderReadOnlyItem(mLabel("CAAL_ID", "CAAL_ID"), mIdentity(record, "caal_id"))}

          ${mRenderTextInput("Internal Reference", mLabel("Internal Reference", "Internal Reference"), mRaw(record, "Internal Reference"))}
          ${mRenderTextInput("External Reference", mLabel("External Reference", "External Reference"), mRaw(record, "External Reference"))}

          ${mRenderSelect("Designation", mLabel("Designation", "Designation"), "designation", mRaw(record, "Designation"))}
          ${mRenderTextInput("World Heritage Site Name", mLabel("World Heritage Site Name", "World Heritage Site Name"), mRaw(record, "World Heritage Site Name"))}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Monument", "Monument")}</span>
          </div>

          ${mRenderTextInput("Monument Passport", mLabel("Monument Passport", "Monument Passport"), mRaw(record, "Monument Passport"), true)}

          ${mRenderSelect("Monument Type1", mLabel("Monument Type1", "Monument Type1"), "monument_type", mRaw(record, "Monument Type1"))}
          ${mRenderSelect("Monument Type2", mLabel("Monument Type2", "Monument Type2"), "monument_type", mRaw(record, "Monument Type2"))}
          ${mRenderSelect("Monument Type3", mLabel("Monument Type3", "Monument Type3"), "monument_type", mRaw(record, "Monument Type3"))}
          ${mRenderSelect("Monument Type4", mLabel("Monument Type4", "Monument Type4"), "monument_type", mRaw(record, "Monument Type4"))}
          ${mRenderSelect("Monument Type5", mLabel("Monument Type5", "Monument Type5"), "monument_type", mRaw(record, "Monument Type5"))}
          ${mRenderSelect("Monument Type6", mLabel("Monument Type6", "Monument Type6"), "monument_type", mRaw(record, "Monument Type6"))}

          ${mRenderSelect("Religion1", mLabel("Religion1", "Religion1"), "religion", mRaw(record, "Religion1"))}
          ${mRenderSelect("Religion2", mLabel("Religion2", "Religion2"), "religion", mRaw(record, "Religion2"))}
          ${mRenderSelect("Religion3", mLabel("Religion3", "Religion3"), "religion", mRaw(record, "Religion3"))}

          ${mRenderTextInput("Descriptive Date", mLabel("Descriptive Date", "Descriptive Date"), mRaw(record, "Descriptive Date"), true)}

          ${mRenderSelect("Cultural Period1", mLabel("Cultural Period1", "Cultural Period1"), "cultural_period", mRaw(record, "Cultural Period1"))}
          ${mRenderSelect("Cultural Period2", mLabel("Cultural Period2", "Cultural Period2"), "cultural_period", mRaw(record, "Cultural Period2"))}
          ${mRenderSelect("Cultural Period3", mLabel("Cultural Period3", "Cultural Period3"), "cultural_period", mRaw(record, "Cultural Period3"))}
          ${mRenderSelect("Cultural Period4", mLabel("Cultural Period4", "Cultural Period4"), "cultural_period", mRaw(record, "Cultural Period4"))}
          ${mRenderSelect("Cultural Period5", mLabel("Cultural Period5", "Cultural Period5"), "cultural_period", mRaw(record, "Cultural Period5"))}
          ${mRenderSelect("Cultural Period6", mLabel("Cultural Period6", "Cultural Period6"), "cultural_period", mRaw(record, "Cultural Period6"))}

          ${mRenderNumberInput("Start Date", mLabel("Start Date", "Start Date"), mRaw(record, "Start Date"), "1")}
          ${mRenderNumberInput("End Date", mLabel("End Date", "End Date"), mRaw(record, "End Date"), "1")}
          
          ${mRenderTextarea("Primary Description", mLabel("Primary Description", "Primary Description"), mRaw(record, "Primary Description"), true)}
          ${mRenderTextarea("Primary Description (English)", mLabel("Primary Description (English)", "Primary Description (English)"), mRaw(record, "Primary Description (English)"), true)}
          ${mRenderTextarea("Additional Notes", mLabel("Additional Notes", "Additional Notes"), mRaw(record, "Additional Notes"), true)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Administration", "Administration")}</span>
          </div>

          ${mRenderTextInput("Primary Address", mLabel("Primary Address", "Primary Address"), mRaw(record, "Primary Address"), true)}
          ${mRenderNumberInput("Longitude", mLabel("Longitude", "Longitude"), mRaw(record, "Longitude"), "0.000001")}
          ${mRenderNumberInput("Latitude", mLabel("Latitude", "Latitude"), mRaw(record, "Latitude"), "0.000001")}
          ${mRenderNumberInput("Altitude", mLabel("Altitude", "Altitude"), mRaw(record, "Altitude"), "any")}
          ${mRenderSelect("Location Confidence", mLabel("Location Confidence", "Location Confidence"), "location_confidence", mRaw(record, "Location Confidence"))}

          ${mRenderTextarea("Location Notes", mLabel("Location Notes", "Location Notes"), mRaw(record, "Location Notes"), true)}

          ${mRenderTextInput("Administrative Subdivision Name1", mLabel("Administrative Subdivision Name1", "Administrative Subdivision Name1"), mRaw(record, "Administrative Subdivision Name1"))}
          ${mRenderSelect("Administrative Subdivision Type1", mLabel("Administrative Subdivision Type1", "Administrative Subdivision Type1"), "admin_subdivision_type", mRaw(record, "Administrative Subdivision Type1"))}
          ${mRenderTextInput("Administrative Subdivision Name2", mLabel("Administrative Subdivision Name2", "Administrative Subdivision Name2"), mRaw(record, "Administrative Subdivision Name2"))}
          ${mRenderSelect("Administrative Subdivision Type2", mLabel("Administrative Subdivision Type2", "Administrative Subdivision Type2"), "admin_subdivision_type", mRaw(record, "Administrative Subdivision Type2"))}
          ${mRenderTextInput("Administrative Subdivision Name3", mLabel("Administrative Subdivision Name3", "Administrative Subdivision Name3"), mRaw(record, "Administrative Subdivision Name3"))}
          ${mRenderSelect("Administrative Subdivision Type3", mLabel("Administrative Subdivision Type3", "Administrative Subdivision Type3"), "admin_subdivision_type", mRaw(record, "Administrative Subdivision Type3"))}
          ${mRenderTextInput("Administrative Subdivision Name4", mLabel("Administrative Subdivision Name4", "Administrative Subdivision Name4"), mRaw(record, "Administrative Subdivision Name4"))}
          ${mRenderSelect("Administrative Subdivision Type4", mLabel("Administrative Subdivision Type4", "Administrative Subdivision Type4"), "admin_subdivision_type", mRaw(record, "Administrative Subdivision Type4"))}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Measurements", "Measurements")}</span>
          </div>

          ${mRenderNumberInput("Measurement Value1", mLabel("Measurement Value1", "Measurement Value1"), mRaw(record, "Measurement Value1"))}
          ${mRenderSelect("Measurement Unit1", mLabel("Measurement Unit1", "Measurement Unit1"), "measurement_unit", mRaw(record, "Measurement Unit1"))}
          ${mRenderSelect("Measurement Type1", mLabel("Measurement Type1", "Measurement Type1"), "measurement_type", mRaw(record, "Measurement Type1"))}

          ${mRenderNumberInput("Measurement Value2", mLabel("Measurement Value2", "Measurement Value2"), mRaw(record, "Measurement Value2"))}
          ${mRenderSelect("Measurement Unit2", mLabel("Measurement Unit2", "Measurement Unit2"), "measurement_unit", mRaw(record, "Measurement Unit2"))}
          ${mRenderSelect("Measurement Type2", mLabel("Measurement Type2", "Measurement Type2"), "measurement_type", mRaw(record, "Measurement Type2"))}

          ${mRenderNumberInput("Measurement Value3", mLabel("Measurement Value3", "Measurement Value3"), mRaw(record, "Measurement Value3"))}
          ${mRenderSelect("Measurement Unit3", mLabel("Measurement Unit3", "Measurement Unit3"), "measurement_unit", mRaw(record, "Measurement Unit3"))}
          ${mRenderSelect("Measurement Type3", mLabel("Measurement Type3", "Measurement Type3"), "measurement_type", mRaw(record, "Measurement Type3"))}

          ${mRenderNumberInput("Measurement Value4", mLabel("Measurement Value4", "Measurement Value4"), mRaw(record, "Measurement Value4"))}
          ${mRenderSelect("Measurement Unit4", mLabel("Measurement Unit4", "Measurement Unit4"), "measurement_unit", mRaw(record, "Measurement Unit4"))}
          ${mRenderSelect("Measurement Type4", mLabel("Measurement Type4", "Measurement Type4"), "measurement_type", mRaw(record, "Measurement Type4"))}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Metadata", "Metadata")}</span>
          </div>

          ${mRenderReadOnlyItem(mLabel("Preferred Language", "Preferred Language"), mRaw(record, "Preferred Language"))}
          ${mRenderReadOnlyItem(mLabel("Recorder", "Recorder"), mRaw(record, "Recorder"))}
          ${mRenderReadOnlyItem(mLabel("Date of Recording", "Date of Recording"), mRaw(record, "Date of Recording") || mLabel("Set automatically on save", "Set automatically on save"))}
          ${mRenderReadOnlyItem(mLabel("Tstamp", "Tstamp"), mRaw(record, "Tstamp"))}
          ${mRenderTextInput("MasterID", mLabel("MasterID", "MasterID"), mRaw(record, "MasterID"))}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Related resources", "Related resources")}</span>
          </div>

          ${mRenderTextInput("Monument is part of", mLabel("Monument is part of", "Monument is part of"), mRaw(record, "Monument is part of"), true)}
          ${mRenderTextInput("Monument contains", mLabel("Monument contains", "Monument contains"), mRaw(record, "Monument contains"), true)}
          ${mRenderTextInput("Monument is associated with", mLabel("Monument is associated with", "Monument is associated with"), mRaw(record, "Monument is associated with"), true)}
        </div>
      </div>
    </div>
  `;

const startDateInput = document.getElementById(mInputId("Start Date"));
const endDateInput = document.getElementById(mInputId("End Date"));

if (startDateInput) startDateInput.readOnly = true;
if (endDateInput) endDateInput.readOnly = true;

  function bindMonumentDirtyTracking() {
    Array.from(
      document.querySelectorAll(
        "#monumentDetailPane input, #monumentDetailPane textarea, #monumentDetailPane select"
      )
    ).forEach((el) => {
      el.addEventListener("input", () => {
        monumentIsDirty = true;
      });

      el.addEventListener("change", () => {
        monumentIsDirty = true;
      });
    });
  }
  bindMonumentDirtyTracking();
  wireMonumentCulturalPeriodDateRecalc();
  recalculateMonumentDates(record);
}


// --------------------------------------------------------
// Add mode
// --------------------------------------------------------
function makeNewBlankMonumentRecord() {
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
      caal_id: "[new record - unsaved]"
    },
    summary: {
      primary_name: "",
      primary_name_english: "",
      country: sessionCountry,
      region: "",
      classification: "",
      designation: "",
      monument_type1: "",
      cultural_period1: "",
      religion1: "",
      longitude: "",
      latitude: "",
      recorder: sessionUsername,
      date_of_recording: today
    },
    raw: {
      "Primary Name": "",
      "Primary Name (English)": "",
      "Other Names": "",
      "Country": sessionCountry,
      "Region": "",
      "Classification": "",
      "CAAL_ID": "",
      "Internal Reference": "",
      "External Reference": "",
      "Monument Passport": "",
      "Monument Type1": "",
      "Monument Type2": "",
      "Monument Type3": "",
      "Monument Type4": "",
      "Monument Type5": "",
      "Monument Type6": "",
      "Religion1": "",
      "Religion2": "",
      "Religion3": "",
      "Descriptive Date": "",
      "Cultural Period1": "",
      "Cultural Period2": "",
      "Cultural Period3": "",
      "Cultural Period4": "",
      "Cultural Period5": "",
      "Cultural Period6": "",
      "Primary Description": "",
      "Primary Description (English)": "",
      "Additional Notes": "",
      "Longitude": "",
      "Latitude": "",
      "Altitude": "",
      "Location Confidence": "",
      "Location Notes": "",
      "Primary Address": "",
      "Administrative Subdivision Name1": "",
      "Administrative Subdivision Type1": "",
      "Administrative Subdivision Name2": "",
      "Administrative Subdivision Type2": "",
      "Administrative Subdivision Name3": "",
      "Administrative Subdivision Type3": "",
      "Administrative Subdivision Name4": "",
      "Administrative Subdivision Type4": "",
      "Measurement Value1": "",
      "Measurement Unit1": "",
      "Measurement Type1": "",
      "Measurement Value2": "",
      "Measurement Unit2": "",
      "Measurement Type2": "",
      "Measurement Value3": "",
      "Measurement Unit3": "",
      "Measurement Type3": "",
      "Measurement Value4": "",
      "Measurement Unit4": "",
      "Measurement Type4": "",
      "Designation": "",
      "World Heritage Site Name": "",
      "Monument is part of": "",
      "Monument contains": "",
      "Monument is associated with": "",
      "Preferred Language": lang,
      "Recorder": sessionUsername,
      "MasterID": "",
      "Tstamp": "",
      "Date of Recording": today,
      "Start Date": "",
      "End Date": ""
    },
    geometry: null,
    source: {
      scope: "workspace",
      is_editable: true,
      is_new: true
    },
    filter_values: {
      monument_types: [],
      religions: [],
      cultural_periods: [],
      classification: "",
      designation: "",
      country: sessionCountry
    }
  };
}

function updateAddModeUI() {
  if (map) {
    map.getContainer().style.cursor = monumentIsAddMode ? "crosshair" : "";
  }

  const showMapActions = monumentIsEditMode || !!monumentPendingNewRecord;

  if (monumentMapActionBar) {
    monumentMapActionBar.hidden = !showMapActions;
  }

  if (monumentPickPointBtn) {
    monumentPickPointBtn.hidden = monumentIsAddMode || !showMapActions;
  }

  if (monumentCancelPickPointBtn) {
    monumentCancelPickPointBtn.hidden = !monumentIsAddMode || !showMapActions;
  }
}

function applyMapClickToSelectedRecord(latlng) {
  if (!monumentSelectedRecord) return;

  const lng = Number(latlng.lng.toFixed(6));
  const lat = Number(latlng.lat.toFixed(6));

  monumentSelectedRecord.raw["Longitude"] = lng;
  monumentSelectedRecord.raw["Latitude"] = lat;
  monumentSelectedRecord.summary.longitude = lng;
  monumentSelectedRecord.summary.latitude = lat;
  monumentSelectedRecord.geometry = {
    type: "Point",
    coordinates: [lng, lat]
  };
}

window.monumentCanChangeLanguage = function () {
  if (!monumentIsEditMode || !monumentIsDirty) {
    return true;
  }

  const confirmed = window.confirm(
    mLabel(
      "Language change cancels editing",
      "Changing language will cancel the current edit. Continue?"
    )
  );

  if (!confirmed) {
    return false;
  }

  monumentIsEditMode = false;
  monumentSyncModeVisualState();
  monumentIsDirty = false;
  monumentPendingNewRecord = null;
  monumentIsAddMode = false;
  updateAddModeUI();

  if (monumentSelectedRecord) {
    renderMonumentRecordDetails(monumentSelectedRecord);
  } else {
    renderMonumentEmptyState();
  }

  return true;
};

// button logic 
async function saveCurrentMonumentRecord() {
  if (!monumentSelectedRecord) return;
  if (!validateRelatedFieldsBeforeSave()) return;

  setMonumentsLoading(true, "Saving record...");

  try {
    const payload = mBuildSavePayload();
    const lang =
      (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
      window.appSession?.profile?.preferred_language ||
      "en";

    const record = monumentSelectedRecord;
    const isNewRecord = !record?.identity?.id;

    const url = isNewRecord
      ? `/api/monuments?lang=${encodeURIComponent(lang)}`
      : `/api/monuments/${record.identity.id}?lang=${encodeURIComponent(lang)}`;

    const method = isNewRecord ? "POST" : "PATCH";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.detail || data.error || "Monument save failed");
      return;
    }

    showToast("Record saved");
    monumentPendingNewRecord = null;
    monumentIsEditMode = false;
    monumentSyncModeVisualState();
    clearPendingPickPoint();
    monumentIsDirty = false;
    monumentIsAddMode = false;
    updateAddModeUI();

    await loadMonumentMapRecords();
    await loadMonumentListRecords();

    const refreshed =
      monumentListRecords.find((item) => item?.identity?.id === data.record?.identity?.id) ||
      monumentMapRecords.find((item) => item?.identity?.id === data.record?.identity?.id);

    if (refreshed) {
      monumentSelectedRecord = refreshed;
      renderMonumentRecordDetails(refreshed);
      updateSelectedResultCard();

      if (map && refreshed.geometry?.coordinates) {
        drawSelectedMonumentHighlight(refreshed);
        ensureRecordVisibleOnMap(refreshed);
      }
    } else {
      renderMonumentEmptyState();
    }
  } catch (error) {
    console.error("Monument save failed:", error);
    alert(error.message || "Monument save failed");
  } finally {
    setMonumentsLoading(false);
  }
}

function cancelCurrentMonumentEdit() {
  if (monumentPendingNewRecord && monumentSelectedRecord === monumentPendingNewRecord) {
    monumentPendingNewRecord = null;
    clearPendingPickPoint();
    monumentSelectedRecord = null;
    monumentIsEditMode = false;
    updateMonumentActionBar();
    monumentSyncModeVisualState();
    monumentIsDirty = false;
    monumentIsAddMode = false;
    updateAddModeUI();
    renderMonumentEmptyState();
    return;
  }

  monumentIsEditMode = false;
  monumentSyncModeVisualState();
  monumentIsDirty = false;
  monumentIsAddMode = false;
  updateAddModeUI();

  if (monumentSelectedRecord) {
    renderMonumentRecordDetails(monumentSelectedRecord);
    updateSelectedResultCard();
  } else {
    renderMonumentEmptyState();
  }
}

// --------------------------------------------------------
// Events
// --------------------------------------------------------
if (monumentPreviewCloseBtn) {
  monumentPreviewCloseBtn.addEventListener("click", () => {
    closeMonumentPreviewModal();
  });
}

if (siteSearch) {
  siteSearch.addEventListener("input", scheduleMonumentSearchAndMapRedraw);
}

if (filterCaalId) {
  filterCaalId.addEventListener("input", scheduleMonumentSearchAndMapRedraw);
}

[
  filterMonumentType,
  filterClassification,
  filterDesignation,
  filterReligion,
  filterCulturalPeriod,
  filterCountry
].forEach((selectEl) => {
  if (selectEl) {
    selectEl.addEventListener("change", () => {
      applyMonumentFilters({ includeMap: true, listFirst: true });
    });
  }
});

if (toggleFiltersBtn && filtersPanel) {
  toggleFiltersBtn.addEventListener("click", () => {
    const isHidden = filtersPanel.hidden;
    filtersPanel.hidden = !isHidden;
    toggleFiltersBtn.textContent = isHidden
      ? mLabel("Hide advanced filters", "Hide advanced filters")
      : mLabel("Advanced filters", "Advanced filters");
  });
}

if (monumentPrevBtn) {
  monumentPrevBtn.addEventListener("click", async () => {
    if (monumentPageOffset === 0) return;
    if (!monumentConfirmLoseChanges()) return;

    monumentPageOffset = Math.max(0, monumentPageOffset - monumentPageLimit);

    setMonumentsLoading(true, "Loading page...");
    try {
      await loadMonumentListRecords();
    } catch (error) {
      console.error("Failed to load previous monuments page:", error);
    } finally {
      setMonumentsLoading(false);
    }
  });
}

if (monumentNextBtn) {
  monumentNextBtn.addEventListener("click", async () => {
    if (monumentPageOffset + monumentPageLimit >= monumentTotalCount) return;
    if (!monumentConfirmLoseChanges()) return;

    monumentPageOffset += monumentPageLimit;

    setMonumentsLoading(true, "Loading page...");
    try {
      await loadMonumentListRecords();
    } catch (error) {
      console.error("Failed to load previous monuments page:", error);
    } finally {
      setMonumentsLoading(false);
    }
  });
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", async () => {
    await clearMonumentFilters();
  });
}

if (addMonumentBtn) {
  addMonumentBtn.addEventListener("click", () => {
    if (!monumentConfirmLoseChanges()) return;

    const newRecord = makeNewBlankMonumentRecord();
    monumentPendingNewRecord = newRecord;
    monumentSelectedRecord = newRecord;
    monumentIsEditMode = true;
    monumentSyncModeVisualState();
    monumentIsDirty = false;
    monumentIsAddMode = false;
    updateAddModeUI();
    renderMonumentRecordDetails(newRecord);
    updateSelectedResultCard();
  });
}

if (monumentEditBtn) {
  monumentEditBtn.addEventListener("click", () => {
    if (!monumentSelectedRecord) return;
    if (monumentSelectedRecord?.source?.is_editable !== true) return;

    monumentIsEditMode = true;
    monumentSyncModeVisualState();
    monumentIsDirty = false;
    renderMonumentRecordDetails(monumentSelectedRecord);
    updateSelectedResultCard();
  });
}

if (monumentPickPointBtn) {
  monumentPickPointBtn.addEventListener("click", () => {
    if (!monumentSelectedRecord) return;

    monumentIsAddMode = true;
    updateAddModeUI();
  });
}

if (monumentCancelPickPointBtn) {
  monumentCancelPickPointBtn.addEventListener("click", () => {
    monumentIsAddMode = false;
    updateAddModeUI();
  });
}

if (monumentSaveBtn) {
  monumentSaveBtn.addEventListener("click", async () => {
    await saveCurrentMonumentRecord();
  });
}

if (monumentCancelEditBtn) {
  monumentCancelEditBtn.addEventListener("click", () => {
    cancelCurrentMonumentEdit();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (monumentIsAddMode) {
      monumentIsAddMode = false;
      clearPendingPickPoint();
      updateAddModeUI();
      return;
    }

    if (monumentPreviewModal && !monumentPreviewModal.hidden) {
      closeMonumentPreviewModal();
      return;
    }
  }

  if (monumentIsEditMode) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  }
});

document.addEventListener("app:languageChanged", async () => {
  const selectedId = monumentSelectedRecord?.identity?.id ?? null;
  const wasEditing = monumentIsEditMode;
  const pendingNew = monumentPendingNewRecord;

  setMonumentsLoading(true, "Switching language...");

  try {
    await loadMonumentLabels();
    await loadMonumentLookups();
    populateMonumentFilterLookups();
    await loadMonumentMapRecords();
    await loadMonumentListRecords();

    // Preserve an unsaved brand-new local record
    if (pendingNew && selectedId === null) {
      monumentPendingNewRecord = pendingNew;
      monumentSelectedRecord = pendingNew;
      monumentIsEditMode = wasEditing;
      renderMonumentRecordDetails(pendingNew);
      return;
    }

    // Restore the currently open saved record
    if (selectedId !== null) {
      const refreshed =
        monumentListRecords.find((record) => Number(record?.identity?.id) === Number(selectedId)) ||
        monumentMapRecords.find((record) => Number(record?.identity?.id) === Number(selectedId));

      if (refreshed) {
        monumentSelectedRecord = refreshed;
        monumentIsEditMode = wasEditing;
        renderMonumentRecordDetails(refreshed);
        updateSelectedResultCard();
        return;
      }
    }

    monumentSelectedRecord = null;
    monumentIsEditMode = false;
    monumentSyncModeVisualState();
    renderMonumentEmptyState();
  } catch (error) {
    console.error("Monuments language refresh failed:", error);
  } finally {
    setMonumentsLoading(false);
  }
});

[showWorkspaceRecords, showNationalRecords, showAllCaalRecords].forEach((el) => {
  if (el) {
    el.addEventListener("change", async () => {
      if (!monumentConfirmLoseChanges()) {
        el.checked = !el.checked;
        return;
      }

      monumentPageOffset = 0;
      monumentPendingNewRecord = null;
      monumentIsEditMode = false;
      monumentSyncModeVisualState();
      monumentSelectedRecord = null;

      if (map) {
        if (map.getLayer("monument-selected-ring")) {
          map.removeLayer("monument-selected-ring");
        }
        if (map.getSource("monument-selected")) {
          map.removeSource("monument-selected");
        }
      }

      setMonumentsLoading(true, "Updating scope...");
      try {
        setMonumentsLoading(true, "Updating scope...");
        try {
          await loadMonumentListRecords();

          setMonumentsLoading(true, "Redrawing map...");
          await loadMonumentMapRecords();

          renderMonumentEmptyState();
        } catch (error) {
          console.error("Failed to reload monuments after scope change:", error);
        } finally {
          setMonumentsLoading(false);
        }
        renderMonumentEmptyState();
      } catch (error) {
        console.error("Failed to reload monuments after scope change:", error);
      } finally {
        setMonumentsLoading(false);
      }
    });
  }
});

// --------------------------------------------------------
// Initial load
// --------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  const refreshMonumentsCacheBtn = document.getElementById("refreshMonumentsCacheBtn");

  if (refreshMonumentsCacheBtn) {
    refreshMonumentsCacheBtn.hidden = !session.permissions?.can_edit_caal;
  }

  setMonumentsLoading(false);

  if (session.permissions?.can_view_all_caal && allCaalMonumentsToggleWrapper) {
    allCaalMonumentsToggleWrapper.hidden = false;
  }

  renderMonumentEmptyState();

  const initialCaalId = getInitialCaalIdFromUrl();
  const initialScope = getInitialScopeFromUrl();

  let directLinkedRecord = null;

  if (initialCaalId && filterCaalId) {
    filterCaalId.value = initialCaalId;
  }

  setMonumentsLoading(true, initialCaalId ? "Loading linked record..." : "Loading records...");

  try {
    await loadMonumentLabels();
    await loadMonumentLookups();
    populateMonumentFilterLookups();

    if (initialCaalId) {
      const resolved = await loadDirectLinkedRecord(initialCaalId);

      if (resolved?.record_type === "monument" && resolved.record) {
        directLinkedRecord = resolved.record;

        const resolvedScope = resolved.record.source?.scope || initialScope;

        if (resolvedScope) {
          if (showWorkspaceRecords) showWorkspaceRecords.checked = false;
          if (showNationalRecords) showNationalRecords.checked = false;
          if (showAllCaalRecords) showAllCaalRecords.checked = false;

          if (resolvedScope === "workspace" && showWorkspaceRecords) {
            showWorkspaceRecords.checked = true;
          }

          if (resolvedScope === "national_ref" && showNationalRecords) {
            showNationalRecords.checked = true;
          }

          if (resolvedScope === "all_caal" && showAllCaalRecords) {
            showAllCaalRecords.checked = true;
          }
        }

        monumentSelectedRecord = directLinkedRecord;
        renderMonumentRecordDetails(directLinkedRecord);
        updateSelectedResultCard();
      }
    } else if (initialScope) {
      if (showWorkspaceRecords) showWorkspaceRecords.checked = false;
      if (showNationalRecords) showNationalRecords.checked = false;
      if (showAllCaalRecords) showAllCaalRecords.checked = false;

      if (initialScope === "workspace" && showWorkspaceRecords) {
        showWorkspaceRecords.checked = true;
      }

      if (initialScope === "national_ref" && showNationalRecords) {
        showNationalRecords.checked = true;
      }

      if (initialScope === "all_caal" && showAllCaalRecords) {
        showAllCaalRecords.checked = true;
      }
    }
  } catch (error) {
    console.error("Monuments linked-record setup failed:", error);
  } finally {
    setMonumentsLoading(false);
  }

  if (mapElement && typeof maplibregl !== "undefined") {
    const initialBasemap = basemapSelect ? basemapSelect.value : "osm";

    map = new maplibregl.Map({
      container: "map",
      style: getBasemapStyle(initialBasemap),
      center: directLinkedRecord?.geometry?.coordinates || [66.9, 48.2],
      zoom: directLinkedRecord?.geometry?.coordinates ? 8 : 4.2
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("click", (event) => {
      if (!monumentIsAddMode) return;

      drawPendingPickPoint(event.lngLat);
      applyMapClickToSelectedRecord(event.lngLat);

      monumentIsAddMode = false;
      monumentIsEditMode = true;
      updateAddModeUI();
      renderMonumentRecordDetails(monumentSelectedRecord);
      updateSelectedResultCard();
    });

    map.on("load", async () => {
      mapLoaded = true;
      updateAddModeUI();

      setMonumentsLoading(true, "Loading records...");

      try {
        await loadMonumentMapRecords();
        await loadMonumentListRecords();

        if (directLinkedRecord) {
          monumentSelectedRecord = directLinkedRecord;
          renderMonumentRecordDetails(directLinkedRecord);
          updateSelectedResultCard();

          if (directLinkedRecord.geometry?.coordinates) {
            drawSelectedMonumentHighlight(directLinkedRecord);
            ensureRecordVisibleOnMap(directLinkedRecord);
          }
        }
      } catch (error) {
        console.error("Monuments initial load failed:", error);
        if (!directLinkedRecord) renderMonumentEmptyState();
      } finally {
        setMonumentsLoading(false);
      }
    });

    map.on("moveend", () => {
      if (monumentMoveDebounceTimer) {
        clearTimeout(monumentMoveDebounceTimer);
      }

      monumentMoveDebounceTimer = setTimeout(async () => {
        if (monumentsIsLoading) return;

        const filters = getMonumentCurrentFilters();

        if (filters.text || filters.caalId) {
          return;
        }

        try {
          await loadMonumentMapRecords();
        } catch (error) {
          console.error("Failed to reload monuments for bbox:", error);
        }
      }, 1000);
    });

    if (basemapSelect) {
      basemapSelect.addEventListener("change", () => {
        mapLoaded = false;
        monumentsLayerEventsBound = false;

        map.setStyle(getBasemapStyle(basemapSelect.value));

        map.once("style.load", () => {
          mapLoaded = true;
          drawMonumentRecords(monumentMapRecords);

          if (monumentSelectedRecord?.geometry?.coordinates) {
            drawSelectedMonumentHighlight(monumentSelectedRecord);
          }

          updateAddModeUI();
        });
      });
    }
  } else {
    setMonumentsLoading(true, "Loading records...");

    try {
      await loadMonumentMapRecords();
      await loadMonumentListRecords();

      if (directLinkedRecord) {
        monumentSelectedRecord = directLinkedRecord;
        renderMonumentRecordDetails(directLinkedRecord);
        updateSelectedResultCard();
      }
    } catch (error) {
      console.error("Monuments initial load failed:", error);
      if (!directLinkedRecord) renderMonumentEmptyState();
    } finally {
      setMonumentsLoading(false);
    }
  }
});