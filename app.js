// These are labels for the app UI itself, not the record values stored in data.
const translations = {
  en: {
    app_title: "CAAL App Prototype",
    app_subtitle: "Kazakhstan workspace prototype",
    language_label: "Language",
    record_details: "Record Details",
    click_prompt: "Click a monument on the map",
    no_record_selected: "No record selected yet.",
    basic_group: "Basic",
    /* monument table fields */
    monument_group: "Monument",
    administration_group: "Administration",
    measurements_group: "Measurements",
    metadata_group: "Metadata",
    related_resources_group: "Related Resources",
    primary_name_en: "Primary Name (English)",
    other_names: "Other Names",
    region: "Region",
    caal_id: "CAAL_ID",
    internal_reference: "Internal Reference",
    external_reference: "External Reference",
    designation: "Designation",
    world_heritage_site_name: "World Heritage Site Name",
    monument_is_part_of: "Monument is part of",
    monument_contains: "Monument contains",
    monument_is_associated_with: "Monument is associated with",
    monument_passport: "Monument Passport",
    monument_type2: "Monument Type 2",
    monument_type3: "Monument Type 3",
    monument_type4: "Monument Type 4",
    monument_type5: "Monument Type 5",
    monument_type6: "Monument Type 6",
    religion1: "Religion 1",
    religion2: "Religion 2",
    religion3: "Religion 3",
    descriptive_date: "Descriptive Date",
    cultural_period2: "Cultural Period 2",
    cultural_period3: "Cultural Period 3",
    cultural_period4: "Cultural Period 4",
    cultural_period5: "Cultural Period 5",
    cultural_period6: "Cultural Period 6",
    start_date: "Start Date",
    end_date: "End Date",
    primary_description: "Primary Description",
    primary_description_en: "Primary Description (English)",
    additional_notes: "Additional Notes",
    longitude: "Longitude",
    latitude: "Latitude",
    altitude: "Altitude",
    location_confidence: "Location Confidence",
    location_notes: "Location Notes",
    primary_address: "Primary Address",
    admin_subdivision_name1: "Administrative Subdivision Name 1",
    admin_subdivision_type1: "Administrative Subdivision Type 1",
    admin_subdivision_name2: "Administrative Subdivision Name 2",
    admin_subdivision_type2: "Administrative Subdivision Type 2",
    admin_subdivision_name3: "Administrative Subdivision Name 3",
    admin_subdivision_type3: "Administrative Subdivision Type 3",
    admin_subdivision_name4: "Administrative Subdivision Name 4",
    admin_subdivision_type4: "Administrative Subdivision Type 4",
    measurement_value1: "Measurement Value 1",
    measurement_unit1: "Measurement Unit 1",
    measurement_type1: "Measurement Type 1",
    measurement_value2: "Measurement Value 2",
    measurement_unit2: "Measurement Unit 2",
    measurement_type2: "Measurement Type 2",
    measurement_value3: "Measurement Value 3",
    measurement_unit3: "Measurement Unit 3",
    measurement_type3: "Measurement Type 3",
    measurement_value4: "Measurement Value 4",
    measurement_unit4: "Measurement Unit 4",
    measurement_type4: "Measurement Type 4",
    preferred_language: "Preferred Language",
    date_of_recording: "Date of Recording",
    tstamp: "Tstamp",
    master_id: "MasterID",
    no_data_in_section: "No populated fields in this section.",
    /* editing */
    edit_record: "Edit record",
    save: "Save",
    cancel: "Cancel"
  },
  ru: {
    app_title: "Прототип приложения CAAL",
    app_subtitle: "Прототип рабочего пространства Казахстана",
    language_label: "Язык",
    record_details: "Детали записи",
    click_prompt: "Нажмите на памятник на карте",
    no_record_selected: "Запись пока не выбрана.",
    country: "Страна",
    classification: "Классификация",
    monument_type1: "Тип памятника 1",
    cultural_period1: "Культурный период 1",
    recorder: "Составитель",
    notes: "Примечания",
    edit_record: "Редактировать запись",
    save: "Сохранить",
    cancel: "Отмена"
  },
  zh: {
    app_title: "CAAL 应用原型",
    app_subtitle: "哈萨克斯坦工作区原型",
    language_label: "语言",
    record_details: "记录详情",
    click_prompt: "点击地图上的遗址",
    no_record_selected: "尚未选择记录。",
    country: "国家",
    classification: "分类",
    monument_type1: "遗址类型 1",
    cultural_period1: "文化时期 1",
    recorder: "记录者",
    notes: "备注",
    edit_record: "编辑记录",
    save: "保存",
    cancel: "取消"
  }
};

