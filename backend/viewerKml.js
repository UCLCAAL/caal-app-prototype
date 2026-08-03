// viewerKml.js
// Builds a KML document string from already-fetched export rows.
//
// Modes (chosen by the caller from the estimate's kmlMode):
//   "structured" — one Folder per selected record, containing the
//                  primary Placemark + a subfolder of its related
//                  Placemarks. Preferred; used while the projected
//                  node count stays within budget.
//   "flat"       — Folders by record type; relationships live only
//                  in placemark descriptions. Fallback for very
//                  large selections.
//
// Geometry: full-fidelity GeoJSON from the row (geom_geojson) unless
// centroidsOnly, in which case every feature becomes its centroid point.
// Relationship LineStrings are emitted only when relationshipLines is on.
// ============================================================

const { EXPORT_SPECS } = require("./viewerFieldMap");

const KML_STYLES = {
  // record_type -> icon colour (KML aabbggrr). Tuned to read distinctly in Google Earth
  rs3_poly:    "ff4b9e2f", // green
  rs3_line:    "ff8b5a2b", // brown
  rs3_group:   "ff2f9e9e", // teal
  institution: "ffd07b1f", // blue
  vernacular:  "ffb07be0", // mauve
  archive:     "ff9e9e9e", // grey
  dataset:     "ff9e9e9e",
  cartography: "ff5a5adb", // red
  _default:    "ff3b6ef4"
};

const RELATED_ICON_COLOUR = "ffffffff"; // white, hollow-reading for related
const LINE_COLOUR = "b0ffffff";         // semi-transparent white connectors

function xmlEscape(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Folder names in Google Earth's sidebar are truncated to roughly the
 * panel width, so leading with the CAAL ID keeps them scannable and
 * sortable. display_label on RS records is free-text interpretation and
 * frequently runs to hundreds of characters.
 */
function folderTitle(row, max = 60) {
  const id = (row.caal_id || "").trim();
  const label = (row.display_label || "").replace(/\s+/g, " ").trim();
  if (!label || label === id) return id || "(untitled)";
  const room = max - id.length - 3;
  const short = label.length > room ? label.slice(0, room).trimEnd() + "…" : label;
  return `${id} — ${short}`;
}

function cdata(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return `<![CDATA[${s.replace(/]]>/g, "]]&gt;")}]]>`;
}

// ---- geometry: GeoJSON -> KML geometry XML ----

function coordString(lon, lat) { return `${lon},${lat},0`; }

function ringCoords(ring) {
  return ring.map(pt => coordString(pt[0], pt[1])).join(" ");
}

function geojsonToKmlGeometry(geojson, centroid) {
  if (centroid) {
    return `<Point><coordinates>${coordString(centroid.lon, centroid.lat)}</coordinates></Point>`;
  }
  if (!geojson) return "";
  const g = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
  switch (g.type) {
    case "Point":
      return `<Point><coordinates>${coordString(g.coordinates[0], g.coordinates[1])}</coordinates></Point>`;
    case "MultiPoint":
      return `<MultiGeometry>${g.coordinates
        .map(c => `<Point><coordinates>${coordString(c[0], c[1])}</coordinates></Point>`)
        .join("")}</MultiGeometry>`;
    case "LineString":
      return `<LineString><coordinates>${ringCoords(g.coordinates)}</coordinates></LineString>`;
    case "MultiLineString":
      return `<MultiGeometry>${g.coordinates
        .map(l => `<LineString><coordinates>${ringCoords(l)}</coordinates></LineString>`)
        .join("")}</MultiGeometry>`;
    case "Polygon":
      return polygonXml(g.coordinates);
    case "MultiPolygon":
      return `<MultiGeometry>${g.coordinates.map(polygonXml).join("")}</MultiGeometry>`;
    default:
      return "";
  }
}

function polygonXml(rings) {
  const outer = `<outerBoundaryIs><LinearRing><coordinates>${ringCoords(rings[0])}</coordinates></LinearRing></outerBoundaryIs>`;
  const inners = rings.slice(1)
    .map(r => `<innerBoundaryIs><LinearRing><coordinates>${ringCoords(r)}</coordinates></LinearRing></innerBoundaryIs>`)
    .join("");
  return `<Polygon>${outer}${inners}</Polygon>`;
}

// ---- description block ----

function descriptionHtml(row, relations) {
  const lines = [];
  const push = (label, value) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      lines.push(`<b>${xmlEscape(label)}:</b> ${xmlEscape(value)}`);
    }
  };
  push("CAAL ID", row.caal_id);
  push("Type", row.record_type);
  push("Dataset", row.dataset_label);

  const spec = EXPORT_SPECS[row.record_type];
      if (spec && spec.kmlFields && spec.kmlFields.length) {
        for (const f of spec.kmlFields) {
          push((labels && labels.get(f.column)) || f.label, row[f.column]);
        }
  } else {
    push("Country", row.country);
    push("Monument types", row.monument_types);
    push("Condition", row.condition_levels);
    push("Risk", row.risk_levels);
  }

  if (relations && relations.length) {
    lines.push("<b>Related:</b>");
    for (const rel of relations) {
      lines.push(`&nbsp;&nbsp;${xmlEscape(rel.relationship || "related to")}: ${xmlEscape(rel.to_display_label || rel.to_caal_id)}`);
    }
  }
  return cdata(lines.join("<br/>"));
}

