// ========================================================
// RESOURCE VIEWER PAGE LOGIC
// Read-only v1:
// - RS3 polygons
// - RS3 lines
// - RS3 groups
// - institutions
// - vernacular
// ========================================================

// --------------------------------------------------------
// DOM
// --------------------------------------------------------
const viewerSearch = document.getElementById("viewerSearch");
const viewerFilterCaalId = document.getElementById("viewerFilterCaalId");

const showViewerWorkspaceRecords = document.getElementById("showViewerWorkspaceRecords");
const showViewerNationalRecords = document.getElementById("showViewerNationalRecords");
const showViewerAllCaalRecords = document.getElementById("showViewerAllCaalRecords");
const viewerAllCaalToggleWrapper = document.getElementById("viewerAllCaalToggleWrapper");

const viewerLayerRs3Poly = document.getElementById("viewerLayerRs3Poly");
const viewerLayerRs3Line = document.getElementById("viewerLayerRs3Line");
const viewerLayerRs3Group = document.getElementById("viewerLayerRs3Group");
const viewerLayerInstitution = document.getElementById("viewerLayerInstitution");
const viewerLayerVernacular = document.getElementById("viewerLayerVernacular");
const viewerLayerMonument = document.getElementById("viewerLayerMonument");
const viewerLayerArchive = document.getElementById("viewerLayerArchive");
const viewerLayerDataset = document.getElementById("viewerLayerDataset");
const viewerLayerCartography = document.getElementById("viewerLayerCartography");

const viewerMapLayerRs3Poly = document.getElementById("viewerMapLayerRs3Poly");
const viewerMapLayerRs3Line = document.getElementById("viewerMapLayerRs3Line");
const viewerMapLayerRs3Group = document.getElementById("viewerMapLayerRs3Group");
const viewerMapLayerInstitution = document.getElementById("viewerMapLayerInstitution");
const viewerMapLayerVernacular = document.getElementById("viewerMapLayerVernacular");
const viewerMapLayerMonument = document.getElementById("viewerMapLayerMonument");
const viewerMapLayerDataset = document.getElementById("viewerMapLayerDataset");
const viewerMapLayerCartography = document.getElementById("viewerMapLayerCartography");

const viewerCollapsedResultGroups = new Set();

let viewerRecordsByType = {};
let viewerOffsetsByType = {};
let viewerLoadingTypes = new Set();

const toggleViewerFiltersBtn = document.getElementById("toggleViewerFiltersBtn");
const clearViewerFiltersBtn = document.getElementById("clearViewerFiltersBtn");
const viewerFiltersPanel = document.getElementById("viewerFiltersPanel");

const viewerFilterCountry = document.getElementById("viewerFilterCountry");
const viewerFilterMonumentType = document.getElementById("viewerFilterMonumentType");
const viewerFilterCondition = document.getElementById("viewerFilterCondition");
const viewerFilterDeteriorationCause = document.getElementById("viewerFilterDeteriorationCause");
const viewerFilterRiskType = document.getElementById("viewerFilterRiskType");
const viewerFilterRiskMin = document.getElementById("viewerFilterRiskMin");
let viewerLookups = {};
let viewerLabels = {};

let viewerCentroidsAbortController = null;
let viewerSuppressMapReloadUntil = 0;

function suppressViewerMapReload(ms = 2500) {
  viewerSuppressMapReloadUntil = Date.now() + ms;
}

const viewerFilterResultsCount = document.getElementById("filterResultsCount");
const viewerResultsList = document.getElementById("viewerResultsList");
const viewerPrevBtn = document.getElementById("viewerPrevBtn");
const viewerNextBtn = document.getElementById("viewerNextBtn");
const viewerPageInfo = document.getElementById("viewerPageInfo");
const showViewerResultsOnMapBtn = document.getElementById("showViewerResultsOnMapBtn");

const viewerActiveFilterStrip = document.getElementById("viewerActiveFilterStrip");
const viewerActiveFilterChips = document.getElementById("viewerActiveFilterChips");

const viewerRecordDetails = document.getElementById("viewerRecordDetails");
const viewerCloseRecordBtn = document.getElementById("viewerCloseRecordBtn");

const viewerLoadingIndicator = document.getElementById("viewerLoadingIndicator");
const viewerStatusLine = document.getElementById("viewerStatusLine");
const viewerCacheStatusLine = document.getElementById("viewerCacheStatusLine");

const mapElement = document.getElementById("map");
const mapStatusLine = document.getElementById("mapStatusLine");

let mapOptionsBtn = document.getElementById("mapOptionsBtn");
let resetMapBtn = document.getElementById("resetMapBtn");
let downloadMapBtn = document.getElementById("downloadMapBtn");

const closeMapOptionsBtn = document.getElementById("closeMapOptionsBtn");
const mapOptionsPanel = document.getElementById("mapOptionsPanel");

const basemapSelect = document.getElementById("basemapSelect");

const showCentralAsiaBordersCheckbox = document.getElementById("showCentralAsiaBordersCheckbox");
const borderStyleSelect = document.getElementById("borderStyleSelect");
const borderStyleOptions = document.getElementById("borderStyleOptions");

const showMapLabelsCheckbox = document.getElementById("showMapLabelsCheckbox");
const mapLabelsOptions = document.getElementById("mapLabelsOptions");
const mapLabelScopeSelect = document.getElementById("mapLabelScopeSelect");
const mapLabelModeSelect = document.getElementById("mapLabelModeSelect");
const mapLabelScopeHelp = document.getElementById("mapLabelScopeHelp");
const mapLabelWarning = document.getElementById("mapLabelWarning");

const filterToMapViewBtn = document.getElementById("filterToMapViewBtn");
const filterToMapViewBtnLabel = document.getElementById(
  "filterToMapViewBtnLabel"
);

const viewerMapLayerSurveyGrid = document.getElementById("viewerMapLayerSurveyGrid");
const surveyGridOptions = document.getElementById("surveyGridOptions");
const surveyGridStyleMode = document.getElementById("surveyGridStyleMode");

const drawViewerSpatialPolygonBtn = document.getElementById(
  "drawViewerSpatialPolygonBtn"
);

const drawViewerSpatialPolygonBtnLabel = document.getElementById(
  "drawViewerSpatialPolygonBtnLabel"
);

const viewerSpatialDrawMessage = document.getElementById(
  "viewerSpatialDrawMessage"
);

const viewerSpatialDrawMessageText = document.getElementById(
  "viewerSpatialDrawMessageText"
);

const cancelViewerSpatialDrawBtn = document.getElementById(
  "cancelViewerSpatialDrawBtn"
);


// --------------------------------------------------------
// CONSTANTS
// --------------------------------------------------------
const VIEWER_DEFAULT_MAP_VIEWS = {
  caal: {
    center: [66.9, 42.5],
    zoom: 4.0
  },

  kz: {
    center: [67.0, 48.2],
    zoom: 4.2
  },

  kg: {
    center: [74.8, 41.3],
    zoom: 6.0
  },

  tj: {
    center: [71.0, 38.8],
    zoom: 6.0
  },

  uz: {
    center: [64.5, 41.3],
    zoom: 5.4
  },

  tm: {
    center: [58.5, 39.0],
    zoom: 5.3
  },

  tk: {
    center: [58.5, 39.0],
    zoom: 5.3
  },

  default: {
    center: [66.9, 42.5],
    zoom: 4.0
  }
};

const VIEWER_RECORD_TYPES = [
  "rs3_poly",
  "rs3_line",
  "rs3_group",
  "institution",
  "vernacular",
  "monument",
  "archive",
  "dataset",
  "cartography"
];

VIEWER_RECORD_TYPES.forEach((type) => {
  viewerCollapsedResultGroups.add(type);
  viewerRecordsByType[type] = [];
  viewerOffsetsByType[type] = 0;
});

const VIEWER_OPTIONAL_MAP_TYPES = [
  "survey_grid_region",
  "survey_grid",
  "admin_boundary"
];

const VIEWER_ALWAYS_GEOMETRY_TYPES = [
  "institution",
  "survey_grid",
  "survey_grid_region",
  "admin_boundary"
];

const VIEWER_ALL_MAP_TYPES = [
  ...VIEWER_RECORD_TYPES,
  ...VIEWER_OPTIONAL_MAP_TYPES
];

const VIEWER_RECORD_TYPE_LABELS = {
  rs3_poly: "RS3 polygons",
  rs3_line: "RS3 lines",
  rs3_group: "RS3 groups",
  institution: "Institutions",
  vernacular: "Vernacular",
  monument: "Monuments",
  archive: "Archive",
  dataset: "Datasets",
  cartography: "Cartography",
  survey_grid_region: "Survey grid coverage",
  survey_grid: "Survey grid",
  admin_boundary: "Administrative boundaries"
};

const VIEWER_LAYER_INPUTS = {
  rs3_poly: viewerLayerRs3Poly,
  rs3_line: viewerLayerRs3Line,
  rs3_group: viewerLayerRs3Group,
  institution: viewerLayerInstitution,
  vernacular: viewerLayerVernacular,
  monument: viewerLayerMonument,
  archive: viewerLayerArchive,
  dataset: viewerLayerDataset,
  cartography: viewerLayerCartography
};

const VIEWER_MAP_LAYER_INPUTS = {
  rs3_poly: viewerMapLayerRs3Poly,
  rs3_line: viewerMapLayerRs3Line,
  rs3_group: viewerMapLayerRs3Group,
  institution: viewerMapLayerInstitution,
  vernacular: viewerMapLayerVernacular,
  monument: viewerMapLayerMonument,
  dataset: viewerMapLayerDataset,
  cartography: viewerMapLayerCartography,
  survey_grid: viewerMapLayerSurveyGrid
};

const VIEWER_LAYER_IDS = {
  rs3_poly: {
    source: "viewer-rs3-poly",
    fill: "viewer-rs3-poly-fill",
    outline: "viewer-rs3-poly-outline"
  },
  rs3_line: {
    source: "viewer-rs3-line",
    line: "viewer-rs3-line-line"
  },
  rs3_group: {
    source: "viewer-rs3-group",
    fill: "viewer-rs3-group-fill",
    outline: "viewer-rs3-group-outline"
  },
  institution: {
    source: "viewer-institution",
    circle: "viewer-institution-circle"
  },
  vernacular: {
    source: "viewer-vernacular",
    fill: "viewer-vernacular-fill",
    outline: "viewer-vernacular-outline"
  },
  survey_grid_region: {
    source: "viewer-survey-grid-region",
    fill: "viewer-survey-grid-region-fill",
    outline: "viewer-survey-grid-region-outline"
  },
  survey_grid: {
    source: "viewer-survey-grid",
    fill: "viewer-survey-grid-fill",
    outline: "viewer-survey-grid-outline"
  },
  admin_boundary: {
    source: "viewer-admin-boundary",
    fill: "viewer-admin-boundary-fill",
    outline: "viewer-admin-boundary-outline"
  },
  monument: {
  source: "viewer-monument",
  fill: "viewer-monument-fill",
  outline: "viewer-monument-outline",
  line: "viewer-monument-line",
  circle: "viewer-monument-circle"
},

dataset: {
  source: "viewer-dataset",
  fill: "viewer-dataset-fill",
  outline: "viewer-dataset-outline",
  line: "viewer-dataset-line",
  circle: "viewer-dataset-circle"
},

cartography: {
  source: "viewer-cartography",
  fill: "viewer-cartography-fill",
  outline: "viewer-cartography-outline",
  line: "viewer-cartography-line",
  circle: "viewer-cartography-circle"
}
};

const VIEWER_POLYGON_GEOMETRY_FILTER = [
  "any",
  ["==", ["geometry-type"], "Polygon"],
  ["==", ["geometry-type"], "MultiPolygon"]
];

const VIEWER_LINE_GEOMETRY_FILTER = [
  "any",
  ["==", ["geometry-type"], "LineString"],
  ["==", ["geometry-type"], "MultiLineString"]
];

const VIEWER_POLYGON_OR_LINE_GEOMETRY_FILTER = [
  "any",
  ["==", ["geometry-type"], "Polygon"],
  ["==", ["geometry-type"], "MultiPolygon"],
  ["==", ["geometry-type"], "LineString"],
  ["==", ["geometry-type"], "MultiLineString"]
];

const VIEWER_COLOURS = {
  rs3_poly: "#3B82F6",
  rs3_line: "#111827",
  rs3_group: "#8B5CF6",
  institution: "#F97316",
  vernacular: "#22C55E",
  monument: "#64748B",
  archive: "#A16207",
  dataset: "#0EA5E9",
  cartography: "#14B8A6",
  selected: "#00E5FF",
  workspace: "#2E7D32",
  national: "#B7791F",
  allCaal: "#C95A4A",
  related: "#7C3AED",
  admin_boundary: "#64748B",
  survey_grid_region: "#111827",
  survey_grid: "#F2F2F2"
};

const VIEWER_LABEL_MIN_ZOOM = 7;
const VIEWER_LABEL_MAX_FEATURES = 150;

const VIEWER_CLUSTER_GROUPS = {
  monuments: {
    label: "Monuments",
    source: "viewer-resource-centroids-monuments",
    types: ["monument"],
    clusters: "viewer-resource-clusters-monuments",
    clusterCount: "viewer-resource-cluster-count-monuments",
    unclustered: "viewer-resource-centroid-points-monuments",
    colour: VIEWER_COLOURS.monument
  },

  remote_sensing: {
    label: "Remote sensing",
    source: "viewer-resource-centroids-rs",
    types: ["rs3_poly", "rs3_line", "rs3_group"],
    clusters: "viewer-resource-clusters-rs",
    clusterCount: "viewer-resource-cluster-count-rs",
    unclustered: "viewer-resource-centroid-points-rs",
    colour: "#374151"
  },

  vernacular: {
    label: "Vernacular architecture",
    source: "viewer-resource-centroids-vernacular",
    types: ["vernacular"],
    clusters: "viewer-resource-clusters-vernacular",
    clusterCount: "viewer-resource-cluster-count-vernacular",
    unclustered: "viewer-resource-centroid-points-vernacular",
    colour: VIEWER_COLOURS.vernacular
  }
};

const VIEWER_CLUSTER_MAX_ZOOM = 7;
const VIEWER_GEOMETRY_MIN_ZOOM = 10;
const VIEWER_SURVEY_GRID_OUTLINE_ONLY_ZOOM = 10;
const VIEWER_SURVEY_GRID_REGION_MAX_ZOOM = 5;

const VIEWER_RS3_DETAIL_GROUPS = [
  {
    title: "Basics",
    custom: "rs_basics",
    fields: [
      "CAAL_ID",
      "Country",
      "Region",
      "Gridcode"
    ]
  },
  {
    title: "Type of Anomaly",
    custom: "rs_type_of_anomaly",
    fields: [
      "Digitised Dataset"
    ],
    subgroups: [
      {
        title: "Type",
        fields: [
          "Cropmark",
          "Soilmark",
          "Earthwork"
        ]
      },
      {
        title: "Origin",
        fields: [
          "Natural",
          "Anthropic"
        ]
      },
      {
        title: "Visibility",
        fields: [
          "Google Satellite",
          "Bing Aerial",
          "ESRI",
          "CORONA"
        ]
      }
    ]
  },
  {
    title: "Interpretation",
    custom: "rs_interpretation",
    subgroups: [
      {
        title: "Monument types",
        fields: [
          "Monument type1",
          "Monument type2",
          "Monument type3",
          "Monument type4"
        ]
      },
      {
        title: "Interpretation",
        fields: [
          "Interpretation",
          "Certainty",
          "Comments"
        ]
      },
      {
        title: "Ground-truthing",
        fields: [
          "Merit ground-truthing",
          "Ground-truthed"
        ]
      }
    ]
  },
  {
    title: "Measurements",
    custom: "rs_measurements",
    subgroups: [
      {
        title: "Measurement 1",
        fields: [
          "Measurement value 1",
          "Measurement unit 1",
          "Measurement type 1"
        ]
      },
      {
        title: "Measurement 2",
        fields: [
          "Measurement value 2",
          "Measurement unit 2",
          "Measurement type 2"
        ]
      },
      {
        title: "Measurement 3",
        fields: [
          "Measurement value 3",
          "Measurement unit 3",
          "Measurement type 3"
        ]
      },
      {
        title: "Measurement 4",
        fields: [
          "Measurement value 4",
          "Measurement unit 4",
          "Measurement type 4"
        ]
      }
    ]
  },
  {
    title: "Condition Assessment",
    custom: "rs_condition",
    subgroups: [
      {
        title: "Overall condition",
        fields: [
          "Date of assessment (GE image)",
          "Overall condition",
          "Notes on Condition"
        ],
        descriptions: [
          "Condition levels"
        ]
      },
      {
        title: "Causes of deterioration",
        fields: [
          "Urban Encroachment",
          "Quarrying",
          "Construction",
          "Agriculture",
          "Looting",
          "Fire",
          "Dumping",
          "Riverine Erosion",
          "Soil Erosion",
          "Transport Infrastructure",
          "Cemetery"
        ],
        descriptions: [
          "Causes of deterioration"
        ]
      }
    ]
  },
  {
    title: "Risk Assessment",
    custom: "rs_risk",
    subgroups: [
      {
        title: "Types of risk",
        fields: [
          "Risk of urban encroachment",
          "Risk of quarrying",
          "Risk of construction",
          "Risk of agriculture",
          "Risk of looting",
          "Risk of fire",
          "Risk of dumping",
          "Risk of riverine erosion",
          "Risk of soil erosion",
          "Risk of transport infrastructure",
          "Risk of cemetery",
          "Notes on Risk"
        ],
        descriptions: [
          "Risk levels"
        ]
      }
    ]
  },
  {
    title: "Metadata",
    custom: "metadata"
  },
  {
    title: "Related Resources",
    custom: "related_resources"
  }
];

const VIEWER_SURVEY_GRID_DETAIL_GROUPS = [
  {
    title: "Grid cell",
    fields: [
      "id",
      "gridcode",
      "iso",
      "country",
      "region_1",
      "region_2",
      "layer"
    ]
  },
  {
    title: "Survey tracking",
    fields: [
      "workspace_code",
      "survey_method",
      "survey_status",
      "assigned_to_username",
      "surveyed_by_username",
      "survey_started_at",
      "survey_completed_at",
      "site_count",
      "checked",
      "checked_by_username",
      "checked_at",
      "notes"
    ]
  }
];

const VIEWER_MONUMENT_DETAIL_GROUPS = [
  {
    title: "Basic",
    fields: [
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
    ]
  },
  {
    title: "Monument",
    custom: "monument_main"
  },
  {
    title: "Administration",
    custom: "monument_administration"
  },
  {
    title: "Measurements",
    custom: "monument_measurements"
  },
  {
    title: "Location",
    fields: [
      "Longitude",
      "Latitude",
      "Altitude",
      "Location Confidence",
      "Location Notes",
      "Primary Address"
    ]
  },
  {
    title: "Related Resources",
    custom: "related_resources"
  },
  {
    title: "Metadata",
    fields: [
      "Preferred Language",
      "Recorder",
      "Date of Recording",
      "Tstamp",
      "MasterID"
    ]
  }
];

const VIEWER_ARCHIVE_DETAIL_GROUPS = [
  {
    title: "Material Details",
    fields: [
      "CAAL_ID",
      "Associated CAAL_ID",
      "Original Reference",
      "Content Type",
      "Country",
      "Level",
      "Original Title",
      "English Title",
      "Description"
    ]
  },
  {
    title: "Publication Details",
    fields: [
      "Dates of Original Material",
      "Author of the Original Material",
      "Publisher of the Original Material",
      "Editor of the Original Material",
      "Volume and Issue Number"
    ]
  }
];

const VIEWER_DETAIL_GROUPS = {
  monument: VIEWER_MONUMENT_DETAIL_GROUPS,
  archive: VIEWER_ARCHIVE_DETAIL_GROUPS,
  rs3_poly: VIEWER_RS3_DETAIL_GROUPS,
  rs3_line: VIEWER_RS3_DETAIL_GROUPS,
  rs3_group: VIEWER_RS3_DETAIL_GROUPS,
  survey_grid: VIEWER_SURVEY_GRID_DETAIL_GROUPS
};

const VIEWER_BOOLEAN_FIELDS = new Set([
  "Cropmark",
  "Soilmark",
  "Earthwork",
  "Natural",
  "Anthropic",
  "Google Satellite",
  "Bing Aerial",
  "ESRI",
  "CORONA",
  "Ground-truthed",
  "Urban Encroachment",
  "Quarrying",
  "Construction",
  "Agriculture",
  "Looting",
  "Fire",
  "Dumping",
  "Riverine Erosion",
  "Soil Erosion",
  "Transport Infrastructure",
  "Cemetery",
  "checked"
]);

const VIEWER_REPEATABLE_MAX = 4;

const VIEWER_MEASUREMENT_FIELDS = {
  value: [
    "Measurement value",
    "Measurement Value",
    "Measurement value ",
    "Measurement Value "
  ],
  unit: [
    "Measurement unit",
    "Measurement Unit",
    "Measurement unit ",
    "Measurement Unit "
  ],
  type: [
    "Measurement type",
    "Measurement Type",
    "Measurement type ",
    "Measurement Type "
  ]
};

const VIEWER_MONUMENT_TYPE_FIELD_CANDIDATES = [
  ["Monument type1", "Monument type 1"],
  ["Monument type2", "Monument type 2"],
  ["Monument type3", "Monument type 3"],
  ["Monument type4", "Monument type 4"]
];

const VIEWER_DETERIORATION_FIELDS = [
  "Urban Encroachment",
  "Quarrying",
  "Construction",
  "Agriculture",
  "Looting",
  "Fire",
  "Dumping",
  "Riverine Erosion",
  "Soil Erosion",
  "Transport Infrastructure",
  "Cemetery"
];

const VIEWER_ANOMALY_TYPE_FIELDS = [
  "Cropmark",
  "Soilmark",
  "Earthwork"
];

const VIEWER_ANOMALY_ORIGIN_FIELDS = [
  "Natural",
  "Anthropic"
];

const VIEWER_VISIBILITY_FIELDS = [
  "Google Satellite",
  "Bing Aerial",
  "ESRI",
  "CORONA"
];

const VIEWER_RISK_FIELDS = [
  "Risk of urban encroachment",
  "Risk of quarrying",
  "Risk of construction",
  "Risk of agriculture",
  "Risk of looting",
  "Risk of fire",
  "Risk of dumping",
  "Risk of riverine erosion",
  "Risk of soil erosion",
  "Risk of transport infrastructure",
  "Risk of cemetery"
];

const VIEWER_CONDITION_RATING = {
  min: 1,
  max: 5,
  labels: {
    1: "Excellent",
    2: "Good",
    3: "Poor",
    4: "Very poor",
    5: "Destroyed"
  }
};

const VIEWER_RISK_RATING = {
  min: 0,
  max: 5,
  labels: {
    0: "Not clear data",
    1: "No risk",
    2: "Low",
    3: "Moderate",
    4: "High",
    5: "Very high"
  }
};

const VIEWER_CHIP_MULTISELECTS = [
  {
    select: viewerFilterCountry,
    chipsId: "viewerFilterCountryChips",
    kind: "country",
    titleKey: "country",
    titleFallback: "Country"
  },
  {
    select: viewerFilterCondition,
    chipsId: "viewerFilterConditionChips",
    kind: "condition",
    titleKey: "overall_condition",
    titleFallback: "Overall condition"
  },
  {
    select: viewerFilterDeteriorationCause,
    chipsId: "viewerFilterDeteriorationCauseChips",
    kind: "deterioration_cause",
    titleFallback: "Causes of deterioration"
  },
  {
    select: viewerFilterRiskType,
    chipsId: "viewerFilterRiskTypeChips",
    kind: "risk_type",
    titleKey: "type_of_risk",
    titleFallback: "Type of risk"
  }
];


function getViewerDefaultMapView() {
  const workspaceCode = getViewerSessionWorkspaceCode();

  return (
    VIEWER_DEFAULT_MAP_VIEWS[workspaceCode] ||
    VIEWER_DEFAULT_MAP_VIEWS.default
  );
}

function viewerChipConfigForKind(kind) {
  return VIEWER_CHIP_MULTISELECTS.find((config) => config.kind === kind) || null;
}

function viewerChipConfigForSelect(selectEl) {
  return VIEWER_CHIP_MULTISELECTS.find((config) => config.select === selectEl) || null;
}

function renderViewerField(raw, fieldName, record = null) {
  const value = raw?.[fieldName];

  if (!hasViewerFieldValue(raw, fieldName)) {
    return "";
  }

  if (VIEWER_BOOLEAN_FIELDS.has(fieldName)) {
    const checked =
      value === true ||
      value === 1 ||
      value === "1" ||
      String(value).toLowerCase() === "true";

    return `
      <div class="detail-item viewer-boolean-item">
        <span class="detail-label">${escapeHtml(vLabel(fieldName, fieldName))}</span>
        <div class="detail-value">
          <span class="boolean-display ${checked ? "is-true" : "is-false"}">
            ${checked ? "✓" : "—"}
          </span>
        </div>
      </div>
    `;
  }

  return `
    <div class="detail-item">
      <span class="detail-label">${escapeHtml(vLabel(fieldName, fieldName))}</span>
      <div class="detail-value">${viewerSafeDisplayValue(viewerTranslatedFieldValue(record, fieldName, value))}</div>
    </div>
  `;
}

function renderViewerDescription(raw, fieldName) {
  const value = raw?.[fieldName];

  if (value === null || value === undefined || String(value).trim() === "") {
    return "";
  }

  return `
    <div class="viewer-subgroup-description">
      ${escapeHtml(String(value))}
    </div>
  `;
}


function renderViewerMeasurementsGroup(raw) {
  const rows = [];

  for (let i = 1; i <= VIEWER_REPEATABLE_MAX; i += 1) {
    const value = viewerMeasurementValue(raw, "value", i);
    const unit = viewerMeasurementValue(raw, "unit", i);
    const type = viewerMeasurementValue(raw, "type", i);

    if (
      value === null &&
      unit === null &&
      type === null
    ) {
      continue;
    }

    rows.push({
      index: i,
      value,
      unit,
      type
    });
  }

  const rowsHtml = rows.length
    ? rows.map((row, idx) => `
        <div class="measurement-row measurement-row-readonly viewer-measurement-row">
          <div class="measurement-row-title">
            ${escapeHtml(t("measurement_number", "Measurement {number}").replace("{number}", idx + 1))}
          </div>

          <div class="measurement-row-fields">
            <div class="measurement-field">
              <span class="detail-label">${escapeHtml(t("value", "Value"))}</span>
              <div class="detail-value">${viewerSafeDisplayValue(row.value)}</div>
            </div>

            <div class="measurement-field">
              <span class="detail-label">${escapeHtml(t("unit", "Unit"))}</span>
              <div class="detail-value">${viewerSafeDisplayValue(row.unit)}</div>
            </div>

            <div class="measurement-field">
              <span class="detail-label">${escapeHtml(t("type", "Type"))}</span>
              <div class="detail-value">${viewerSafeDisplayValue(row.type)}</div>
            </div>
          </div>
        </div>
      `).join("")
    : `<div class="section-empty">${escapeHtml(t("no_populated_fields", "No populated fields in this section."))}</div>`;

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(t("measurements", "Measurements"))}</span>
        </div>

        <div class="detail-item full-width viewer-repeatable-display">
          ${rowsHtml}
        </div>
      </div>
    </div>
  `;
}

function viewerMonumentTypeValuesFromRaw(raw = {}) {
  return VIEWER_MONUMENT_TYPE_FIELD_CANDIDATES
    .map((candidates) => viewerRawValue(raw, ...candidates))
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
}

function renderViewerInterpretationGroup(raw, record = null) {
  const translatedPath = Array.isArray(record?.summary?.monument_type_path)
    ? record.summary.monument_type_path.filter(Boolean)
    : [];

  const monumentTypes = translatedPath.length
    ? translatedPath
    : viewerMonumentTypeValuesFromRaw(raw)
        .map((value, index) =>
          viewerTranslatedFieldValue(
            record,
            `Monument type${index + 1}`,
            value
          )
        );
    const monumentTypesHtml = monumentTypes.length

    ? `
      <ul class="detail-value-list">
        ${monumentTypes.map((value) => `<li>${escapeHtml(String(value))}</li>`).join("")}
      </ul>
    `
    : viewerSafeDisplayValue(null);

  const interpretation = viewerRawValue(raw, "Interpretation");
  const certainty = viewerRawValue(raw, "Certainty");
  const comments = viewerRawValue(raw, "Comments");
  const meritGroundTruthing = viewerRawValue(raw, "Merit ground-truthing");
  const groundTruthed = viewerRawValue(raw, "Ground-truthed");

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(vLabel("interpretation", "Interpretation"))}</span>
        </div>

        <div class="detail-item full-width">
          <span class="detail-label">${escapeHtml(vLabel("monument_types", "Monument types"))}</span>
          <div class="detail-value">${monumentTypesHtml}</div>
        </div>

        ${
          interpretation !== null
            ? `
              <div class="detail-item full-width">
                <span class="detail-label">${escapeHtml(vLabel("interpretation", "Interpretation"))}</span>
                <div class="detail-value">${viewerSafeDisplayValue(interpretation)}</div>
              </div>
            `
            : ""
        }

        ${
          certainty !== null
            ? `
              <div class="detail-item">
                <span class="detail-label">${escapeHtml(vLabel("certainty", "Certainty"))}</span>
                <div class="detail-value">${viewerSafeDisplayValue(certainty)}</div>
              </div>
            `
            : ""
        }

        ${
          comments !== null
            ? `
              <div class="detail-item full-width">
                <span class="detail-label">${escapeHtml(vLabel("comments", "Comments"))}</span>
                <div class="detail-value">${viewerSafeDisplayValue(comments)}</div>
              </div>
            `
            : ""
        }

        ${
          meritGroundTruthing !== null
            ? `
              <div class="detail-item">
                <span class="detail-label">${escapeHtml(vLabel("merit_ground_truthing", "Merit ground-truthing"))}</span>
                <div class="detail-value">${viewerSafeDisplayValue(meritGroundTruthing)}</div>
              </div>
            `
            : ""
        }

        ${
          groundTruthed !== null
            ? `
              <div class="detail-item">
                <span class="detail-label">${escapeHtml(vLabel("ground_truthed", "Ground-truthed"))}</span>
                <div class="detail-value">
                  <span class="boolean-display ${viewerBooleanValue(groundTruthed) ? "is-true" : "is-false"}">
                    ${viewerBooleanValue(groundTruthed) ? "✓" : "—"}
                  </span>
                </div>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function renderViewerRatingSlider(value, {
  min = 1,
  max = 5,
  labels = {},
  ariaLabel = ""
} = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return viewerSafeDisplayValue(value);
  }

  const clamped = Math.max(min, Math.min(max, number));
  const label = labels[clamped] || "";

  const ticks = [];

  for (let i = min; i <= max; i += 1) {
    ticks.push(`
      <span title="${escapeHtml(labels[i] || "")}">
        ${i}
      </span>
    `);
  }

  return `
    <div class="viewer-rating-slider">
      <input
        type="range"
        min="${min}"
        max="${max}"
        step="1"
        value="${clamped}"
        disabled
        aria-label="${escapeHtml(ariaLabel)}"
      >

      <div class="viewer-rating-slider-scale">
        ${ticks.join("")}
      </div>

      <div class="viewer-rating-slider-value">
        <strong>${escapeHtml(String(value))}</strong>
        ${label ? `<span>${escapeHtml(label)}</span>` : ""}
      </div>
    </div>
  `;
}