// These are for stored lookup keys in the data, such as "burial_site" or "bronze_age".
const lookupLabels = {
  country: {
    kazakhstan: {
      en: "Kazakhstan",
      ru: "Казахстан",
      zh: "哈萨克斯坦"
    }
  },
  monument_type1: {
    burial_site: {
      en: "Burial site",
      ru: "Погребальный памятник",
      zh: "墓葬遗址"
    },
    settlement: {
      en: "Settlement",
      ru: "Поселение",
      zh: "聚落"
    },
    fortification: {
      en: "Fortification",
      ru: "Укрепление",
      zh: "堡垒"
    }
  },
  cultural_period1: {
    bronze_age: {
      en: "Bronze Age",
      ru: "Бронзовый век",
      zh: "青铜时代"
    },
    early_iron_age: {
      en: "Early Iron Age",
      ru: "Ранний железный век",
      zh: "早期铁器时代"
    },
    medieval: {
      en: "Medieval",
      ru: "Средневековье",
      zh: "中世纪"
    }
  }
};


// App state stuff
// currentLang = selected interface language
// selectedProperties = currently selected record
// isEditMode = whether the side panel is in edit mode
let currentLang = "en";
let selectedProperties = null;
let isEditMode = false;
// stores the full loaded feature list and lets you remove and redraw map layer when filtering
let allFeatures = [];
let geoJsonLayer = null;
// for adding records
let isAddMode = false;
let pendingNewFeature = null;

//  HTML page elements 
const languageSelect = document.getElementById("languageSelect");
const recordDetails = document.getElementById("recordDetails");
const siteSearch = document.getElementById("siteSearch");
const addPointBtn = document.getElementById("addPointBtn");
const cancelAddBtn = document.getElementById("cancelAddBtn");

//  the Leaflet map
const map = L.map("map").setView([48.0, 67.0], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// SEARCH NORMALISER - lowercases text safely for searching
function searchableText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).toLowerCase();
}

// FEATURE SEARCH MATCH - sets which fields will be searchable
function featureMatchesSearch(feature, query) {
  const props = feature.properties;
  const q = query.trim().toLowerCase();

  if (!q) {
    return true;
  }

  const haystack = [
    props["Primary Name"],
    props["Primary Name (English)"],
    props["CAAL_ID"],
    props["Classification"],
    props["Monument Type1"],
    props["Region"],
    props["Country"],
    props["Cultural Period1"]
  ]
    .map(searchableText)
    .join(" ");

  return haystack.includes(q);
}

// DRAW FEATURES ON MAP - clears old layer and redraws current set
function drawFeatures(features) {
  if (geoJsonLayer) {
    map.removeLayer(geoJsonLayer);
  }

  geoJsonLayer = L.geoJSON(
    { type: "FeatureCollection", features },
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

//  translation helper for UI labels
// Example: t("country") -> "Country" or "Страна"
function t(key) {
  return translations[currentLang]?.[key] || translations.en[key] || key;
}

// generic safe display helper
// Prevents blank/null values appearing badly
function safeValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }
  return value;
}

//  Lookup display helper
// Converts stored keys into translated labels
// Example: "burial_site" -> "Погребальный памятник" in Russian
function displayLookup(fieldName, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return "Not recorded";
  }

  const fieldLookup = lookupLabels[fieldName];
  if (!fieldLookup) {
    return rawValue;
  }

  const entry = fieldLookup[rawValue];
  if (!entry) {
    return rawValue;
  }

  return entry[currentLang] || entry.en || rawValue;
}

