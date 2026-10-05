// ============================================================
// monumentRecordModel.js
// Converts one localised Monument row into a dynamic print model.
// ============================================================

const {
  MONUMENT_RECORD_SECTIONS,
  EMPTY_SENTINELS,
  DEFAULT_BRANDING,
  DEFAULT_DOCUMENT_LABELS
} = require("./monumentRecordConfig");

const EMPTY_SET = new Set(
  EMPTY_SENTINELS.map((value) => value.toLowerCase())
);

function isMeaningful(value) {
  if (value === null || value === undefined) return false;

  if (Array.isArray(value)) {
    return value.some(isMeaningful);
  }

  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "boolean") {
    return true;
  }

  const text = String(value).trim();

  if (!text) return false;

  return !EMPTY_SET.has(text.toLowerCase());
}

function cleanValue(value) {
  return isMeaningful(value) ? value : null;
}

function formatResolvedList(value) {
  if (!Array.isArray(value)) {
    return cleanValue(value);
  }

  const items = value
    .map(cleanValue)
    .filter(Boolean);

  return items.length ? items.join("; ") : null;
}

function formatCoordinate(value, axis) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  const suffix =
    axis === "lat"
      ? (number < 0 ? "S" : "N")
      : (number < 0 ? "W" : "E");

  return `${Math.abs(number).toFixed(6)} ${suffix}`;
}

