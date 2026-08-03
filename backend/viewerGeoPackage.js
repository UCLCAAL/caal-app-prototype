// ============================================================
// viewerGeoPackage.js
// Writes a standards-valid .gpkg from already-fetched rows.

//
// node:sqlite is built into Node 22.5+/24.
// A GeoPackage is a SQLite file with four small metadata tables;
// each geometry is an 8-byte "GP" header + standard WKB, and the
// WKB comes straight from PostGIS via ST_AsBinary().
// ============================================================

const { DatabaseSync } = require("node:sqlite");

const SRS_ID = 4326;

const WGS84_DEFINITION =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,' +
  'AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],' +
  'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
  'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
  'AUTHORITY["EPSG","4326"]]';

const RECORD_COLUMN_TYPES = {
  centroid_lon: "REAL",
  centroid_lat: "REAL",
  cultural_periods_date_from: "INTEGER",
  cultural_periods_date_to: "INTEGER",
  measurement_value_1: "REAL",
  measurement_value_2: "REAL",
  measurement_value_3: "REAL",
  measurement_value_4: "REAL",
  digital_files_count: "INTEGER"
};

const RELATIONSHIP_COLUMNS = [
  "edge_id", "from_caal_id", "from_display_label", "from_record_type",
  "from_role", "relationship", "to_caal_id", "to_display_label",
  "to_record_type", "to_role", "inverse_relationship"
];

function safeTableName(value, fallback = "records") {
  const name = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
  return name || fallback;
}

function columnDefinition(name) {
  return `"${name}" ${RECORD_COLUMN_TYPES[name] || "TEXT"}`;
}

/**
 * Coerce a pg value into something node:sqlite can bind.
 * SQLite has no native date or boolean type, so dates become ISO strings
 * and booleans become 0/1 — both readable in QGIS.
 */
function bindValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * GeoPackage geometry blob = "GP" header + WKB.
 * flags 0x01 = little-endian header integers, no envelope.
 */
function gpkgGeomBlob(wkb, srsId = SRS_ID) {
  if (!wkb) return null;
  const buffer = Buffer.isBuffer(wkb) ? wkb : Buffer.from(wkb);
  const header = Buffer.alloc(8);
  header.write("GP", 0, "ascii");
  header.writeUInt8(0, 2);
  header.writeUInt8(0x01, 3);
  header.writeInt32LE(srsId, 4);
  return Buffer.concat([header, buffer]);
}

