// ========================================================
// SHARED APP LOGIC
// Used by Home, Monuments, and Archive
// ========================================================

let appSession = null;
//const API_BASE = "http://localhost:3000";
const API_BASE = "";

// --------------------------------------------------------
// Backend session handling
// --------------------------------------------------------
async function loadBackendSession() {
  try {
    const response = await fetch(`${API_BASE}/api/auth/session`, {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.ok || !data.session) {
      return null;
    }

    appSession = data.session;
    window.appSession = appSession;
    return appSession;
  } catch (error) {
    console.error("Failed to load backend session:", error);
    return null;
  }
}

async function requireSession() {
  const session = await loadBackendSession();

  if (!session) {
    window.location.href = "index.html";
    return null;
  }

  return session;
}

async function logoutUser() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (error) {
    console.error("Logout failed:", error);
  }

  appSession = null;
  window.appSession = null;
  window.location.href = "index.html";
}

function bindLogoutButtons() {
  document.querySelectorAll(".js-logout-btn").forEach((btn) => {
    btn.addEventListener("click", logoutUser);
  });
}

window.requireSession = requireSession;
window.loadBackendSession = loadBackendSession;
window.logoutUser = logoutUser;
window.appSession = appSession;

// --------------------------------------------------------
// Session helpers
// --------------------------------------------------------
function getCurrentSession() {
  return appSession;
}

function canViewWorkspace() {
  return !!appSession?.permissions?.can_view_workspace;
}

function canEditWorkspace() {
  return !!appSession?.permissions?.can_edit_workspace;
}

function canViewCaal() {
  return !!appSession?.permissions?.can_view_all_caal;
}

function canEditCaal() {
  return !!appSession?.permissions?.can_edit_caal;
}

function getWorkspaceCode() {
  return appSession?.profile?.workspace_code || null;
}

function getPreferredLanguageFromSession() {
  return appSession?.profile?.preferred_language || null;
}

window.getCurrentSession = getCurrentSession;
window.canViewWorkspace = canViewWorkspace;
window.canEditWorkspace = canEditWorkspace;
window.canViewCaal = canViewCaal;
window.canEditCaal = canEditCaal;
window.getWorkspaceCode = getWorkspaceCode;
window.getPreferredLanguageFromSession = getPreferredLanguageFromSession;

