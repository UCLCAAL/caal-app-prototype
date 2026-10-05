// ============================================================
// monumentRecordData.js
//
// Builds a source-agnostic, localised Monument record for the PDF.
//
// The Viewer already identifies the exact physical source using:
//   source_schema
//   source_table
//   source_row_id
//
// Pass the raw source row returned by loadViewerRawSourceRow() into this
// module. That means public CAAL and workspace/national records can use
// the same PDF pipeline.
//
// Repeated legacy fields are normalised into arrays:
//   Monument Type1..6      -> monument_types_arr
//   Cultural Period1..6    -> cultural_periods_arr
//   Religion1..3           -> religions_arr
//
// If helper arrays are already present, they are used directly.
// ============================================================

const ALLOWED_LANGS = new Set([
  "en", "ru", "zh", "kk", "ky", "tg", "tk", "uz"
]);

const LOOKUPS = Object.freeze({
  country: Object.freeze({
    view: "ui.v_lkp_countries",
    key: "canonical_value"
  }),
  classification: Object.freeze({
    view: "ui.v_lkp_classifications",
    key: "canonical_value"
  }),
  designation: Object.freeze({
    view: "ui.v_lkp_designation_type",
    key: "canonical_value"
  }),
  monument_types: Object.freeze({
    view: "ui.v_lkp_site_types_context",
    key: "canonical_value",
    alternateKey: "concept_id",
    hasLabelColumns: true,
    includeDates: false
  }),

  cultural_periods: Object.freeze({
    view: "ui.v_lkp_cultural_periods_context",
    key: "canonical_value",
    alternateKey: "concept_id",
    hasLabelColumns: true,
    includeDates: true
  }),

  religions: Object.freeze({
    view: "ui.v_lkp_religion",
    key: "canonical_value"
  }),
  location_confidence: Object.freeze({
    view: "ui.v_lkp_loc_acc_ass",
    key: "canonical_value"
  }),
  admin_type: Object.freeze({
    view: "ui.v_lkp_admin_type",
    key: "canonical_value"
  }),
  measurement_unit: Object.freeze({
    view: "ui.v_lkp_unit_of_measurement",
    key: "canonical_value"
  }),
  measurement_type: Object.freeze({
    view: "ui.v_lkp_measurement_type",
    key: "canonical_value"
  }),
  language: Object.freeze({
    view: "ui.v_lkp_langdisplay",
    key: "iso_code"
  })
});

function safeLang(lang) {
  const value = String(lang || "en").trim().toLowerCase();
  return ALLOWED_LANGS.has(value) ? value : "en";
}

