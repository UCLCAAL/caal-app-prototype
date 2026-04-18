// ========================================================
// ARCHIVE PAGE LOGIC
// Starter version using local sample data in JS
// Need to replace ARCHIVE_SAMPLE_RECORDS with API later
// ========================================================

// DOM
// --------------------------------------------------------
const archiveSearch = document.getElementById("archiveSearch");
const toggleArchiveFiltersBtn = document.getElementById("toggleArchiveFiltersBtn");
const archiveFiltersPanel = document.getElementById("archiveFiltersPanel");
const clearArchiveFiltersBtn = document.getElementById("clearArchiveFiltersBtn");

const filterArchiveRelatedCountries = document.getElementById("filterArchiveRelatedCountries");
const filterArchiveRelatedReligions = document.getElementById("filterArchiveRelatedReligions");
const filterArchiveRelatedSubjects = document.getElementById("filterArchiveRelatedSubjects");
const filterArchiveContentType = document.getElementById("filterArchiveContentType");
const filterArchiveLanguages = document.getElementById("filterArchiveLanguages");

const archiveResultsList = document.getElementById("archiveResultsList");
const archiveResultsCount = document.getElementById("archiveResultsCount");
const archiveRecordDetails = document.getElementById("archiveRecordDetails");

// State
// --------------------------------------------------------
let archiveAllRecords = [];
let archiveVisibleRecords = [];
let archiveSelectedRecord = null;

// Temporary local sample records
// Replace with API response later
// --------------------------------------------------------
const ARCHIVE_SAMPLE_RECORDS = [
  {
    id: 1,
    record_source: "workspace",
    is_editable: true,

    "Level": "Item",
    "Original Reference": "KZ-ARCH-001",
    "Associated CAAL_ID": "Mon_KZ_IICAS1-002757",
    "Original Title": "Field notebook extract",
    "English Title": "Field notebook extract",
    "Content Type": "Text",
    "Description": "Short field note concerning a late prehistoric site.",
    "Description - alternative language": "Краткая полевая заметка о позднеисторическом памятнике.",
    "Number and Type of Original Material": "1 notebook page",
    "Size and Dimensions of Original Material": "A4",
    "Condition of Original Material": "Good",
    "Related Countries": ["Kazakhstan"],
    "Related Towns and Cities": "Aktau",
    "Related Religions": [],
    "Related Subjects": ["Archaeology", "Survey"],
    "Other Subjects": "Surface finds",
    "Dates of Original Material": "1987",
    "Author of the Original Material": "A. Example",
    "Publisher of the Original Material": "",
    "Editor of the Original Material": "",
    "Volume and Issue Number": "",
    "Languages of Material": ["Russian"],
    "Script of Material": "Cyrillic",
    "Writing System": "Alphabetic",
    "still_under_copyright": "unknown",
    "Copyright Holder Name": "",
    "Copyright Attribution": "",
    "Digital Folder Name": "KZ_ARCH_001",
    "Digital Files Name": "scan_001.jpg",
    "Creation Date of Digital Files": "2024-03-10",
    "Format of Digital Files": "JPEG",
    "Number of Digital Files": "1",
    "Colour": "Colour",
    "Resolution": "300 dpi",
    "Archive Recorder": "Christine Spencer",
    "Date of Recording": "2026-04-18",
    "Resource": "Local archive"
  },
  {
    id: 2,
    record_source: "caal",
    is_editable: false,

    "Level": "Publication",
    "Original Reference": "CAAL-PUB-002",
    "Associated CAAL_ID": "",
    "Original Title": "Regional archaeological inventory",
    "English Title": "Regional archaeological inventory",
    "Content Type": "Publication",
    "Description": "Published inventory of archaeological materials.",
    "Description - alternative language": "",
    "Number and Type of Original Material": "1 volume",
    "Size and Dimensions of Original Material": "Book",
    "Condition of Original Material": "Fair",
    "Related Countries": ["Kazakhstan"],
    "Related Towns and Cities": "Atyrau",
    "Related Religions": ["Islam"],
    "Related Subjects": ["Archaeology"],
    "Other Subjects": "",
    "Dates of Original Material": "1999",
    "Author of the Original Material": "B. Example",
    "Publisher of the Original Material": "Example Press",
    "Editor of the Original Material": "C. Example",
    "Volume and Issue Number": "Vol. 2",
    "Languages of Material": ["English", "Russian"],
    "Script of Material": "Latin",
    "Writing System": "Alphabetic",
    "still_under_copyright": "yes",
    "Copyright Holder Name": "Example Press",
    "Copyright Attribution": "Courtesy of Example Press",
    "Digital Folder Name": "CAAL_PUB_002",
    "Digital Files Name": "pub_002.pdf",
    "Creation Date of Digital Files": "2021-07-11",
    "Format of Digital Files": "PDF",
    "Number of Digital Files": "1",
    "Colour": "Monochrome",
    "Resolution": "400 dpi",
    "Archive Recorder": "CAAL import",
    "Date of Recording": "2026-04-01",
    "Resource": "CAAL core"
  }
];

