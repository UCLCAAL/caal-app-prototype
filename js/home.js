document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  const logoutBtn =
    document.getElementById("logoutBtn") ||
    document.querySelector(".js-logout-btn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", {
          method: "POST"
        });
      } catch (error) {
        console.error("Logout failed:", error);
      }

      window.location.href = "index.html";
    });
  }

  initHomeGlobalSearch();
});

let homeGlobalSearchAbortController = null;
let homeGlobalSearchTimer = null;
let homeGlobalSearchRecords = [];

function homeCurrentLanguageCode() {
  return (
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en"
  );
}

function homeSafeText(value, fallback = "") {
  const text = String(value ?? fallback ?? "").trim();

  if (!text) {
    return `<span class="empty-value">${t("not_recorded", "Not recorded")}</span>`;
  }

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function homeTruncateText(value, maxLength = 74) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

function homeResourceTypeLabel(record) {
  const type = String(record?.record_type || "").trim();

  switch (type) {
    case "archive":
      return t("nav_archive", "Archive");

    case "monument":
      return t("nav_monuments", "Monuments");

    case "institution":
      return t("institutions", "Institutions");

    case "dataset":
      return t("datasets", "Datasets");

    case "rs3_poly":
      return t("rs3_polygons", "RS3 polygons");

    case "rs3_line":
      return t("rs3_lines", "RS3 lines");

    case "rs3_group":
      return t("rs3_groups", "RS3 groups");

    case "vernacular":
      return t("vernacular", "Vernacular");

    default:
      return record?.dataset_label || t("caal_record", "CAAL record");
  }
}

function homeRelatedLine(record) {
  const relatedId = String(record?.matched_related_caal_id || "").trim();

  if (!relatedId) return "";

  const relatedLabel = homeTruncateText(record?.matched_related_display_label, 52);
  const relatedText = relatedLabel
    ? `${relatedId} - ${relatedLabel}`
    : relatedId;

  return `
    <div class="home-global-result-related">
      ${t("related_to", "Related to")} ${homeSafeText(relatedText)}
    </div>
  `;
}

function homeResultUrl(record) {
  if (typeof getRelatedRecordUrl !== "function") return null;

  return getRelatedRecordUrl(
    record?.caal_id,
    record?.record_type,
    null
  );
}

function homeGroupRecords(records) {
  const groups = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    const type = String(record?.record_type || "other").trim() || "other";

    if (!groups.has(type)) {
      groups.set(type, []);
    }

    groups.get(type).push(record);
  });

  const preferredOrder = [
    "monument",
    "archive",
    "institution",
    "dataset",
    "rs3_poly",
    "rs3_line",
    "rs3_group",
    "vernacular",
    "other"
  ];

  return preferredOrder
    .filter((type) => groups.has(type))
    .map((type) => ({
      type,
      records: groups.get(type)
    }));
}

