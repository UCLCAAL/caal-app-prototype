// ========================================================
// MONUMENTS PAGE LOGIC
// Backend-driven MVP
// ========================================================

// --------------------------------------------------------
// DOM
// --------------------------------------------------------
const recordDetails = document.getElementById("recordDetails");
const siteSearch = document.getElementById("siteSearch");

const toggleFiltersBtn = document.getElementById("toggleFiltersBtn");
const filtersPanel = document.getElementById("filtersPanel");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");
const showResultsOnMapBtn = document.getElementById("showResultsOnMapBtn");

const filterCaalId = document.getElementById("filterCaalId");
const filterMonumentType = document.getElementById("filterMonumentType");
const filterClassification = document.getElementById("filterClassification");
const filterDesignation = document.getElementById("filterDesignation");
const filterReligion = document.getElementById("filterReligion");
const filterCulturalPeriod = document.getElementById("filterCulturalPeriod");
const filterCountry = document.getElementById("filterCountry");

const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");
const filterResultsCount = document.getElementById("filterResultsCount");
//map controls
const downloadMapBtn = document.getElementById("downloadMapBtn");
const mapOptionsBtn = document.getElementById("mapOptionsBtn");
const closeMapOptionsBtn = document.getElementById("closeMapOptionsBtn");
const mapOptionsPanel = document.getElementById("mapOptionsPanel");

const basemapSelect = document.getElementById("basemapSelect");
const mapLabelScopeSelect = document.getElementById("mapLabelScopeSelect");
const mapLabelModeSelect = document.getElementById("mapLabelModeSelect");
const mapLabelScopeHelp = document.getElementById("mapLabelScopeHelp");

const resetMapBtn = document.getElementById("resetMapBtn");
const mapStatusLine = document.getElementById("mapStatusLine");
const mapLabelWarning = document.getElementById("mapLabelWarning");
const showRelatedFromMapOptionsBtn = document.getElementById("showRelatedFromMapOptionsBtn");

const relationshipMapOptions = document.getElementById("relationshipMapOptions");
const showRelatedPointsCheckbox = document.getElementById("showRelatedPointsCheckbox");
const showRelationshipLinesCheckbox = document.getElementById("showRelationshipLinesCheckbox");

const showWorkspaceRecords = document.getElementById("showWorkspaceRecords");
const showNationalRecords = document.getElementById("showNationalRecords");
const showAllCaalRecords = document.getElementById("showAllCaalRecords");
const allCaalMonumentsToggleWrapper = document.getElementById("allCaalMonumentsToggleWrapper");
//buttons
const monumentPrevBtn = document.getElementById("monumentPrevBtn");
const monumentNextBtn = document.getElementById("monumentNextBtn");
const monumentPageInfo = document.getElementById("monumentPageInfo");

const monumentsActionBar = document.getElementById("monumentsActionBar");
const addMonumentBtn = document.getElementById("addMonumentBtn");
const monumentEditBtn = document.getElementById("monumentEditBtn");
const monumentSaveBtn = document.getElementById("monumentSaveBtn");
const monumentCancelEditBtn = document.getElementById("monumentCancelEditBtn");
const monumentDeleteBtn = document.getElementById("monumentDeleteBtn");

// modal
const monumentPreviewModal = document.getElementById("monumentPreviewModal");
const monumentPreviewTitle = document.getElementById("monumentPreviewTitle");
const monumentPreviewBody = document.getElementById("monumentPreviewBody");
const monumentPreviewCloseBtn = document.getElementById("monumentPreviewCloseBtn");
// related
const relatedRecordStatusCache = new Map();


// --------------------------------------------------------
// State
// --------------------------------------------------------
let monumentMapRecords = [];
let monumentListRecords = [];
let monumentSelectedRecord = null;

let monumentIsEditMode = false;
let monumentIsAddMode = false;
let monumentPendingNewRecord = null;
let monumentIsDirty = false;

let monumentLabels = {};
let monumentLookups = {};

let monumentTotalCount = 0;
let monumentPageLimit = 100;
let monumentPageOffset = 0;

let monumentsIsLoading = false;

let monumentMoveDebounceTimer = null;
let monumentFilterDebounceTimer = null;
let monumentScopeChangeDebounceTimer = null;

let suppressNextMapMoveReload = false;

let monumentListRequestSeq = 0;
let monumentMapRequestSeq = 0;

let monumentTotalIsExact = true;
let monumentMapIsStale = false;
let monumentRelatedSelectionGeojson = null;


// --------------------------------------------------------
// MapLibre map
// --------------------------------------------------------
const mapElement = document.getElementById("map");
let map = null;
let mapLoaded = false;
let monumentsLayerEventsBound = false;

function drawSelectedMonumentHighlight(record) {
  if (!map || !mapLoaded || !record?.geometry?.coordinates) return;

  const feature = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: record.geometry,
        properties: {
          id: record.identity?.id,
          caal_id: record.identity?.caal_id || "",
          label:
            mSummary(record, "primary_name") ||
            mSummary(record, "primary_name_english") ||
            record.identity?.caal_id ||
            "",
          primary_name:
            mSummary(record, "primary_name") ||
            mSummary(record, "primary_name_english") ||
            ""
        }
      }
    ]
  };

  const existingSource = map.getSource("monument-selected");

  if (existingSource && typeof existingSource.setData === "function") {
    existingSource.setData(feature);
  } else {
    map.addSource("monument-selected", {
      type: "geojson",
      data: feature
    });
  }

  if (!map.getLayer("monument-selected-ring")) {
    map.addLayer({
      id: "monument-selected-ring",
      type: "circle",
      source: "monument-selected",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 7,
          8, 9,
          12, 11
        ],
        "circle-color": "rgba(0, 229, 255, 0.12)",
        "circle-stroke-width": 4,
        "circle-stroke-color": "#00e5ff"
      }
    });
  }

  bringMonumentOverlaysToFront();
  renderLiveMapLabels();
  updateMapOptionsState();
  renderMonumentLegend();
}

function drawFocusedResultHighlight(record) {
  if (!map || !mapLoaded || !record?.geometry?.coordinates) return;

  const feature = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: record.geometry,
        properties: {
          id: record.identity?.id,
          caal_id: record.identity?.caal_id || ""
        }
      }
    ]
  };

  const existingSource = map.getSource("monument-result-focus");

  if (existingSource && typeof existingSource.setData === "function") {
    existingSource.setData(feature);
  } else {
    map.addSource("monument-result-focus", {
      type: "geojson",
      data: feature
    });
  }

  if (!map.getLayer("monument-result-focus-ring")) {
    map.addLayer({
      id: "monument-result-focus-ring",
      type: "circle",
      source: "monument-result-focus",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 8,
          8, 10,
          12, 12
        ],
        "circle-color": "rgba(255, 255, 255, 0)",
        "circle-stroke-width": 3,
        "circle-stroke-color": "rgba(40, 40, 40, 0.45)"
      }
    });
  }

  bringMonumentOverlaysToFront();
}

function clearFocusedResultHighlight() {
  if (!map || !mapLoaded) return;

  if (map.getLayer("monument-result-focus-ring")) {
    map.removeLayer("monument-result-focus-ring");
  }

  if (map.getSource("monument-result-focus")) {
    map.removeSource("monument-result-focus");
  }
}

function ensureRecordVisibleOnMap(record) {
  if (!map || !record?.geometry?.coordinates) return;

  const [lng, lat] = record.geometry.coordinates;
  const bounds = map.getBounds();
  const isSatellite =
    basemapSelect?.value === "maptiler-hybrid" ||
    basemapSelect?.value === "maptiler-satellite";
  const targetZoom = isSatellite ? 4.5 : 5;

  if (!bounds.contains([lng, lat])) {
    map.easeTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), targetZoom),
      duration: 500
    });
  }
}

function drawPendingPickPoint(lng, lat) {
  if (!map || !mapLoaded) return;

  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lng, lat]
        },
        properties: {
          kind: "pending-pick"
        }
      }
    ]
  };

  const existingSource = map.getSource("monument-pick-point");

  if (existingSource && typeof existingSource.setData === "function") {
    existingSource.setData(geojson);
  } else {
    map.addSource("monument-pick-point", {
      type: "geojson",
      data: geojson
    });
  }

  if (!map.getLayer("monument-pick-point-layer")) {
    map.addLayer({
      id: "monument-pick-point-layer",
      type: "circle",
      source: "monument-pick-point",
      paint: {
        "circle-radius": 8,
        "circle-color": "#1d4ed8",
        "circle-opacity": 0.95,
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff"
      }
    });
  }
  
  if (map.getLayer("monument-pick-point-layer")) {
    map.moveLayer("monument-pick-point-layer");
  }
  renderMonumentLegend();
}

function clearPendingPickPoint() {
  if (!map || !mapLoaded) return;

  if (map.getLayer("monument-pick-point-layer")) {
    map.removeLayer("monument-pick-point-layer");
  }

  if (map.getSource("monument-pick-point")) {
    map.removeSource("monument-pick-point");
  }
  renderMonumentLegend();
}

let monumentLegendEl = null;

function addMonumentLegendControl() {
  if (!map) return;

  class MonumentLegendControl {
    onAdd(mapInstance) {
      this._map = mapInstance;

      const container = document.createElement("div");
      container.className = "maplibregl-ctrl monument-map-legend";
      monumentLegendEl = container;

      renderMonumentLegend();

      this._container = container;
      return container;
    }

    onRemove() {
      if (this._container?.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }
      monumentLegendEl = null;
      this._map = undefined;
    }
  }

  map.addControl(new MonumentLegendControl(), "bottom-right");
}

function renderMonumentLegend() {
  if (!monumentLegendEl) return;

  const hasWorkspace = monumentMapRecords.some(
    (record) => monumentDisplayScope(record) === "workspace"
  );

  const hasNational = monumentMapRecords.some(
    (record) => monumentDisplayScope(record) === "national_ref"
  );

  const hasAllCaal = monumentMapRecords.some(
    (record) => monumentDisplayScope(record) === "all_caal"
  );

  const hasSelected = !!monumentSelectedRecord?.geometry?.coordinates;

  const hasPending =
    !!map &&
    !!map.getSource("monument-pick-point");

  const hasRelatedMap =
    !!map &&
    !!map.getSource("monument-related-selection");

  const rows = [];

  

  if (hasWorkspace) {
    rows.push(`
      <div class="legend-row">
        <span class="legend-symbol legend-workspace"></span>
        <span>${t("monuments_workspace_records", "Workspace records")}</span>
      </div>
    `);
  }

  if (hasNational) {
    rows.push(`
      <div class="legend-row">
        <span class="legend-symbol legend-national"></span>
        <span>${t("monuments_national_records", "National CAAL records")}</span>
      </div>
    `);
  }

  if (hasAllCaal) {
    rows.push(`
      <div class="legend-row">
        <span class="legend-symbol legend-reference"></span>
        <span>${t("other_caal_records", "Other CAAL records")}</span>
      </div>
    `);
  }

  if (hasSelected) {
    rows.push(`
      <div class="legend-row">
        <span class="legend-symbol legend-selected"></span>
        <span>${t("selected_record", "Selected record")}</span>
      </div>
    `);
  }

  if (hasPending) {
    rows.push(`
      <div class="legend-row">
        <span class="legend-symbol legend-pending"></span>
        <span>${t("new_or_moved_point", "New / moved point")}</span>
      </div>
    `);
  }

  if (hasRelatedMap) {
    rows.push(`
      <div class="legend-row">
        <span class="legend-symbol legend-related"></span>
        <span>${t("related_monument", "Related monument")}</span>
      </div>
    `);
  }

  monumentLegendEl.hidden = rows.length === 0;

  monumentLegendEl.innerHTML = `
    <div class="legend-title">${t("map_key", "Map key")}</div>
    ${rows.join("")}
  `;
}