// Helpers
// --------------------------------------------------------
function archiveHasRealValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function archiveNormalizeSearchText(value) {
  if (!archiveHasRealValue(value)) return "";
  return String(value).toLowerCase();
}

function archiveUniqueSorted(values) {
  return Array.from(new Set(values.filter(archiveHasRealValue))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function archiveArrayValue(value) {
  if (Array.isArray(value)) return value.filter(archiveHasRealValue);
  if (!archiveHasRealValue(value)) return [];
  return [value];
}

function archivePopulateMultiSelect(selectEl, values) {
  if (!selectEl) return;
  selectEl.innerHTML = "";

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });
}

function archiveSelectedValues(selectEl) {
  if (!selectEl) return [];
  return Array.from(selectEl.selectedOptions).map((option) => option.value);
}

function archiveRenderDetailItem(label, value, fullWidth = false) {
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <span class="detail-label">${label}</span>
      <div class="detail-value">${safeValue(value)}</div>
    </div>
  `;
}

function archiveRenderGroupBlock(title, innerHtml, hasValues = true) {
  const content = hasValues
    ? innerHtml
    : `<div class="section-empty">No populated fields in this section.</div>`;

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

// Search text blob
// --------------------------------------------------------
function archiveBuildSearchText(record) {
  const fields = [
    record["Level"],
    record["Original Reference"],
    record["Associated CAAL_ID"],
    record["Original Title"],
    record["English Title"],
    record["Content Type"],
    record["Description"],
    record["Description - alternative language"],
    record["Number and Type of Original Material"],
    record["Size and Dimensions of Original Material"],
    record["Condition of Original Material"],
    record["Related Towns and Cities"],
    record["Other Subjects"],
    record["Dates of Original Material"],
    record["Author of the Original Material"],
    record["Publisher of the Original Material"],
    record["Editor of the Original Material"],
    record["Volume and Issue Number"],
    record["Script of Material"],
    record["Writing System"],
    record["Copyright Holder Name"],
    record["Copyright Attribution"],
    record["Digital Folder Name"],
    record["Digital Files Name"],
    record["Creation Date of Digital Files"],
    record["Format of Digital Files"],
    record["Number of Digital Files"],
    record["Colour"],
    record["Resolution"],
    record["Archive Recorder"],
    record["Date of Recording"],
    record["Resource"],
    ...archiveArrayValue(record["Related Countries"]),
    ...archiveArrayValue(record["Related Religions"]),
    ...archiveArrayValue(record["Related Subjects"]),
    ...archiveArrayValue(record["Languages of Material"])
  ];

  return fields.map(archiveNormalizeSearchText).join(" ");
}

// Filter options
// --------------------------------------------------------
function archiveCollectFilterOptions(records) {
  const relatedCountries = [];
  const relatedReligions = [];
  const relatedSubjects = [];
  const contentTypes = [];
  const languages = [];

  records.forEach((record) => {
    relatedCountries.push(...archiveArrayValue(record["Related Countries"]));
    relatedReligions.push(...archiveArrayValue(record["Related Religions"]));
    relatedSubjects.push(...archiveArrayValue(record["Related Subjects"]));
    contentTypes.push(record["Content Type"]);
    languages.push(...archiveArrayValue(record["Languages of Material"]));
  });

  return {
    relatedCountries: archiveUniqueSorted(relatedCountries),
    relatedReligions: archiveUniqueSorted(relatedReligions),
    relatedSubjects: archiveUniqueSorted(relatedSubjects),
    contentTypes: archiveUniqueSorted(contentTypes),
    languages: archiveUniqueSorted(languages)
  };
}

// Filter logic
// --------------------------------------------------------
function archiveMatchesFilters(record, filters) {
  const relatedCountries = archiveArrayValue(record["Related Countries"]);
  const relatedReligions = archiveArrayValue(record["Related Religions"]);
  const relatedSubjects = archiveArrayValue(record["Related Subjects"]);
  const languages = archiveArrayValue(record["Languages of Material"]);

  const matchesText =
    !filters.text ||
    archiveBuildSearchText(record).includes(filters.text.toLowerCase());

  const matchesRelatedCountries =
    filters.relatedCountries.length === 0 ||
    relatedCountries.some((value) => filters.relatedCountries.includes(value));

  const matchesRelatedReligions =
    filters.relatedReligions.length === 0 ||
    relatedReligions.some((value) => filters.relatedReligions.includes(value));

  const matchesRelatedSubjects =
    filters.relatedSubjects.length === 0 ||
    relatedSubjects.some((value) => filters.relatedSubjects.includes(value));

  const matchesContentType =
    filters.contentTypes.length === 0 ||
    filters.contentTypes.includes(record["Content Type"]);

  const matchesLanguages =
    filters.languages.length === 0 ||
    languages.some((value) => filters.languages.includes(value));

  return (
    matchesText &&
    matchesRelatedCountries &&
    matchesRelatedReligions &&
    matchesRelatedSubjects &&
    matchesContentType &&
    matchesLanguages
  );
}

// Results rendering
// --------------------------------------------------------
function archiveRenderResultsList(records) {
  if (!archiveResultsList) return;

  if (archiveResultsCount) {
    archiveResultsCount.textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
  }

  if (records.length === 0) {
    archiveResultsList.innerHTML = `
      <div class="results-empty">
        <p>No matching records.</p>
      </div>
    `;
    return;
  }

  archiveResultsList.innerHTML = records
    .map((record, index) => {
      const sourceLabel = record.is_editable ? "Workspace" : "CAAL";
      return `
        <div class="result-card" data-archive-result-index="${index}">
          <div class="result-card-header">
            <strong>${safeValue(record["Original Title"])}</strong>
          </div>
          <div class="result-card-meta">${safeValue(record["Original Reference"])}</div>
          <div class="result-card-meta">${safeValue(record["Content Type"])}</div>
          <div class="result-card-meta">${sourceLabel}</div>
        </div>
      `;
    })
    .join("");

  Array.from(archiveResultsList.querySelectorAll(".result-card")).forEach((card) => {
    card.addEventListener("click", () => {
      const idx = Number(card.dataset.archiveResultIndex);
      const record = records[idx];
      if (!record) return;
      archiveRenderRecordDetails(record);
    });
  });
}

// Detail rendering
// --------------------------------------------------------
function archiveRenderRecordDetails(record) {
  archiveSelectedRecord = record;

  let materialHtml = "";
  materialHtml += archiveRenderDetailItem("Level", record["Level"]);
  materialHtml += archiveRenderDetailItem("Original Reference", record["Original Reference"]);
  materialHtml += archiveRenderDetailItem("Associated CAAL_ID", record["Associated CAAL_ID"]);
  materialHtml += archiveRenderDetailItem("Original Title", record["Original Title"], true);
  materialHtml += archiveRenderDetailItem("English Title", record["English Title"], true);
  materialHtml += archiveRenderDetailItem("Content Type", record["Content Type"]);
  materialHtml += archiveRenderDetailItem("Number and Type of Original Material", record["Number and Type of Original Material"], true);
  materialHtml += archiveRenderDetailItem("Size and Dimensions of Original Material", record["Size and Dimensions of Original Material"]);
  materialHtml += archiveRenderDetailItem("Condition of Original Material", record["Condition of Original Material"]);

  let publicationHtml = "";
  publicationHtml += archiveRenderDetailItem("Dates of Original Material", record["Dates of Original Material"]);
  publicationHtml += archiveRenderDetailItem("Author of the Original Material", record["Author of the Original Material"], true);
  publicationHtml += archiveRenderDetailItem("Publisher of the Original Material", record["Publisher of the Original Material"], true);
  publicationHtml += archiveRenderDetailItem("Editor of the Original Material", record["Editor of the Original Material"], true);
  publicationHtml += archiveRenderDetailItem("Volume and Issue Number", record["Volume and Issue Number"]);

  let contentHtml = "";
  contentHtml += archiveRenderDetailItem("Description", record["Description"], true);
  contentHtml += archiveRenderDetailItem("Description - alternative language", record["Description - alternative language"], true);
  contentHtml += archiveRenderDetailItem("Related Countries", archiveArrayValue(record["Related Countries"]).join(", "), true);
  contentHtml += archiveRenderDetailItem("Related Towns and Cities", record["Related Towns and Cities"], true);
  contentHtml += archiveRenderDetailItem("Related Religions", archiveArrayValue(record["Related Religions"]).join(", "), true);
  contentHtml += archiveRenderDetailItem("Related Subjects", archiveArrayValue(record["Related Subjects"]).join(", "), true);
  contentHtml += archiveRenderDetailItem("Other Subjects", record["Other Subjects"], true);
  contentHtml += archiveRenderDetailItem("Languages of Material", archiveArrayValue(record["Languages of Material"]).join(", "), true);
  contentHtml += archiveRenderDetailItem("Script of Material", record["Script of Material"]);
  contentHtml += archiveRenderDetailItem("Writing System", record["Writing System"]);

  let digitalHtml = "";
  digitalHtml += archiveRenderDetailItem("Still under Copyright", record["still_under_copyright"]);
  digitalHtml += archiveRenderDetailItem("Copyright Holder Name", record["Copyright Holder Name"], true);
  digitalHtml += archiveRenderDetailItem("Copyright Attribution", record["Copyright Attribution"], true);
  digitalHtml += archiveRenderDetailItem("Digital Folder Name", record["Digital Folder Name"], true);
  digitalHtml += archiveRenderDetailItem("Digital Files Name", record["Digital Files Name"], true);
  digitalHtml += archiveRenderDetailItem("Creation Date of Digital Files", record["Creation Date of Digital Files"]);
  digitalHtml += archiveRenderDetailItem("Format of Digital Files", record["Format of Digital Files"]);
  digitalHtml += archiveRenderDetailItem("Number of Digital Files", record["Number of Digital Files"]);
  digitalHtml += archiveRenderDetailItem("Colour", record["Colour"]);
  digitalHtml += archiveRenderDetailItem("Resolution", record["Resolution"]);

  let metadataHtml = "";
  metadataHtml += archiveRenderDetailItem("Archive Recorder", record["Archive Recorder"]);
  metadataHtml += archiveRenderDetailItem("Date of Recording", record["Date of Recording"]);
  metadataHtml += archiveRenderDetailItem("Resource", record["Resource"], true);

  function archiveSectionHasValues(values) {
    return values.some((value) => archiveHasRealValue(value));
  }

  const materialHasValues = archiveSectionHasValues([
    record["Level"],
    record["Original Reference"],
    record["Associated CAAL_ID"],
    record["Original Title"],
    record["English Title"],
    record["Content Type"],
    record["Number and Type of Original Material"],
    record["Size and Dimensions of Original Material"],
    record["Condition of Original Material"]
  ]);

  const publicationHasValues = archiveSectionHasValues([
    record["Dates of Original Material"],
    record["Author of the Original Material"],
    record["Publisher of the Original Material"],
    record["Editor of the Original Material"],
    record["Volume and Issue Number"]
  ]);

  const contentHasValues = archiveSectionHasValues([
    record["Description"],
    record["Description - alternative language"],
    record["Related Towns and Cities"],
    record["Other Subjects"],
    record["Script of Material"],
    record["Writing System"],
    ...archiveArrayValue(record["Related Countries"]),
    ...archiveArrayValue(record["Related Religions"]),
    ...archiveArrayValue(record["Related Subjects"]),
    ...archiveArrayValue(record["Languages of Material"])
  ]);

  const digitalHasValues = archiveSectionHasValues([
    record["still_under_copyright"],
    record["Copyright Holder Name"],
    record["Copyright Attribution"],
    record["Digital Folder Name"],
    record["Digital Files Name"],
    record["Creation Date of Digital Files"],
    record["Format of Digital Files"],
    record["Number of Digital Files"],
    record["Colour"],
    record["Resolution"]
  ]);

  const metadataHasValues = archiveSectionHasValues([
    record["Archive Recorder"],
    record["Date of Recording"],
    record["Resource"]
  ]);

  archiveRecordDetails.innerHTML = `
    <div class="record-title">
      <h3>${safeValue(record["Original Title"])}</h3>
      <p>${safeValue(record["Original Reference"])}</p>
    </div>

    <div class="panel-actions">
      <button type="button" class="action-btn" ${record.is_editable ? "" : "disabled"}>
        ${record.is_editable ? "Edit record" : "Read only"}
      </button>
    </div>

    <div class="group-stack">
      ${archiveRenderGroupBlock("Material Details", materialHtml, materialHasValues)}
      ${archiveRenderGroupBlock("Publication Details", publicationHtml, publicationHasValues)}
      ${archiveRenderGroupBlock("Content", contentHtml, contentHasValues)}
      ${archiveRenderGroupBlock("Digital Files", digitalHtml, digitalHasValues)}
      ${archiveRenderGroupBlock("Metadata", metadataHtml, metadataHasValues)}
    </div>
  `;
}

// Filter application
// --------------------------------------------------------
function archiveApplyFilters() {
  const filters = {
    text: archiveSearch ? archiveSearch.value.trim() : "",
    relatedCountries: archiveSelectedValues(filterArchiveRelatedCountries),
    relatedReligions: archiveSelectedValues(filterArchiveRelatedReligions),
    relatedSubjects: archiveSelectedValues(filterArchiveRelatedSubjects),
    contentTypes: archiveSelectedValues(filterArchiveContentType),
    languages: archiveSelectedValues(filterArchiveLanguages)
  };

  archiveVisibleRecords = archiveAllRecords.filter((record) =>
    archiveMatchesFilters(record, filters)
  );

  archiveRenderResultsList(archiveVisibleRecords);
}

function archiveClearFilters() {
  if (archiveSearch) archiveSearch.value = "";

  [
    filterArchiveRelatedCountries,
    filterArchiveRelatedReligions,
    filterArchiveRelatedSubjects,
    filterArchiveContentType,
    filterArchiveLanguages
  ].forEach((selectEl) => {
    if (!selectEl) return;
    Array.from(selectEl.options).forEach((option) => {
      option.selected = false;
    });
  });

  archiveApplyFilters();
}

// Events
// --------------------------------------------------------
if (toggleArchiveFiltersBtn && archiveFiltersPanel) {
  toggleArchiveFiltersBtn.addEventListener("click", () => {
    const isHidden = archiveFiltersPanel.hidden;
    archiveFiltersPanel.hidden = !isHidden;
    toggleArchiveFiltersBtn.textContent = isHidden ? "Hide advanced filters" : "Advanced filters";
  });
}

if (clearArchiveFiltersBtn) {
  clearArchiveFiltersBtn.addEventListener("click", archiveClearFilters);
}

if (archiveSearch) {
  archiveSearch.addEventListener("input", archiveApplyFilters);
}

[
  filterArchiveRelatedCountries,
  filterArchiveRelatedReligions,
  filterArchiveRelatedSubjects,
  filterArchiveContentType,
  filterArchiveLanguages
].forEach((selectEl) => {
  if (selectEl) {
    selectEl.addEventListener("change", archiveApplyFilters);
  }
});

document.addEventListener("app:languageChanged", () => {
  archiveRenderResultsList(archiveVisibleRecords);

  if (archiveSelectedRecord) {
    archiveRenderRecordDetails(archiveSelectedRecord);
  }
});

// Initial load
// --------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  archiveAllRecords = ARCHIVE_SAMPLE_RECORDS;
  archiveVisibleRecords = archiveAllRecords;

  const options = archiveCollectFilterOptions(archiveAllRecords);

  archivePopulateMultiSelect(filterArchiveRelatedCountries, options.relatedCountries);
  archivePopulateMultiSelect(filterArchiveRelatedReligions, options.relatedReligions);
  archivePopulateMultiSelect(filterArchiveRelatedSubjects, options.relatedSubjects);
  archivePopulateMultiSelect(filterArchiveContentType, options.contentTypes);
  archivePopulateMultiSelect(filterArchiveLanguages, options.languages);

  archiveRenderResultsList(archiveVisibleRecords);
});