async function homeFetchGlobalSearch(query) {
  if (homeGlobalSearchAbortController) {
    homeGlobalSearchAbortController.abort();
  }

  homeGlobalSearchAbortController = new AbortController();

  const params = new URLSearchParams();
  params.set("q", query);
  params.set("context", "global");
  params.set("limit", "36");
  params.set("lang", homeCurrentLanguageCode());

  const response = await fetch(`/api/search/resources?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    signal: homeGlobalSearchAbortController.signal
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data.detail ||
      data.error ||
      "Global resource search failed"
    );
  }

  return Array.isArray(data.records) ? data.records : [];
}

function homeSetSearchStatus(message, { loading = false, hidden = false } = {}) {
  const status = document.getElementById("homeGlobalSearchStatus");
  if (!status) return;

  status.hidden = hidden;

  if (hidden) {
    status.innerHTML = "";
    return;
  }

  status.innerHTML = loading
    ? `<span class="mini-spinner"></span>${homeSafeText(message)}`
    : homeSafeText(message);
}

function homeCopyIconSvg() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
      <path
        d="M8 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V7Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      />
      <path
        d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function homeCheckIconSvg() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
      <path
        d="M9.2 16.6 4.9 12.3l1.4-1.4 2.9 2.9 8.5-8.5 1.4 1.4-9.9 9.9Z"
        fill="currentColor"
      />
    </svg>
  `;
}

function homeCurrentSearchQuery() {
  return String(document.getElementById("homeGlobalSearchInput")?.value || "").trim();
}

function homeFullSearchUrlForType(recordType) {
  const query = homeCurrentSearchQuery();
  const params = new URLSearchParams();

  if (query) {
    params.set("text", query);
  }

  if (recordType === "monument") {
    return `monuments.html?${params.toString()}`;
  }

  if (recordType === "archive") {
    return `archive.html?${params.toString()}`;
  }

  return null;
}

function homeRenderGlobalSearchResults(records) {
  const resultsEl = document.getElementById("homeGlobalSearchResults");
  if (!resultsEl) return;

  const rows = Array.isArray(records) ? records : [];

  if (!rows.length) {
    resultsEl.hidden = false;
    resultsEl.innerHTML = `
      <div class="home-global-search-empty">
        ${t("no_matching_records", "No matching records found.")}
      </div>
    `;
    return;
  }

  const groups = homeGroupRecords(rows);

  resultsEl.hidden = false;
  resultsEl.innerHTML = `
    <div class="home-global-results-heading">
      <strong>${t("top_matches", "Top matches")}</strong>
      <span>${rows.length} ${t("records", "records")}</span>
    </div>

    <div class="home-global-results-grid">
      ${groups.map(homeRenderResultGroup).join("")}
    </div>
  `;

  homeWireGlobalSearchButtons();
}

function homeRenderResultGroup(group) {
  const label = homeResourceTypeLabel({
    record_type: group.type
  });

  const visible = group.records.slice(0, 6);
  const fullSearchUrl = homeFullSearchUrlForType(group.type);

  return `
    <section class="home-global-result-group">
      <h4 class="home-global-result-group-heading">
        <span class="home-global-result-group-title">
          ${homeSafeText(label)}
          <span class="home-global-result-group-count">(${group.records.length})</span>

          ${
            fullSearchUrl
              ? `<a
                  class="home-global-group-more-link"
                  href="${homeSafeText(fullSearchUrl)}"
                  target="_blank"
                  rel="noopener"
                >
                  ${t("view_all", "View all")}
                </a>`
              : ""
          }
        </span>
      </h4>

      <div class="home-global-result-stack">
        ${visible.map((record, index) => homeRenderResultCard(record, index, group.type)).join("")}
      </div>
    </section>
  `;
}

function homeRenderResultCard(record, index, groupType = "") {
  const caalId = String(record?.caal_id || "").trim();
  const title = record?.display_label || caalId;
  const fullUrl = homeResultUrl(record);

  const sourceLabel =
    record?.dataset_label ||
    record?.source_table ||
    record?.source_schema ||
    "";

  const typeLabel = homeResourceTypeLabel(record);

  const showSourceLabel =
    sourceLabel &&
    String(sourceLabel).trim().toLowerCase() !== String(typeLabel).trim().toLowerCase() &&
    String(sourceLabel).trim().toLowerCase() !== String(groupType).trim().toLowerCase();

  return `
    <article class="home-global-result-card home-global-result-card-compact">
      <h5>${homeSafeText(title)}</h5>

      <div class="home-global-result-id-row">
        <span class="home-global-result-id">
          ${homeSafeText(caalId)}
        </span>

        ${
          caalId
            ? `<button
                type="button"
                class="copy-field-btn home-global-copy-icon-btn"
                data-copy-value="${homeSafeText(caalId)}"
                title="${t("copy_to_clipboard", "Copy to clipboard")}"
                aria-label="${t("copy_to_clipboard", "Copy to clipboard")}: ${homeSafeText(caalId)}"
              >
                ${homeCopyIconSvg()}
              </button>`
            : ""
        }
      </div>

      ${
        showSourceLabel
          ? `<div class="home-global-result-source">${homeSafeText(sourceLabel)}</div>`
          : ""
      }

      ${homeRelatedLine(record)}

      ${
        fullUrl
          ? `<div class="home-global-result-actions">
              <a
                class="action-btn subtle home-global-open-link"
                href="${homeSafeText(fullUrl)}"
                target="_blank"
                rel="noopener"
              >
                ${t("open_record", "Open record")}
              </a>
            </div>`
          : ""
      }
    </article>
  `;
}

function homeWireGlobalSearchButtons() {
  document.querySelectorAll(".home-global-copy-icon-btn").forEach((btn) => {
    if (btn.dataset.copyWired === "true") return;

    btn.dataset.copyWired = "true";

    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const value = btn.dataset.copyValue || "";
      if (!value) return;

      try {
        await navigator.clipboard.writeText(value);

        btn.classList.remove("copied", "copy-pulse");

        // Restart animation if clicked repeatedly.
        void btn.offsetWidth;

        btn.classList.add("copied", "copy-pulse");
        btn.title = t("copied", "Copied");

        window.setTimeout(() => {
          btn.classList.remove("copied", "copy-pulse");
          btn.title = t("copy_to_clipboard", "Copy to clipboard");
        }, 1200);
      } catch (error) {
        console.warn("Clipboard copy failed:", error);
      }
    });
  });
}

async function homeRunGlobalSearch(query) {
  const cleanQuery = String(query || "").trim();

  if (cleanQuery.length < 2) {
    homeGlobalSearchRecords = [];
    homeSetSearchStatus("", { hidden: true });

    const resultsEl = document.getElementById("homeGlobalSearchResults");
    if (resultsEl) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = "";
    }

    return;
  }

  homeSetSearchStatus(t("searching", "Searching..."), {
    loading: true
  });

  try {
    const records = await homeFetchGlobalSearch(cleanQuery);
    homeGlobalSearchRecords = records;
    homeSetSearchStatus("", { hidden: true });
    homeRenderGlobalSearchResults(records);
  } catch (error) {
    if (error.name === "AbortError") return;

    console.error("Home global search failed:", error);

    homeSetSearchStatus(
      t("related_caal_search_failed", "Related CAAL records could not be loaded.")
    );
  }
}

function initHomeGlobalSearch() {
  const form = document.getElementById("homeGlobalSearchForm");
  const input = document.getElementById("homeGlobalSearchInput");

  if (!form || !input) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await homeRunGlobalSearch(input.value);
  });

  input.addEventListener("input", () => {
    if (homeGlobalSearchTimer) {
      window.clearTimeout(homeGlobalSearchTimer);
    }

    const query = input.value;

    homeGlobalSearchTimer = window.setTimeout(() => {
      homeRunGlobalSearch(query);
    }, 450);
  });

  document.addEventListener("app:languageChanged", () => {
    if (input.value.trim().length >= 2) {
      homeRunGlobalSearch(input.value);
    }
  });
}