// Build dropdown options for editable lookup fields
// This turns the lookup dictionary into <option> values
function getLookupOptions(fieldName) {
  const fieldLookup = lookupLabels[fieldName];
  if (!fieldLookup) {
    return [];
  }

  return Object.entries(fieldLookup).map(([value, labels]) => ({
    value,
    label: labels[currentLang] || labels.en || value
  }));
}

// ==============================
// renderdisplay helper: test whether a field has a real value, returns true only if the field is not null/blank
function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

// renderdisplay helper: format numbers for display - used for longitude, latitude, altitude
function formatValue(value, decimals = null) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }

  if (decimals !== null && !isNaN(value)) {
    return Number(value).toFixed(decimals);
  }

  return value;
}

// renderdisplay helper: create one display card
// label = visible field label
// value = field value from properties
// fullWidth = whether the card should span both columns
function renderDetailItem(label, value, fullWidth = false) {
  const fullWidthClass = fullWidth ? " full-width" : "";

  return `
    <div class="detail-item${fullWidthClass}">
      <span class="detail-label">${label}</span>
      <div class="detail-value">${safeValue(value)}</div>
    </div>
  `;
}

// ADD MODE UI STATE - keeps button visibility in sync with whether the map is waiting for a new point click
function updateAddModeUI() {
  if (isAddMode) {
    addPointBtn.textContent = "Click map to place point";
    cancelAddBtn.hidden = false;
    map.getContainer().style.cursor = "crosshair";
  } else {
    addPointBtn.textContent = "Add point";
    cancelAddBtn.hidden = true;
    map.getContainer().style.cursor = "";
  }
}

// ENTER ADD MODE - user is now expected to click the map
function enterAddMode() {
  isAddMode = true;
  updateAddModeUI();
}

// EXIT ADD MODE - cancels point creation mode
function exitAddMode() {
  isAddMode = false;
  updateAddModeUI();
}

// CREATE A NEW TEMPORARY FEATURE - This is only in-memory for now
function makeNewPointFeature(latlng) {
  const lng = Number(latlng.lng.toFixed(6));
  const lat = Number(latlng.lat.toFixed(6));

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
      "Longitude": lng,
      "Latitude": lat,
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
    geometry: {
      type: "Point",
      coordinates: [lng, lat]
    }
  };
}

