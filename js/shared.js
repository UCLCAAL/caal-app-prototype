// ========================================================
// SHARED APP LOGIC
// Used by Home, Monuments, and Archive
// ========================================================

let appSession = null;
//const API_BASE = "http://localhost:3000";
const API_BASE = "";

const APP_LANG_STORAGE_KEY = "caal_ui_language";
const APP_LANG_USER_SELECTED_KEY = "caal_ui_language_user_selected";
const APP_LANG_USER_ID_STORAGE_KEY = "caal_ui_language_user_id";

const APP_TRANSLATIONS_STORAGE_PREFIX = "caal_ui_translations_";
let uiTranslations = {};

const SUPPORTED_UI_LANGS = ["en", "ru", "zh", "kk", "ky", "tg", "tk", "uz"];

// TINY IN HOUSE THESAURUS FOR NAV BAR
const SHELL_TRANSLATIONS = {
  en: {
    app_title: "CAAL Workspace",
    nav_home: "Home",
    nav_monuments: "Monuments",
    nav_archive: "Archive",
    nav_viewer: "Viewer",
    logout_button: "Log out",
    language_label: "Language",

    home_app_subtitle: "National data entry and browsing environment",
    monuments_workspace_subtitle: "Kazakhstan monuments workspace",
    archive_workspace_subtitle: "Kazakhstan archive workspace",
    login_subtitle: "Sign in to continue",
    login_username: "Username",
    login_password: "Password",
    login_sign_in: "Sign in",
    signed_in_as: "Signed in as"
  },

  ru: {
    app_title: "Рабочее пространство CAAL",
    nav_home: "Главная",
    nav_monuments: "Памятники",
    nav_archive: "Архив",
    logout_button: "Выйти",
    language_label: "Язык",

    home_app_subtitle: "Среда для национального ввода и просмотра данных",
    monuments_workspace_subtitle: "Рабочее пространство памятников Казахстана",
    archive_workspace_subtitle: "Рабочее пространство архива Казахстана",
    login_subtitle: "Войдите, чтобы продолжить",
    login_username: "Имя пользователя",
    login_password: "Пароль",
    login_sign_in: "Войти",
    signed_in_as: "Вошли как"
  },

  zh: {
    app_title: "CAAL 工作区",
    nav_home: "主页",
    nav_monuments: "遗址",
    nav_archive: "档案",
    logout_button: "退出",
    language_label: "语言",

    home_app_subtitle: "国家数据录入和浏览环境",
    monuments_workspace_subtitle: "哈萨克斯坦遗址工作区",
    archive_workspace_subtitle: "哈萨克斯坦档案工作区",
    login_subtitle: "登录以继续",
    login_username: "用户名",
    login_password: "密码",
    login_sign_in: "登录",
    signed_in_as: "已登录为"
  },

  kk: {
    app_title: "CAAL жұмыс кеңістігі",
    nav_home: "Басты бет",
    nav_monuments: "Ескерткіштер",
    nav_archive: "Архив",
    logout_button: "Шығу",
    language_label: "Тіл"
  },

  ky: {
    app_title: "CAAL иш мейкиндиги",
    nav_home: "Башкы бет",
    nav_monuments: "Эстеликтер",
    nav_archive: "Архив",
    logout_button: "Чыгуу",
    language_label: "Тил"
  },

  tg: {
    app_title: "Фазои кории CAAL",
    nav_home: "Саҳифаи асосӣ",
    nav_monuments: "Ёдгориҳо",
    nav_archive: "Бойгонӣ",
    logout_button: "Баромадан",
    language_label: "Забон"
  },

  tk: {
    app_title: "CAAL iş giňişligi",
    nav_home: "Baş sahypa",
    nav_monuments: "Ýadygärlikler",
    nav_archive: "Arhiw",
    logout_button: "Çykmak",
    language_label: "Dil"
  },

  uz: {
    app_title: "CAAL ish maydoni",
    nav_home: "Bosh sahifa",
    nav_monuments: "Yodgorliklar",
    nav_archive: "Arxiv",
    logout_button: "Chiqish",
    language_label: "Til"
  }
};

let currentLang = getStoredLanguage();

if (!SUPPORTED_UI_LANGS.includes(currentLang)) {
  currentLang = "en";
}

document.documentElement.lang = currentLang;
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

    if (typeof updateCaalOnlyNavigation === "function") {
      updateCaalOnlyNavigation(appSession);
    }

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

function updateCaalOnlyNavigation(session = window.appSession) {
  const isCaal = sharedSessionIsCaalWorkspace(session);

  document
    .querySelectorAll("[data-caal-only-nav]")
    .forEach((el) => {
      el.hidden = !isCaal;
    });
}

window.updateCaalOnlyNavigation = updateCaalOnlyNavigation;

window.requireSession = requireSession;
window.loadBackendSession = loadBackendSession;
window.logoutUser = logoutUser;
window.appSession = appSession;

function initialiseLanguageSelector() {
  const languageSelect = document.getElementById("languageSelect");
  if (!languageSelect) return;

  const lang = resolveInitialLanguage();
  languageSelect.value = lang;
}

// --------------------------------------------------------
// Session helpers
// --------------------------------------------------------
function sharedSessionWorkspaceCode(session = window.appSession) {
  return String(
    session?.user?.workspace_code ??
    session?.profile?.workspace_code ??
    session?.permissions?.workspace_code ??
    session?.workspace_code ??
    ""
  ).trim();
}

function sharedSessionIsCaalWorkspace(session = window.appSession) {
  return String(sharedSessionWorkspaceCode(session) || "")
    .trim()
    .toLowerCase() === "caal";
}

window.sharedSessionIsCaalWorkspace = sharedSessionIsCaalWorkspace;

function sharedSessionAccessLevel(session = window.appSession) {
  return Number(
    session?.user?.access_level ??
    session?.profile?.access_level ??
    session?.permissions?.access_level ??
    session?.access_level ??
    0
  );
}

function renderSignedInUserPill() {
  const pill = document.getElementById("signedInUserPill");
  const nameEl = document.getElementById("signedInUserName");
  const workspaceEl = document.getElementById("signedInUserWorkspace");

  if (!pill || !nameEl || !workspaceEl) return;

  const session = window.appSession || {};

  const username =
    session.user?.display_name ||
    session.user?.username ||
    session.user?.email ||
    session.profile?.display_name ||
    session.profile?.username ||
    session.profile?.email ||
    "";

  const workspaceCode = sharedSessionWorkspaceCode(session);
  const accessLevel = sharedSessionAccessLevel(session);

  if (!username) {
    pill.hidden = true;
    return;
  }

  const roleLabel = accessLevel === 9
    ? "Admin"
    : "User";

  nameEl.textContent = username;

  workspaceEl.textContent = workspaceCode
    ? `(${workspaceCode.toUpperCase()} ${roleLabel})`
    : `(${roleLabel})`;

  pill.hidden = false;
}