function renderViewerTypeOfAnomalyGroup(raw) {
  const dataset = viewerRawValue(raw, "Digitised Dataset");

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(vLabel("type_of_anomaly", "Type of Anomaly"))}</span>
        </div>

        ${
          dataset !== null
            ? `
              <div class="detail-item full-width">
                <span class="detail-label">${escapeHtml(vLabel("digitised_dataset", "Digitised dataset"))}</span>
                <div class="detail-value">${viewerSafeDisplayValue(dataset)}</div>
              </div>
            `
            : ""
        }

        <div class="detail-item full-width viewer-assessment-block">
          <div class="viewer-subsection-header">
            <span>${escapeHtml(vLabel("type", "Type"))}</span>
          </div>
          ${renderViewerBooleanIndicatorGrid(raw, VIEWER_ANOMALY_TYPE_FIELDS)}
        </div>

        <div class="detail-item full-width viewer-assessment-block">
          <div class="viewer-subsection-header">
            <span>${escapeHtml(vLabel("origin", "Origin"))}</span>
          </div>
          ${renderViewerBooleanIndicatorGrid(raw, VIEWER_ANOMALY_ORIGIN_FIELDS)}
        </div>

        <div class="detail-item full-width viewer-assessment-block">
          <div class="viewer-subsection-header">
            <span>${escapeHtml(vLabel("visibility", "Visibility"))}</span>
          </div>
          ${renderViewerBooleanIndicatorGrid(raw, VIEWER_VISIBILITY_FIELDS)}
        </div>
      </div>
    </div>
  `;
}

function renderViewerBooleanIndicatorGrid(raw, fields) {
  return `
    <div class="viewer-indicator-grid">
      ${fields.map((fieldName) => {
        const value = raw?.[fieldName];
        const hasValue = value !== null && value !== undefined && String(value).trim() !== "";
        const checked = viewerBooleanValue(value);

        return `
          <div class="viewer-indicator-row ${checked ? "is-checked" : "is-unchecked"}">
            <span class="viewer-indicator-mark">${checked ? "✓" : "—"}</span>
            <span>${escapeHtml(vLabel(fieldName, fieldName))}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderViewerConditionAssessmentGroup(raw) {
  const conditionLevels = viewerRawValue(raw, "Condition levels");
  const deteriorationHelp = viewerRawValue(raw, "Causes of deterioration");

  const date = viewerRawValue(raw, "Date of assessment (GE image)");
  const overallCondition = viewerRawValue(raw, "Overall condition");
  const notes = viewerRawValue(raw, "Notes on Condition");

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(vLabel("condition_assessment", "Condition Assessment"))}</span>
        </div>

        <div class="detail-item full-width viewer-assessment-block">
          <div class="viewer-subsection-header">
            <span>${escapeHtml(vLabel("overall_condition", "Overall condition"))}</span>
            ${viewerSectionHelp(vLabel("condition_levels", "Condition levels"), conditionLevels)}
          </div>

          ${
            date !== null
              ? `
                <div class="detail-item full-width viewer-nested-detail-item">
                  <span class="detail-label">${escapeHtml(vLabel("date_of_assessment", "Date of assessment"))}</span>
                  <div class="detail-value">${viewerSafeDisplayValue(date)}</div>
                </div>
              `
              : ""
          }

          ${
            overallCondition !== null
              ? `
                <div class="detail-item full-width viewer-nested-detail-item">
                  <span class="detail-label">${escapeHtml(vLabel("overall_condition", "Overall condition"))}</span>
                  <div class="detail-value">${renderViewerRatingSlider(overallCondition, {
                                              ...VIEWER_CONDITION_RATING,
                                              ariaLabel: vLabel("overall_condition", "Overall condition")
                                            })}</div>
                </div>
              `
              : ""
          }

          ${
            notes !== null
              ? `
                <div class="detail-item full-width viewer-nested-detail-item">
                  <span class="detail-label">${escapeHtml(vLabel("notes_on_condition", "Notes on Condition"))}</span>
                  <div class="detail-value">${viewerSafeDisplayValue(notes)}</div>
                </div>
              `
              : ""
          }
        </div>

        <div class="detail-item full-width viewer-assessment-block">
          <div class="viewer-subsection-header">
            <span>${escapeHtml(vLabel("causes_of_deterioration", "Causes of deterioration"))}</span>
            ${viewerSectionHelp(vLabel("deterioration_guide", "Guide"), deteriorationHelp)}
          </div>

          ${renderViewerBooleanIndicatorGrid(raw, VIEWER_DETERIORATION_FIELDS)}
        </div>
      </div>
    </div>
  `;
}

function renderViewerRiskAssessmentGroup(raw) {
  const riskHelp = viewerRawValue(raw, "Risk levels");
  const notes = viewerRawValue(raw, "Notes on Risk");

  const riskRows = VIEWER_RISK_FIELDS
    .map((fieldName) => {
      const value = raw?.[fieldName];

      if (value === null || value === undefined || String(value).trim() === "") {
        return "";
      }

      return `
        <div class="detail-item full-width viewer-nested-detail-item">
          <span class="detail-label">${escapeHtml(vLabel(fieldName, fieldName))}</span>
          <div class="detail-value">
            ${renderViewerRatingSlider(value, {
              ...VIEWER_RISK_RATING,
              ariaLabel: fieldName
            })}
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(vLabel("risk_assessment", "Risk Assessment"))}</span>
        </div>

        <div class="detail-item full-width viewer-assessment-block">
          <div class="viewer-subsection-header">
            <span>${escapeHtml(vLabel("types_of_risk", "Types of risk"))}</span>
            ${viewerSectionHelp(vLabel("risk_levels", "Risk levels"), riskHelp)}
          </div>

          <div class="viewer-rating-list">
            ${riskRows || `<div class="section-empty">${escapeHtml(t("no_populated_fields", "No populated fields in this section."))}</div>`}
          </div>
        </div>

        ${
          notes !== null
            ? `
              <div class="detail-item full-width">
                <span class="detail-label">${escapeHtml(vLabel("notes_on_risk", "Notes on Risk"))}</span>
                <div class="detail-value">${viewerSafeDisplayValue(notes)}</div>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function renderViewerMetadataGroup(raw, record) {
  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(t("metadata", "Metadata"))}</span>
        </div>

        ${renderDetailItem(t("source_table", "Source table"), record.source?.table)}
        ${renderDetailItem(vLabel("Recorder", "Recorder"), raw?.Recorder)}
        ${renderDetailItem(vLabel("Timestamp", "Timestamp"), raw?.Timestamp)}
        ${renderDetailItem(vLabel("Date of Recording", "Date of Recording"), raw?.["Date of Recording"])}
      </div>
    </div>
  `;
}

function viewerRelatedItems(record) {
  const summaryItems = viewerRelationSummary(record)?.items;

  if (Array.isArray(summaryItems)) {
    return summaryItems;
  }

  if (Array.isArray(record?.relations)) {
    return record.relations;
  }

  return [];
}

function viewerRelatedTypeCounts(record) {
  const counts = new Map();

  viewerRelatedItems(record).forEach((item) => {
    const type = String(item?.related_record_type || "unknown").trim() || "unknown";
    counts.set(type, (counts.get(type) || 0) + 1);
  });

  const order = [
    "monument",
    "archive",
    "rs3_poly",
    "rs3_line",
    "rs3_group",
    "institution",
    "vernacular",
    "dataset",
    "unknown"
  ];

  return Array.from(counts.entries())
    .map(([recordType, count]) => ({
      recordType,
      count
    }))
    .sort((a, b) => {
      const ai = order.indexOf(a.recordType);
      const bi = order.indexOf(b.recordType);

      if (ai === -1 && bi === -1) {
        return a.recordType.localeCompare(b.recordType);
      }

      if (ai === -1) return 1;
      if (bi === -1) return -1;

      return ai - bi;
    });
}

function viewerRelatedTypeSummaryHtml(record) {
  const typeCounts = viewerRelatedTypeCounts(record);

  if (!typeCounts.length) return "";

  return `
    <div class="viewer-related-type-summary">
      <span class="viewer-related-type-summary-label">
        ${escapeHtml(t("related_resources", "Related resources"))}
      </span>

      ${typeCounts.map(({ recordType, count }) => `
        <span
          class="viewer-related-type-chip"
          title="${escapeHtml(viewerLayerLabel(recordType))}: ${formatCount(count)}"
        >
          <span class="${viewerLayerIconClass(recordType)} viewer-related-type-chip-icon">
            ${viewerLayerIcon(recordType)}
          </span>

          <span class="viewer-related-type-chip-count">
            ${formatCount(count)}
          </span>
        </span>
      `).join("")}
    </div>
  `;
}

function viewerAllLoadedRecords() {
  return Object.values(viewerRecordsByType || {})
    .flat()
    .filter(Boolean);
}

function viewerRelatedResultKey(item) {
  return [
    item?.related_record_type || "",
    item?.related_source_schema || "",
    item?.related_source_table || "",
    item?.related_source_row_id || "",
    item?.related_caal_id || ""
  ].join("|").toLowerCase();
}

function viewerNormalisedCaalId(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function viewerCurrentLoadedResultIds() {
  return new Set(
    viewerAllLoadedRecords()
      .map((record) =>
        viewerNormalisedCaalId(
          record?.identity?.caal_id ||
          record?.caal_id
        )
      )
      .filter(Boolean)
  );
}

function viewerRelatedRecordsFromLoadedResults() {
  const byKey = new Map();
  const loadedResultIds = viewerCurrentLoadedResultIds();

  viewerAllLoadedRecords().forEach((sourceRecord) => {
    const sourceCaalId =
      sourceRecord?.identity?.caal_id || "";

    const sourceTitle =
      viewerRecordTitle(sourceRecord) ||
      sourceCaalId;

    viewerRelatedItems(sourceRecord).forEach((item) => {
      const relatedId =
        String(item?.related_caal_id || "").trim();

      if (!relatedId) return;

      const key = viewerRelatedResultKey(item);
      const relatedIdNorm =
        viewerNormalisedCaalId(relatedId);

      const directionalRelationType =
        typeof window.getDirectionalRelationType === "function"
          ? window.getDirectionalRelationType(item)
          : (
              item?.relation_type ||
              item?.relation_type_norm ||
              ""
            );

      if (!byKey.has(key)) {
        byKey.set(key, {
          ...item,

          relation_display_type:
            directionalRelationType,

          source_caal_id:
            sourceCaalId,

          source_display_label:
            sourceTitle,

          in_current_loaded_results:
            loadedResultIds.has(relatedIdNorm)
        });
      }
    });
  });

  return Array.from(byKey.values());
}

function groupViewerRelatedRecordsByType(items = []) {
  const order = [
    "monument",
    "archive",
    "rs3_poly",
    "rs3_line",
    "rs3_group",
    "institution",
    "vernacular",
    "dataset",
    "unknown"
  ];

  const groups = new Map();

  items.forEach((item) => {
    const type = String(item?.related_record_type || "unknown").trim() || "unknown";

    if (!groups.has(type)) {
      groups.set(type, []);
    }

    groups.get(type).push(item);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);

      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
}

function viewerRelatedCompactCardHtml(item) {
  const relatedId = String(item?.related_caal_id || "").trim();

  const title =
    item?.related_display_label ||
    relatedId ||
    t("related_resource", "Related resource");

  const relationType = String(
    item?.relation_display_type ||
    (
      typeof window.getDirectionalRelationType === "function"
        ? window.getDirectionalRelationType(item)
        : (
            item?.relation_type ||
            item?.relation_type_norm ||
            ""
          )
    )
  ).trim();

  const isLoadedInResults =
    item?.in_current_loaded_results === true;

  const sourceText = item?.source_caal_id
      ? `${t("related_to", "Related to")} ${item.source_caal_id}${
          item.source_display_label ? ` - ${item.source_display_label}` : ""
        }`
      : "";

  const href = viewerRelatedRecordUrl(item);

  return `
    <div class="monument-resource-search-card monument-resource-search-card-related viewer-related-compact-card">
      <div class="monument-resource-card-title">
        ${escapeHtml(title)}
      </div>

      ${
        relatedId
          ? `
            <div class="monument-resource-card-id">
              ${escapeHtml(relatedId)}
            </div>
          `
          : ""
      }

      <div class="viewer-related-result-presence">
        <span
          class="
            viewer-related-result-presence-badge
            ${
              isLoadedInResults
                ? "is-loaded"
                : "is-outside"
            }
          "
        >
          ${
            isLoadedInResults
              ? escapeHtml(
                  t(
                    "loaded_in_results",
                    "Loaded in results"
                  )
                )
              : escapeHtml(
                  t(
                    "outside_loaded_results",
                    "Outside loaded results"
                  )
                )
          }
        </span>
      </div>

      ${
        relationType
          ? `
            <div class="monument-resource-related-line">
              ${escapeHtml(relationType)}
            </div>
          `
          : ""
      }

      ${
        sourceText
          ? `
            <div class="monument-resource-related-line">
              ${escapeHtml(sourceText)}
            </div>
          `
          : ""
      }

      ${
        href
          ? `
            <div class="viewer-related-open-row">
              <a
                class="action-btn subtle viewer-related-open-link"
                href="${escapeHtml(href)}"
                target="_blank"
                rel="noopener"
                title="${escapeHtml(t("opens_in_new_tab", "Opens in a new tab"))}"
                aria-label="${escapeHtml(t("open_record_new_tab", "Open record in a new tab"))}"
              >
                ${escapeHtml(t("open_record", "Open record"))}
              </a>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderViewerRelatedResultsSection() {
  const relatedItems = viewerRelatedRecordsFromLoadedResults();

  if (!relatedItems.length) return "";

  const groups = groupViewerRelatedRecordsByType(relatedItems);

  return `
    <section class="viewer-related-results-section monument-resource-search-section">
      <h4 class="monument-resource-search-heading">
        ${escapeHtml(t("related_records", "Related records"))}
        <span class="monument-resource-search-count">
          (${formatCount(relatedItems.length)})
        </span>
      </h4>

      ${groups.map(([recordType, items]) => `
        <section class="viewer-related-result-group">
          <h5 class="viewer-related-layer-heading">
            <span class="${viewerLayerIconClass(recordType)}">
              ${viewerLayerIcon(recordType)}
            </span>

            <span>
              ${escapeHtml(viewerLayerLabel(recordType))}
            </span>

            <span class="monument-resource-search-count">
              (${formatCount(items.length)})
            </span>
          </h5>

          <div class="monument-resource-search-list viewer-related-compact-list">
            ${items.slice(0, 12).map(viewerRelatedCompactCardHtml).join("")}
          </div>
        </section>
      `).join("")}
    </section>
  `;
}

function viewerRelationSummary(record) {
  return record?.relation_summary || {
    count: 0,
    items: []
  };
}

function viewerRelatedCount(record) {
  return Number(viewerRelationSummary(record).count || 0);
}

function viewerRelatedRecordUrl(rel) {
  const caalId = String(rel?.related_caal_id || "").trim();
  if (!caalId) return null;

  const type = String(rel?.related_record_type || "").trim();

  if (typeof getRelatedRecordUrl === "function") {
    return getRelatedRecordUrl(
      caalId,
      type,
      rel?.related_source_scope || null
    );
  }

  if (type === "archive") {
    return buildRecordUrl("archive.html", caalId);
  }

  if (type === "monument") {
    return buildRecordUrl("monuments.html", caalId);
  }

  return buildRecordUrl("viewer.html", caalId);
}

function viewerRelatedTitle(rel) {
  return firstNonBlank(
    rel?.related_display_label,
    rel?.related_caal_id,
    t("related_resource", "Related resource")
  );
}

function viewerRelatedMeta(rel) {
  return [
    rel?.related_dataset_label,
    rel?.related_caal_id
  ].filter(Boolean).join(" · ");
}

function viewerDetailRelationChipClass(rel) {
  const unresolved = rel?.related_id_exists === false;

  if (unresolved) {
    return "related-id-chip related-id-chip-missing viewer-related-detail-chip";
  }

  return "related-id-chip related-id-chip-found viewer-related-detail-chip";
}

function viewerRelationTypeLabel(relationType) {
  const value = String(relationType || "").trim();

  if (!value) {
    return t("related_resources", "Related resources");
  }

  return t(value, value);
}

function viewerRelationGroupsByType(record) {
  const relations = Array.isArray(record?.relations)
    ? record.relations
    : [];

  return relations.reduce((groups, rel) => {
    const relationType =
      typeof window.getDirectionalRelationType === "function"
        ? window.getDirectionalRelationType(rel)
        : (
            rel?.relation_type ||
            rel?.relation_type_norm ||
            t("related_resources", "Related resources")
          );

    const key =
      String(relationType || "").trim() ||
      t("related_resources", "Related resources");

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(rel);

    return groups;
  }, {});
}

function renderViewerDetailRelationChips(record) {
  const groups = viewerRelationGroupsByType(record);
  const entries = Object.entries(groups);

  if (!entries.length) {
    return `
      <div class="detail-item full-width">
        <div class="detail-value">
          ${escapeHtml(
            t(
              "no_related_resources_recorded",
              "No related resources are recorded for this resource."
            )
          )}
        </div>
      </div>
    `;
  }

  return entries.map(([relationType, relations]) => {
    const chips = relations.map((rel) => {
      const relatedId = String(rel?.related_caal_id || "").trim();
      const unresolved = rel?.related_id_exists === false;

      return `
        <button
          type="button"
          class="${viewerDetailRelationChipClass(rel)}"
          data-viewer-related-id="${escapeHtml(relatedId)}"
          data-viewer-related-type="${escapeHtml(rel?.related_record_type || "")}"
          title="${
            unresolved
              ? escapeHtml(
                  t(
                    "related_id_not_found",
                    "Related ID not found in current resource tables."
                  )
                )
              : escapeHtml(t("open_related_record", "Open related record"))
          }"
          ${unresolved ? "disabled" : ""}
        >
          ${relatedRecordTypeIconHtml(rel?.related_record_type)}
          <span class="related-id-chip-text">
            ${escapeHtml(relatedId)}
          </span>
        </button>
      `;
    }).join("");

    return `
      <div class="detail-item full-width">
        <span class="detail-label">
          ${escapeHtml(viewerRelationTypeLabel(relationType))}
        </span>

        <div class="detail-value related-id-list viewer-related-detail-id-list">
          ${chips}
        </div>
      </div>
    `;
  }).join("");
}

function renderViewerRelatedResourcesGroup(record) {
  const caalId = String(record?.identity?.caal_id || record?.caal_id || "").trim();
  const hasRelations =
    Array.isArray(record?.relations) && record.relations.length > 0;

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">
            ${escapeHtml(t("related_resources", "Related Resources"))}
          </span>

          ${
            hasRelations && caalId
              ? `
                <div class="viewer-related-map-actions">
                  <button
                    type="button"
                    class="action-btn subtle js-show-related-map"
                    data-caal-id="${escapeHtml(caalId)}"
                  >
                    ${escapeHtml(t("show_related_on_map", "Show related on map"))}
                  </button>

                  <button
                    type="button"
                    class="action-btn subtle danger-subtle js-clear-related-map"
                    data-caal-id="${escapeHtml(caalId)}"
                    hidden
                  >
                    ${escapeHtml(t("clear_related_from_map", "Clear relationships from map"))}
                  </button>
                </div>
              `
              : ""
          }
        </div>

        ${renderViewerDetailRelationChips(record)}
      </div>
    </div>
  `;
}

function wireViewerRelatedDetailChips() {
  document
    .querySelectorAll("[data-viewer-related-id]")
    .forEach((button) => {
      if (button.dataset.viewerRelatedWired === "true") return;

      button.dataset.viewerRelatedWired = "true";

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const caalId = button.dataset.viewerRelatedId || "";
        const recordType = button.dataset.viewerRelatedType || "";

        if (!caalId) return;

        const url =
          typeof getRelatedRecordUrl === "function"
            ? getRelatedRecordUrl(caalId, recordType)
            : null;

        if (url) {
          window.open(url, "_blank", "noopener");
        }
      });
    });
}

function setViewerSelectedBoundary(boundaryId) {
  const filter = ["==", ["get", "boundary_id"], boundaryId || "___none___"];
  ["viewer-admin-boundary-selected-fill", "viewer-admin-boundary-selected-outline"]
    .forEach((id) => {
      if (viewerMap.getLayer(id)) viewerMap.setFilter(id, filter);
    });
}

async function loadBoundarySummaryIntoPopup(thisPopup, boundaryId) {
  const target = thisPopup.getElement()
    ?.querySelector("[data-boundary-summary]");

  if (!target || !boundaryId) return;

  target.innerHTML = `<span class="mini-spinner"></span>`;

  try {
    const lang =
      (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
      activeLang ||
      "en";

    const r = await fetch(
      `/api/viewer/boundary-summary?boundary_id=${encodeURIComponent(boundaryId)}&lang=${encodeURIComponent(lang)}`,
      { method: "GET", credentials: "include" }
    );

    const data = await r.json();

    if (!data.ok || viewerPopup !== thisPopup) return;

    target.innerHTML = renderViewerBoundarySummaryHtml(data.summary);
  } catch {
    target.innerHTML = escapeHtml(t("summary_failed", "Summary unavailable."));
  }
}

function showViewerReferencePopup(feature, lngLat) {
  const props = feature?.properties || {};
  const type = String(props.record_type || "");

  let bodyHtml = "";

  if (type === "survey_grid") {
    bodyHtml = `
      <div>${escapeHtml(t("survey_status", "Survey status"))}:
        <strong>${escapeHtml(props.survey_status || t("not_recorded", "Not recorded"))}</strong></div>
      <div>${escapeHtml(t("site_count", "Sites"))}:
        <strong>${formatCount(props.site_count || 0)}</strong></div>
      <div>${escapeHtml(t("checked", "Checked"))}:
        <strong>${props.checked === true || props.checked === "true"
          ? t("yes", "Yes") : t("no", "No")}</strong></div>
    `;
  } else if (type === "survey_grid_region") {
    bodyHtml = `
      <div>${escapeHtml(t("survey_status", "Survey status"))}:
        <strong>${escapeHtml(props.survey_status || t("not_recorded", "Not recorded"))}</strong></div>
      <div>${escapeHtml(t("site_count", "Sites"))}:
        <strong>${formatCount(props.site_count || 0)}</strong></div>
      <div>${escapeHtml(t("cells_checked", "Cells checked"))}:
        <strong>${formatCount(props.checked_cell_count || 0)} /
        ${formatCount(props.grid_cell_count || 0)}</strong></div>
    `;
  } else if (type === "admin_boundary") {
    const boundaryName =
      props.admin_name ||
      props.boundary_id ||
      "";

    bodyHtml = `
      <div class="map-popup viewer-single-map-popup-card viewer-boundary-popup-card">
        <div class="map-popup-title-btn viewer-map-popup-open-title">
          ${escapeHtml(boundaryName)}
        </div>

        <div class="map-popup-meta viewer-popup-id-line">
          <span class="${viewerLayerIconClass("admin_boundary")} viewer-popup-type-icon" aria-hidden="true">
            ${viewerLayerIcon("admin_boundary")}
          </span>
          <span>${escapeHtml(t("admin_boundary", "Administrative boundary"))}</span>
        </div>

        <div class="map-popup-meta">
          ${escapeHtml(t("admin_level", "Admin level"))}: ${escapeHtml(props.admin_level || "")}
        </div>

        <div class="viewer-popup-related-line viewer-boundary-summary-line" data-boundary-summary>
          <button type="button" class="action-btn subtle js-load-boundary-summary">
            ${escapeHtml(t("show_region_summary", "Show region summary"))}
          </button>
        </div>
      </div>
    `;
  } else {
    return;
  }

  if (viewerPopup) {
    viewerPopup.remove();
    viewerPopup = null;
  }

  viewerPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: "340px",
    className: "monument-single-hover-popup viewer-single-map-popup viewer-reference-popup"
  })
    .setLngLat(lngLat)
    .setHTML(bodyHtml)
    .addTo(viewerMap);

  
  if (type === "admin_boundary") {
    setViewerSelectedBoundary(props.boundary_id || null);
    viewerPopup.on("close", () => setViewerSelectedBoundary(null));

    const thisPopup = viewerPopup;
    const boundaryId = props.boundary_id || "";

    thisPopup.getElement()
      ?.querySelector(".js-load-boundary-summary")
      ?.addEventListener("click", async () => {
        await loadBoundarySummaryIntoPopup(thisPopup, boundaryId);
      });

    // Auto-load, so it behaves more like the monument popup summary.
    loadBoundarySummaryIntoPopup(thisPopup, boundaryId);
  }
}

const viewerReferencePopupLayersBound = new Set();

function bindViewerReferenceLayerPopups() {
  if (!viewerMap) return;

  [
    "viewer-survey-grid-fill",
    "viewer-survey-grid-region-fill",
    "viewer-admin-boundary-fill"
  ].forEach((layerId) => {
    if (viewerReferencePopupLayersBound.has(layerId)) return;
    if (!viewerMap.getLayer(layerId)) return;

    viewerMap.on("mouseenter", layerId, () => {
      viewerMap.getCanvas().style.cursor = "pointer";
    });

    viewerMap.on("mouseleave", layerId, () => {
      viewerMap.getCanvas().style.cursor = "";
    });

    viewerMap.on("click", layerId, (e) => {
      const f = e.features?.[0];
      if (!f) return;

      showViewerReferencePopup(f, e.lngLat);
    });

    viewerReferencePopupLayersBound.add(layerId);
  });
}

function renderViewerBoundarySummaryHtml(summary) {
  const counts = Array.isArray(summary?.counts_by_type) ? summary.counts_by_type : [];
  const topTypes = Array.isArray(summary?.top_monument_types) ? summary.top_monument_types : [];

  const countsHtml = counts.map((c) => `
    <span class="related-mini-item" title="${escapeHtml(c.record_type)}">
      <span class="${caalRecordTypeIconClass(c.record_type)}">
        ${caalRecordTypeIconSvg(c.record_type)}
      </span>
      ${formatCount(c.count)}
    </span>
  `).join("");

  const typesHtml = topTypes.map((tRow) => `
    <li>${escapeHtml(tRow.monument_type)}: <strong>${formatCount(tRow.count)}</strong></li>
  `).join("");

  const conditionHtml = summary?.avg_condition
    ? `
      <div class="viewer-ref-summary-block">
        ${escapeHtml(t("avg_condition", "Avg condition (levels 2+)"))}:
        <strong>${summary.avg_condition}</strong>
        <span class="muted">
          (${formatCount(summary.records_with_condition)} ${escapeHtml(t("records", "records"))})
        </span>
      </div>
    `
    : "";

  return `
    <div class="viewer-ref-summary-block viewer-ref-summary-counts">
      ${countsHtml || escapeHtml(t("no_records_in_boundary", "No records in this region."))}
    </div>
    ${typesHtml ? `
      <div class="viewer-ref-summary-block">
        <div class="muted">${escapeHtml(t("top_monument_types", "Top monument types"))}</div>
        <ul class="viewer-ref-summary-list">${typesHtml}</ul>
      </div>
    ` : ""}
    ${conditionHtml}
  `;
}

// --------------------------------------------------------
// STATE
// --------------------------------------------------------
let viewerListRecords = [];
let viewerMapLayers = {};
let viewerRecordTypeCounts = {};

let viewerCentroidGeojsonByGroup = {
  monuments: {
    type: "FeatureCollection",
    features: []
  },
  remote_sensing: {
    type: "FeatureCollection",
    features: []
  },
  vernacular: {
    type: "FeatureCollection",
    features: []
  }
};

let viewerCentroidEventsBound = false;

let viewerSelectedRecord = null;

let viewerTotalCount = 0;
let viewerPageLimit = 100;
let viewerPageOffset = 0;

let viewerIsLoading = false;
let viewerLoadingOperationCount = 0;
let viewerSearchDebounceTimer = null;
let viewerMapMoveDebounceTimer = null;

let viewerMap = null;
let viewerMapLoaded = false;
let viewerLayerEventsBound = new Set();

let activeMapViewFilterBbox = null;
let activeViewerSpatialPolygon = null;

let viewerSpatialDraw = null;
let viewerSpatialDrawFeatureId = null;
let viewerSpatialDrawIsActive = false;
let viewerSpatialDrawCoordinates = [];

let viewerPopup = null;

let viewerLegendEl = null;
let viewerLegendCollapsed = true;

function viewerCanNavigateAway() {
  // Future editing support: when an edit session is active with unsaved
  // changes, return false here (and prompt the user) instead.
  return true;
}

// --------------------------------------------------------
// SMALL HELPERS
// --------------------------------------------------------

function formatCount(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString();
}

function currentSession() {
  return window.appSession || null;
}

function waitForViewerSession({ timeoutMs = 3000 } = {}) {
  if (window.appSession) {
    return Promise.resolve(window.appSession);
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();

    const timer = setInterval(() => {
      if (window.appSession || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(window.appSession || null);
      }
    }, 50);
  });
}

function getViewerSessionWorkspaceCode(session = window.appSession) {
  return String(
    session?.user?.workspace_code ??
    session?.profile?.workspace_code ??
    session?.permissions?.workspace_code ??
    session?.workspace_code ??
    ""
  ).trim().toLowerCase();
}

function viewerUserIsCaalAdmin(session = window.appSession) {
  const accessLevel = Number(
    session?.user?.access_level ??
    session?.profile?.access_level ??
    session?.permissions?.access_level ??
    0
  );

  return accessLevel === 9 && getViewerSessionWorkspaceCode(session) === "caal";
}

function viewerUserIsGlobalCaal(session = window.appSession) {
  return getViewerSessionWorkspaceCode(session) === "caal";
}

function viewerUserCanViewAllCaal(session = window.appSession) {
  return (
    session?.permissions?.can_view_all_caal === true ||
    viewerUserIsCaalAdmin(session)
  );
}

function setViewerLoading(isLoading, message = "") {
  if (isLoading) {
    viewerLoadingOperationCount += 1;
  } else {
    viewerLoadingOperationCount = Math.max(
      0,
      viewerLoadingOperationCount - 1
    );
  }

  viewerIsLoading = viewerLoadingOperationCount > 0;

  if (!viewerLoadingIndicator) return;

  viewerLoadingIndicator.hidden = !viewerIsLoading;

  if (viewerIsLoading) {
    const existingMessage =
      viewerLoadingIndicator.querySelector(".viewer-loading-message")
        ?.textContent || "";

    const displayMessage =
      message ||
      existingMessage ||
      t("loading", "Loading...");

    viewerLoadingIndicator.innerHTML = `
      <span class="spinner"></span>
      <span class="viewer-loading-message">
        ${escapeHtml(displayMessage)}
      </span>
    `;
  } else {
    viewerLoadingIndicator.innerHTML = "";
  }
}