// DISPLAY MODE (read-only) in side panel
// Keeps the same section names as existing form: Basic / Monument / Administration / Measurements / Metadata / Related Resources
function renderDisplayMode(properties) {
  // Build the HTML for each section - contain the cards that will appear under each section header.
  // BASIC
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

  // MONUMENT
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

  // ADMINISTRATION
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

  // MEASUREMENTS
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

  // METADATA
  let metadataHtml = "";

  metadataHtml += renderDetailItem(t("preferred_language"), properties["Preferred Language"]);
  metadataHtml += renderDetailItem(t("recorder"), properties["Recorder"]);
  metadataHtml += renderDetailItem(t("date_of_recording"), properties["Date of Recording"]);
  metadataHtml += renderDetailItem(t("tstamp"), properties["Tstamp"]);
  metadataHtml += renderDetailItem(t("master_id"), properties["MasterID"]);

  // RELATED RESOURCES
  let relatedHtml = "";

  relatedHtml += renderDetailItem(t("monument_is_part_of"), properties["Monument is part of"], true);
  relatedHtml += renderDetailItem(t("monument_contains"), properties["Monument contains"], true);
  relatedHtml += renderDetailItem(t("monument_is_associated_with"), properties["Monument is associated with"], true);

  // 2. Helper to test whether a whole section has any actual populated values in the current record.
  // This sits INSIDE renderDisplayMode because it uses the current "properties".
  function sectionHasValues(fieldNames) {
    return fieldNames.some((fieldName) => hasValue(properties[fieldName]));
  }

  // For each section, define whether it contains any real  data. These constants also belong INSIDE
  // renderDisplayMode, after the section field names are known and before final HTML is assembled.
  const basicHasValues = sectionHasValues([
    "Primary Name",
    "Primary Name (English)",
    "Other Names",
    "Country",
    "Region",
    "Classification",
    "CAAL_ID",
    "Internal Reference",
    "External Reference",
    "Designation",
    "World Heritage Site Name"
  ]);

  const monumentHasValues = sectionHasValues([
    "Monument Passport",
    "Monument Type1",
    "Monument Type2",
    "Monument Type3",
    "Monument Type4",
    "Monument Type5",
    "Monument Type6",
    "Religion1",
    "Religion2",
    "Religion3",
    "Descriptive Date",
    "Cultural Period1",
    "Cultural Period2",
    "Cultural Period3",
    "Cultural Period4",
    "Cultural Period5",
    "Cultural Period6",
    "Start Date",
    "End Date",
    "Primary Description",
    "Primary Description (English)",
    "Additional Notes"
  ]);

  const adminHasValues = sectionHasValues([
    "Primary Address",
    "Longitude",
    "Latitude",
    "Altitude",
    "Location Confidence",
    "Location Notes",
    "Administrative Subdivision Name1",
    "Administrative Subdivision Type1",
    "Administrative Subdivision Name2",
    "Administrative Subdivision Type2",
    "Administrative Subdivision Name3",
    "Administrative Subdivision Type3",
    "Administrative Subdivision Name4",
    "Administrative Subdivision Type4"
  ]);

  const measurementsHasValues = sectionHasValues([
    "Measurement Value1",
    "Measurement Unit1",
    "Measurement Type1",
    "Measurement Value2",
    "Measurement Unit2",
    "Measurement Type2",
    "Measurement Value3",
    "Measurement Unit3",
    "Measurement Type3",
    "Measurement Value4",
    "Measurement Unit4",
    "Measurement Type4"
  ]);

  const metadataHasValues = sectionHasValues([
    "Preferred Language",
    "Recorder",
    "Date of Recording",
    "Tstamp",
    "MasterID"
  ]);

  const relatedHasValues = sectionHasValues([
    "Monument is part of",
    "Monument contains",
    "Monument is associated with"
  ]);

  // Final HTML for the right-hand panel
  // This is where all section headers and their content are assembled together.
  // If a section has no values, show one compact message instead of a wall of empty cards.
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

    <div class="detail-grid">
      <!-- BASIC -->
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${t("basic_group")}</span>
      </div>
      ${basicHasValues ? basicHtml : `<div class="section-empty">${t("no_data_in_section")}</div>`}

      <!-- MONUMENT -->
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${t("monument_group")}</span>
      </div>
      ${monumentHasValues ? monumentHtml : `<div class="section-empty">${t("no_data_in_section")}</div>`}

      <!-- ADMINISTRATION -->
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${t("administration_group")}</span>
      </div>
      ${adminHasValues ? adminHtml : `<div class="section-empty">${t("no_data_in_section")}</div>`}

      <!-- MEASUREMENTS -->
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${t("measurements_group")}</span>
      </div>
      ${measurementsHasValues ? measurementsHtml : `<div class="section-empty">${t("no_data_in_section")}</div>`}

      <!-- METADATA -->
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${t("metadata_group")}</span>
      </div>
      ${metadataHasValues ? metadataHtml : `<div class="section-empty">${t("no_data_in_section")}</div>`}

      <!-- RELATED RESOURCES -->
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${t("related_resources_group")}</span>
      </div>
      ${relatedHasValues ? relatedHtml : `<div class="section-empty">${t("no_data_in_section")}</div>`}
    </div>
  `;

  // 5. Attach the Edit button event - must happen AFTER the button exists in the HTML
  document.getElementById("editRecordBtn").addEventListener("click", () => {
    isEditMode = true;
    renderRecordDetails(selectedProperties);
  });
}

// edit HELPER: make a safe DOM id from a field name
// Example: "Primary Name" -> "fld_primary_name" OR "Primary Name (English)" -> "fld_primary_name_english"
function makeFieldId(fieldName) {
  return "fld_" + fieldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// HELPER: read current value from an input/select/textarea, using the real field name
function getInputValue(fieldName) {
  const inputId = makeFieldId(fieldName);
  const el = document.getElementById(inputId);
  return el ? el.value : "";
}

// EDIT HELPER: text input
function renderTextInput(fieldName, label, value, fullWidth = false) {
  const inputId = makeFieldId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <input type="text" id="${inputId}" class="form-control" value="${value ?? ""}">
    </div>
  `;
}

