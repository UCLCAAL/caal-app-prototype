// MONUMENTS PAGE LOGIC
// ========================================================

// DOM elements
// -----------------------------
const recordDetails = document.getElementById("recordDetails");
const siteSearch = document.getElementById("siteSearch");
const addPointBtn = document.getElementById("addPointBtn");
const cancelAddBtn = document.getElementById("cancelAddBtn");

const toggleFiltersBtn = document.getElementById("toggleFiltersBtn");
const filtersPanel = document.getElementById("filtersPanel");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");

const filterMonumentType = document.getElementById("filterMonumentType");
const filterClassification = document.getElementById("filterClassification");
const filterDesignation = document.getElementById("filterDesignation");
const filterReligion = document.getElementById("filterReligion");
const filterCulturalPeriod = document.getElementById("filterCulturalPeriod");
const filterCountry = document.getElementById("filterCountry");

const showWorkspaceRecords = document.getElementById("showWorkspaceRecords");
const showCaalRecords = document.getElementById("showCaalRecords");

const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");

// State
let selectedProperties = null;
let isEditMode = false;
let isAddMode = false;
let pendingNewFeature = null;

let allFeatures = [];
let visibleFeatures = [];
let geoJsonLayer = null;


// Leaflet map
const mapElement = document.getElementById("map");
let map = null;

if (mapElement && typeof L !== "undefined") {
  map = L.map("map").setView([48.0, 67.0], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

// -----------------------------
// Small helpers
function hasRealValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function normalizeSearchText(value) {
  if (!hasRealValue(value)) return "";
  return String(value).toLowerCase();
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(hasRealValue))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function getRepeatedFieldValues(properties, baseName, start, end) {
  const values = [];
  for (let i = start; i <= end; i++) {
    const value = properties[`${baseName}${i}`];
    if (hasRealValue(value)) {
      values.push(value);
    }
  }
  return values;
}

function getMonumentTypes(properties) {
  return getRepeatedFieldValues(properties, "Monument Type", 1, 6);
}

function getReligions(properties) {
  return getRepeatedFieldValues(properties, "Religion", 1, 3);
}

function getCulturalPeriods(properties) {
  return getRepeatedFieldValues(properties, "Cultural Period", 1, 6);
}

function getSelectedValues(selectEl) {
  if (!selectEl) return [];
  return Array.from(selectEl.selectedOptions).map((option) => option.value);
}

function populateMultiSelect(selectEl, values) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });
}

// -----------------------------
// Search text blob
function buildRecordSearchText(properties) {
  const monumentTypes = getMonumentTypes(properties);
  const religions = getReligions(properties);
  const culturalPeriods = getCulturalPeriods(properties);

  const fields = [
    properties["Primary Name"],
    properties["Primary Name (English)"],
    properties["Other Names"],
    properties["CAAL_ID"],
    properties["Internal Reference"],
    properties["External Reference"],
    properties["Classification"],
    properties["Designation"],
    properties["Country"],
    properties["Region"],
    properties["Descriptive Date"],
    properties["Primary Description"],
    properties["Primary Description (English)"],
    properties["Additional Notes"],
    properties["Location Notes"],
    properties["Primary Address"],
    properties["Administrative Subdivision Name1"],
    properties["Administrative Subdivision Name2"],
    properties["Administrative Subdivision Name3"],
    properties["Administrative Subdivision Name4"],
    properties["World Heritage Site Name"],
    properties["Monument is part of"],
    properties["Monument contains"],
    properties["Monument is associated with"],
    ...monumentTypes,
    ...religions,
    ...culturalPeriods
  ];

  return fields.map(normalizeSearchText).join(" ");
}

// Filter options from data
function collectFilterOptions(features) {
  const monumentTypes = [];
  const classifications = [];
  const designations = [];
  const religions = [];
  const culturalPeriods = [];
  const countries = [];

  features.forEach((feature) => {
    const p = feature.properties;
    monumentTypes.push(...getMonumentTypes(p));
    classifications.push(p["Classification"]);
    designations.push(p["Designation"]);
    religions.push(...getReligions(p));
    culturalPeriods.push(...getCulturalPeriods(p));
    countries.push(p["Country"]);
  });

  return {
    monumentTypes: uniqueSorted(monumentTypes),
    classifications: uniqueSorted(classifications),
    designations: uniqueSorted(designations),
    religions: uniqueSorted(religions),
    culturalPeriods: uniqueSorted(culturalPeriods),
    countries: uniqueSorted(countries)
  };
}