// Older/simple export: raw MapLibre canvas only.
// Does not include DOM controls such as legend, scale bar, or attribution.
function downloadRawMapScreenshot() {
  if (!map) return;

  map.once("idle", () => {
    const canvas = map.getCanvas();
    const link = document.createElement("a");

    link.href = canvas.toDataURL("image/png");
    link.download = `caal_distribution_map_${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  });

  map.triggerRepaint();
}

// canvas export 
function getCurrentMapLegendItems() {
  const items = [];

  const hasWorkspace = monumentMapRecords.some(
    (record) => monumentDisplayScope(record) === "workspace"
  );

  const hasNational = monumentMapRecords.some(
    (record) => monumentDisplayScope(record) === "national_ref"
  );

  const hasAllCaal = monumentMapRecords.some(
    (record) => monumentDisplayScope(record) === "all_caal"
  );

  const hasSelected = !!monumentSelectedRecord?.geometry?.coordinates;

  const hasPending =
    !!map &&
    !!map.getSource("monument-pick-point");

  const hasRelatedMap =
    !!map &&
    !!map.getSource("monument-related-selection");

  if (hasWorkspace) {
    items.push({
      label: t("monuments_workspace_records", "My workspace records"),
      color: "#2e7d32",
      type: "circle"
    });
  }

  if (hasNational) {
    items.push({ label: t("monuments_national_records", "National CAAL records"),
      color: "#0f766e", type: "circle" });
  }

  if (hasAllCaal) {
    items.push({ label: t("other_caal_records", "Other CAAL records"),
      color: "#c95a4a", type: "circle" });
  }

  if (hasSelected) {
    items.push({ label: t("selected_record", "Selected record"),
      color: "#263238", type: "ring" });
  }

  if (hasPending) {
    items.push({ label: t("new_or_moved_point", "New / moved point"),
      color: "#1d4ed8", type: "circle" });
  }

  if (hasRelatedMap) {
    items.push({ label: t("related_monument", "Related monument"),
      color: "#7c3aed", type: "circle" });
  }

  return items;
}

// scale distance helper
function calculateMapScaleBar() {
  if (!map) return null;

  const canvas = map.getCanvas();
  const center = map.getCenter();
  const y = canvas.height - 80;

  const leftLngLat = map.unproject([80, y]);
  const rightLngLat = map.unproject([280, y]);

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

async function downloadCurrentMapImage(options = {}) {
  const {
    labelScope = "none",
    labelMode = "name"
  } = options;

  if (!map) return;

  const previousLiveLabelVisibility = temporarilyHideLiveMapLabelsForExport();

  await waitForMapIdle();

  try {
    const mapCanvas = map.getCanvas();

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = mapCanvas.width;
    exportCanvas.height = mapCanvas.height;

    const ctx = exportCanvas.getContext("2d");

    // Draw MapLibre canvas without the live label layer.
    ctx.drawImage(mapCanvas, 0, 0);

    const width = exportCanvas.width;
    const height = exportCanvas.height;

    const uiScale = Math.max(1, width / 1400);

    function scaled(px) {
      return Math.round(px * uiScale);
    }

    // Draw only the export labels.
    drawExportMapLabels(ctx, exportCanvas, labelScope, labelMode);

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
    const legendItems = getCurrentMapLegendItems();

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

        if (item.type === "ring") {
          ctx.beginPath();
          ctx.arc(symbolX, y, symbolRadius + scaled(1), 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0, 229, 255, 0)";
          ctx.fill();
          ctx.strokeStyle = item.color;
          ctx.lineWidth = scaled(3);
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
    const scale = calculateMapScaleBar();

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
    const link = document.createElement("a");
    link.href = exportCanvas.toDataURL("image/png");
    link.download = `caal_distribution_map_${new Date().toISOString().slice(0, 10)}.png`;
    link.click();

   } finally {
    restoreLiveMapLabelsAfterExport(previousLiveLabelVisibility);
  }
}

function getExportRecordLabel(record, mode = "name") {
  const name =
    mSummary(record, "primary_name") ||
    mSummary(record, "primary_name_english") ||
    "";

  const caalId = mIdentity(record, "caal_id") || "";

  if (mode === "caal_id") return caalId;

  if (mode === "name_caal_id") {
    if (name && caalId) return `${name} (${caalId})`;
    return name || caalId;
  }

  return name || caalId;
}

function temporarilyHideLiveMapLabelsForExport() {
  if (!map || !map.getLayer("monument-live-labels")) {
    return null;
  }

  const previousVisibility =
    map.getLayoutProperty("monument-live-labels", "visibility") || "visible";

  map.setLayoutProperty("monument-live-labels", "visibility", "none");

  return previousVisibility;
}

function restoreLiveMapLabelsAfterExport(previousVisibility) {
  if (!map || !map.getLayer("monument-live-labels") || previousVisibility === null) {
    return;
  }

  map.setLayoutProperty("monument-live-labels", "visibility", previousVisibility);
}

function waitForMapIdle() {
  return new Promise((resolve) => {
    if (!map) {
      resolve();
      return;
    }

    map.once("idle", resolve);
    map.triggerRepaint();
  });
}

function getRenderedExportPointFeatures() {
  if (!map) return [];

  const pointLayerIds = [
    "monuments-workspace-layer",
    "monuments-national-layer",
    "monuments-all-caal-layer"
  ].filter((layerId) => map.getLayer(layerId));

  if (!pointLayerIds.length) return [];

  const features = map.queryRenderedFeatures({
    layers: pointLayerIds
  });

  const seen = new Set();

  return features.filter((feature) => {
    const id = feature.properties?.id;
    const scope = feature.properties?.source_scope || "";
    const key = `${scope}:${id}`;

    if (!id || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function getRenderedExportClusterFeatures() {
  if (!map) return [];

  const clusterLayerIds = [
    "monument-national-clusters",
    "monument-all-caal-clusters"
  ].filter((layerId) => map.getLayer(layerId));

  if (!clusterLayerIds.length) return [];

  const features = map.queryRenderedFeatures({
    layers: clusterLayerIds
  });

  const seen = new Set();

  return features.filter((feature) => {
    const clusterId = feature.properties?.cluster_id;
    const source =
      feature.source ||
      feature.layer?.source ||
      "";

    const key = `${source}:${clusterId}`;

    if (clusterId === undefined || clusterId === null || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getExportLabelFeatures(labelScope = "none", labelMode = "name") {
  const labelFeatures = [];

  if (labelScope === "none") {
    return labelFeatures;
  }

  if (labelScope === "results") {
    const renderedPointFeatures = getRenderedExportPointFeatures();

    renderedPointFeatures.forEach((feature) => {
      if (!feature?.geometry?.coordinates) return;

      const clickedId = Number(feature.properties?.id);
      const clickedScope = feature.properties?.source_scope;

      const record =
        monumentMapRecords.find(
          (r) =>
            Number(r.identity?.id) === clickedId &&
            String(r.source?.scope || "") === String(clickedScope || "")
        ) ||
        monumentMapRecords.find(
          (r) => Number(r.identity?.id) === clickedId
        );

      if (!record) return;

      labelFeatures.push({
        role: "results",
        coordinates: feature.geometry.coordinates,
        label: getExportRecordLabel(record, labelMode)
      });
    });

    return labelFeatures;
  }

  if (
    (labelScope === "selected" || labelScope === "selected_related") &&
    monumentSelectedRecord?.geometry?.coordinates
  ) {
    labelFeatures.push({
      role: "selected",
      coordinates: monumentSelectedRecord.geometry.coordinates,
      label: getExportRecordLabel(monumentSelectedRecord, labelMode)
    });
  }

  if (labelScope === "selected_related" && monumentRelatedSelectionGeojson?.features?.length) {
    monumentRelatedSelectionGeojson.features.forEach((feature) => {
      if (
        feature?.geometry?.type !== "Point" ||
        feature?.properties?.role !== "related"
      ) {
        return;
      }

      labelFeatures.push({
        role: "related",
        coordinates: feature.geometry.coordinates,
        label:
          labelMode === "caal_id"
            ? feature.properties?.caal_id
            : labelMode === "name_caal_id"
              ? `${feature.properties?.label || feature.properties?.caal_id} (${feature.properties?.caal_id})`
              : feature.properties?.label || feature.properties?.caal_id
      });
    });
  }

  return labelFeatures.filter((item) => item.label);
}

function drawExportMapLabels(ctx, exportCanvas, labelScope = "none", labelMode = "name") {
  if (!map || labelScope === "none") return;

  const labels = getExportLabelFeatures(labelScope, labelMode);
  if (!labels.length) return;

  const mapCanvas = map.getCanvas();

  const cssWidth = mapCanvas.clientWidth || mapCanvas.width;
  const cssHeight = mapCanvas.clientHeight || mapCanvas.height;

  const scaleX = exportCanvas.width / cssWidth;
  const scaleY = exportCanvas.height / cssHeight;

  const uiScale = Math.max(1, exportCanvas.width / 1400);

  function scaled(px) {
    return Math.round(px * uiScale);
  }

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  const placedBoxes = [];

  labels.forEach((item, index) => {
    const projected = map.project(item.coordinates);
    const label = String(item.label || "").trim();
    if (!label) return;

    const fontSize =
      item.role === "selected"
        ? scaled(18)
        : scaled(16);

    const paddingX = scaled(8);
    const paddingY = scaled(5);
    const offsetX = scaled(12);

    const baseOffsetY =
      item.role === "selected"
        ? scaled(-16)
        : scaled(14 + (index % 3) * 6);

    ctx.font = `bold ${fontSize}px Arial, sans-serif`;

    const textW = ctx.measureText(label).width;
    const boxW = textW + paddingX * 2;
    const boxH = fontSize + paddingY * 2;

    // map.project() returns CSS pixels.
    // Export canvas uses physical canvas pixels.
    let x = projected.x * scaleX + offsetX;
    let y = projected.y * scaleY + baseOffsetY;

    let box = {
      x,
      y: y - boxH / 2,
      w: boxW,
      h: boxH
    };

    // Small, conservative collision handling.
    // This avoids exact overlaps without sending labels far away.
    const candidates = [
      [scaled(12), scaled(-16)],
      [scaled(12), scaled(18)],
      [scaled(-boxW - 12), scaled(-16)],
      [scaled(-boxW - 12), scaled(18)],
      [scaled(12), scaled(42)],
      [scaled(-boxW - 12), scaled(42)]
    ];

    for (const [candidateOffsetX, candidateOffsetY] of candidates) {
      const candidateX = projected.x * scaleX + candidateOffsetX;
      const candidateY = projected.y * scaleY + candidateOffsetY;

      const candidateBox = {
        x: candidateX,
        y: candidateY - boxH / 2,
        w: boxW,
        h: boxH
      };

      const overlaps = placedBoxes.some((existing) =>
        boxesOverlap(candidateBox, existing)
      );

      const insideCanvas =
        candidateBox.x >= 0 &&
        candidateBox.y >= 0 &&
        candidateBox.x + candidateBox.w <= exportCanvas.width &&
        candidateBox.y + candidateBox.h <= exportCanvas.height;

      if (!overlaps && insideCanvas) {
        x = candidateX;
        y = candidateY;
        box = candidateBox;
        break;
      }
    }

    placedBoxes.push(box);

    ctx.fillStyle =
      item.role === "selected"
        ? "rgba(255, 255, 255, 0.96)"
        : item.role === "related"
          ? "rgba(245, 240, 255, 0.96)"
          : "rgba(255, 255, 255, 0.94)";

    ctx.strokeStyle =
      item.role === "selected"
        ? "rgba(38, 50, 56, 0.72)"
        : item.role === "related"
          ? "rgba(80, 45, 150, 0.55)"
          : "rgba(0, 0, 0, 0.22)";

    ctx.lineWidth = scaled(1);

    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, scaled(6));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#263238";
    ctx.fillText(label, box.x + paddingX, box.y + box.h / 2);
  });

  ctx.restore();
}

function boxesOverlap(a, b) {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}

// --------------------------------------------------------
// Helpers
// --------------------------------------------------------
//map helpers
function resetMapView() {
  if (!map) return;

  const recordsWithCoords = monumentMapRecords.filter(
    (record) => Array.isArray(record?.geometry?.coordinates)
  );

  if (recordsWithCoords.length) {
    const coordinates = recordsWithCoords.map((record) => record.geometry.coordinates);

    const bounds = coordinates.reduce(
      (b, coords) => b.extend(coords),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
    );

    map.fitBounds(bounds, {
      padding: 80,
      maxZoom: 8,
      duration: 700
    });

    return;
  }

  map.easeTo({
    center: [66.9, 48.2],
    zoom: 4.2,
    duration: 700
  });
}

function formatCount(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString();
}

function updateMapStatusLine() {
  if (!mapStatusLine) return;

  const mappedCount = Array.isArray(monumentMapRecords)
    ? monumentMapRecords.filter((record) => Array.isArray(record?.geometry?.coordinates)).length
    : 0;

  const totalCount = Number(monumentTotalCount || 0);

  if (!mappedCount && !totalCount) {
    mapStatusLine.textContent = t(
      "no_matching_records_on_map",
      "No matching records are currently shown on the map."
    );
    return;
  }

  if (totalCount && mappedCount < totalCount) {
    mapStatusLine.textContent =
      t(
        "mapped_records_partial_status",
        "Showing {mapped} mapped records from {total} matching records. Zoom or pan to load records for the current map view."
      )
        .replace("{mapped}", formatCount(mappedCount))
        .replace("{total}", formatCount(totalCount));
    return;
  }

  mapStatusLine.textContent =
    t(
      "mapped_records_full_status",
      "Showing {mapped} matching records on the map."
    ).replace("{mapped}", formatCount(mappedCount));
}

async function showCurrentMonumentResultsOnMap() {
  if (!map || !Array.isArray(monumentListRecords) || monumentListRecords.length === 0) {
    return;
  }

  const coordinates = monumentListRecords
    .map((record) => record?.geometry?.coordinates)
    .filter((coords) =>
      Array.isArray(coords) &&
      coords.length === 2 &&
      Number.isFinite(Number(coords[0])) &&
      Number.isFinite(Number(coords[1]))
    );

  if (!coordinates.length) return;

  const bounds = coordinates.reduce((b, coords) => {
    return b.extend(coords);
  }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

  setMapStaleState(true, t("redrawing_map", "Redrawing map..."));

  suppressNextMapMoveReload = true;

  await new Promise((resolve) => {
    let resolved = false;

    function finish() {
      if (resolved) return;
      resolved = true;
      resolve();
    }

    map.once("moveend", finish);

    map.fitBounds(bounds, {
      padding: {
        top: 70,
        right: 70,
        bottom: 70,
        left: 70
      },
      maxZoom: 10,
      duration: 700
    });

    setTimeout(finish, 900);
  });

  try {
    await loadMonumentMapRecords();
  } catch (error) {
    console.error("Failed to reload monuments after showing results on map:", error);
  }

  renderLiveMapLabels();
  updateMapOptionsState();
  updateMapStatusLine();
}

function updateShowResultsOnMapButton() {
  if (!showResultsOnMapBtn) return;

  const hasMappableResults =
    Array.isArray(monumentListRecords) &&
    monumentListRecords.some((record) => Array.isArray(record?.geometry?.coordinates));

  showResultsOnMapBtn.disabled = !hasMappableResults;
  showResultsOnMapBtn.classList.toggle("is-disabled", !hasMappableResults);
}

function setOptionEnabled(selectEl, value, enabled) {
  if (!selectEl) return;

  const option = Array.from(selectEl.options).find((opt) => opt.value === value);
  if (option) {
    option.disabled = !enabled;
  }
}

function updateMapLabelHelpText() {
  if (!mapLabelScopeHelp || !mapLabelScopeSelect) return;

  const messages = {
    none: t("labels_are_off", "Labels are off."),
    results: t(
      "labels_apply_to_results",
      "Labels apply to records currently drawn on the map."
    ),
    selected: t(
      "labels_apply_to_selected",
      "Labels apply to the open record in the details pane."
    ),
    selected_related: t(
      "labels_apply_to_selected_related",
      "Labels apply to the open record and its related monuments currently shown on the map."
    )
  };

  mapLabelScopeHelp.textContent = messages[mapLabelScopeSelect.value] || messages.none;
}

function updateMapOptionsState() {
  const hasResults =
    Array.isArray(monumentMapRecords) &&
    monumentMapRecords.some((record) => Array.isArray(record?.geometry?.coordinates));

  const hasSelected = !!monumentSelectedRecord?.geometry?.coordinates;
  const selectedHasRelatedIds = selectedRecordHasRelatedIds();
  const hasRelatedOverlay = relatedOverlayExists();

  setOptionEnabled(mapLabelScopeSelect, "results", hasResults);
  setOptionEnabled(mapLabelScopeSelect, "selected", hasSelected);
  setOptionEnabled(mapLabelScopeSelect, "selected_related", hasSelected && hasRelatedOverlay);

  if (showRelatedFromMapOptionsBtn) {
    showRelatedFromMapOptionsBtn.disabled = !selectedHasRelatedIds;
    showRelatedFromMapOptionsBtn.classList.toggle("is-disabled", !selectedHasRelatedIds);
  }

  if (relationshipMapOptions) {
    relationshipMapOptions.hidden = !hasRelatedOverlay;
  }

  if (hasRelatedOverlay) {
    if (showRelatedPointsCheckbox && showRelatedPointsCheckbox.dataset.userChanged !== "true") {
      showRelatedPointsCheckbox.checked = true;
    }

    if (showRelationshipLinesCheckbox && showRelationshipLinesCheckbox.dataset.userChanged !== "true") {
      showRelationshipLinesCheckbox.checked = true;
    }
  }

  if (mapLabelScopeSelect) {
    if (mapLabelScopeSelect.value === "results" && !hasResults) {
      mapLabelScopeSelect.value = "none";
    }

    if (mapLabelScopeSelect.value === "selected" && !hasSelected) {
      mapLabelScopeSelect.value = "none";
    }

    if (
      mapLabelScopeSelect.value === "selected_related" &&
      !(hasSelected && hasRelatedOverlay)
    ) {
      mapLabelScopeSelect.value = hasSelected ? "selected" : "none";
    }
  }

  updateMapLabelHelpText();
}

function setRelationshipLayerVisibility() {
  if (!map) return;

  const showPoints = showRelatedPointsCheckbox?.checked !== false;
  const showLines = showRelationshipLinesCheckbox?.checked !== false;

  if (map.getLayer("monument-related-points")) {
    map.setLayoutProperty(
      "monument-related-points",
      "visibility",
      showPoints ? "visible" : "none"
    );
  }

  [
    "monument-related-lines-halo",
    "monument-related-lines"
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        "visibility",
        showLines ? "visible" : "none"
      );
    }
  });
}

function selectedRecordHasRelatedIds(record = monumentSelectedRecord) {
  if (!record) return false;

  const relatedIds = [
    ...parseRelatedIds(mRaw(record, "Monument is part of")),
    ...parseRelatedIds(mRaw(record, "Monument contains")),
    ...parseRelatedIds(mRaw(record, "Monument is associated with"))
  ];

  return relatedIds.length > 0;
}

function relatedOverlayExists() {
  return !!monumentSelectedRecord?.geometry?.coordinates &&
    !!monumentRelatedSelectionGeojson?.features?.some(
      (feature) =>
        feature?.geometry?.type === "Point" &&
        feature?.properties?.role === "related"
    );
}

function getLiveMapLabelExpression() {
  const mode = mapLabelModeSelect?.value || "name";

  if (mode === "caal_id") {
    return ["coalesce", ["get", "caal_id"], ""];
  }

  if (mode === "name_caal_id") {
    return [
      "case",
      ["all", ["has", "label"], ["has", "caal_id"]],
      ["concat", ["get", "label"], " (", ["get", "caal_id"], ")"],
      ["coalesce", ["get", "label"], ["get", "caal_id"], ""]
    ];
  }

  return ["coalesce", ["get", "label"], ["get", "caal_id"], ""];
}

function renderLiveMapLabels() {
  if (!map || !mapLoaded) return;

  if (map.getLayer("monument-live-labels")) {
    map.removeLayer("monument-live-labels");
  }

  const scope = mapLabelScopeSelect?.value || "none";

  if (scope === "none") {
    return;
  }

  let sourceId = null;
  let filter = null;

  if (scope === "results") {
    const hasResultsSource = refreshCurrentResultsLabelSource();
    if (!hasResultsSource) return;

    sourceId = "monument-results-labels";
    filter = ["==", ["geometry-type"], "Point"];
  } else if (scope === "selected_related") {
    if (!map.getSource("monument-related-selection")) return;

    sourceId = "monument-related-selection";
    filter = [
      "all",
      ["==", ["geometry-type"], "Point"],
      ["in", ["get", "role"], ["literal", ["selected", "related"]]]
    ];
  } else if (scope === "selected") {
    if (!map.getSource("monument-selected")) return;

    sourceId = "monument-selected";
    filter = ["==", ["geometry-type"], "Point"];
  } else {
    return;
  }

  map.addLayer({
    id: "monument-live-labels",
    type: "symbol",
    source: sourceId,
    filter,
    layout: {
      "text-field": getLiveMapLabelExpression(),
      "text-size": [
        "case",
        ["==", ["get", "role"], "selected"],
        13,
        ["==", ["get", "role"], "related"],
        11,
        11
      ],
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-anchor": "left",
      "text-offset": [0.9, -0.8],
      "text-allow-overlap": false,
      "text-ignore-placement": false
    },
    paint: {
      "text-color": "#1f2933",
      "text-halo-color": "rgba(255,255,255,0.88)",
      "text-halo-width": 1.2
    }
  });

  bringMonumentOverlaysToFront();

  if (map.getLayer("monument-live-labels")) {
    map.moveLayer("monument-live-labels");
  }
}

function monumentRecordToLiveLabelFeature(record) {
  if (!record?.geometry?.coordinates) return null;

  return {
    type: "Feature",
    geometry: record.geometry,
    properties: {
      role: "results",
      id: record.identity?.id,
      caal_id: record.identity?.caal_id || "",
      label:
        mSummary(record, "primary_name") ||
        mSummary(record, "primary_name_english") ||
        record.identity?.caal_id ||
        ""
    }
  };
}

function getCurrentResultsLabelGeojson() {
  return {
    type: "FeatureCollection",
    features: monumentMapRecords
      .map(monumentRecordToLiveLabelFeature)
      .filter(Boolean)
  };
}

function refreshCurrentResultsLabelSource() {
  if (!map || !mapLoaded) return false;

  const geojson = getCurrentResultsLabelGeojson();

  if (!geojson.features.length) {
    if (map.getSource("monument-results-labels")) {
      map.getSource("monument-results-labels").setData(geojson);
    }

    return false;
  }

  const existingSource = map.getSource("monument-results-labels");

  if (existingSource && typeof existingSource.setData === "function") {
    existingSource.setData(geojson);
  } else {
    map.addSource("monument-results-labels", {
      type: "geojson",
      data: geojson
    });
  }

  return true;
}

//results
function monumentResultTitle(record) {
  return (
    mSummary(record, "primary_name") ||
    mSummary(record, "primary_name_english") ||
    mRaw(record, "Other Names") ||
    ""
  );
}

function updateSelectedResultCard() {
  if (!resultsList) return;

  const selectedId = Number(monumentSelectedRecord?.identity?.id);

  Array.from(resultsList.querySelectorAll(".result-card")).forEach((resultCard) => {
    const idx = Number(resultCard.dataset.resultIndex);
    const record = monumentListRecords[idx];

    const isSelected =
      Number(record?.identity?.id) === selectedId;

    resultCard.classList.toggle("is-selected", isSelected);
  });
}

const monumentDetailPane = document.getElementById("monumentDetailPane");

function monumentSyncModeVisualState() {
  if (!monumentDetailPane) return;
  monumentDetailPane.classList.toggle("monument-editing", monumentIsEditMode);
}

function setMonumentsLoading(isLoading, message = "") {
  monumentsIsLoading = isLoading;

  const indicator = document.getElementById("monumentsLoadingIndicator");
  const browsePane = document.getElementById("browse-pane");
  const mapPane = document.getElementById("map-pane");
  const detailPane = document.getElementById("detail-pane");

  console.log("setMonumentsLoading:", isLoading, message);

  if (indicator) {
    indicator.hidden = !isLoading;
    indicator.innerHTML = isLoading
      ? `<span class="spinner"></span><span>${message || t("loading", "Loading...")}</span>`
      : "";
  }

  [browsePane, mapPane, detailPane].forEach((el) => {
    if (el) {
      if (isLoading) {
        el.classList.add("is-loading");
      } else {
        el.classList.remove("is-loading");
      }
    }
  });
}

function setMonumentResultsCountText(text) {
  if (resultsCount) {
    resultsCount.textContent = text;
  }

  if (filterResultsCount) {
    filterResultsCount.textContent = text;
  }
}

function setResultsCountLoading(message = null) {
  const label = message || t("searching", "Searching...");

  if (resultsCount) {
    resultsCount.innerHTML = `<span class="mini-spinner"></span>${label}`;
  }

  if (filterResultsCount) {
    filterResultsCount.innerHTML = `<span class="mini-spinner"></span>${label}`;
  }
}

function setMapStaleState(isStale, message = null) {
  monumentMapIsStale = isStale;

  const mapPane = document.getElementById("map-pane");
  if (!mapPane) return;

  mapPane.classList.toggle("map-is-stale", isStale);

  let notice = document.getElementById("mapStatusNotice");

  if (!notice) {
    notice = document.createElement("div");
    notice.id = "mapStatusNotice";
    notice.className = "map-status-notice";
    mapPane.appendChild(notice);
  }

  notice.hidden = !isStale;
  notice.innerHTML = isStale
    ? `<span class="mini-spinner"></span>${message || t("redrawing_map", "Redrawing map...")}`
    : "";
}

function scheduleMonumentSearchAndMapRedraw() {
  if (monumentFilterDebounceTimer) {
    clearTimeout(monumentFilterDebounceTimer);
  }

  setResultsCountLoading();
  setMapStaleState(
    true,
    t("map_will_update_after_search", "Map will update after search...")
  );

  monumentFilterDebounceTimer = setTimeout(async () => {
    await applyMonumentFilters({ includeMap: true, listFirst: true });
  }, 1000);
}

function mLabel(name, fallback = null) {
  return monumentLabels[name] || fallback || name;
}

function mSafeValue(value) {
  if (value === null || value === undefined || value === "") {
    return `<span class="empty-value">${mLabel("Not recorded", "Not recorded")}</span>`;
  }
  return value;
}

function mDateOnly(value) {
  if (!value) return value;

  const text = String(value).trim();

  // ISO-like timestamp: 2026-04-30T13:28:37.313Z
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.slice(0, 10);
  }

  // Space-separated timestamp: 2026-04-30 13:28:37
  if (/^\d{4}-\d{2}-\d{2}\s/.test(text)) {
    return text.slice(0, 10);
  }

  // Slash date with time: 13/01/2021 11:28
  if (/^\d{1,2}\/\d{1,2}\/\d{4}\s/.test(text)) {
    return text.split(/\s+/)[0];
  }

  return text;
}

function mHasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function getMonumentMasterId(record) {
  return String(mRaw(record, "MasterID") || "").trim();
}

function monumentHasMasterId(record) {
  return getMonumentMasterId(record).length > 0;
}

function mNormalizeSearchText(value) {
  if (!mHasValue(value)) return "";
  return String(value).toLowerCase();
}

function mUniqueSorted(values) {
  return Array.from(new Set(values.filter(mHasValue))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function mSelectedValues(selectEl) {
  if (!selectEl) return [];
  return Array.from(selectEl.selectedOptions).map((option) => option.value);
}

function mPopulateMultiSelect(selectEl, items) {
  if (!selectEl) return;
  selectEl.innerHTML = "";

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value ?? "";
    option.textContent = item.label ?? item.value ?? "";
    selectEl.appendChild(option);
  });
}

function mInputId(fieldName) {
  return "mon_fld_" + fieldName.replace(/[^a-zA-Z0-9]+/g, "_");
}

function mGetInputValue(fieldName) {
  const el = document.getElementById(mInputId(fieldName));
  return el ? el.value : "";
}

function mRaw(record, fieldName) {
  return record?.raw?.[fieldName] ?? null;
}

function mSummary(record, fieldName) {
  return record?.summary?.[fieldName] ?? null;
}

function mIdentity(record, fieldName) {
  return record?.identity?.[fieldName] ?? null;
}

function mGeometry(record) {
  return record?.geometry ?? null;
}

function mDisplayLongitude(record) {
  const value =
    mSummary(record, "longitude") ??
    mRaw(record, "Longitude") ??
    record?.geometry?.coordinates?.[0] ??
    null;

  return value;
}

function mDisplayLatitude(record) {
  const value =
    mSummary(record, "latitude") ??
    mRaw(record, "Latitude") ??
    record?.geometry?.coordinates?.[1] ??
    null;

  return value;
}

function mLegacyMultiValues(record, fieldBase, count) {
  const values = [];

  for (let i = 1; i <= count; i += 1) {
    const value = mRaw(record, `${fieldBase}${i}`);
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      values.push(String(value).trim());
    }
  }

  return values;
}

function mLegacyMultiPayload(payload, fieldBase, count, values) {
  const cleanValues = Array.isArray(values)
    ? values.map((value) => String(value).trim()).filter(Boolean)
    : [];

  for (let i = 1; i <= count; i += 1) {
    payload[`${fieldBase}${i}`] = cleanValues[i - 1] || "";
  }

  return payload;
}

function mRenderLegacyMultiSelect({
  fieldBase,
  count,
  label,
  lookupName,
  record,
  fullWidth = true
}) {
  const inputId = `monument_multi_${fieldBase.replace(/[^a-zA-Z0-9]+/g, "_")}`;
  const chipsId = `${inputId}_chips`;

  const selectedValues = mLegacyMultiValues(record, fieldBase, count).map(String);

  const options = Array.isArray(monumentLookups?.[lookupName])
    ? monumentLookups[lookupName]
    : [];

  const optionsHtml = options
    .map((item) => {
      const value = String(item.value ?? "");
      const selected = selectedValues.includes(value) ? "selected" : "";

      return `<option value="${value}" ${selected}>${item.label ?? value}</option>`;
    })
    .join("");

  return `
    <div class="detail-item${fullWidth ? " full-width" : ""} monument-edit-chip-multiselect">
      <label class="detail-label" for="${inputId}">${label}</label>

      <div
        class="selected-filter-chips monument-edit-selected-chips"
        id="${chipsId}"
      ></div>

      <select
        id="${inputId}"
        class="form-control chip-multiselect monument-edit-multiselect"
        multiple
        data-chip-target="${chipsId}"
        data-field-base="${fieldBase}"
        data-field-count="${count}"
      >
        ${optionsHtml}
      </select>

      <p class="filter-help">
        ${t("filter_click_toggle_help", "Click values to select or deselect. Selected values appear above.")}
        ${" "}
        ${t("maximum_values_help", "Maximum: {count}.").replace("{count}", count)}
      </p>
    </div>
  `;
}

function mRenderEditMultiSelectChips(selectEl) {
  if (!selectEl) return;

  const chipsId = selectEl.dataset.chipTarget;
  const chipsEl = chipsId ? document.getElementById(chipsId) : null;

  if (!chipsEl) return;

  const selected = Array.from(selectEl.options)
    .filter((option) => option.selected)
    .map((option) => ({
      value: option.value,
      label: option.textContent || option.value
    }));

  chipsEl.innerHTML = "";

  if (!selected.length) {
    const empty = document.createElement("span");
    empty.className = "filter-chip-empty";
    empty.textContent = t("no_values_selected", "No values selected");
    chipsEl.appendChild(empty);
    return;
  }

  selected.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filter-chip";
    chip.dataset.value = item.value;
    chip.innerHTML = `
      <span>${item.label}</span>
      <span class="filter-chip-remove" aria-hidden="true">×</span>
    `;

    chip.addEventListener("click", () => {
      const option = Array.from(selectEl.options).find(
        (opt) => opt.value === item.value
      );

      if (option) {
        option.selected = false;
      }

      monumentIsDirty = true;
      mRenderEditMultiSelectChips(selectEl);

      selectEl.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    });

    chipsEl.appendChild(chip);
  });
}

function mSelectedOptionCount(selectEl) {
  if (!selectEl) return 0;

  return Array.from(selectEl.options).filter((option) => option.selected).length;
}

function mLegacyMultiLimitMessage(fieldBase, count) {
  const labels = {
    "Monument Type": mLabel("Monument Types", "Monument Types"),
    "Religion": mLabel("Religions", "Religions"),
    "Cultural Period": mLabel("Cultural Periods", "Cultural Periods")
  };

  const label = labels[fieldBase] || fieldBase;

  return t(
    "legacy_multi_select_limit",
    "{label} can store a maximum of {count} values."
  )
    .replace("{label}", label)
    .replace("{count}", count);
}

function syncLegacyMultiSelectIntoRecord(selectEl) {
  if (!selectEl || !monumentSelectedRecord?.raw) return;

  const fieldBase = selectEl.dataset.fieldBase;
  const count = Number(selectEl.dataset.fieldCount || 0);

  if (!fieldBase || !count) return;

  const values = Array.from(selectEl.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean);

  for (let i = 1; i <= count; i += 1) {
    monumentSelectedRecord.raw[`${fieldBase}${i}`] = values[i - 1] || "";
  }

  if (fieldBase === "Cultural Period") {
    recalculateMonumentDates(monumentSelectedRecord);
  }
}

function mWireEditMultiSelects() {
  if (!recordDetails) return;

  const selects = Array.from(
    recordDetails.querySelectorAll("select.monument-edit-multiselect")
  );

  selects.forEach((selectEl) => {
    if (selectEl.dataset.editChipWired === "true") {
      mRenderEditMultiSelectChips(selectEl);
      return;
    }

    selectEl.addEventListener("mousedown", (event) => {
      const option = event.target;

      if (!option || option.tagName !== "OPTION") return;

      event.preventDefault();

      const maxCount = Number(selectEl.dataset.fieldCount || 0);
      const isSelecting = !option.selected;
      const selectedCount = mSelectedOptionCount(selectEl);

      if (isSelecting && maxCount && selectedCount >= maxCount) {
        alert(
          mLegacyMultiLimitMessage(
            selectEl.dataset.fieldBase,
            maxCount
          )
        );
        return;
      }

      option.selected = !option.selected;
      monumentIsDirty = true;

      syncLegacyMultiSelectIntoRecord(selectEl);
      mRenderEditMultiSelectChips(selectEl);

      selectEl.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    });

    selectEl.addEventListener("change", () => {
      const maxCount = Number(selectEl.dataset.fieldCount || 0);
      const selectedOptions = Array.from(selectEl.options).filter(
        (option) => option.selected
      );

      if (maxCount && selectedOptions.length > maxCount) {
        selectedOptions.slice(maxCount).forEach((option) => {
          option.selected = false;
        });

        alert(
          mLegacyMultiLimitMessage(
            selectEl.dataset.fieldBase,
            maxCount
          )
        );
      }

      syncLegacyMultiSelectIntoRecord(selectEl);
      mRenderEditMultiSelectChips(selectEl);
    });

    selectEl.dataset.editChipWired = "true";
    mRenderEditMultiSelectChips(selectEl);
  });
}

function mLookupOptions(lookupName) {
  return Array.isArray(monumentLookups?.[lookupName]) ? monumentLookups[lookupName] : [];
}

function mLookupLabel(lookupName, value) {
  const options = mLookupOptions(lookupName);
  const match = options.find((item) => String(item.value ?? "") === String(value ?? ""));
  return match ? (match.label ?? match.value ?? value) : value;
}

function mRecordSearchText(record) {
  const fields = [
    mIdentity(record, "caal_id"),
    mSummary(record, "primary_name"),
    mSummary(record, "primary_name_english"),
    mSummary(record, "country"),
    mSummary(record, "region"),
    mSummary(record, "classification"),
    mSummary(record, "designation"),
    mSummary(record, "monument_type1"),
    mSummary(record, "cultural_period1"),
    mSummary(record, "religion1"),
    mRaw(record, "Other Names"),
    mRaw(record, "Internal Reference"),
    mRaw(record, "External Reference"),
    mRaw(record, "Monument Passport"),
    mRaw(record, "Descriptive Date"),
    mRaw(record, "Primary Description"),
    mRaw(record, "Primary Description (English)"),
    mRaw(record, "Additional Notes"),
    mRaw(record, "Location Notes"),
    mRaw(record, "Primary Address"),
    mRaw(record, "World Heritage Site Name"),
    mRaw(record, "Monument is part of"),
    mRaw(record, "Monument contains"),
    mRaw(record, "Monument is associated with"),
    ...(record?.filter_values?.monument_types || []),
    ...(record?.filter_values?.religions || []),
    ...(record?.filter_values?.cultural_periods || [])
  ];

  return fields.map(mNormalizeSearchText).join(" ");
}

function mBuildSavePayload() {
  const payload = {
    "Primary Name": mGetInputValue("Primary Name"),
    "Primary Name (English)": mGetInputValue("Primary Name (English)"),
    "Other Names": mGetInputValue("Other Names"),
    "Country": mGetInputValue("Country"),
    "Region": mGetInputValue("Region"),
    "Classification": mGetInputValue("Classification"),
    "Internal Reference": mGetInputValue("Internal Reference"),
    "External Reference": mGetInputValue("External Reference"),
    "Monument Passport": mGetInputValue("Monument Passport"),
    "Monument Type1": mGetInputValue("Monument Type1"),
    "Monument Type2": mGetInputValue("Monument Type2"),
    "Monument Type3": mGetInputValue("Monument Type3"),
    "Monument Type4": mGetInputValue("Monument Type4"),
    "Monument Type5": mGetInputValue("Monument Type5"),
    "Monument Type6": mGetInputValue("Monument Type6"),
    "Religion1": mGetInputValue("Religion1"),
    "Religion2": mGetInputValue("Religion2"),
    "Religion3": mGetInputValue("Religion3"),
    "Descriptive Date": mGetInputValue("Descriptive Date"),
    "Cultural Period1": mGetInputValue("Cultural Period1"),
    "Cultural Period2": mGetInputValue("Cultural Period2"),
    "Cultural Period3": mGetInputValue("Cultural Period3"),
    "Cultural Period4": mGetInputValue("Cultural Period4"),
    "Cultural Period5": mGetInputValue("Cultural Period5"),
    "Cultural Period6": mGetInputValue("Cultural Period6"),
    "Start Date": mGetInputValue("Start Date"),
    "End Date": mGetInputValue("End Date"),
    "Primary Description": mGetInputValue("Primary Description"),
    "Primary Description (English)": mGetInputValue("Primary Description (English)"),
    "Additional Notes": mGetInputValue("Additional Notes"),
    "Longitude": mGetInputValue("Longitude"),
    "Latitude": mGetInputValue("Latitude"),
    "Altitude": mGetInputValue("Altitude"),
    "Location Confidence": mGetInputValue("Location Confidence"),
    "Location Notes": mGetInputValue("Location Notes"),
    "Primary Address": mGetInputValue("Primary Address"),
    "Administrative Subdivision Name1": mGetInputValue("Administrative Subdivision Name1"),
    "Administrative Subdivision Type1": mGetInputValue("Administrative Subdivision Type1"),
    "Administrative Subdivision Name2": mGetInputValue("Administrative Subdivision Name2"),
    "Administrative Subdivision Type2": mGetInputValue("Administrative Subdivision Type2"),
    "Administrative Subdivision Name3": mGetInputValue("Administrative Subdivision Name3"),
    "Administrative Subdivision Type3": mGetInputValue("Administrative Subdivision Type3"),
    "Administrative Subdivision Name4": mGetInputValue("Administrative Subdivision Name4"),
    "Administrative Subdivision Type4": mGetInputValue("Administrative Subdivision Type4"),
    "Measurement Value1": mGetInputValue("Measurement Value1"),
    "Measurement Unit1": mGetInputValue("Measurement Unit1"),
    "Measurement Type1": mGetInputValue("Measurement Type1"),
    "Measurement Value2": mGetInputValue("Measurement Value2"),
    "Measurement Unit2": mGetInputValue("Measurement Unit2"),
    "Measurement Type2": mGetInputValue("Measurement Type2"),
    "Measurement Value3": mGetInputValue("Measurement Value3"),
    "Measurement Unit3": mGetInputValue("Measurement Unit3"),
    "Measurement Type3": mGetInputValue("Measurement Type3"),
    "Measurement Value4": mGetInputValue("Measurement Value4"),
    "Measurement Unit4": mGetInputValue("Measurement Unit4"),
    "Measurement Type4": mGetInputValue("Measurement Type4"),
    "Designation": mGetInputValue("Designation"),
    "World Heritage Site Name": mGetInputValue("World Heritage Site Name"),
    "Monument is part of": normaliseRelatedIdList(mGetInputValue("Monument is part of")),
    "Monument contains": normaliseRelatedIdList(mGetInputValue("Monument contains")),
    "Monument is associated with": normaliseRelatedIdList(mGetInputValue("Monument is associated with"))
  };

  const monumentTypeSelect = document.querySelector(
    'select.monument-edit-multiselect[data-field-base="Monument Type"]'
  );

  const religionSelect = document.querySelector(
    'select.monument-edit-multiselect[data-field-base="Religion"]'
  );

  const culturalPeriodSelect = document.querySelector(
    'select.monument-edit-multiselect[data-field-base="Cultural Period"]'
  );

  mLegacyMultiPayload(
    payload,
    "Monument Type",
    6,
    monumentTypeSelect
      ? Array.from(monumentTypeSelect.selectedOptions).map((option) => option.value)
      : []
  );

  mLegacyMultiPayload(
    payload,
    "Religion",
    3,
    religionSelect
      ? Array.from(religionSelect.selectedOptions).map((option) => option.value)
      : []
  );

  mLegacyMultiPayload(
    payload,
    "Cultural Period",
    6,
    culturalPeriodSelect
      ? Array.from(culturalPeriodSelect.selectedOptions).map((option) => option.value)
      : []
  );

  if (monumentUserCanEditMasterId()) {
    payload["MasterID"] = normaliseRelatedIdList(mGetInputValue("MasterID"));
  }

  return payload;
}

function validateLegacyMultiSelectLimits() {
  const selects = Array.from(
    document.querySelectorAll("select.monument-edit-multiselect")
  );

  const errors = [];

  selects.forEach((selectEl) => {
    const maxCount = Number(selectEl.dataset.fieldCount || 0);
    if (!maxCount) return;

    const selectedCount = mSelectedOptionCount(selectEl);

    if (selectedCount > maxCount) {
      errors.push(
        mLegacyMultiLimitMessage(
          selectEl.dataset.fieldBase,
          maxCount
        )
      );
    }
  });

  if (errors.length) {
    alert(Array.from(new Set(errors)).join("\n"));
    return false;
  }

  return true;
}

function mSectionHasValues(values) {
  return values.some((value) => mHasValue(value));
}

function mRenderDetailItem(label, value, fullWidth = false) {
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <span class="detail-label">${label}</span>
      <div class="detail-value">${mSafeValue(value)}</div>
    </div>
  `;
}

function mRenderGroupBlock(title, innerHtml, hasValues = true) {
  const content = hasValues
    ? innerHtml
    : `<div class="section-empty">${mLabel("No populated fields in this section.", "No populated fields in this section.")}</div>`;

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

function mRenderTextInput(fieldName, label, value, fullWidth = false) {
  const inputId = mInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <input type="text" id="${inputId}" class="form-control" value="${value ?? ""}">
    </div>
  `;
}

function mRenderTextarea(fieldName, label, value, fullWidth = true) {
  const inputId = mInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <textarea id="${inputId}" class="form-control" rows="4">${value ?? ""}</textarea>
    </div>
  `;
}

function mRenderNumberInput(fieldName, label, value, step = "any", fullWidth = false) {
  const inputId = mInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";
  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <input type="number" id="${inputId}" class="form-control" step="${step}" value="${value ?? ""}">
    </div>
  `;
}

function mRenderReadOnlyItem(label, value, fullWidth = false) {
  return mRenderDetailItem(label, value, fullWidth);
}

function mRenderSelect(fieldName, label, lookupName, currentValue, fullWidth = false) {
  const inputId = mInputId(fieldName);
  const fullWidthClass = fullWidth ? " full-width" : "";

  const optionsHtml = mLookupOptions(lookupName)
    .map((item) => {
      const value = item.value ?? "";
      const selected = String(value) === String(currentValue ?? "") ? "selected" : "";
      return `<option value="${value}" ${selected}>${item.label ?? value}</option>`;
    })
    .join("");

  return `
    <div class="detail-item${fullWidthClass}">
      <label class="detail-label" for="${inputId}">${label}</label>
      <select id="${inputId}" class="form-control">
        <option value=""></option>
        ${optionsHtml}
      </select>
    </div>
  `;
}

function mRenderMeasurementDisplaySet(index, record) {
  const value = mRaw(record, `Measurement Value${index}`);
  const unit = mRaw(record, `Measurement Unit${index}`);
  const type = mRaw(record, `Measurement Type${index}`);

  const hasAnyValue =
    value !== null && value !== undefined && value !== "" ||
    unit !== null && unit !== undefined && unit !== "" ||
    type !== null && type !== undefined && type !== "";

  if (!hasAnyValue) {
    return "";
  }

  return `
    <div class="measurement-row measurement-row-readonly">
      <div class="measurement-row-title">
        ${mLabel(`Measurement ${index}`, `Measurement ${index}`)}
      </div>

      <div class="measurement-row-fields">
        <div class="measurement-field">
          <span class="detail-label">${mLabel("Value", "Value")}</span>
          <div class="detail-value">${mSafeValue(value)}</div>
        </div>

        <div class="measurement-field">
          <span class="detail-label">${mLabel("Unit", "Unit")}</span>
          <div class="detail-value">${mSafeValue(unit)}</div>
        </div>

        <div class="measurement-field">
          <span class="detail-label">${mLabel("Type", "Type")}</span>
          <div class="detail-value">${mSafeValue(type)}</div>
        </div>
      </div>
    </div>
  `;
}

function monumentConfirmLoseChanges() {
  if (!monumentIsEditMode || !monumentIsDirty) {
    return true;
  }

  return window.confirm(
    mLabel(
      "Unsaved changes prompt",
      "You have unsaved changes. Do you want to discard them?"
    )
  );
}

// switches add/edit with save/cancel
function updateMonumentActionBar() {
  const record = monumentSelectedRecord;

  const hasSelectedRecord = !!record;

  const canEditThisRecord = canEditMonumentRecord(record);

  if (addMonumentBtn) {
    addMonumentBtn.hidden = monumentIsEditMode;
  }

  if (monumentEditBtn) {
    monumentEditBtn.hidden = monumentIsEditMode || !hasSelectedRecord;
    monumentEditBtn.disabled = !canEditThisRecord;
    monumentEditBtn.title = canEditThisRecord ? "" : mLabel("Read only", "Read only");
    monumentEditBtn.classList.toggle("is-disabled", !canEditThisRecord);
  }

  if (monumentSaveBtn) {
    monumentSaveBtn.hidden = !monumentIsEditMode;
  }

  if (monumentCancelEditBtn) {
    monumentCancelEditBtn.hidden = !monumentIsEditMode;
  }

  const canDelete =
    monumentIsEditMode &&
    hasSelectedRecord &&
    canEditThisRecord &&
    monumentSelectedRecord?.source?.scope === "workspace" &&
    monumentSelectedRecord?.identity?.id;

  if (monumentDeleteBtn) {
    monumentDeleteBtn.hidden = !canDelete;
  }
}
function canEditMonumentRecord(record) {
  if (!record) return false;

  const currentAppUserId = window.appSession?.user?.user_id ?? null;
  const recordAppUserId = record?.raw?.created_by_app_user_id ?? null;

  const isOwner =
    currentAppUserId !== null &&
    recordAppUserId !== null &&
    Number(currentAppUserId) === Number(recordAppUserId);

  const isSuperUser =
    window.appSession?.permissions?.can_edit_caal === true;

  const isWorkspaceRecord = record?.source?.scope === "workspace";
  const isCaalRecord =
    record?.source?.scope === "national_ref" ||
    record?.source?.scope === "all_caal";

  // Superusers can edit MasterID-linked records.
  if (isSuperUser) {
    return isWorkspaceRecord || isCaalRecord;
  }

  // Normal users cannot edit records assigned to a MasterID.
  if (monumentHasMasterId(record)) {
    return false;
  }

  return isWorkspaceRecord && isOwner;
}

function monumentUserCanEditMasterId() {
  return window.appSession?.permissions?.can_edit_caal === true;
}

function getMonumentEnabledScopes() {
  const scopes = [];

  if (showWorkspaceRecords?.checked) scopes.push("workspace");
  if (showNationalRecords?.checked) scopes.push("national_ref");
  if (showAllCaalRecords?.checked) scopes.push("all_caal");

  return scopes;
}

function monumentScopeLabel(scope) {
  switch (scope) {
    case "workspace":
      return mLabel("Workspace", "Workspace");
    case "national_ref":
      return mLabel("National CAAL", "National CAAL");
    case "all_caal":
      return mLabel("All CAAL", "All CAAL");
    default:
      return scope || mLabel("Unknown", "Unknown");
  }
}

function monumentDisplayScope(record) {
  const rawScope = record?.source?.scope || "unknown";

  const nationalChecked = showNationalRecords?.checked === true;
  const allCaalChecked = showAllCaalRecords?.checked === true;

  // When All CAAL is on but National CAAL is off, suppress the national subset styling.
  // This keeps the map and legend aligned with the visible checkbox state.
  if (
    rawScope === "national_ref" &&
    allCaalChecked &&
    !nationalChecked
  ) {
    return "all_caal";
  }

  return rawScope;
}

function getMonumentCurrentFilters() {
  return {
    text: siteSearch ? siteSearch.value.trim() : "",
    caalId: filterCaalId ? filterCaalId.value.trim() : "",
    monumentTypes: mSelectedValues(filterMonumentType),
    classifications: mSelectedValues(filterClassification),
    designations: mSelectedValues(filterDesignation),
    religions: mSelectedValues(filterReligion),
    culturalPeriods: mSelectedValues(filterCulturalPeriod),
    countries: mSelectedValues(filterCountry)
  };
}

function buildMonumentQueryParams({ includePaging = true } = {}) {
  const scopes = getMonumentEnabledScopes();
  const filters = getMonumentCurrentFilters();

  const params = new URLSearchParams();

  if (scopes.length) {
    params.set("scopes", scopes.join(","));
  }

  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  params.set("lang", lang);

  if (filters.text) params.set("text", filters.text);
  if (filters.caalId) params.set("caalId", filters.caalId);
  if (filters.monumentTypes.length) params.set("monumentTypes", filters.monumentTypes.join(","));
  if (filters.classifications.length) params.set("classifications", filters.classifications.join(","));
  if (filters.designations.length) params.set("designations", filters.designations.join(","));
  if (filters.religions.length) params.set("religions", filters.religions.join(","));
  if (filters.culturalPeriods.length) params.set("culturalPeriods", filters.culturalPeriods.join(","));
  if (filters.countries.length) params.set("countries", filters.countries.join(","));

  if (includePaging) {
    params.set("limit", String(monumentPageLimit));
    params.set("offset", String(monumentPageOffset));
  }

  return params;
}


// determine dates
let culturalPeriodLookup = {};

function buildCulturalPeriodLookup() {
  culturalPeriodLookup = {};

  (monumentLookups.cultural_period || []).forEach((item) => {
    const key = item.value ?? item.raw?.canonical_value;
    if (!key) return;

    culturalPeriodLookup[key] = {
      date_from: item.raw?.date_from,
      date_to: item.raw?.date_to
    };
  });
}

function recalculateMonumentDates(record) {
  if (!culturalPeriodLookup || !Object.keys(culturalPeriodLookup).length) return;
  if (!record?.raw) return;

  const cpFields = [
    "Cultural Period1",
    "Cultural Period2",
    "Cultural Period3",
    "Cultural Period4",
    "Cultural Period5",
    "Cultural Period6"
  ];

  const starts = [];
  const ends = [];

  cpFields.forEach((field) => {
    const cpValue = String(mRaw(record, field) || "").trim();
    if (!cpValue) return;

    const row = culturalPeriodLookup[cpValue];
    if (!row) return;

    const from = Number(row.date_from);
    const to = Number(row.date_to);

    if (!Number.isNaN(from)) starts.push(from);
    if (!Number.isNaN(to)) ends.push(to);
  });

  record.raw["Start Date"] = starts.length ? Math.min(...starts) : null;
  record.raw["End Date"] = ends.length ? Math.max(...ends) : null;

  // update display values in edit view
  const startInput = document.getElementById(mInputId("Start Date"));
  const endInput = document.getElementById(mInputId("End Date"));

  if (startInput) startInput.value = record.raw["Start Date"];
  if (endInput) endInput.value = record.raw["End Date"];
}

function wireMonumentCulturalPeriodDateRecalc() {
  [
    "Cultural Period1",
    "Cultural Period2",
    "Cultural Period3",
    "Cultural Period4",
    "Cultural Period5",
    "Cultural Period6"
  ].forEach((fieldName) => {
    const select = document.getElementById(mInputId(fieldName));
    if (!select) return;

    select.addEventListener("change", (e) => {
      if (!monumentSelectedRecord?.raw) return;
      monumentSelectedRecord.raw[fieldName] = e.target.value || "";
      recalculateMonumentDates(monumentSelectedRecord);
    });
  });
}

// super user cache button
// -------------------------------------
const refreshMonumentsCacheBtn = document.getElementById("refreshMonumentsCacheBtn");

if (window.appSession?.permissions?.can_edit_caal && refreshMonumentsCacheBtn) {
  refreshMonumentsCacheBtn.hidden = false;

  refreshMonumentsCacheBtn.addEventListener("click", async () => {
    refreshMonumentsCacheBtn.disabled = true;
    refreshMonumentsCacheBtn.textContent = t("refreshing", "Refreshing...");
    setMonumentsLoading(true, t("refreshing_caal_cache", "Refreshing CAAL cache..."));

    try {
      const response = await fetch("/api/monuments/admin/refresh-caal-cache", {
        method: "POST",
        credentials: "include"
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        alert(data.detail || data.error || t("cache_refresh_failed", "Cache refresh failed"));
        return;
      }

      showToast(t("caal_cache_refreshed", "CAAL cache refreshed"));

      await loadMonumentMapRecords();
      await loadMonumentListRecords();
    } catch (error) {
      console.error("Cache refresh failed:", error);
      alert(error.message || t("cache_refresh_failed", "Cache refresh failed"));
    } finally {
      refreshMonumentsCacheBtn.disabled = false;
      refreshMonumentsCacheBtn.textContent = t("refresh_cache", "Refresh cache");
      setMonumentsLoading(false);
    }
  });
}

/// related resource helpers
// ----------------------------------------------

function normaliseRelatedIdList(value) {
  return Array.from(new Set(parseRelatedIds(value))).join(", ");
}

function parseRelatedIds(text) {
  return String(text || "")
    .split(/[,\n;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function looksLikeRelatedIdList(text) {
  const ids = parseRelatedIds(text);

  if (!ids.length) return false;

  return ids.every((id) => /^[A-Za-z0-9_./-]+$/.test(id));
}

function getInvalidRelatedIds(value) {
  return parseRelatedIds(value).filter((id) => !looksLikeRelatedIdList(id));
}

function mRenderRelatedIdList(label, value, fullWidth = true) {
  const ids = parseRelatedIds(value);

  const inner = ids.length
    ? ids.map((id) => {
        const looksValid = looksLikeRelatedIdList(id);

        if (!looksValid) {
          return `
            <span
              class="related-id-chip related-id-chip-invalid"
              title="${mLabel("This does not look like a valid CAAL_ID.", "This does not look like a valid CAAL_ID.")}"
            >
              ${id}
            </span>
          `;
        }

        return `
          <button
            type="button"
            class="related-id-chip"
            data-related-id="${id}"
            title="${mLabel("Open related record", "Open related record")}"
          >
            ${id}
          </button>
        `;
      }).join("")
    : mSafeValue("");

  return `
    <div class="detail-item${fullWidth ? " full-width" : ""}">
      <span class="detail-label">${label}</span>
      <div class="detail-value related-id-list">
        ${inner}
      </div>
    </div>
  `;
}

function renderMasterIdChip(record) {
  const masterId = getMonumentMasterId(record);

  if (!masterId) return "";

  return `
    <div class="master-id-title-row related-id-list">
      <strong>${mLabel("MasterID", "MasterID")}:</strong>
      <button
        type="button"
        class="related-id-chip monument-master-id-chip"
        data-master-id="${masterId}"
        title="${t("open_master_record", "Open master record")}"
      >
        ${masterId}
      </button>
      <span class="master-id-note">
        ${t("master_id_readonly_note", "This record is linked to a master record and is read-only.")}
      </span>
    </div>
  `;
}

function wireRelatedRecordChips() {
  Array.from(document.querySelectorAll(".related-id-chip")).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const caalId = btn.dataset.relatedId;
      if (!caalId) return;

      await openRelatedRecordPreview(caalId);
    });
  });
}

function wireMasterIdChip() {
  const chip = document.querySelector(".monument-master-id-chip");
  if (!chip || chip.dataset.masterWired === "true") return;

  chip.dataset.masterWired = "true";

  chip.addEventListener("click", async () => {
    const masterId = chip.dataset.masterId;
    if (!masterId) return;

    await openMasterRecordInDetails(masterId);
  });
}

async function openMasterRecordInDetails(masterId) {
  if (!monumentConfirmLoseChanges()) return;

  setMonumentsLoading(true, t("loading_full_record", "Loading full record..."));

  try {
    const lang =
      (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
      window.appSession?.profile?.preferred_language ||
      "en";

    const response = await fetch(
      `/api/records/resolve?caal_id=${encodeURIComponent(masterId)}&lang=${encodeURIComponent(lang)}`,
      {
        method: "GET",
        credentials: "include"
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok || !data.record) {
      alert(data.error || t("could_not_load_master_record", "Could not load master record"));
      return;
    }

    if (data.record_type !== "monument") {
      alert(t("master_record_not_monument", "The master record is not a monument record."));
      return;
    }

    const fullRecord = data.record;

    monumentPendingNewRecord = null;
    monumentIsEditMode = false;
    monumentIsDirty = false;
    monumentIsAddMode = false;
    monumentSelectedRecord = fullRecord;

    monumentSyncModeVisualState();
    updateAddModeUI();
    clearPendingPickPoint();
    clearRelationshipStateForNewSelection();

    renderMonumentRecordDetails(fullRecord);
    updateSelectedResultCard();

    if (map && fullRecord.geometry?.coordinates) {
      drawSelectedMonumentHighlight(fullRecord);
      ensureRecordVisibleOnMap(fullRecord);
    }
  } catch (error) {
    console.error("Could not load master record:", error);
    alert(error.message || t("could_not_load_master_record", "Could not load master record"));
  } finally {
    setMonumentsLoading(false);
  }
}

async function openRelatedRecordPreview(caalId) {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const response = await fetch(
    `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}&lang=${encodeURIComponent(lang)}`,
    { method: "GET", credentials: "include" }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    alert(data.error || t("could_not_load_related_record", "Could not load related record"));
    return;
  }

  renderRelatedRecordModal(data.record, data.record_type, caalId);
}


function validateRelatedFieldsBeforeSave() {
  const fields = [
    "Monument is part of",
    "Monument contains",
    "Monument is associated with"
  ];

  if (monumentUserCanEditMasterId()) {
    fields.push("MasterID");
  }

  const invalid = [];

  fields.forEach((field) => {
    const value = mGetInputValue(field);
    getInvalidRelatedIds(value).forEach((id) => {
      invalid.push(`${field}: ${id}`);
    });
  });

  if (invalid.length) {
    alert(
      t("invalid_related_ids_intro", "Some related IDs do not look valid:") +
      "\n\n" +
      invalid.join("\n") +
      "\n\n" +
      t("invalid_related_ids_instruction", "Please use comma-separated CAAL IDs.")
    );
    return false;
  }

  return true;
}

function validateNewMonumentLocationBeforeSave(payload) {
  const lngRaw = payload["Longitude"];
  const latRaw = payload["Latitude"];

  const hasLng = lngRaw !== null && lngRaw !== undefined && String(lngRaw).trim() !== "";
  const hasLat = latRaw !== null && latRaw !== undefined && String(latRaw).trim() !== "";

  if (!hasLng && !hasLat) {
    alert(
      mLabel(
        "New monument location required",
        "Please either click a point on the map or enter longitude and latitude before saving a new monument record."
      )
    );
    return false;
  }

  if (!hasLng || !hasLat) {
    alert(
      mLabel(
        "Both coordinates required",
        "Please enter both longitude and latitude, or choose a point on the map."
      )
    );
    return false;
  }

  const lng = Number(lngRaw);
  const lat = Number(latRaw);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    alert(
      mLabel(
        "Invalid coordinates",
        "Longitude and latitude must be valid numbers."
      )
    );
    return false;
  }

  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    alert(
      mLabel(
        "Coordinates out of range",
        "Longitude must be between -180 and 180, and latitude must be between -90 and 90."
      )
    );
    return false;
  }

  return true;
}

async function resolveRelatedRecordStatus(caalId) {
  if (!caalId) return { status: "empty" };

  if (relatedRecordStatusCache.has(caalId)) {
    return relatedRecordStatusCache.get(caalId);
  }

  if (!looksLikeRelatedIdList(caalId)) {
    const result = { status: "invalid", caalId };
    relatedRecordStatusCache.set(caalId, result);
    return result;
  }

  try {
    const lang =
      (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
      window.appSession?.profile?.preferred_language ||
      "en";

    const response = await fetch(
      `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}&lang=${encodeURIComponent(lang)}`,
      { method: "GET", credentials: "include" }
    );

    const data = await response.json();

    if (!response.ok || !data.ok || !data.record) {
      const result = { status: "missing", caalId };
      relatedRecordStatusCache.set(caalId, result);
      return result;
    }

    const result = {
      status: "found",
      caalId,
      recordType: data.record_type,
      record: data.record,
      hasGeometry:
        data.record_type === "monument" &&
        Array.isArray(data.record?.geometry?.coordinates)
    };

    relatedRecordStatusCache.set(caalId, result);
    return result;
  } catch (error) {
    const result = { status: "unknown", caalId };
    relatedRecordStatusCache.set(caalId, result);
    return result;
  }
}

async function validateDisplayedRelatedIds() {
  const chips = Array.from(document.querySelectorAll(".related-id-chip[data-related-id]"));

  await Promise.all(chips.map(async (chip) => {
    const caalId = chip.dataset.relatedId;
    const result = await resolveRelatedRecordStatus(caalId);

    chip.classList.remove(
      "related-id-chip-found",
      "related-id-chip-missing",
      "related-id-chip-invalid",
      "related-id-chip-unknown"
    );

    if (result.status === "found") {
      chip.classList.add("related-id-chip-found");
      chip.disabled = false;
      chip.title = result.hasGeometry
        ? mLabel("Open related record or show on map", "Open related record or show on map")
        : mLabel("Open related record", "Open related record");
    } else if (result.status === "missing") {
      chip.classList.add("related-id-chip-missing");
      chip.disabled = true;
      chip.title = mLabel("Related record not found", "Related record not found");
    } else if (result.status === "invalid") {
      chip.classList.add("related-id-chip-invalid");
      chip.disabled = true;
      chip.title = mLabel("Invalid related ID format", "Invalid related ID format");
    } else {
      chip.classList.add("related-id-chip-unknown");
      chip.disabled = true;
      chip.title = mLabel("Could not check related record", "Could not check related record");
    }
  }));
}

function clearRelationshipStateForNewSelection() {
  clearRelatedMonumentsMap();

  if (mapLabelScopeSelect && mapLabelScopeSelect.value === "selected_related") {
    mapLabelScopeSelect.value = "selected";
    updateMapLabelHelpText();
  }

  renderLiveMapLabels();
  updateMapOptionsState();
}

function clearRelatedMonumentsMap() {
  if (map) {
    [
      "monument-live-labels",
      "monument-related-lines-halo",
      "monument-related-lines",
      "monument-related-points"
    ].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

    if (map.getSource("monument-related-selection")) {
      map.removeSource("monument-related-selection");
    }
  }

  monumentRelatedSelectionGeojson = null;
  updateMapOptionsState();
  renderLiveMapLabels();
  renderMonumentLegend();
}

function renderRelatedMonumentsMapOverlay() {
  if (!map || !mapLoaded || !monumentRelatedSelectionGeojson?.features?.length) {
    return;
  }

  const existingSource = map.getSource("monument-related-selection");

  if (existingSource && typeof existingSource.setData === "function") {
    existingSource.setData(monumentRelatedSelectionGeojson);
  } else {
    map.addSource("monument-related-selection", {
      type: "geojson",
      data: monumentRelatedSelectionGeojson
    });
  }

  // White underlay for relationship lines
  if (!map.getLayer("monument-related-lines-halo")) {
    map.addLayer({
      id: "monument-related-lines-halo",
      type: "line",
      source: "monument-related-selection",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-width": 5,
        "line-opacity": 0.55,
        "line-color": "#ffffff"
      }
    });
  }

  // Purple relationship lines
  if (!map.getLayer("monument-related-lines")) {
    map.addLayer({
      id: "monument-related-lines",
      type: "line",
      source: "monument-related-selection",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-width": 2.5,
        "line-opacity": 0.85,
        "line-color": "#7c3aed"
      }
    });
  }

  // Related monument points only.
  // The selected/open record is already shown by monument-selected-ring.
  if (!map.getLayer("monument-related-points")) {
    map.addLayer({
      id: "monument-related-points",
      type: "circle",
      source: "monument-related-selection",
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "role"], "related"]
      ],
      paint: {
        "circle-radius": 7,
        "circle-color": "#7c3aed",
        "circle-opacity": 0.9,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff"
      }
    });
  }

  renderLiveMapLabels();
  setRelationshipLayerVisibility();
  bringMonumentOverlaysToFront();
  updateMapOptionsState();
  renderMonumentLegend();
}

function clearSelectedMonumentRecord() {
  if (!monumentConfirmLoseChanges()) return;

  monumentSelectedRecord = null;
  monumentPendingNewRecord = null;
  monumentIsEditMode = false;
  monumentIsDirty = false;
  monumentIsAddMode = false;

  monumentSyncModeVisualState();
  updateAddModeUI();
  updateMonumentActionBar();
  updateSelectedResultCard();

  if (map) {
    if (map.getLayer("monument-selected-ring")) {
      map.removeLayer("monument-selected-ring");
    }

    if (map.getSource("monument-selected")) {
      map.removeSource("monument-selected");
    }
  }
  clearRelatedMonumentsMap();
  clearPendingPickPoint();
  renderMonumentEmptyState();

  updateMapOptionsState();
  renderMonumentLegend();
}

function bringMonumentOverlaysToFront() {
  if (!map) return;

  [
    "monument-related-lines-halo",
    "monument-related-lines",
    "monument-related-points",
    "monument-selected-ring",
    "monument-pick-point-layer",
    "monument-hover-ring",
    "monument-result-focus-ring",
    "monument-live-labels"
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  });
}

// modal helpers
// ================================
//only populated fields
function getPopulatedPreviewFields(record, fields) {
  return fields
    .map(({ label, value }) => ({ label, value }))
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
}

// preview rows
function renderPreviewRows(items) {
  if (!items.length) {
    return `<p class="section-empty">${mLabel("No populated fields in this section.", "No populated fields in this section.")}</p>`;
  }

  return items.map((item) => `
    <div class="detail-item">
      <span class="detail-label">${item.label}</span>
      <div class="detail-value">${mSafeValue(item.value)}</div>
    </div>
  `).join("");
}

// summary list from repeated fields
function getSummaryValues(record, fieldNames, lookupName = null) {
  const values = fieldNames
    .map((field) => mRaw(record, field))
    .filter((value) => value !== null && value !== undefined && value !== "");

  if (lookupName) {
    return values.map((value) => mLookupLabel(lookupName, value));
  }

  return values;
}

//modal renderer
function renderMonumentPreviewModal(record) {
  const modal = document.getElementById("monumentPreviewModal");
  const titleEl = document.getElementById("monumentPreviewTitle");
  const bodyEl = document.getElementById("monumentPreviewBody");

  if (!modal || !titleEl || !bodyEl || !record) return;

  const basicFields = getPopulatedPreviewFields(record, [
    { label: mLabel("Primary Name", "Primary Name"), value: mSummary(record, "primary_name") },
    { label: mLabel("Primary Name (English)", "Primary Name (English)"), value: mSummary(record, "primary_name_english") },
    { label: mLabel("Other Names", "Other Names"), value: mRaw(record, "Other Names") },
    { label: mLabel("Country", "Country"), value: mSummary(record, "country") },
    { label: mLabel("Region", "Region"), value: mSummary(record, "region") },
    { label: mLabel("Classification", "Classification"), value: mSummary(record, "classification") },
    { label: mLabel("CAAL_ID", "CAAL_ID"), value: mIdentity(record, "caal_id") },
    { label: mLabel("Internal Reference", "Internal Reference"), value: mRaw(record, "Internal Reference") },
    { label: mLabel("External Reference", "External Reference"), value: mRaw(record, "External Reference") },
    { label: mLabel("Designation", "Designation"), value: mSummary(record, "designation") },
    { label: mLabel("World Heritage Site Name", "World Heritage Site Name"), value: mRaw(record, "World Heritage Site Name") }
  ]);

  const monumentTypes = getSummaryValues(record, [
    "Monument Type1", "Monument Type2", "Monument Type3",
    "Monument Type4", "Monument Type5", "Monument Type6"
  ], "monument_type");

  const culturalPeriods = getSummaryValues(record, [
    "Cultural Period1", "Cultural Period2", "Cultural Period3",
    "Cultural Period4", "Cultural Period5", "Cultural Period6"
  ], "cultural_period");

  titleEl.textContent = mSafeValue(mSummary(record, "primary_name"));

  bodyEl.innerHTML = `
    <div class="record-title">
      <h3>${mSafeValue(mSummary(record, "primary_name"))}</h3>
      <p>${mSafeValue(mIdentity(record, "caal_id"))}</p>

      <div class="preview-action-row">
        <button type="button" class="action-btn primary" id="previewOpenInDetailsBtn">
          ${t("open_in_details_pane", "Open in details pane")}
        </button>

        ${
          record?.geometry?.coordinates
            ? `<button type="button" class="action-btn" id="previewCentreOnMapBtn">
                ${t("centre_on_map", "Centre on map")}
              </button>`
            : ""
        }
      </div>
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Basic", "Basic")}</span>
          </div>
          ${renderPreviewRows(basicFields)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Monument type summary", "Monument type summary")}</span>
          </div>
          <div class="detail-item full-width">
            <div class="detail-value">${monumentTypes.length ? monumentTypes.join(", ") : mLabel("Not recorded", "Not recorded")}</div>
          </div>
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Cultural period summary", "Cultural period summary")}</span>
          </div>
          <div class="detail-item full-width">
            <div class="detail-value">${culturalPeriods.length ? culturalPeriods.join(", ") : mLabel("Not recorded", "Not recorded")}</div>
          </div>
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Location", "Location")}</span>
          </div>
          <div class="detail-item full-width">
            <div id="monumentPreviewMiniMap" style="height: 220px; border-radius: 10px; overflow: hidden;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.hidden = false;

  const previewOpenBtn = document.getElementById("previewOpenInDetailsBtn");

  if (previewOpenBtn) {
    previewOpenBtn.addEventListener("click", () => {
      if (!monumentConfirmLoseChanges()) return;

      monumentIsEditMode = false;
      monumentSyncModeVisualState();
      monumentPendingNewRecord = null;
      monumentSelectedRecord = record;
      clearRelationshipStateForNewSelection();

      renderMonumentRecordDetails(record);
      updateSelectedResultCard();

      if (record.geometry?.coordinates) {
        drawSelectedMonumentHighlight(record);
        bringMonumentOverlaysToFront();
      }

      closeMonumentPreviewModal();
    });
  }

  const previewCentreBtn = document.getElementById("previewCentreOnMapBtn");

  if (previewCentreBtn) {
    previewCentreBtn.addEventListener("click", () => {
      if (!map || !record?.geometry?.coordinates) return;

      monumentSelectedRecord = record;

      drawSelectedMonumentHighlight(record);
      renderMonumentLegend();
      updateMapOptionsState();

      map.easeTo({
        center: record.geometry.coordinates,
        zoom: Math.max(map.getZoom(), 10),
        duration: 600
      });

      closeMonumentPreviewModal();
    });
  }

  initMonumentPreviewMiniMap(record);
}

// related record modal 
function renderRelatedRecordModal(record, recordType, caalId) {
    if (!monumentPreviewModal || !monumentPreviewTitle || !monumentPreviewBody) return;

  const fullRecordUrl = getRelatedRecordUrl(
    caalId,
    recordType,
    record?.source?.scope
  );

  if (recordType === "monument") {
    renderRelatedMonumentModal(record, caalId, fullRecordUrl);
    return;
  }

  if (recordType === "archive") {
    renderRelatedArchiveModal(record, caalId, fullRecordUrl);
    return;
  }

  const title =
    recordType === "archive"
      ? mRaw(record, "English Title") || mRaw(record, "Original Title") || caalId
      : mSummary(record, "primary_name") || mRaw(record, "Primary Name") || caalId;

  monumentPreviewTitle.textContent = title;

  monumentPreviewBody.innerHTML = `
    <div class="record-title">
      <h3>${mSafeValue(title)}</h3>
      <p>${mSafeValue(caalId)}</p>
      <span class="related-record-type-badge">
        ${recordType === "archive" ? mLabel("Archive", "Archive") : mLabel("Monument", "Monument")}
      </span>

      ${
        fullRecordUrl
          ? `<button type="button" class="action-btn" id="openRelatedFullRecordBtn">
              ${t("open_full_record", "Open full record")}
            </button>`
          : ""
      }
    </div>
  `;

  monumentPreviewModal.hidden = false;

  const openBtn = document.getElementById("openRelatedFullRecordBtn");

  if (openBtn && fullRecordUrl) {
    openBtn.addEventListener("click", () => {
      window.open(fullRecordUrl, "_blank");
    });
  }
}
function renderRelatedMonumentModal(record, caalId, fullRecordUrl) {
  const title = mSummary(record, "primary_name") || mRaw(record, "Primary Name") || caalId;

  monumentPreviewTitle.textContent = title;

  const basicFields = getPopulatedPreviewFields(record, [
    { label: mLabel("Primary Name", "Primary Name"), value: mSummary(record, "primary_name") },
    { label: mLabel("Primary Name (English)", "Primary Name (English)"), value: mSummary(record, "primary_name_english") },
    { label: mLabel("Country", "Country"), value: mSummary(record, "country") },
    { label: mLabel("Classification", "Classification"), value: mSummary(record, "classification") },
    { label: mLabel("CAAL_ID", "CAAL_ID"), value: caalId },
    { label: mLabel("Designation", "Designation"), value: mSummary(record, "designation") }
  ]);

  const monumentTypes = getSummaryValues(record, [
    "Monument Type1", "Monument Type2", "Monument Type3",
    "Monument Type4", "Monument Type5", "Monument Type6"
  ], "monument_type");

  const culturalPeriods = getSummaryValues(record, [
    "Cultural Period1", "Cultural Period2", "Cultural Period3",
    "Cultural Period4", "Cultural Period5", "Cultural Period6"
  ], "cultural_period");

  monumentPreviewBody.innerHTML = `
    <div class="record-title related-record-title">
      <div>
        <h3>${mSafeValue(title)}</h3>
        <p>${mSafeValue(caalId)}</p>
      </div>

      <span class="related-record-type-badge">
        ${mLabel("Monument", "Monument")}
      </span>

      ${
        fullRecordUrl
          ? `<button type="button" class="action-btn" id="openRelatedFullRecordBtn">
              ${t("open_full_record", "Open full record")}
            </button>`
          : ""
      }
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Basic", "Basic")}</span>
          </div>
          ${renderPreviewRows(basicFields)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Monument type summary", "Monument type summary")}</span>
          </div>
          <div class="detail-item full-width">
            <div class="detail-value">${monumentTypes.length ? monumentTypes.join(", ") : mSafeValue("")}</div>
          </div>
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Cultural period summary", "Cultural period summary")}</span>
          </div>
          <div class="detail-item full-width">
            <div class="detail-value">${culturalPeriods.length ? culturalPeriods.join(", ") : mSafeValue("")}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  monumentPreviewModal.hidden = false;
  wireOpenRelatedFullRecordButton(fullRecordUrl);
}

function renderRelatedArchiveModal(record, caalId, fullRecordUrl) {
  const s = record.summary || {};

  const title =
    s.english_title ||
    s.original_title ||
    mRaw(record, "English Title") ||
    mRaw(record, "Original Title") ||
    caalId;

  monumentPreviewTitle.textContent = title;

  monumentPreviewBody.innerHTML = `
    <div class="record-title related-record-title">
      <div>
        <h3>${mSafeValue(title)}</h3>
        <p>${mSafeValue(caalId)}</p>
      </div>

      <span class="related-record-type-badge">
        ${mLabel("Archive", "Archive")}
      </span>

      ${
        fullRecordUrl
          ? `<button type="button" class="action-btn" id="openRelatedFullRecordBtn">
              ${t("open_full_record", "Open full record")}
            </button>`
          : ""
      }
    </div>

    <div class="group-stack">
      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Material Details", "Material Details")}</span>
          </div>

          ${mRenderDetailItem(mLabel("CAAL_ID", "CAAL_ID"), record.identity?.caal_id)}
          ${mRenderDetailItem(mLabel("Associated CAAL_ID", "Associated CAAL_ID"), record.identity?.associated_caal_id)}
          ${mRenderDetailItem(mLabel("Original Reference", "Original Reference"), s.original_reference)}
          ${mRenderDetailItem(mLabel("Content Type", "Content Type"), s.content_type)}
          ${mRenderDetailItem(mLabel("Country", "Country"), s.country)}
          ${mRenderDetailItem(mLabel("Level", "Level"), s.level)}
          ${mRenderDetailItem(mLabel("Original Title", "Original Title"), s.original_title, true)}
          ${mRenderDetailItem(mLabel("English Title", "English Title"), s.english_title, true)}
          ${mRenderDetailItem(mLabel("Description", "Description"), mRaw(record, "Description"), true)}
          ${mRenderDetailItem(
            mLabel("Languages of Material", "Languages of Material"),
            parseRelatedIds(mRaw(record, "Languages of Material")).join(", "),
            true
          )}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Publication Details", "Publication Details")}</span>
          </div>

          ${mRenderDetailItem(mLabel("Dates of Original Material", "Dates of Original Material"), mRaw(record, "Dates of Original Material"))}
          ${mRenderDetailItem(mLabel("Author of the Original Material", "Author of the Original Material"), mRaw(record, "Author of the Original Material"), true)}
          ${mRenderDetailItem(mLabel("Publisher of the Original Material", "Publisher of the Original Material"), mRaw(record, "Publisher of the Original Material"), true)}
          ${mRenderDetailItem(mLabel("Editor of the Original Material", "Editor of the Original Material"), mRaw(record, "Editor of the Original Material"), true)}
          ${mRenderDetailItem(mLabel("Volume and Issue Number", "Volume and Issue Number"), mRaw(record, "Volume and Issue Number"))}
        </div>
      </div>
    </div>
  `;

  monumentPreviewModal.hidden = false;
  wireOpenRelatedFullRecordButton(fullRecordUrl);
}

function wireOpenRelatedFullRecordButton(fullRecordUrl) {
  const openBtn = document.getElementById("openRelatedFullRecordBtn");

  if (openBtn && fullRecordUrl) {
    openBtn.addEventListener("click", () => {
      window.open(fullRecordUrl, "_blank");
    });
  }
}

// mini map
let monumentPreviewMap = null;

function initMonumentPreviewMiniMap(record) {
  const mapEl = document.getElementById("monumentPreviewMiniMap");
  if (!mapEl || !record?.geometry?.coordinates || typeof maplibregl === "undefined") return;

  const [lng, lat] = record.geometry.coordinates;

  if (monumentPreviewMap) {
    monumentPreviewMap.remove();
    monumentPreviewMap = null;
  }

  monumentPreviewMap = new maplibregl.Map({
    container: "monumentPreviewMiniMap",
    style: getBasemapStyle("osm"),
    center: [lng, lat],
    zoom: 12,
    interactive: false
  });

  monumentPreviewMap.on("load", () => {
    if (monumentPreviewMap.getLayer("preview-point")) {
      monumentPreviewMap.removeLayer("preview-point");
    }
    if (monumentPreviewMap.getSource("preview-point")) {
      monumentPreviewMap.removeSource("preview-point");
    }

    monumentPreviewMap.addSource("preview-point", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lng, lat]
          },
          properties: {}
        }]
      }
    });

    monumentPreviewMap.addLayer({
      id: "preview-point",
      type: "circle",
      source: "preview-point",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3, 2,
          8, 4.5,
          12, 6
        ],
        "circle-color": "#c95a4a",
        "circle-opacity": 0.7,
        "circle-stroke-width": 0.7,
        "circle-stroke-color": "rgba(255,255,255,0.9)"
      }
    });
  });
}

//modal close
function closeMonumentPreviewModal() {
  const modal = document.getElementById("monumentPreviewModal");
  if (modal) modal.hidden = true;

  if (monumentPreviewMap) {
    monumentPreviewMap.remove();
    monumentPreviewMap = null;
  }
}



// --------------------------------------------------------
// Labels + lookups API
// --------------------------------------------------------
function applyMonumentStaticLabels() {
  document.querySelectorAll("[data-monument-label]").forEach((el) => {
    const key = el.dataset.monumentLabel;
    el.textContent = mLabel(key, el.textContent);
  });
}

async function loadMonumentLabels() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const response = await fetch(
    `/api/ui/labels?page=monuments&lang=${encodeURIComponent(lang)}`,
    { method: "GET", credentials: "include" }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load monuments labels");
  }

  monumentLabels = data.labels || {};
}

async function loadMonumentLookups() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const response = await fetch(
    `/api/lookups/monuments?lang=${encodeURIComponent(lang)}`,
    { method: "GET", credentials: "include" }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load monuments lookups");
  }

  monumentLookups = data.lookups || {};
  window.sharedLookups = window.sharedLookups || {};
  window.sharedLookups.language_display = monumentLookups.language_display || [];
  buildCulturalPeriodLookup();
}

function populateMonumentFilterLookups() {
  mPopulateMultiSelect(filterMonumentType, mLookupOptions("monument_type"));
  mPopulateMultiSelect(filterClassification, mLookupOptions("classification"));
  mPopulateMultiSelect(filterDesignation, mLookupOptions("designation"));
  mPopulateMultiSelect(filterReligion, mLookupOptions("religion"));
  mPopulateMultiSelect(filterCulturalPeriod, mLookupOptions("cultural_period"));
  mPopulateMultiSelect(filterCountry, mLookupOptions("country"));

  wireClickToggleMultiSelects();
  renderAllFilterChips();
}

const monumentChipFilterConfigs = [
  {
    select: filterMonumentType,
    chipsId: "filterMonumentTypeChips"
  },
  {
    select: filterClassification,
    chipsId: "filterClassificationChips"
  },
  {
    select: filterDesignation,
    chipsId: "filterDesignationChips"
  },
  {
    select: filterReligion,
    chipsId: "filterReligionChips"
  },
  {
    select: filterCulturalPeriod,
    chipsId: "filterCulturalPeriodChips"
  },
  {
    select: filterCountry,
    chipsId: "filterCountryChips"
  }
];

function getSelectedOptionData(selectEl) {
  if (!selectEl) return [];

  return Array.from(selectEl.options)
    .filter((option) => option.selected)
    .map((option) => ({
      value: option.value,
      label: option.textContent || option.value
    }));
}

function renderFilterChipsForSelect(selectEl, chipsId) {
  const chipsEl = document.getElementById(chipsId);
  if (!selectEl || !chipsEl) return;

  const selected = getSelectedOptionData(selectEl);

  chipsEl.innerHTML = "";

  if (!selected.length) {
    const empty = document.createElement("span");
    empty.className = "filter-chip-empty";
    empty.textContent = t("no_values_selected", "No values selected");
    chipsEl.appendChild(empty);
    return;
  }

  selected.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filter-chip";
    chip.dataset.value = item.value;
    chip.innerHTML = `
      <span>${item.label}</span>
      <span class="filter-chip-remove" aria-hidden="true">×</span>
    `;

    chip.addEventListener("click", async () => {
      const option = Array.from(selectEl.options).find(
        (opt) => opt.value === item.value
      );

      if (option) {
        option.selected = false;
      }

      renderAllFilterChips();
      await applyMonumentFilters({ includeMap: true, listFirst: true });
    });

    chipsEl.appendChild(chip);
  });
}

function renderAllFilterChips() {
  monumentChipFilterConfigs.forEach(({ select, chipsId }) => {
    renderFilterChipsForSelect(select, chipsId);
  });
}

function wireClickToggleMultiSelects() {
  monumentChipFilterConfigs.forEach(({ select, chipsId }) => {
    if (!select || select.dataset.clickToggleWired === "true") return;

    select.addEventListener("mousedown", (event) => {
      const option = event.target;

      if (!option || option.tagName !== "OPTION") return;

      event.preventDefault();

      option.selected = !option.selected;

      renderFilterChipsForSelect(select, chipsId);

      select.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    });

    select.addEventListener("change", () => {
      renderFilterChipsForSelect(select, chipsId);
    });

    select.dataset.clickToggleWired = "true";
  });

  renderAllFilterChips();
}

function getMapBboxParam() {
  if (!map) return null;

  const bounds = map.getBounds();
  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth()
  ].join(",");
}

// --------------------------------------------------------
// Records API
// --------------------------------------------------------
async function loadMonumentMapRecords() {
  const requestSeq = ++monumentMapRequestSeq;
  const scopes = getMonumentEnabledScopes();

  if (!scopes.length) {
    monumentMapRecords = [];
    drawMonumentRecords([]);
    updateMapOptionsState();
    updateMapStatusLine();
    setMapStaleState(false);
    return;
  }

  const params = buildMonumentQueryParams({ includePaging: false });

  const bbox = getMapBboxParam();
  if (bbox) {
    params.set("bbox", bbox);
  }

  setMapStaleState(true, t("redrawing_map", "Redrawing map..."));

  try {
    const response = await fetch(`/api/monuments/map?${params.toString()}`, {
      method: "GET",
      credentials: "include"
    });

    const data = await response.json();

    if (requestSeq !== monumentMapRequestSeq) {
      return;
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.detail || data.error || "Failed to load monument map records");
    }

    monumentMapRecords = data.records || [];

    drawMonumentRecords(monumentMapRecords);

    renderLiveMapLabels();
    updateMapOptionsState();
    updateMapStatusLine();
  } finally {
    if (requestSeq === monumentMapRequestSeq) {
      setMapStaleState(false);
    }
  }
}

async function loadMonumentListRecords() {
  const requestSeq = ++monumentListRequestSeq;
  const scopes = getMonumentEnabledScopes();

  if (!scopes.length) {
    monumentListRecords = [];
    monumentTotalCount = 0;
    monumentTotalIsExact = true;
    renderMonumentResultsList([]);
    updateShowResultsOnMapButton();
    renderLiveMapLabels();
    updateMapOptionsState();
    renderMonumentEmptyState();
    updateMapStatusLine();
    return;
  }

  setResultsCountLoading();

  const params = buildMonumentQueryParams({ includePaging: true });

  const response = await fetch(`/api/monuments?${params.toString()}`, {
    method: "GET",
    credentials: "include"
  });

  const data = await response.json();

  if (requestSeq !== monumentListRequestSeq) {
    return;
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || "Failed to load monument list records");
  }

  monumentListRecords = data.records || [];
  monumentTotalCount = data.total || 0;
  monumentTotalIsExact = data.total_is_exact !== false;

  renderMonumentResultsList(monumentListRecords);
  updateShowResultsOnMapButton();
  renderLiveMapLabels();
  updateMapOptionsState();
  renderMonumentPageInfo();
  updateMapStatusLine();
}

async function loadFullMonumentRecord(record) {
  const caalId = record?.identity?.caal_id;

  if (!caalId) {
    return record;
  }

  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const response = await fetch(
    `/api/records/resolve?caal_id=${encodeURIComponent(caalId)}&lang=${encodeURIComponent(lang)}`,
    {
      method: "GET",
      credentials: "include"
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.detail || data.error || t("could_not_load_full_monument_record", "Could not load full monument record"));
  }

  if (data.record_type !== "monument" || !data.record) {
    throw new Error(t("resolved_record_not_monument", "Resolved record is not a monument"));
  }

  data.record.source = data.record.source || {};
  data.record.source.is_editable = canEditMonumentRecord(data.record);

  return data.record;
}

function renderMonumentPageInfo() {
  const pageInfo = document.getElementById("monumentPageInfo");
  if (!pageInfo) return;

  const totalPages = Math.max(1, Math.ceil(monumentTotalCount / monumentPageLimit));
  const pageNumber = Math.floor(monumentPageOffset / monumentPageLimit) + 1;

  if (monumentTotalIsExact) {
    pageInfo.textContent = t("page_x_of_y", "Page {page} of {total}")
      .replace("{page}", pageNumber)
      .replace("{total}", totalPages);
  } else {
    pageInfo.textContent = t("page_x", "Page {page}")
     .replace("{page}", pageNumber);
  }
}


// --------------------------------------------------------
// Filters
// --------------------------------------------------------
function monumentMatchesFilters(record, filters) {
  const fv = record.filter_values || {};

  const matchesText =
    !filters.text ||
    mRecordSearchText(record).includes(filters.text.toLowerCase());

  const matchesMonumentType =
    filters.monumentTypes.length === 0 ||
    (fv.monument_types || []).some((value) => filters.monumentTypes.includes(value));

  const matchesClassification =
    filters.classifications.length === 0 ||
    filters.classifications.includes(fv.classification);

  const matchesDesignation =
    filters.designations.length === 0 ||
    filters.designations.includes(fv.designation);

  const matchesReligion =
    filters.religions.length === 0 ||
    (fv.religions || []).some((value) => filters.religions.includes(value));

  const matchesCulturalPeriod =
    filters.culturalPeriods.length === 0 ||
    (fv.cultural_periods || []).some((value) => filters.culturalPeriods.includes(value));

  const matchesCountry =
    filters.countries.length === 0 ||
    filters.countries.includes(fv.country);

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

async function applyMonumentFilters({ includeMap = true, listFirst = true } = {}) {
  monumentPageOffset = 0;
  monumentSelectedRecord = null;
  monumentPendingNewRecord = null;
  monumentIsEditMode = false;
  monumentSyncModeVisualState();

  if (map) {
    if (map.getLayer("monument-selected-ring")) {
      map.removeLayer("monument-selected-ring");
    }
    if (map.getSource("monument-selected")) {
      map.removeSource("monument-selected");
    }
  }

  clearRelatedMonumentsMap();
  updateMapOptionsState();

  setMonumentsLoading(true, t("updating_results", "Updating results..."));

  try {
    if (listFirst) {
      await loadMonumentListRecords();

      if (includeMap) {
        setMonumentsLoading(true, t("redrawing_map", "Redrawing map..."));
        await loadMonumentMapRecords();
      }
    } else {
      if (includeMap) {
        await loadMonumentMapRecords();
      }

      await loadMonumentListRecords();
    }

    renderMonumentEmptyState();
  } catch (error) {
    console.error("Failed to reload monuments after filter change:", error);
  } finally {
    setMonumentsLoading(false);
  }
}

async function clearMonumentFilters() {
  if (siteSearch) siteSearch.value = "";
  if (filterCaalId) filterCaalId.value = "";

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

  await applyMonumentFilters({ includeMap: true, listFirst: true });
}

// --------------------------------------------------------
// Map
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

function monumentRecordToFeature(record) {
  if (!record?.geometry?.coordinates) return null;

  return {
    type: "Feature",
    geometry: record.geometry,
    properties: {
      id: record.identity?.id,
      caal_id: record.identity?.caal_id,
      primary_name: record.summary?.primary_name,
      source_scope: record.source?.scope || "unknown"
    }
  };
}

function bindMonumentLayerEvents() {
 if (!map || monumentsLayerEventsBound) return;

  function handleClusterClick(sourceId, clusterLayerIds) {
    clusterLayerIds.forEach((clusterLayerId) => {
      if (!map.getLayer(clusterLayerId)) return;

      map.on("click", clusterLayerId, async (e) => {
        const activeClusterLayers = clusterLayerIds.filter((layerId) =>
          map.getLayer(layerId)
        );

        const features = map.queryRenderedFeatures(e.point, {
          layers: activeClusterLayers
        });

        const clusterFeature = features.find((feature) =>
          feature?.properties?.cluster === true ||
          feature?.properties?.cluster === "true" ||
          feature?.properties?.cluster_id !== undefined
        );

        const clusterId = clusterFeature?.properties?.cluster_id;

        if (clusterId === undefined || clusterId === null) {
          console.warn("Cluster clicked but no cluster_id found", {
            sourceId,
            clusterLayerId,
            features
          });
          return;
        }

        const source = map.getSource(sourceId);

        if (!source || typeof source.getClusterExpansionZoom !== "function") {
          console.warn("Cluster source not available or not clustered", {
            sourceId,
            source
          });
          return;
        }

        const coordinates = clusterFeature.geometry?.coordinates;

        if (!Array.isArray(coordinates)) {
          console.warn("Cluster feature has no coordinates", clusterFeature);
          return;
        }

        try {
          const zoom = await source.getClusterExpansionZoom(Number(clusterId));

          map.easeTo({
            center: coordinates,
            zoom: Math.min(zoom, 12),
            duration: 500
          });
        } catch (error) {
          console.error("Could not get cluster expansion zoom:", error);
        }
      });

      map.on("mouseenter", clusterLayerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", clusterLayerId, () => {
        map.getCanvas().style.cursor = "";
      });
    });
  }

  handleClusterClick("monuments-national", [
    "monument-national-clusters",
    "monument-national-cluster-count"
  ]);

  handleClusterClick("monuments-all-caal", [
    "monument-all-caal-clusters",
    "monument-all-caal-cluster-count"
  ]);

  async function handleMonumentPointClick(e) {
    const feature = e.features?.[0];
    if (!feature) return;

    const clickedId = Number(feature.properties?.id);
    const clickedScope = feature.properties?.source_scope;

    const record = monumentMapRecords.find(
      (r) =>
        Number(r.identity?.id) === clickedId &&
        String(r.source?.scope || "") === String(clickedScope || "")
    ) || monumentMapRecords.find(
      (r) => Number(r.identity?.id) === clickedId
    );

    if (!record) return;

    await openMapMonumentPreview(record);
  }

  let monumentHoverPopup = null;
  let monumentHoverCloseTimer = null;

  async function openMapMonumentPreview(record) {
    if (!record) return;

    setMonumentsLoading(true, t("loading_preview", "Loading preview..."));

    try {
      const fullRecord = await loadFullMonumentRecord(record);
      renderMonumentPreviewModal(fullRecord);
    } catch (error) {
      console.error("Failed to load monument preview from map:", error);
      alert(error.message || t("could_not_load_monument_preview", "Could not load monument preview"));
    } finally {
      setMonumentsLoading(false);
    }
  }

  function handleMonumentPointHover(e) {
    cancelClearMonumentPointHover();

    const feature = e.features?.[0];
    if (!feature || !feature.geometry?.coordinates) return;

    const clickedId = Number(feature.properties?.id);
    const clickedScope = feature.properties?.source_scope;

    const record = monumentMapRecords.find(
      (r) =>
        Number(r.identity?.id) === clickedId &&
        String(r.source?.scope || "") === String(clickedScope || "")
    ) || monumentMapRecords.find(
      (r) => Number(r.identity?.id) === clickedId
    );

    if (!record) return;

    if (!monumentHoverPopup) {
      monumentHoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10
      });
    }

    monumentHoverPopup
      .setLngLat(feature.geometry.coordinates)
      .setHTML(`
        <div class="map-popup">
          <button
            type="button"
            class="map-popup-title-btn map-hover-preview-btn"
            data-monument-id="${record.identity?.id}"
            data-monument-scope="${record.source?.scope || ""}"
          >
            ${mSafeValue(mSummary(record, "primary_name"))}
          </button><br>
          <span>${mSafeValue(mIdentity(record, "caal_id"))}</span><br>
          <span>${mSafeValue(mSummary(record, "classification"))}</span><br>
          <span>${mSafeValue(mSummary(record, "monument_type1"))}</span>
        </div>
      `)
      .addTo(map);

    setTimeout(() => {
      const popupEl = monumentHoverPopup?.getElement?.();
      if (!popupEl) return;

      popupEl.addEventListener("mouseenter", cancelClearMonumentPointHover);
      popupEl.addEventListener("mouseleave", scheduleClearMonumentPointHover);

      const popupTitleBtn = popupEl.querySelector(
        `.map-hover-preview-btn[data-monument-id="${record.identity?.id}"][data-monument-scope="${record.source?.scope || ""}"]`
      );

      if (!popupTitleBtn || popupTitleBtn.dataset.previewWired === "true") return;

      popupTitleBtn.dataset.previewWired = "true";

      popupTitleBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        clearMonumentPointHover();
        await openMapMonumentPreview(record);
      });
    }, 0);
  }

  function scheduleClearMonumentPointHover() {
    if (monumentHoverCloseTimer) {
      clearTimeout(monumentHoverCloseTimer);
    }

    monumentHoverCloseTimer = setTimeout(() => {
      clearMonumentPointHover();
    }, 250);
  }

  function cancelClearMonumentPointHover() {
    if (monumentHoverCloseTimer) {
      clearTimeout(monumentHoverCloseTimer);
      monumentHoverCloseTimer = null;
    }
  }

  function clearMonumentPointHover() {
    if (monumentHoverCloseTimer) {
      clearTimeout(monumentHoverCloseTimer);
      monumentHoverCloseTimer = null;
    }

    if (monumentHoverPopup) {
      monumentHoverPopup.remove();
    }
  }

  [
    "monuments-national-layer",
    "monuments-all-caal-layer",
    "monuments-workspace-layer"
  ].forEach((layerId) => {
    map.on("click", layerId, handleMonumentPointClick);

    map.on("mouseenter", layerId, (e) => {
      map.getCanvas().style.cursor = "pointer";
      handleMonumentPointHover(e);
    });

    map.on("mousemove", layerId, handleMonumentPointHover);

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
      scheduleClearMonumentPointHover();
    });
  });
  monumentsLayerEventsBound = true;
}

function drawMonumentRecords(records) {
  if (!map || !mapLoaded) return;

  const workspaceRecords = records.filter(
    (r) => monumentDisplayScope(r) === "workspace"
  );

  const nationalRecords = records.filter(
    (r) => monumentDisplayScope(r) === "national_ref"
  );

  const allCaalRecords = records.filter(
    (r) => monumentDisplayScope(r) === "all_caal"
  );

  const nationalGeojson = {
    type: "FeatureCollection",
    features: nationalRecords
      .map(monumentRecordToFeature)
      .filter(Boolean)
  };

  const allCaalGeojson = {
    type: "FeatureCollection",
    features: allCaalRecords
      .map(monumentRecordToFeature)
      .filter(Boolean)
  };

  const workspaceGeojson = {
    type: "FeatureCollection",
    features: workspaceRecords
      .map(monumentRecordToFeature)
      .filter(Boolean)
  };

  const existingNationalSource = map.getSource("monuments-national");
  const existingAllCaalSource = map.getSource("monuments-all-caal");
  const existingWorkspaceSource = map.getSource("monuments-workspace");

  if (
    existingNationalSource &&
    typeof existingNationalSource.setData === "function" &&
    existingAllCaalSource &&
    typeof existingAllCaalSource.setData === "function" &&
    existingWorkspaceSource &&
    typeof existingWorkspaceSource.setData === "function"
  ) {
    existingNationalSource.setData(nationalGeojson);
    existingAllCaalSource.setData(allCaalGeojson);
    existingWorkspaceSource.setData(workspaceGeojson);

    if (map.getLayer("monuments-workspace-layer")) {
      map.moveLayer("monuments-workspace-layer");
    }
    bringMonumentOverlaysToFront();
    renderMonumentLegend();
    updateShowResultsOnMapButton();
    updateMapOptionsState();
    return;
  }

  [
    "monument-national-clusters",
    "monument-national-cluster-count",
    "monument-all-caal-clusters",
    "monument-all-caal-cluster-count",
    "monuments-national-layer",
    "monuments-all-caal-layer",
    "monuments-workspace-layer"
  ].forEach((layer) => {
    if (map.getLayer(layer)) map.removeLayer(layer);
  });

  ["monuments-national", "monuments-all-caal", "monuments-workspace"].forEach((source) => {
    if (map.getSource(source)) map.removeSource(source);
  });

  map.addSource("monuments-national", {
    type: "geojson",
    data: nationalGeojson,
    cluster: true,
    clusterMaxZoom: 9,
    clusterRadius: 40
  });

  map.addSource("monuments-all-caal", {
    type: "geojson",
    data: allCaalGeojson,
    cluster: true,
    clusterMaxZoom: 9,
    clusterRadius: 40
  });

  map.addSource("monuments-workspace", {
    type: "geojson",
    data: workspaceGeojson,
    cluster: false
  });

  map.addLayer({
    id: "monument-national-clusters",
    type: "circle",
    source: "monuments-national",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 14, 20, 18, 100, 22, 500, 26],
      "circle-color": "#0f766e",
      "circle-opacity": 0.78,
      "circle-stroke-width": 1,
      "circle-stroke-color": "rgba(255,255,255,0.9)"
    }
  });

  map.addLayer({
    id: "monument-national-cluster-count",
    type: "symbol",
    source: "monuments-national",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "monument-all-caal-clusters",
    type: "circle",
    source: "monuments-all-caal",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 14, 20, 18, 100, 22, 500, 26],
      "circle-color": "#c95a4a",
      "circle-opacity": 0.72,
      "circle-stroke-width": 1,
      "circle-stroke-color": "rgba(255,255,255,0.9)"
    }
  });

  map.addLayer({
    id: "monument-all-caal-cluster-count",
    type: "symbol",
    source: "monuments-all-caal",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "monuments-national-layer",
    type: "circle",
    source: "monuments-national",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4.5, 8, 6, 12, 8],
      "circle-color": "#0f766e",
      "circle-opacity": 0.88,
      "circle-stroke-width": 1.2,
      "circle-stroke-color": "rgba(255,255,255,0.9)"
    }
  });

  map.addLayer({
    id: "monuments-all-caal-layer",
    type: "circle",
    source: "monuments-all-caal",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4.5, 8, 6, 12, 8],
      "circle-color": "#c95a4a",
      "circle-opacity": 0.8,
      "circle-stroke-width": 1.2,
      "circle-stroke-color": "rgba(255,255,255,0.9)"
    }
  });

  map.addLayer({
    id: "monuments-workspace-layer",
    type: "circle",
    source: "monuments-workspace",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 5,
        8, 7,
        12, 9
      ],
      "circle-color": "#2e7d32",
      "circle-opacity": 0.95,
      "circle-stroke-width": 1.6,
      "circle-stroke-color": "rgba(255,255,255,0.95)"
    }
  });
  if (map.getLayer("monuments-workspace-layer")) {
    map.moveLayer("monuments-workspace-layer");
  }
  bringMonumentOverlaysToFront();
  bindMonumentLayerEvents();
  renderMonumentLegend();
  updateShowResultsOnMapButton();
  updateMapOptionsState();
}


// --------------------------------------------------------
// Results list
// --------------------------------------------------------
function renderMonumentResultsList(records) {
  if (!resultsList) return;

  const start = records.length === 0 ? 0 : monumentPageOffset + 1;
  const end = monumentPageOffset + records.length;

  const countText = monumentTotalIsExact
    ? t("results_count_total", "{start}-{end} ({total} total)")
        .replace("{start}", start)
        .replace("{end}", end)
        .replace("{total}", monumentTotalCount)
    : t("results_count_matching", "{start}-{end} matching records")
        .replace("{start}", start)
        .replace("{end}", end);

  setMonumentResultsCountText(countText);

  if (records.length === 0) {
    resultsList.innerHTML = `
      <div class="results-empty">
        <p>${t("no_matching_records", "No matching records.")}</p>
      </div>
    `;
    return;
  }

  resultsList.innerHTML = records
  .map((record, index) => {
    return `
      <div
        class="result-card ${Number(monumentSelectedRecord?.identity?.id) === Number(record.identity?.id) ? "is-selected" : ""}"
        data-result-index="${index}"
      >
        <div class="result-card-topline">
          <strong>${mSafeValue(monumentResultTitle(record))}</strong>
          <span class="scope-badge">${mSafeValue(monumentScopeLabel(monumentDisplayScope(record)))}</span>
        </div>

        <div class="result-card-meta">${mSafeValue(mIdentity(record, "caal_id"))}</div>
        <div class="result-card-meta">${mSafeValue(mSummary(record, "classification"))}</div>
        <div class="result-card-meta">${mSafeValue(mSummary(record, "monument_type1"))}</div>

        <div class="result-card-actions">
          <button
            type="button"
            class="action-btn result-preview-btn"
            data-preview-index="${index}"
          >
            ${t("preview", "Preview")}
          </button>
        </div>
      </div>
    `;
  })
  .join("");

  Array.from(resultsList.querySelectorAll(".result-card")).forEach((card) => {
    card.addEventListener("click", async () => {
      if (!monumentConfirmLoseChanges()) return;

      const idx = Number(card.dataset.resultIndex);
      const lightRecord = records[idx];
      if (!lightRecord) return;

      setMonumentsLoading(true, t("loading_full_record", "Loading full record..."));

      try {
        const fullRecord = await loadFullMonumentRecord(lightRecord);

        monumentIsEditMode = false;
        monumentSyncModeVisualState();
        monumentPendingNewRecord = null;
        monumentSelectedRecord = fullRecord;
        clearRelatedMonumentsMap();

        clearRelationshipStateForNewSelection();

        renderMonumentRecordDetails(fullRecord);
        updateSelectedResultCard();

        if (map && fullRecord.geometry?.coordinates) {
          drawSelectedMonumentHighlight(fullRecord);
        } else if (map && lightRecord.geometry?.coordinates) {
          drawSelectedMonumentHighlight(lightRecord);
        }
      } catch (error) {
        console.error("Failed to load full monument record:", error);
        alert(error.message || "Could not load full monument record");
      } finally {
        setMonumentsLoading(false);
      }
    });

  });
  Array.from(resultsList.querySelectorAll(".result-preview-btn")).forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();

      const idx = Number(btn.dataset.previewIndex);
      const lightRecord = records[idx];
      if (!lightRecord) return;

      setMonumentsLoading(true, t("loading_preview", "Loading preview..."));

      try {
        const fullRecord = await loadFullMonumentRecord(lightRecord);
        renderMonumentPreviewModal(fullRecord);
      } catch (error) {
        console.error("Failed to load monument preview:", error);
        alert(error.message || t("could_not_load_monument_preview", "Could not load monument preview"));
      } finally {
        setMonumentsLoading(false);
      }
    });
  });
}

// --------------------------------------------------------
// Empty state
// --------------------------------------------------------
function renderMonumentEmptyState({ preserveSelection = false } = {}) {
  if (!recordDetails) return;

  if (!preserveSelection) {
    monumentSelectedRecord = null;
  }

  recordDetails.innerHTML = `
    <div class="empty-state">
      <p>${t("no_record_selected", "No record selected yet.")}</p>
    </div>
  `;

  updateMonumentActionBar();
  clearPendingPickPoint();
  updateAddModeUI();
  updateMapOptionsState();
}

// --------------------------------------------------------
// Display mode
// --------------------------------------------------------
async function moveSelection(direction) {
  if (!monumentListRecords.length) return;

  const currentIndex = monumentListRecords.findIndex(
    r => Number(r.identity?.id) === Number(monumentSelectedRecord?.identity?.id)
  );

  let newIndex = currentIndex + direction;

  if (currentIndex === -1) {
    newIndex = direction > 0 ? 0 : monumentListRecords.length - 1;
  }

  if (newIndex < 0) newIndex = 0;
  if (newIndex >= monumentListRecords.length) newIndex = monumentListRecords.length - 1;

  const lightRecord = monumentListRecords[newIndex];
  if (!lightRecord) return;

  setMonumentsLoading(true, t("loading_full_record", "Loading full record..."));

  try {
    const fullRecord = await loadFullMonumentRecord(lightRecord);

    monumentSelectedRecord = fullRecord;
    clearRelationshipStateForNewSelection();
    clearRelatedMonumentsMap();
    renderMonumentRecordDetails(fullRecord);
    updateSelectedResultCard();

    if (fullRecord.geometry?.coordinates) {
      drawSelectedMonumentHighlight(fullRecord);
    } else {
      drawSelectedMonumentHighlight(lightRecord);
    }
  } catch (error) {
    console.error("Failed to load full monument record:", error);
    alert(error.message || t("could_not_load_full_monument_record", "Could not load full monument record"));
  } finally {
    setMonumentsLoading(false);
  }
}

function renderMonumentRecordDetails(record) {
  monumentSelectedRecord = record;

  if (monumentIsEditMode) {
    renderMonumentEditMode(record);
  } else {
    renderMonumentDisplayMode(record);
  }

  updateMonumentActionBar();
  updateAddModeUI();
  updateMapOptionsState();
}

function renderMonumentDisplayMode(record) {
  const appSession = window.appSession || null;
  const accessLevel =
    Number(
      window.appSession?.user?.access_level ??
      window.appSession?.profile?.access_level ??
      0
    );

  const currentAppUserId = window.appSession?.user?.user_id ?? null;
  const recordAppUserId = record?.raw?.created_by_app_user_id ?? null;

  const isOwner =
    currentAppUserId !== null &&
    recordAppUserId !== null &&
    Number(currentAppUserId) === Number(recordAppUserId);

  const isSuperUser =
    window.appSession?.permissions?.can_edit_caal === true;

  const isWorkspaceRecord = record.source?.scope === "workspace";
  const isCaalRecord =
    record.source?.scope === "national_ref" ||
    record.source?.scope === "all_caal";

  const canEditThisRecord = canEditMonumentRecord(record);

  const statusBadge = canEditThisRecord
    ? `<span class="record-status-badge record-status-editable">${mLabel("Editable", "Editable")}</span>`
    : `<span class="record-status-badge record-status-readonly">${mLabel("Read only", "Read only")}</span>`;
    
  const locationHtml = [
    mRenderDetailItem(mLabel("Longitude", "Longitude"), mDisplayLongitude(record)),
    mRenderDetailItem(mLabel("Latitude", "Latitude"), mDisplayLatitude(record)),
    mRenderDetailItem(mLabel("Altitude", "Altitude"), mRaw(record, "Altitude")),
    mRenderDetailItem(
      mLabel("Location Confidence", "Location Confidence"),
      mLookupLabel("location_confidence", mRaw(record, "Location Confidence"))
    ),
    mRenderDetailItem(mLabel("Location Notes", "Location Notes"), mRaw(record, "Location Notes"), true),
    mRenderDetailItem(mLabel("Primary Address", "Primary Address"), mRaw(record, "Primary Address"), true)
  ].join("");

  const basicHtml = [
    mRenderDetailItem(mLabel("Primary Name", "Primary Name"), mSummary(record, "primary_name"), true),
    mRenderDetailItem(mLabel("Primary Name (English)", "Primary Name (English)"), mSummary(record, "primary_name_english"), true),
    mRenderDetailItem(mLabel("Other Names", "Other Names"), mRaw(record, "Other Names"), true),
    mRenderDetailItem(mLabel("Country", "Country"), mSummary(record, "country")),
    mRenderDetailItem(mLabel("Region", "Region"), mSummary(record, "region")),
    mRenderDetailItem(mLabel("Classification", "Classification"), mSummary(record, "classification")),
    mRenderDetailItem(mLabel("CAAL_ID", "CAAL_ID"), mIdentity(record, "caal_id")),
    mRenderDetailItem(mLabel("Internal Reference", "Internal Reference"), mRaw(record, "Internal Reference")),
    mRenderDetailItem(mLabel("External Reference", "External Reference"), mRaw(record, "External Reference")),
    mRenderDetailItem(mLabel("Designation", "Designation"), mSummary(record, "designation")),
    mRenderDetailItem(mLabel("World Heritage Site Name", "World Heritage Site Name"), mRaw(record, "World Heritage Site Name"))
  ].join("");

  const monumentHtml = [
    mRenderDetailItem(mLabel("Monument Passport", "Monument Passport"), mRaw(record, "Monument Passport"), true),
    mRenderDetailItem(mLabel("Monument Type1", "Monument Type1"), mLookupLabel("monument_type", mRaw(record, "Monument Type1"))),
    mRenderDetailItem(mLabel("Monument Type2", "Monument Type2"), mLookupLabel("monument_type", mRaw(record, "Monument Type2"))),
    mRenderDetailItem(mLabel("Monument Type3", "Monument Type3"), mLookupLabel("monument_type", mRaw(record, "Monument Type3"))),
    mRenderDetailItem(mLabel("Monument Type4", "Monument Type4"), mLookupLabel("monument_type", mRaw(record, "Monument Type4"))),
    mRenderDetailItem(mLabel("Monument Type5", "Monument Type5"), mLookupLabel("monument_type", mRaw(record, "Monument Type5"))),
    mRenderDetailItem(mLabel("Monument Type6", "Monument Type6"), mLookupLabel("monument_type", mRaw(record, "Monument Type6"))),
    mRenderDetailItem(mLabel("Religion1", "Religion1"), mLookupLabel("religion", mRaw(record, "Religion1"))),
    mRenderDetailItem(mLabel("Religion2", "Religion2"), mLookupLabel("religion", mRaw(record, "Religion2"))),
    mRenderDetailItem(mLabel("Religion3", "Religion3"), mLookupLabel("religion", mRaw(record, "Religion3"))),
    mRenderDetailItem(mLabel("Descriptive Date", "Descriptive Date"), mRaw(record, "Descriptive Date"), true),
    mRenderDetailItem(mLabel("Cultural Period1", "Cultural Period1"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period1"))),
    mRenderDetailItem(mLabel("Cultural Period2", "Cultural Period2"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period2"))),
    mRenderDetailItem(mLabel("Cultural Period3", "Cultural Period3"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period3"))),
    mRenderDetailItem(mLabel("Cultural Period4", "Cultural Period4"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period4"))),
    mRenderDetailItem(mLabel("Cultural Period5", "Cultural Period5"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period5"))),
    mRenderDetailItem(mLabel("Cultural Period6", "Cultural Period6"), mLookupLabel("cultural_period", mRaw(record, "Cultural Period6"))),
    mRenderDetailItem(mLabel("Start Date", "Start Date"), mRaw(record, "Start Date")),
    mRenderDetailItem(mLabel("End Date", "End Date"), mRaw(record, "End Date")),
    mRenderDetailItem(mLabel("Primary Description", "Primary Description"), mRaw(record, "Primary Description"), true),
    mRenderDetailItem(mLabel("Primary Description (English)", "Primary Description (English)"), mRaw(record, "Primary Description (English)"), true),
    mRenderDetailItem(mLabel("Additional Notes", "Additional Notes"), mRaw(record, "Additional Notes"), true)
  ].join("");

  const adminHtml = [
    mRenderDetailItem(mLabel("Administrative Subdivision Name1", "Administrative Subdivision Name1"), mRaw(record, "Administrative Subdivision Name1")),
    mRenderDetailItem(mLabel("Administrative Subdivision Type1", "Administrative Subdivision Type1"), mLookupLabel("admin_subdivision_type", mRaw(record, "Administrative Subdivision Type1"))),
    mRenderDetailItem(mLabel("Administrative Subdivision Name2", "Administrative Subdivision Name2"), mRaw(record, "Administrative Subdivision Name2")),
    mRenderDetailItem(mLabel("Administrative Subdivision Type2", "Administrative Subdivision Type2"), mLookupLabel("admin_subdivision_type", mRaw(record, "Administrative Subdivision Type2"))),
    mRenderDetailItem(mLabel("Administrative Subdivision Name3", "Administrative Subdivision Name3"), mRaw(record, "Administrative Subdivision Name3")),
    mRenderDetailItem(mLabel("Administrative Subdivision Type3", "Administrative Subdivision Type3"), mLookupLabel("admin_subdivision_type", mRaw(record, "Administrative Subdivision Type3"))),
    mRenderDetailItem(mLabel("Administrative Subdivision Name4", "Administrative Subdivision Name4"), mRaw(record, "Administrative Subdivision Name4")),
    mRenderDetailItem(mLabel("Administrative Subdivision Type4", "Administrative Subdivision Type4"), mLookupLabel("admin_subdivision_type", mRaw(record, "Administrative Subdivision Type4")))
  ].join("");

  const measurementsHtml = `
  ${mRenderMeasurementDisplaySet(1, record)}
  ${mRenderMeasurementDisplaySet(2, record)}
  ${mRenderMeasurementDisplaySet(3, record)}
  ${mRenderMeasurementDisplaySet(4, record)}
`;

  const measurementsHasValues = measurementsHtml.trim() !== "";

  const relatedIds = [
    ...parseRelatedIds(mRaw(record, "Monument is part of")),
    ...parseRelatedIds(mRaw(record, "Monument contains")),
    ...parseRelatedIds(mRaw(record, "Monument is associated with"))
  ];

  const hasRelatedIds = relatedIds.length > 0;

  const relatedHtml = [
    `
      <div class="detail-item full-width related-map-actions">
        <div class="related-map-actions-text">
          <strong>${mLabel("Relationship map", "Relationship map")}</strong>
          <p>
            ${hasRelatedIds
              ? mLabel(
                  "Show this monument together with its linked monument records on the map.",
                  "Show this monument together with its linked monument records on the map."
                )
              : mLabel(
                  "No related IDs are recorded for this monument.",
                  "No related IDs are recorded for this monument."
                )
            }
          </p>
        </div>

        <button
          type="button"
          class="action-btn"
          id="showRelatedMonumentsOnMapBtn"
          ${hasRelatedIds ? "" : "disabled"}
        >
          ${mLabel("Show relationships on map", "Show relationships on map")}
        </button>

        <button
          type="button"
          class="action-btn"
          id="clearRelatedMonumentsMapBtn"
          hidden
        >
          ${mLabel("Clear relationship map", "Clear relationship map")}
        </button>
      </div>
    `,

    mRenderRelatedIdList(
      mLabel("Monument is part of", "Monument is part of"),
      mRaw(record, "Monument is part of"),
      true
    ),

    mRenderRelatedIdList(
      mLabel("Monument contains", "Monument contains"),
      mRaw(record, "Monument contains"),
      true
    ),

    mRenderRelatedIdList(
      mLabel("Monument is associated with", "Monument is associated with"),
      mRaw(record, "Monument is associated with"),
      true
    )
  ].join("");

  const metadataHtml = [
    mRenderDetailItem(
      mLabel("Preferred Language", "Preferred Language"),
      displayLanguageName(mRaw(record, "Preferred Language"))
    ),
    mRenderDetailItem(
      mLabel("Recorder", "Recorder"),
      mRaw(record, "Recorder") || mSummary(record, "recorder")
    ),
    mRenderDetailItem(
      mLabel("Date of Recording", "Date of Recording"),
      mDateOnly(mRaw(record, "Date of Recording") || mSummary(record, "date_of_recording"))
    ),
    mRenderDetailItem(
      mLabel("Tstamp", "Tstamp"),
      mDateOnly(mRaw(record, "Tstamp"))
    ),
    mRenderDetailItem(
      mLabel("MasterID", "MasterID"),
      mRaw(record, "MasterID")
    )
  ].join("");

  recordDetails.innerHTML = `
    <div class="record-title">
      <div class="record-title-row">
        <h3>${mSafeValue(mSummary(record, "primary_name"))}</h3>
        ${statusBadge}
      </div>

      <p>${mSafeValue(mIdentity(record, "caal_id"))}</p>

      ${renderMasterIdChip(record)}

      <div class="record-title-actions">
        <button type="button" class="action-btn" id="zoomToSelectedMonumentBtn">
          ${mLabel("Centre on map", "Centre on map")}
        </button>

        <button type="button" class="action-btn" id="clearSelectedMonumentBtn">
          ${mLabel("Close record", "Close record")}
        </button>
      </div>
    </div>

    <div class="group-stack">
      ${mRenderGroupBlock(mLabel("Location", "Location"), locationHtml, true)}
      ${mRenderGroupBlock(mLabel("Basic", "Basic"), basicHtml, true)}
      ${mRenderGroupBlock(mLabel("Monument", "Monument"), monumentHtml, true)}
      ${mRenderGroupBlock(mLabel("Administration", "Administration"), adminHtml, true)}
      ${mRenderGroupBlock(mLabel("Measurements", "Measurements"), measurementsHtml, measurementsHasValues)}
      ${mRenderGroupBlock(mLabel("Related resources", "Related resources"), relatedHtml, true)}
      ${mRenderGroupBlock(mLabel("Metadata", "Metadata"), metadataHtml, true)}
    </div>
  `;
  const zoomBtn = document.getElementById("zoomToSelectedMonumentBtn");

  if (zoomBtn) {
    zoomBtn.addEventListener("click", () => {
      if (!record?.geometry?.coordinates || !map) return;

      drawSelectedMonumentHighlight(record);

      map.easeTo({
        center: record.geometry.coordinates,
  //      zoom: Math.max(map.getZoom(), 10),
        duration: 600
      });
    });
  }
  const clearSelectedBtn = document.getElementById("clearSelectedMonumentBtn");

  if (clearSelectedBtn) {
    clearSelectedBtn.addEventListener("click", clearSelectedMonumentRecord);
  }
  wireRelatedRecordChips();
  wireMasterIdChip();

  const showRelatedMapBtn = document.getElementById("showRelatedMonumentsOnMapBtn");
  const clearRelatedMapBtn = document.getElementById("clearRelatedMonumentsMapBtn");

  if (showRelatedMapBtn) {
    showRelatedMapBtn.addEventListener("click", async () => {
      await showRelatedMonumentsOnMap(record);

      if (clearRelatedMapBtn) {
        clearRelatedMapBtn.hidden = false;
      }
    });
  }

  if (clearRelatedMapBtn) {
    clearRelatedMapBtn.addEventListener("click", () => {
      clearRelatedMonumentsMap();

      clearRelatedMapBtn.hidden = true;
    });
  }
  validateDisplayedRelatedIds();
}

async function showRelatedMonumentsOnMap(record = monumentSelectedRecord) {
  if (!map || !record) return;

  const relatedIds = [
    ...parseRelatedIds(mRaw(record, "Monument is part of")),
    ...parseRelatedIds(mRaw(record, "Monument contains")),
    ...parseRelatedIds(mRaw(record, "Monument is associated with"))
  ];

  const uniqueIds = Array.from(new Set(relatedIds));

  if (!record?.geometry?.coordinates && uniqueIds.length === 0) return;

  const resolved = await Promise.all(
    uniqueIds.map((caalId) => resolveRelatedRecordStatus(caalId))
  );

  const relatedMonuments = resolved.filter(
    (item) =>
      item.status === "found" &&
      item.recordType === "monument" &&
      Array.isArray(item.record?.geometry?.coordinates)
  );

  const features = [];

  if (record?.geometry?.coordinates) {
    features.push({
      type: "Feature",
      geometry: record.geometry,
      properties: {
        role: "selected",
        caal_id: record.identity?.caal_id || "",
        label:
          mSummary(record, "primary_name") ||
          mSummary(record, "primary_name_english") ||
          record.identity?.caal_id ||
          ""
      }
    });
  }

  relatedMonuments.forEach((item) => {
    features.push({
      type: "Feature",
      geometry: item.record.geometry,
      properties: {
        role: "related",
        caal_id: item.caalId,
        label:
          mSummary(item.record, "primary_name") ||
          mSummary(item.record, "primary_name_english") ||
          item.caalId
      }
    });
  });

  if (record?.geometry?.coordinates) {
    relatedMonuments.forEach((item) => {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            record.geometry.coordinates,
            item.record.geometry.coordinates
          ]
        },
        properties: {
          role: "relationship",
          caal_id: item.caalId
        }
      });
    });
  }

  if (!features.length) {
    alert(t("no_related_monument_locations_found", "No related monument locations found."));
    return;
  }

    const geojson = {
    type: "FeatureCollection",
    features
  };

  if (showRelatedPointsCheckbox) {
    showRelatedPointsCheckbox.dataset.userChanged = "false";
    showRelatedPointsCheckbox.checked = true;
  }

  if (showRelationshipLinesCheckbox) {
    showRelationshipLinesCheckbox.dataset.userChanged = "false";
    showRelationshipLinesCheckbox.checked = true;
  }

  monumentRelatedSelectionGeojson = geojson;

  renderRelatedMonumentsMapOverlay();

  const coords = features
    .filter((feature) => feature?.geometry?.type === "Point")
    .map((feature) => feature.geometry?.coordinates)
    .filter((coords) => Array.isArray(coords) && coords.length === 2);

  if (coords.length) {
    const bounds = coords.reduce(
      (b, coords) => b.extend(coords),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );

    map.fitBounds(bounds, {
      padding: 90,
      maxZoom: 10,
      duration: 700
    });
  }

  updateMapOptionsState();
  renderMonumentLegend();
}

// --------------------------------------------------------
// Edit mode
// --------------------------------------------------------
function mRenderMeasurementEditSet(index, record) {
  return `
    <div class="measurement-row measurement-row-edit">
      <div class="measurement-row-title">
        ${mLabel(`Measurement ${index}`, `Measurement ${index}`)}
      </div>

      <div class="measurement-row-fields">
        ${mRenderNumberInput(
          `Measurement Value${index}`,
          mLabel("Value", "Value"),
          mRaw(record, `Measurement Value${index}`)
        )}

        ${mRenderSelect(
          `Measurement Unit${index}`,
          mLabel("Unit", "Unit"),
          "measurement_unit",
          mRaw(record, `Measurement Unit${index}`)
        )}

        ${mRenderSelect(
          `Measurement Type${index}`,
          mLabel("Type", "Type"),
          "measurement_type",
          mRaw(record, `Measurement Type${index}`)
        )}
      </div>
    </div>
  `;
}

function renderMonumentEditMode(record) {
  recordDetails.innerHTML = `
    <div class="record-title">
      <h3>${mSafeValue(mSummary(record, "primary_name"))}</h3>
      <p>${mSafeValue(mIdentity(record, "caal_id"))}</p>
    </div>

    <div class="group-stack">

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Location", "Location")}</span>
          </div>

          <div class="detail-item full-width">
            <button type="button" class="action-btn primary" id="monumentInlinePickPointBtn">
              ${mLabel("Select point on map", "Select point on map")}
            </button>

            <button type="button" class="action-btn" id="monumentInlineCancelPickPointBtn" hidden>
              ${mLabel("Cancel point selection", "Cancel point selection")}
            </button>

            <p id="monumentLocationPickNotice" class="filter-help" hidden>
              ${mLabel("Click the map to set this monument location.", "Click the map to set this monument location.")}
            </p>
          </div>

          ${mRenderNumberInput("Longitude", mLabel("Longitude", "Longitude"), mRaw(record, "Longitude"), "0.000001")}
          ${mRenderNumberInput("Latitude", mLabel("Latitude", "Latitude"), mRaw(record, "Latitude"), "0.000001")}
          ${mRenderNumberInput("Altitude", mLabel("Altitude", "Altitude"), mRaw(record, "Altitude"), "any")}
          ${mRenderSelect("Location Confidence", mLabel("Location Confidence", "Location Confidence"), "location_confidence", mRaw(record, "Location Confidence"))}
          ${mRenderTextarea("Location Notes", mLabel("Location Notes", "Location Notes"), mRaw(record, "Location Notes"), true)}
          ${mRenderTextInput("Primary Address", mLabel("Primary Address", "Primary Address"), mRaw(record, "Primary Address"), true)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Basic", "Basic")}</span>
          </div>

          ${mRenderTextInput("Primary Name", mLabel("Primary Name", "Primary Name"), mRaw(record, "Primary Name"), true)}
          ${mRenderTextInput("Primary Name (English)", mLabel("Primary Name (English)", "Primary Name (English)"), mRaw(record, "Primary Name (English)"), true)}
          ${mRenderTextInput("Other Names", mLabel("Other Names", "Other Names"), mRaw(record, "Other Names"), true)}

          ${mRenderSelect("Country", mLabel("Country", "Country"), "country", mRaw(record, "Country"))}
          ${mRenderTextInput("Region", mLabel("Region", "Region"), mRaw(record, "Region"))}

          ${mRenderSelect("Classification", mLabel("Classification", "Classification"), "classification", mRaw(record, "Classification"))}
          ${mRenderReadOnlyItem(mLabel("CAAL_ID", "CAAL_ID"), mIdentity(record, "caal_id"))}

          ${mRenderTextInput("Internal Reference", mLabel("Internal Reference", "Internal Reference"), mRaw(record, "Internal Reference"))}
          ${mRenderTextInput("External Reference", mLabel("External Reference", "External Reference"), mRaw(record, "External Reference"))}

          ${mRenderSelect("Designation", mLabel("Designation", "Designation"), "designation", mRaw(record, "Designation"))}
          ${mRenderTextInput("World Heritage Site Name", mLabel("World Heritage Site Name", "World Heritage Site Name"), mRaw(record, "World Heritage Site Name"))}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Monument", "Monument")}</span>
          </div>

          ${mRenderTextInput("Monument Passport", mLabel("Monument Passport", "Monument Passport"), mRaw(record, "Monument Passport"), true)}

          ${mRenderLegacyMultiSelect({
            fieldBase: "Monument Type",
            count: 6,
            label: mLabel("Monument Types", "Monument Types"),
            lookupName: "monument_type",
            record,
            fullWidth: true
          })}

          ${mRenderLegacyMultiSelect({
            fieldBase: "Religion",
            count: 3,
            label: mLabel("Religions", "Religions"),
            lookupName: "religion",
            record,
            fullWidth: true
          })}

          ${mRenderTextInput("Descriptive Date", mLabel("Descriptive Date", "Descriptive Date"), mRaw(record, "Descriptive Date"), true)}

          ${mRenderLegacyMultiSelect({
            fieldBase: "Cultural Period",
            count: 6,
            label: mLabel("Cultural Periods", "Cultural Periods"),
            lookupName: "cultural_period",
            record,
            fullWidth: true
          })}
          ${mRenderNumberInput("Start Date", mLabel("Start Date", "Start Date"), mRaw(record, "Start Date"), "1")}
          ${mRenderNumberInput("End Date", mLabel("End Date", "End Date"), mRaw(record, "End Date"), "1")}
          
          ${mRenderTextarea("Primary Description", mLabel("Primary Description", "Primary Description"), mRaw(record, "Primary Description"), true)}
          ${mRenderTextarea("Primary Description (English)", mLabel("Primary Description (English)", "Primary Description (English)"), mRaw(record, "Primary Description (English)"), true)}
          ${mRenderTextarea("Additional Notes", mLabel("Additional Notes", "Additional Notes"), mRaw(record, "Additional Notes"), true)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Administration", "Administration")}</span>
          </div>
          ${mRenderTextInput("Administrative Subdivision Name1", mLabel("Administrative Subdivision Name1", "Administrative Subdivision Name1"), mRaw(record, "Administrative Subdivision Name1"))}
          ${mRenderSelect("Administrative Subdivision Type1", mLabel("Administrative Subdivision Type1", "Administrative Subdivision Type1"), "admin_subdivision_type", mRaw(record, "Administrative Subdivision Type1"))}
          ${mRenderTextInput("Administrative Subdivision Name2", mLabel("Administrative Subdivision Name2", "Administrative Subdivision Name2"), mRaw(record, "Administrative Subdivision Name2"))}
          ${mRenderSelect("Administrative Subdivision Type2", mLabel("Administrative Subdivision Type2", "Administrative Subdivision Type2"), "admin_subdivision_type", mRaw(record, "Administrative Subdivision Type2"))}
          ${mRenderTextInput("Administrative Subdivision Name3", mLabel("Administrative Subdivision Name3", "Administrative Subdivision Name3"), mRaw(record, "Administrative Subdivision Name3"))}
          ${mRenderSelect("Administrative Subdivision Type3", mLabel("Administrative Subdivision Type3", "Administrative Subdivision Type3"), "admin_subdivision_type", mRaw(record, "Administrative Subdivision Type3"))}
          ${mRenderTextInput("Administrative Subdivision Name4", mLabel("Administrative Subdivision Name4", "Administrative Subdivision Name4"), mRaw(record, "Administrative Subdivision Name4"))}
          ${mRenderSelect("Administrative Subdivision Type4", mLabel("Administrative Subdivision Type4", "Administrative Subdivision Type4"), "admin_subdivision_type", mRaw(record, "Administrative Subdivision Type4"))}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Measurements", "Measurements")}</span>
          </div>
          ${mRenderMeasurementEditSet(1, record)}
          ${mRenderMeasurementEditSet(2, record)}
          ${mRenderMeasurementEditSet(3, record)}
          ${mRenderMeasurementEditSet(4, record)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Related resources", "Related resources")}</span>
          </div>

          ${mRenderTextInput("Monument is part of", mLabel("Monument is part of", "Monument is part of"), mRaw(record, "Monument is part of"), true)}
          ${mRenderTextInput("Monument contains", mLabel("Monument contains", "Monument contains"), mRaw(record, "Monument contains"), true)}
          ${mRenderTextInput("Monument is associated with", mLabel("Monument is associated with", "Monument is associated with"), mRaw(record, "Monument is associated with"), true)}
        </div>
      </div>

      <div class="group-block">
        <div class="group-grid">
          <div class="detail-item full-width section-header">
            <span class="detail-section-title">${mLabel("Metadata", "Metadata")}</span>
          </div>

          ${mRenderReadOnlyItem(mLabel("Preferred Language", "Preferred Language"),displayLanguageName(mRaw(record, "Preferred Language")))}
          ${mRenderReadOnlyItem(mLabel("Recorder", "Recorder"), mRaw(record, "Recorder"))}
          ${mRenderReadOnlyItem(mLabel("Date of Recording", "Date of Recording"), mDateOnly(mRaw(record, "Date of Recording")) || mLabel("Set automatically on save", "Set automatically on save"))}
          ${mRenderReadOnlyItem(mLabel("Tstamp", "Tstamp"), mDateOnly(mRaw(record, "Tstamp")))}
          ${
            monumentUserCanEditMasterId()
              ? mRenderTextInput("MasterID", mLabel("MasterID", "MasterID"), mRaw(record, "MasterID"))
              : mRenderReadOnlyItem(mLabel("MasterID", "MasterID"), mRaw(record, "MasterID"))
          }
        </div>
      </div>
    </div>
  `;

const startDateInput = document.getElementById(mInputId("Start Date"));
const endDateInput = document.getElementById(mInputId("End Date"));

if (startDateInput) startDateInput.readOnly = true;
if (endDateInput) endDateInput.readOnly = true;

  function bindMonumentDirtyTracking() {
    Array.from(
      document.querySelectorAll(
        "#monumentDetailPane input, #monumentDetailPane textarea, #monumentDetailPane select"
      )
    ).forEach((el) => {
      el.addEventListener("input", () => {
        monumentIsDirty = true;
      });

      el.addEventListener("change", () => {
        monumentIsDirty = true;
      });
    });
  }
  bindMonumentDirtyTracking();
  mWireEditMultiSelects();
  recalculateMonumentDates(record);
  wireInlineLocationButtons();
  updateAddModeUI();
}


// --------------------------------------------------------
// Add mode
// --------------------------------------------------------
function makeNewBlankMonumentRecord() {
  const lang =
    (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
    window.appSession?.profile?.preferred_language ||
    "en";

  const sessionCountry = window.appSession?.profile?.country || "";
  const sessionUsername = window.appSession?.user?.username || "";
  const today = new Date().toISOString().slice(0, 10);

  return {
    identity: {
      id: null,
      caal_id: "[new record - unsaved]"
    },
    summary: {
      primary_name: "",
      primary_name_english: "",
      country: sessionCountry,
      region: "",
      classification: "",
      designation: "",
      monument_type1: "",
      cultural_period1: "",
      religion1: "",
      longitude: "",
      latitude: "",
      recorder: sessionUsername,
      date_of_recording: today
    },
    raw: {
      "Primary Name": "",
      "Primary Name (English)": "",
      "Other Names": "",
      "Country": sessionCountry,
      "Region": "",
      "Classification": "",
      "CAAL_ID": "",
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
      "Preferred Language": lang,
      "Recorder": sessionUsername,
      "MasterID": "",
      "Tstamp": "",
      "Date of Recording": today,
      "Start Date": "",
      "End Date": ""
    },
    geometry: null,
    source: {
      scope: "workspace",
      is_editable: true,
      is_new: true
    },
    filter_values: {
      monument_types: [],
      religions: [],
      cultural_periods: [],
      classification: "",
      designation: "",
      country: sessionCountry
    }
  };
}

function startMonumentPointSelection() {
  if (!monumentSelectedRecord) return;

  monumentIsAddMode = true;
  updateAddModeUI();
}

function cancelMonumentPointSelection() {
  monumentIsAddMode = false;
  clearPendingPickPoint();
  updateAddModeUI();
}

function wireInlineLocationButtons() {
  const inlinePickBtn = document.getElementById("monumentInlinePickPointBtn");
  const inlineCancelBtn = document.getElementById("monumentInlineCancelPickPointBtn");

  if (inlinePickBtn) {
    inlinePickBtn.addEventListener("click", startMonumentPointSelection);
  }

  if (inlineCancelBtn) {
    inlineCancelBtn.addEventListener("click", cancelMonumentPointSelection);
  }
}

function updateAddModeUI() {
  if (map) {
    map.getContainer().style.cursor = monumentIsAddMode ? "crosshair" : "";
  }

  const inlinePickBtn = document.getElementById("monumentInlinePickPointBtn");
  const inlineCancelBtn = document.getElementById("monumentInlineCancelPickPointBtn");
  const inlineNotice = document.getElementById("monumentLocationPickNotice");

  if (inlinePickBtn) {
    inlinePickBtn.hidden = monumentIsAddMode;
  }

  if (inlineCancelBtn) {
    inlineCancelBtn.hidden = !monumentIsAddMode;
  }

  if (inlineNotice) {
    inlineNotice.hidden = !monumentIsAddMode;
  }
}

function syncCurrentMonumentFormIntoSelectedRecord() {
  if (!monumentSelectedRecord || !monumentSelectedRecord.raw) return;

  // Only harvest form values while actually editing/adding.
  if (!monumentIsEditMode && !monumentPendingNewRecord) return;

  const payload = mBuildSavePayload();

  Object.entries(payload).forEach(([field, value]) => {
    monumentSelectedRecord.raw[field] = value;
  });

  monumentSelectedRecord.summary.primary_name = payload["Primary Name"] ?? "";
  monumentSelectedRecord.summary.primary_name_english = payload["Primary Name (English)"] ?? "";
  monumentSelectedRecord.summary.country = payload["Country"] ?? "";
  monumentSelectedRecord.summary.region = payload["Region"] ?? "";
  monumentSelectedRecord.summary.classification = payload["Classification"] ?? "";
  monumentSelectedRecord.summary.designation = payload["Designation"] ?? "";
  monumentSelectedRecord.summary.monument_type1 = payload["Monument Type1"] ?? "";
  monumentSelectedRecord.summary.cultural_period1 = payload["Cultural Period1"] ?? "";
  monumentSelectedRecord.summary.religion1 = payload["Religion1"] ?? "";
  monumentSelectedRecord.summary.recorder = payload["Recorder"] ?? monumentSelectedRecord.summary.recorder;
  monumentSelectedRecord.summary.date_of_recording =
    payload["Date of Recording"] ?? monumentSelectedRecord.summary.date_of_recording;

  monumentSelectedRecord.filter_values = {
    monument_types: [
      payload["Monument Type1"],
      payload["Monument Type2"],
      payload["Monument Type3"],
      payload["Monument Type4"],
      payload["Monument Type5"],
      payload["Monument Type6"]
    ].filter(Boolean),
    religions: [
      payload["Religion1"],
      payload["Religion2"],
      payload["Religion3"]
    ].filter(Boolean),
    cultural_periods: [
      payload["Cultural Period1"],
      payload["Cultural Period2"],
      payload["Cultural Period3"],
      payload["Cultural Period4"],
      payload["Cultural Period5"],
      payload["Cultural Period6"]
    ].filter(Boolean),
    classification: payload["Classification"] ?? "",
    designation: payload["Designation"] ?? "",
    country: payload["Country"] ?? ""
  };
}

function updateCoordinateInputs(lng, lat) {
  const lngInput = document.getElementById(mInputId("Longitude"));
  const latInput = document.getElementById(mInputId("Latitude"));

  if (lngInput) lngInput.value = lng;
  if (latInput) latInput.value = lat;
}

function applyMapClickToSelectedRecord(latlng) {
  if (!monumentSelectedRecord) return;

  syncCurrentMonumentFormIntoSelectedRecord();

  const lng = Number(latlng.lng.toFixed(6));
  const lat = Number(latlng.lat.toFixed(6));

  monumentSelectedRecord.raw["Longitude"] = lng;
  monumentSelectedRecord.raw["Latitude"] = lat;

  monumentSelectedRecord.summary.longitude = lng;
  monumentSelectedRecord.summary.latitude = lat;

  monumentSelectedRecord.geometry = {
    type: "Point",
    coordinates: [lng, lat]
  };

  updateCoordinateInputs(lng, lat);
  drawPendingPickPoint(lng, lat);
  monumentIsDirty = true;
}

window.monumentCanChangeLanguage = function () {
  if (!monumentIsEditMode || !monumentIsDirty) {
    return true;
  }

  const confirmed = window.confirm(
    mLabel(
      "Language change cancels editing",
      "Changing language will cancel the current edit. Continue?"
    )
  );

  if (!confirmed) {
    return false;
  }

  monumentIsEditMode = false;
  monumentSyncModeVisualState();
  monumentIsDirty = false;
  monumentPendingNewRecord = null;
  monumentIsAddMode = false;
  updateAddModeUI();

  if (monumentSelectedRecord) {
    renderMonumentRecordDetails(monumentSelectedRecord);
  } else {
    renderMonumentEmptyState();
  }

  return true;
};

// button logic 
async function saveCurrentMonumentRecord() {
  if (!monumentSelectedRecord) return;
  if (!validateRelatedFieldsBeforeSave()) return;
  if (!validateLegacyMultiSelectLimits()) return;

  const payload = mBuildSavePayload();

  const record = monumentSelectedRecord;
  const isNewRecord = !record?.identity?.id;

  if (isNewRecord && !validateNewMonumentLocationBeforeSave(payload)) {
    return;
  }

  setMonumentsLoading(true, t("saving_record", "Saving record..."));

  try {
    const lang =
      (typeof window.getCurrentLanguage === "function" && window.getCurrentLanguage()) ||
      window.appSession?.profile?.preferred_language ||
      "en";

    const url = isNewRecord
      ? `/api/monuments?lang=${encodeURIComponent(lang)}`
      : `/api/monuments/${record.identity.id}?lang=${encodeURIComponent(lang)}`;

    const method = isNewRecord ? "POST" : "PATCH";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.detail || data.error || t("monument_save_failed", "Monument save failed"));
      return;
    }

    showToast(t("record_saved", "Record saved"));
    monumentPendingNewRecord = null;
    monumentIsEditMode = false;
    monumentSyncModeVisualState();
    clearPendingPickPoint();
    monumentIsDirty = false;
    monumentIsAddMode = false;
    updateAddModeUI();

    await loadMonumentMapRecords();
    await loadMonumentListRecords();

    const refreshed =
      monumentListRecords.find((item) => item?.identity?.id === data.record?.identity?.id) ||
      monumentMapRecords.find((item) => item?.identity?.id === data.record?.identity?.id);

    if (refreshed) {
      const fullRecord = await loadFullMonumentRecord(refreshed);

      monumentSelectedRecord = fullRecord;
      clearRelationshipStateForNewSelection();
      renderMonumentRecordDetails(fullRecord);
      updateSelectedResultCard();

      if (map && fullRecord.geometry?.coordinates) {
        drawSelectedMonumentHighlight(fullRecord);
        ensureRecordVisibleOnMap(fullRecord);
      } else if (map && refreshed.geometry?.coordinates) {
        drawSelectedMonumentHighlight(refreshed);
        ensureRecordVisibleOnMap(refreshed);
      }
    } else if (data.record) {
      const fullRecord = await loadFullMonumentRecord(data.record);

      monumentSelectedRecord = fullRecord;
      clearRelationshipStateForNewSelection();
      renderMonumentRecordDetails(fullRecord);
      updateSelectedResultCard();

      if (map && fullRecord.geometry?.coordinates) {
        drawSelectedMonumentHighlight(fullRecord);
        ensureRecordVisibleOnMap(fullRecord);
      }
    } else {
      renderMonumentEmptyState();
    }
  } catch (error) {
    console.error("Monument save failed:", error);
    alert(error.message || t("monument_save_failed", "Monument save failed"));
  } finally {
    setMonumentsLoading(false);
  }
}

function cancelCurrentMonumentEdit() {
  if (monumentPendingNewRecord && monumentSelectedRecord === monumentPendingNewRecord) {
    monumentPendingNewRecord = null;
    clearPendingPickPoint();
    monumentSelectedRecord = null;
    monumentIsEditMode = false;
    updateMonumentActionBar();
    monumentSyncModeVisualState();
    monumentIsDirty = false;
    monumentIsAddMode = false;
    updateAddModeUI();
    renderMonumentEmptyState();
    return;
  }

  monumentIsEditMode = false;
  monumentSyncModeVisualState();
  monumentIsDirty = false;
  monumentIsAddMode = false;
  updateAddModeUI();

  if (monumentSelectedRecord) {
    renderMonumentRecordDetails(monumentSelectedRecord);
    updateSelectedResultCard();
  } else {
    renderMonumentEmptyState();
  }
}

async function monumentDeleteCurrentRecord() {
  const record = monumentSelectedRecord;

  if (!record?.identity?.id) return;

  if (record.source?.scope !== "workspace") {
    alert(mLabel("Only workspace records can be deleted.", "Only workspace records can be deleted."));
    return;
  }

  const caalId = record.identity?.caal_id || mLabel("this record", "this record");
  const name = record.summary?.primary_name || record.summary?.primary_name_english || "";

  const confirmed = window.confirm(
    `${mLabel("Delete monument record", "Delete monument record")} ${caalId}?\n\n${name}\n\n` +
    mLabel(
      "This will remove it from the workspace, but a recovery copy will be kept in the registry.",
      "This will remove it from the workspace, but a recovery copy will be kept in the registry."
    )
  );

  if (!confirmed) return;

  const reason = window.prompt(
    mLabel("Optional delete reason", "Optional delete reason"),
    ""
  );

  setMonumentsLoading(true, t("deleting_record", "Deleting record..."));

  try {
    const response = await fetch(`/api/monuments/${record.identity.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        reason: reason || null
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.detail || data.error || t("monument_delete_failed", "Monument delete failed"));
      return;
    }

    monumentPendingNewRecord = null;
    monumentSelectedRecord = null;
    monumentIsEditMode = false;
    monumentIsDirty = false;
    monumentIsAddMode = false;

    monumentSyncModeVisualState();
    updateAddModeUI();
    updateMonumentActionBar();
    clearPendingPickPoint();

    if (typeof showToast === "function") {
      showToast(t("monument_record_deleted", "Monument record deleted"));
    }

    await applyMonumentFilters({ includeMap: true, listFirst: true });
    renderMonumentEmptyState();
  } catch (error) {
    console.error("Monument delete failed:", error);
    alert(error.message || t("monument_delete_failed", "Monument delete failed"));
  } finally {
    setMonumentsLoading(false);
  }
}

// --------------------------------------------------------
// Events
// --------------------------------------------------------
if (resetMapBtn) {
  resetMapBtn.addEventListener("click", resetMapView);
}

if (showRelatedFromMapOptionsBtn) {
  showRelatedFromMapOptionsBtn.addEventListener("click", async () => {
    if (!selectedRecordHasRelatedIds()) return;

    await showRelatedMonumentsOnMap(monumentSelectedRecord);

    if (mapLabelScopeSelect && mapLabelScopeSelect.value === "none") {
      mapLabelScopeSelect.value = "selected_related";
      updateMapLabelHelpText();
    }

    renderLiveMapLabels();
    updateMapOptionsState();
  });
}

if (monumentPreviewCloseBtn) {
  monumentPreviewCloseBtn.addEventListener("click", () => {
    closeMonumentPreviewModal();
  });
}

if (siteSearch) {
  siteSearch.addEventListener("input", scheduleMonumentSearchAndMapRedraw);
}

if (filterCaalId) {
  filterCaalId.addEventListener("input", scheduleMonumentSearchAndMapRedraw);
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
    selectEl.addEventListener("change", () => {
      applyMonumentFilters({ includeMap: true, listFirst: true });
    });
  }
});

if (showResultsOnMapBtn) {
  showResultsOnMapBtn.addEventListener("click", () => {
    showCurrentMonumentResultsOnMap();
  });
}

if (toggleFiltersBtn && filtersPanel) {
  toggleFiltersBtn.addEventListener("click", () => {
    const isHidden = filtersPanel.hidden;
    filtersPanel.hidden = !isHidden;
    toggleFiltersBtn.textContent = isHidden
      ? t("hide_advanced_filters", "Hide advanced filters")
      : t("advanced_filters", "Advanced filters");
  });
}

if (monumentPrevBtn) {
  monumentPrevBtn.addEventListener("click", async () => {
    if (monumentPageOffset === 0) return;
    if (!monumentConfirmLoseChanges()) return;

    monumentPageOffset = Math.max(0, monumentPageOffset - monumentPageLimit);

    setMonumentsLoading(true, t("loading_page", "Loading page..."));
    try {
      await loadMonumentListRecords();
    } catch (error) {
      console.error("Failed to load previous monuments page:", error);
    } finally {
      setMonumentsLoading(false);
    }
  });
}

if (monumentNextBtn) {
  monumentNextBtn.addEventListener("click", async () => {
    if (monumentPageOffset + monumentPageLimit >= monumentTotalCount) return;
    if (!monumentConfirmLoseChanges()) return;

    monumentPageOffset += monumentPageLimit;

    setMonumentsLoading(true, t("loading_page", "Loading page..."));
    try {
      await loadMonumentListRecords();
    } catch (error) {
      console.error("Failed to load previous monuments page:", error);
    } finally {
      setMonumentsLoading(false);
    }
  });
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", async () => {
    await clearMonumentFilters();
  });
}