function fallbackLang(lang) {
  return ["kk", "ky", "tg", "tk", "uz"].includes(safeLang(lang))
    ? "ru"
    : "en";
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function arrayFromRepeatedFields(raw, {
  helperField,
  fieldPrefix,
  count
}) {
  const helper = raw?.[helperField];

  if (Array.isArray(helper)) {
    return helper
      .map(cleanText)
      .filter(Boolean);
  }

  const values = [];

  for (let i = 1; i <= count; i += 1) {
    const value = cleanText(raw?.[`${fieldPrefix}${i}`]);
    if (value) values.push(value);
  }

  return values;
}

function uniquePreservingOrder(values) {
  const seen = new Set();
  const out = [];

  for (const value of values || []) {
    const text = cleanText(value);
    if (!text) continue;

    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(text);
  }

  return out;
}

async function resolveLookupValues(
  pool,
  lookupName,
  values,
  lang
) {
  const config = LOOKUPS[lookupName];

  if (!config) {
    throw new Error(
      `Unknown Monument lookup: ${lookupName}`
    );
  }

  const input =
    uniquePreservingOrder(values);

  if (!input.length) {
    return [];
  }

  const requested =
    safeLang(lang);

  const fallback =
    fallbackLang(requested);

  const languageCodes = [
    "en",
    "ru",
    "zh",
    "kk",
    "ky",
    "tg",
    "tk",
    "uz"
  ];

  const rawNorm = `
    lower(
      regexp_replace(
        btrim(i.raw_value),
        '\\s+',
        ' ',
        'g'
      )
    )
  `;

  const canonicalMatch = `
    lower(
      regexp_replace(
        btrim(
          COALESCE(
            l.${config.key}::text,
            ''
          )
        ),
        '\\s+',
        ' ',
        'g'
      )
    ) = ${rawNorm}
  `;

  const alternateMatch =
    config.alternateKey
      ? `
        lower(
          regexp_replace(
            btrim(
              COALESCE(
                l.${config.alternateKey}::text,
                ''
              )
            ),
            '\\s+',
            ' ',
            'g'
          )
        ) = ${rawNorm}
      `
      : "false";

  const displayMatch =
    languageCodes
      .map(
        (code) => `
          lower(
            regexp_replace(
              btrim(
                COALESCE(
                  l.display_${code}::text,
                  ''
                )
              ),
              '\\s+',
              ' ',
              'g'
            )
          ) = ${rawNorm}
        `
      )
      .join(" OR ");

  const labelMatch =
    config.hasLabelColumns
      ? languageCodes
          .map(
            (code) => `
              lower(
                regexp_replace(
                  btrim(
                    COALESCE(
                      l.label_${code}::text,
                      ''
                    )
                  ),
                  '\\s+',
                  ' ',
                  'g'
                )
              ) = ${rawNorm}
            `
          )
          .join(" OR ")
      : "false";

  const labelFallbacks =
    config.hasLabelColumns
      ? `
        l.label_${requested},
        l.label_${fallback},
        l.label_en,
      `
      : "";

  const conceptSelect =
    config.alternateKey
      ? `
        l.${config.alternateKey}::text
          AS concept_id,
      `
      : `
        NULL::text AS concept_id,
      `;

  const dateSelect =
    config.includeDates
      ? `
        CASE
          WHEN NULLIF(
            btrim(l.date_from::text),
            ''
          ) ~ '^-?\\d+$'
          THEN NULLIF(
            btrim(l.date_from::text),
            ''
          )::integer
          ELSE NULL
        END AS date_from,

        CASE
          WHEN NULLIF(
            btrim(l.date_to::text),
            ''
          ) ~ '^-?\\d+$'
          THEN NULLIF(
            btrim(l.date_to::text),
            ''
          )::integer
          ELSE NULL
        END AS date_to
      `
      : `
        NULL::integer AS date_from,
        NULL::integer AS date_to
      `;

  const result =
    await pool.query(
      `
      WITH input AS (
        SELECT
          raw_value,
          ord
        FROM unnest(
          $1::text[]
        ) WITH ORDINALITY
          AS x(raw_value, ord)
      )

      SELECT
        i.ord,
        i.raw_value,

        COALESCE(
          l.display_${requested},
          l.display_${fallback},
          l.display_en,

          ${labelFallbacks}

          l.${config.key}::text,
          i.raw_value
        ) AS label,

        l.${config.key}::text
          AS canonical_value,

        ${conceptSelect}

        ${dateSelect}

      FROM input i

      LEFT JOIN LATERAL (
        SELECT l.*
        FROM ${config.view} l

        WHERE
          (${canonicalMatch})
          OR (${alternateMatch})
          OR (${displayMatch})
          OR (${labelMatch})

        ORDER BY
          CASE
            WHEN ${canonicalMatch}
              THEN 0

            WHEN ${alternateMatch}
              THEN 1

            WHEN ${displayMatch}
              THEN 2

            WHEN ${labelMatch}
              THEN 3

            ELSE 4
          END

        LIMIT 1
      ) l ON TRUE

      ORDER BY i.ord
      `,
      [input]
    );

  const seen = new Set();

  return result.rows.filter(
    (row) => {
      const key =
        String(
          row.concept_id ||
          row.canonical_value ||
          row.label ||
          row.raw_value ||
          ""
        ).toLocaleLowerCase();

      if (
        !key ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);
      return true;
    }
  );
}

async function resolveScalar(pool, lookupName, value, lang) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;

  const rows = await resolveLookupValues(
    pool,
    lookupName,
    [cleaned],
    lang
  );

  return rows[0]?.label || cleaned;
}