// --------------------------------------------------------
// UI translations for shell text only
// --------------------------------------------------------
const translations = {
  en: {
    home_workspace_title: "CAAL Kazakhstan",
    home_workspace_intro: "Browse, consult, and maintain monument and archive records within a shared CAAL environment.",
    app_title: "CAAL Workspace",
    app_subtitle: "Kazakhstan workspace prototype",
    language_label: "Language",
    record_details: "Record Details",
    click_prompt: "Click a monument on the map",
    no_record_selected: "No record selected yet.",
    no_data_in_section: "No populated fields in this section.",
    edit_record: "Edit record",
    save: "Save",
    cancel: "Cancel",
    set_location_from_coordinates: "Set location from coordinates",
    logout_button: "Log out",
    //Archive Page
    archive_browse: "Browse",
    archive_browse_intro: "Search and consult archive records",
    archive_search: "Search",
    archive_search_placeholder: "Search titles, references, descriptions, authors...",
    archive_workspace_records: "Workspace records",
    archive_national_records: "National CAAL records",
    archive_all_records: "All CAAL records",
    archive_advanced_filters: "Advanced filters",
    archive_results: "Results",
    archive_results_will_appear: "Results will appear here.",
    archive_selected_record: "Selected archive record",
    archive_clear_filters: "Clear filters",
    archive_related_countries: "Related Countries",
    archive_related_religions: "Related Religions",
    archive_related_subjects: "Related Subjects",
    archive_content_type: "Content Type",
    archive_languages_material: "Languages of Material"
  },

  ru: {
    home_workspace_title: "CAAL Казахстан",
    home_workspace_intro: "Просматривайте, сверяйте и ведите памятники и архивные записи в общей среде CAAL.",
    app_title: "Рабочее пространство CAAL",
    app_subtitle: "Прототип рабочего пространства Казахстана",
    language_label: "Язык",
    record_details: "Детали записи",
    click_prompt: "Нажмите на памятник на карте",
    no_record_selected: "Запись пока не выбрана.",
    no_data_in_section: "В этом разделе нет заполненных полей.",
    edit_record: "Редактировать запись",
    save: "Сохранить",
    cancel: "Отмена",
    set_location_from_coordinates: "Установить местоположение по координатам",
    // Archive page
    archive_browse: "Просмотр",
    archive_browse_intro: "Поиск и просмотр архивных записей",
    archive_search: "Поиск",
    archive_search_placeholder: "Искать по названиям, ссылкам, описаниям, авторам...",
    archive_workspace_records: "Записи рабочего пространства",
    archive_national_records: "Национальные записи CAAL",
    archive_all_records: "Все записи CAAL",
    archive_advanced_filters: "Расширенные фильтры",
    archive_results: "Результаты",
    archive_results_will_appear: "Здесь появятся результаты.",
    archive_selected_record: "Выбранная архивная запись",
    archive_clear_filters: "Очистить фильтры",
    archive_related_countries: "Связанные страны",
    archive_related_religions: "Связанные религии",
    archive_related_subjects: "Связанные темы",
    archive_content_type: "Тип материала",
    archive_languages_material: "Языки материала"
  },

  zh: {
    home_workspace_title: "CAAL 哈萨克斯坦",
    home_workspace_intro: "在共享的 CAAL 环境中浏览、查阅并维护遗址和档案记录。",
    app_title: "CAAL 工作区",
    app_subtitle: "哈萨克斯坦工作区原型",
    language_label: "语言",
    record_details: "记录详情",
    click_prompt: "点击地图上的遗址",
    no_record_selected: "尚未选择记录。",
    no_data_in_section: "本部分没有已填内容。",
    edit_record: "编辑记录",
    save: "保存",
    cancel: "取消",
    set_location_from_coordinates: "根据坐标设置位置"
  }
};

// --------------------------------------------------------
// Shared lookup labels
// Keep only if reused across modules
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

let currentLang = "en";
const languageSelect = document.getElementById("languageSelect");

function getCurrentLanguage() {
  return currentLang;
}

window.getCurrentLanguage = getCurrentLanguage;

// --------------------------------------------------------
// Shared text helpers
// --------------------------------------------------------
function t(key) {
  return translations[currentLang]?.[key] || translations.en[key] || key;
}

window.t = t;

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

window.safeValue = safeValue;
window.displayLookup = displayLookup;

// --------------------------------------------------------
// Generic reusable form helpers
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

window.getLookupOptions = getLookupOptions;
window.hasValue = hasValue;
window.formatValue = formatValue;
window.makeFieldId = makeFieldId;
window.getInputValue = getInputValue;
window.renderDetailItem = renderDetailItem;
window.renderGroupBlock = renderGroupBlock;
window.renderTextInput = renderTextInput;
window.renderTextarea = renderTextarea;
window.renderNumberInput = renderNumberInput;
window.renderReadOnlyItem = renderReadOnlyItem;
window.renderSelectInput = renderSelectInput;

// --------------------------------------------------------
// Shared language application
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

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    el.placeholder = t(key);
  });

  document.dispatchEvent(new CustomEvent("app:languageChanged"));
}

if (languageSelect) {
  languageSelect.addEventListener("change", (event) => {
    const nextLang = event.target.value;
    const previousLang = currentLang;

    if (
      typeof window.archiveCanChangeLanguage === "function" &&
      !window.archiveCanChangeLanguage()
    ) {
      event.target.value = previousLang;
      return;
    }

    currentLang = nextLang;
    saveLanguagePreference(currentLang);
    applyLanguage();
  });
}


// --------------------------------------------------------
// Initial language/session load
// --------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const session = await loadBackendSession();

  if (session && session.profile?.preferred_language) {
    currentLang = session.profile.preferred_language;
    saveLanguagePreference(currentLang);
  } else {
    currentLang = loadLanguagePreference();
  }

  bindLogoutButtons();
  applyLanguage();
});