function setViewerStatus(message = "", { hidden = false, isError = false } = {}) {
  if (!viewerStatusLine) return;

  viewerStatusLine.hidden = hidden || !message;
  viewerStatusLine.textContent = message || "";
  viewerStatusLine.classList.toggle("cache-status-unavailable", isError);
}

function setViewerResultsCountText(text) {
  const el =
    document.getElementById("filterResultsCount") ||
    document.getElementById("viewerFilterResultsCount");

  if (el) {
    el.textContent = text;
  }
}

function viewerRaw(record, fieldName) {
  return record?.raw?.[fieldName] ?? null;
}

function viewerSummary(record, fieldName) {
  return record?.summary?.[fieldName] ?? null;
}

function compactViewerText(value, maxLength = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!text) return "";

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}…`;
}

function firstNonBlank(...values) {
  for (const value of values) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  return "";
}

function viewerPrimaryType(record) {
  if (record?.identity?.record_type === "survey_grid") {
    return firstNonBlank(
      record?.raw?.survey_status,
      record?.identity?.dataset_label
    );
  }

  return firstNonBlank(
    record?.raw?.["Monument type1"],
    record?.raw?.["Monument type2"],
    record?.identity?.dataset_label
  );
}

function viewerTranslatedFieldValue(record, fieldName, rawValue = null) {
  if (!record) return rawValue;

  const display = record.display || {};

  const candidates = [fieldName];

  if (fieldName === "Country" || fieldName === "country") {
    candidates.push("Country");
  }

  if (fieldName === "Monument type1") {
    candidates.push("Monument type 1");
  }
  if (fieldName === "Monument type2") {
    candidates.push("Monument type 2");
  }
  if (fieldName === "Monument type3") {
    candidates.push("Monument type 3");
  }
  if (fieldName === "Monument type4") {
    candidates.push("Monument type 4");
  }

  if (fieldName === "Monument type 1") {
    candidates.push("Monument type1");
  }
  if (fieldName === "Monument type 2") {
    candidates.push("Monument type2");
  }
  if (fieldName === "Monument type 3") {
    candidates.push("Monument type3");
  }
  if (fieldName === "Monument type 4") {
    candidates.push("Monument type4");
  }

  for (const key of candidates) {
    const value = display[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return viewerDisplayValue(fieldName, rawValue);
}

function viewerDisplayForField(record, fieldName, rawValue) {
  return (
    record?.display?.[fieldName] ??
    rawValue
  );
}

function viewerMonumentTypeLine(record) {
  const path = record?.summary?.monument_type_path || [];
  return path.filter(Boolean).join(" › ");
}

function viewerBestMonumentType(record) {
  const path = record?.summary?.monument_type_path || [];
  return path.length ? path[path.length - 1] : "";
}

function viewerRecordTitle(record) {
  if (record?.identity?.record_type === "survey_grid") {
    return compactViewerText(
      firstNonBlank(
        record?.raw?.gridcode,
        record?.identity?.caal_id,
        record?.summary?.display_label
      ),
      90
    );
  }

  return compactViewerText(
    firstNonBlank(
      viewerBestMonumentType(record),
      record?.raw?.["Interpretation"],
      record?.summary?.display_label,
      record?.identity?.caal_id
    ),
    90
  );
}

function viewerResultDescription(record, maxLength = 140) {
  const text = firstNonBlank(
    record?.raw?.Comments,
    record?.raw?.Interpretation,
    record?.raw?.["Notes on Condition"],
    record?.raw?.["Notes on Risk"],
    record?.summary?.display_label
  );

  return compactViewerText(text, maxLength);
}

function viewerRecordSubtitle(record) {
  const parts = [
    record?.identity?.dataset_label,
    record?.identity?.caal_id
  ].filter(Boolean);

  return parts.join(" · ");
}

function viewerScopeLabel(record) {
  const scope = record?.source?.scope || "";

  if (scope === "workspace") {
    return t("monuments_workspace_records", "My workspace records");
  }

  if (scope === "national_ref") {
    return t("monuments_national_records", "National CAAL records");
  }

  if (scope === "all_caal") {
    return viewerUserIsGlobalCaal()
      ? t("monuments_all_records", "All CAAL records")
      : t("monuments_other_records", "Other CAAL records");
  }

  return scope || t("read_only", "Read-only");
}

function viewerScopeBadgeClass(record) {
  const scope = record?.source?.scope || "";

  if (scope === "workspace") {
    return "scope-badge scope-badge-editable";
  }

  return "scope-badge scope-badge-readonly";
}

function viewerRecordKey(record) {
  return [
    record?.source?.schema,
    record?.source?.table,
    record?.source?.row_id
  ].join(":");
}

function selectedViewerRecordKey() {
  return viewerSelectedRecord ? viewerRecordKey(viewerSelectedRecord) : "";
}

function viewerLayerLabel(recordType) {
  return t(
    `viewer_layer_${recordType}`,
    VIEWER_RECORD_TYPE_LABELS[recordType] || recordType
  );
}

function viewerLayerShortLabel(recordType) {
  const shortKeys = {
    rs3_poly: ["viewer_layer_rs3_poly_short", "Polygons"],
    rs3_line: ["viewer_layer_rs3_line_short", "Lines"],
    rs3_group: ["viewer_layer_rs3_group_short", "Groups"],
    institution: ["viewer_layer_institution", "Institutions"],
    vernacular: ["viewer_layer_vernacular", "Vernacular"],
    monument: ["viewer_layer_monument", "Monuments"],
    archive: ["viewer_layer_archive", "Archive"],
    dataset: ["viewer_layer_dataset", "Datasets"],
    cartography: ["viewer_layer_cartography", "Cartography"],
    survey_grid_region: ["viewer_layer_survey_grid_region", "Survey grid coverage"],
    survey_grid: ["viewer_layer_survey_grid", "Survey grid"],
    admin_boundary: ["viewer_layer_admin_boundary", "Administrative boundaries"]
  };

  const [key, fallback] = shortKeys[recordType] || [
    `viewer_layer_${recordType}`,
    VIEWER_RECORD_TYPE_LABELS[recordType] || recordType
  ];

  return t(key, fallback);
}

function viewerLayerIcon(recordType) {
  if (typeof caalRecordTypeIconSvg === "function") {
    return caalRecordTypeIconSvg(recordType);
  }

  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <circle
        cx="12"
        cy="12"
        r="7"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
    </svg>
  `;
}

function viewerLayerIconClass(recordType) {
  return `viewer-layer-icon viewer-layer-icon-${String(recordType || "unknown").replace(/[^a-z0-9_-]/gi, "_")}`;
}

function getLayerLabel(recordType) {
  return viewerLayerLabel(recordType);
}

function getSurveyGridStyleMode() {
  return surveyGridStyleMode?.value || "neutral";
}

function updateSurveyGridOptionsVisibility() {
  if (!surveyGridOptions || !viewerMapLayerSurveyGrid) return;

  surveyGridOptions.hidden = !viewerMapLayerSurveyGrid.checked;
}


// --------------------------------------------------------
// SCOPE / FILTERS
// --------------------------------------------------------
function setViewerScopeLabelForInput(inputEl, key, fallback) {
  const labelEl = inputEl?.closest("label");
  const span = labelEl?.querySelector("[data-i18n]");

  if (!span) return;

  span.dataset.i18n = key;
  span.textContent = t(key, fallback);
}

function configureScopeControlsForSession({ setDefault = true } = {}) {
  const isGlobalCaalUser = viewerUserIsGlobalCaal();
  const canViewAllCaal = viewerUserCanViewAllCaal();

  const workspaceWrapper = showViewerWorkspaceRecords?.closest("label");
  const nationalWrapper = showViewerNationalRecords?.closest("label");

  if (isGlobalCaalUser) {
    if (workspaceWrapper) workspaceWrapper.hidden = false;

    if (nationalWrapper) {
      nationalWrapper.hidden = true;
    }

    if (showViewerNationalRecords) {
      showViewerNationalRecords.checked = false;
      showViewerNationalRecords.disabled = true;
    }

    if (viewerAllCaalToggleWrapper) {
      viewerAllCaalToggleWrapper.hidden = !canViewAllCaal;
    }

    if (showViewerAllCaalRecords) {
      showViewerAllCaalRecords.disabled = !canViewAllCaal;
    }

    setViewerScopeLabelForInput(
      showViewerAllCaalRecords,
      "monuments_all_records",
      "All CAAL records"
    );

    if (setDefault && canViewAllCaal) {
      if (showViewerWorkspaceRecords) showViewerWorkspaceRecords.checked = true;
      if (showViewerAllCaalRecords) showViewerAllCaalRecords.checked = true;
    }

    return;
  }

  if (workspaceWrapper) workspaceWrapper.hidden = false;
  if (nationalWrapper) nationalWrapper.hidden = false;

  if (showViewerNationalRecords) {
    showViewerNationalRecords.disabled = false;
  }

  if (viewerAllCaalToggleWrapper) {
    viewerAllCaalToggleWrapper.hidden = !canViewAllCaal;
  }

  if (showViewerAllCaalRecords) {
    showViewerAllCaalRecords.disabled = !canViewAllCaal;
  }

  setViewerScopeLabelForInput(
    showViewerAllCaalRecords,
    "monuments_other_records",
    "Other CAAL records"
  );

  if (setDefault) {
    if (showViewerWorkspaceRecords) showViewerWorkspaceRecords.checked = true;
    if (showViewerNationalRecords) showViewerNationalRecords.checked = true;
    if (showViewerAllCaalRecords) showViewerAllCaalRecords.checked = false;
  }
}

function getSelectedScopes() {
  const scopes = [];

  if (showViewerWorkspaceRecords?.checked) {
    scopes.push("workspace");
  }

  if (showViewerNationalRecords?.checked) {
    scopes.push("national_ref");
  }

  if (showViewerAllCaalRecords?.checked) {
    scopes.push("all_caal");
  }

  if (viewerUserIsGlobalCaal()) {
    return Array.from(
      new Set(
        scopes.map((scope) =>
          scope === "national_ref" ? "all_caal" : scope
        )
      )
    );
  }

  return scopes;
}

function getSelectedLayerTypes() {
  const selected = VIEWER_RECORD_TYPES.filter((type) => {
    const input = VIEWER_LAYER_INPUTS[type];
    return input?.checked === true;
  });

  return selected;
}

function getSelectedResourceTypes() {
  return VIEWER_RECORD_TYPES.filter((type) => {
    const input = VIEWER_LAYER_INPUTS[type];
    return input?.checked === true;
  });
}

function getViewerSelectedValues(selectEl) {
  if (!selectEl) return [];

  return Array.from(selectEl.selectedOptions || [])
    .map((option) => String(option.value || "").trim())
    .filter(Boolean);
}

function viewerSelectedOptionChips(selectEl, kind, title) {
  return Array.from(selectEl?.selectedOptions || [])
    .map((option) => ({
      kind,
      value: option.value,
      label: option.textContent?.trim() || option.value,
      title
    }))
    .filter((chip) => chip.value);
}

function wireViewerClickToggleMultiSelects() {
  VIEWER_CHIP_MULTISELECTS.forEach((config) => {
    const selectEl = config.select;
    if (!selectEl) return;

    selectEl.addEventListener("mousedown", (event) => {
      const option = event.target;

      if (!(option instanceof HTMLOptionElement)) {
        return;
      }

      event.preventDefault();

      option.selected = !option.selected;

      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

function getVisibleMapLayerTypes() {
  const visible = VIEWER_RECORD_TYPES.filter((type) => {
    const input = VIEWER_MAP_LAYER_INPUTS[type];
    return input?.checked === true;
  });

  if (viewerMapLayerSurveyGrid?.checked === true) {
    const zoom = viewerMap ? viewerMap.getZoom() : 0;

    if (zoom < VIEWER_SURVEY_GRID_REGION_MAX_ZOOM) {
      visible.push("survey_grid_region");
    } else {
      visible.push("survey_grid");
    }
  }

  if (showCentralAsiaBordersCheckbox?.checked === true) {
    visible.push("admin_boundary");
  }

  return Array.from(new Set(visible));
}

function getClusterQueryRecordTypes() {
  const selectedResourceTypes = new Set(getSelectedResourceTypes());

  return getVisibleMapLayerTypes().filter((type) => {
    if (!selectedResourceTypes.has(type)) return false;
    if (VIEWER_ALWAYS_GEOMETRY_TYPES.includes(type)) return false;

    return (
      type === "monument" ||
      type === "rs3_poly" ||
      type === "rs3_line" ||
      type === "rs3_group" ||
      type === "vernacular"
    );
  });
}

function getGeometryQueryRecordTypes() {
  const zoom = viewerMap ? viewerMap.getZoom() : 0;

  const selectedResourceTypes = new Set(getSelectedResourceTypes());
  const visibleMapTypes = getVisibleMapLayerTypes();

  const mainTypes = visibleMapTypes.filter((type) => {
    if (!selectedResourceTypes.has(type)) return false;

    if (VIEWER_ALWAYS_GEOMETRY_TYPES.includes(type)) {
      return true;
    }

    return getViewerMapMode() === "geometry";
  });

  const optionalMapTypes = [];

  if (viewerMapLayerSurveyGrid?.checked === true) {
    if (zoom < VIEWER_SURVEY_GRID_REGION_MAX_ZOOM) {
      optionalMapTypes.push("survey_grid_region");
    } else {
      optionalMapTypes.push("survey_grid");
    }
  }

  if (showCentralAsiaBordersCheckbox?.checked === true) {
    optionalMapTypes.push("admin_boundary");
  }

  return Array.from(new Set([
    ...mainTypes,
    ...optionalMapTypes
  ]));
}

function getViewerTextSearch() {
  return String(viewerSearch?.value || "").trim();
}

function getViewerCaalIdSearch() {
  return String(viewerFilterCaalId?.value || "").trim();
}

function getCurrentMapViewBbox() {
  if (!viewerMap) return null;

  const bounds = viewerMap.getBounds();

  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth()
  ]
    .map((value) => Number(value).toFixed(6))
    .join(",");
}

function buildViewerQueryParams({
  includePaging = true,
  includeMapBbox = false
} = {}) {
  const params = new URLSearchParams();

  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  params.set("lang", lang);

  const text = getViewerTextSearch();
  const caalId = getViewerCaalIdSearch();
  const scopes = getSelectedScopes();
  const recordTypes = getSelectedResourceTypes();

  if (text) params.set("text", text);
  if (caalId) params.set("caalId", caalId);

  if (scopes.length) {
    params.set("scopes", scopes.join(","));
  }
  params.set("recordTypes", recordTypes.join(","));

  const countryValues = getViewerSelectedValues(viewerFilterCountry);
  const monumentTypeValues = getViewerSelectedValues(viewerFilterMonumentType);

  if (countryValues.length) {
    params.set("countries", countryValues.join(","));
  }

  if (monumentTypeValues.length) {
    params.set("monumentTypes", monumentTypeValues.join(","));
  }

  const conditionValues = getViewerSelectedValues(viewerFilterCondition);
  const deteriorationCauseValues = getViewerSelectedValues(viewerFilterDeteriorationCause);
  const riskTypeValues = getViewerSelectedValues(viewerFilterRiskType);

  if (conditionValues.length) {
    params.set("condition", conditionValues.join(","));
  }

  if (deteriorationCauseValues.length) {
    params.set("deteriorationCause", deteriorationCauseValues.join(","));
  }

  if (riskTypeValues.length) {
    params.set("riskType", riskTypeValues.join(","));
  }

  if (viewerFilterRiskMin?.value) {
    params.set("riskMin", viewerFilterRiskMin.value);
  }

  if (activeViewerSpatialPolygon) {
    params.set(
      "spatialPolygon",
      JSON.stringify(activeViewerSpatialPolygon)
    );
  } else if (activeMapViewFilterBbox) {
    params.set("bbox", activeMapViewFilterBbox);
  } else if (includeMapBbox) {
    const bbox = getCurrentMapViewBbox();
    if (bbox) params.set("bbox", bbox);
  }

  if (includePaging) {
    params.set("limit", String(viewerPageLimit));
    params.set("offset", String(viewerPageOffset));
  }

  return params;
}

// --------------------------------------------------------
// VIEWER LOOKUPS / ADVANCED FILTER TREE PICKER
// Copied from Monuments, but Viewer-scoped.
// --------------------------------------------------------
function vLabel(key, fallback = "") {
  return (
    viewerLabels?.[key] ||
    viewerLabels?.[String(key).trim()] ||
    t(viewerLabelKey(key), fallback || key)
  );
}

function viewerLabelKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function loadViewerLabels() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const response = await fetch(
    `/api/viewer/labels?lang=${encodeURIComponent(lang)}`,
    { method: "GET", credentials: "include" }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load viewer labels");
  }

  viewerLabels = data.labels || {};
}

function decorateViewerLayerFilterIcons() {
  document
    .querySelectorAll("[data-viewer-layer-icon]")
    .forEach((slot) => {
      const recordType = slot.dataset.viewerLayerIcon;
      if (!recordType) return;

      slot.className = viewerLayerIconClass(recordType);
      slot.innerHTML = viewerLayerIcon(recordType);
    });

  document
    .querySelector(".viewer-layer-panel")
    ?.classList.add("icons-ready");
}

function resetViewerLayerSelectionsToDefault() {
  VIEWER_RECORD_TYPES.forEach((type) => {
    const filterInput = VIEWER_LAYER_INPUTS[type];
    const mapInput = VIEWER_MAP_LAYER_INPUTS[type];

    // Results/list filters: include all resource types by default.
    if (filterInput) {
      filterInput.checked = true;
    }

    // Map display: default most spatial layers on, but keep heavy context
    // layers off until the user explicitly asks for them.
    if (mapInput) {
      mapInput.checked = ![
        "dataset",
        "cartography"
      ].includes(type);
    }
  });

  if (viewerMapLayerSurveyGrid) {
    viewerMapLayerSurveyGrid.checked = false;
  }

  if (showCentralAsiaBordersCheckbox) {
    showCentralAsiaBordersCheckbox.checked = false;
  }

  updateSurveyGridOptionsVisibility();

  if (borderStyleOptions && showCentralAsiaBordersCheckbox) {
    borderStyleOptions.hidden = !showCentralAsiaBordersCheckbox.checked;
  }
}

function viewerLookupOptions(name) {
  return Array.isArray(viewerLookups?.[name]) ? viewerLookups[name] : [];
}

function viewerOptionValue(item) {
  return String(
    item?.value ??
    item?.canonical_value ??
    item?.id ??
    item?.concept_id ??
    item?.label_en ??
    item?.label ??
    ""
  ).trim();
}

function viewerOptionLabel(item) {
  return String(
    item?.label ??
    item?.display_label ??
    item?.chip_label ??
    item?.display ??
    item?.display_ru ??
    item?.display_en ??
    item?.label_en ??
    item?.canonical_value ??
    item?.value ??
    item?.id ??
    ""
  ).trim();
}

function viewerPopulateMultiSelect(selectEl, options = []) {
  if (!selectEl) return;

  selectEl.innerHTML = "";

  options.forEach((item) => {
    const value = viewerOptionValue(item);
    const label = viewerOptionLabel(item);

    if (!value && !label) return;

    const option = document.createElement("option");
    option.value = value || label;
    option.textContent = label || value;

    if (item?.chip_label) {
      option.dataset.chipLabel = item.chip_label;
    }

    selectEl.appendChild(option);
  });
}

function viewerSelectedOptionData(selectEl) {
  if (!selectEl) return [];

  return Array.from(selectEl.options || [])
    .filter((option) => option.selected)
    .map((option) => ({
      value: option.value,
      label: option.dataset.chipLabel || option.textContent || option.value
    }));
}

function renderViewerFilterChipsForSelect(selectEl, chipsId) {
  const chipsEl = document.getElementById(chipsId);
  if (!selectEl || !chipsEl) return;

  const selected = viewerSelectedOptionData(selectEl);

  chipsEl.innerHTML = "";

  selected.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "filter-chip";

    const text = document.createElement("span");
    text.className = "filter-chip-text";
    text.textContent = item.label;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "filter-chip-remove";
    removeBtn.textContent = "×";
    removeBtn.setAttribute(
      "aria-label",
      `${t("remove_filter", "Remove filter")}: ${item.label}`
    );

    removeBtn.addEventListener("click", async () => {
      clearSelectedOptionByValue(selectEl, item.value);

      if (selectEl === viewerFilterMonumentType) {
        syncViewerAdvancedFilterTreeFromSelect(selectEl);
      }

      renderViewerFilterChipsForSelect(selectEl, chipsId);
      renderViewerActiveFilterChips();

      viewerPageOffset = 0;
      await reloadViewer({ includeMap: true });
    });

    chip.appendChild(text);
    chip.appendChild(removeBtn);
    chipsEl.appendChild(chip);
  });
}

function clearSelectedOptionByValue(selectEl, value, { dispatch = false } = {}) {
  if (!selectEl) return;

  Array.from(selectEl.options || []).forEach((option) => {
    if (String(option.value) === String(value)) {
      option.selected = false;
    }
  });

  if (dispatch) {
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function viewerTreeItemValue(item) {
  return String(
    item?.value ??
    item?.canonical_value ??
    item?.label ??
    item?.concept_id ??
    ""
  ).trim();
}

function viewerTreeItemConceptId(item) {
  return String(
    item?.concept_id ??
    item?.id ??
    item?.value ??
    ""
  ).trim();
}

function viewerTreeItemParentId(item) {
  const value =
    item?.parent_concept_id ??
    item?.parent_id ??
    item?.broader_concept_id ??
    item?.parent ??
    "";

  return String(value ?? "").trim();
}

function viewerTreeItemSortNumber(item) {
  const value =
    item?.sort_order ??
    item?.sort_number ??
    item?.display_order ??
    item?.position ??
    999999;

  const number = Number(value);
  return Number.isFinite(number) ? number : 999999;
}

function viewerTreeItemLabel(item) {
  return String(
    item?.label ??
    item?.display_label ??
    item?.value ??
    ""
  ).trim();
}

function viewerNormaliseTreeItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      ...item,
      value: viewerTreeItemValue(item),
      concept_id: viewerTreeItemConceptId(item),
      parent_concept_id: viewerTreeItemParentId(item),
      label: viewerTreeItemLabel(item),
      sort_number: viewerTreeItemSortNumber(item)
    }))
    .filter((item) => item.value && item.concept_id);
}

function viewerSortTreeItems(items = []) {
  return [...items].sort((a, b) => {
    const sortA = viewerTreeItemSortNumber(a);
    const sortB = viewerTreeItemSortNumber(b);

    if (sortA !== sortB) return sortA - sortB;

    return viewerTreeItemLabel(a).localeCompare(
      viewerTreeItemLabel(b),
      undefined,
      { sensitivity: "base" }
    );
  });
}

function viewerBuildChildrenByParent(items = []) {
  const childrenByParent = new Map();

  items.forEach((item) => {
    const parentId = viewerTreeItemParentId(item);
    const key = parentId || "__root__";

    if (!childrenByParent.has(key)) {
      childrenByParent.set(key, []);
    }

    childrenByParent.get(key).push(item);
  });

  childrenByParent.forEach((children, key) => {
    childrenByParent.set(key, viewerSortTreeItems(children));
  });

  return childrenByParent;
}

function viewerEnsureSelectHasTreeOptions(selectEl, treeItems = []) {
  if (!selectEl) return;

  const existingValues = new Set(
    Array.from(selectEl.options || []).map((option) => String(option.value))
  );

  treeItems.forEach((item) => {
    const value = viewerTreeItemValue(item);
    if (!value || existingValues.has(value)) return;

    const option = document.createElement("option");
    option.value = value;
    option.textContent =
      item.chip_label ||
      item.label ||
      item.value;

    if (item.chip_label) {
      option.dataset.chipLabel = item.chip_label;
    }

    selectEl.appendChild(option);
    existingValues.add(value);
  });
}

function viewerAdvancedTreeChipLabel(item) {
  const base = item.chip_label || item.label || item.value || "";

  if (!item.disambiguation_label) {
    return base;
  }

  return `${base} (${item.disambiguation_label})`;
}

function viewerAdvancedTreeItemHtml(item) {
  const base = escapeHtml(item.label || item.value || "");

  const disambiguation = item.disambiguation_label
    ? ` <span class="legacy-tree-disambiguator">(${escapeHtml(item.disambiguation_label)})</span>`
    : "";

  const date = item.date_range
    ? ` <span class="legacy-tree-date">${escapeHtml(item.date_range)}</span>`
    : "";

  return `${base}${disambiguation}${date}`;
}

function renderViewerAdvancedFilterTreePicker({
  selectEl,
  chipsId,
  treeLookupName,
  treeId,
  searchPlaceholder
}) {
  if (!selectEl) return;

  selectEl.hidden = true;
  selectEl.classList.add("advanced-filter-hidden-select");

  const existing = document.getElementById(treeId);
  if (existing) existing.remove();

  const treeItems = viewerNormaliseTreeItems(
    viewerLookups?.[treeLookupName] || []
  );

  viewerEnsureSelectHasTreeOptions(selectEl, treeItems);

  const selectedValues = new Set(
    Array.from(selectEl.selectedOptions || []).map((option) => String(option.value))
  );

  const childrenByParent = viewerBuildChildrenByParent(treeItems);
  const topItems = childrenByParent.get("__root__") || [];

  function renderTreeNode(item, depth = 0) {
    const conceptId = viewerTreeItemConceptId(item);
    const parentId = viewerTreeItemParentId(item);
    const value = viewerTreeItemValue(item);
    const children = childrenByParent.get(conceptId) || [];
    const checked = selectedValues.has(String(value));
    const hasChildren = children.length > 0;

    return `
      <div
        class="legacy-tree-node legacy-tree-depth-${depth} ${depth === 0 ? "legacy-tree-parent" : ""}"
        data-concept-id="${escapeHtml(conceptId)}"
        data-parent-id="${escapeHtml(parentId)}"
      >
        <div class="legacy-tree-row ${depth === 0 ? "legacy-tree-row-parent" : "legacy-tree-row-child"}">
          ${
            hasChildren
              ? `
                <button
                  type="button"
                  class="legacy-tree-toggle"
                  data-tree-toggle="${escapeHtml(conceptId)}"
                  aria-expanded="false"
                >
                  ▸
                </button>
              `
              : `<span class="legacy-tree-toggle-spacer"></span>`
          }

          <label>
            <input
              type="checkbox"
              class="advanced-filter-tree-check legacy-tree-check"
              data-value="${escapeHtml(value)}"
              data-concept-id="${escapeHtml(conceptId)}"
              data-parent-id="${escapeHtml(parentId)}"
              data-chip-label="${escapeHtml(viewerAdvancedTreeChipLabel(item))}"
              ${checked ? "checked" : ""}
            >
            <span>${viewerAdvancedTreeItemHtml(item)}</span>
          </label>
        </div>

        ${
          hasChildren
            ? `
              <div
                class="legacy-tree-children"
                data-tree-children="${escapeHtml(conceptId)}"
                hidden
              >
                ${children.map((child) => renderTreeNode(child, depth + 1)).join("")}
              </div>
            `
            : ""
        }
      </div>
    `;
  }

  const wrapper = document.createElement("div");
  wrapper.id = treeId;
  wrapper.className = "advanced-filter-tree-picker";
  wrapper.dataset.filterTreeFor = selectEl.id;

  wrapper.innerHTML = `
    <input
      type="text"
      class="form-control legacy-tree-search"
      placeholder="${escapeHtml(searchPlaceholder || t("search_site_types", "Search site types..."))}"
      data-tree-search
    >

    <div class="legacy-tree">
      ${topItems.map((item) => renderTreeNode(item, 0)).join("")}
    </div>
  `;

  selectEl.insertAdjacentElement("afterend", wrapper);

  wireViewerAdvancedFilterTreePicker({
    wrapper,
    selectEl,
    chipsId
  });

  updateViewerAdvancedFilterTreeParentStates(wrapper);
  renderViewerFilterChipsForSelect(selectEl, chipsId);
}

function wireViewerAdvancedFilterTreePicker({
  wrapper,
  selectEl,
  chipsId
}) {
  if (!wrapper || !selectEl) return;

  wrapper.querySelectorAll(".legacy-tree-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const conceptId = button.dataset.treeToggle;
      const children = wrapper.querySelector(
        `.legacy-tree-children[data-tree-children="${CSS.escape(conceptId)}"]`
      );

      if (!children) return;

      const willOpen = children.hidden;
      children.hidden = !willOpen;
      button.setAttribute("aria-expanded", willOpen ? "true" : "false");
      button.textContent = willOpen ? "▾" : "▸";
    });
  });

  wrapper.querySelectorAll(".advanced-filter-tree-check").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      syncViewerAdvancedFilterTreeToSelect(wrapper, selectEl, checkbox);
      renderViewerFilterChipsForSelect(selectEl, chipsId);
      renderViewerActiveFilterChips();

      viewerPageOffset = 0;
      await reloadViewer({ includeMap: true });
    });
  });

  const searchInput = wrapper.querySelector("[data-tree-search]");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      filterViewerAdvancedFilterTree(wrapper, searchInput.value);
    });
  }
}

function getViewerAdvancedFilterTreeWrapperForSelect(selectEl) {
  if (!selectEl?.id) return null;

  return document.querySelector(
    `.advanced-filter-tree-picker[data-filter-tree-for="${CSS.escape(selectEl.id)}"]`
  );
}

function getViewerAdvancedFilterTreeChildCheckboxes(wrapper, conceptId) {
  if (!wrapper || !conceptId) return [];

  const childrenContainer = wrapper.querySelector(
    `.legacy-tree-children[data-tree-children="${CSS.escape(conceptId)}"]`
  );

  if (!childrenContainer) return [];

  return Array.from(
    childrenContainer.querySelectorAll(".advanced-filter-tree-check")
  );
}

function syncViewerAdvancedFilterTreeToSelect(wrapper, selectEl, changedCheckbox) {
  if (!wrapper || !selectEl || !changedCheckbox) return;

  const changedValue = changedCheckbox.dataset.value;
  const changedConceptId = changedCheckbox.dataset.conceptId;
  const checked = changedCheckbox.checked;

  const changedOption = Array.from(selectEl.options || []).find(
    (option) => String(option.value) === String(changedValue)
  );

  if (changedOption) {
    changedOption.selected = checked;
  }

  /*
    Parent selection selects the branch. Deselecting a parent clears the branch.
    This matches the Monuments tree picker behaviour.
  */
  getViewerAdvancedFilterTreeChildCheckboxes(wrapper, changedConceptId).forEach((childCheckbox) => {
    childCheckbox.checked = checked;
    childCheckbox.indeterminate = false;

    const childValue = childCheckbox.dataset.value;
    const childOption = Array.from(selectEl.options || []).find(
      (option) => String(option.value) === String(childValue)
    );

    if (childOption) {
      childOption.selected = checked;
    }
  });

  updateViewerAdvancedFilterTreeParentStates(wrapper);
}