function rowsToDisplayList(rows) {
  return (rows || [])
    .map((row) => cleanText(row.label))
    .filter(Boolean);
}

function periodDateRange(rows) {
  const starts = (rows || [])
    .map((row) => Number(row.date_from))
    .filter(Number.isFinite);

  const ends = (rows || [])
    .map((row) => Number(row.date_to))
    .filter(Number.isFinite);

  return {
    date_from: starts.length ? Math.min(...starts) : null,
    date_to: ends.length ? Math.max(...ends) : null
  };
}

async function buildMonumentRecordData(pool, {
  raw,
  identity = {},
  lang = "en"
}) {
  if (!raw || typeof raw !== "object") {
    throw new Error("A raw Monument source row is required");
  }

  const requested = safeLang(lang);

  const monumentTypesRaw = arrayFromRepeatedFields(raw, {
    helperField: "monument_types_arr",
    fieldPrefix: "Monument Type",
    count: 6
  });

  const culturalPeriodsRaw = arrayFromRepeatedFields(raw, {
    helperField: "cultural_periods_arr",
    fieldPrefix: "Cultural Period",
    count: 6
  });

  const religionsRaw = arrayFromRepeatedFields(raw, {
    helperField: "religions_arr",
    fieldPrefix: "Religion",
    count: 3
  });

  const adminTypesRaw = [1, 2, 3, 4]
    .map((i) => cleanText(raw[`Administrative Subdivision Type${i}`]))
    .filter(Boolean);

  const measurementUnitsRaw = [1, 2, 3, 4]
    .map((i) => cleanText(raw[`Measurement Unit${i}`]))
    .filter(Boolean);

  const measurementTypesRaw = [1, 2, 3, 4]
    .map((i) => cleanText(raw[`Measurement Type${i}`]))
    .filter(Boolean);

  const [
    country,
    classification,
    designation,
    monumentTypeRows,
    culturalPeriodRows,
    religionRows,
    locationConfidence,
    adminTypeRows,
    measurementUnitRows,
    measurementTypeRows,
    recordedLanguage
  ] = await Promise.all([
    resolveScalar(pool, "country", raw["Country"], requested),
    resolveScalar(pool, "classification", raw["Classification"], requested),
    resolveScalar(pool, "designation", raw["Designation"], requested),
    resolveLookupValues(pool, "monument_types", monumentTypesRaw, requested),
    resolveLookupValues(pool, "cultural_periods", culturalPeriodsRaw, requested),
    resolveLookupValues(pool, "religions", religionsRaw, requested),
    resolveScalar(
      pool,
      "location_confidence",
      raw["Location Confidence"],
      requested
    ),
    resolveLookupValues(pool, "admin_type", adminTypesRaw, requested),
    resolveLookupValues(
      pool,
      "measurement_unit",
      measurementUnitsRaw,
      requested
    ),
    resolveLookupValues(
      pool,
      "measurement_type",
      measurementTypesRaw,
      requested
    ),
    resolveScalar(
      pool,
      "language",
      raw["Preferred Language"],
      requested
    )
  ]);

  const adminTypeByRaw = new Map(
    adminTypeRows.map((row) => [
      String(row.raw_value || "").toLocaleLowerCase(),
      row.label
    ])
  );

  const measurementUnitByRaw = new Map(
    measurementUnitRows.map((row) => [
      String(row.raw_value || "").toLocaleLowerCase(),
      row.label
    ])
  );

  const measurementTypeByRaw = new Map(
    measurementTypeRows.map((row) => [
      String(row.raw_value || "").toLocaleLowerCase(),
      row.label
    ])
  );

  const derivedPeriodDates = periodDateRange(culturalPeriodRows);

  const output = {
    caal_id:
      cleanText(raw["CAAL_ID"]) ||
      cleanText(identity.caal_id),

    display_label:
      cleanText(identity.display_label) ||
      cleanText(raw["Primary Name"]) ||
      cleanText(raw["Primary Name (English)"]),

    primary_name: cleanText(raw["Primary Name"]),
    primary_name_en: cleanText(raw["Primary Name (English)"]),
    other_names: cleanText(raw["Other Names"]),

    country:
      country ||
      cleanText(raw["Country"]),

    region: cleanText(raw["Region"]),

    classification:
      classification ||
      cleanText(raw["Classification"]),

    internal_reference: cleanText(raw["Internal Reference"]),
    external_reference: cleanText(raw["External Reference"]),
    monument_passport: cleanText(raw["Monument Passport"]),

    monument_types_arr: monumentTypesRaw,
    cultural_periods_arr: culturalPeriodsRaw,
    religions_arr: religionsRaw,

    monument_types: rowsToDisplayList(monumentTypeRows),
    cultural_periods: rowsToDisplayList(culturalPeriodRows),
    religions: rowsToDisplayList(religionRows),

    descriptive_date: cleanText(raw["Descriptive Date"]),

    start_date:
      raw["Start Date"] ??
      derivedPeriodDates.date_from,

    end_date:
      raw["End Date"] ??
      derivedPeriodDates.date_to,

    primary_description: cleanText(raw["Primary Description"]),
    primary_description_en: cleanText(raw["Primary Description (English)"]),
    additional_notes: cleanText(raw["Additional Notes"]),

    recorded_longitude:
      raw["Longitude"] ?? null,

    recorded_latitude:
      raw["Latitude"] ?? null,

    altitude:
      raw["Altitude"] ?? null,

    location_confidence:
      locationConfidence ||
      cleanText(raw["Location Confidence"]),

    location_notes: cleanText(raw["Location Notes"]),
    primary_address: cleanText(raw["Primary Address"]),

    designation:
      designation ||
      cleanText(raw["Designation"]),

    world_heritage_site_name:
      cleanText(raw["World Heritage Site Name"]),

    recorded_language:
      recordedLanguage ||
      cleanText(raw["Preferred Language"]),

    recorder: cleanText(raw["Recorder"]),
    date_of_recording: raw["Date of Recording"] ?? null,
    updated_at: raw["Tstamp"] ?? null,

    source_schema: cleanText(identity.source_schema),
    source_table: cleanText(identity.source_table),
    source_row_id:
      cleanText(identity.source_row_id) ||
      cleanText(raw.id),

    geometry: identity.geometry || null
  };

  for (let i = 1; i <= 4; i += 1) {
    output[`admin_subdivision_name_${i}`] =
      cleanText(raw[`Administrative Subdivision Name${i}`]);

    const adminTypeRaw =
      cleanText(raw[`Administrative Subdivision Type${i}`]);

    output[`admin_subdivision_type_${i}`] =
      adminTypeRaw
        ? (
            adminTypeByRaw.get(adminTypeRaw.toLocaleLowerCase()) ||
            adminTypeRaw
          )
        : null;

    output[`measurement_value_${i}`] =
      raw[`Measurement Value${i}`] ?? null;

    const unitRaw = cleanText(raw[`Measurement Unit${i}`]);
    output[`measurement_unit_${i}`] =
      unitRaw
        ? (
            measurementUnitByRaw.get(unitRaw.toLocaleLowerCase()) ||
            unitRaw
          )
        : null;

    const typeRaw = cleanText(raw[`Measurement Type${i}`]);
    output[`measurement_type_${i}`] =
      typeRaw
        ? (
            measurementTypeByRaw.get(typeRaw.toLocaleLowerCase()) ||
            typeRaw
          )
        : null;
  }

  return output;
}