// Record matching
// OR within category, AND across categories
function recordMatchesFilters(properties, filters) {
  const monumentTypes = getMonumentTypes(properties);
  const religions = getReligions(properties);
  const culturalPeriods = getCulturalPeriods(properties);

  const matchesText =
    !filters.text ||
    buildRecordSearchText(properties).includes(filters.text.toLowerCase());

  const matchesMonumentType =
    filters.monumentTypes.length === 0 ||
    monumentTypes.some((value) => filters.monumentTypes.includes(value));

  const matchesClassification =
    filters.classifications.length === 0 ||
    filters.classifications.includes(properties["Classification"]);

  const matchesDesignation =
    filters.designations.length === 0 ||
    filters.designations.includes(properties["Designation"]);

  const matchesReligion =
    filters.religions.length === 0 ||
    religions.some((value) => filters.religions.includes(value));

  const matchesCulturalPeriod =
    filters.culturalPeriods.length === 0 ||
    culturalPeriods.some((value) => filters.culturalPeriods.includes(value));

  const matchesCountry =
    filters.countries.length === 0 ||
    filters.countries.includes(properties["Country"]);

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

// Map drawing
function pointStyle(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 7,
    weight: 1,
    opacity: 1,
    fillOpacity: 0.85
  });
}

function drawFeatures(features) {
  if (!map) return;

  const drawableFeatures = features.filter(
    (feature) =>
      feature.geometry &&
      feature.geometry.type === "Point" &&
      Array.isArray(feature.geometry.coordinates)
  );

  if (geoJsonLayer) {
    map.removeLayer(geoJsonLayer);
  }

  geoJsonLayer = L.geoJSON(
    { type: "FeatureCollection", features: drawableFeatures },
    {
      pointToLayer: pointStyle,
      onEachFeature: (feature, layer) => {
        const props = feature.properties;

        layer.bindPopup(`
          <div>
            <p class="popup-title">${safeValue(props["Primary Name"])}</p>
            <p class="popup-meta">${safeValue(props["CAAL_ID"])}</p>
          </div>
        `);

        layer.on("click", () => {
          isEditMode = false;
          renderRecordDetails(props);
        });
      }
    }
  ).addTo(map);

  const bounds = geoJsonLayer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}

// Results list
function renderResultsList(features) {
  if (!resultsList) return;

  if (resultsCount) {
    resultsCount.textContent = `${features.length} record${features.length === 1 ? "" : "s"}`;
  }

  if (features.length === 0) {
    resultsList.innerHTML = `
      <div class="results-empty">
        <p>No matching records.</p>
      </div>
    `;
    return;
  }

  resultsList.innerHTML = features
    .map((feature, index) => {
      const p = feature.properties;
      const types = getMonumentTypes(p).join(", ");

      return `
        <div class="result-card" data-result-index="${index}">
          <div class="result-card-header">
            <strong>${safeValue(p["Primary Name"])}</strong>
          </div>
          <div class="result-card-meta">${safeValue(p["CAAL_ID"])}</div>
          <div class="result-card-meta">${safeValue(p["Classification"])}</div>
          <div class="result-card-meta">${safeValue(types)}</div>
        </div>
      `;
    })
    .join("");

  Array.from(resultsList.querySelectorAll(".result-card")).forEach((card) => {
    card.addEventListener("click", () => {
      const idx = Number(card.dataset.resultIndex);
      const feature = features[idx];
      if (!feature) return;

      isEditMode = false;
      renderRecordDetails(feature.properties);

      if (
        map &&
        feature.geometry &&
        Array.isArray(feature.geometry.coordinates)
      ) {
        const [lng, lat] = feature.geometry.coordinates;
        map.setView([lat, lng], Math.max(map.getZoom(), 12));
      }
    });
  });
}

// Filter application
function applyMonumentsFilters() {
  const filters = {
    text: siteSearch ? siteSearch.value.trim() : "",
    monumentTypes: getSelectedValues(filterMonumentType),
    classifications: getSelectedValues(filterClassification),
    designations: getSelectedValues(filterDesignation),
    religions: getSelectedValues(filterReligion),
    culturalPeriods: getSelectedValues(filterCulturalPeriod),
    countries: getSelectedValues(filterCountry)
  };

  visibleFeatures = allFeatures.filter((feature) =>
    recordMatchesFilters(feature.properties, filters)
  );

  renderResultsList(visibleFeatures);
  drawFeatures(visibleFeatures);
}

function clearAllFilters() {
  if (siteSearch) siteSearch.value = "";

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

  applyMonumentsFilters();
}


// Expand / collapse advanced filters
if (toggleFiltersBtn && filtersPanel) {
  toggleFiltersBtn.addEventListener("click", () => {
    const isHidden = filtersPanel.hidden;
    filtersPanel.hidden = !isHidden;
    toggleFiltersBtn.textContent = isHidden ? "Hide advanced filters" : "Advanced filters";
  });
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", clearAllFilters);
}