if (downloadMapBtn) {
  downloadMapBtn.addEventListener("click", () => {
    downloadCurrentMapImage({
      labelScope: mapLabelScopeSelect?.value || "none",
      labelMode: mapLabelModeSelect?.value || "name"
    });
  });
}

if (addMonumentBtn) {
  addMonumentBtn.addEventListener("click", () => {
    if (!monumentConfirmLoseChanges()) return;

    const newRecord = makeNewBlankMonumentRecord();
    monumentPendingNewRecord = newRecord;
    monumentSelectedRecord = newRecord;
    monumentIsEditMode = true;
    monumentSyncModeVisualState();
    monumentIsDirty = false;
    monumentIsAddMode = false;
    updateAddModeUI();
    renderMonumentRecordDetails(newRecord);
    updateSelectedResultCard();
  });
}

if (monumentEditBtn) {
  monumentEditBtn.addEventListener("click", () => {
    if (!monumentSelectedRecord) return;
    if (!canEditMonumentRecord(monumentSelectedRecord)) return;

    monumentIsEditMode = true;
    monumentSyncModeVisualState();
    monumentIsDirty = false;
    renderMonumentRecordDetails(monumentSelectedRecord);
    updateSelectedResultCard();
  });
}

if (monumentSaveBtn) {
  monumentSaveBtn.addEventListener("click", async () => {
    await saveCurrentMonumentRecord();
  });
}