const FIELD_LABEL_KEYS = Object.freeze({
  primary_name: "Primary Name",
  primary_name_en: "Primary Name (English)",
  other_names: "Other Names",
  country: "Country",
  region: "Region",
  classification: "Classification",
  internal_reference: "Internal Reference",
  external_reference: "External Reference",
  monument_passport: "Monument Passport",
  monument_types: "Monument Type",
  religions: "Religion",
  descriptive_date: "Descriptive Date",
  cultural_periods: "Cultural Period",
  start_date: "Start Date",
  end_date: "End Date",
  primary_description: "Primary Description",
  primary_description_en: "Primary Description (English)",
  additional_notes: "Additional Notes",
  altitude: "Altitude",
  location_confidence: "Location Confidence",
  location_notes: "Location Notes",
  primary_address: "Primary Address",
  designation: "Designation",
  world_heritage_site_name: "World Heritage Site Name",
  recorded_language: "Preferred Language",
  recorder: "Recorder",
  date_of_recording: "Date of Recording",
  updated_at: "Tstamp"
});

async function loadMonumentRecordFieldLabels(
  pool,
  lang = "en"
) {
  const requested =
    safeLang(lang);

  const fallback =
    fallbackLang(requested);

  const labelNames = [
    ...new Set(
      Object.values(FIELD_LABEL_KEYS)
    )
  ];

  const result =
    await pool.query(
      `
      SELECT
        label_name,

        COALESCE(
          display_${requested},
          display_${fallback},
          display_en,
          label_name
        ) AS label

      FROM ui.v_label_monuments

      WHERE
        label_name = ANY($1::text[])
      `,
      [labelNames]
    );

  const byName =
    new Map(
      result.rows.map(
        (row) => [
          row.label_name,

          String(row.label || "")
            .replace(/\s+/g, " ")
            .trim()
        ]
      )
    );

  const labels = {};

  for (
    const [key, labelName]
    of Object.entries(
      FIELD_LABEL_KEYS
    )
  ) {
    labels[key] =
      byName.get(labelName) ||
      labelName;
  }

  // PDF-specific presentation labels.
  labels.caal_id =
    "Monument ID";

  labels.monument_passport =
    "Monument passport reference";

  labels.latitude =
    "Latitude";

  labels.longitude =
    "Longitude";

  labels.administrative_area =
    "Administrative area";

  labels.measurement =
    "Measurement";

  return labels;
}

