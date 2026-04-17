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
    notes: "Notes"
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
    notes: "Примечания"
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
    notes: "备注"
  }
};

let currentLang = "en";
let selectedProperties = null;

const languageSelect = document.getElementById("languageSelect");
const recordDetails = document.getElementById("recordDetails");

const map = L.map("map").setView([48.0, 67.0], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

function t(key) {
  return translations[currentLang]?.[key] || translations.en[key] || key;
}

function safeValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }
  return value;
}

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

function renderRecordDetails(properties) {
  selectedProperties = properties;

  recordDetails.innerHTML = `
    <div class="record-title">
      <h3>${safeValue(properties.primary_name)}</h3>
      <p>${safeValue(properties.caal_id)}</p>
    </div>

    <div class="detail-grid">
      <div class="detail-item">
        <span class="detail-label">${t("country")}</span>
        <div class="detail-value">${safeValue(properties.country)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("classification")}</span>
        <div class="detail-value">${safeValue(properties.classification)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("monument_type1")}</span>
        <div class="detail-value">${safeValue(properties.monument_type1)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">${t("cultural_period1")}</span>
        <div class="detail-value">${safeValue(properties.cultural_period1)}</div>
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
}

function pointStyle(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 7,
    weight: 1,
    opacity: 1,
    fillOpacity: 0.85
  });
}

languageSelect.addEventListener("change", (event) => {
  currentLang = event.target.value;
  applyLanguage();
});

fetch("./data/monuments_sample.geojson")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load GeoJSON: ${response.status}`);
    }
    return response.json();
  })
  .then((geojson) => {
    const layer = L.geoJSON(geojson, {
      pointToLayer: pointStyle,
      onEachFeature: (feature, layer) => {
        const props = feature.properties;

        layer.bindPopup(`
          <div>
            <p class="popup-title">${safeValue(props.primary_name)}</p>
            <p class="popup-meta">${safeValue(props.caal_id)}</p>
          </div>
        `);

        layer.on("click", () => {
          renderRecordDetails(props);
        });
      }
    }).addTo(map);

    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

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