if (monumentCancelEditBtn) {
  monumentCancelEditBtn.addEventListener("click", () => {
    cancelCurrentMonumentEdit();
  });
}

if (monumentDeleteBtn) {
  monumentDeleteBtn.onclick = monumentDeleteCurrentRecord;
}

if (mapOptionsBtn && mapOptionsPanel) {
  mapOptionsBtn.addEventListener("click", () => {
    updateMapOptionsState();
    mapOptionsPanel.hidden = !mapOptionsPanel.hidden;
  });
}

if (closeMapOptionsBtn && mapOptionsPanel) {
  closeMapOptionsBtn.addEventListener("click", () => {
    mapOptionsPanel.hidden = true;
  });
}

if (mapLabelScopeSelect) {
  mapLabelScopeSelect.addEventListener("change", () => {
    updateMapLabelHelpText();
    renderLiveMapLabels();
  });
}

if (mapLabelModeSelect) {
  mapLabelModeSelect.addEventListener("change", () => {
    renderLiveMapLabels();
  });
}

if (showRelatedPointsCheckbox) {
  showRelatedPointsCheckbox.addEventListener("change", () => {
    showRelatedPointsCheckbox.dataset.userChanged = "true";
    setRelationshipLayerVisibility();
  });
}

if (showRelationshipLinesCheckbox) {
  showRelationshipLinesCheckbox.addEventListener("change", () => {
    showRelationshipLinesCheckbox.dataset.userChanged = "true";
    setRelationshipLayerVisibility();
  });
}