async function loadMonumentRecordDocumentLabels(
  pool,
  lang = "en"
) {
  const requested = safeLang(lang);
  const fallback = fallbackLang(requested);

  const result = await pool.query(
    `
    SELECT
      label_name,
      COALESCE(
        display_${requested},
        display_${fallback},
        display_en,
        label_name
      ) AS label
    FROM ui.v_label_monument_record
    ORDER BY sort_order, label_name
    `
  );

  const labels = {};

  for (const row of result.rows) {
    const key = String(
      row.label_name || ""
    ).trim();

    const value = String(
      row.label || ""
    )
      .replace(/\s+/g, " ")
      .trim();

    if (key && value) {
      labels[key] = value;
    }
  }

  return labels;
}

async function loadMonumentRecordRelations(pool, caalId, lang = "en") {
  const requested = safeLang(lang);
  const fallback = fallbackLang(requested);

  const result = await pool.query(
    `
    SELECT
      r.relation_type,
      r.relation_type_norm,
      r.relation_direction,

      r.related_record_type,
      r.related_dataset_label,
      r.related_caal_id,
      r.related_display_label,

      COALESCE(
        rtl.label_${safeLang},
        rtl.label_${fallback},
        rtl.label_en,
        r.relation_type
      ) AS relationship_label

    FROM ui.mv_resource_related_search r

    LEFT JOIN ui.relation_type_labels rtl
      ON rtl.relation_type_norm = r.relation_type_norm
     AND rtl.relation_direction = r.relation_direction

    WHERE lower(trim(r.returned_caal_id)) =
          lower(trim($1))

    ORDER BY
      r.related_record_type,
      r.related_display_label,
      r.related_caal_id
    `,
    [caalId]
  );

  return result.rows.map((row) => ({
    relationship: row.relationship_label,
    record_type: row.related_record_type,
    label:
      row.related_display_label ||
      row.related_dataset_label ||
      row.related_caal_id,
    caal_id: row.related_caal_id
  }));
}


module.exports = {
  safeLang,
  fallbackLang,
  cleanText,
  arrayFromRepeatedFields,
  resolveLookupValues,
  resolveScalar,
  buildMonumentRecordData,
  loadMonumentRecordFieldLabels,
  loadMonumentRecordDocumentLabels
};