function createSkeleton(db) {
  db.exec(`
PRAGMA application_id = 1196444487;  -- 'GPKG'
PRAGMA user_version = 10300;         -- GeoPackage 1.3

CREATE TABLE gpkg_spatial_ref_sys (
  srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY,
  organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL,
  definition TEXT NOT NULL, description TEXT
);

CREATE TABLE gpkg_contents (
  table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL,
  identifier TEXT UNIQUE, description TEXT DEFAULT '',
  last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER
);

CREATE TABLE gpkg_geometry_columns (
  table_name TEXT NOT NULL, column_name TEXT NOT NULL,
  geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL,
  z TINYINT NOT NULL, m TINYINT NOT NULL,
  PRIMARY KEY (table_name, column_name)
);
`);

  const srs = db.prepare(
    `INSERT INTO gpkg_spatial_ref_sys
       (srs_name, srs_id, organization, organization_coordsys_id, definition, description)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  srs.run("Undefined cartesian SRS", -1, "NONE", -1, "undefined", "");
  srs.run("Undefined geographic SRS", 0, "NONE", 0, "undefined", "");
  srs.run("WGS 84", SRS_ID, "EPSG", 4326, WGS84_DEFINITION,
          "longitude/latitude on WGS 84");
}

function createFeatureLayer(db, tableName, description, rows, recordColumns) {
  const columns = recordColumns.map(columnDefinition).join(",\n  ");
  db.exec(`
CREATE TABLE "${tableName}" (
  fid INTEGER PRIMARY KEY AUTOINCREMENT,
  geom BLOB,
  ${columns}
);`);

  const insert = db.prepare(
    `INSERT INTO "${tableName}" (geom, ${recordColumns.map(c => `"${c}"`).join(", ")})
     VALUES (${new Array(recordColumns.length + 1).fill("?").join(", ")})`
  );

  let minX = null, minY = null, maxX = null, maxY = null;
  for (const row of rows) {
    insert.run(
      gpkgGeomBlob(row.geom_wkb),
      ...recordColumns.map(c => bindValue(row[c]))
    );
    if (row.min_x !== null && row.min_x !== undefined) {
      minX = minX === null ? row.min_x : Math.min(minX, row.min_x);
      minY = minY === null ? row.min_y : Math.min(minY, row.min_y);
      maxX = maxX === null ? row.max_x : Math.max(maxX, row.max_x);
      maxY = maxY === null ? row.max_y : Math.max(maxY, row.max_y);
    }
  }

  db.prepare(
    `INSERT INTO gpkg_contents
       (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id)
     VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?)`
  ).run(tableName, tableName, description, minX, minY, maxX, maxY, SRS_ID);

  // GEOMETRY (rather than POINT/POLYGON) because a record type may mix
  // geometry types; QGIS reads mixed-geometry layers without complaint.
  db.prepare(
    `INSERT INTO gpkg_geometry_columns
       (table_name, column_name, geometry_type_name, srs_id, z, m)
     VALUES (?, 'geom', 'GEOMETRY', ?, 0, 0)`
  ).run(tableName, SRS_ID);
}

function createAttributeTable(db, tableName, description, columns, rows) {
  const definitions = columns
    .map(c => `"${c}" ${RECORD_COLUMN_TYPES[c] || "TEXT"}`)
    .join(",\n  ");
  db.exec(`
CREATE TABLE "${tableName}" (
  fid INTEGER PRIMARY KEY AUTOINCREMENT,
  ${definitions}
);`);

  if (rows.length) {
    const insert = db.prepare(
      `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(", ")})
       VALUES (${new Array(columns.length).fill("?").join(", ")})`
    );
    for (const row of rows) {
      insert.run(...columns.map(c => bindValue(row[c])));
    }
  }

  db.prepare(
    `INSERT INTO gpkg_contents
       (table_name, data_type, identifier, description, srs_id)
     VALUES (?, 'attributes', ?, ?, NULL)`
  ).run(tableName, tableName, description);
}

/**
 * Build the GeoPackage at filePath.
 *
 * layers            [{ recordType, columns, rows }] — one entry per record
 *                   type, columns already resolved by the caller (spec
 *                   columns where a spec exists, common columns otherwise).
 *                   Rows carry geom_wkb + min/max bounds for spatial types.
 * relationshipRows  rows from exportRelationshipsSql (may be empty)
 * infoRows          [{ key, value }] for the export_information table
 *
 * A record type becomes a feature layer if any of its rows has geometry,
 * and an attribute table otherwise — decided per type rather than per row,
 * so one geometry-less record cannot split a type across two tables with
 * the same name.
 */
function writeGeoPackage({ filePath, layers, relationshipRows, infoRows }) {
  const db = new DatabaseSync(filePath);
  try {
    createSkeleton(db);

    for (const layer of layers) {
      if (!layer.rows.length) continue;
      const tableName = safeTableName(layer.recordType);
      const description = `CAAL ${layer.recordType} records`;
      const hasGeometry = layer.rows.some(r => r.geom_wkb);

      if (hasGeometry) {
        createFeatureLayer(db, tableName, description, layer.rows, layer.columns);
      } else {
        createAttributeTable(db, tableName, description, layer.columns, layer.rows);
      }
    }

    if (relationshipRows.length) {
      createAttributeTable(
        db,
        "relationships",
        "One row per relationship between exported records",
        RELATIONSHIP_COLUMNS,
        relationshipRows
      );
    }

    createAttributeTable(
      db,
      "export_information",
      "Provenance and scope of this export",
      ["key", "value"],
      infoRows
    );
  } finally {
    db.close();
  }
}

module.exports = { writeGeoPackage, RELATIONSHIP_COLUMNS };
