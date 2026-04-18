// ========================================================
// SHARED APP LOGIC
// Used by Home, Monuments, and later Archive
// ========================================================

// --------------------------------------------------------
// UI translations
// --------------------------------------------------------
const translations = {
  en: {
    home_workspace_title: "CAAL Kazakhstan",
    home_workspace_intro: "Browse, consult, and maintain monument and archive records within a shared CAAL environment.",
    app_title: "CAAL App Prototype",
    app_subtitle: "Kazakhstan workspace prototype",
    language_label: "Language",
    record_details: "Record Details",
    click_prompt: "Click a monument on the map",
    no_record_selected: "No record selected yet.",

    basic_group: "Basic",
    monument_group: "Monument",
    administration_group: "Administration",
    measurements_group: "Measurements",
    metadata_group: "Metadata",
    related_resources_group: "Related Resources",

    country: "Country",
    classification: "Classification",
    monument_type1: "Monument Type 1",
    monument_type2: "Monument Type 2",
    monument_type3: "Monument Type 3",
    monument_type4: "Monument Type 4",
    monument_type5: "Monument Type 5",
    monument_type6: "Monument Type 6",
    cultural_period1: "Cultural Period 1",
    cultural_period2: "Cultural Period 2",
    cultural_period3: "Cultural Period 3",
    cultural_period4: "Cultural Period 4",
    cultural_period5: "Cultural Period 5",
    cultural_period6: "Cultural Period 6",
    religion1: "Religion 1",
    religion2: "Religion 2",
    religion3: "Religion 3",
    recorder: "Recorder",
    notes: "Notes",

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
    descriptive_date: "Descriptive Date",
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

    edit_record: "Edit record",
    save: "Save",
    cancel: "Cancel",
    set_location_from_coordinates: "Set location from coordinates"
  },

  ru: {
    home_workspace_title: "CAAL Казахстан",
    home_workspace_intro: "Просматривайте, сверяйте и ведите памятники и архивные записи в общей среде CAAL.",
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
    home_workspace_title: "CAAL 哈萨克斯坦",
    home_workspace_intro: "在共享的 CAAL 环境中浏览、查阅并维护遗址和档案记录。",
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

// --------------------------------------------------------
// Shared lookup labels
// Keep here only if reused across modules
// --------------------------------------------------------
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

// --------------------------------------------------------
// Language persistence
// --------------------------------------------------------
const LANGUAGE_STORAGE_KEY = "caal_workspace_language";

function saveLanguagePreference(lang) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

function loadLanguagePreference() {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved && translations[saved]) {
    return saved;
  }
  return "en";
}

let currentLang = loadLanguagePreference();
const languageSelect = document.getElementById("languageSelect");

// --------------------------------------------------------
// Shared text helpers
// --------------------------------------------------------
function t(key) {
  return translations[currentLang]?.[key] || translations.en[key] || key;
}

function safeValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }
  return value;
}

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

// --------------------------------------------------------
// Generic reusable form helpers
// These can later be reused by Archive too
// --------------------------------------------------------
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

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function formatValue(value, decimals = null) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }

  if (decimals !== null && !isNaN(value)) {
    return Number(value).toFixed(decimals);
  }

  return value;
}

function makeFieldId(fieldName) {
  return "fld_" + fieldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getInputValue(fieldName) {
  const inputId = makeFieldId(fieldName);
  const el = document.getElementById(inputId);
  return el ? el.value : "";
}

function renderDetailItem(label, value, fullWidth = false) {
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <span class="detail-label">${label}</span>
      <div class="detail-value">${safeValue(value)}</div>
    </div>
  `;
}

function renderGroupBlock(title, innerHtml, hasValues = true) {
  const content = hasValues
    ? innerHtml
    : `<div class="section-empty">${t("no_data_in_section")}</div>`;

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

function renderReadOnlyItem(label, value, fullWidth = false) {
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <span class="detail-label">${label}</span>
      <div class="detail-value">${safeValue(value)}</div>
    </div>
  `;
}

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

// --------------------------------------------------------
// Shared language application
// Page modules can listen to app:languageChanged
// --------------------------------------------------------
function applyLanguage() {
  document.documentElement.lang = currentLang;

  if (languageSelect) {
    languageSelect.value = currentLang;
  }

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  document.dispatchEvent(new CustomEvent("app:languageChanged"));
}

if (languageSelect) {
  languageSelect.addEventListener("change", (event) => {
    currentLang = event.target.value;
    saveLanguagePreference(currentLang);
    applyLanguage();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyLanguage();
});
