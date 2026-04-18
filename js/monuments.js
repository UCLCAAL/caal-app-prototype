// ========================================================
// MONUMENTS PAGE LOGIC
// ========================================================

// --------------------------------------------------------
// DOM
// --------------------------------------------------------
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

// --------------------------------------------------------
// State
// --------------------------------------------------------
let selectedProperties = null;
let isEditMode = false;
let isAddMode = false;
let pendingNewFeature = null;

let allFeatures = [];
let visibleFeatures = [];
let geoJsonLayer = null;

// --------------------------------------------------------
// Leaflet map
// --------------------------------------------------------
const mapElement = document.getElementById("map");
let map = null;

if (mapElement && typeof L !== "undefined") {
  map = L.map("map").setView([48.0, 67.0], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

// --------------------------------------------------------
// Repeated-field helpers
// --------------------------------------------------------
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

// --------------------------------------------------------
// Search text blob
// --------------------------------------------------------
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

// --------------------------------------------------------
// Filter options from data
// --------------------------------------------------------
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

// --------------------------------------------------------
// Record matching
// OR within category, AND across categories
// --------------------------------------------------------
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

// --------------------------------------------------------
// Map drawing
// --------------------------------------------------------
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

// --------------------------------------------------------
// Results list
// --------------------------------------------------------
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

      if (map && feature.geometry && Array.isArray(feature.geometry.coordinates)) {
        const [lng, lat] = feature.geometry.coordinates;
        map.setView([lat, lng], Math.max(map.getZoom(), 12));
      }
    });
  });
}

// --------------------------------------------------------
// Filter application
// --------------------------------------------------------
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

// --------------------------------------------------------
// Expand/collapse advanced filters
// --------------------------------------------------------
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

// --------------------------------------------------------
// Record panel helpers
// --------------------------------------------------------
function renderRecordDetails(properties) {
  selectedProperties = properties;

  if (isEditMode) {
    renderEditMode(properties);
  } else {
    renderDisplayMode(properties);
  }
}

