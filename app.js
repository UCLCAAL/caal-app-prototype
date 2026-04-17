// These are labels for the app UI itself, not the record values stored in data.
const translations = {
  en: {
    app_title: "CAAL App Prototype",
    app_subtitle: "Kazakhstan workspace prototype",
    language_label: "Language",
    record_details: "Record Details",
    click_prompt: "Click a monument on the map",
    no_record_selected: "No record selected yet.",
    country: "Country",
    classification: "Classification",
    monument_type1: "Monument Type 1",
    cultural_period1: "Cultural Period 1",
    recorder: "Recorder",
    notes: "Notes",
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

//  HTML page elements 
const languageSelect = document.getElementById("languageSelect");
const recordDetails = document.getElementById("recordDetails");
const siteSearch = document.getElementById("siteSearch");

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

//  read-only display mode in side panel
function renderDisplayMode(properties) {
  recordDetails.innerHTML = `
    <div class="record-title">
      <h3>${safeValue(properties.primary_name)}</h3>
      <p>${safeValue(properties.caal_id)}</p>
    </div>

    <div class="panel-actions">
      <button type="button" class="action-btn" id="editRecordBtn">
        ${t("edit_record")}
      </button>
    </div>

    <div class="detail-grid">
      <div class="detail-item">
        <span class="detail-label">${t("country")}</span>
        <div class="detail-value">${displayLookup("country", properties.country)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("classification")}</span>
        <div class="detail-value">${safeValue(properties.classification)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("monument_type1")}</span>
        <div class="detail-value">${displayLookup("monument_type1", properties.monument_type1)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("cultural_period1")}</span>
        <div class="detail-value">${displayLookup("cultural_period1", properties.cultural_period1)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("recorder")}</span>
        <div class="detail-value">${safeValue(properties.recorder)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("notes")}</span>
        <div class="detail-value">${safeValue(properties.notes)}</div>
      </div>
    </div>
  `;

  // When Edit is clicked, switch mode and re-render
  document.getElementById("editRecordBtn").addEventListener("click", () => {
    isEditMode = true;
    renderRecordDetails(selectedProperties);
  });
}

// edit mode in side panel
//  only monument_type1 is editable
function renderEditMode(properties) {
  const monumentTypeOptions = getLookupOptions("monument_type1")
    .map((option) => {
      const selected = option.value === properties.monument_type1 ? "selected" : "";
      return `<option value="${option.value}" ${selected}>${option.label}</option>`;
    })
    .join("");

  recordDetails.innerHTML = `
    <div class="record-title">
      <h3>${safeValue(properties.primary_name)}</h3>
      <p>${safeValue(properties.caal_id)}</p>
    </div>

    <div class="panel-actions">
      <button type="button" class="action-btn primary" id="saveRecordBtn">
        ${t("save")}
      </button>
      <button type="button" class="action-btn" id="cancelEditBtn">
        ${t("cancel")}
      </button>
    </div>

    <div class="detail-grid">
      <div class="detail-item">
        <span class="detail-label">${t("country")}</span>
        <div class="detail-value">${displayLookup("country", properties.country)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("classification")}</span>
        <div class="detail-value">${safeValue(properties.classification)}</div>
      </div>

      <div class="detail-item">
        <label class="detail-label" for="edit_monument_type1">${t("monument_type1")}</label>
        <select id="edit_monument_type1" class="form-control">
          ${monumentTypeOptions}
        </select>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("cultural_period1")}</span>
        <div class="detail-value">${displayLookup("cultural_period1", properties.cultural_period1)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("recorder")}</span>
        <div class="detail-value">${safeValue(properties.recorder)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("notes")}</span>
        <div class="detail-value">${safeValue(properties.notes)}</div>
      </div>
    </div>
  `;

  // Save the changed dropdown value into the selected record in memory
  document.getElementById("saveRecordBtn").addEventListener("click", () => {
    const newMonumentType = document.getElementById("edit_monument_type1").value;
    selectedProperties.monument_type1 = newMonumentType;
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