function syncViewerAdvancedFilterTreeFromSelect(selectEl) {
  const wrapper = getViewerAdvancedFilterTreeWrapperForSelect(selectEl);
  if (!wrapper || !selectEl) return;

  const selectedValues = new Set(
    Array.from(selectEl.selectedOptions || []).map((option) => String(option.value))
  );

  wrapper.querySelectorAll(".advanced-filter-tree-check").forEach((checkbox) => {
    const value = String(checkbox.dataset.value || "");
    checkbox.checked = selectedValues.has(value);
    checkbox.indeterminate = false;
  });

  updateViewerAdvancedFilterTreeParentStates(wrapper);
  renderViewerFilterChipsForSelect(
    selectEl,
    selectEl === viewerFilterMonumentType
      ? "viewerFilterMonumentTypeChips"
      : ""
  );
}

function updateViewerAdvancedFilterTreeParentStates(wrapper) {
  if (!wrapper) return;

  const parentNodes = Array.from(
    wrapper.querySelectorAll(".legacy-tree-node")
  ).reverse();

  parentNodes.forEach((node) => {
    const checkbox = node.querySelector(":scope > .legacy-tree-row .advanced-filter-tree-check");
    if (!checkbox) return;

    const conceptId = checkbox.dataset.conceptId;
    const childCheckboxes = getViewerAdvancedFilterTreeChildCheckboxes(wrapper, conceptId);

    if (!childCheckboxes.length) return;

    const checkedCount = childCheckboxes.filter((child) => child.checked).length;
    const indeterminateCount = childCheckboxes.filter((child) => child.indeterminate).length;

    if (checkedCount === childCheckboxes.length) {
      checkbox.checked = true;
      checkbox.indeterminate = false;
    } else if (checkedCount > 0 || indeterminateCount > 0) {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    } else {
      checkbox.checked = false;
      checkbox.indeterminate = false;
    }
  });
}

function filterViewerAdvancedFilterTree(wrapper, query) {
  if (!wrapper) return;

  const search = String(query || "").trim().toLowerCase();
  const nodes = Array.from(wrapper.querySelectorAll(".legacy-tree-node"));

  if (!search) {
    nodes.forEach((node) => {
      node.hidden = false;
    });
    return;
  }

  nodes.forEach((node) => {
    const text = node.textContent.toLowerCase();
    const matches = text.includes(search);

    node.hidden = !matches;

    if (matches) {
      let parent = node.parentElement?.closest(".legacy-tree-node");

      while (parent) {
        parent.hidden = false;

        const parentConceptId = parent.dataset.conceptId;
        const childContainer = wrapper.querySelector(
          `.legacy-tree-children[data-tree-children="${CSS.escape(parentConceptId)}"]`
        );
        const toggle = wrapper.querySelector(
          `.legacy-tree-toggle[data-tree-toggle="${CSS.escape(parentConceptId)}"]`
        );

        if (childContainer) {
          childContainer.hidden = false;
        }

        if (toggle) {
          toggle.textContent = "▾";
          toggle.setAttribute("aria-expanded", "true");
        }

        parent = parent.parentElement?.closest(".legacy-tree-node");
      }
    }
  });
}

async function loadViewerLookups() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const response = await fetch(
    `/api/viewer/lookups?lang=${encodeURIComponent(lang)}`,
    { method: "GET", credentials: "include" }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load viewer lookups");
  }

  viewerLookups = data.lookups || {};
}

function populateViewerFilterLookups() {
  if (viewerFilterCountry) {
    viewerPopulateMultiSelect(
      viewerFilterCountry,
      viewerLookupOptions("country")
    );

    renderViewerFilterChipsForSelect(
      viewerFilterCountry,
      "viewerFilterCountryChips"
    );
  }

  if (viewerFilterMonumentType) {
    renderViewerAdvancedFilterTreePicker({
      selectEl: viewerFilterMonumentType,
      chipsId: "viewerFilterMonumentTypeChips",
      treeLookupName: "monument_type_tree",
      treeId: "viewerFilterMonumentTypeTree",
      searchPlaceholder: t("search_site_types", "Search site types...")
    });
  }

  VIEWER_CHIP_MULTISELECTS.forEach((config) => {
    renderViewerFilterChipsForSelect(config.select, config.chipsId);
  });
  
  renderViewerActiveFilterChips();
}

function renderViewerActiveFilterChips() {
  if (!viewerActiveFilterStrip || !viewerActiveFilterChips) return;

  const chips = [];

  const text = getViewerTextSearch();
  if (text) {
    chips.push({
      kind: "text",
      label: text,
      title: t("text_search", "Text search")
    });
  }

  const caalId = getViewerCaalIdSearch();
  if (caalId) {
    chips.push({
      kind: "caal_id",
      label: caalId,
      title: "CAAL_ID"
    });
  }

  chips.push(
    ...viewerSelectedOptionChips(
      viewerFilterCountry,
      "country",
      t("country", "Country")
    )
  );

  chips.push(
    ...viewerSelectedOptionChips(
      viewerFilterMonumentType,
      "monument_type",
      t("monument_type", "Monument Type")
    )
  );

  VIEWER_CHIP_MULTISELECTS
    .filter((config) => config.kind !== "country")
    .forEach((config) => {
      chips.push(
        ...viewerSelectedOptionChips(
          config.select,
          config.kind,
          t(config.titleKey, config.titleFallback)
        )
      );
    });

  if (viewerFilterRiskMin?.value) {
    const selectedOption = viewerFilterRiskMin.selectedOptions?.[0];

    chips.push({
      kind: "risk_min",
      value: viewerFilterRiskMin.value,
      label: selectedOption?.textContent?.trim() || viewerFilterRiskMin.value,
      title: t("minimum_risk_level", "Minimum risk level")
    });
  }

  if (activeMapViewFilterBbox) {
    chips.push({
      kind: "map_view",
      label: t("viewer_spatial_map_extent", "Map extent"),
      title: t("viewer_spatial_search", "Spatial search"),
      className: "active-filter-chip-map"
    });
  }

  if (activeViewerSpatialPolygon) {
    chips.push({
      kind: "spatial_polygon",
      label: t("viewer_spatial_drawn_area", "Drawn area"),
      title: t("viewer_spatial_search", "Spatial search"),
      className: "active-filter-chip-map"
    });
  }

  viewerActiveFilterStrip.hidden = chips.length === 0;
  viewerActiveFilterChips.innerHTML = "";

  chips.forEach((chip) => {
    const chipEl = document.createElement("span");
    chipEl.className = `active-filter-chip ${chip.className || ""}`.trim();
    chipEl.title = chip.title || "";

    const textEl = document.createElement("span");
    textEl.className = "active-filter-chip-text";
    textEl.textContent = chip.label;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "active-filter-chip-remove";
    removeBtn.textContent = "×";
    removeBtn.setAttribute(
      "aria-label",
      `${t("remove_filter", "Remove filter")}: ${chip.label}`
    );

    removeBtn.addEventListener("click", async () => {
      await removeViewerActiveFilterChip(chip);
    });

    chipEl.appendChild(textEl);
    chipEl.appendChild(removeBtn);
    viewerActiveFilterChips.appendChild(chipEl);
  });
}

async function removeViewerActiveFilterChip(chip) {
  if (!chip) return;

  if (chip.kind === "text" && viewerSearch) {
    viewerSearch.value = "";
  }

  if (chip.kind === "caal_id" && viewerFilterCaalId) {
    viewerFilterCaalId.value = "";
  }

  if (chip.kind === "monument_type") {
    clearSelectedOptionByValue(viewerFilterMonumentType, chip.value);
    syncViewerAdvancedFilterTreeFromSelect(viewerFilterMonumentType);
  }

  const config = viewerChipConfigForKind(chip.kind);
  if (config?.select) {
    clearSelectedOptionByValue(config.select, chip.value);
    renderViewerFilterChipsForSelect(config.select, config.chipsId);
  }

  if (chip.kind === "risk_min" && viewerFilterRiskMin) {
    viewerFilterRiskMin.value = "";
  }

  if (chip.kind === "map_view") {
    activeMapViewFilterBbox = null;
    updateFilterToMapViewButton();
  }

  if (chip.kind === "spatial_polygon") {
    await clearViewerSpatialPolygonFilter({
      reload: false
    });
  }

  viewerPageOffset = 0;
  await reloadViewer({ includeMap: true });
}

function updateFilterToMapViewButton() {
  if (!filterToMapViewBtn) return;

  const isActive = Boolean(activeMapViewFilterBbox);

  const label = isActive
    ? t("viewer_update_map_extent", "Update extent")
    : t("viewer_spatial_map_extent", "Map extent");

  const title = isActive
    ? t(
        "viewer_update_map_extent_help",
        "Update the spatial filter to the current visible map extent"
      )
    : t(
        "viewer_spatial_map_extent_help",
        "Search using the current visible map extent"
      );

  if (filterToMapViewBtnLabel) {
    filterToMapViewBtnLabel.textContent = label;
  } else {
    filterToMapViewBtn.textContent = label;
  }

  filterToMapViewBtn.title = title;
  filterToMapViewBtn.setAttribute("aria-label", title);
  filterToMapViewBtn.setAttribute(
    "aria-pressed",
    isActive ? "true" : "false"
  );

  filterToMapViewBtn.classList.toggle("is-active", isActive);
}

// map popup
function viewerPopupRecordFromFeature(feature) {
  const props = feature?.properties || {};

  return {
    identity: {
      caal_id: props.caal_id || "",
      record_type: props.record_type || "",
      dataset_label: props.dataset_label || ""
    },
    summary: {
      display_label: props.display_label || "",
      source_schema: props.source_schema || "",
      source_table: props.source_table || "",
      source_scope: props.source_scope || "",
      storage_scope: props.storage_scope || ""
    },
    source: {
      schema: props.source_schema || "",
      table: props.source_table || "",
      row_id: props.source_row_id || "",
      scope: props.source_scope || "",
      storage: props.storage_scope || "",
      is_editable: props.is_editable === true || props.is_editable === "true"
    },
    geometry: feature?.geometry || null
  };
}

function renderViewerMapPopupHtml(feature) {
  const record = viewerPopupRecordFromFeature(feature);
  const recordType = record.identity.record_type || "unknown";

  const title = compactViewerText(
    record.summary.display_label ||
    record.identity.caal_id ||
    record.identity.dataset_label ||
    "",
    90
  );

  const caalId = record.identity.caal_id || "";

  const monumentTypeLine = viewerPopupMonumentTypeLine(feature?.properties || {});

  return `
    <div class="map-popup viewer-single-map-popup-card">
      <button
        type="button"
        class="map-popup-title-btn viewer-map-popup-open-title"
        data-viewer-popup-open
      >
        ${escapeHtml(title)}
      </button>

      <div class="map-popup-meta viewer-popup-id-line">
        <span class="${viewerLayerIconClass(recordType)} viewer-popup-type-icon" aria-hidden="true">
          ${viewerLayerIcon(recordType)}
        </span>
        <span>${escapeHtml(caalId)}</span>
      </div>

      ${
        monumentTypeLine
          ? `
            <div class="map-popup-meta">
              ${escapeHtml(monumentTypeLine)}
            </div>
          `
          : ""
      }
      <div class="viewer-popup-related-line" data-popup-related></div>
    </div>
  `;
}

function viewerMapPropertyArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}


function showViewerMapPopup(feature, lngLat) {
  if (!viewerMap || !feature?.properties) return;

  if (viewerPopup) {
    viewerPopup.remove();
    viewerPopup = null;
  }

  const props = feature.properties;

  const relationTypes = viewerMapPropertyArray(
    props.relation_types
  );

  const relationDirections = viewerMapPropertyArray(
    props.relation_directions
  );

  const record = viewerPopupRecordFromFeature(feature);

  viewerPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: "320px",
    className: "monument-single-hover-popup viewer-single-map-popup"
  })
    .setLngLat(lngLat)
    .setHTML(renderViewerMapPopupHtml(feature))
    .addTo(viewerMap);

  setTimeout(() => {
    const popupEl = viewerPopup?.getElement?.();
    const openBtn = popupEl?.querySelector("[data-viewer-popup-open]");

    if (!openBtn) return;

    openBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const recordType = String(record?.identity?.record_type || "").trim();

      // Archive is non-spatial in this Viewer phase, but keep this defensive path.
      if (recordType === "archive") {
        const url = viewerRelatedRecordUrl({
          related_caal_id: record?.identity?.caal_id,
          related_record_type: recordType
        });

        if (url) {
          window.open(url, "_blank", "noopener");
        }

        viewerPopup?.remove?.();
        viewerPopup = null;
        return;
      }

      // All mapped Viewer resources, including monuments, open in the Viewer details pane.
      if (!viewerCanNavigateAway()) return;

      await openViewerRecord(record, { centreOnMap: false });
      viewerPopup?.remove?.();
      viewerPopup = null;
    });
  }, 0);

  const popupCaalId = String(record?.identity?.caal_id || "").trim();
  const thisPopup = viewerPopup;

  if (popupCaalId) {
    fetch(`/api/viewer/related-summary?caal_id=${encodeURIComponent(popupCaalId)}`, {
      method: "GET",
      credentials: "include"
    })
      .then((r) => r.json())
      .then((data) => {
        // Popup may have been closed or replaced while we fetched.
        if (!data.ok || viewerPopup !== thisPopup) return;

        const rows = Array.isArray(data.summary) ? data.summary : [];
        if (!rows.length) return;

        const target = thisPopup.getElement()?.querySelector("[data-popup-related]");
        if (!target) return;

        target.innerHTML = `
          <span class="viewer-popup-related-label">${escapeHtml(t("related", "Related"))}:</span>
          ${rows.map((row) => `
            <span class="viewer-popup-related-item">
              <span class="${viewerLayerIconClass(row.record_type)}">
                ${viewerLayerIcon(row.record_type)}
              </span>
              ${formatCount(row.count)}
            </span>
          `).join("")}
        `;
      })
      .catch(() => { /* popup line is decorative; fail silent */ });
  }
}

function viewerPopupMonumentTypeLine(props = {}) {
  const rawPath = props.monument_type_path;

  if (Array.isArray(rawPath)) {
    return rawPath.filter(Boolean).join(" › ");
  }

  if (typeof rawPath === "string" && rawPath.trim()) {
    try {
      const parsed = JSON.parse(rawPath);

      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).join(" › ");
      }
    } catch {
      return rawPath.trim();
    }

    return rawPath.trim();
  }

  return firstNonBlank(
    props.monument_type_leaf,
    props.monument_type1,
    props.monument_type_1,
    props.monument_type,
    props.primary_type
  );
}

// --------------------------------------------------------
// LIST / RESULTS
// --------------------------------------------------------
async function loadViewerRecords() {
  const params = buildViewerQueryParams({
    includePaging: true,
    includeMapBbox: false
  });

  const response = await fetch(
    `/api/viewer/records?${params.toString()}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data.detail ||
      data.error ||
      "Failed to load viewer records"
    );
  }

  /*
    The query has changed successfully, so stale map-fit data from the
    previous query must not be reused by the Current results target button.
  */
  viewerMapLayers = {};

  Object.keys(VIEWER_CLUSTER_GROUPS).forEach((groupKey) => {
    viewerCentroidGeojsonByGroup[groupKey] = {
      type: "FeatureCollection",
      features: []
    };
  });

  viewerListRecords = [];
  viewerTotalCount = Number(data.total || 0);

  viewerRecordTypeCounts = data.record_type_counts || {};

  viewerRecordsByType = {};
  viewerOffsetsByType = {};

  VIEWER_RECORD_TYPES.forEach((type) => {
    viewerRecordsByType[type] = [];
    viewerOffsetsByType[type] = 0;
  });

  setViewerResultsCountText(
    `${formatCount(viewerTotalCount)} ${
      viewerTotalCount === 1 ? t("record", "record") : t("records", "records")
    }`
  );

  renderViewerResults();
  renderViewerActiveFilterChips();
  updateShowResultsOnMapButton();

  return viewerListRecords;
}

async function reloadOpenViewerResultGroups() {
  const openTypes = viewerResultGroupTypesForCurrentFilters()
    .filter((recordType) => !viewerCollapsedResultGroups.has(recordType));

  await Promise.all(
    openTypes.map((recordType) =>
      loadViewerRecordsForType(recordType, {
        offset: viewerOffsetsByType?.[recordType] || 0
      })
    )
  );
}

async function loadViewerRecordsForType(recordType, { offset = 0 } = {}) {
  const type = String(recordType || "").trim();
  if (!type) return [];

  viewerLoadingTypes.add(type);
  renderViewerResults();

  const params = buildViewerQueryParams({
    includePaging: false,
    includeMapBbox: false
  });

  params.set("recordType", type);
  params.set("recordTypes", type);
  params.set("limit", String(viewerPageLimit));
  params.set("offset", String(offset));

  try {
    const response = await fetch(`/api/viewer/records-by-type?${params.toString()}`, {
      method: "GET",
      credentials: "include"
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.detail || data.error || "Failed to load viewer records for layer");
    }

    viewerRecordsByType[type] = Array.isArray(data.records) ? data.records : [];
    viewerOffsetsByType[type] = Number(data.offset || 0);

    updateShowResultsOnMapButton();

    return viewerRecordsByType[type];

  } finally {
    viewerLoadingTypes.delete(type);
    renderViewerResults();
  }
}

function viewerResultGroupPageInfo(recordType) {
  const total = viewerResultGroupCount(recordType);
  const offset = Number(viewerOffsetsByType?.[recordType] || 0);
  const totalPages = Math.max(1, Math.ceil(total / viewerPageLimit));
  const currentPage = Math.floor(offset / viewerPageLimit) + 1;

  return {
    total,
    offset,
    totalPages,
    currentPage,
    hasPrev: offset > 0,
    hasNext: offset + viewerPageLimit < total
  };
}

function viewerResultGroupCount(recordType, items = []) {
  const count = Number(viewerRecordTypeCounts?.[recordType]);

  if (Number.isFinite(count)) {
    return count;
  }

  return Array.isArray(items) ? items.length : 0;
}

function viewerResultGroupTypesForCurrentFilters() {
  const groupOrder = [
    "monument",
    "archive",
    "rs3_poly",
    "rs3_line",
    "rs3_group",
    "institution",
    "vernacular",
    "dataset",
    "cartography",
    "survey_grid_region",
    "survey_grid"
  ];

  return Object.entries(viewerRecordTypeCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([recordType]) => recordType)
    .sort((a, b) => {
      const aIndex = groupOrder.indexOf(a);
      const bIndex = groupOrder.indexOf(b);

      if (aIndex === -1 && bIndex === -1) {
        return String(a).localeCompare(String(b));
      }

      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;

      return aIndex - bIndex;
    });
}

function groupViewerRecordsByType(records = []) {
  const groupOrder = [
    "monument",
    "archive",
    "rs3_poly",
    "rs3_line",
    "rs3_group",
    "institution",
    "vernacular",
    "dataset",
    "cartography",
    "survey_grid_region",
    "survey_grid"
  ];

  const groups = new Map();

  records.forEach((record, index) => {
    const recordType = record?.identity?.record_type || "unknown";

    if (!groups.has(recordType)) {
      groups.set(recordType, []);
    }

    groups.get(recordType).push({
      record,
      index
    });
  });

  return Array.from(groups.entries()).sort(([a], [b]) => {
    const aIndex = groupOrder.indexOf(a);
    const bIndex = groupOrder.indexOf(b);

    if (aIndex === -1 && bIndex === -1) {
      return String(a).localeCompare(String(b));
    }

    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;

    return aIndex - bIndex;
  });
}

function renderViewerResults() {
  if (!viewerResultsList) return;

  setViewerResultsCountText(
    `${formatCount(viewerTotalCount)} ${viewerTotalCount === 1 ? t("record", "record") : t("records", "records")}`
  );

  const groupTypes = viewerResultGroupTypesForCurrentFilters();

  if (!groupTypes.length) {
    viewerResultsList.innerHTML = `
      <div class="results-empty">
        <p>${escapeHtml(t("no_matching_records", "No matching records."))}</p>
      </div>
    `;
    return;
  }

  const selectedKey = selectedViewerRecordKey();

  const mainGroupsHtml = groupTypes
    .map((recordType) => {
      const items = viewerRecordsByType?.[recordType] || [];
      const groupCount = viewerResultGroupCount(recordType, items);
      const isCollapsed = viewerCollapsedResultGroups.has(recordType);
      const isLoading = viewerLoadingTypes.has(recordType);
      const pageInfo = viewerResultGroupPageInfo(recordType);

      return `
        <section class="viewer-result-group" data-viewer-result-group="${escapeHtml(recordType)}">
          <button
            type="button"
            class="viewer-result-group-header"
            data-viewer-result-group-toggle="${escapeHtml(recordType)}"
            aria-expanded="${isCollapsed ? "false" : "true"}"
          >
            <span class="${viewerLayerIconClass(recordType)}">
              ${viewerLayerIcon(recordType)}
            </span>

            <span class="viewer-result-group-title">
              ${escapeHtml(viewerLayerLabel(recordType))}
            </span>

            <span class="viewer-result-group-count">
              ${formatCount(groupCount)}
            </span>

            <span class="viewer-result-group-chevron" aria-hidden="true">
              ${isCollapsed ? "▸" : "▾"}
            </span>
          </button>

          ${
            isCollapsed
              ? ""
              : `
                <div class="viewer-result-group-body">
                  <div class="pagination-bar viewer-result-group-pagination">
                    <button
                      type="button"
                      class="action-btn viewer-group-page-btn"
                      data-viewer-group-prev="${escapeHtml(recordType)}"
                      ${pageInfo.hasPrev ? "" : "disabled"}
                    >
                      ${escapeHtml(t("previous", "Previous"))}
                    </button>

                    <span class="viewer-result-group-page-info">
                      ${escapeHtml(
                        t("page_x_of_y", "Page {page} of {total}")
                          .replace("{page}", String(pageInfo.currentPage))
                          .replace("{total}", String(pageInfo.totalPages))
                      )}
                    </span>

                    <button
                      type="button"
                      class="action-btn viewer-group-page-btn"
                      data-viewer-group-next="${escapeHtml(recordType)}"
                      ${pageInfo.hasNext ? "" : "disabled"}
                    >
                      ${escapeHtml(t("next", "Next"))}
                    </button>
                  </div>

                  <div class="viewer-result-group-list">
                    ${
                      isLoading
                        ? `
                          <div class="results-empty viewer-result-group-empty">
                            <p>${escapeHtml(t("loading_records", "Loading records..."))}</p>
                          </div>
                        `
                        : items.length
                          ? items.map((record, index) => {
                              const title = viewerRecordTitle(record);
                              const monumentTypeLine = viewerMonumentTypeLine(record);
                              const description = viewerResultDescription(record, 140);
                              const selectedClass = viewerRecordKey(record) === selectedKey ? " is-selected" : "";
                              const recordIndex = `${recordType}:${index}`;

                              return `
                                <article
                                  class="result-card viewer-result-card${selectedClass}"
                                  data-viewer-result-type="${escapeHtml(recordType)}"
                                  data-viewer-result-index="${index}"
                                  tabindex="0"
                                >
                                  <div class="result-card-topline">
                                    <strong>${escapeHtml(title)}</strong>

                                    <span class="${viewerScopeBadgeClass(record)}">
                                      ${escapeHtml(viewerScopeLabel(record))}
                                    </span>
                                  </div>

                                  <div class="result-card-meta">
                                    ${escapeHtml(record?.identity?.caal_id || "")}
                                  </div>


                                  ${
                                    monumentTypeLine
                                      ? `<div class="result-card-meta">${escapeHtml(monumentTypeLine)}</div>`
                                      : ""
                                  }

                                  ${
                                    description
                                      ? `<div class="result-card-description">${escapeHtml(description)}</div>`
                                      : ""
                                  }

                                  ${
                                    viewerRelatedTypeSummaryHtml(record)
                                      ? `<div class="result-card-meta viewer-related-summary-row">
                                          ${viewerRelatedTypeSummaryHtml(record)}
                                        </div>`
                                      : ""
                                  }

                                  <div class="result-card-actions-compact">
                                    <button
                                      type="button"
                                      class="icon-action-btn result-centre-btn viewer-result-centre-btn"
                                      data-viewer-zoom-type="${escapeHtml(recordType)}"
                                      data-viewer-zoom-index="${index}"
                                      title="${escapeHtml(t("zoom_to_record", "Zoom to record"))}"
                                      aria-label="${escapeHtml(t("zoom_to_record", "Zoom to record"))}"
                                    >
                                      ${svgTargetIcon()}
                                    </button>
                                  </div>
                                </article>
                              `;
                            }).join("")
                          : `
                            <div class="results-empty viewer-result-group-empty">
                              <p>${escapeHtml(t("open_layer_to_load_records", "Open this layer to load records."))}</p>
                            </div>
                          `
                    }
                  </div>
                </div>
              `
          }
        </section>
      `;
    })
    .join("");


    viewerResultsList.innerHTML = `
      ${mainGroupsHtml}
      ${renderViewerRelatedResultsSection()}
    `;

  viewerResultsList
    .querySelectorAll("[data-viewer-result-group-toggle]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const recordType = button.dataset.viewerResultGroupToggle;
        if (!recordType) return;

        if (viewerCollapsedResultGroups.has(recordType)) {
          viewerCollapsedResultGroups.delete(recordType);

          if (!viewerRecordsByType?.[recordType]?.length) {
            await loadViewerRecordsForType(recordType, {
              offset: viewerOffsetsByType?.[recordType] || 0
            });
          } else {
            renderViewerResults();
          }
        } else {
          viewerCollapsedResultGroups.add(recordType);
          renderViewerResults();
        }
      });
    });

  viewerResultsList
    .querySelectorAll("[data-viewer-group-prev]")
    .forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const recordType = button.dataset.viewerGroupPrev;
        const currentOffset = Number(viewerOffsetsByType?.[recordType] || 0);
        const nextOffset = Math.max(0, currentOffset - viewerPageLimit);

        await loadViewerRecordsForType(recordType, {
          offset: nextOffset
        });
      });
    });

  viewerResultsList
    .querySelectorAll("[data-viewer-group-next]")
    .forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const recordType = button.dataset.viewerGroupNext;
        const currentOffset = Number(viewerOffsetsByType?.[recordType] || 0);
        const nextOffset = currentOffset + viewerPageLimit;

        await loadViewerRecordsForType(recordType, {
          offset: nextOffset
        });
      });
    });

  viewerResultsList
    .querySelectorAll(".viewer-result-card")
    .forEach((card) => {
      const recordType = card.dataset.viewerResultType;
      const index = Number(card.dataset.viewerResultIndex);
      const record = viewerRecordsByType?.[recordType]?.[index];

      card.addEventListener("click", () => {
        openViewerRecord(record);
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openViewerRecord(record);
        }
      });
    });

  viewerResultsList
    .querySelectorAll(".viewer-result-centre-btn")
    .forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const recordType = btn.dataset.viewerZoomType;
        const index = Number(btn.dataset.viewerZoomIndex);
        const lightRecord = viewerRecordsByType?.[recordType]?.[index];

        if (!lightRecord?.source) return;

        try {
          const fullRecord = await fetchViewerFullRecord(lightRecord);

          if (!fullRecord?.geometry) return;

          fitViewerMapToGeometry(fullRecord.geometry, {
            padding: 90,
            maxZoom: 16,
            pointZoom: 13,
            duration: 700
          });

          drawViewerSelectedHighlight(fullRecord);
        } catch (error) {
          console.error("Viewer result zoom failed:", error);
          setViewerStatus(error.message || "Could not zoom to record", {
            isError: true
          });
        }
      });
    });
}

function renderViewerPagination() {
  const totalPages = Math.max(1, Math.ceil(viewerTotalCount / viewerPageLimit));
  const currentPage = Math.floor(viewerPageOffset / viewerPageLimit) + 1;

  if (viewerPageInfo) {
    viewerPageInfo.textContent = t(
      "page_x_of_y",
      "Page {page} of {total}"
    )
      .replace("{page}", String(currentPage))
      .replace("{total}", String(totalPages));
  }

  if (viewerPrevBtn) {
    viewerPrevBtn.disabled = viewerPageOffset <= 0;
  }

  if (viewerNextBtn) {
    viewerNextBtn.disabled = viewerPageOffset + viewerPageLimit >= viewerTotalCount;
  }
}

function updateSelectedViewerCard() {
  if (!viewerResultsList) return;

  const selectedKey = selectedViewerRecordKey();

  viewerResultsList
    .querySelectorAll(".viewer-result-card")
    .forEach((card) => {
      const recordType = card.dataset.viewerResultType;
      const index = Number(card.dataset.viewerResultIndex);
      const record = viewerRecordsByType?.[recordType]?.[index];

      card.classList.toggle(
        "is-selected",
        viewerRecordKey(record) === selectedKey
      );
    });
}

function getLoadedViewerGroupRecords() {
  return Object.values(viewerRecordsByType || {})
    .flat()
    .filter(Boolean);
}

function getViewerCurrentMapFitCoordinates() {
  const coordinates = [];

  Object.values(viewerCentroidGeojsonByGroup || {}).forEach((geojson) => {
    const features = Array.isArray(geojson?.features) ? geojson.features : [];

    features.forEach((feature) => {
      collectCoordinatesFromGeometry(feature?.geometry).forEach((coord) => {
        coordinates.push(coord);
      });
    });
  });

  Object.values(viewerMapLayers || {}).forEach((geojson) => {
    const features = Array.isArray(geojson?.features) ? geojson.features : [];

    features.forEach((feature) => {
      collectCoordinatesFromGeometry(feature?.geometry).forEach((coord) => {
        coordinates.push(coord);
      });
    });
  });

  return coordinates.filter((coord) =>
    Array.isArray(coord) &&
    coord.length >= 2 &&
    Number.isFinite(Number(coord[0])) &&
    Number.isFinite(Number(coord[1]))
  );
}

function updateShowResultsOnMapButton() {
  if (!showViewerResultsOnMapBtn) return;

  const hasMatchingResults = Number(viewerTotalCount || 0) > 0;
  const hasMapCoordinates = getViewerCurrentMapFitCoordinates().length > 0;

  /*
    Enable as soon as the query has results.
    The map data may still be loading, so showCurrentViewerResultsOnMap()
    will try to load it before fitting the map.
  */
  const enabled = hasMatchingResults || hasMapCoordinates;

  showViewerResultsOnMapBtn.disabled = !enabled;
  showViewerResultsOnMapBtn.classList.toggle("is-disabled", !enabled);
}

async function showCurrentViewerResultsOnMap() {
  if (!viewerMap || !viewerMapLoaded) return;

  const loadedRecords = getLoadedViewerGroupRecords();

  /*
    A single filtered result should use its authoritative full geometry,
    exactly like the target button on an individual result card.
  */
  if (Number(viewerTotalCount || 0) === 1) {
    let lightRecord = loadedRecords[0] || null;

    /*
      The result group may still be collapsed and therefore not loaded.
      Load the one non-empty result group before giving up.
    */
    if (!lightRecord) {
      const onlyRecordType =
        viewerResultGroupTypesForCurrentFilters()[0] || null;

      if (onlyRecordType) {
        const records = await loadViewerRecordsForType(
          onlyRecordType,
          {
            offset: 0
          }
        );

        lightRecord = records?.[0] || null;
      }
    }

    if (!lightRecord?.source) {
      return;
    }

    const fullRecord = await fetchViewerFullRecord(lightRecord);

    if (!fullRecord?.geometry) {
      return;
    }

    fitViewerMapToGeometry(fullRecord.geometry, {
      padding: 90,
      maxZoom: 16,
      pointZoom: 14,
      duration: 700
    });

    drawViewerSelectedHighlight(fullRecord);
    return;
  }

  /*
    For multiple results, reload the filtered map data first so the extent
    cannot be calculated from stale map or centroid caches.
  */
  await loadViewerMap();

  const coordinates = getViewerCurrentMapFitCoordinates();

  if (!coordinates.length) {
    return;
  }

  const bounds = coordinates.reduce(
    (box, coordinate) => box.extend(coordinate),
    new maplibregl.LngLatBounds(
      coordinates[0],
      coordinates[0]
    )
  );

  suppressViewerMapReload();

  viewerMap.fitBounds(bounds, {
    padding: 70,
    maxZoom: 14,
    duration: 700
  });
}

function fitViewerMapToGeometry(geometry, options = {}) {
  if (!viewerMap || !geometry) return;

  const coords = collectCoordinatesFromGeometry(geometry);

  if (!coords.length) return;

  suppressViewerMapReload();

  const bounds = coords.reduce(
    (box, coord) => box.extend(coord),
    new maplibregl.LngLatBounds(coords[0], coords[0])
  );

  const isSinglePoint =
    geometry.type === "Point" ||
    coords.length === 1;

  if (isSinglePoint) {
    viewerMap.easeTo({
      center: coords[0],
      zoom: Math.max(viewerMap.getZoom(), options.pointZoom || 13),
      duration: options.duration || 700
    });
    return;
  }

  viewerMap.fitBounds(bounds, {
    padding: options.padding || 80,
    maxZoom: options.maxZoom || 16,
    duration: options.duration || 700
  });
}

function collectCoordinatesFromGeometry(geometry) {
  if (!geometry) return [];

  const coords = [];

  function walk(value) {
    if (!Array.isArray(value)) return;

    if (
      value.length >= 2 &&
      Number.isFinite(Number(value[0])) &&
      Number.isFinite(Number(value[1]))
    ) {
      coords.push([Number(value[0]), Number(value[1])]);
      return;
    }

    value.forEach(walk);
  }

  walk(geometry.coordinates);

  return coords;
}

function pointLikeCoordinates(geometry) {
  if (!geometry) return null;

  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }

  if (geometry.type === "Polygon") {
    return firstCoordinateFromNestedArray(geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return firstCoordinateFromNestedArray(geometry.coordinates);
  }

  if (geometry.type === "LineString") {
    return firstCoordinateFromNestedArray(geometry.coordinates);
  }

  if (geometry.type === "MultiLineString") {
    return firstCoordinateFromNestedArray(geometry.coordinates);
  }

  return null;
}

function firstCoordinateFromNestedArray(value) {
  if (!Array.isArray(value)) return null;

  if (
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  ) {
    return [Number(value[0]), Number(value[1])];
  }

  for (const item of value) {
    const found = firstCoordinateFromNestedArray(item);
    if (found) return found;
  }

  return null;
}

function hasViewerFieldValue(raw, fieldName) {
  const value = raw?.[fieldName];

  return value !== null &&
    value !== undefined &&
    String(value).trim() !== "";
}

function viewerRawValue(raw, ...fieldNames) {
  for (const fieldName of fieldNames) {
    if (raw?.[fieldName] !== null && raw?.[fieldName] !== undefined) {
      const value = raw[fieldName];

      if (String(value).trim() !== "") {
        return value;
      }
    }
  }

  return null;
}

function renderViewerDetailItem(label, value, { fullWidth = false } = {}) {
  return `
    <div class="detail-item ${fullWidth ? "full-width" : ""}">
      <span class="detail-label">${escapeHtml(label)}</span>
      <div class="detail-value">${viewerSafeDisplayValue(value)}</div>
    </div>
  `;
}

function viewerLookupLabelByValue(lookupNames, value) {
  const needle = String(value ?? "").trim();
  if (!needle) return value;

  const names = Array.isArray(lookupNames) ? lookupNames : [lookupNames];

  const normalise = (input) =>
    String(input ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const needleNorm = normalise(needle);

  for (const lookupName of names) {
    const options = viewerLookupOptions(lookupName);

    const match = options.find((item) => {
      const candidates = [
        item?.value,
        item?.id,
        item?.concept_id,
        item?.canonical_value,
        item?.label,
        item?.label_en,
        item?.display_label,
        item?.chip_label,
        item?.display_en,
        item?.path_label_en
      ];

      return candidates.some((candidate) => {
        const candidateNorm = normalise(candidate);

        if (candidateNorm === needleNorm) {
          return true;
        }

        // Handles path labels like:
        // "Water supply and disposal > Water storage > Well"
        if (candidateNorm.includes(" > ")) {
          return candidateNorm
            .split(">")
            .map((part) => normalise(part))
            .includes(needleNorm);
        }

        return false;
      });
    });

    if (match) {
      return viewerOptionLabel(match);
    }
  }

  return value;
}

function viewerDisplayValue(fieldName, value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return value;
  }

  if (fieldName === "Country" || fieldName === "country") {
    return viewerLookupLabelByValue("country", value);
  }

  if (
    fieldName === "Monument type1" ||
    fieldName === "Monument type2" ||
    fieldName === "Monument type3" ||
    fieldName === "Monument type4" ||
    fieldName === "Monument type 1" ||
    fieldName === "Monument type 2" ||
    fieldName === "Monument type 3" ||
    fieldName === "Monument type 4"
  ) {
    return viewerLookupLabelByValue(
      ["monument_type_tree", "monument_type", "site_type_tree", "site_type"],
      value
    );
  }

  return value;
}

function viewerSafeDisplayValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return `<span class="empty-value">${escapeHtml(t("none_recorded", "None recorded"))}</span>`;
  }

  return escapeHtml(String(value));
}

function viewerBooleanValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value).toLowerCase() === "true" ||
    String(value).toLowerCase() === "yes" ||
    String(value).toLowerCase() === "y"
  );
}

function viewerMeasurementValue(raw, kind, index) {
  const prefixes = VIEWER_MEASUREMENT_FIELDS[kind] || [];

  const candidates = prefixes.flatMap((prefix) => [
    `${prefix}${index}`,
    `${prefix} ${index}`
  ]);

  return viewerRawValue(raw, ...candidates);
}

function viewerGuideDisplayHtml(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  /*
    Add line breaks before known deterioration headings.
    Longest labels are listed first to avoid partial matches.
  */
  const deteriorationLabels = [
    "Transport Infrastructure",
    "Urban Encroachment",
    "Riverine Erosion",
    "Soil Erosion",
    "Construction",
    "Agriculture",
    "Quarrying",
    "Looting",
    "Cemetery",
    "Dumping",
    "Fire"
  ];

  const escapedLabels = deteriorationLabels
    .map((label) =>
      label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("|");

  let formatted = escapeHtml(text);

  /*
    Preserve any line breaks already present in the database.
  */
  formatted = formatted.replace(/\r?\n+/g, "<br>");

  /*
    Deterioration guide:
    "Urban Encroachment - ... Construction - ..."
  */
  formatted = formatted.replace(
    new RegExp(
      `\\s+(?=(${escapedLabels})\\s*[-–—:]\\s*)`,
      "gi"
    ),
    "<br>"
  );

  /*
    Condition and risk guides:
    "1 - Excellent 2 - Good ..."
    Also supports 0–5 and colon separators.
  */
  formatted = formatted.replace(
    /\s+(?=[0-5]\s*[-–—:]\s*)/g,
    "<br>"
  );

  return formatted;
}

function viewerSectionHelp(label, text) {
  if (!text) return "";

  return `
    <span
      class="viewer-help-tooltip"
      tabindex="0"
    >
      <span class="viewer-help-tooltip-trigger">
        ${escapeHtml(label)}
      </span>

      <span
        class="viewer-help-details-content"
        role="tooltip"
      >
        ${viewerGuideDisplayHtml(text)}
      </span>
    </span>
  `;
}

function renderViewerSubgroup(raw, subgroup, record = null) {
  const descriptions = (subgroup.descriptions || [])
    .map((fieldName) => renderViewerField(raw, fieldName, record))
    .join("");

  const rows = (subgroup.fields || [])
    .map((fieldName) => renderViewerField(raw, fieldName, record))
    .filter(Boolean)
    .join("");

  if (!descriptions && !rows) return "";

  return `
    <div class="viewer-detail-subgroup">
      <div class="detail-item full-width section-header">
        <span class="detail-section-title">${escapeHtml(vLabel(subgroup.title, subgroup.title))}</span>
      </div>
      ${descriptions}
      ${rows}
    </div>
  `;
}

function renderViewerDetailGroup(raw, group, record) {
  switch (group.custom) {
    case "rs_basics":
      return renderViewerBasicsGroup(raw, record);

    case "rs_type_of_anomaly":
      return renderViewerTypeOfAnomalyGroup(raw);

    case "rs_measurements":
      return renderViewerMeasurementsGroup(raw);

    case "rs_interpretation":
      return renderViewerInterpretationGroup(raw, record);

    case "rs_condition":
      return renderViewerConditionAssessmentGroup(raw);

    case "rs_risk":
      return renderViewerRiskAssessmentGroup(raw);

    case "related_resources":
      return renderViewerRelatedResourcesGroup(record);

    case "metadata":
      return renderViewerMetadataGroup(raw, record);

    default:
      break;
  }

  const rows = (group.fields || [])
    .map((fieldName) => renderViewerField(raw, fieldName, record))
    .filter(Boolean)
    .join("");

  const subgroups = (group.subgroups || [])
    .map((subgroup) => renderViewerSubgroup(raw, subgroup, record))
    .filter(Boolean)
    .join("");

  if (!rows && !subgroups) return "";

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(vLabel(group.title, group.title))}</span>
        </div>
        ${rows}
        ${subgroups}
      </div>
    </div>
  `;
}

function renderViewerStructuredDetailsFromJson(record) {
  const sections = Array.isArray(record?.detail_sections)
    ? record.detail_sections
    : [];

  if (!sections.length) return "";

  return sections.map((section) => {
    const fields = Array.isArray(section.fields) ? section.fields : [];

    const rows = fields
      .map((field) => {
        const label = field.label || field.key || "";
        const value = field.value;

        if (
          value === null ||
          value === undefined ||
          String(value).trim() === ""
        ) {
          return "";
        }

        return `
          <div class="detail-item ${field.full_width ? "full-width" : ""}">
            <span class="detail-label">
              ${escapeHtml(vLabel(label, label))}
            </span>
            <div class="detail-value">
              ${viewerSafeDisplayValue(value)}
            </div>
          </div>
        `;
      })
      .filter(Boolean)
      .join("");

    if (!rows) return "";

    return `
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">
              ${escapeHtml(vLabel(section.label || section.key || "Details", section.label || "Details"))}
            </span>
          </div>
          ${rows}
        </div>
      </div>
    `;
  }).filter(Boolean).join("");
}

function renderViewerDetailGroups(record) {
  const raw = record.raw || {};
  const recordType = record.identity?.record_type || "";

  const groups = VIEWER_DETAIL_GROUPS[recordType] || [];

  if (groups.length) {
    const html = groups
      .map((group) => renderViewerDetailGroup(raw, group, record))
      .filter(Boolean)
      .join("");

    return html || renderViewerFallbackRawFields(record);
  }

  const structuredHtml = renderViewerStructuredDetailsFromJson(record);

  if (structuredHtml) {
    return structuredHtml;
  }

  return renderViewerFallbackRawFields(record);
}

function renderViewerFallbackRawFields(record) {
  const raw = record.raw || {};

  const rawRows = Object.entries(raw)
    .filter(([key, value]) => {
      if (key === "geom") return false;
      return value !== null && value !== undefined && String(value).trim() !== "";
    })
    .slice(0, 80)
    .map(([key, value]) => `
      <div class="detail-item">
        <span class="detail-label">${escapeHtml(key)}</span>
        <div class="detail-value">${escapeHtml(String(value))}</div>
      </div>
    `)
    .join("");

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(t("record_fields", "Record fields"))}</span>
        </div>
        ${rawRows || `<div class="section-empty">${escapeHtml(t("no_populated_fields", "No populated fields in this section."))}</div>`}
      </div>
    </div>
  `;
}

// --------------------------------------------------------
// DETAIL PANE
// --------------------------------------------------------
async function fetchViewerRecordByCaalId(caalId) {
  const id = String(caalId || "").trim();
  if (!id) return null;

  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const params = new URLSearchParams();
  params.set("caal_id", id);
  params.set("lang", lang);

  const response = await fetch(`/api/viewer/record?${params.toString()}`, {
    method: "GET",
    credentials: "include"
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Failed to load viewer record");
  }

  return data.record || null;
}

async function fetchViewerFullRecord(lightRecord) {
  if (!lightRecord?.source) return null;

  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const params = new URLSearchParams();
  params.set("source_schema", lightRecord.source.schema);
  params.set("source_table", lightRecord.source.table);
  params.set("source_row_id", lightRecord.source.row_id);
  params.set("lang", lang);

  const response = await fetch(`/api/viewer/record?${params.toString()}`, {
    method: "GET",
    credentials: "include"
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Failed to load viewer record");
  }

  return data.record || null;
}

async function openViewerRecord(lightRecord, { centreOnMap = false } = {}) {
  if (!lightRecord?.source) return;

  try {
    setViewerLoading(true, t("loading_record", "Loading record..."));

    viewerSelectedRecord = await fetchViewerFullRecord(lightRecord);

    if (!viewerSelectedRecord) {
      throw new Error("Record could not be loaded");
    }

    renderViewerRecordDetails(viewerSelectedRecord);
    updateSelectedViewerCard();
    drawViewerSelectedHighlight(viewerSelectedRecord);

    if (centreOnMap && viewerSelectedRecord?.geometry) {
      ensureViewerRecordVisible(viewerSelectedRecord);
    }
  } catch (error) {
    console.error("Open viewer record failed:", error);
    alert(error.message || t("could_not_open_record", "Could not open record"));
  } finally {
    setViewerLoading(false);
  }
}

function renderViewerBasicsGroup(raw, record) {
  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(t("basics", "Basics"))}</span>
        </div>

        ${renderViewerDetailItem(t("viewer_record_type", "Resource type"), record.identity?.dataset_label)}
        ${renderViewerDetailItem(vLabel("Country", "Country"), viewerTranslatedFieldValue(record, "Country", raw?.Country))}
        ${renderViewerDetailItem(vLabel("Region", "Region"), raw?.Region)}
        ${renderViewerDetailItem(vLabel("Gridcode", "Gridcode"), raw?.Gridcode)}
      </div>
    </div>
  `;
}