// ---- placemark ----

function placemark(row, { centroidsOnly, styleId, relations, labels }) {
  const centroid = (row.centroid_lon !== null && row.centroid_lon !== undefined)
    ? { lon: row.centroid_lon, lat: row.centroid_lat }
    : null;
  const geometry = geojsonToKmlGeometry(
    centroidsOnly ? null : row.geom_geojson,
    centroidsOnly ? centroid : (row.geom_geojson ? null : centroid)
  );
  if (!geometry) return ""; // no geometry and no centroid — nothing to place
  return `
      <Placemark>
        <name>${xmlEscape(row.display_label || row.caal_id)}</name>
        <styleUrl>#${styleId}</styleUrl>
        <description>${descriptionHtml(row, relations, labels)}</description>
        ${geometry}
      </Placemark>`;
}

function styleDefs() {
  const defs = [];
  for (const [key, colour] of Object.entries(KML_STYLES)) {
    if (key === "_default") continue;
    defs.push(styleXml(`type_${key}`, colour));
  }
  defs.push(styleXml("type__default", KML_STYLES._default));
  defs.push(styleXml("related", RELATED_ICON_COLOUR));
  return defs.join("");
}

function styleXml(id, colour) {
  return `
    <Style id="${id}">
      <IconStyle><color>${colour}</color><scale>0.9</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
      </IconStyle>
      <LineStyle><color>${colour}</color><width>2</width></LineStyle>
      <PolyStyle><color>66${colour.slice(2)}</color></PolyStyle>
    </Style>`;
}

function styleIdFor(recordType) {
  return KML_STYLES[recordType] ? `type_${recordType}` : "type__default";
}

// ---- relationship lines ----

function relationshipLine(edge, fromCentroid, toCentroid) {
  if (!fromCentroid || !toCentroid) return "";
  return `
      <Placemark>
        <name>${xmlEscape(edge.relationship || "related to")}</name>
        <styleUrl>#relationLine</styleUrl>
        <description>${cdata(
          `${xmlEscape(edge.from_display_label || edge.from_caal_id)} ` +
          `&rarr; ${xmlEscape(edge.to_display_label || edge.to_caal_id)}`
        )}</description>
        <LineString><tessellate>1</tessellate><coordinates>` +
        `${coordString(fromCentroid.lon, fromCentroid.lat)} ` +
        `${coordString(toCentroid.lon, toCentroid.lat)}</coordinates></LineString>
      </Placemark>`;
}

/**
 * Build the KML string.
 *
 * recordRows       from exportRecordsKmlSql: identity, geom_geojson,
 *                  centroid_lon/lat, display fields, export_role
 * relationshipRows from exportRelationshipsSql (may be empty)
 * mode             "structured" | "flat"
 * options          { centroidsOnly, relationshipLines }
 */