document.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    if (monumentIsAddMode) {
      monumentIsAddMode = false;
      clearPendingPickPoint();
      updateAddModeUI();
      return;
    }

    if (monumentPreviewModal && !monumentPreviewModal.hidden) {
      closeMonumentPreviewModal();
      return;
    }
  }

  if (monumentIsEditMode) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    await moveSelection(1);
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    await moveSelection(-1);
  }
});

document.addEventListener("app:languageChanged", async () => {
  const selectedCaalId = monumentSelectedRecord?.identity?.caal_id ?? null;
  const selectedScope = monumentSelectedRecord?.source?.scope ?? null;
  const wasEditing = monumentIsEditMode;
  const pendingNew = monumentPendingNewRecord;

  setMonumentsLoading(true, t("switching_language", "Switching language..."));

  try {
    await loadMonumentLabels();
    applyMonumentStaticLabels();
    await loadMonumentLookups();
    populateMonumentFilterLookups();

    await loadMonumentMapRecords();
    await loadMonumentListRecords();

    // Preserve an unsaved brand-new local record
    if (pendingNew && selectedCaalId === null) {
      monumentPendingNewRecord = pendingNew;
      monumentSelectedRecord = pendingNew;
      monumentIsEditMode = wasEditing;
      renderMonumentRecordDetails(pendingNew);
      updateMonumentActionBar();
      return;
    }

    // Restore the currently open saved record by CAAL_ID, not numeric id
    if (selectedCaalId) {
      const sameScopeMatch =
        monumentListRecords.find((record) =>
          record?.identity?.caal_id === selectedCaalId &&
          record?.source?.scope === selectedScope
        ) ||
        monumentMapRecords.find((record) =>
          record?.identity?.caal_id === selectedCaalId &&
          record?.source?.scope === selectedScope
        );

      const anyScopeMatch =
        monumentListRecords.find((record) =>
          record?.identity?.caal_id === selectedCaalId
        ) ||
        monumentMapRecords.find((record) =>
          record?.identity?.caal_id === selectedCaalId
        );

      const refreshed = sameScopeMatch || anyScopeMatch;

      if (refreshed) {
        const fullRecord = await loadFullMonumentRecord(refreshed);

        monumentSelectedRecord = fullRecord;
        monumentIsEditMode =
          wasEditing && fullRecord?.source?.is_editable === true;

        renderMonumentRecordDetails(fullRecord);
        updateSelectedResultCard();
        updateMonumentActionBar();
        return;
      }
    }

    monumentSelectedRecord = null;
    monumentIsEditMode = false;
    monumentSyncModeVisualState();
    updateMonumentActionBar();
    renderMonumentEmptyState();
  } catch (error) {
    console.error("Monuments language refresh failed:", error);
  } finally {
    setMonumentsLoading(false);
  }
});