window.renderSignedInUserPill = renderSignedInUserPill;

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

function getLocalizedCountryName(countryName, lang = getCurrentLanguage()) {
  const key = String(countryName || "").trim().toLowerCase();

  const countries = {
    kazakhstan: {
      en: "Kazakhstan",
      ru: "Казахстан",
      zh: "哈萨克斯坦",
      kk: "Қазақстан",
      ky: "Казакстан",
      tg: "Қазоқистон",
      tk: "Gazagystan",
      uz: "Qozog'iston"
    }
  };

  return countries[key]?.[lang] || countryName || "";
}

function getWorkspaceCountryDisplayForms(session = window.appSession) {
  const workspaceCode = getSessionWorkspaceCodeForDisplay(session);
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    session?.profile?.preferred_language ||
    "en";

  if (workspaceCode === "kz") {
    return {
      country: {
        en: "Kazakhstan",
        ru: "Казахстан",
        kk: "Қазақстан"
      }[lang] || "Kazakhstan",

      countryGenitive: {
        en: "Kazakhstan",
        ru: "Казахстана",
        kk: "Қазақстан"
      }[lang] || "Kazakhstan",

      workspaceTitle: {
        en: "Kazakhstan records workspace",
        ru: "Рабочее пространство записей Казахстана",
        kk: "Қазақстан жазбаларының жұмыс кеңістігі"
      }[lang] || "Kazakhstan records workspace",

      homeSubtitle: {
        en: "CAAL Kazakhstan",
        ru: "CAAL Казахстан",
        kk: "CAAL Қазақстан"
      }[lang] || "CAAL Kazakhstan",

      monumentsSubtitle: {
        en: "Kazakhstan monuments workspace",
        ru: "Рабочее пространство памятников Казахстана",
        kk: "Қазақстан ескерткіштерінің жұмыс кеңістігі"
      }[lang] || "Kazakhstan monuments workspace",

      archiveSubtitle: {
        en: "Kazakhstan archive workspace",
        ru: "Рабочее пространство архива Казахстана",
        kk: "Қазақстан архивінің жұмыс кеңістігі"
      }[lang] || "Kazakhstan archive workspace"
    };
  }

  return null;
}

function getWorkspaceCountryName(session = window.appSession) {
  const rawCountryName =
    session?.profile?.country_display ||
    session?.profile?.country ||
    session?.user?.country_display ||
    session?.user?.country ||
    "";

  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    session?.profile?.preferred_language ||
    "en";

  return getLocalizedCountryName(rawCountryName, lang);
}

function getSessionWorkspaceCodeForDisplay(session = window.appSession) {
  return String(
    session?.user?.workspace_code ||
    session?.profile?.workspace_code ||
    ""
  ).trim().toLowerCase();
}

function getWorkspaceHeaderTitle(session = window.appSession) {
  const workspaceCode = getSessionWorkspaceCodeForDisplay(session);
  const countryName = getWorkspaceCountryName(session);

  if (workspaceCode === "caal") {
    return t("app_title", "CAAL Workspace");
  }

  return countryName
    ? t("country_records_workspace", "{country} records workspace")
        .replace("{country}", countryName)
    : t("caal_national_workspace", "CAAL national workspace");
}

function getWorkspacePageSubtitle(page, session = window.appSession) {
  const workspaceCode = getSessionWorkspaceCodeForDisplay(session);
  const workspaceForms = getWorkspaceCountryDisplayForms(session);
  const countryName = getWorkspaceCountryName(session);

  if (workspaceCode === "caal") {
    if (page === "viewer") {
      return t("viewer_workspace_subtitle", "Resource viewer");
    }

    if (page === "archive") {
      return t("shared_caal_archive_workspace", "Shared CAAL Archive workspace");
    }

    if (page === "monuments") {
      return t("shared_caal_monuments_workspace", "Shared CAAL Monuments workspace");
    }

    return t("shared_caal_records_workspace", "Shared CAAL records workspace");
  }

  if (workspaceForms) {
    if (page === "archive") return workspaceForms.archiveSubtitle;
    if (page === "monuments") return workspaceForms.monumentsSubtitle;
    return workspaceForms.homeSubtitle;
  }

  if (page === "archive") {
    return countryName
      ? t("country_archive_workspace", "{country} archive workspace")
          .replace("{country}", countryName)
      : t("national_archive_workspace", "National archive workspace");
  }

  if (page === "monuments") {
    return countryName
      ? t("country_monuments_workspace", "{country} monuments workspace")
          .replace("{country}", countryName)
      : t("national_monuments_workspace", "National monuments workspace");
  }

  return countryName
    ? t("caal_country", "CAAL {country}").replace("{country}", countryName)
    : t("caal_national_workspace", "CAAL national workspace");
}

function getCurrentPageName() {
  const page = document.body?.dataset?.page;
  if (page) return page;

  const path = window.location.pathname.toLowerCase();

  if (path.includes("archive")) return "archive";
  if (path.includes("monuments")) return "monuments";

  return "home";
}