// -----------------------------
// Existing record panel helpers
// These rely on shared.js functions already existing:
// - t
// - safeValue
// - applyLanguage
// - renderDisplayMode / renderEditMode helpers
// -----------------------------
function renderRecordDetails(properties) {
  selectedProperties = properties;

  if (isEditMode) {
    renderEditMode(properties);
  } else {
    renderDisplayMode(properties);
  }
}

// Add-record UI helpers
function updateAddModeUI() {
  if (!addPointBtn || !cancelAddBtn || !map) return;

  if (isAddMode) {
    addPointBtn.textContent = "Place record on map";
    cancelAddBtn.hidden = false;
    map.getContainer().style.cursor = "crosshair";
  } else {
    addPointBtn.textContent = "Add record";
    cancelAddBtn.hidden = true;
    map.getContainer().style.cursor = "";
  }
}

function enterAddMode() {
  isAddMode = true;
  updateAddModeUI();
}

function exitAddMode() {
  isAddMode = false;
  updateAddModeUI();
}

function makeNewBlankFeature() {
  return {
    type: "Feature",
    properties: {
      "Primary Name": "",
      "Primary Name (English)": "",
      "Other Names": "",
      "Country": "kazakhstan",
      "Region": "",
      "Classification": "",
      "CAAL_ID": "[new record - unsaved]",
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
      "Preferred Language": currentLang,
      "Recorder": "[session user]",
      "MasterID": "",
      "Tstamp": "",
      "Date of Recording": "",
      "Start Date": "",
      "End Date": ""
    },
    geometry: null
  };
}

function applyMapClickToSelectedRecord(latlng) {
  if (!selectedProperties) return;

  const lng = Number(latlng.lng.toFixed(6));
  const lat = Number(latlng.lat.toFixed(6));

  selectedProperties["Longitude"] = lng;
  selectedProperties["Latitude"] = lat;

  if (pendingNewFeature && pendingNewFeature.properties === selectedProperties) {
    pendingNewFeature.geometry = {
      type: "Point",
      coordinates: [lng, lat]
    };
    return;
  }

  const matchingFeature = allFeatures.find(
    (feature) => feature.properties === selectedProperties
  );

  if (matchingFeature) {
    matchingFeature.geometry = {
      type: "Point",
      coordinates: [lng, lat]
    };
    drawFeatures(visibleFeatures);
  }
}

// Event listeners
if (siteSearch) {
  siteSearch.addEventListener("input", applyMonumentsFilters);
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
    selectEl.addEventListener("change", applyMonumentsFilters);
  }
});

if (addPointBtn) {
  addPointBtn.addEventListener("click", () => {
    const newFeature = makeNewBlankFeature();
    pendingNewFeature = newFeature;
    selectedProperties = newFeature.properties;
    isEditMode = true;
    exitAddMode();
    renderRecordDetails(selectedProperties);
  });
}

if (cancelAddBtn) {
  cancelAddBtn.addEventListener("click", () => {
    exitAddMode();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isAddMode) {
    exitAddMode();
  }
});

if (map) {
  map.on("click", (event) => {
    if (!isAddMode) return;

    applyMapClickToSelectedRecord(event.latlng);
    exitAddMode();
    isEditMode = true;
    renderRecordDetails(selectedProperties);
  });
}

// Initial data load
updateAddModeUI();

if (map) {
  fetch("./data/monuments_kaz_sample.geojson")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load GeoJSON: ${response.status}`);
      }
      return response.json();
    })
    .then((geojson) => {
      allFeatures = geojson.features;
      visibleFeatures = allFeatures;

      const options = collectFilterOptions(allFeatures);

      populateMultiSelect(filterMonumentType, options.monumentTypes);
      populateMultiSelect(filterClassification, options.classifications);
      populateMultiSelect(filterDesignation, options.designations);
      populateMultiSelect(filterReligion, options.religions);
      populateMultiSelect(filterCulturalPeriod, options.culturalPeriods);
      populateMultiSelect(filterCountry, options.countries);

      renderResultsList(visibleFeatures);
      drawFeatures(visibleFeatures);
      applyLanguage();
    })
    .catch((error) => {
      console.error(error);
      if (recordDetails) {
        recordDetails.innerHTML = `
          <div class="empty-state">
            <p>Could not load sample data.</p>
            <p>${error.message}</p>
          </div>
        `;
      }
    });
}

document.addEventListener("DOMContentLoaded", () => {
  applyLanguage();
  updateAddModeUI();
});