function renderDisplayMode(properties) {
  let basicHtml = "";
  basicHtml += renderDetailItem("Primary Name", properties["Primary Name"], true);
  basicHtml += renderDetailItem(t("primary_name_en"), properties["Primary Name (English)"], true);
  basicHtml += renderDetailItem(t("other_names"), properties["Other Names"], true);
  basicHtml += renderDetailItem(t("country"), properties["Country"]);
  basicHtml += renderDetailItem(t("region"), properties["Region"]);
  basicHtml += renderDetailItem(t("classification"), properties["Classification"]);
  basicHtml += renderDetailItem(t("caal_id"), properties["CAAL_ID"]);
  basicHtml += renderDetailItem(t("internal_reference"), properties["Internal Reference"]);
  basicHtml += renderDetailItem(t("external_reference"), properties["External Reference"]);
  basicHtml += renderDetailItem(t("designation"), properties["Designation"]);
  basicHtml += renderDetailItem(t("world_heritage_site_name"), properties["World Heritage Site Name"]);

  let monumentHtml = "";
  monumentHtml += renderDetailItem(t("monument_passport"), properties["Monument Passport"], true);
  monumentHtml += renderDetailItem(t("monument_type1"), properties["Monument Type1"]);
  monumentHtml += renderDetailItem(t("monument_type2"), properties["Monument Type2"]);
  monumentHtml += renderDetailItem(t("monument_type3"), properties["Monument Type3"]);
  monumentHtml += renderDetailItem(t("monument_type4"), properties["Monument Type4"]);
  monumentHtml += renderDetailItem(t("monument_type5"), properties["Monument Type5"]);
  monumentHtml += renderDetailItem(t("monument_type6"), properties["Monument Type6"]);
  monumentHtml += renderDetailItem(t("religion1"), properties["Religion1"]);
  monumentHtml += renderDetailItem(t("religion2"), properties["Religion2"]);
  monumentHtml += renderDetailItem(t("religion3"), properties["Religion3"]);
  monumentHtml += renderDetailItem(t("descriptive_date"), properties["Descriptive Date"], true);
  monumentHtml += renderDetailItem(t("cultural_period1"), properties["Cultural Period1"]);
  monumentHtml += renderDetailItem(t("cultural_period2"), properties["Cultural Period2"]);
  monumentHtml += renderDetailItem(t("cultural_period3"), properties["Cultural Period3"]);
  monumentHtml += renderDetailItem(t("cultural_period4"), properties["Cultural Period4"]);
  monumentHtml += renderDetailItem(t("cultural_period5"), properties["Cultural Period5"]);
  monumentHtml += renderDetailItem(t("cultural_period6"), properties["Cultural Period6"]);
  monumentHtml += renderDetailItem(t("start_date"), properties["Start Date"]);
  monumentHtml += renderDetailItem(t("end_date"), properties["End Date"]);
  monumentHtml += renderDetailItem(t("primary_description"), properties["Primary Description"], true);
  monumentHtml += renderDetailItem(t("primary_description_en"), properties["Primary Description (English)"], true);
  monumentHtml += renderDetailItem(t("additional_notes"), properties["Additional Notes"], true);

  let adminHtml = "";
  adminHtml += renderDetailItem(t("primary_address"), properties["Primary Address"], true);
  adminHtml += renderDetailItem(t("longitude"), formatValue(properties["Longitude"], 6));
  adminHtml += renderDetailItem(t("latitude"), formatValue(properties["Latitude"], 6));
  adminHtml += renderDetailItem(t("altitude"), formatValue(properties["Altitude"]));
  adminHtml += renderDetailItem(t("location_confidence"), properties["Location Confidence"]);
  adminHtml += renderDetailItem(t("location_notes"), properties["Location Notes"], true);
  adminHtml += renderDetailItem(t("admin_subdivision_name1"), properties["Administrative Subdivision Name1"]);
  adminHtml += renderDetailItem(t("admin_subdivision_type1"), properties["Administrative Subdivision Type1"]);
  adminHtml += renderDetailItem(t("admin_subdivision_name2"), properties["Administrative Subdivision Name2"]);
  adminHtml += renderDetailItem(t("admin_subdivision_type2"), properties["Administrative Subdivision Type2"]);
  adminHtml += renderDetailItem(t("admin_subdivision_name3"), properties["Administrative Subdivision Name3"]);
  adminHtml += renderDetailItem(t("admin_subdivision_type3"), properties["Administrative Subdivision Type3"]);
  adminHtml += renderDetailItem(t("admin_subdivision_name4"), properties["Administrative Subdivision Name4"]);
  adminHtml += renderDetailItem(t("admin_subdivision_type4"), properties["Administrative Subdivision Type4"]);

  let measurementsHtml = "";
  measurementsHtml += renderDetailItem(t("measurement_value1"), properties["Measurement Value1"]);
  measurementsHtml += renderDetailItem(t("measurement_unit1"), properties["Measurement Unit1"]);
  measurementsHtml += renderDetailItem(t("measurement_type1"), properties["Measurement Type1"]);
  measurementsHtml += renderDetailItem(t("measurement_value2"), properties["Measurement Value2"]);
  measurementsHtml += renderDetailItem(t("measurement_unit2"), properties["Measurement Unit2"]);
  measurementsHtml += renderDetailItem(t("measurement_type2"), properties["Measurement Type2"]);
  measurementsHtml += renderDetailItem(t("measurement_value3"), properties["Measurement Value3"]);
  measurementsHtml += renderDetailItem(t("measurement_unit3"), properties["Measurement Unit3"]);
  measurementsHtml += renderDetailItem(t("measurement_type3"), properties["Measurement Type3"]);
  measurementsHtml += renderDetailItem(t("measurement_value4"), properties["Measurement Value4"]);
  measurementsHtml += renderDetailItem(t("measurement_unit4"), properties["Measurement Unit4"]);
  measurementsHtml += renderDetailItem(t("measurement_type4"), properties["Measurement Type4"]);

  let metadataHtml = "";
  metadataHtml += renderDetailItem(t("preferred_language"), properties["Preferred Language"]);
  metadataHtml += renderDetailItem(t("recorder"), properties["Recorder"]);
  metadataHtml += renderDetailItem(t("date_of_recording"), properties["Date of Recording"]);
  metadataHtml += renderDetailItem(t("tstamp"), properties["Tstamp"]);
  metadataHtml += renderDetailItem(t("master_id"), properties["MasterID"]);

  let relatedHtml = "";
  relatedHtml += renderDetailItem(t("monument_is_part_of"), properties["Monument is part of"], true);
  relatedHtml += renderDetailItem(t("monument_contains"), properties["Monument contains"], true);
  relatedHtml += renderDetailItem(t("monument_is_associated_with"), properties["Monument is associated with"], true);

  function sectionHasValues(fieldNames) {
    return fieldNames.some((fieldName) => hasValue(properties[fieldName]));
  }

  const basicHasValues = sectionHasValues([
    "Primary Name", "Primary Name (English)", "Other Names", "Country", "Region",
    "Classification", "CAAL_ID", "Internal Reference", "External Reference",
    "Designation", "World Heritage Site Name"
  ]);

  const monumentHasValues = sectionHasValues([
    "Monument Passport", "Monument Type1", "Monument Type2", "Monument Type3",
    "Monument Type4", "Monument Type5", "Monument Type6", "Religion1", "Religion2",
    "Religion3", "Descriptive Date", "Cultural Period1", "Cultural Period2",
    "Cultural Period3", "Cultural Period4", "Cultural Period5", "Cultural Period6",
    "Start Date", "End Date", "Primary Description",
    "Primary Description (English)", "Additional Notes"
  ]);

  const adminHasValues = sectionHasValues([
    "Primary Address", "Longitude", "Latitude", "Altitude", "Location Confidence",
    "Location Notes", "Administrative Subdivision Name1", "Administrative Subdivision Type1",
    "Administrative Subdivision Name2", "Administrative Subdivision Type2",
    "Administrative Subdivision Name3", "Administrative Subdivision Type3",
    "Administrative Subdivision Name4", "Administrative Subdivision Type4"
  ]);

  const measurementsHasValues = sectionHasValues([
    "Measurement Value1", "Measurement Unit1", "Measurement Type1",
    "Measurement Value2", "Measurement Unit2", "Measurement Type2",
    "Measurement Value3", "Measurement Unit3", "Measurement Type3",
    "Measurement Value4", "Measurement Unit4", "Measurement Type4"
  ]);

  const metadataHasValues = sectionHasValues([
    "Preferred Language", "Recorder", "Date of Recording", "Tstamp", "MasterID"
  ]);

  const relatedHasValues = sectionHasValues([
    "Monument is part of", "Monument contains", "Monument is associated with"
  ]);

  recordDetails.innerHTML = `
    <div class="record-title">
      <h3>${safeValue(properties["Primary Name"])}</h3>
      <p>${safeValue(properties["CAAL_ID"])}</p>
    </div>

    <div class="panel-actions">
      <button type="button" class="action-btn" id="editRecordBtn">
        ${t("edit_record")}
      </button>
    </div>

    <div class="group-stack">
      ${renderGroupBlock(t("basic_group"), basicHtml, basicHasValues)}
      ${renderGroupBlock(t("monument_group"), monumentHtml, monumentHasValues)}
      ${renderGroupBlock(t("administration_group"), adminHtml, adminHasValues)}
      ${renderGroupBlock(t("measurements_group"), measurementsHtml, measurementsHasValues)}
      ${renderGroupBlock(t("metadata_group"), metadataHtml, metadataHasValues)}
      ${renderGroupBlock(t("related_resources_group"), relatedHtml, relatedHasValues)}
    </div>
  `;

  document.getElementById("editRecordBtn").addEventListener("click", () => {
    isEditMode = true;
    renderRecordDetails(selectedProperties);
  });
}