function renderViewerRecordDetails(record) {
  if (!viewerRecordDetails) return;

  if (!record) {
    viewerRecordDetails.innerHTML = `
      <div class="empty-state">
        <p>${escapeHtml(t("no_record_selected", "No record selected yet."))}</p>
      </div>
    `;

    if (viewerCloseRecordBtn) {
      viewerCloseRecordBtn.hidden = true;
    }

    return;
  }

  if (viewerCloseRecordBtn) {
    viewerCloseRecordBtn.hidden = false;
  }

  const raw = record.raw || {};

  const caalId = record.identity?.caal_id || "";
  const isEditable = record.source?.is_editable === true;

  const statusBadge = isEditable
    ? `<span class="record-status-badge record-status-editable">${escapeHtml(t("editable", "Editable"))}</span>`
    : `<span class="record-status-badge record-status-readonly">${escapeHtml(t("read_only", "Read-only"))}</span>`;

  viewerRecordDetails.innerHTML = `
    <div class="record-title">
      <div class="record-title-actions record-title-actions-topright">
        ${statusBadge}

        ${
          record?.geometry
            ? `
              <button
                type="button"
                class="icon-action-btn record-title-icon-btn"
                id="viewerZoomToOpenRecordBtn"
                title="${escapeHtml(t("centre_on_map", "Centre on map"))}"
                aria-label="${escapeHtml(t("centre_on_map", "Centre on map"))}"
              >
                ${svgTargetIcon()}
              </button>
            `
            : ""
        }
      </div>

      <div class="record-title-main">
        <h3>${escapeHtml(viewerRecordTitle(record))}</h3>

        <p class="copyable-field monument-title-caal-id">
          <span class="copyable-field-text">${escapeHtml(caalId)}</span>

          ${
            caalId
              ? `
                <button
                  type="button"
                  class="copy-field-btn"
                  id="viewerCopyCaalIdBtn"
                  title="${escapeHtml(t("copy_to_clipboard", "Copy to clipboard"))}"
                  aria-label="${escapeHtml(t("copy_to_clipboard", "Copy to clipboard"))}: ${escapeHtml(caalId)}"
                >
                  ${svgCopyIcon()}
                </button>
              `
              : ""
          }
        </p>
      </div>
    </div>

    <div class="group-stack">
      ${renderViewerDetailGroups(record)}
    </div>
  `;

  wireViewerRelatedDetailChips();
  wireViewerRelatedMapButtons();

  const copyBtn = document.getElementById("viewerCopyCaalIdBtn");
  if (copyBtn && caalId) {
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(caalId);
      if (typeof showToast === "function") {
        showToast(t("caal_id_copied", "CAAL_ID copied"));
      }
    });
  }

  const zoomBtn = document.getElementById("viewerZoomToOpenRecordBtn");
  if (zoomBtn) {
    zoomBtn.addEventListener("click", () => {
      fitViewerMapToGeometry(record.geometry, {
        padding: 90,
        maxZoom: 16,
        pointZoom: 13,
        duration: 700
      });

      drawViewerSelectedHighlight(record);
    });
  }
}

function closeViewerRecord() {
  viewerSelectedRecord = null;
  renderViewerRecordDetails(null);
  updateSelectedViewerCard();
  clearViewerSelectedHighlight();
}

// --------------------------------------------------------
// MONUMENT DETAILS IN VIEWER
// Read-only renderer adapted from Monuments page layout
// --------------------------------------------------------
function viewerLegacyMultiValuesFromRaw(raw, fieldBase, count) {
  const values = [];

  for (let i = 1; i <= count; i += 1) {
    const value = viewerRawValue(
      raw,
      `${fieldBase}${i}`,
      `${fieldBase} ${i}`
    );

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      values.push(value);
    }
  }

  return values;
}

function renderViewerValueList(label, values) {
  const cleanValues = Array.isArray(values)
    ? values.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  const html = cleanValues.length
    ? `
      <ul class="detail-value-list">
        ${cleanValues.map((value) => `<li>${viewerSafeDisplayValue(value)}</li>`).join("")}
      </ul>
    `
    : viewerSafeDisplayValue(null);

  return `
    <div class="detail-item full-width">
      <span class="detail-label">${escapeHtml(label)}</span>
      <div class="detail-value">${html}</div>
    </div>
  `;
}

function renderViewerMonumentMainGroup(raw, record) {
  const monumentTypes =
    Array.isArray(record?.summary?.monument_type_path) &&
    record.summary.monument_type_path.length
      ? record.summary.monument_type_path
      : viewerLegacyMultiValuesFromRaw(raw, "Monument Type", 6);

  const religions = viewerLegacyMultiValuesFromRaw(raw, "Religion", 3);
  const culturalPeriods = viewerLegacyMultiValuesFromRaw(raw, "Cultural Period", 6);

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(t("nav_monuments", "Monument"))}</span>
        </div>

        ${renderViewerDetailItem(vLabel("Monument Passport", "Monument Passport"), raw["Monument Passport"], { fullWidth: true })}
        ${renderViewerValueList(vLabel("Monument Type", "Monument Type"), monumentTypes)}
        ${renderViewerValueList(vLabel("Religion", "Religion"), religions)}
        ${renderViewerDetailItem(vLabel("Descriptive Date", "Descriptive Date"), raw["Descriptive Date"], { fullWidth: true })}
        ${renderViewerValueList(vLabel("Cultural Period", "Cultural Period"), culturalPeriods)}
        ${renderViewerDetailItem(vLabel("Start Date", "Start Date"), raw["Start Date"])}
        ${renderViewerDetailItem(vLabel("End Date", "End Date"), raw["End Date"])}
        ${renderViewerDetailItem(vLabel("Primary Description", "Primary Description"), raw["Primary Description"], { fullWidth: true })}
        ${renderViewerDetailItem(vLabel("Primary Description (English)", "Primary Description (English)"), raw["Primary Description (English)"], { fullWidth: true })}
        ${renderViewerDetailItem(vLabel("Additional Notes", "Additional Notes"), raw["Additional Notes"], { fullWidth: true })}
      </div>
    </div>
  `;
}

function renderViewerMonumentAdministrationGroup(raw) {
  const rows = [];

  for (let i = 1; i <= VIEWER_REPEATABLE_MAX; i += 1) {
    const name = viewerRawValue(raw, `Administrative Subdivision Name${i}`);
    const type = viewerRawValue(raw, `Administrative Subdivision Type${i}`);

    if (name === null && type === null) continue;

    rows.push({ name, type });
  }

  const rowsHtml = rows.length
    ? rows.map((row, index) => `
        <div class="measurement-row measurement-row-readonly monument-repeatable-display-row">
          <div class="measurement-row-title">
            ${escapeHtml(t("subdivision_number", "Subdivision {number}").replace("{number}", index + 1))}
          </div>

          <div class="measurement-row-fields">
            <div class="measurement-field">
              <span class="detail-label">${escapeHtml(t("name", "Name"))}</span>
              <div class="detail-value">${viewerSafeDisplayValue(row.name)}</div>
            </div>

            <div class="measurement-field">
              <span class="detail-label">${escapeHtml(vLabel("Type", "Type"))}</span>
              <div class="detail-value">${viewerSafeDisplayValue(row.type)}</div>
            </div>
          </div>
        </div>
      `).join("")
    : `<div class="section-empty">${escapeHtml(t("no_populated_fields", "No populated fields in this section."))}</div>`;

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">${escapeHtml(t("administration", "Administration"))}</span>
        </div>

        <div class="detail-item full-width viewer-repeatable-display">
          ${rowsHtml}
        </div>
      </div>
    </div>
  `;
}

function renderViewerMonumentMeasurementsGroup(raw) {
  return renderViewerMeasurementsGroup(raw);
}

// =====================================================================
// Related-records map overlay
// =====================================================================

const VIEWER_RELATED_SOURCES = {
  records: "viewer-related-records",
  lines: "viewer-relationship-lines"
};

const VIEWER_RELATED_LAYERS = [
  "viewer-related-fill-layer",
  "viewer-related-outline-layer",
  "viewer-related-line-layer",
  "viewer-related-point-layer",
  "viewer-relationship-lines-layer"
];

let viewerRelatedOverlayActive = false;

let viewerRelatedPopupsBound = false;

function bindViewerRelatedOverlayPopups() {
  if (viewerRelatedPopupsBound) return;
   viewerRelatedPopupsBound = true;

   ["viewer-related-point-layer", "viewer-related-fill-layer", "viewer-related-line-layer"]
     .forEach((layerId) => {
       viewerMap.on("click", layerId, (e) => {
         const f = e.features?.[0];
         if (!f) return;

         showViewerMapPopup(f, e.lngLat);
       });
     });
}

function clearViewerRelatedOverlay() {
  if (!viewerMap) return;

  VIEWER_RELATED_LAYERS.forEach((id) => {
    if (viewerMap.getLayer(id)) viewerMap.removeLayer(id);
  });

  Object.values(VIEWER_RELATED_SOURCES).forEach((id) => {
    if (viewerMap.getSource(id)) viewerMap.removeSource(id);
  });

  viewerRelatedOverlayActive = false;
  renderViewerLegend();
  viewerRelatedPopupsBound = false;
  updateViewerRelatedMapButtonState();
}

function bringViewerRelatedOverlayToFront() {
  if (!viewerMap || !viewerRelatedOverlayActive) {
    return;
  }

  [
    "viewer-relationship-lines-layer",
    "viewer-related-fill-layer",
    "viewer-related-outline-layer",
    "viewer-related-line-layer",
    "viewer-related-point-layer"
  ].forEach((layerId) => {
    if (!viewerMap.getLayer(layerId)) {
      return;
    }

    try {
      viewerMap.moveLayer(layerId);
    } catch (error) {
      console.warn(
        `Could not move related layer ${layerId}:`,
        error
      );
    }
  });
}