// EDIT HELPER: textarea
function renderTextarea(fieldName, label, value, fullWidth = true) {
  const inputId = makeFieldId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <textarea id="${inputId}" class="form-control" rows="4">${value ?? ""}</textarea>
    </div>
  `;
}

// EDIT HELPER: number input
function renderNumberInput(fieldName, label, value, step = "any", fullWidth = false) {
  const inputId = makeFieldId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <input type="number" id="${inputId}" class="form-control" step="${step}" value="${value ?? ""}">
    </div>
  `;
}

// EDIT HELPER: read-only display, Used for system or derived fields
function renderReadOnlyItem(label, value, fullWidth = false) {
  const fullWidthClass = fullWidth ? " full-width" : "";

  return `
    <div class="detail-item${fullWidthClass}">
      <span class="detail-label">${label}</span>
      <div class="detail-value">${safeValue(value)}</div>
    </div>
  `;
}

// EDIT HELPER: dropdown, fieldKey = lookupLabels key, propertyValue = currently stored value
function renderSelectInput(fieldName, label, fieldKey, propertyValue, fullWidth = false) {
  const inputId = makeFieldId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  const options = getLookupOptions(fieldKey)
    .map((option) => {
      const selected = option.value === propertyValue ? "selected" : "";
      return `<option value="${option.value}" ${selected}>${option.label}</option>`;
    })
    .join("");

  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <select id="${inputId}" class="form-control">
        <option value="">--</option>
        ${options}
      </select>
    </div>
  `;
}
// edit mode in side panel
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

    <div class="detail-grid">

      <!-- BASIC -->
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

      <!-- MONUMENT -->
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

      <!-- ADMINISTRATION -->
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${t("administration_group")}</span>
      </div>

      ${renderTextInput("Primary Address", t("primary_address"), properties["Primary Address"], true)}

      ${renderNumberInput("Longitude", t("longitude"), properties["Longitude"], "0.000001")}
      ${renderNumberInput("Latitude", t("latitude"), properties["Latitude"], "0.000001")}
      ${renderNumberInput("Altitude", t("altitude"), properties["Altitude"], "any")}
      ${renderTextInput("Location Confidence", t("location_confidence"), properties["Location Confidence"])}

      ${renderTextarea("Location Notes", t("location_notes"), properties["Location Notes"], true)}

      ${renderTextInput("Administrative Subdivision Name1", t("admin_subdivision_name1"), properties["Administrative Subdivision Name1"])}
      ${renderTextInput("Administrative Subdivision Type1", t("admin_subdivision_type1"), properties["Administrative Subdivision Type1"])}
      ${renderTextInput("Administrative Subdivision Name2", t("admin_subdivision_name2"), properties["Administrative Subdivision Name2"])}
      ${renderTextInput("Administrative Subdivision Type2", t("admin_subdivision_type2"), properties["Administrative Subdivision Type2"])}
      ${renderTextInput("Administrative Subdivision Name3", t("admin_subdivision_name3"), properties["Administrative Subdivision Name3"])}
      ${renderTextInput("Administrative Subdivision Type3", t("admin_subdivision_type3"), properties["Administrative Subdivision Type3"])}
      ${renderTextInput("Administrative Subdivision Name4", t("admin_subdivision_name4"), properties["Administrative Subdivision Name4"])}
      ${renderTextInput("Administrative Subdivision Type4", t("admin_subdivision_type4"), properties["Administrative Subdivision Type4"])}

      <!-- MEASUREMENTS -->
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

      <!-- METADATA -->
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${t("metadata_group")}</span>
      </div>

      ${renderReadOnlyItem(t("preferred_language"), properties["Preferred Language"])}
      ${renderReadOnlyItem(t("recorder"), properties["Recorder"])}
      ${renderTextInput("Date of Recording", t("date_of_recording"), properties["Date of Recording"])}
      ${renderReadOnlyItem(t("tstamp"), properties["Tstamp"])}
      ${renderTextInput("MasterID", t("master_id"), properties["MasterID"])}

      <!-- RELATED RESOURCES -->
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${t("related_resources_group")}</span>
      </div>

      ${renderTextInput("Monument is part of", t("monument_is_part_of"), properties["Monument is part of"], true)}
      ${renderTextInput("Monument contains", t("monument_contains"), properties["Monument contains"], true)}
      ${renderTextInput("Monument is associated with", t("monument_is_associated_with"), properties["Monument is associated with"], true)}

    </div>
  `;

  // Save current editable values back into the selected record
  document.getElementById("saveRecordBtn").addEventListener("click", () => {
    // BASIC
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

    // MONUMENT
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

    // Start Date / End Date intentionally not editable here

    selectedProperties["Primary Description"] = getInputValue("Primary Description");
    selectedProperties["Primary Description (English)"] = getInputValue("Primary Description (English)");
    selectedProperties["Additional Notes"] = getInputValue("Additional Notes");

    // ADMINISTRATION
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

    // MEASUREMENTS
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

    // METADATA
    // Preferred Language and Recorder intentionally read-only
    selectedProperties["Date of Recording"] = getInputValue("Date of Recording");
    selectedProperties["MasterID"] = getInputValue("MasterID");

    // RELATED RESOURCES
    selectedProperties["Monument is part of"] = getInputValue("Monument is part of");
    selectedProperties["Monument contains"] = getInputValue("Monument contains");
    selectedProperties["Monument is associated with"] = getInputValue("Monument is associated with");

    isEditMode = false;
    renderRecordDetails(selectedProperties);
  });

  // Cancel edit mode without saving changes
  document.getElementById("cancelEditBtn").addEventListener("click", () => {
    isEditMode = false;
    renderRecordDetails(selectedProperties);
  });
}