function updateSelectedFeatureGeometryFromCoordinates() {
  if (!selectedProperties) {
    return false;
  }

  const lng = Number(getInputValue("Longitude"));
  const lat = Number(getInputValue("Latitude"));

  if (isNaN(lng) || isNaN(lat)) {
    alert("Please enter valid longitude and latitude values.");
    return false;
  }

  selectedProperties["Longitude"] = lng;
  selectedProperties["Latitude"] = lat;

  if (pendingNewFeature && pendingNewFeature.properties === selectedProperties) {
    pendingNewFeature.geometry = {
      type: "Point",
      coordinates: [lng, lat]
    };
    return true;
  }

  const matchingFeature = allFeatures.find(
    (feature) => feature.properties === selectedProperties
  );

  if (matchingFeature) {
    matchingFeature.geometry = {
      type: "Point",
      coordinates: [lng, lat]
    };
    drawFeatures(allFeatures);
  }

  return true;
}

function renderEditMode(properties) {
  recordDetails.innerHTML = `
    <div class="record-title">
      <h3>${safeValue(properties["Primary Name"])}</h3>
      <p>${safeValue(properties["CAAL_ID"])}</p>
    </div>

    <div class="panel-actions">
      <button type="button" class="action-btn primary" id="saveRecordBtn">${t("save")}</button>
      <button type="button" class="action-btn" id="cancelEditBtn">${t("cancel")}</button>
    </div>

    <div class="group-stack">

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("basic_group")}</span>
          </div>

          ${renderTextInput("Primary Name", "Primary Name", properties["Primary Name"], true)}
          ${renderTextInput("Primary Name (English)", t("primary_name_en"), properties["Primary Name (English)"], true)}
          ${renderTextInput("Other Names", t("other_names"), properties["Other Names"], true)}

          ${renderSelectInput("Country", t("country"), "country", properties["Country"])}
          ${renderTextInput("Region", t("region"), properties["Region"])}

          ${renderTextInput("Classification", t("classification"), properties["Classification"])}
          ${renderReadOnlyItem(t("caal_id"), properties["CAAL_ID"])}

          ${renderTextInput("Internal Reference", t("internal_reference"), properties["Internal Reference"])}
          ${renderTextInput("External Reference", t("external_reference"), properties["External Reference"])}

          ${renderTextInput("Designation", t("designation"), properties["Designation"])}
          ${renderTextInput("World Heritage Site Name", t("world_heritage_site_name"), properties["World Heritage Site Name"])}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("monument_group")}</span>
          </div>

          ${renderTextInput("Monument Passport", t("monument_passport"), properties["Monument Passport"], true)}

          ${renderSelectInput("Monument Type1", t("monument_type1"), "monument_type1", properties["Monument Type1"])}
          ${renderTextInput("Monument Type2", t("monument_type2"), properties["Monument Type2"])}
          ${renderTextInput("Monument Type3", t("monument_type3"), properties["Monument Type3"])}
          ${renderTextInput("Monument Type4", t("monument_type4"), properties["Monument Type4"])}
          ${renderTextInput("Monument Type5", t("monument_type5"), properties["Monument Type5"])}
          ${renderTextInput("Monument Type6", t("monument_type6"), properties["Monument Type6"])}

          ${renderTextInput("Religion1", t("religion1"), properties["Religion1"])}
          ${renderTextInput("Religion2", t("religion2"), properties["Religion2"])}
          ${renderTextInput("Religion3", t("religion3"), properties["Religion3"])}

          ${renderTextInput("Descriptive Date", t("descriptive_date"), properties["Descriptive Date"], true)}

          ${renderSelectInput("Cultural Period1", t("cultural_period1"), "cultural_period1", properties["Cultural Period1"])}
          ${renderTextInput("Cultural Period2", t("cultural_period2"), properties["Cultural Period2"])}
          ${renderTextInput("Cultural Period3", t("cultural_period3"), properties["Cultural Period3"])}
          ${renderTextInput("Cultural Period4", t("cultural_period4"), properties["Cultural Period4"])}
          ${renderTextInput("Cultural Period5", t("cultural_period5"), properties["Cultural Period5"])}
          ${renderTextInput("Cultural Period6", t("cultural_period6"), properties["Cultural Period6"])}

          ${renderReadOnlyItem(t("start_date"), properties["Start Date"])}
          ${renderReadOnlyItem(t("end_date"), properties["End Date"])}

          ${renderTextarea("Primary Description", t("primary_description"), properties["Primary Description"], true)}
          ${renderTextarea("Primary Description (English)", t("primary_description_en"), properties["Primary Description (English)"], true)}
          ${renderTextarea("Additional Notes", t("additional_notes"), properties["Additional Notes"], true)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("administration_group")}</span>
          </div>

          ${renderTextInput("Primary Address", t("primary_address"), properties["Primary Address"], true)}

          ${renderNumberInput("Longitude", t("longitude"), properties["Longitude"], "0.000001")}
          ${renderNumberInput("Latitude", t("latitude"), properties["Latitude"], "0.000001")}
          ${renderNumberInput("Altitude", t("altitude"), properties["Altitude"], "any")}
          ${renderTextInput("Location Confidence", t("location_confidence"), properties["Location Confidence"])}

          <div class="detail-item full-width">
            <div class="panel-actions">
              <button type="button" class="action-btn" id="setLocationBtn">${t("set_location_from_coordinates")}</button>
              <button type="button" class="action-btn" id="pickLocationBtn">Pick location on map</button>
            </div>
          </div>

          ${renderTextarea("Location Notes", t("location_notes"), properties["Location Notes"], true)}

          ${renderTextInput("Administrative Subdivision Name1", t("admin_subdivision_name1"), properties["Administrative Subdivision Name1"])}
          ${renderTextInput("Administrative Subdivision Type1", t("admin_subdivision_type1"), properties["Administrative Subdivision Type1"])}
          ${renderTextInput("Administrative Subdivision Name2", t("admin_subdivision_name2"), properties["Administrative Subdivision Name2"])}
          ${renderTextInput("Administrative Subdivision Type2", t("admin_subdivision_type2"), properties["Administrative Subdivision Type2"])}
          ${renderTextInput("Administrative Subdivision Name3", t("admin_subdivision_name3"), properties["Administrative Subdivision Name3"])}
          ${renderTextInput("Administrative Subdivision Type3", t("admin_subdivision_type3"), properties["Administrative Subdivision Type3"])}
          ${renderTextInput("Administrative Subdivision Name4", t("admin_subdivision_name4"), properties["Administrative Subdivision Name4"])}
          ${renderTextInput("Administrative Subdivision Type4", t("admin_subdivision_type4"), properties["Administrative Subdivision Type4"])}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("measurements_group")}</span>
          </div>

          ${renderNumberInput("Measurement Value1", t("measurement_value1"), properties["Measurement Value1"])}
          ${renderTextInput("Measurement Unit1", t("measurement_unit1"), properties["Measurement Unit1"])}
          ${renderTextInput("Measurement Type1", t("measurement_type1"), properties["Measurement Type1"])}

          ${renderNumberInput("Measurement Value2", t("measurement_value2"), properties["Measurement Value2"])}
          ${renderTextInput("Measurement Unit2", t("measurement_unit2"), properties["Measurement Unit2"])}
          ${renderTextInput("Measurement Type2", t("measurement_type2"), properties["Measurement Type2"])}

          ${renderNumberInput("Measurement Value3", t("measurement_value3"), properties["Measurement Value3"])}
          ${renderTextInput("Measurement Unit3", t("measurement_unit3"), properties["Measurement Unit3"])}
          ${renderTextInput("Measurement Type3", t("measurement_type3"), properties["Measurement Type3"])}

          ${renderNumberInput("Measurement Value4", t("measurement_value4"), properties["Measurement Value4"])}
          ${renderTextInput("Measurement Unit4", t("measurement_unit4"), properties["Measurement Unit4"])}
          ${renderTextInput("Measurement Type4", t("measurement_type4"), properties["Measurement Type4"])}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("metadata_group")}</span>
          </div>

          ${renderReadOnlyItem(t("preferred_language"), properties["Preferred Language"])}
          ${renderReadOnlyItem(t("recorder"), properties["Recorder"])}
          ${renderTextInput("Date of Recording", t("date_of_recording"), properties["Date of Recording"])}
          ${renderReadOnlyItem(t("tstamp"), properties["Tstamp"])}
          ${renderTextInput("MasterID", t("master_id"), properties["MasterID"])}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${t("related_resources_group")}</span>
          </div>

          ${renderTextInput("Monument is part of", t("monument_is_part_of"), properties["Monument is part of"], true)}
          ${renderTextInput("Monument contains", t("monument_contains"), properties["Monument contains"], true)}
          ${renderTextInput("Monument is associated with", t("monument_is_associated_with"), properties["Monument is associated with"], true)}
        </div>
      </div>
    </div>
  `;

  document.getElementById("saveRecordBtn").addEventListener("click", () => {
    selectedProperties["Primary Name"] = getInputValue("Primary Name");
    selectedProperties["Primary Name (English)"] = getInputValue("Primary Name (English)");
    selectedProperties["Other Names"] = getInputValue("Other Names");
    selectedProperties["Country"] = getInputValue("Country");
    selectedProperties["Region"] = getInputValue("Region");
    selectedProperties["Classification"] = getInputValue("Classification");
    selectedProperties["Internal Reference"] = getInputValue("Internal Reference");
    selectedProperties["External Reference"] = getInputValue("External Reference");
    selectedProperties["Designation"] = getInputValue("Designation");
    selectedProperties["World Heritage Site Name"] = getInputValue("World Heritage Site Name");

    selectedProperties["Monument Passport"] = getInputValue("Monument Passport");
    selectedProperties["Monument Type1"] = getInputValue("Monument Type1");
    selectedProperties["Monument Type2"] = getInputValue("Monument Type2");
    selectedProperties["Monument Type3"] = getInputValue("Monument Type3");
    selectedProperties["Monument Type4"] = getInputValue("Monument Type4");
    selectedProperties["Monument Type5"] = getInputValue("Monument Type5");
    selectedProperties["Monument Type6"] = getInputValue("Monument Type6");

    selectedProperties["Religion1"] = getInputValue("Religion1");
    selectedProperties["Religion2"] = getInputValue("Religion2");
    selectedProperties["Religion3"] = getInputValue("Religion3");
    selectedProperties["Descriptive Date"] = getInputValue("Descriptive Date");

    selectedProperties["Cultural Period1"] = getInputValue("Cultural Period1");
    selectedProperties["Cultural Period2"] = getInputValue("Cultural Period2");
    selectedProperties["Cultural Period3"] = getInputValue("Cultural Period3");
    selectedProperties["Cultural Period4"] = getInputValue("Cultural Period4");
    selectedProperties["Cultural Period5"] = getInputValue("Cultural Period5");
    selectedProperties["Cultural Period6"] = getInputValue("Cultural Period6");

    selectedProperties["Primary Description"] = getInputValue("Primary Description");
    selectedProperties["Primary Description (English)"] = getInputValue("Primary Description (English)");
    selectedProperties["Additional Notes"] = getInputValue("Additional Notes");

    selectedProperties["Primary Address"] = getInputValue("Primary Address");
    selectedProperties["Longitude"] = getInputValue("Longitude");
    selectedProperties["Latitude"] = getInputValue("Latitude");
    selectedProperties["Altitude"] = getInputValue("Altitude");
    selectedProperties["Location Confidence"] = getInputValue("Location Confidence");
    selectedProperties["Location Notes"] = getInputValue("Location Notes");

    selectedProperties["Administrative Subdivision Name1"] = getInputValue("Administrative Subdivision Name1");
    selectedProperties["Administrative Subdivision Type1"] = getInputValue("Administrative Subdivision Type1");
    selectedProperties["Administrative Subdivision Name2"] = getInputValue("Administrative Subdivision Name2");
    selectedProperties["Administrative Subdivision Type2"] = getInputValue("Administrative Subdivision Type2");
    selectedProperties["Administrative Subdivision Name3"] = getInputValue("Administrative Subdivision Name3");
    selectedProperties["Administrative Subdivision Type3"] = getInputValue("Administrative Subdivision Type3");
    selectedProperties["Administrative Subdivision Name4"] = getInputValue("Administrative Subdivision Name4");
    selectedProperties["Administrative Subdivision Type4"] = getInputValue("Administrative Subdivision Type4");

    selectedProperties["Measurement Value1"] = getInputValue("Measurement Value1");
    selectedProperties["Measurement Unit1"] = getInputValue("Measurement Unit1");
    selectedProperties["Measurement Type1"] = getInputValue("Measurement Type1");
    selectedProperties["Measurement Value2"] = getInputValue("Measurement Value2");
    selectedProperties["Measurement Unit2"] = getInputValue("Measurement Unit2");
    selectedProperties["Measurement Type2"] = getInputValue("Measurement Type2");
    selectedProperties["Measurement Value3"] = getInputValue("Measurement Value3");
    selectedProperties["Measurement Unit3"] = getInputValue("Measurement Unit3");
    selectedProperties["Measurement Type3"] = getInputValue("Measurement Type3");
    selectedProperties["Measurement Value4"] = getInputValue("Measurement Value4");
    selectedProperties["Measurement Unit4"] = getInputValue("Measurement Unit4");
    selectedProperties["Measurement Type4"] = getInputValue("Measurement Type4");

    selectedProperties["Date of Recording"] = getInputValue("Date of Recording");
    selectedProperties["MasterID"] = getInputValue("MasterID");

    selectedProperties["Monument is part of"] = getInputValue("Monument is part of");
    selectedProperties["Monument contains"] = getInputValue("Monument contains");
    selectedProperties["Monument is associated with"] = getInputValue("Monument is associated with");

    if (pendingNewFeature && pendingNewFeature.properties === selectedProperties) {
      allFeatures.push(pendingNewFeature);
      visibleFeatures = allFeatures;
      pendingNewFeature = null;
      drawFeatures(visibleFeatures);
      renderResultsList(visibleFeatures);
    }

    isEditMode = false;
    renderRecordDetails(selectedProperties);
  });

  document.getElementById("cancelEditBtn").addEventListener("click", () => {
    if (pendingNewFeature && pendingNewFeature.properties === selectedProperties) {
      pendingNewFeature = null;
      selectedProperties = null;
      isEditMode = false;
      exitAddMode();

      if (recordDetails) {
        recordDetails.innerHTML = `
          <div class="empty-state">
            <p>${t("no_record_selected")}</p>
          </div>
        `;
      }
      return;
    }

    isEditMode = false;
    renderRecordDetails(selectedProperties);
  });

  document.getElementById("setLocationBtn").addEventListener("click", () => {
    const ok = updateSelectedFeatureGeometryFromCoordinates();
    if (ok) {
      alert("Location updated on map.");
    }
  });

  document.getElementById("pickLocationBtn").addEventListener("click", () => {
    enterAddMode();
  });
}

// --------------------------------------------------------
// Add-record helpers
// --------------------------------------------------------
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

// --------------------------------------------------------
// Events
// --------------------------------------------------------
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

// language-triggered rerender for this page
document.addEventListener("app:languageChanged", () => {
  renderResultsList(visibleFeatures);

  if (selectedProperties) {
    renderRecordDetails(selectedProperties);
  } else if (recordDetails) {
    recordDetails.innerHTML = `
      <div class="empty-state">
        <p>${t("no_record_selected")}</p>
      </div>
    `;
  }
});

// --------------------------------------------------------
// Initial load
// --------------------------------------------------------
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