async function showViewerRelatedOnMap(caalId) {
  if (!viewerMap || !viewerMapLoaded || !caalId) {
    return;
  }

  const lang =
    (
      typeof window.getCurrentLanguage === "function" &&
      window.getCurrentLanguage()
    ) ||
    activeLang ||
    "en";

  const params = new URLSearchParams({
    caal_id: String(caalId).trim(),
    lang
  });

  const response = await fetch(
    `/api/viewer/related-map?${params.toString()}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  
  const data = await response.json();

  const relatedFeatures =
    Array.isArray(data?.related?.features)
      ? data.related.features
      : [];

  if (!relatedFeatures.length) {
    setViewerStatus(
      t(
        "no_mapped_related_resources",
        "No related resources with mapped geometry were found."
      ),
      {
        isError: false
      }
    );

    return;
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Related map failed");
  }

  clearViewerRelatedOverlay();

  // ---- sources ----
  viewerMap.addSource(VIEWER_RELATED_SOURCES.records, {
    type: "geojson",
    data: data.related
  });

  viewerMap.addSource(VIEWER_RELATED_SOURCES.lines, {
    type: "geojson",
    data: data.relationship_lines
  });

  // ---- relationship lines (under the features) ----
  viewerMap.addLayer({
    id: "viewer-relationship-lines-layer",
    type: "line",
    source: VIEWER_RELATED_SOURCES.lines,
    paint: {
      "line-color": VIEWER_COLOURS.related,
      "line-width": 2,
      "line-opacity": 0.9
    }
  });

  // ---- related polygons ----
  viewerMap.addLayer({
    id: "viewer-related-fill-layer",
    type: "fill",
    source: VIEWER_RELATED_SOURCES.records,
    filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    paint: {
      "fill-color": VIEWER_COLOURS.related,
      "fill-opacity": 0.25
    }
  });

  viewerMap.addLayer({
    id: "viewer-related-outline-layer",
    type: "line",
    source: VIEWER_RELATED_SOURCES.records,
    filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    paint: {
      "line-color": VIEWER_COLOURS.related,
      "line-width": 2
    }
  });

  // ---- related lines (RS3 lines) ----
  viewerMap.addLayer({
    id: "viewer-related-line-layer",
    type: "line",
    source: VIEWER_RELATED_SOURCES.records,
    filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
    paint: {
      "line-color": VIEWER_COLOURS.related,
      "line-width": 3
    }
  });

  // ---- related points ----
  viewerMap.addLayer({
    id: "viewer-related-point-layer",
    type: "circle",
    source: VIEWER_RELATED_SOURCES.records,
    filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
    paint: {
      "circle-radius": 7,
      "circle-color": VIEWER_COLOURS.related,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2
    }
  });

  viewerRelatedOverlayActive = true;
  bringViewerRelatedOverlayToFront();
  
  renderViewerLegend();
  updateViewerRelatedMapButtonState();

  // ---- fit to everything (suppress the reload this triggers) ----
  const bounds = new maplibregl.LngLatBounds();

  const extend = (geometry) => {
    if (!geometry) return;
    const walk = (coords) => {
      if (typeof coords[0] === "number") {
        bounds.extend(coords);
      } else {
        coords.forEach(walk);
      }
    };
    walk(geometry.coordinates);
  };

  extend(
    data?.selected?.geometry ||
    data?.selected?.representative_point
  );

  (data?.related?.features || []).forEach((feature) => {
    extend(feature.geometry);
  });

  if (!bounds.isEmpty()) {
    suppressViewerMapReload(6000);
    viewerMap.fitBounds(bounds, {
      padding: 60,
      maxZoom: 14,
      duration: 900
    });
  }

  bindViewerRelatedOverlayPopups();
}

function wireViewerRelatedMapButtons() {
  document.querySelectorAll(".js-show-related-map").forEach((btn) => {
    if (btn.dataset.relatedMapWired === "true") return;
    btn.dataset.relatedMapWired = "true";

    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        await showViewerRelatedOnMap(btn.dataset.caalId);
      } catch (error) {
        console.error("Related map overlay failed:", error);
      } finally {
        btn.disabled = false;
        updateViewerRelatedMapButtonState();
      }
    });
  });

  document.querySelectorAll(".js-clear-related-map").forEach((btn) => {
    if (btn.dataset.clearRelatedMapWired === "true") return;
    btn.dataset.clearRelatedMapWired = "true";

    btn.addEventListener("click", () => {
      clearViewerRelatedOverlay();
      updateViewerRelatedMapButtonState();
    });
  });

  updateViewerRelatedMapButtonState();
}

function updateViewerRelatedMapButtonState() {
  document.querySelectorAll(".js-show-related-map").forEach((button) => {
    button.hidden = viewerRelatedOverlayActive === true;
  });

  document.querySelectorAll(".js-clear-related-map").forEach((button) => {
    button.hidden = viewerRelatedOverlayActive !== true;
  });
}

// --------------------------------------------------------
// MAP
// --------------------------------------------------------

function getBasemapStyle(name) {
  if (name === "osm") {
    return {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        }
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
          minzoom: 0,
          maxzoom: 19
        }
      ]
    };
  }

  if (name === "maptiler-satellite") {
    return "https://api.maptiler.com/maps/satellite/style.json?key=wZNaIRIPfJrrJLopqgo0";
  }

  if (name === "maptiler-hybrid") {
    return "https://api.maptiler.com/maps/hybrid/style.json?key=wZNaIRIPfJrrJLopqgo0";
  }

  if (name === "maptiler-topo") {
    return "https://api.maptiler.com/maps/topo-v2/style.json?key=wZNaIRIPfJrrJLopqgo0";
  }

  if (name === "maptiler-streets") {
    return "https://api.maptiler.com/maps/streets-v2/style.json?key=wZNaIRIPfJrrJLopqgo0";
  }

  return "https://demotiles.maplibre.org/style.json";
}

function getMapLibreLocale() {
  return {
    "NavigationControl.ZoomIn": t("map_zoom_in", "Zoom in"),
    "NavigationControl.ZoomOut": t("map_zoom_out", "Zoom out"),
    "NavigationControl.ResetBearing": t(
      "map_drag_rotate_reset_north",
      "Drag to rotate map, click to reset north"
    ),
    "FullscreenControl.Enter": t("map_enter_fullscreen", "Enter fullscreen"),
    "FullscreenControl.Exit": t("map_exit_fullscreen", "Exit fullscreen"),
    "AttributionControl.ToggleAttribution": t(
      "map_toggle_attribution",
      "Toggle attribution"
    ),
    "AttributionControl.MapFeedback": t("map_feedback", "Map feedback"),
    "Map.Title": t("map_title", "Map"),
    "Popup.Close": t("close_popup", "Close popup")
  };
}

function refreshMapLibreControlTooltips() {
  const labels = {
    ".maplibregl-ctrl-zoom-in": t("map_zoom_in", "Zoom in"),
    ".maplibregl-ctrl-zoom-out": t("map_zoom_out", "Zoom out"),
    ".maplibregl-ctrl-compass": t(
      "map_drag_rotate_reset_north",
      "Drag to rotate map, click to reset north"
    ),
    ".maplibregl-ctrl-fullscreen": t("map_enter_fullscreen", "Enter fullscreen"),
    ".maplibregl-ctrl-shrink": t("map_exit_fullscreen", "Exit fullscreen"),
    "#resetMapBtn": t("reset_map", "Reset map"),
    "#mapOptionsBtn": t("map_options", "Map options")
  };

  Object.entries(labels).forEach(([selector, label]) => {
    document.querySelectorAll(selector).forEach((button) => {
      button.title = label;
      button.setAttribute("aria-label", label);
    });
  });
}

function initViewerMap() {
  if (!mapElement || typeof maplibregl === "undefined") {
    console.error("MapLibre is not available.");
    return;
  }

  const defaultMapView = getViewerDefaultMapView();

  viewerMap = new maplibregl.Map({
    container: "map",
    style: getBasemapStyle(basemapSelect?.value || "maptiler-hybrid"),
    center: defaultMapView.center,
    zoom: defaultMapView.zoom,

    preserveDrawingBuffer: true,
    canvasContextAttributes: {
      preserveDrawingBuffer: true
    },

    locale: getMapLibreLocale()
  });

  window.viewerMap = viewerMap;

  viewerMap.addControl(new maplibregl.NavigationControl(), "top-right");

  viewerMap.addControl(
    new maplibregl.FullscreenControl({
      container: document.querySelector(".map-pane-body")
    }),
    "top-right"
  );

  addMapResetControl();
  addMapDownloadControl();
  addMapOptionsControl();
  addViewerLegendControl();

  viewerMap.addControl(
    new maplibregl.ScaleControl({
      maxWidth: 120,
      unit: "metric"
    }),
    "bottom-left"
  );

  refreshMapLibreControlTooltips();

  viewerMap.on("load", async () => {
    viewerMapLoaded = true;

    initialiseViewerSpatialDraw();

    try {
      await reloadViewer({
        includeMap: true
      });

      await reloadOpenViewerResultGroups();

      if (viewerSelectedRecord?.geometry) {
        drawViewerSelectedHighlight(viewerSelectedRecord);
      }

      updateMapStatusLine();
      renderViewerLegend();
    } catch (error) {
      console.error("Viewer initial load failed:", error);

      setViewerStatus(
        error.message || "Viewer initial load failed",
        {
          isError: true
        }
      );
    }
  });

  viewerMap.on("moveend", (e) => {
    if (viewerMapMoveDebounceTimer) {
      clearTimeout(viewerMapMoveDebounceTimer);
    }

    viewerMapMoveDebounceTimer = setTimeout(async () => {
      if (!e.originalEvent) return;

      if (Date.now() < viewerSuppressMapReloadUntil) return;

      if (viewerRelatedOverlayActive) return;

      if (viewerIsLoading) return;

      /*
        If the user is doing text/CAAL_ID search, avoid automatic map reload
        on every pan. Use "Show results on map" or explicit filter changes.
      */
      if (getViewerTextSearch() || getViewerCaalIdSearch()) {
        return;
      }

      try {
        await loadViewerMap();
      } catch (error) {
        console.error("Viewer map reload failed:", error);
      }
    }, 1200);
  });

  viewerMap.on("zoomend", async () => {
    updateViewerMapModeVisibility();
    renderViewerMapLabels();

    if (Date.now() < viewerSuppressMapReloadUntil) return;

    if (viewerRelatedOverlayActive) {
      bringViewerRelatedOverlayToFront();
      return;
    }

    if (viewerIsLoading) return;

    try {
      await loadViewerMap();
    } catch (error) {
      console.error("Viewer map zoom reload failed:", error);
    }
  });

  if (basemapSelect) {
    basemapSelect.addEventListener("change", () => {
      viewerMapLoaded = false;
      viewerLayerEventsBound = new Set();

      viewerMap.setStyle(getBasemapStyle(basemapSelect.value));

      viewerMap.once("style.load", async () => {
      viewerMapLoaded = true;
      initialiseViewerSpatialDraw();
      viewerLayerEventsBound = new Set();
      viewerCentroidEventsBound = false;
      viewerReferencePopupLayersBound.clear();

      try {
        await loadViewerMap();

        if (viewerSelectedRecord?.geometry) {
          drawViewerSelectedHighlight(viewerSelectedRecord);
        }

        renderViewerMapLabels();
        updateMapStatusLine();
        renderViewerLegend();
      } catch (error) {
        console.error("Viewer map style reload failed:", error);
      }
      });
    });
  }
}


async function loadViewerMap() {
  if (!viewerMap || !viewerMapLoaded) return;

  const geometryLayers = getGeometryQueryRecordTypes();
  const clusterLayers = getClusterQueryRecordTypes();

  const hasReferenceLayers =
    geometryLayers.includes("survey_grid_region") ||
    geometryLayers.includes("survey_grid") ||
    geometryLayers.includes("admin_boundary");

  const shouldShowMapLoading =
    hasReferenceLayers ||
    geometryLayers.length > 0 ||
    clusterLayers.length > 0;

  if (shouldShowMapLoading) {
    setViewerLoading(true, t("loading_map_layers", "Loading map layers..."));
  }

  try {

  if (!geometryLayers.length && !clusterLayers.length) {
    Object.keys(VIEWER_CLUSTER_GROUPS).forEach((groupKey) => {
      viewerCentroidGeojsonByGroup[groupKey] = {
        type: "FeatureCollection",
        features: []
      };
    });

    viewerMapLayers = {};

    clearAllViewerMapLayers();
    updateMapStatusLine();
    renderViewerLegend();
    return;
  }

  const mapMode = getViewerMapMode();

  if (mapMode === "clusters") {
    await loadViewerClusters();
  } else if (mapMode === "centroids") {
    await loadViewerCentroids();
  } else {
    clearViewerClusterData();
  }

  if (!geometryLayers.length) {
    viewerMapLayers = {};

    drawViewerMapLayers({});
    updateViewerMapModeVisibility();
    updateMapStatusLine();
    renderViewerLegend();

    /*
      Cluster and centroid loaders have already completed before this point.
      There is no full-geometry source processing to wait for.
    */
    return;
  }

  const params = buildViewerQueryParams({
    includePaging: false,
    includeMapBbox: true
  });

  params.set("recordTypes", geometryLayers.join(","));
  params.set("layers", geometryLayers.join(","));
  params.set("zoom", String(viewerMap.getZoom()));

    const response = await fetch(`/api/viewer/map?${params.toString()}`, {
      method: "GET",
      credentials: "include"
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.detail || data.error || "Failed to load viewer map");
    }

    viewerMapLayers = data.layers || {};

    drawViewerMapLayers(viewerMapLayers);
    renderViewerMapLabels();
    updateViewerMapModeVisibility();
    updateShowResultsOnMapButton();
    updateMapStatusLine();
    renderViewerLegend();

    } finally {
      if (shouldShowMapLoading) {
        setViewerLoading(false);
      }
    }
}

function clearViewerClusterData() {
  Object.keys(VIEWER_CLUSTER_GROUPS).forEach((groupKey) => {
    viewerCentroidGeojsonByGroup[groupKey] = {
      type: "FeatureCollection",
      features: []
    };
  });

  drawViewerCentroidLayers();
}

async function loadViewerClusters() {
  if (!viewerMap || !viewerMapLoaded) return;

  const selectedLayers = getClusterQueryRecordTypes();

  if (!selectedLayers.length) {
    clearViewerClusterData();
    return;
  }

  if (viewerCentroidsAbortController) {
    viewerCentroidsAbortController.abort();
  }

  viewerCentroidsAbortController = new AbortController();
  const signal = viewerCentroidsAbortController.signal;

  const params = buildViewerQueryParams({
    includePaging: false,
    includeMapBbox: true
  });

  params.set("recordTypes", selectedLayers.join(","));
  params.set("zoom", String(viewerMap.getZoom()));

  let data;

  try {
    const response = await fetch(`/api/viewer/clusters?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      signal
    });

    data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.detail || data.error || "Failed to load viewer clusters");
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    throw error;
  } finally {
    if (viewerCentroidsAbortController?.signal === signal) {
      viewerCentroidsAbortController = null;
    }
  }

  const features = Array.isArray(data.clusters?.features)
    ? data.clusters.features
    : [];

  Object.entries(VIEWER_CLUSTER_GROUPS).forEach(([groupKey, group]) => {
    viewerCentroidGeojsonByGroup[groupKey] = {
      type: "FeatureCollection",
      features: features.filter((feature) =>
        group.types.includes(feature.properties?.record_type)
      )
    };
  });

  drawViewerCentroidLayers();
  updateMapStatusLine();
}

function getViewerMapMode() {
  if (!viewerMap) return "clusters";

  const zoom = viewerMap.getZoom();

  if (zoom < VIEWER_CLUSTER_MAX_ZOOM) {
    return "clusters";
  }

  if (zoom < VIEWER_GEOMETRY_MIN_ZOOM) {
    return "centroids";
  }

  return "geometry";
}

async function loadViewerCentroids() {
  if (!viewerMap || !viewerMapLoaded) return;

  const selectedLayers = getClusterQueryRecordTypes();

  if (!selectedLayers.length) {
    Object.keys(VIEWER_CLUSTER_GROUPS).forEach((groupKey) => {
      viewerCentroidGeojsonByGroup[groupKey] = {
        type: "FeatureCollection",
        features: []
      };
    });

    drawViewerCentroidLayers();
    updateMapStatusLine();

    return;
  }

  const mode = getViewerMapMode();

  const params = buildViewerQueryParams({
    includePaging: false,
    includeMapBbox: true
  });

  params.set("recordTypes", selectedLayers.join(","));
  params.set("zoom", String(viewerMap.getZoom()));

  const endpoint = mode === "clusters"
    ? "/api/viewer/clusters"
    : "/api/viewer/centroids";

  let data;

  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      method: "GET",
      credentials: "include"
    });

    data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.detail || data.error || "Failed to load viewer map overview");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    throw error;
  }

  const allFeatures =
    mode === "clusters"
      ? Array.isArray(data.clusters?.features)
        ? data.clusters.features
        : []
      : Array.isArray(data.centroids?.features)
        ? data.centroids.features
        : [];

  Object.entries(VIEWER_CLUSTER_GROUPS).forEach(([groupKey, group]) => {
    viewerCentroidGeojsonByGroup[groupKey] = {
      type: "FeatureCollection",
      features: allFeatures.filter((feature) =>
        group.types.includes(feature.properties?.record_type)
      )
    };
  });

  drawViewerCentroidLayers();
  updateMapStatusLine();
}

function drawViewerCentroidLayers() {
  if (!viewerMap || !viewerMapLoaded) return;

  Object.entries(VIEWER_CLUSTER_GROUPS).forEach(([groupKey, group]) => {
    const geojson = viewerCentroidGeojsonByGroup[groupKey] || {
      type: "FeatureCollection",
      features: []
    };

    ensureViewerCentroidSource(group, geojson);
    ensureViewerCentroidLayers(group);
  });

  bindViewerCentroidEvents();
  updateViewerMapModeVisibility();
  bringViewerLayersToFront();
}

function ensureViewerCentroidSource(group, geojson) {
  const existing = viewerMap.getSource(group.source);

  if (existing && typeof existing.setData === "function") {
    existing.setData(geojson);
    return;
  }

  viewerMap.addSource(group.source, {
    type: "geojson",
    data: geojson,
    cluster: false
  });
}

function ensureViewerCentroidLayers(group) {
  if (!viewerMap.getLayer(group.clusters)) {
    viewerMap.addLayer({
      id: group.clusters,
      type: "circle",
      source: group.source,
      filter: [
        "all",
        ["has", "point_count"],
        [">", ["get", "point_count"], 1]
      ],
      paint: {
        "circle-radius": [
          "step",
          ["get", "point_count"],
          12,
          20, 15,
          100, 19,
          500, 24,
          1500, 30,
          5000, 36
        ],
        "circle-color": group.colour,
        "circle-opacity": 0.78,
        "circle-stroke-width": 1.4,
        "circle-stroke-color": "rgba(255,255,255,0.92)"
      }
    });
  }

  if (!viewerMap.getLayer(group.clusterCount)) {
    viewerMap.addLayer({
      id: group.clusterCount,
      type: "symbol",
      source: group.source,
      filter: [
        "all",
        ["has", "point_count"],
        [">", ["get", "point_count"], 1]
      ],
      layout: {
        "text-field": [
          "case",
          [">=", ["get", "point_count"], 1000],
          [
            "concat",
            ["to-string", ["/", ["round", ["/", ["get", "point_count"], 100]], 10]],
            "k"
          ],
          ["to-string", ["get", "point_count"]]
        ],
        "text-size": 12,
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"]
      },
      paint: {
        "text-color": "#ffffff"
      }
    });
  }

  if (!viewerMap.getLayer(group.unclustered)) {
    viewerMap.addLayer({
      id: group.unclustered,
      type: "circle",
      source: group.source,
      filter: [
        "any",
        ["!", ["has", "point_count"]],
        ["<=", ["get", "point_count"], 1]
      ],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6, 4,
          8, 5,
          10, 6
        ],
        "circle-color": [
          "match",
          ["get", "record_type"],
          "rs3_poly", VIEWER_COLOURS.rs3_poly,
          "rs3_line", VIEWER_COLOURS.rs3_line,
          "rs3_group", VIEWER_COLOURS.rs3_group,
          "vernacular", VIEWER_COLOURS.vernacular,
          "monument", VIEWER_COLOURS.monument,
          "dataset", VIEWER_COLOURS.dataset,
          "cartography", VIEWER_COLOURS.cartography,
          "#6B7280"
        ],
        "circle-opacity": 0.88,
        "circle-stroke-width": 1.2,
        "circle-stroke-color": "rgba(255,255,255,0.92)"
      }
    });
  }
}

function getClusterExpansionZoomSafe(source, clusterId) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = source.getClusterExpansionZoom(Number(clusterId), (error, zoom) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(zoom);
      });

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function bindViewerCentroidEvents() {
  if (!viewerMap || viewerCentroidEventsBound) return;

  Object.entries(VIEWER_CLUSTER_GROUPS).forEach(([groupKey, group]) => {
    [
      group.clusters,
      group.clusterCount
    ].forEach((layerId) => {
      viewerMap.on("click", layerId, async (event) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const clusterId = feature.properties?.cluster_id;
        const coords = feature.geometry?.coordinates;

        if (!Array.isArray(coords)) {
          return;
        }

        const source = viewerMap.getSource(group.source);

        if (
          clusterId === undefined ||
          clusterId === null ||
          !source ||
          typeof source.getClusterExpansionZoom !== "function"
        ) {
          suppressViewerMapReload();

          viewerMap.easeTo({
            center: coords,
            zoom: Math.min(viewerMap.getZoom() + 2, VIEWER_GEOMETRY_MIN_ZOOM),
            duration: 500
          });
          return;
        }

        try {
          const zoom = await getClusterExpansionZoomSafe(source, clusterId);

          suppressViewerMapReload();

          viewerMap.easeTo({
            center: coords,
            zoom: Math.min(zoom, VIEWER_GEOMETRY_MIN_ZOOM),
            duration: 500
          });
        } catch (error) {
          console.error("Could not expand viewer cluster:", error);
        }
      });

      viewerMap.on("mouseenter", layerId, () => {
        viewerMap.getCanvas().style.cursor = "pointer";
      });

      viewerMap.on("mouseleave", layerId, () => {
        viewerMap.getCanvas().style.cursor = "";
      });
    });

    viewerMap.on("click", group.unclustered, (event) => {
      if (viewerSpatialDrawIsActive) return;
      const feature = event.features?.[0];
      if (!feature?.properties) return;

      showViewerMapPopup(feature, event.lngLat);
    });

    viewerMap.on("mouseenter", group.unclustered, () => {
      viewerMap.getCanvas().style.cursor = "pointer";
    });

    viewerMap.on("mouseleave", group.unclustered, () => {
      viewerMap.getCanvas().style.cursor = "";
    });
  });

  viewerCentroidEventsBound = true;
}

function clearViewerCentroidLayer() {
  if (!viewerMap) return;

  Object.values(VIEWER_CLUSTER_GROUPS).forEach((group) => {
    [
      group.clusterCount,
      group.clusters,
      group.unclustered
    ].forEach((layerId) => {
      if (viewerMap.getLayer(layerId)) {
        viewerMap.removeLayer(layerId);
      }
    });

    if (viewerMap.getSource(group.source)) {
      viewerMap.removeSource(group.source);
    }
  });

  viewerCentroidEventsBound = false;
  viewerReferencePopupLayersBound.clear();
}

function updateViewerMapModeVisibility() {
  if (!viewerMap) return;

  const mode = getViewerMapMode();
  const selectedTypes = getVisibleMapLayerTypes();

  const showClusters = mode === "clusters";
  const showCentroids = mode === "centroids";
  const showGeometry = mode === "geometry";

  // Remote-sensing clusters and vernacular clusters are separate sources/layers.
  Object.values(VIEWER_CLUSTER_GROUPS).forEach((group) => {
    [
      group.clusters,
      group.clusterCount
    ].forEach((layerId) => {
      if (viewerMap.getLayer(layerId)) {
        viewerMap.setLayoutProperty(
          layerId,
          "visibility",
          showClusters ? "visible" : "none"
        );
      }
    });

    if (viewerMap.getLayer(group.unclustered)) {
      viewerMap.setLayoutProperty(
        group.unclustered,
        "visibility",
        showCentroids ? "visible" : "none"
      );
    }
  });

  // Geometry layers:
  // - normal resource geometries only show at geometry zoom
  // - institutions and survey grid layers show whenever selected/checked
  VIEWER_ALL_MAP_TYPES.forEach((recordType) => {
    const ids = VIEWER_LAYER_IDS[recordType];
    if (!ids) return;

    const isAlwaysGeometryType =
      VIEWER_ALWAYS_GEOMETRY_TYPES.includes(recordType);

    const showThisGeometry =
      selectedTypes.includes(recordType) &&
      (showGeometry || isAlwaysGeometryType);

    Object.entries(ids).forEach(([key, layerId]) => {
      if (key === "source") return;

      if (viewerMap.getLayer(layerId)) {
        viewerMap.setLayoutProperty(
          layerId,
          "visibility",
          showThisGeometry ? "visible" : "none"
        );
      }
    });
  });
  renderViewerLegend();
}

function drawViewerMapLayers(layers) {
  if (!viewerMap || !viewerMapLoaded) return;

  VIEWER_ALL_MAP_TYPES.forEach((recordType) => {
    const geojson = layers?.[recordType] || {
      type: "FeatureCollection",
      features: []
    };

    ensureViewerSource(recordType, geojson);
    ensureViewerStyleLayers(recordType);
    setViewerLayerVisibility(recordType, getVisibleMapLayerTypes().includes(recordType));
  });

  updateViewerMapModeVisibility();
  bringViewerLayersToFront();
  
}

function surveyGridStatusFillColourExpression() {
  return [
    "case",

    ["in", ["downcase", ["coalesce", ["get", "survey_status"], ""]], ["literal", ["complete", "completed", "done"]]],
    "#FACC15",

    ["in", ["downcase", ["coalesce", ["get", "survey_status"], ""]], ["literal", ["in_progress", "in progress"]]],
    "#38BDF8",

    ["in", ["downcase", ["coalesce", ["get", "survey_status"], ""]], ["literal", ["not_started", "not started"]]],
    "#111827",

    "#111827"
  ];
}

function surveyGridCheckedFillColourExpression() {
  return [
    "case",
    ["==", ["get", "checked"], true], "#22C55E",
    ["==", ["get", "checked"], "true"], "#22C55E",
    ["==", ["get", "checked"], 1], "#22C55E",
    "#111827"
  ];
}

function surveyGridFillColour(recordType) {
  const mode = getSurveyGridStyleMode();

  if (recordType === "survey_grid_region") {
    if (mode === "status") return surveyGridStatusFillColourExpression();
    return "#111827";
  }

  if (recordType === "survey_grid") {
    if (mode === "status") return surveyGridStatusFillColourExpression();
    if (mode === "checked") return surveyGridCheckedFillColourExpression();
    return "#F2F2F2";
  }

  return VIEWER_COLOURS[recordType];
}

function surveyGridFillOpacity(recordType) {
  const mode = getSurveyGridStyleMode();

  if (recordType === "survey_grid_region") {
    return mode === "status" ? 0.34 : 0.22;
  }

  if (recordType === "survey_grid") {
    if (mode === "status" || mode === "checked") return 0.18;
    return 0.004;
  }

  if (recordType === "vernacular") return 0.22;

  return 0.28;
}

function surveyGridLineColour(recordType) {
  const mode = getSurveyGridStyleMode();

  if (recordType === "survey_grid_region") {
    if (mode === "status") return surveyGridStatusFillColourExpression();
    return "#111827";
  }

  if (recordType === "survey_grid") {
    if (mode === "status") return surveyGridStatusFillColourExpression();
    if (mode === "checked") return surveyGridCheckedFillColourExpression();
    return "#F2F2F2";
  }

  return VIEWER_COLOURS[recordType];
}

function updateSurveyGridPaint() {
  if (!viewerMap || !viewerMapLoaded) return;

  ["survey_grid_region", "survey_grid"].forEach((recordType) => {
    const ids = VIEWER_LAYER_IDS[recordType];
    if (!ids) return;

    if (viewerMap.getLayer(ids.fill)) {
      viewerMap.setPaintProperty(
        ids.fill,
        "fill-color",
        surveyGridFillColour(recordType)
      );

      viewerMap.setPaintProperty(
        ids.fill,
        "fill-opacity",
        surveyGridFillOpacity(recordType)
      );
    }

    if (viewerMap.getLayer(ids.outline)) {
      viewerMap.setPaintProperty(
        ids.outline,
        "line-color",
        surveyGridLineColour(recordType)
      );
    }
  });
}

function ensureViewerSource(recordType, geojson) {
  const ids = VIEWER_LAYER_IDS[recordType];
  if (!ids) return;

  const existing = viewerMap.getSource(ids.source);

  if (existing && typeof existing.setData === "function") {
    existing.setData(geojson);
    return;
  }

  viewerMap.addSource(ids.source, {
    type: "geojson",
    data: geojson
  });
}

function ensureViewerMixedGeometryResourceLayers(recordType) {
  const ids = VIEWER_LAYER_IDS[recordType];
  if (!ids) return;

  const colour = VIEWER_COLOURS[recordType] || "#6B7280";

  if (ids.fill && !viewerMap.getLayer(ids.fill)) {
    viewerMap.addLayer({
      id: ids.fill,
      type: "fill",
      source: ids.source,
      filter: VIEWER_POLYGON_GEOMETRY_FILTER,
      paint: {
        "fill-color": colour,
        "fill-opacity": recordType === "dataset" || recordType === "cartography"
          ? 0.14
          : 0.2
      }
    });
  }

  if (ids.outline && !viewerMap.getLayer(ids.outline)) {
    viewerMap.addLayer({
      id: ids.outline,
      type: "line",
      source: ids.source,
      filter: VIEWER_POLYGON_GEOMETRY_FILTER,
      paint: {
        "line-color": colour,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 0.8,
          8, 1.4,
          12, 2
        ],
        "line-opacity": 0.9
      }
    });
  }

  if (ids.line && !viewerMap.getLayer(ids.line)) {
    viewerMap.addLayer({
      id: ids.line,
      type: "line",
      source: ids.source,
      filter: VIEWER_LINE_GEOMETRY_FILTER,
      paint: {
        "line-color": colour,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 1,
          8, 1.8,
          12, 2.6
        ],
        "line-opacity": 0.9
      }
    });
  }

  if (ids.circle && !viewerMap.getLayer(ids.circle)) {
    viewerMap.addLayer({
      id: ids.circle,
      type: "circle",
      source: ids.source,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 4,
          8, 6,
          12, 8
        ],
        "circle-color": colour,
        "circle-opacity": 0.9,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.4
      }
    });
  }

  bindViewerLayerEvents(
    recordType,
    [ids.fill, ids.outline, ids.line, ids.circle].filter(Boolean)
  );
}

function ensureViewerStyleLayers(recordType) {
  if (!viewerMap || !viewerMapLoaded) return;

  const ids = VIEWER_LAYER_IDS[recordType];
  if (!ids) return;

  if (!viewerMap.getSource(ids.source)) return;

  // Reference overlay: administrative boundaries
  if (recordType === "admin_boundary") {
    if (!viewerMap.getLayer(ids.fill)) {
      viewerMap.addLayer({
        id: ids.fill,
        type: "fill",
        source: ids.source,
        filter: VIEWER_POLYGON_GEOMETRY_FILTER,
        paint: {
          "fill-color": VIEWER_COLOURS.admin_boundary,
          "fill-opacity": 0.06
        }
      });
    }

    if (!viewerMap.getLayer(ids.outline)) {
      viewerMap.addLayer({
        id: ids.outline,
        type: "line",
        source: ids.source,
        filter: VIEWER_POLYGON_GEOMETRY_FILTER,
        paint: {
          "line-color": VIEWER_COLOURS.admin_boundary,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3, 0.6,
            5, 0.9,
            8, 1.2,
            10, 1.6
          ],
          "line-opacity": 0.75
        }
      });
    }

    if (!viewerMap.getLayer("viewer-admin-boundary-selected-fill")) {
      viewerMap.addLayer({
        id: "viewer-admin-boundary-selected-fill",
        type: "fill",
        source: ids.source,
        filter: ["==", ["get", "boundary_id"], "___none___"],
        paint: {
          "fill-color": "#FDE047",
          "fill-opacity": 0.25
        }
      });
    }

    if (!viewerMap.getLayer("viewer-admin-boundary-selected-outline")) {
      viewerMap.addLayer({
        id: "viewer-admin-boundary-selected-outline",
        type: "line",
        source: ids.source,
        filter: ["==", ["get", "boundary_id"], "___none___"],
        paint: {
          "line-color": "#EAB308",
          "line-width": 2.5,
          "line-opacity": 0.95
        }
      });
    }

    bindViewerReferenceLayerPopups();
    return;
  }

  // Reference overlay: survey grids
  if (
    recordType === "survey_grid" ||
    recordType === "survey_grid_region"
  ) {
    if (!viewerMap.getLayer(ids.fill)) {
      viewerMap.addLayer({
        id: ids.fill,
        type: "fill",
        source: ids.source,
        filter: VIEWER_POLYGON_GEOMETRY_FILTER,
        paint: {
          "fill-color": surveyGridFillColour(recordType),
          "fill-opacity": surveyGridFillOpacity(recordType)
        }
      });
    }

    if (!viewerMap.getLayer(ids.outline)) {
      viewerMap.addLayer({
        id: ids.outline,
        type: "line",
        source: ids.source,
        filter: VIEWER_POLYGON_GEOMETRY_FILTER,
        paint: {
          "line-color": surveyGridLineColour(recordType),
          "line-width":
            recordType === "survey_grid_region"
              ? [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  3, 0.6,
                  4, 0.9,
                  5, 1.2
                ]
              : [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  5, 0.35,
                  7, 0.55,
                  10, 0.8,
                  12, 1.1
                ],
          "line-opacity": recordType === "survey_grid_region" ? 0.85 : 0.9
        }
      });
    }

    bindViewerReferenceLayerPopups();
    return;
  }

    if (
    recordType === "monument" ||
    recordType === "dataset" ||
    recordType === "cartography"
  ) {
    ensureViewerMixedGeometryResourceLayers(recordType);
    return;
  }

  // Resource polygons
  if (
    recordType === "rs3_poly" ||
    recordType === "rs3_group" ||
    recordType === "vernacular"
  ) {
    if (!viewerMap.getLayer(ids.fill)) {
      viewerMap.addLayer({
        id: ids.fill,
        type: "fill",
        source: ids.source,
        filter: VIEWER_POLYGON_GEOMETRY_FILTER,
        paint: {
          "fill-color": VIEWER_COLOURS[recordType],
          "fill-opacity": surveyGridFillOpacity(recordType)
        }
      });
    }

    if (!viewerMap.getLayer(ids.outline)) {
      viewerMap.addLayer({
        id: ids.outline,
        type: "line",
        source: ids.source,
        filter: VIEWER_POLYGON_GEOMETRY_FILTER,
        paint: {
          "line-color": VIEWER_COLOURS[recordType],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4, 0.7,
            8, 1.2,
            12, 2
          ],
          "line-opacity": 0.9
        }
      });
    }

    bindViewerLayerEvents(recordType, [ids.fill, ids.outline]);
    return;
  }

  // Resource lines
  if (recordType === "rs3_line") {
    if (!viewerMap.getLayer(ids.line)) {
      viewerMap.addLayer({
        id: ids.line,
        type: "line",
        source: ids.source,
        filter: VIEWER_LINE_GEOMETRY_FILTER,
        paint: {
          "line-color": VIEWER_COLOURS.rs3_line,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4, 1,
            8, 1.6,
            12, 2.4
          ],
          "line-opacity": 0.82
        }
      });
    }

    bindViewerLayerEvents(recordType, [ids.line]);
    return;
  }

  // Institution points
  if (recordType === "institution") {
    if (!viewerMap.getLayer(ids.circle)) {
      viewerMap.addLayer({
        id: ids.circle,
        type: "circle",
        source: ids.source,
        paint: {
          "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 6,
          8, 8,
          12, 10
        ],
        "circle-color": VIEWER_COLOURS.institution,
        "circle-opacity": 0.96,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.4
        }
      });
    }

    bindViewerLayerEvents(recordType, [ids.circle]);
  }
}