[showWorkspaceRecords, showNationalRecords, showAllCaalRecords].forEach((el) => {
  if (el) {
    el.addEventListener("change", async () => {
      if (!monumentConfirmLoseChanges()) {
        el.checked = !el.checked;
        return;
      }

      monumentPageOffset = 0;
      monumentPendingNewRecord = null;
      monumentIsEditMode = false;
      monumentIsDirty = false;
      monumentIsAddMode = false;
      monumentSyncModeVisualState();
      updateAddModeUI();
      monumentSelectedRecord = null;

      if (map) {
        if (map.getLayer("monument-selected-ring")) {
          map.removeLayer("monument-selected-ring");
        }
        if (map.getSource("monument-selected")) {
          map.removeSource("monument-selected");
        }
      }

      clearRelatedMonumentsMap();
      updateMapOptionsState();

      setMonumentsLoading(true, t("updating_scope", "Updating scope..."));

      try {
        await loadMonumentListRecords();

        setMonumentsLoading(true, t("redrawing_map", "Redrawing map..."));
        await loadMonumentMapRecords();

        renderMonumentEmptyState();
      } catch (error) {
        console.error("Failed to reload monuments after scope change:", error);
      } finally {
        setMonumentsLoading(false);
      }
    });
  }
});

// --------------------------------------------------------
// Initial load
// --------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  const refreshMonumentsCacheBtn = document.getElementById("refreshMonumentsCacheBtn");

  if (refreshMonumentsCacheBtn) {
    refreshMonumentsCacheBtn.hidden = !session.permissions?.can_edit_caal;
  }

  setMonumentsLoading(false);

  if (session.permissions?.can_view_all_caal && allCaalMonumentsToggleWrapper) {
    allCaalMonumentsToggleWrapper.hidden = false;
  }

  renderMonumentEmptyState();

  const initialCaalId = getInitialCaalIdFromUrl();
  const initialScope = getInitialScopeFromUrl();

  let directLinkedRecord = null;

  if (initialCaalId && filterCaalId) {
    filterCaalId.value = initialCaalId;
  }

  setMonumentsLoading(
    true,
    initialCaalId
      ? t("loading_linked_record", "Loading linked record...")
      : t("loading_records", "Loading records...")
  );

  try {
    await loadMonumentLabels();
    applyMonumentStaticLabels();
    await loadMonumentLookups();
    populateMonumentFilterLookups();

    if (initialCaalId) {
      const resolved = await loadDirectLinkedRecord(initialCaalId);

      if (resolved?.record_type === "monument" && resolved.record) {
        directLinkedRecord = resolved.record;

        const resolvedScope = resolved.record.source?.scope || initialScope;

        if (resolvedScope) {
          if (showWorkspaceRecords) showWorkspaceRecords.checked = false;
          if (showNationalRecords) showNationalRecords.checked = false;
          if (showAllCaalRecords) showAllCaalRecords.checked = false;

          if (resolvedScope === "workspace" && showWorkspaceRecords) {
            showWorkspaceRecords.checked = true;
          }

          if (resolvedScope === "national_ref" && showNationalRecords) {
            showNationalRecords.checked = true;
          }

          if (resolvedScope === "all_caal" && showAllCaalRecords) {
            showAllCaalRecords.checked = true;
          }
        }

        monumentSelectedRecord = directLinkedRecord;
        renderMonumentRecordDetails(directLinkedRecord);
        updateSelectedResultCard();
      }
    } else if (initialScope) {
      if (showWorkspaceRecords) showWorkspaceRecords.checked = false;
      if (showNationalRecords) showNationalRecords.checked = false;
      if (showAllCaalRecords) showAllCaalRecords.checked = false;

      if (initialScope === "workspace" && showWorkspaceRecords) {
        showWorkspaceRecords.checked = true;
      }

      if (initialScope === "national_ref" && showNationalRecords) {
        showNationalRecords.checked = true;
      }

      if (initialScope === "all_caal" && showAllCaalRecords) {
        showAllCaalRecords.checked = true;
      }
    }
  } catch (error) {
    console.error("Monuments linked-record setup failed:", error);
  } finally {
    setMonumentsLoading(false);
  }

  if (mapElement && typeof maplibregl !== "undefined") {
    const initialBasemap = basemapSelect ? basemapSelect.value : "osm";

    map = new maplibregl.Map({
      container: "map",
      style: getBasemapStyle(initialBasemap),
      center: directLinkedRecord?.geometry?.coordinates || [66.9, 48.2],
      zoom: directLinkedRecord?.geometry?.coordinates ? 8 : 4.2,
      preserveDrawingBuffer: true
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    addMonumentLegendControl();

    map.on("click", (event) => {
      if (!monumentIsAddMode) return;

      applyMapClickToSelectedRecord(event.lngLat);

      monumentIsAddMode = false;
      monumentIsEditMode = true;
      updateAddModeUI();
      renderMonumentRecordDetails(monumentSelectedRecord);
      updateSelectedResultCard();
    });

    map.addControl(
      new maplibregl.ScaleControl({
        maxWidth: 120,
        unit: "metric"
      }),
      "bottom-left"
    );

    map.on("load", async () => {
      mapLoaded = true;
      updateAddModeUI();

      setMonumentsLoading(true, t("loading_records", "Loading records..."));

      try {
        await loadMonumentMapRecords();
        await loadMonumentListRecords();

        if (directLinkedRecord) {
          monumentSelectedRecord = directLinkedRecord;
          renderMonumentRecordDetails(directLinkedRecord);
          updateSelectedResultCard();

          if (directLinkedRecord.geometry?.coordinates) {
            drawSelectedMonumentHighlight(directLinkedRecord);
            ensureRecordVisibleOnMap(directLinkedRecord);
          }
        }
      } catch (error) {
        console.error("Monuments initial load failed:", error);
        if (!directLinkedRecord) renderMonumentEmptyState();
      } finally {
        setMonumentsLoading(false);
      }
    });

    map.on("moveend", () => {
      if (suppressNextMapMoveReload) {
        suppressNextMapMoveReload = false;
        return;
      }

      if (monumentMoveDebounceTimer) {
        clearTimeout(monumentMoveDebounceTimer);
      }

      monumentMoveDebounceTimer = setTimeout(async () => {
        if (monumentsIsLoading) return;

        const filters = getMonumentCurrentFilters();

        // Free-text and CAAL_ID searches are expensive.
        // Do not automatically refetch on every pan/zoom.
        // Use "Show results on map" for an explicit filtered map refresh.
        if (filters.text || filters.caalId) {
          return;
        }

        try {
          await loadMonumentMapRecords();
        } catch (error) {
          console.error("Failed to reload monuments for bbox:", error);
        }
      }, 1500);
    });

    if (basemapSelect) {
      basemapSelect.addEventListener("change", () => {
        mapLoaded = false;
        monumentsLayerEventsBound = false;

        map.setStyle(getBasemapStyle(basemapSelect.value));

        map.once("style.load", () => {
          mapLoaded = true;

          monumentsLayerEventsBound = false;
          drawMonumentRecords(monumentMapRecords);

          if (monumentSelectedRecord?.geometry?.coordinates) {
            drawSelectedMonumentHighlight(monumentSelectedRecord);
          }

          renderRelatedMonumentsMapOverlay();
          renderLiveMapLabels();

          updateAddModeUI();
          updateMapOptionsState();
          renderMonumentLegend();
        });
      });
    }
  } else {
    setMonumentsLoading(true, t("loading_records", "Loading records..."));

    try {
      await loadMonumentMapRecords();
      await loadMonumentListRecords();

      if (directLinkedRecord) {
        monumentSelectedRecord = directLinkedRecord;
        renderMonumentRecordDetails(directLinkedRecord);
        updateSelectedResultCard();
      }
    } catch (error) {
      console.error("Monuments initial load failed:", error);
      if (!directLinkedRecord) renderMonumentEmptyState();
    } finally {
      setMonumentsLoading(false);
    }
  }
});