function applyWorkspaceHeaderText(page = getCurrentPageName(), session = window.appSession) {
  const titleEls = document.querySelectorAll(
    "#workspaceTitle, [data-workspace-title]"
  );

  const subtitleEls = document.querySelectorAll(
    "#workspaceSubtitle, [data-workspace-subtitle], [data-i18n='home_app_subtitle'], [data-i18n='monuments_workspace_subtitle'], [data-i18n='archive_workspace_subtitle'], [data-i18n='viewer_workspace_subtitle']"
  );

  titleEls.forEach((el) => {
    el.textContent = getWorkspaceHeaderTitle(session);
  });

  subtitleEls.forEach((el) => {
    el.textContent = getWorkspacePageSubtitle(page, session);
  });
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

window.getWorkspacePageSubtitle = getWorkspacePageSubtitle;
window.getWorkspaceHeaderTitle = getWorkspaceHeaderTitle;
window.applyWorkspaceHeaderText = applyWorkspaceHeaderText;

// lang persistence
function markLanguageUserSelected() {
  try {
    sessionStorage.setItem(APP_LANG_USER_SELECTED_KEY, "true");
  } catch (error) {
    console.warn("Could not mark language as user-selected:", error);
  }
}

function wasLanguageUserSelectedThisSession() {
  try {
    return sessionStorage.getItem(APP_LANG_USER_SELECTED_KEY) === "true";
  } catch (error) {
    return false;
  }
}

function clearStoredLanguage() {
  try {
    localStorage.removeItem(APP_LANG_STORAGE_KEY);
    localStorage.removeItem(APP_LANG_USER_ID_STORAGE_KEY);
    sessionStorage.removeItem(APP_LANG_USER_SELECTED_KEY);
  } catch (error) {
    console.warn("Could not clear stored UI language:", error);
  }
}

window.clearStoredLanguage = clearStoredLanguage;
window.wasLanguageUserSelectedThisSession = wasLanguageUserSelectedThisSession;

function getStoredLanguage() {
  try {
    return localStorage.getItem(APP_LANG_STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

function getStoredLanguageUserId() {
  try {
    return localStorage.getItem(APP_LANG_USER_ID_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not read stored UI language user id:", error);
    return null;
  }
}

function setStoredLanguageUserId(userId) {
  try {
    if (userId === null || userId === undefined || userId === "") {
      localStorage.removeItem(APP_LANG_USER_ID_STORAGE_KEY);
      return;
    }

    localStorage.setItem(APP_LANG_USER_ID_STORAGE_KEY, String(userId));
  } catch (error) {
    console.warn("Could not store UI language user id:", error);
  }
}

function getCurrentSessionUserId() {
  return (
    window.appSession?.user?.user_id ??
    window.appSession?.profile?.user_id ??
    window.appSession?.user?.id ??
    null
  );
}

window.setStoredLanguageUserId = setStoredLanguageUserId;

function setStoredLanguage(lang) {
  try {
    localStorage.setItem(APP_LANG_STORAGE_KEY, lang);

    const currentUserId = getCurrentSessionUserId();
    if (currentUserId !== null && currentUserId !== undefined) {
      setStoredLanguageUserId(currentUserId);
    }
  } catch (error) {
    console.warn("Could not store UI language:", error);
  }
}

function resolveInitialLanguage() {
  const stored = getStoredLanguage();
  const storedUserId = getStoredLanguageUserId();
  const currentUserId = getCurrentSessionUserId();
  const sessionLang = window.appSession?.profile?.preferred_language;

  const hasValidStored =
    stored && SUPPORTED_UI_LANGS.includes(stored);

  const hasValidSession =
    sessionLang && SUPPORTED_UI_LANGS.includes(sessionLang);

  if (currentUserId !== null && currentUserId !== undefined) {
    if (
      hasValidStored &&
      storedUserId &&
      String(storedUserId) === String(currentUserId)
    ) {
      return stored;
    }

    if (hasValidSession) {
      return sessionLang;
    }

    return "en";
  }

  if (hasValidStored) {
    return stored;
  }

  return "en";
}

// --------------------------------------------------------
// Language persistence
// --------------------------------------------------------

const languageSelect = document.getElementById("languageSelect");

function getCurrentLanguage() {
  const languageSelect = document.getElementById("languageSelect");

  if (languageSelect?.value) {
    return languageSelect.value;
  }

  return resolveInitialLanguage();
}

window.getCurrentLanguage = getCurrentLanguage;

// save feedback
// ----------------------------------------------
let toastHideTimer = null;

function showToast(message, durationMs = 3000) {
  const toast = document.getElementById("toast");

  if (!toast) {
    console.warn("Toast element not found: expected id='toast'");
    return;
  }

  toast.textContent = message;

  // Force visibility regardless of whether the CSS uses hidden, display, opacity, or class names.
  toast.hidden = false;
  toast.style.display = "block";
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  // Support both old and new CSS class names.
  toast.classList.add("visible");
  toast.classList.add("is-visible");

  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
  }

  toastHideTimer = setTimeout(() => {
    toast.classList.remove("visible");
    toast.classList.remove("is-visible");
    toast.style.opacity = "";
    toast.style.transform = "";
    toast.style.display = "";
    toast.hidden = true;
  }, durationMs);
}

// save summary for materialised views
function getSaveSummaryLocale() {
  const lang =
    typeof window.getCurrentLanguage === "function"
      ? window.getCurrentLanguage()
      : document.documentElement.lang || "en";

  const map = {
    en: "en-GB",
    ru: "ru-RU",
    zh: "zh-CN",
    kk: "kk-KZ",
    ky: "ky-KG",
    tg: "tg-TJ",
    tk: "tk-TM",
    uz: "uz-UZ"
  };

  return map[String(lang).toLowerCase()] || "en-GB";
}

function formatSaveSummaryDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString(getSaveSummaryLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false
  });
}

function formatSaveSummaryValue(value) {
  if (value === null || value === undefined || value === "") {
    return t("not_recorded", "Not recorded");
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function renderSaveSummaryFieldValue(item, summary = {}) {
  const isChangedFieldsSummary = summary.summary_mode === "changed_fields";

  if (!isChangedFieldsSummary) {
    return `<span>${formatSaveSummaryValue(item.value)}</span>`;
  }

  const hasOldValue = Object.prototype.hasOwnProperty.call(item, "old_value");
  const hasNewValue = Object.prototype.hasOwnProperty.call(item, "new_value");

  const oldValue = hasOldValue ? item.old_value : null;
  const newValue = hasNewValue ? item.new_value : item.value;

  return `
    <span class="save-summary-change">
      <span class="save-summary-old-value">
        ${formatSaveSummaryValue(oldValue)}
      </span>
      <span class="save-summary-arrow" aria-hidden="true">→</span>
      <span class="save-summary-new-value">
        ${formatSaveSummaryValue(newValue)}
      </span>
    </span>
  `;
}

function getSaveSummaryFieldLabel(item, summary = {}) {
  const field = item?.field || item?.label || "";

  if (!field) return "";

  if (
    summary.record_type === "archive" &&
    typeof window.archiveLabel === "function"
  ) {
    return window.archiveLabel(field, field);
  }

  if (
    summary.record_type === "monument" &&
    typeof window.mLabel === "function"
  ) {
    return window.mLabel(field, field);
  }

  if (
    summary.record_type === "monument" &&
    typeof window.monumentLabel === "function"
  ) {
    return window.monumentLabel(field, field);
  }

  return item?.label || field;
}

function renderSaveSummaryCard(summary, options = {}) {
  if (!summary) return "";

  const actionLabel =
    summary.record_type === "archive"
      ? t("archive_record_saved", "Archive record saved")
      : t("record_saved", "Record saved");

  const recordTypeLabel =
    summary.record_type === "archive"
      ? t("archive_record", "Archive record")
      : t("monument_record", "Monument record");

  const fields = Array.isArray(summary.fields_saved)
    ? summary.fields_saved
    : [];

  const fieldRows = fields.map((item) => `
    <li>
      <strong>${getSaveSummaryFieldLabel(item, summary)}:</strong>
      ${renderSaveSummaryFieldValue(item, summary)}
    </li>
  `).join("");

  const hiddenCount =
    Number(summary.saved_field_count || 0) - Number(summary.shown_field_count || fields.length);

  const hiddenText = hiddenCount > 0
    ? `<p class="save-summary-more">${t("maximum_values_help", "Maximum: {count}.").replace("{count}", summary.shown_field_count || fields.length)}</p>`
    : "";

  const cacheText = summary.cache_refresh_required
    ? `
      <p class="save-summary-warning">
        ${t(
          "saved_cache_refresh_pending",
          "This record was saved, but some search, list, map, or summary views may not update until the CAAL cache refreshes."
        )}
      </p>
    `
    : "";

  return `
    <div class="save-summary-card" role="status">
      <div class="save-summary-header">
        <strong>${actionLabel}</strong>
        <button
          type="button"
          class="save-summary-dismiss"
          aria-label="${t("hide_saved_confirmation", "Hide saved confirmation")}"
        >
          ×
        </button>
      </div>

      <p class="save-summary-message">
        <strong>
          ${
            summary.record_type === "archive"
              ? t("nav_archive", "Archive")
              : t("nav_monuments", "Monuments")
          }:
        </strong>
        ${summary.caal_id || ""}
        <br>
        <strong>${actionLabel}:</strong>
        ${formatSaveSummaryDate(summary.saved_at)}
      </p>

      <p class="save-summary-meta">
        ${summary.saved_by ? `${t("login_username", "Username")}: ${summary.saved_by}. ` : ""}
        ${summary.storage_label ? `${t("workspace", "Workspace")}: ${summary.storage_label}.` : ""}
      </p>

      ${fields.length ? `
        <details class="save-summary-fields" open>
          <summary>
            ${t("record_details", "Record Details")}
            ${summary.saved_field_count ? ` (${summary.saved_field_count})` : ""}
          </summary>
          <ul>
            ${fieldRows}
          </ul>
          ${hiddenText}
        </details>
      ` : ""}

      ${cacheText}
    </div>
  `;
}

function wireSaveSummaryDismiss(container) {
  if (!container) return;

  const button = container.querySelector(".save-summary-dismiss");
  if (!button) return;

  button.addEventListener("click", () => {
    const card = button.closest(".save-summary-card");
    if (card) card.remove();
  });
}

window.renderSaveSummaryCard = renderSaveSummaryCard;
window.wireSaveSummaryDismiss = wireSaveSummaryDismiss;

// load full record from related
// ------------------------------------
function getInitialCaalIdFromUrl() {
  return new URLSearchParams(window.location.search).get("caal_id");
}

function getInitialScopeFromUrl() {
  return new URLSearchParams(window.location.search).get("scope");
}

function buildRecordUrl(pageName, caalId, scope = null) {
  const params = new URLSearchParams();

  if (caalId) {
    params.set("caal_id", caalId);
  }

  if (scope) {
    params.set("scope", scope);
  }

  return `${pageName}?${params.toString()}`;
}

function getRelatedRecordUrl(caalId, recordType, sourceScope = null) {
  const id = String(caalId || "").trim();
  const type = String(recordType || "").trim();

  if (!id) return null;

  if (type === "monument") {
    return buildRecordUrl("monuments.html", id);
  }

  if (type === "archive") {
    return buildRecordUrl("archive.html", id);
  }

  if (
    [
      "rs3_poly",
      "rs3_line",
      "rs3_group",
      "institution",
      "vernacular",
      "dataset",
      "cartography"
    ].includes(type)
  ) {
    const params = new URLSearchParams();
    params.set("caal_id", id);

    if (type !== "dataset") {
      params.set("recordTypes", type);
    }

    return `viewer.html?${params.toString()}`;
  }

  return buildRecordUrl("viewer.html", id);
}

function waitForMapExportFrame(mapInstance) {
  return new Promise((resolve) => {
    if (!mapInstance) {
      resolve();
      return;
    }

    let resolved = false;

    function finish() {
      if (resolved) return;
      resolved = true;
      resolve();
    }

    try {
      mapInstance.triggerRepaint();

      mapInstance.once("render", () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(finish);
        });
      });

      setTimeout(finish, 900);
    } catch (error) {
      console.warn("Map export wait failed:", error);
      finish();
    }
  });
}

async function downloadCurrentMapImage(options = {}) {
  const {
    mapInstance = window.map || window.viewerMap || null,
    filenamePrefix = "caal-map",
    labelScope = "none",
    labelMode = "name",

    hideLabelsForExport =
      typeof temporarilyHideLiveMapLabelsForExport === "function"
        ? temporarilyHideLiveMapLabelsForExport
        : null,

    restoreLabelsAfterExport =
      typeof restoreLiveMapLabelsAfterExport === "function"
        ? restoreLiveMapLabelsAfterExport
        : null,

    waitForIdle =
      typeof waitForMapIdle === "function"
        ? waitForMapIdle
        : null,

    drawLabels =
      typeof drawExportMapLabels === "function"
        ? drawExportMapLabels
        : null,

    getLegendItems =
      typeof getCurrentMapLegendItems === "function"
        ? getCurrentMapLegendItems
        : null,

    calculateScaleBar =
      typeof calculateMapScaleBar === "function"
        ? calculateMapScaleBar
        : null
  } = options;

  if (!mapInstance) {
    console.warn("No map instance available for download.");
    return;
  }

  const previousLiveLabelVisibility = hideLabelsForExport
    ? hideLabelsForExport()
    : null;

  await waitForMapExportFrame(mapInstance);

  try {
    const mapCanvas = mapInstance.getCanvas();

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = mapCanvas.width;
    exportCanvas.height = mapCanvas.height;

    const ctx = exportCanvas.getContext("2d");

    ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(
      mapCanvas,
      0,
      0,
      mapCanvas.width,
      mapCanvas.height,
      0,
      0,
      exportCanvas.width,
      exportCanvas.height
    );

    const width = exportCanvas.width;
    const height = exportCanvas.height;

    const uiScale = Math.max(1, width / 1400);

    function scaled(px) {
      return Math.round(px * uiScale);
    }

    // Draw only the export labels.
    if (drawLabels) {
      drawLabels(ctx, exportCanvas, labelScope, labelMode, mapInstance);
    }

    // Shared styles
    ctx.font = "23px Arial, sans-serif";
    ctx.textBaseline = "middle";

   // --- CAAL watermark / accreditation ---
    const watermarkText = "CAAL - Central Asian Archaeological Landscapes";

    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = "rgba(255, 255, 255, 0.93)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
    ctx.lineWidth = 1;

    ctx.font = `bold ${scaled(18)}px Arial, sans-serif`;
    ctx.textBaseline = "middle";

    const watermarkPaddingX = scaled(16);
    const watermarkPaddingY = scaled(12);
    const watermarkTextWidth = ctx.measureText(watermarkText).width;

    const watermarkW = Math.ceil(watermarkTextWidth + watermarkPaddingX * 2);
    const watermarkH = scaled(44);
    const watermarkX = width - watermarkW - scaled(16);
    const watermarkY = height - watermarkH - scaled(16);

    ctx.beginPath();
    ctx.roundRect(watermarkX, watermarkY, watermarkW, watermarkH, scaled(10));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#263238";
    ctx.fillText(
      watermarkText,
      watermarkX + watermarkPaddingX,
      watermarkY + watermarkH / 2
    );

    ctx.restore();

    // --- Legend / map key ---
    const legendItems = getLegendItems ? getLegendItems() : [];

    if (legendItems.length) {
      ctx.save();

      const legendTitleSize = scaled(20);
      const legendTextSize = scaled(17);
      const rowH = scaled(30);
      const legendPadding = scaled(16);
      const symbolRadius = scaled(8);
      const symbolGap = scaled(16);

      ctx.font = `bold ${legendTitleSize}px Arial, sans-serif`;
      const titleText = t("map_key", "Map key");

      ctx.font = `${legendTextSize}px Arial, sans-serif`;
      const maxLabelWidth = Math.max(
        ...legendItems.map((item) => ctx.measureText(item.label).width)
      );

      const legendW = Math.ceil(
        legendPadding * 2 +
        symbolRadius * 2 +
        symbolGap +
        maxLabelWidth
      );

      const legendH = Math.ceil(
        legendPadding * 2 +
        scaled(22) +
        legendItems.length * rowH
      );

      const legendX = width - legendW - scaled(16);
      const legendY = watermarkY - legendH - scaled(12);

      ctx.fillStyle = "rgba(255, 255, 255, 0.93)";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(legendX, legendY, legendW, legendH, scaled(10));
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#263238";
      ctx.font = `bold ${legendTitleSize}px Arial, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(titleText, legendX + legendPadding, legendY + legendPadding + scaled(6));

      legendItems.forEach((item, index) => {
        const y = legendY + legendPadding + scaled(28) + index * rowH;
        const symbolX = legendX + legendPadding + symbolRadius;
        const textX = symbolX + symbolRadius + symbolGap;

        if (item.type === "selected") {
          ctx.beginPath();
          ctx.arc(symbolX, y, symbolRadius + scaled(3), 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
          ctx.fill();
          ctx.strokeStyle = item.color;
          ctx.lineWidth = scaled(3);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(symbolX, y, symbolRadius - scaled(2), 0, Math.PI * 2);
          ctx.fillStyle = item.color;
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
          ctx.lineWidth = scaled(2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(symbolX, y, symbolRadius, 0, Math.PI * 2);
          ctx.fillStyle = item.color;
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
          ctx.lineWidth = scaled(2);
          ctx.stroke();
        }

        ctx.fillStyle = "#263238";
        ctx.font = `${legendTextSize}px Arial, sans-serif`;
        ctx.fillText(item.label, textX, y);
      });

      ctx.restore();
    }

    // --- Scale bar ---
    const scale = calculateScaleBar
    ? calculateScaleBar(mapInstance)
    : null;

    if (scale) {
      ctx.save();

      const scaleTextSize = scaled(17);
      const scalePaddingX = scaled(14);
      const scalePaddingY = scaled(10);
      const barH = scaled(9);

      ctx.font = `${scaleTextSize}px Arial, sans-serif`;
      ctx.textBaseline = "middle";

      const labelWidth = ctx.measureText(scale.label).width;
      const pillW = Math.ceil(scale.widthPx + labelWidth + scalePaddingX * 3);
      const pillH = scaled(42);

      const scaleX = scaled(24);
      const scaleY = height - scaled(38);

      ctx.fillStyle = "rgba(255, 255, 255, 0.93)";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(scaleX - scalePaddingX, scaleY - pillH / 2, pillW, pillH, scaled(10));
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "#263238";
      ctx.lineWidth = scaled(3);

      ctx.beginPath();
      ctx.moveTo(scaleX, scaleY);
      ctx.lineTo(scaleX + scale.widthPx, scaleY);
      ctx.stroke();

      ctx.lineWidth = scaled(2);
      ctx.beginPath();
      ctx.moveTo(scaleX, scaleY - barH);
      ctx.lineTo(scaleX, scaleY + barH);
      ctx.moveTo(scaleX + scale.widthPx, scaleY - barH);
      ctx.lineTo(scaleX + scale.widthPx, scaleY + barH);
      ctx.stroke();

      ctx.fillStyle = "#263238";
      ctx.font = `${scaleTextSize}px Arial, sans-serif`;
      ctx.fillText(scale.label, scaleX + scale.widthPx + scalePaddingX, scaleY);

      ctx.restore();
    }

    // --- Download ---
    const filename = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.png`;

    const link = document.createElement("a");
    link.href = exportCanvas.toDataURL("image/png");
    link.download = filename;
    link.click();

   } finally {
    if (restoreLabelsAfterExport) {
      restoreLabelsAfterExport(previousLiveLabelVisibility);
    }
  }
}

// scale distance helper
function calculateMapScaleBar(mapInstance = window.map || window.viewerMap || null) {
  if (!mapInstance) return null;

  const canvas = mapInstance.getCanvas();
  const center = mapInstance.getCenter();
  const y = canvas.height - 80;

  const leftLngLat = mapInstance.unproject([80, y]);
  const rightLngLat = mapInstance.unproject([280, y]);

  const metres = leftLngLat.distanceTo(rightLngLat);

  const niceDistances = [
    100, 200, 500,
    1000, 2000, 5000,
    10000, 20000, 50000,
    100000, 200000, 500000,
    1000000
  ];

  const target = niceDistances.find((d) => d >= metres / 2) || niceDistances[niceDistances.length - 1];

  const metresPerPixel = metres / 200;
  const widthPx = target / metresPerPixel;

  const label = target >= 1000
    ? `${target / 1000} km`
    : `${target} m`;

    return {
    widthPx: Math.max(90, Math.min(widthPx, 320)),
    label
  };
}

window.calculateMapScaleBar = calculateMapScaleBar;


async function loadDirectLinkedRecord(caalId) {
  if (!caalId) return null;

  const response = await fetch(
    `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    console.error("Direct linked record resolve failed:", data);
    return null;
  }

  return data;
}

function relatedRecordTypeIconHtml(recordType) {
  const type = String(recordType || "").trim();

  if (
    typeof caalRecordTypeIconSvg !== "function" ||
    typeof caalRecordTypeIconClass !== "function"
  ) {
    return "";
  }

  return `
    <span
      class="related-id-chip-icon ${caalRecordTypeIconClass(type)}"
      aria-hidden="true"
    >
      ${caalRecordTypeIconSvg(type)}
    </span>
  `;
}

function relatedRecordTypeFromCaalId(caalId) {
  const id = String(caalId || "").trim();

  if (/^Mon_/i.test(id)) return "monument";
  if (/^Ar_/i.test(id)) return "archive";

  if (/^RSL_/i.test(id)) return "rs3_line";
  if (/^RSG_/i.test(id)) return "rs3_group";
  if (/^RS_/i.test(id)) return "rs3_poly";

  if (/^Act_/i.test(id)) return "institution";
  if (/^Vern_/i.test(id)) return "vernacular";
  if (/^Dataset_/i.test(id) || /^Ds_/i.test(id)) return "dataset";

  return "";
}

function relatedRecordTypeIconHtml(recordType) {
  const type = String(recordType || "").trim();

  if (
    !type ||
    typeof caalRecordTypeIconSvg !== "function" ||
    typeof caalRecordTypeIconClass !== "function"
  ) {
    return "";
  }

  return `
    <span
      class="related-id-chip-icon ${caalRecordTypeIconClass(type)}"
      aria-hidden="true"
    >
      ${caalRecordTypeIconSvg(type)}
    </span>
  `;
}

window.relatedRecordTypeFromCaalId = relatedRecordTypeFromCaalId;
window.relatedRecordTypeIconHtml = relatedRecordTypeIconHtml;

// Relation display helpers for records returned by /api/records/resolve.
// These read the normalised record.relations array.
function getRecordRelations(record) {
  return Array.isArray(record?.relations) ? record.relations : [];
}

function getRelatedIdsFromRecord(record, options = {}) {
  const {
    onlyMonuments = false,
    includeMissing = true
  } = options;

  return Array.from(
    new Set(
      getRecordRelations(record)
        .filter((rel) => {
          if (!rel?.related_caal_id) return false;

          if (!includeMissing && rel.related_id_exists === false) {
            return false;
          }

          if (onlyMonuments) {
            return (
              rel.related_id_found_in === "CAAL_Monuments" ||
              String(rel.related_caal_id).startsWith("Mon_")
            );
          }

          return true;
        })
        .map((rel) => String(rel.related_caal_id).trim())
        .filter(Boolean)
    )
  );
}

function relationChipClass(rel) {
  const missing = rel?.related_id_exists === false;
  return missing
    ? "related-id-chip related-id-chip-invalid related-id-chip-unresolved"
    : "related-id-chip";
}

window.getRecordRelations = getRecordRelations;
window.getRelatedIdsFromRecord = getRelatedIdsFromRecord;
window.groupRecordRelationsByType = groupRecordRelationsByType;
window.relationChipClass = relationChipClass;

function getDirectionalRelationType(rel) {
  const relationType = String(
    rel?.relation_type_norm ||
    rel?.relation_type ||
    ""
  )
    .trim()
    .toLowerCase();

  const direction = String(
    rel?.relation_direction || ""
  )
    .trim()
    .toLowerCase();

  const directionalLabels = {
    "contains / is contained within": {
      forward: "contains",
      reverse: "is contained within"
    },

    "is created by / created": {
      forward: "is created by",
      reverse: "created"
    },

    "is referred to in / refers to": {
      forward: "is referred to in",
      reverse: "refers to"
    },

    "is represented by / represents": {
      forward: "is represented by",
      reverse: "represents"
    },

    "is superseded by / supersedes": {
      forward: "is superseded by",
      reverse: "supersedes"
    }
  };

  const pair = directionalLabels[relationType];

  if (pair?.[direction]) {
    return pair[direction];
  }

  /*
    These currently have no approved reciprocal term in the database,
    or are intentionally symmetric.
  */
  return (
    rel?.relation_type ||
    rel?.relation_type_norm ||
    "Related resource"
  );
}

window.getDirectionalRelationType = getDirectionalRelationType;

function groupRecordRelationsByType(record) {
  return getRecordRelations(record).reduce((groups, rel) => {
    const type = getDirectionalRelationType(rel);

    if (!groups[type]) groups[type] = [];
    groups[type].push(rel);

    return groups;
  }, {});
}


// ========================================================
// RELATED CAAL_ID AUTOCOMPLETE
// Used by monument/archive related-resource chip inputs
// ========================================================
// This only suggests IDs. Existence is still checked separately before save/display.
let relatedSuggestAbortController = null;

function getActiveAppLanguageForSuggest() {
  if (typeof getCurrentLanguage === "function") {
    return getCurrentLanguage();
  }

  const htmlLang = document.documentElement?.lang;
  if (htmlLang) return htmlLang;

  return "en";
}

function escapeHtmlForSuggest(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchRelatedCaalIdSuggestions(query) {
  const q = String(query || "").trim();

  if (q.length < 2) {
    return [];
  }

  if (relatedSuggestAbortController) {
    relatedSuggestAbortController.abort();
  }

  relatedSuggestAbortController = new AbortController();

  const params = new URLSearchParams({
    q,
    lang: getActiveAppLanguageForSuggest()
  });

  const response = await fetch(`/api/records/suggest?${params.toString()}`, {
    credentials: "include",
    signal: relatedSuggestAbortController.signal
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Suggestion lookup failed");
  }

  return Array.isArray(data.suggestions) ? data.suggestions : [];
}

function ensureRelatedSuggestDropdown(fieldEl) {
  const box = fieldEl.querySelector(".caal-chip-input-box") || fieldEl;

  let dropdown = box.querySelector(".related-id-suggest-dropdown");

  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "related-id-suggest-dropdown";
    dropdown.hidden = true;
    box.appendChild(dropdown);
  }

  return dropdown;
}

function isRelatedCaalIdSuggestOpen(fieldEl) {
  const dropdown = fieldEl?.querySelector(".related-id-suggest-dropdown");
  return !!dropdown && !dropdown.hidden;
}

function renderRelatedCaalIdSuggestions(fieldEl, suggestions, activeIndex = -1, options = {}) {
  const dropdown = ensureRelatedSuggestDropdown(fieldEl);
  const onPick = options.onPick;

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
    return;
  }

  dropdown.innerHTML = suggestions.map((item, index) => {
    const caalId = escapeHtmlForSuggest(item.caal_id);
    const recordType = escapeHtmlForSuggest(String(item.record_type || "").toUpperCase());
    const title = escapeHtmlForSuggest(item.title || item.subtitle || "");
    const activeClass = index === activeIndex ? " is-active" : "";

    return `
      <button
        type="button"
        class="related-id-suggest-option${activeClass}"
        data-index="${index}"
      >
        <span class="related-id-suggest-main">${caalId}</span>
        <span class="related-id-suggest-meta">
          ${recordType}${title ? " · " + title : ""}
        </span>
      </button>
    `;
  }).join("");

  dropdown.hidden = false;

  dropdown.querySelectorAll(".related-id-suggest-option").forEach((btn) => {
    btn.addEventListener("mousedown", async (event) => {
      event.preventDefault();

      const index = Number(btn.dataset.index);
      if (typeof onPick === "function") {
        await onPick(index);
      }
    });
  });
}

function clearRelatedCaalIdSuggestions(fieldEl) {
  renderRelatedCaalIdSuggestions(fieldEl, [], -1);
}

function wireRelatedCaalIdSuggestInput({ fieldEl, input, addChip }) {
  console.log("wireRelatedCaalIdSuggestInput called", { fieldEl, input });
  
  if (!fieldEl || !input || typeof addChip !== "function") return;

  if (input.dataset.suggestWired === "true") {
    console.log("suggest already wired", input);
    return;
  }

  input.dataset.suggestWired = "true";

  let suggestTimer = null;
  let suggestions = [];
  let activeIndex = -1;

  function clearSuggestions() {
    suggestions = [];
    activeIndex = -1;
    clearRelatedCaalIdSuggestions(fieldEl);
  }

  async function pickSuggestion(index) {
    const picked = suggestions[index];
    if (!picked?.caal_id) return;

    input.value = "";
    clearSuggestions();

    await addChip(picked.caal_id);
    input.focus();
  }

  input.addEventListener("input", () => {
    console.log("suggest input event", input.value);
    
    clearTimeout(suggestTimer);

    suggestTimer = setTimeout(async () => {
      const query = input.value.trim();
      console.log("suggest query", query);

      if (query.length < 2) {
        clearSuggestions();
        return;
      }

      try {
        suggestions = await fetchRelatedCaalIdSuggestions(query);
        activeIndex = suggestions.length ? 0 : -1;

        renderRelatedCaalIdSuggestions(fieldEl, suggestions, activeIndex, {
          onPick: async (index) => {
            await pickSuggestion(index);
          }
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          console.warn("Related CAAL_ID suggestions failed:", error);
        }

        clearSuggestions();
      }
    }, 180);
  });

  input.addEventListener("keydown", async (event) => {
    const hasSuggestions = suggestions.length > 0;

    if (event.key === "ArrowDown" && hasSuggestions) {
      event.preventDefault();

      activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);

      renderRelatedCaalIdSuggestions(fieldEl, suggestions, activeIndex, {
        onPick: async (index) => {
          await pickSuggestion(index);
        }
      });

      return;
    }

    if (event.key === "ArrowUp" && hasSuggestions) {
      event.preventDefault();

      activeIndex = Math.max(activeIndex - 1, 0);

      renderRelatedCaalIdSuggestions(fieldEl, suggestions, activeIndex, {
        onPick: async (index) => {
          await pickSuggestion(index);
        }
      });

      return;
    }

    if (event.key === "Enter" && hasSuggestions && activeIndex >= 0) {
      event.preventDefault();
      event.stopPropagation();

      await pickSuggestion(activeIndex);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearSuggestions();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      clearSuggestions();
    }, 150);
  });
}

// --------------------------------------------------------
// Shared text helpers
// --------------------------------------------------------

function safeValue(value) {
  if (value === null || value === undefined || value === "") {
    return t("not_recorded", "Not recorded");
  }
  return value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

window.escapeHtml = escapeHtml;

function displayLookup(fieldName, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return t("not_recorded", "Not recorded");
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


function displayLanguageName(value) {
  if (!value) return value;

  const raw = String(value).trim();

  const aliases = {
    en: "English",
    english: "English",
    ru: "Russian",
    russian: "Russian",
    zh: "Chinese",
    chinese: "Chinese",
    kk: "Kazakh",
    kazakh: "Kazakh",
    ky: "Kyrgyz",
    kyrgyz: "Kyrgyz",
    tg: "Tajik",
    tajik: "Tajik",
    tk: "Turkmen",
    turkmen: "Turkmen",
    uz: "Uzbek",
    uzbek: "Uzbek"
  };

  const canonical = aliases[raw.toLowerCase()] || raw;

  const rows = window.sharedLookups?.language_display || [];
  const match = rows.find((row) => String(row.value) === canonical);

  return match?.label || raw;
}

window.displayLanguageName = displayLanguageName;


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
    return t("not_recorded", "Not recorded");
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
// Shared SVG icons
// --------------------------------------------------------
function svgEyeIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M12 5c5 0 8.5 4.2 9.7 6.1a1.7 1.7 0 0 1 0 1.8C20.5 14.8 17 19 12 19s-8.5-4.2-9.7-6.1a1.7 1.7 0 0 1 0-1.8C3.5 9.2 7 5 12 5Zm0 2C8.1 7 5.2 10.1 4.1 12c1.1 1.9 4 5 7.9 5s6.8-3.1 7.9-5C18.8 10.1 15.9 7 12 7Zm0 2.2A2.8 2.8 0 1 1 12 14.8 2.8 2.8 0 0 1 12 9.2Zm0 2A.8.8 0 1 0 12 12.8.8.8 0 0 0 12 11.2Z"
        fill="currentColor"
      />
    </svg>
  `;
}

function svgTargetIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M11 3a1 1 0 0 1 2 0v1.1A8 8 0 0 1 19.9 11H21a1 1 0 1 1 0 2h-1.1A8 8 0 0 1 13 19.9V21a1 1 0 1 1-2 0v-1.1A8 8 0 0 1 4.1 13H3a1 1 0 1 1 0-2h1.1A8 8 0 0 1 11 4.1V3Zm1 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 3.2A2.8 2.8 0 1 1 12 14.8 2.8 2.8 0 0 1 12 9.2Z"
        fill="currentColor"
      />
    </svg>
  `;
}

function svgCloseIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M6.3 5.3a1 1 0 0 1 1.4 0L12 9.6l4.3-4.3a1 1 0 1 1 1.4 1.4L13.4 11l4.3 4.3a1 1 0 0 1-1.4 1.4L12 12.4l-4.3 4.3a1 1 0 0 1-1.4-1.4L10.6 11 6.3 6.7a1 1 0 0 1 0-1.4Z"
        fill="currentColor"
      />
    </svg>
  `;
}

function svgMapOptionsIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M4 7h10a2 2 0 1 0 0-2H4a1 1 0 0 0 0 2Zm16 0h-2a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2ZM4 13h2a2 2 0 1 0 0-2H4a1 1 0 1 0 0 2Zm8 0h8a1 1 0 1 0 0-2h-8a1 1 0 1 0 0 2ZM4 19h10a2 2 0 1 0 0-2H4a1 1 0 1 0 0 2Zm16 0h-2a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2Z"
        fill="currentColor"
      />
    </svg>
  `;
}

function svgCopyIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M8 7.5A2.5 2.5 0 0 1 10.5 5h7A2.5 2.5 0 0 1 20 7.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 8 14.5v-7Zm2.5-.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-7ZM4 10.5A2.5 2.5 0 0 1 6.5 8H7v2h-.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V17h2v.5A2.5 2.5 0 0 1 13.5 20h-7A2.5 2.5 0 0 1 4 17.5v-7Z"
        fill="currentColor"
      />
    </svg>
  `;
}

function caalRecordTypeIconSvg(recordType) {
  switch (String(recordType || "").trim()) {
    case "monument":
      return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path
            d="M4 18.5h16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
          <path
            d="M6.2 18.2V15.8l2.4-1.7 2.4 1.7v2.4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <path
            d="M13 18.2v-4l2.6-1.8 2.2 1.6v4.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <path
            d="M8.6 14.1v-2.4l2.5-1.8 2.5 1.8v2.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <path
            d="M10.5 7.8 12 5.8l1.5 2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      `;

    case "archive":
      return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <rect
            x="4"
            y="6"
            width="16"
            height="4"
            rx="1.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          />
          <path
            d="M6 10.2h12v7.3a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 17.5Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          />
          <path
            d="M10 13.2h4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      `;

    case "institution":
      return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="M3.5 9 12 4l8.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 10.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M6.5 10.5v7M10 10.5v7M14 10.5v7M17.5 10.5v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M4 18.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `;

    case "vernacular":
      return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="M5 10.8 12 5l7 5.8v7.2a1 1 0 0 1-1 1h-4.2v-5h-3.6v5H6a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `;

    case "rs3_poly":
      return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="M8 3.8 17.2 7v10l-9.2 4.2L3.5 15.8V7.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `;

    case "rs3_line":
      return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="M4 16c2.4-5.3 4.8-7.7 7-7.7 2 0 2.9 2.4 4.7 2.4 1.5 0 2.9-1.4 4.3-3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `;

    case "rs3_group":
      return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <rect x="3.5" y="4.5" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
          <rect x="14" y="4.5" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
          <rect x="8.8" y="13" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
        </svg>
      `;
    case "dataset":
    case "cartography":
      return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <rect
            x="4"
            y="5"
            width="16"
            height="14"
            rx="1.8"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          />
          <path
            d="M7 15.5 10.3 12.3 12.7 14.6 15.2 11.4 18 15.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M7 8.5h4.2M7 10.7h2.7"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <circle
            cx="17"
            cy="8.5"
            r="1.1"
            fill="currentColor"
          />
        </svg>
      `;

    default:
      return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/>
        </svg>
      `;
  }
}

function svgViewerMeasurementIcon() {
  return `
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
    >
      <rect
        x="2.5"
        y="7"
        width="19"
        height="10"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />

      <path
        d="
          M6 7v4
          M9 7v2.5
          M12 7v4
          M15 7v2.5
          M18 7v4
        "
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function caalRecordTypeIconClass(recordType) {
  return `caal-record-type-icon caal-record-type-icon-${String(recordType || "").trim()}`;
}

window.svgEyeIcon = svgEyeIcon;
window.svgTargetIcon = svgTargetIcon;
window.svgCloseIcon = svgCloseIcon;
window.svgMapOptionsIcon = svgMapOptionsIcon;
window.svgCopyIcon = svgCopyIcon;

// --------------------------------------------------------
// Shared language application
// --------------------------------------------------------
function getCachedUiTranslations(lang) {
  try {
    const raw = localStorage.getItem(`${APP_TRANSLATIONS_STORAGE_PREFIX}${lang}`);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Could not read cached UI translations:", error);
    return null;
  }
}

function setCachedUiTranslations(lang, translations) {
  try {
    localStorage.setItem(
      `${APP_TRANSLATIONS_STORAGE_PREFIX}${lang}`,
      JSON.stringify(translations || {})
    );
  } catch (error) {
    console.warn("Could not cache UI translations:", error);
  }
}

function sameTranslations(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

function applyTranslationsToDom() {
  document.documentElement.lang = currentLang;

  const select = document.getElementById("languageSelect");
  if (select) {
    select.value = currentLang;
  }

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key, el.textContent);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    el.placeholder = t(key, el.placeholder);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    el.title = t(key, el.title);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    el.setAttribute("aria-label", t(key, el.getAttribute("aria-label")));
  });
}

async function loadUiTranslations(lang = null) {
  const activeLang = lang || getCurrentLanguage();

  try {
    const response = await fetch(
      `/api/ui/translations?lang=${encodeURIComponent(activeLang)}`,
      {
        method: "GET",
        credentials: "include"
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error("Failed to load UI translations:", data);
      return null;
    }

    return data.translations || {};
  } catch (error) {
    console.error("Failed to load UI translations:", error);
    return null;
  }
}

function getShellTranslation(key, lang = currentLang) {
  const caFallbackLangs = ["kk", "ky", "tg", "tk", "uz"];
  const fallbackLang = caFallbackLangs.includes(lang) ? "ru" : "en";

  return (
    SHELL_TRANSLATIONS?.[lang]?.[key] ||
    SHELL_TRANSLATIONS?.[fallbackLang]?.[key] ||
    SHELL_TRANSLATIONS?.en?.[key] ||
    null
  );
}

function t(key, fallback = null) {
  const value = uiTranslations[key];

  if (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ""
  ) {
    return value;
  }

  const shellValue = getShellTranslation(key);

  if (
    shellValue !== null &&
    shellValue !== undefined &&
    String(shellValue).trim() !== ""
  ) {
    return shellValue;
  }

  return fallback || key;
}

window.t = t;

async function applyLanguage({ notify = true } = {}) {
  const cached = getCachedUiTranslations(currentLang);

  uiTranslations = cached && typeof cached === "object"
    ? cached
    : {};

  applyTranslationsToDom();

  const fresh = await loadUiTranslations(currentLang);

  if (fresh && !sameTranslations(fresh, uiTranslations)) {
    uiTranslations = fresh;
    setCachedUiTranslations(currentLang, fresh);
    applyTranslationsToDom();
  } else if (fresh) {
    setCachedUiTranslations(currentLang, fresh);
  }

  applyWorkspaceHeaderText(getCurrentPageName(), window.appSession);

  if (notify) {
    document.dispatchEvent(new CustomEvent("app:languageChanged"));
  }
}

window.applyLanguage = applyLanguage;

function bindLanguageSelector() {
  const languageSelect = document.getElementById("languageSelect");
  if (!languageSelect || languageSelect.dataset.languageBound === "true") return;

  languageSelect.addEventListener("change", async () => {
    const nextLang = languageSelect.value || "en";

    if (
      typeof window.monumentCanChangeLanguage === "function" &&
      !window.monumentCanChangeLanguage()
    ) {
      languageSelect.value = currentLang;
      return;
    }

    if (
      typeof window.archiveCanChangeLanguage === "function" &&
      !window.archiveCanChangeLanguage()
    ) {
      languageSelect.value = currentLang;
      return;
    }

    currentLang = nextLang;

    if (getCurrentSessionUserId() !== null && getCurrentSessionUserId() !== undefined) {
      setStoredLanguage(currentLang);
      markLanguageUserSelected();
    }

    await applyLanguage();
  });

  languageSelect.dataset.languageBound = "true";
}

// --------------------------------------------------------
// Initial language/session load
// --------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  bindLogoutButtons();

  await loadBackendSession();

  renderSignedInUserPill();

  currentLang = resolveInitialLanguage();

  if (currentLang) {
    localStorage.setItem("caal_ui_language_bootstrap", currentLang);
  }

  initialiseLanguageSelector();
  bindLanguageSelector();

  await applyLanguage({ notify: false });
  
  renderSignedInUserPill();
});