function bindViewerLayerEvents(recordType, layerIds) {
  layerIds.forEach((layerId) => {
    if (viewerLayerEventsBound.has(layerId)) return;
    if (!viewerMap.getLayer(layerId)) return;

    viewerMap.on("mouseenter", layerId, () => {
      viewerMap.getCanvas().style.cursor = "pointer";
    });

    viewerMap.on("mouseleave", layerId, () => {
      viewerMap.getCanvas().style.cursor = "";
    });

    viewerMap.on("click", layerId, (event) => {
      const feature = event.features?.[0];
      if (!feature?.properties) return;

      showViewerMapPopup(feature, event.lngLat);
    });

    viewerLayerEventsBound.add(layerId);
  });
}

function featureToViewerLightRecord(feature) {
  const properties = feature.properties || {};

  return {
    identity: {
      id: properties.source_row_id,
      caal_id: properties.caal_id,
      record_type: properties.record_type,
      dataset_label: properties.dataset_label
    },
    summary: {
      display_label: properties.display_label,
      source_schema: properties.source_schema,
      source_table: properties.source_table,
      source_scope: properties.source_scope,
      storage_scope: properties.storage_scope
    },
    source: {
      schema: properties.source_schema,
      table: properties.source_table,
      row_id: properties.source_row_id,
      scope: properties.source_scope,
      storage: properties.storage_scope,
      is_editable: properties.is_editable === true || properties.is_editable === "true"
    },
    geometry: feature.geometry || null
  };
}

function setViewerLayerVisibility(recordType, visible) {
  const ids = VIEWER_LAYER_IDS[recordType];
  if (!ids || !viewerMap) return;

  const isAlwaysGeometryType = VIEWER_ALWAYS_GEOMETRY_TYPES.includes(recordType);

  const showGeometry =
    visible &&
    (getViewerMapMode() === "geometry" || isAlwaysGeometryType);

  Object.entries(ids).forEach(([key, layerId]) => {
    if (key === "source") return;

    if (viewerMap.getLayer(layerId)) {
      viewerMap.setLayoutProperty(
        layerId,
        "visibility",
        showGeometry ? "visible" : "none"
      );
    }
  });
}

function clearAllViewerMapLayers() {
  if (!viewerMap) return;

  clearViewerCentroidLayer();

  VIEWER_ALL_MAP_TYPES.forEach((recordType) => {
    const ids = VIEWER_LAYER_IDS[recordType];
    if (!ids) return;

    Object.entries(ids).forEach(([key, layerId]) => {
      if (key !== "source" && viewerMap.getLayer(layerId)) {
        viewerMap.removeLayer(layerId);
      }
    });

    if (viewerMap.getSource(ids.source)) {
      viewerMap.removeSource(ids.source);
    }
  });

  viewerLayerEventsBound = new Set();
  viewerReferencePopupLayersBound.clear();
}

function bringViewerLayersToFront() {
  if (!viewerMap) return;

  const orderedLayers = [
    // Admin/context base overlays
    "viewer-admin-boundary-fill",
    "viewer-admin-boundary-outline",
    "viewer-admin-boundary-selected-fill",
    "viewer-admin-boundary-selected-outline",

    "viewer-survey-grid-region-fill",
    "viewer-survey-grid-region-outline",
    "viewer-survey-grid-fill",
    "viewer-survey-grid-outline",

    // Broad contextual resource geometry underneath site features
    "viewer-cartography-fill",
    "viewer-dataset-fill",
    "viewer-cartography-outline",
    "viewer-dataset-outline",
    "viewer-cartography-line",
    "viewer-dataset-line",
    "viewer-cartography-circle",
    "viewer-dataset-circle",

    // Site/resource features
    "viewer-monument-fill",
    "viewer-rs3-poly-fill",
    "viewer-rs3-group-fill",
    "viewer-vernacular-fill",

    "viewer-monument-outline",
    "viewer-rs3-poly-outline",
    "viewer-rs3-group-outline",
    "viewer-vernacular-outline",

    "viewer-monument-line",
    "viewer-rs3-line-line",
    "viewer-monument-circle",

    // Cluster overview
    "viewer-resource-clusters-monuments",
    "viewer-resource-cluster-count-monuments",
    "viewer-resource-centroid-points-monuments",

    "viewer-resource-clusters-rs",
    "viewer-resource-cluster-count-rs",
    "viewer-resource-centroid-points-rs",

    "viewer-resource-clusters-vernacular",
    "viewer-resource-cluster-count-vernacular",
    "viewer-resource-centroid-points-vernacular",

    // Non-cluster point resources should sit above cluster overview
    "viewer-institution-circle",

    // Active overlays
    "viewer-selected-fill",
    "viewer-selected-line",
    "viewer-selected-circle",
    "viewer-live-labels"
  ];

  orderedLayers.forEach((layerId) => {
    if (viewerMap.getLayer(layerId)) {
      viewerMap.moveLayer(layerId);
    }
  });
  bringViewerRelatedOverlayToFront();
}

function viewerFeatureRepresentedCount(feature) {
  const props = feature?.properties || {};

  const candidates = [
    props.point_count,
    props.count,
    props.record_count
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return 1;
}

function getViewerOverviewRepresentedCount() {
  return Object.values(viewerCentroidGeojsonByGroup)
    .reduce((total, geojson) => {
      const features = Array.isArray(geojson?.features)
        ? geojson.features
        : [];

      return total + features.reduce(
        (sum, feature) => sum + viewerFeatureRepresentedCount(feature),
        0
      );
    }, 0);
}

// --------------------------------------------------------
// SPATIAL POLYGON DRAWING
// --------------------------------------------------------
async function applyCompletedViewerSpatialPolygon(
  featureId,
  geometry
) {
  const polygon = normaliseViewerSpatialPolygon(geometry);

  if (!polygon) {
    cancelViewerSpatialPolygonDrawing({
      clearCompletedPolygon: true
    });

    setViewerStatus(
      t(
        "viewer_spatial_polygon_invalid",
        "The drawn area was not valid. Draw a simpler polygon."
      ),
      { isError: true }
    );

    return false;
  }

  viewerSpatialDrawFeatureId = featureId;
  activeViewerSpatialPolygon = polygon;

  // Polygon and rectangular extent filters are mutually exclusive.
  activeMapViewFilterBbox = null;

  viewerSpatialDrawIsActive = false;
  viewerSpatialDrawCoordinates = [];

  if (viewerSpatialDraw) {
    viewerSpatialDraw.setMode("viewer-spatial-render");
  }

  if (viewerMap) {
    viewerMap.getCanvas().style.cursor = "";
  }

  updateViewerSpatialPolygonButton();
  updateFilterToMapViewButton();
  setViewerSpatialDrawMessage(false);
  renderViewerActiveFilterChips();

  viewerPageOffset = 0;

  await reloadViewer({
    includeMap: true
  });

  return true;
}

function initialiseViewerSpatialDraw() {
  if (!viewerMap || viewerSpatialDraw) return;

  const terraDrawLib = window.terraDraw;

  const mapLibreAdapterLib =
    window.terraDrawMaplibreGlAdapter ||
    window.terraDrawMapLibreGLAdapter;

  if (!terraDrawLib || !mapLibreAdapterLib) {
    console.error("Terra Draw did not load.", {
      terraDraw: typeof window.terraDraw,
      adapterCurrent:
        typeof window.terraDrawMaplibreGlAdapter,
      adapterLegacy:
        typeof window.terraDrawMapLibreGLAdapter
    });

    if (drawViewerSpatialPolygonBtn) {
      drawViewerSpatialPolygonBtn.disabled = true;
      drawViewerSpatialPolygonBtn.title =
        "Polygon drawing is unavailable";
    }

    return;
  }

  const {
    TerraDraw,
    TerraDrawPolygonMode,
    TerraDrawRenderMode
  } = terraDrawLib;

  const {
    TerraDrawMapLibreGLAdapter
  } = mapLibreAdapterLib;

  viewerSpatialDraw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({
    map: viewerMap,
    coordinatePrecision: 6,
    ignoreMismatchedPointerEvents: true
  }),

    modes: [
      new TerraDrawPolygonMode({
        pointerEvents: {
          // We will handle right-click ourselves.
          rightClick: false,
          contextMenu: false
        },

        styles: {
          fillColor: "#FFEA00",
          fillOpacity: 0.32,

          // Dark outline keeps yellow visible on light and satellite maps.
          outlineColor: "#111827",
          outlineOpacity: 0.95,
          outlineWidth: 3,

          closingPointColor: "#FFEA00",
          closingPointWidth: 7,
          closingPointOutlineColor: "#111827",
          closingPointOutlineWidth: 2
        }
      }),

      new TerraDrawRenderMode({
        modeName: "viewer-spatial-render",

        styles: {
          polygonFillColor: "#FFEA00",
          polygonFillOpacity: 0.26,
          polygonOutlineColor: "#111827",
          polygonOutlineWidth: 3
        }
      })
    ]
  });

  viewerSpatialDraw.start();
  viewerSpatialDraw.setMode("viewer-spatial-render");

  viewerSpatialDraw.on("finish", async (featureId, context) => {
    if (
      !viewerSpatialDrawIsActive ||
      context?.action !== "draw" ||
      context?.mode !== "polygon"
    ) {
      return;
    }

    const snapshot = viewerSpatialDraw.getSnapshot();

    const feature = snapshot.find(
      (item) => String(item.id) === String(featureId)
    );

    if (!feature || feature.geometry?.type !== "Polygon") {
      cancelViewerSpatialPolygonDrawing({
        clearCompletedPolygon: true
      });

      return;
    }

    await applyCompletedViewerSpatialPolygon(
      featureId,
      feature.geometry
    );
  });

  viewerMap.on("click", (event) => {
    if (!viewerSpatialDrawIsActive) return;

    const coordinate = [
      Number(event.lngLat.lng.toFixed(6)),
      Number(event.lngLat.lat.toFixed(6))
    ];

    const previous =
      viewerSpatialDrawCoordinates[
        viewerSpatialDrawCoordinates.length - 1
      ];

    // Avoid accidentally recording an identical consecutive coordinate.
    if (
      previous &&
      previous[0] === coordinate[0] &&
      previous[1] === coordinate[1]
    ) {
      return;
    }

    viewerSpatialDrawCoordinates.push(coordinate);
  });

  viewerMap.on("contextmenu", (event) => {
    if (!viewerSpatialDrawIsActive) return;

    // Prevent the browser context menu while drawing only.
    event.preventDefault?.();
    event.originalEvent?.preventDefault?.();

    void finishViewerSpatialPolygonWithRightClick();
  });
}