function buildKml({ recordRows, relationshipRows, mode, options, meta, labelsByType }) {
  const centroidsOnly = Boolean(options.centroidsOnly);
  const relationshipLines = Boolean(options.relationshipLines);

  const byId = new Map();
  for (const r of recordRows) byId.set(r.caal_id_norm, r);
  const centroidOf = r =>
    (r && r.centroid_lon !== null && r.centroid_lon !== undefined)
      ? { lon: r.centroid_lon, lat: r.centroid_lat } : null;
  
  const labelsFor = r => (labelsByType && labelsByType.get(r.record_type)) || null;

  // relationships grouped by the selected ("from") record
  const relByFrom = new Map();
  for (const e of relationshipRows) {
    const key = (e.from_caal_id || "").toLowerCase().trim();
    if (!relByFrom.has(key)) relByFrom.set(key, []);
    relByFrom.get(key).push(e);
  }

  const selected = recordRows.filter(r => r.export_role === "selected");
  const related = recordRows.filter(r => r.export_role === "related");

  let body = "";

    // Record-type folders at the top level in both modes, so the sidebar
  // opens as a short list of layers rather than hundreds of siblings.
  const typeOrder = [
    "rs3_poly", "rs3_line", "rs3_group", "monument",
    "vernacular", "institution", "dataset", "cartography", "archive"
  ];
  const groupByType = rows => {
    const map = new Map();
    for (const r of rows) {
      const t = r.record_type || "records";
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(r);
    }
    return [...map.entries()].sort(
      (a, b) => (typeOrder.indexOf(a[0]) + 1 || 99) - (typeOrder.indexOf(b[0]) + 1 || 99)
    );
  };
  // dataset_label is the human name already on every row ("RS3 Line").
  const typeName = (type, rows) => rows[0]?.dataset_label || type;
 
  if (mode === "structured") {
    for (const [type, recs] of groupByType(selected)) {
      let inner = "";
      for (const rec of recs) {
        const rels = relByFrom.get((rec.caal_id || "").toLowerCase().trim()) || [];
        const relatedMarks = rels
          .map(e => byId.get((e.to_caal_id || "").toLowerCase().trim()))
          .filter(Boolean)
          .map(rr => placemark(rr, { centroidsOnly, styleId: "related",
                                   relations: null, labels: labelsFor(rr) }))
          .filter(Boolean)
          .join("");
        const primary = placemark(rec, {
          centroidsOnly, styleId: styleIdFor(rec.record_type),
          relations: rels, labels: labelsFor(rec)
        });
        if (!primary && !relatedMarks) continue;
        inner += `
      <Folder>
        <name>${xmlEscape(folderTitle(rec))}</name>
        ${primary}${relatedMarks ? `
        <Folder><name>Related</name>${relatedMarks}</Folder>` : ""}
      </Folder>`;
      }
      if (!inner) continue;
      body += `
    <Folder>
      <name>${xmlEscape(typeName(type, recs))} (${recs.length})</name>
      <open>0</open>${inner}
    </Folder>`;
    }
  } else {
    // flat: one folder per record type, placemarks directly inside
    for (const [type, rows] of groupByType([...selected, ...related])) {
      const marks = rows.map(r => {
        const rels = r.export_role === "selected"
          ? (relByFrom.get((r.caal_id || "").toLowerCase().trim()) || [])
          : null;
        return placemark(r, {
          centroidsOnly,
          styleId: r.export_role === "related" ? "related" : styleIdFor(type),
          relations: rels, labels: labelsFor(r)
        });
      }).filter(Boolean).join("");
      if (!marks) continue;
      body += `
    <Folder>
      <name>${xmlEscape(typeName(type, rows))} (${rows.length})</name>
      <open>0</open>${marks}
    </Folder>`;
    }
  }

  if (relationshipLines && relationshipRows.length) {
    const lines = relationshipRows.map(e => relationshipLine(
      e,
      centroidOf(byId.get((e.from_caal_id || "").toLowerCase().trim())),
      centroidOf(byId.get((e.to_caal_id || "").toLowerCase().trim()))
    )).filter(Boolean).join("");
    if (lines) {
      body += `
    <Folder><name>Relationships</name>${lines}</Folder>`;
    }
  }

  const lineStyle = `
    <Style id="relationLine">
      <LineStyle><color>${LINE_COLOUR}</color><width>1.4</width></LineStyle>
    </Style>`;

  const description = cdata(
    `CAAL export &mdash; ${meta.selected} selected` +
    (meta.related ? ` + ${meta.related} related` : "") +
    (centroidsOnly ? " &mdash; centroids only" : "") +
    `. Data current as of ${xmlEscape(meta.refreshedAt || "unknown")}.`
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>CAAL export (${xmlEscape(meta.lang)})</name>
    <description>${description}</description>${styleDefs()}${lineStyle}${body}
  </Document>
</kml>`;
}

module.exports = { buildKml };