function formatDate(value, lang = "en") {
  if (!isMeaningful(value)) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).trim();

  try {
    return new Intl.DateTimeFormat(lang, {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }
}

function formatDocumentDate(value) {
  if (!isMeaningful(value)) return null;

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).trim();
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function field(label, value, options = {}) {
  const cleaned = cleanValue(value);
  if (!isMeaningful(cleaned)) return null;

  return {
    key: options.key || null,
    label,
    value: cleaned,
    wide: options.wide === true,
    multiline: options.multiline === true
  };
}

function compact(items) {
  return items.filter(Boolean);
}

function buildAdministrativeRows(record, labels) {
  const rows = [];

  for (let i = 1; i <= 4; i += 1) {
    const name = cleanValue(record[`admin_subdivision_name_${i}`]);
    const type = cleanValue(record[`admin_subdivision_type_${i}`]);

    if (!name && !type) continue;

    rows.push({
      label: type || labels.administrative_area || "Administrative area",
      value: name || type
    });
  }

  return rows;
}

function buildMeasurementRows(record, labels) {
  const rows = [];

  for (let i = 1; i <= 4; i += 1) {
    const value = cleanValue(record[`measurement_value_${i}`]);
    const unit = cleanValue(record[`measurement_unit_${i}`]);
    const type = cleanValue(record[`measurement_type_${i}`]);

    if (!value && !unit && !type) continue;

    rows.push({
      label: type || `${labels.measurement || "Measurement"} ${i}`,
      value: [value, unit].filter(isMeaningful).join(" ").trim() || type
    });
  }

  return rows;
}

function buildLocationSummary(record) {
  return [cleanValue(record.country), cleanValue(record.region)]
    .filter(Boolean)
    .join(" | ") || null;
}

function buildRecordMap(record) {
  const lat = Number(record.recorded_latitude);
  const lon = Number(record.recorded_longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    lat,
    lon,
    latitudeText: formatCoordinate(lat, "lat"),
    longitudeText: formatCoordinate(lon, "lon"),
    imageSrc: cleanValue(record.map_image_src),
    attribution:
      cleanValue(record.map_attribution) ||
      "OpenStreetMap contributors"
  };
}

function buildSection(definition, content) {
  const hasContent =
    (Array.isArray(content?.fields) && content.fields.length > 0) ||
    (Array.isArray(content?.rows) && content.rows.length > 0) ||
    (Array.isArray(content?.paragraphs) && content.paragraphs.length > 0) ||
    (Array.isArray(content?.items) && content.items.length > 0) ||
    (Array.isArray(content?.groups) && content.groups.length > 0) ||
    Boolean(content?.map);

  if (!definition.alwaysShow && !hasContent) {
    return null;
  }

  return {
    ...definition,
    ...content
  };
}

function buildMonumentRecordModel(record, options = {}) {
  const lang = options.lang || "en";

  const labels = {
    ...DEFAULT_DOCUMENT_LABELS,
    ...(options.labels || {})
  };

  const branding = {
    ...DEFAULT_BRANDING,
    ...(options.branding || {})
  };

  const locationSummary = buildLocationSummary(record);
  const map = buildRecordMap(record);

  const sectionLabelKeys = {
    identification:
      "section_identification",

    chronology:
      "section_chronology",

    location:
      "section_location",

    description:
      "section_description",

    measurements:
      "section_dimensions",

    related_resources:
      "section_related_resources",

    record_information:
      "section_record_information",

    documentary_material:
      "section_documentary_material"
  };

  const definitions =
    Object.fromEntries(
      MONUMENT_RECORD_SECTIONS.map(
        (section) => {
          const labelKey =
            sectionLabelKeys[
              section.key
            ];

          return [
            section.key,
            {
              ...section,
              title:
                labels[labelKey] ||
                section.title
            }
          ];
        }
      )
    );

  const identification = buildSection(definitions.identification, {
    groups: compact([
      {
        key: "names",
        title: labels.group_names || "Names",
        fields: compact([
          field(labels.primary_name || "Primary name", record.primary_name),
          field(
            labels.primary_name_en || "Primary name (English)",
            record.primary_name_en
          ),
          field(labels.other_names || "Other names", record.other_names, {
            wide: true
          })
        ])
      },
      {
        key: "identifiers",
        title: labels.group_identifiers_references || "Identifiers and references",
        fields: compact([
          field(
            labels.monument_id ||
              labels.caal_id ||
              "Monument ID",
            record.caal_id
          ),
          field(
            labels.internal_reference || "Internal reference",
            record.internal_reference
          ),
          field(
            labels.external_reference || "External reference",
            record.external_reference
          ),
          field(
            labels.monument_passport,
            record.monument_passport
          )
        ])
      },
      {
        key: "classification",
        title: labels.group_classification_status || "Classification and heritage status",
        fields: compact([
          field(
            labels.classification || "Classification",
            record.classification
          ),
          field(
            labels.monument_types || "Monument type",
            formatResolvedList(record.monument_types),
            { wide: true }
          ),
          field(
            labels.religions || "Religious association",
            formatResolvedList(record.religions),
            { wide: true }
          ),
          field(
            labels.designation || "Designation",
            record.designation
          ),
          field(
            labels.world_heritage_site_name || "World Heritage Site",
            record.world_heritage_site_name,
            { wide: true }
          )
        ])
      }
    ]).filter((group) => group.fields.length > 0),
    locationSummary
  });

  const chronology = buildSection(definitions.chronology, {
    fields: compact([
      field(
        labels.descriptive_date || "Descriptive date",
        record.descriptive_date
      ),
      field(
        labels.cultural_periods || "Cultural period",
        formatResolvedList(record.cultural_periods),
        { wide: true }
      ),
      field(labels.start_date || "Start date", record.start_date),
      field(labels.end_date || "End date", record.end_date)
    ])
  });

  const location = buildSection(definitions.location, {
    fields: compact([
      field(labels.country || "Country", record.country),
      field(labels.region || "Region", record.region),

      ...buildAdministrativeRows(record, labels).map((row) =>
        field(row.label, row.value)
      ),

      field(
        labels.primary_address || "Primary address",
        record.primary_address,
        { wide: true }
      ),

      field(
        labels.latitude,
        formatCoordinate(record.recorded_latitude, "lat")
      ),

      field(
        labels.longitude,
        formatCoordinate(record.recorded_longitude, "lon")
      ),

      field(labels.altitude || "Altitude", record.altitude),

      field(
        labels.location_confidence || "Location confidence",
        record.location_confidence
      ),

      field(
        labels.location_notes || "Location notes",
        record.location_notes,
        { wide: true, multiline: true }
      )
    ]),
    map
  });

  const description = buildSection(definitions.description, {
    paragraphs: compact([
      field(
        labels.primary_description || "Primary description",
        record.primary_description,
        { wide: true, multiline: true }
      ),
      field(
        labels.primary_description_en || "Primary description (English)",
        record.primary_description_en,
        { wide: true, multiline: true }
      ),
      field(
        labels.additional_notes || "Additional notes",
        record.additional_notes,
        { wide: true, multiline: true }
      )
    ])
  });

  const measurements = buildSection(definitions.measurements, {
    rows: buildMeasurementRows(record, labels)
  });

  const relatedResources = buildSection(definitions.related_resources, {
    items: Array.isArray(options.relatedResources)
      ? options.relatedResources.filter(Boolean)
      : []
  });

  const recordInformation = buildSection(definitions.record_information, {
    fields: compact([
      field(labels.recorder || "Recorder", record.recorder),
      field(
        labels.date_of_recording ||
          "Date of recording",
        formatDate(
          record.date_of_recording,
          lang
        )
      ),
      field(
        labels.record_language ||
          labels.recorded_language ||
          "Record language",
        record.recorded_language
      ),
      field(
        labels.last_updated ||
          labels.updated_at ||
          "Last updated",
        formatDate(
          record.updated_at,
          lang
        )
      )
    ])
  });

  const documentaryMaterial = buildSection(definitions.documentary_material, {
    items: Array.isArray(options.documentaryMaterial)
      ? options.documentaryMaterial.filter(Boolean)
      : []
  });

  return {
    lang,
    branding,
    documentTitle: labels.monument_record_title || "Monument Record",
    primaryName:
      cleanValue(record.primary_name) ||
      cleanValue(record.display_label) ||
      cleanValue(record.caal_id) ||
      "",
    secondaryName: cleanValue(record.primary_name_en),
    caalId: cleanValue(record.caal_id),
    caalIdLabel: labels.monument_id || labels.caal_id || "Monument ID",
    locationSummary,
    generatedAt: formatDocumentDate(
      options.generatedAt || new Date()
    ),
    sections: compact([
      identification,
      chronology,
      location,
      description,
      measurements,
      relatedResources,
      recordInformation,
      documentaryMaterial
    ])
  };
}

module.exports = {
  isMeaningful,
  cleanValue,
  formatResolvedList,
  formatCoordinate,
  formatDate,
  buildAdministrativeRows,
  buildMeasurementRows,
  buildMonumentRecordModel
};