async function finishViewerSpatialPolygonWithRightClick() {
  if (
    !viewerSpatialDrawIsActive ||
    !viewerSpatialDraw
  ) {
    return;
  }

  if (viewerSpatialDrawCoordinates.length < 3) {
    setViewerStatus(
      t(
        "viewer_spatial_polygon_needs_three_points",
        "Add at least three points before finishing the area."
      ),
      { isError: true }
    );

    return;
  }

  const firstCoordinate = viewerSpatialDrawCoordinates[0];

  const ring = [
    ...viewerSpatialDrawCoordinates.map((coordinate) => [
      coordinate[0],
      coordinate[1]
    ]),
    [
      firstCoordinate[0],
      firstCoordinate[1]
    ]
  ];

  const geometry = normaliseViewerSpatialPolygon({
    type: "Polygon",
    coordinates: [ring]
  });

  if (!geometry) {
    setViewerStatus(
      t(
        "viewer_spatial_polygon_invalid",
        "The drawn area was not valid. Draw a simpler polygon."
      ),
      { isError: true }
    );

    return;
  }

  /*
    Set false first so changing modes cannot accidentally cause the normal
    finish listener to process the unfinished Terra Draw feature.
  */
  viewerSpatialDrawIsActive = false;

  // Switching modes removes the unfinished preview geometry.
  viewerSpatialDraw.setMode("viewer-spatial-render");

  const featureId =
    window.crypto?.randomUUID?.() ||
    `viewer-spatial-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const addResults = viewerSpatialDraw.addFeatures([
    {
      id: featureId,
      type: "Feature",

      properties: {
        mode: "viewer-spatial-render"
      },

      geometry
    }
  ]);

  const addResult = addResults?.[0];

  if (!addResult?.valid) {
    viewerSpatialDrawCoordinates = [];

    cancelViewerSpatialPolygonDrawing({
      clearCompletedPolygon: true
    });

    setViewerStatus(
      addResult?.reason ||
        t(
          "viewer_spatial_polygon_invalid",
          "The drawn area was not valid. Draw a simpler polygon."
        ),
      { isError: true }
    );

    return;
  }

  await applyCompletedViewerSpatialPolygon(
    featureId,
    geometry
  );
}

function normaliseViewerSpatialPolygon(geometry) {
  if (geometry?.type !== "Polygon") return null;

  const rings = geometry.coordinates;

  if (!Array.isArray(rings) || !rings.length) {
    return null;
  }

  let totalVertices = 0;

  const normalisedRings = [];

  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return null;
    }

    const normalisedRing = [];

    for (const coordinate of ring) {
      if (
        !Array.isArray(coordinate) ||
        coordinate.length < 2
      ) {
        return null;
      }

      const lng = Number(coordinate[0]);
      const lat = Number(coordinate[1]);

      if (
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        lng < -180 ||
        lng > 180 ||
        lat < -90 ||
        lat > 90
      ) {
        return null;
      }

      normalisedRing.push([
        Number(lng.toFixed(6)),
        Number(lat.toFixed(6))
      ]);

      totalVertices += 1;

      if (totalVertices > 200) {
        return null;
      }
    }

    const first = normalisedRing[0];
    const last = normalisedRing[normalisedRing.length - 1];

    if (
      first[0] !== last[0] ||
      first[1] !== last[1]
    ) {
      normalisedRing.push([...first]);
      totalVertices += 1;
    }

    normalisedRings.push(normalisedRing);
  }

  return {
    type: "Polygon",
    coordinates: normalisedRings
  };
}

function removeViewerSpatialDrawFeature() {
  if (!viewerSpatialDraw || viewerSpatialDrawFeatureId === null) {
    viewerSpatialDrawFeatureId = null;
    return;
  }

  try {
    viewerSpatialDraw.removeFeatures([
      viewerSpatialDrawFeatureId
    ]);
  } catch (error) {
    console.warn("Could not remove viewer spatial polygon:", error);
  }

  viewerSpatialDrawFeatureId = null;
}

function setViewerSpatialDrawMessage(visible) {
  if (!viewerSpatialDrawMessage) return;

  viewerSpatialDrawMessage.hidden = !visible;

  if (viewerSpatialDrawMessageText && visible) {
    viewerSpatialDrawMessageText.textContent = t(
      "viewer_spatial_draw_instruction",
      "Click to add points. Click the first point or right-click anywhere on the map to finish."
    );
  }
}

function updateViewerSpatialPolygonButton() {
  if (!drawViewerSpatialPolygonBtn) return;

  const isApplied = Boolean(activeViewerSpatialPolygon);

  if (drawViewerSpatialPolygonBtnLabel) {
    drawViewerSpatialPolygonBtnLabel.textContent = viewerSpatialDrawIsActive
      ? t("viewer_spatial_drawing", "Drawing...")
      : isApplied
        ? t("viewer_spatial_redraw_area", "Redraw area")
        : t("viewer_spatial_draw_area", "Draw area");
  }

  drawViewerSpatialPolygonBtn.setAttribute(
    "aria-pressed",
    isApplied || viewerSpatialDrawIsActive ? "true" : "false"
  );

  drawViewerSpatialPolygonBtn.classList.toggle(
    "is-active",
    isApplied || viewerSpatialDrawIsActive
  );
}

function startViewerSpatialPolygonDrawing() {
  if (!viewerMap || !viewerSpatialDraw) return;

  removeViewerSpatialDrawFeature();

  activeViewerSpatialPolygon = null;
  activeMapViewFilterBbox = null;
  viewerSpatialDrawCoordinates = [];

  viewerSpatialDrawIsActive = true;
  viewerSpatialDraw.setMode("polygon");

  if (viewerPopup) {
    viewerPopup.remove();
    viewerPopup = null;
  }

  viewerMap.getCanvas().style.cursor = "crosshair";

  updateViewerSpatialPolygonButton();
  updateFilterToMapViewButton();
  setViewerSpatialDrawMessage(true);
  renderViewerActiveFilterChips();
}

function cancelViewerSpatialPolygonDrawing({
  clearCompletedPolygon = false
} = {}) {
  viewerSpatialDrawIsActive = false;
  viewerSpatialDrawCoordinates = [];

  if (viewerSpatialDraw) {
    viewerSpatialDraw.setMode("viewer-spatial-render");
  }

  if (clearCompletedPolygon) {
    removeViewerSpatialDrawFeature();
    activeViewerSpatialPolygon = null;
  }

  if (viewerMap) {
    viewerMap.getCanvas().style.cursor = "";
  }

  updateViewerSpatialPolygonButton();
  setViewerSpatialDrawMessage(false);
  renderViewerActiveFilterChips();
}

async function clearViewerSpatialPolygonFilter({
  reload = true
} = {}) {
  cancelViewerSpatialPolygonDrawing({
    clearCompletedPolygon: true
  });

  viewerPageOffset = 0;

  if (reload) {
    await reloadViewer({ includeMap: true });
  }
}
// imposes a 200-vertex frontend limit and six-decimal coordinate precision
// ----------------

function updateMapStatusLine() {
  if (!mapStatusLine) return;

  const mode = getViewerMapMode();

  const centroidFeatureCount = Object.values(viewerCentroidGeojsonByGroup)
    .reduce((total, geojson) => {
      const features = Array.isArray(geojson?.features)
        ? geojson.features
        : [];

      return total + features.length;
    }, 0);

  const centroidCount = getViewerOverviewRepresentedCount() || centroidFeatureCount;

  const geometryCount = VIEWER_ALL_MAP_TYPES.reduce((total, recordType) => {
    const features = viewerMapLayers?.[recordType]?.features;
    return total + (Array.isArray(features) ? features.length : 0);
  }, 0);

  const mappedCount = geometryCount || centroidCount;
  const totalCount = Number(viewerTotalCount || 0);

  if (!mappedCount && !totalCount) {
    mapStatusLine.textContent = t(
      "no_matching_records_on_map",
      "No matching records are currently shown on the map."
    );
    return;
  }

  if (!mappedCount && totalCount) {
    mapStatusLine.textContent = t(
      "viewer_no_mapped_records_status",
      "No mapped resource records are currently shown from {total} matching records."
    ).replace("{total}", formatCount(totalCount));
    return;
  }

  if (mode === "clusters") {
    if (totalCount && centroidCount < totalCount) {
      mapStatusLine.textContent = t(
        "viewer_clustered_records_partial_status",
        "Showing clustered overview for {mapped} mapped records from {total} matching records."
      )
        .replace("{mapped}", formatCount(centroidCount))
        .replace("{total}", formatCount(totalCount));
      return;
    }

    mapStatusLine.textContent = t(
      "viewer_clustered_records_status",
      "Showing clustered overview for {mapped} resource records."
    ).replace("{mapped}", formatCount(centroidCount));
    return;
  }

  if (mode === "centroids") {
    if (totalCount && centroidCount < totalCount) {
      mapStatusLine.textContent = t(
        "viewer_centroid_records_partial_status",
        "Showing point overview for {mapped} mapped records from {total} matching records. Zoom in for detailed geometry."
      )
        .replace("{mapped}", formatCount(centroidCount))
        .replace("{total}", formatCount(totalCount));
      return;
    }

    mapStatusLine.textContent = t(
      "viewer_centroid_records_status",
      "Showing point overview for {mapped} resource records. Zoom in for detailed geometry."
    ).replace("{mapped}", formatCount(centroidCount));
    return;
  }

  if (totalCount && mappedCount < totalCount) {
    mapStatusLine.textContent = t(
      "viewer_mapped_records_partial_status",
      "Showing {mapped} mapped resource records from {total} matching records."
    )
      .replace("{mapped}", formatCount(mappedCount))
      .replace("{total}", formatCount(totalCount));
    return;
  }

  mapStatusLine.textContent = t(
    "viewer_mapped_records_status",
    "Showing {mapped} mapped resource records."
  ).replace("{mapped}", formatCount(mappedCount));
}

function resetMapView() {
  if (!viewerMap) return;

  const coordinates = [];

  Object.values(viewerCentroidGeojsonByGroup).forEach((geojson) => {
    const centroidFeatures = geojson?.features || [];

    centroidFeatures.forEach((feature) => {
      const coords = pointLikeCoordinates(feature.geometry);
      if (coords) coordinates.push(coords);
    });
  });

  if (!coordinates.length) {
    VIEWER_ALL_MAP_TYPES.forEach((recordType) => {
      const features = viewerMapLayers?.[recordType]?.features || [];
      features.forEach((feature) => {
        const coords = pointLikeCoordinates(feature.geometry);
        if (coords) coordinates.push(coords);
      });
    });
  }

  suppressViewerMapReload();

  if (coordinates.length) {
    const bounds = coordinates.reduce(
      (box, coords) => box.extend(coords),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
    );

    viewerMap.fitBounds(bounds, {
      padding: 80,
      maxZoom: 7,
      duration: 700
    });
    return;
  }

  viewerMap.easeTo({
    center: [66.9, 48.2],
    zoom: 4.2,
    duration: 700
  });
}

function ensureViewerRecordVisible(record) {
  if (!viewerMap || !record?.geometry) return;

  fitViewerMapToGeometry(record.geometry, {
    padding: 90,
    maxZoom: 16,
    pointZoom: 13,
    duration: 500
  });
}

// --------------------------------------------------------
// SELECTED HIGHLIGHT
// --------------------------------------------------------
function drawViewerSelectedHighlight(record) {
  if (!viewerMap || !viewerMapLoaded || !record?.geometry) {
    clearViewerSelectedHighlight();
    return;
  }

  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: record.geometry,
        properties: {
          caal_id: record.identity?.caal_id || "",
          display_label: viewerRecordTitle(record)
        }
      }
    ]
  };

  const source = viewerMap.getSource("viewer-selected");

  if (source && typeof source.setData === "function") {
    source.setData(geojson);
  } else {
    viewerMap.addSource("viewer-selected", {
      type: "geojson",
      data: geojson
    });
  }

  if (!viewerMap.getLayer("viewer-selected-fill")) {
    viewerMap.addLayer({
      id: "viewer-selected-fill",
      type: "fill",
      source: "viewer-selected",
      filter: VIEWER_POLYGON_GEOMETRY_FILTER,
      paint: {
        "fill-color": VIEWER_COLOURS.selected,
        "fill-opacity": 0.18
      }
    });
  }

  if (!viewerMap.getLayer("viewer-selected-line")) {
    viewerMap.addLayer({
      id: "viewer-selected-line",
      type: "line",
      source: "viewer-selected",
      filter: VIEWER_POLYGON_OR_LINE_GEOMETRY_FILTER,
      paint: {
        "line-color": VIEWER_COLOURS.selected,
        "line-width": 3,
        "line-opacity": 1
      }
    });
  }

  if (!viewerMap.getLayer("viewer-selected-circle")) {
    viewerMap.addLayer({
      id: "viewer-selected-circle",
      type: "circle",
      source: "viewer-selected",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 8,
          8, 10,
          12, 13
        ],
        "circle-color": VIEWER_COLOURS.selected,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2
      }
    });
  }

  bringViewerLayersToFront();
  renderViewerMapLabels();
  renderViewerLegend();
}

function clearViewerSelectedHighlight() {
  if (!viewerMap || !viewerMapLoaded) return;

  [
    "viewer-selected-fill",
    "viewer-selected-line",
    "viewer-selected-circle"
  ].forEach((layerId) => {
    if (viewerMap.getLayer(layerId)) {
      viewerMap.removeLayer(layerId);
    }
  });

  if (viewerMap.getSource("viewer-selected")) {
    viewerMap.removeSource("viewer-selected");
  }

  renderViewerMapLabels();
  renderViewerLegend();
}

// --------------------------------------------------------
// MAP OPTIONS / LABELS
// --------------------------------------------------------
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

function createMapIconButton({
  id,
  title,
  className = "",
  html,
  onClick
}) {
  const button = document.createElement("button");

  button.type = "button";
  button.id = id;
  button.className = `map-icon-toggle ${className}`.trim();
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = html;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (typeof onClick === "function") {
      onClick(event);
    }
  });

  return button;
}

function addMapOptionsControl() {
  if (!viewerMap) return;

  class MapOptionsControl {
    onAdd(mapInstance) {
      this._map = mapInstance;

      const container = document.createElement("div");
      container.className = "maplibregl-ctrl map-custom-control map-options-map-control";

      const button = createMapIconButton({
        id: "mapOptionsBtn",
        title: t("map_options", "Map options"),
        className: "map-options-map-toggle",
        html: svgMapOptionsIcon(),
        onClick: toggleMapOptionsPanel
      });

      container.appendChild(button);
      mapOptionsBtn = button;

      this._container = container;
      return container;
    }

    onRemove() {
      if (this._container?.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }

      mapOptionsBtn = null;
      this._map = undefined;
    }
  }

  viewerMap.addControl(new MapOptionsControl(), "top-right");
}

function addViewerLegendControl() {
  if (!viewerMap) return;

  class ViewerLegendControl {
    onAdd(mapInstance) {
      this._map = mapInstance;

      const container = document.createElement("div");
      container.className = "maplibregl-ctrl monument-map-legend viewer-map-legend";

      viewerLegendEl = container;
      renderViewerLegend();

      this._container = container;
      return container;
    }

    onRemove() {
      if (this._container?.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }

      if (viewerLegendEl === this._container) {
        viewerLegendEl = null;
      }

      this._map = undefined;
    }
  }

  viewerMap.addControl(new ViewerLegendControl(), "bottom-right");
}

function addMapResetControl() {
  if (!viewerMap) return;

  class MapResetControl {
    onAdd(mapInstance) {
      this._map = mapInstance;

      const container = document.createElement("div");
      container.className = "maplibregl-ctrl map-custom-control map-reset-map-control";

      const button = createMapIconButton({
        id: "resetMapBtn",
        title: t("reset_map", "Reset map"),
        className: "map-reset-map-toggle",
        html: `
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M4 11.5 12 5l8 6.5v7a1.5 1.5 0 0 1-1.5 1.5H15v-5H9v5H5.5A1.5 1.5 0 0 1 4 18.5v-7Z"
              fill="currentColor"
            />
          </svg>
        `,
        onClick: resetMapView
      });

      container.appendChild(button);
      resetMapBtn = button;

      this._container = container;
      return container;
    }

    onRemove() {
      if (this._container?.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }

      resetMapBtn = null;
      this._map = undefined;
    }
  }

  viewerMap.addControl(new MapResetControl(), "top-right");
}

async function waitForViewerMapExportRender() {
  if (!viewerMap) return;

  await new Promise((resolve) => {
    let resolved = false;

    function finish() {
      if (resolved) return;
      resolved = true;

      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    }

    viewerMap.once("render", finish);
    viewerMap.triggerRepaint();

    setTimeout(finish, 700);
  });
}

function downloadViewerMapImage() {
  if (!viewerMap) {
    console.warn("Viewer map unavailable for export.");
    return;
  }

  const mapCanvas = viewerMap.getCanvas();

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = mapCanvas.width;
  exportCanvas.height = mapCanvas.height;

  const ctx = exportCanvas.getContext("2d");

  // Copy the currently preserved MapLibre frame immediately.
  ctx.drawImage(mapCanvas, 0, 0);

  const width = exportCanvas.width;
  const height = exportCanvas.height;
  const uiScale = Math.max(1, width / 1400);

  function scaled(px) {
    return Math.round(px * uiScale);
  }

  // Legend
  const legendItems =
    typeof getCurrentViewerMapLegendItems === "function"
      ? getCurrentViewerMapLegendItems()
      : [];

  if (legendItems.length) {
    ctx.save();

    const legendTitleSize = scaled(20);
    const legendTextSize = scaled(17);
    const rowH = scaled(30);
    const legendPadding = scaled(16);
    const symbolRadius = scaled(8);
    const symbolGap = scaled(16);

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
    const legendY = height - legendH - scaled(78);

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
    ctx.fillText(
      titleText,
      legendX + legendPadding,
      legendY + legendPadding + scaled(6)
    );

    legendItems.forEach((item, index) => {
      const y = legendY + legendPadding + scaled(28) + index * rowH;
      const symbolX = legendX + legendPadding + symbolRadius;
      const textX = symbolX + symbolRadius + symbolGap;

      ctx.beginPath();
      ctx.arc(symbolX, y, symbolRadius, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.lineWidth = scaled(2);
      ctx.stroke();

      ctx.fillStyle = "#263238";
      ctx.font = `${legendTextSize}px Arial, sans-serif`;
      ctx.fillText(item.label, textX, y);
    });

    ctx.restore();
  }

  // Scale bar
  const scale =
    typeof calculateMapScaleBar === "function"
      ? calculateMapScaleBar(viewerMap)
      : null;

  if (scale) {
    ctx.save();

    const scaleTextSize = scaled(17);
    const scalePaddingX = scaled(14);
    const barH = scaled(9);

    ctx.font = `${scaleTextSize}px Arial, sans-serif`;
    ctx.textBaseline = "middle";

    const scaleX = scaled(24);
    const scaleY = height - scaled(38);

    ctx.fillStyle = "rgba(255, 255, 255, 0.93)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
    ctx.lineWidth = 1;

    const labelWidth = ctx.measureText(scale.label).width;
    const pillW = Math.ceil(scale.widthPx + labelWidth + scalePaddingX * 3);
    const pillH = scaled(42);

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
    ctx.fillText(scale.label, scaleX + scale.widthPx + scalePaddingX, scaleY);

    ctx.restore();
  }

  // Watermark
  ctx.save();

  const watermarkText = "CAAL - Central Asian Archaeological Landscapes";
  ctx.font = `bold ${scaled(18)}px Arial, sans-serif`;
  ctx.textBaseline = "middle";

  const watermarkPaddingX = scaled(16);
  const watermarkTextWidth = ctx.measureText(watermarkText).width;
  const watermarkW = Math.ceil(watermarkTextWidth + watermarkPaddingX * 2);
  const watermarkH = scaled(44);
  const watermarkX = width - watermarkW - scaled(16);
  const watermarkY = height - watermarkH - scaled(16);

  ctx.fillStyle = "rgba(255, 255, 255, 0.93)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
  ctx.lineWidth = 1;

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

  const link = document.createElement("a");
  link.href = exportCanvas.toDataURL("image/png");
  link.download = `caal-viewer-map-${new Date().toISOString().slice(0, 10)}.png`;
  link.click();
}

function addMapDownloadControl() {
  if (!viewerMap) return;

  class MapDownloadControl {
    onAdd(mapInstance) {
      this._map = mapInstance;

      const container = document.createElement("div");
      container.className = "maplibregl-ctrl map-custom-control map-download-map-control";

      const button = createMapIconButton({
        id: "downloadMapBtn",
        title: t("download_map", "Download map"),
        className: "map-download-map-toggle",
        html: `
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M12 4a1 1 0 0 1 1 1v8.1l2.8-2.8a1 1 0 0 1 1.4 1.4l-4.5 4.5a1 1 0 0 1-1.4 0l-4.5-4.5a1 1 0 1 1 1.4-1.4L11 13.1V5a1 1 0 0 1 1-1Z"
              fill="currentColor"
            />
            <path
              d="M5 18a1 1 0 0 1 1-1h1.5a1 1 0 1 1 0 2H6v1h12v-1h-1.5a1 1 0 1 1 0-2H18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2Z"
              fill="currentColor"
            />
          </svg>
        `,
        onClick: () => {
          console.log("Viewer download button clicked");
          console.log(
            "preserveDrawingBuffer:",
            window.viewerMap?.painter?.context?.gl?.getContextAttributes?.().preserveDrawingBuffer
          );

          downloadViewerMapImage();
        }
      });

      container.appendChild(button);
      downloadMapBtn = button;

      this._container = container;
      return container;
    }

    onRemove() {
      if (this._container?.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }

      downloadMapBtn = null;
      this._map = undefined;
    }
  }

  viewerMap.addControl(new MapDownloadControl(), "top-right");
}

function toggleMapOptionsPanel() {
  if (!mapOptionsPanel) return;

  if (!mapOptionsPanel.hidden) {
    closeMapOptionsPanel();
    return;
  }

  updateMapOptionsState();
  mapOptionsPanel.hidden = false;

  if (mapOptionsBtn) {
    mapOptionsBtn.classList.add("is-active");
    mapOptionsBtn.setAttribute("aria-expanded", "true");
    mapOptionsBtn.innerHTML = `<span aria-hidden="true">×</span>`;
  }
}

function closeMapOptionsPanel() {
  if (!mapOptionsPanel) return;

  mapOptionsPanel.hidden = true;

  if (mapOptionsBtn) {
    mapOptionsBtn.classList.remove("is-active");
    mapOptionsBtn.setAttribute("aria-expanded", "false");
    mapOptionsBtn.innerHTML = svgMapOptionsIcon();
  }
}

function updateMapOptionsState() {
  if (borderStyleOptions && showCentralAsiaBordersCheckbox) {
    borderStyleOptions.hidden = !showCentralAsiaBordersCheckbox.checked;
  }

  if (mapLabelsOptions && showMapLabelsCheckbox) {
    mapLabelsOptions.hidden = !showMapLabelsCheckbox.checked;
  }

  updateMapLabelHelpText();
  updateMapLabelWarning();
}

function updateMapLabelHelpText() {
  if (!mapLabelScopeHelp || !mapLabelScopeSelect) return;

  const messages = {
    results: t(
      "labels_apply_to_results",
      "Labels apply to records currently drawn on the map."
    ),
    selected: t(
      "labels_apply_to_selected",
      "Labels apply to the open record in the details pane."
    )
  };

  mapLabelScopeHelp.textContent =
    messages[mapLabelScopeSelect.value] || messages.results;
}

function getViewerLabelExpression() {
  const mode = mapLabelModeSelect?.value || "name";

  if (mode === "caal_id") {
    return ["coalesce", ["get", "caal_id"], ""];
  }

  if (mode === "name_caal_id") {
    return [
      "case",
      ["all", ["has", "display_label"], ["has", "caal_id"]],
      ["concat", ["get", "display_label"], " (", ["get", "caal_id"], ")"],
      ["coalesce", ["get", "display_label"], ["get", "caal_id"], ""]
    ];
  }

  return ["coalesce", ["get", "display_label"], ["get", "caal_id"], ""];
}

function getViewerLabelBlockReason() {
  if (!viewerMap || !showMapLabelsCheckbox?.checked) return null;

  const scope = mapLabelScopeSelect?.value || "results";

  if (scope !== "results") return null;

  const zoom = viewerMap.getZoom();

  const featureCount = VIEWER_ALL_MAP_TYPES.reduce((total, recordType) => {
    const features = viewerMapLayers?.[recordType]?.features;
    return total + (Array.isArray(features) ? features.length : 0);
  }, 0);

  if (zoom < VIEWER_LABEL_MIN_ZOOM) {
    return t(
      "labels_zoom_in_warning",
      "Zoom in to show labels for records shown on the map."
    );
  }

  if (featureCount > VIEWER_LABEL_MAX_FEATURES) {
    return t(
      "too_many_records_to_label",
      "Too many records to label clearly. Zoom in for labels."
    );
  }

  return null;
}

function updateMapLabelWarning() {
  if (!mapLabelWarning) return;

  const reason = getViewerLabelBlockReason();

  mapLabelWarning.hidden = !reason;
  mapLabelWarning.textContent = reason || "";
}

function renderViewerMapLabels() {
  if (!viewerMap || !viewerMapLoaded) return;

  if (viewerMap.getLayer("viewer-live-labels")) {
    viewerMap.removeLayer("viewer-live-labels");
  }

  if (viewerMap.getSource("viewer-labels")) {
    viewerMap.removeSource("viewer-labels");
  }

  if (!showMapLabelsCheckbox?.checked) {
    updateMapLabelWarning();
    return;
  }

  const blockReason = getViewerLabelBlockReason();
  if (blockReason) {
    updateMapLabelWarning();
    return;
  }

  const scope = mapLabelScopeSelect?.value || "results";

  let features = [];

  if (scope === "selected" && viewerSelectedRecord?.geometry) {
    features = [
      {
        type: "Feature",
        geometry: pointGeometryForLabel(viewerSelectedRecord.geometry),
        properties: {
          caal_id: viewerSelectedRecord.identity?.caal_id || "",
          display_label: viewerRecordTitle(viewerSelectedRecord)
        }
      }
    ].filter((feature) => feature.geometry);
  } else {
    features = [];

    VIEWER_ALL_MAP_TYPES.forEach((recordType) => {
      const layerFeatures = viewerMapLayers?.[recordType]?.features || [];

      layerFeatures.forEach((feature) => {
        const pointGeom = pointGeometryForLabel(feature.geometry);
        if (!pointGeom) return;

        features.push({
          type: "Feature",
          geometry: pointGeom,
          properties: {
            caal_id: feature.properties?.caal_id || "",
            display_label:
              feature.properties?.display_label ||
              feature.properties?.caal_id ||
              ""
          }
        });
      });
    });
  }

  if (!features.length) {
    updateMapLabelWarning();
    return;
  }

  viewerMap.addSource("viewer-labels", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features
    }
  });

  viewerMap.addLayer({
    id: "viewer-live-labels",
    type: "symbol",
    source: "viewer-labels",
    layout: {
      "text-field": getViewerLabelExpression(),
      "text-size": 11,
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-anchor": "left",
      "text-offset": [0.8, -0.6],
      "text-allow-overlap": false,
      "text-ignore-placement": false
    },
    paint: {
      "text-color": "#1f2933",
      "text-halo-color": "rgba(255,255,255,0.88)",
      "text-halo-width": 1.2
    }
  });

  updateViewerMapModeVisibility();
  bringViewerLayersToFront();
  updateMapLabelWarning();
}

function pointGeometryForLabel(geometry) {
  const coords = pointLikeCoordinates(geometry);

  if (!coords) return null;

  return {
    type: "Point",
    coordinates: coords
  };
}

function viewerLayerIsVisible(recordType) {
  const input = VIEWER_MAP_LAYER_INPUTS[recordType];
  return input?.checked === true;
}

function viewerMapLayerHasFeatures(recordType) {
  const features = viewerMapLayers?.[recordType]?.features;
  return Array.isArray(features) && features.length > 0;
}

function viewerCentroidGroupHasFeatures(groupKey) {
  const features = viewerCentroidGeojsonByGroup?.[groupKey]?.features;
  return Array.isArray(features) && features.length > 0;
}

function viewerLegendShouldShowLayer(recordType) {
  return viewerLayerIsVisible(recordType) && viewerMapLayerHasFeatures(recordType);
}

function viewerHasClusterGroupVisible(groupKey) {
  const group = VIEWER_CLUSTER_GROUPS[groupKey];
  if (!group) return false;

  return group.types.some((type) => viewerLayerIsVisible(type));
}

function viewerLegendSymbolRow({
  symbolClass,
  labelKey,
  fallback
}) {
  return `
    <div class="legend-row">
      <span class="legend-symbol ${symbolClass}"></span>
      <span>${escapeHtml(t(labelKey, fallback))}</span>
    </div>
  `;
}

function getCurrentViewerMapLegendItems() {
  const items = [];
  const mode = getViewerMapMode();

  if (mode === "clusters") {
    if (viewerCentroidGroupHasFeatures("monuments")) {
      items.push({
        label: t("viewer_monument_clusters", "Monument clusters"),
        color: VIEWER_COLOURS.monument,
        type: "circle"
      });
    }

    if (viewerCentroidGroupHasFeatures("remote_sensing")) {
      items.push({
        label: t("viewer_remote_sensing_clusters", "Remote sensing clusters"),
        color: "#374151",
        type: "circle"
      });
    }

    if (viewerCentroidGroupHasFeatures("vernacular")) {
      items.push({
        label: t("viewer_vernacular_clusters", "Vernacular clusters"),
        color: VIEWER_COLOURS.vernacular,
        type: "circle"
      });
    }
  }

  if (viewerMapLayers?.institution?.features?.length) {
    items.push({
      label: t("viewer_layer_institution", "Institutions"),
      color: VIEWER_COLOURS.institution,
      type: "circle"
    });
  }

  return items;
}

function renderViewerLegend() {
  if (!viewerLegendEl) return;

  const rows = [];
  const mode = getViewerMapMode();
  const showDetailedResourceSymbols = mode !== "clusters";

  const showMonumentCluster =
    mode === "clusters" &&
    viewerCentroidGroupHasFeatures("monuments");

  const showRemoteSensingCluster =
    mode === "clusters" &&
    viewerCentroidGroupHasFeatures("remote_sensing");

  const showVernacularCluster =
    mode === "clusters" &&
    viewerCentroidGroupHasFeatures("vernacular");

  if (showMonumentCluster) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-cluster-monument",
        labelKey: "viewer_monument_clusters",
        fallback: "Monument clusters"
      })
    );
  }

  if (showRemoteSensingCluster) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-cluster-rs",
        labelKey: "viewer_remote_sensing_clusters",
        fallback: "Remote sensing clusters"
      })
    );
  }

  if (showVernacularCluster) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-cluster-vernacular",
        labelKey: "viewer_vernacular_clusters",
        fallback: "Vernacular clusters"
      })
    );
  }

  if (showDetailedResourceSymbols && viewerLegendShouldShowLayer("monument")) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-monument",
        labelKey: "viewer_layer_monument",
        fallback: "Monuments"
      })
    );
  }

  if (showDetailedResourceSymbols && viewerLegendShouldShowLayer("rs3_poly")) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-rs3-poly",
        labelKey: "viewer_layer_rs3_poly",
        fallback: "RS3 polygons"
      })
    );
  }

  if (showDetailedResourceSymbols && viewerLegendShouldShowLayer("rs3_line")) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-rs3-line",
        labelKey: "viewer_layer_rs3_line",
        fallback: "RS3 lines"
      })
    );
  }

  if (showDetailedResourceSymbols && viewerLegendShouldShowLayer("rs3_group")) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-rs3-group",
        labelKey: "viewer_layer_rs3_group",
        fallback: "RS3 groups"
      })
    );
  }

  if (viewerLegendShouldShowLayer("institution")) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-institution",
        labelKey: "viewer_layer_institution",
        fallback: "Institutions"
      })
    );
  }

  if (showDetailedResourceSymbols && viewerLegendShouldShowLayer("vernacular")) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-vernacular",
        labelKey: "viewer_layer_vernacular",
        fallback: "Vernacular"
      })
    );
  }

  if (
    viewerMapLayerSurveyGrid?.checked &&
    (
      viewerMapLayerHasFeatures("survey_grid") ||
      viewerMapLayerHasFeatures("survey_grid_region")
    )
  ) {
    const surveyMode = getSurveyGridStyleMode();

    if (surveyMode === "status") {
      rows.push(
        viewerLegendSymbolRow({
          symbolClass: "viewer-legend-grid-complete",
          labelKey: "viewer_survey_grid_complete",
          fallback: "Survey grid: complete"
        })
      );

      rows.push(
        viewerLegendSymbolRow({
          symbolClass: "viewer-legend-grid-progress",
          labelKey: "viewer_survey_grid_in_progress",
          fallback: "Survey grid: in progress"
        })
      );

      rows.push(
        viewerLegendSymbolRow({
          symbolClass: "viewer-legend-grid-not-started",
          labelKey: "viewer_survey_grid_not_started",
          fallback: "Survey grid: not started"
        })
      );
    } else if (surveyMode === "checked") {
      rows.push(
        viewerLegendSymbolRow({
          symbolClass: "viewer-legend-grid-checked",
          labelKey: "viewer_survey_grid_checked",
          fallback: "Survey grid: checked"
        })
      );

      rows.push(
        viewerLegendSymbolRow({
          symbolClass: "viewer-legend-grid-not-checked",
          labelKey: "viewer_survey_grid_not_checked",
          fallback: "Survey grid: not checked"
        })
      );
    } else {
      rows.push(
        viewerLegendSymbolRow({
          symbolClass: "viewer-legend-grid",
          labelKey: "viewer_layer_survey_grid",
          fallback: "Survey grid"
        })
      );
    }
  }

  if (viewerSelectedRecord?.geometry) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "legend-selected",
        labelKey: "selected_record",
        fallback: "Selected record"
      })
    );
  }

  if (viewerRelatedOverlayActive) {
    rows.push(
      viewerLegendSymbolRow({
        symbolClass: "viewer-legend-related",
        labelKey: "related_record",
        fallback: "Related record"
      })
    );
  }

  viewerLegendEl.hidden = rows.length === 0;

  if (!rows.length) {
    viewerLegendEl.innerHTML = "";
    return;
  }

  if (viewerLegendCollapsed) {
    viewerLegendEl.classList.add("legend-collapsed");
    viewerLegendEl.innerHTML = `
      <button
        type="button"
        class="legend-toggle-btn legend-show-btn"
        id="showViewerLegendBtn"
        title="${escapeHtml(t("show_map_key", "Show map key"))}"
        aria-label="${escapeHtml(t("show_map_key", "Show map key"))}"
      >
        ${escapeHtml(t("map_key_short", "Key"))}
      </button>
    `;

    const showBtn = document.getElementById("showViewerLegendBtn");
    if (showBtn) {
      showBtn.addEventListener("click", () => {
        viewerLegendCollapsed = false;
        renderViewerLegend();
      });
    }

    return;
  }

  viewerLegendEl.classList.remove("legend-collapsed");
  viewerLegendEl.innerHTML = `
    <div class="legend-header">
      <div class="legend-title">${escapeHtml(t("map_key", "Map key"))}</div>
      <button
        type="button"
        class="legend-toggle-btn legend-hide-btn"
        id="hideViewerLegendBtn"
        title="${escapeHtml(t("hide_map_key", "Hide map key"))}"
        aria-label="${escapeHtml(t("hide_map_key", "Hide map key"))}"
      >
        ×
      </button>
    </div>
    ${rows.join("")}
  `;

  const hideBtn = document.getElementById("hideViewerLegendBtn");
  if (hideBtn) {
    hideBtn.addEventListener("click", () => {
      viewerLegendCollapsed = true;
      renderViewerLegend();
    });
  }
}


// --------------------------------------------------------
// FILTER / RELOAD
// --------------------------------------------------------
async function reloadViewer({ includeMap = true } = {}) {
  setViewerLoading(true, t("loading_records", "Loading records..."));

  try {
    await loadViewerRecords();

    if (includeMap) {
      await loadViewerMap();
    }
  } catch (error) {
    console.error("Viewer reload failed:", error);
    setViewerStatus(error.message || "Viewer reload failed", {
      isError: true
    });
  } finally {
    setViewerLoading(false);
  }
}

function scheduleViewerReload() {
  if (viewerSearchDebounceTimer) {
    clearTimeout(viewerSearchDebounceTimer);
  }

  setViewerResultsCountText(t("searching", "Searching..."));

  viewerSearchDebounceTimer = setTimeout(async () => {
    viewerPageOffset = 0;
    await reloadViewer({ includeMap: true });
  }, 600);
}

async function clearViewerFilters() {
  if (viewerSearch) viewerSearch.value = "";
  if (viewerFilterCaalId) viewerFilterCaalId.value = "";

  VIEWER_CHIP_MULTISELECTS.forEach((config) => {
    const selectEl = config.select;
    if (!selectEl) return;

    Array.from(selectEl.options || []).forEach((option) => {
      option.selected = false;
    });

    renderViewerFilterChipsForSelect(selectEl, config.chipsId);
  });

  if (viewerFilterMonumentType) {
    Array.from(viewerFilterMonumentType.options || []).forEach((option) => {
      option.selected = false;
    });

    syncViewerAdvancedFilterTreeFromSelect(viewerFilterMonumentType);
    renderViewerFilterChipsForSelect(
      viewerFilterMonumentType,
      "viewerFilterMonumentTypeChips"
    );
  }

  if (viewerFilterRiskMin) {
    viewerFilterRiskMin.value = "";
  }

  configureScopeControlsForSession({ setDefault: true });
  resetViewerLayerSelectionsToDefault();

  activeMapViewFilterBbox = null;
  activeViewerSpatialPolygon = null;

  cancelViewerSpatialPolygonDrawing({
    clearCompletedPolygon: true
  });
  viewerPageOffset = 0;

  updateFilterToMapViewButton();
  updateViewerSpatialPolygonButton();
  renderViewerActiveFilterChips();

  await reloadViewer({ includeMap: true });
}

async function applyMapViewFilterFromCurrentMap() {
  const bbox = getCurrentMapViewBbox();
  if (!bbox) return;

  cancelViewerSpatialPolygonDrawing({
    clearCompletedPolygon: true
  });

  activeViewerSpatialPolygon = null;
  activeMapViewFilterBbox = bbox;
  viewerPageOffset = 0;

  updateViewerSpatialPolygonButton();
  updateFilterToMapViewButton();
  renderViewerActiveFilterChips();

  await reloadViewer({ includeMap: true });
}

// --------------------------------------------------------
// WIRING
// --------------------------------------------------------
function wireViewerEvents() {
  if (viewerSearch) {
    viewerSearch.addEventListener("input", scheduleViewerReload);
  }

  if (viewerFilterCaalId) {
    viewerFilterCaalId.addEventListener("input", scheduleViewerReload);
  }

 VIEWER_CHIP_MULTISELECTS.forEach((config) => {
    const selectEl = config.select;
    if (!selectEl) return;

    selectEl.addEventListener("change", async () => {
      renderViewerFilterChipsForSelect(selectEl, config.chipsId);
      renderViewerActiveFilterChips();

      viewerPageOffset = 0;
      await reloadViewer({ includeMap: true });
    });
  });

  if (viewerFilterRiskMin) {
    viewerFilterRiskMin.addEventListener("change", async () => {
      renderViewerActiveFilterChips();

      viewerPageOffset = 0;
      await reloadViewer({ includeMap: true });
    });
  }

  if (toggleViewerFiltersBtn && viewerFiltersPanel) {
    toggleViewerFiltersBtn.addEventListener("click", () => {
      viewerFiltersPanel.hidden = !viewerFiltersPanel.hidden;
    });
  }

  if (clearViewerFiltersBtn) {
    clearViewerFiltersBtn.addEventListener("click", clearViewerFilters);
  }

  if (viewerPrevBtn) {
    viewerPrevBtn.addEventListener("click", async () => {
      viewerPageOffset = Math.max(0, viewerPageOffset - viewerPageLimit);
      await reloadViewer({ includeMap: false });
    });
  }

  if (viewerNextBtn) {
    viewerNextBtn.addEventListener("click", async () => {
      if (viewerPageOffset + viewerPageLimit >= viewerTotalCount) return;

      viewerPageOffset += viewerPageLimit;
      await reloadViewer({ includeMap: false });
    });
  }

  if (showViewerResultsOnMapBtn) {
    showViewerResultsOnMapBtn.addEventListener("click", showCurrentViewerResultsOnMap);
  }

  if (viewerCloseRecordBtn) {
    viewerCloseRecordBtn.addEventListener("click", closeViewerRecord);
  }

  [
    showViewerWorkspaceRecords,
    showViewerNationalRecords,
    showViewerAllCaalRecords
  ].forEach((input) => {
    if (!input) return;

    input.addEventListener("change", async () => {
      viewerPageOffset = 0;
      await reloadViewer({ includeMap: true });
    });
  });

  VIEWER_RECORD_TYPES.forEach((type) => {
    const leftInput = VIEWER_LAYER_INPUTS[type];
    const mapInput = VIEWER_MAP_LAYER_INPUTS[type];

    // Left pane: filters records/results/map query.
    if (leftInput) {
      leftInput.addEventListener("change", async () => {
        viewerPageOffset = 0;
        await reloadViewer({ includeMap: true });
      });
    }

    // Map options: visibility only, no reload needed.
    if (mapInput) {
      mapInput.addEventListener("change", () => {
        updateViewerMapModeVisibility();
        renderViewerMapLabels();
        renderViewerLegend();
      });
    }
  });

  if (surveyGridStyleMode) {
    surveyGridStyleMode.addEventListener("change", () => {
      updateSurveyGridPaint();
      renderViewerMapLabels();
      renderViewerLegend();
    });
  }

  if (viewerMapLayerSurveyGrid) {
    viewerMapLayerSurveyGrid.addEventListener("change", async () => {
      try {
        updateSurveyGridOptionsVisibility();
        await loadViewerMap();
        updateSurveyGridPaint();
        renderViewerMapLabels();
        updateMapStatusLine();
        renderViewerLegend();
      } catch (error) {
        console.error("Viewer optional map layer reload failed:", error);
        setViewerStatus(error.message || "Could not load optional map layer", {
          isError: true
        });
      }
    });
  }

  if (closeMapOptionsBtn) {
    closeMapOptionsBtn.addEventListener("click", closeMapOptionsPanel);
  }

  if (showCentralAsiaBordersCheckbox) {
    showCentralAsiaBordersCheckbox.addEventListener("change", async () => {
      if (borderStyleOptions) {
        borderStyleOptions.hidden = !showCentralAsiaBordersCheckbox.checked;
      }

      try {
        await loadViewerMap();
      } catch (error) {
        console.error("Admin boundary layer reload failed:", error);
      }
    });
  }

  if (showMapLabelsCheckbox) {
    showMapLabelsCheckbox.addEventListener("change", () => {
      updateMapOptionsState();
      renderViewerMapLabels();
    });
  }

  if (mapLabelScopeSelect) {
    mapLabelScopeSelect.addEventListener("change", () => {
      updateMapOptionsState();
      renderViewerMapLabels();
    });
  }

  if (mapLabelModeSelect) {
    mapLabelModeSelect.addEventListener("change", renderViewerMapLabels);
  }

  if (filterToMapViewBtn) {
    filterToMapViewBtn.addEventListener("click", applyMapViewFilterFromCurrentMap);
  }
  // map draw polygon
  if (drawViewerSpatialPolygonBtn) {
    drawViewerSpatialPolygonBtn.addEventListener("click", () => {
      startViewerSpatialPolygonDrawing();
    });
  }

  if (cancelViewerSpatialDrawBtn) {
    cancelViewerSpatialDrawBtn.addEventListener("click", () => {
      cancelViewerSpatialPolygonDrawing({
        clearCompletedPolygon: true
      });
    });
  }

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      viewerSpatialDrawIsActive
    ) {
      cancelViewerSpatialPolygonDrawing({
        clearCompletedPolygon: true
      });
    }
  });
}

function viewerCacheLocale() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const localeByLang = {
    en: "en-GB",
    ru: "ru-RU",
    zh: "zh-CN",
    kk: "kk-KZ",
    ky: "ky-KG",
    tg: "tg-TJ",
    tk: "tk-TM",
    uz: "uz-UZ"
  };

  return localeByLang[lang] || "en-GB";
}

function viewerFormatCacheTimestamp(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(viewerCacheLocale(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function loadViewerCacheStatus() {
  if (!viewerCacheStatusLine) return;

  try {
    const response = await fetch("/api/viewer/cache-status", {
      method: "GET",
      credentials: "include"
    });

    const data = await response.json();

    const displayAt =
      data.status?.display_at ||
      data.status?.checked_at ||
      data.status?.refreshed_at ||
      null;

    if (!response.ok || !data.ok || !displayAt) {
      viewerCacheStatusLine.hidden = true;
      return;
    }

    viewerCacheStatusLine.classList.remove("cache-status-unavailable");

    viewerCacheStatusLine.textContent =
      `${t("caal_viewer_data_last_checked", "CAAL viewer data last checked")}: ${viewerFormatCacheTimestamp(displayAt)}`;

    viewerCacheStatusLine.hidden = false;
  } catch (error) {
    console.warn("Viewer cache status unavailable:", error);

    viewerCacheStatusLine.textContent =
      t(
        "caal_viewer_data_update_time_unavailable",
        "CAAL viewer data update time unavailable"
      );

    viewerCacheStatusLine.classList.add("cache-status-unavailable");
    viewerCacheStatusLine.hidden = false;
  }
}

// --------------------------------------------------------
// INIT
// --------------------------------------------------------
function viewerUrlRecordTypes(params) {
  const raw =
    params.get("recordTypes") ||
    params.get("recordType") ||
    params.get("layers") ||
    "";

  return String(raw)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => VIEWER_LAYER_INPUTS[value] || VIEWER_MAP_LAYER_INPUTS[value]);
}

function applyViewerInitialUrlState() {
  const params = new URLSearchParams(window.location.search);

  const text = params.get("text") || params.get("q") || "";
  const caalId = params.get("caal_id") || params.get("caalId") || "";

  if (viewerSearch && text) {
    viewerSearch.value = text;
  }

  if (viewerFilterCaalId && caalId) {
    viewerFilterCaalId.value = caalId;
  }

  const recordTypes = viewerUrlRecordTypes(params);

  if (recordTypes.length) {
    Object.entries(VIEWER_LAYER_INPUTS).forEach(([type, input]) => {
      if (input) input.checked = recordTypes.includes(type);
    });

    Object.entries(VIEWER_MAP_LAYER_INPUTS).forEach(([type, input]) => {
      if (input && type !== "survey_grid") {
        input.checked = recordTypes.includes(type);
      }
    });

    VIEWER_RECORD_TYPES.forEach((type) => {
      if (recordTypes.includes(type)) {
        viewerCollapsedResultGroups.delete(type);
      } else {
        viewerCollapsedResultGroups.add(type);
      }
    });
  }

  return {
    text,
    caalId,
    recordTypes
  };
}

async function initViewerPage() {
  const session =
    typeof window.requireSession === "function"
      ? await window.requireSession()
      : await waitForViewerSession();

  if (!session) return;

  if (
    typeof window.sharedSessionIsCaalWorkspace === "function" &&
    !window.sharedSessionIsCaalWorkspace(session)
  ) {
    window.location.href = "home.html";
    return;
  }

  if (typeof window.updateCaalOnlyNavigation === "function") {
    window.updateCaalOnlyNavigation(session);
  }

  if (typeof window.renderSignedInUserPill === "function") {
    window.renderSignedInUserPill();
  }

  if (typeof window.applyWorkspaceHeaderText === "function") {
    window.applyWorkspaceHeaderText("viewer", session);
  }

  setViewerLoading(true, t("loading_records", "Loading records."));
  setViewerResultsCountText(t("loading", "Loading..."));

  if (viewerResultsList) {
    viewerResultsList.innerHTML = `
      <div class="results-empty">
        <p>${escapeHtml(t("loading_records", "Loading records..."))}</p>
      </div>
    `;
  }

  try {
    await loadViewerLabels();
    await loadViewerLookups();
    await loadViewerCacheStatus();

    configureScopeControlsForSession({ setDefault: true });
    resetViewerLayerSelectionsToDefault();

    const initialUrlState = applyViewerInitialUrlState();

    decorateViewerLayerFilterIcons();
    updateFilterToMapViewButton();
    renderViewerRecordDetails(null);
    populateViewerFilterLookups();

    wireViewerEvents();
    wireViewerClickToggleMultiSelects();
    initViewerMap();

    const initialCaalId =
      initialUrlState.caalId ||
      (
        typeof getInitialCaalIdFromUrl === "function"
          ? getInitialCaalIdFromUrl()
          : ""
      );

    initialUrlState.recordTypes.forEach((type) => {
      viewerCollapsedResultGroups.delete(type);
    });

    /*
      Record counts and map data are loaded once by the MapLibre load handler.
      Do not load them here as well.
    */
    if (initialCaalId) {
      viewerSelectedRecord = await fetchViewerRecordByCaalId(initialCaalId);
      renderViewerRecordDetails(viewerSelectedRecord);

      /*
        The map may not have completed loading yet. The selected geometry will
        be restored after the initial map load below.
      */
      if (viewerMapLoaded) {
        drawViewerSelectedHighlight(viewerSelectedRecord);
      }
    }

    updateMapOptionsState();
    renderViewerLegend();
    renderViewerMapLabels();
    updateShowResultsOnMapButton();

  } catch (error) {
    console.error("Viewer init failed:", error);

    setViewerStatus(
      error.message || "Viewer init failed",
      {
        isError: true
      }
    );
  } finally {
    setViewerLoading(false);
  }
}

document.addEventListener("app:languageChanged", async () => {
  const selectedKey = selectedViewerRecordKey();

  setViewerLoading(true, t("switching_language", "Switching language..."));

  try {
    await loadViewerLabels();

    configureScopeControlsForSession({ setDefault: false });
    decorateViewerLayerFilterIcons();
    refreshMapLibreControlTooltips();

    await loadViewerLookups();
    populateViewerFilterLookups();
    await loadViewerCacheStatus();

    const previouslyOpenTypes = VIEWER_RECORD_TYPES.filter(
      (type) => !viewerCollapsedResultGroups.has(type)
    );

    await loadViewerRecords();

    previouslyOpenTypes.forEach((type) => {
      viewerCollapsedResultGroups.delete(type);
    });

    await reloadOpenViewerResultGroups();
    await loadViewerMap();

    updateMapOptionsState();
    renderViewerLegend();
    renderViewerMapLabels();

    if (selectedKey) {
      const refreshedLightRecord = getLoadedViewerGroupRecords()
        .find((record) => viewerRecordKey(record) === selectedKey);

      if (refreshedLightRecord) {
        viewerSelectedRecord = await fetchViewerFullRecord(refreshedLightRecord);
        renderViewerRecordDetails(viewerSelectedRecord);
        updateSelectedViewerCard();
        drawViewerSelectedHighlight(viewerSelectedRecord);
      } else if (viewerSelectedRecord) {
        renderViewerRecordDetails(viewerSelectedRecord);
      }
    } else {
      renderViewerRecordDetails(null);
    }
  } catch (error) {
    console.error("Viewer language refresh failed:", error);
    setViewerStatus(error.message || "Viewer language refresh failed", {
      isError: true
    });
  } finally {
    setViewerLoading(false);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initViewerPage().catch((error) => {
    console.error("Viewer page init failed:", error);
  });
});