// apply current language to the interface
// Re-renders current selected record too
function applyLanguage() {
  document.documentElement.lang = currentLang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  if (selectedProperties) {
    renderRecordDetails(selectedProperties);
  } else {
    recordDetails.innerHTML = `
      <div class="empty-state">
        <p>${t("no_record_selected")}</p>
      </div>
    `;
  }
}


// main side-panel - chooses display mode or edit mode
function renderRecordDetails(properties) {
  selectedProperties = properties;

  if (isEditMode) {
    renderEditMode(properties);
  } else {
    renderDisplayMode(properties);
  }
}

//  style for GeoJSON points
function pointStyle(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 7,
    weight: 1,
    opacity: 1,
    fillOpacity: 0.85
  });
}

// language dropdown event
languageSelect.addEventListener("change", (event) => {
  currentLang = event.target.value;
  applyLanguage();
});

// ADD POINT BUTTON - Toggle into add mode
addPointBtn.addEventListener("click", () => {
  if (isAddMode) {
    exitAddMode();
  } else {
    enterAddMode();
  }
});

// CANCEL ADD BUTTON - explicit cancel while in add mode
cancelAddBtn.addEventListener("click", () => {
  exitAddMode();
});

// ESC KEY CANCELS ADD MODE
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isAddMode) {
    exitAddMode();
  }
});

// MAP CLICK FOR NEW POINT CREATION - only active while in add mode
map.on("click", (event) => {
  if (!isAddMode) {
    return;
  }

  // Create a new temporary feature
  const newFeature = makeNewPointFeature(event.latlng);

  // Keep a reference if you want to distinguish it later
  pendingNewFeature = newFeature;

  // Add it to the in-memory feature list
  allFeatures.push(newFeature);

  // Redraw map so the new point appears
  drawFeatures(allFeatures);

  // Exit add mode after placing the point
  exitAddMode();

  // Open the new record in edit mode immediately
  isEditMode = true;
  renderRecordDetails(newFeature.properties);
});

//
updateAddModeUI();

//  load local GeoJSON data, then create map layer and click behaviour
fetch("./data/monuments_kaz_sample.geojson")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load GeoJSON: ${response.status}`);
    }
    return response.json();
  })
  .then((geojson) => {
    // Store all features in memory for later searching/filtering
    allFeatures = geojson.features;

    // Draw them on the map using the reusable draw function
    drawFeatures(allFeatures);

    // Apply interface language after the page data is ready
    applyLanguage();
  })
  .catch((error) => {
    console.error(error);
    recordDetails.innerHTML = `
      <div class="empty-state">
        <p>Could not load sample data.</p>
        <p>${error.message}</p>
      </div>
    `;
  });
