// ============================================================
// viewerGeoJson.js
// Builds RFC 7946 FeatureCollections from already-fetched export rows.
//
// One FeatureCollection per record type, mirroring the CSV bundle. A
// single mixed collection would carry the union of five types' properties, 
// most of them null.
//
// Non-spatial types (archive) are omitted rather than emitted with
// "geometry": null. RFC 7946 permits null geometry, but enough desktop
// tools choke on it that it is not worth the surprise; the CSV bundle
// remains the route to non-spatial records.
// ============================================================

/** Values pg returns that JSON.stringify would render unhelpfully. */
function jsonValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  return value;
}

/**
 * Round coordinates in place. Six decimal places is ~10cm at the
 * equator, and halves file size against the nine PostGIS emits by default.
 */
function roundCoords(node, dp) {
  if (!Array.isArray(node)) return node;
  if (typeof node[0] === "number") {
    return node.map(n => (typeof n === "number" ? Number(n.toFixed(dp)) : n));
  }
  return node.map(child => roundCoords(child, dp));
}

/**
 * rows        from exportTypeRecordsSql with format "geojson"
 *             (carries geom_geojson) or from the thin picked query
 * columns     ordered property names — the same list the CSV uses
 * coordinatePrecision  decimal places; null keeps PostGIS output as-is
 */
function buildFeatureCollection({ rows, columns, coordinatePrecision = 6 }) {
  const features = [];

  for (const row of rows) {
    let geometry = null;

    if (row.geom_geojson) {
      try {
        geometry = typeof row.geom_geojson === "string"
          ? JSON.parse(row.geom_geojson)
          : row.geom_geojson;
      } catch (err) {
        geometry = null;
      }
    }

    // Fall back to the centroid so a record with geometry too large to
    // serialise still appears instead of silently disappearing.
    if (!geometry
        && row.centroid_lon !== null && row.centroid_lon !== undefined) {
      geometry = {
        type: "Point",
        coordinates: [Number(row.centroid_lon), Number(row.centroid_lat)]
      };
    }

    if (!geometry) continue;

    if (coordinatePrecision !== null && geometry.coordinates) {
      geometry = {
        ...geometry,
        coordinates: roundCoords(geometry.coordinates, coordinatePrecision)
      };
    }

    const properties = {};
    for (const column of columns) properties[column] = jsonValue(row[column]);

    const feature = { type: "Feature", geometry, properties };
    if (row.caal_id) feature.id = row.caal_id;
    features.push(feature);
  }

  return { type: "FeatureCollection", features };
}

/** Pretty-printing triples the size for no benefit to a machine reader. */
function featureCollectionJson(args) {
  return JSON.stringify(buildFeatureCollection(args));
}

module.exports = { buildFeatureCollection, featureCollectionJson };