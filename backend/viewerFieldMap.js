// ============================================================
// viewerFieldMap.js
// Single source of truth for which export/filter fields apply to
// which CAAL record types.
//
// Derived from ui.v_resource_viewer_base: a record type is listed
// against a field only where that branch of the UNION selects a real
// expression. Branches that pad with ARRAY[]::integer[],
// ARRAY[]::text[], '{}'::jsonb or NULL:: are treated as "field does
// not apply to this record type" and are omitted.
//
// The distinction that matters:
//   COMMON_FIELDS      - "absent" is a legitimate VALUE for every type.
//                        An archive with no geometry is honestly null.
//   CONDITIONAL_FIELDS - "absent" would mean the CONCEPT does not exist
//                        for that type. A null condition on an archive
//                        would be a lie, so the column is omitted.
// ============================================================

const RECORD_TYPES = Object.freeze([
  "rs3_poly", "rs3_line", "rs3_group", "institution",
  "vernacular", "monument", "archive", "dataset", "cartography"
]);

// Carried on every record type. Ordered as they should appear in a file.
const COMMON_FIELDS = Object.freeze([
  "caal_id",
  "export_role",
  "record_type",
  "dataset_label",
  "display_label",
  "centroid_lon",
  "centroid_lat",
  "geometry_wkt",
  "geometry_truncated",
  "source_schema",
  "source_table",
  "source_row_id"
]);

// Carried only by the record types listed.
const CONDITIONAL_FIELDS = Object.freeze({
  country: Object.freeze([
    "rs3_poly", "rs3_line", "rs3_group", "institution",
    "vernacular", "monument", "archive"
  ]),
  monument_types: Object.freeze([
    "rs3_poly", "rs3_line", "rs3_group", "monument"
  ]),
  condition_levels: Object.freeze(["rs3_poly", "rs3_line"]),
  deterioration_causes: Object.freeze(["rs3_poly", "rs3_line"]),
  risk_levels: Object.freeze(["rs3_poly", "rs3_line"])
});

// Order within a file. Identity leads, then the record's own fields, then
// export/database metadata. 
const LEADING_FIELDS = Object.freeze([
  "caal_id",
  "display_label"
]);

// Common fields that trail the record's own columns, in this order.
const TRAILING_FIELDS = Object.freeze([
  "country",
  "monument_types",
  "condition_levels",
  "deterioration_causes",
  "risk_levels",
  "centroid_lon",
  "centroid_lat",
  "geometry_wkt",
  "geometry_truncated",
  "export_role",
  "record_type",
  "dataset_label",
  "source_schema",
  "source_table",
  "source_row_id"
]);

const FIELD_ORDER = Object.freeze([...LEADING_FIELDS, ...TRAILING_FIELDS]);

/** Split a common-column list into the part that leads a file and the part
 *  that trails it, so per-type specs can sit between the two. */
function splitCommonFields(fields) {
  return {
    leading: fields.filter(f => LEADING_FIELDS.includes(f)),
    trailing: fields.filter(f => !LEADING_FIELDS.includes(f))
  };
}

// Fields a given format does not carry, whatever the record type.
// GPKG stores geometry as a WKB blob, so the WKT pair is redundant there.
const FORMAT_EXCLUSIONS = Object.freeze({
  csv: Object.freeze([]),
  gpkg: Object.freeze(["geometry_wkt", "geometry_truncated"]),
  kml: Object.freeze(["geometry_wkt", "geometry_truncated"])
});

function orderFields(fields) {
  const rank = f => {
    const i = FIELD_ORDER.indexOf(f);
    return i === -1 ? FIELD_ORDER.length : i;
  };
  return fields.slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * True when `field` is meaningful for `recordType`.
 * Unknown fields are treated as common (fail open, so a newly added
 * column still exports rather than silently vanishing).
 */
function appliesTo(field, recordType) {
  const types = CONDITIONAL_FIELDS[field];
  if (!types) return true;
  return types.includes(recordType);
}

/**
 * Ordered column list for one record type in one format.
 * Falls back to the common set for an unrecognised record type.
 */
function fieldsForRecordType(recordType, format = "csv") {
  const excluded = new Set(FORMAT_EXCLUSIONS[format] || []);
  const fields = [
    ...COMMON_FIELDS,
    ...Object.keys(CONDITIONAL_FIELDS).filter(f => appliesTo(f, recordType))
  ].filter(f => !excluded.has(f));
  return orderFields(fields);
}

/** Ordered common column list for one format (records.csv / the union file). */
function commonFields(format = "csv") {
  const excluded = new Set(FORMAT_EXCLUSIONS[format] || []);
  return orderFields(COMMON_FIELDS.filter(f => !excluded.has(f)));
}

/**
 * Which filter controls to show for a set of active record types, and
 * which of those types each one actually constrains.
 *
 * Returns [{ field, scope, universal }] where `scope` is the subset of
 * `recordTypes` the filter applies to and `universal` is true when it
 * applies to all of them. Render the scope on the filter chip when
 * `universal` is false, so a user can see that filtering on condition
 * does not silently drop their archives.
 */
function filterFieldsFor(recordTypes) {
  const active = (recordTypes || []).filter(t => RECORD_TYPES.includes(t));
  if (!active.length) return [];
  return Object.keys(CONDITIONAL_FIELDS)
    .map(field => {
      const scope = active.filter(t => appliesTo(field, t));
      return { field, scope, universal: scope.length === active.length };
    })
    .filter(entry => entry.scope.length > 0)
    .sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));
}

/** Row values for a record, in the column order given. */
function rowValues(record, fields) {
  return fields.map(f => (record[f] === undefined ? null : record[f]));
}

// ============================================================
// SQL helpers for permissive ("scoped") filtering.
//
// The record-type lists above come from a frozen constant in this file,
// so they are interpolated as literals rather
// than bound parameters. That is deliberate: buildViewerWhereSql tracks
// its own $n index by hand, and adding a parameter per filter would
// disturb arithmetic across the whole function for no benefit.
// ============================================================

/**
 * SQL that is TRUE for record types the field does not apply to.
 * Returns null for common fields (nothing to guard).
 * `p` is buildViewerWhereSql's prefix: "v." or "".
 */
function notApplicableSql(field, p = "v.") {
  const types = CONDITIONAL_FIELDS[field];
  if (!types) return null;
  const excluded = RECORD_TYPES.filter(t => !types.includes(t));
  if (!excluded.length) return null;            // applies to every type
  const list = a => a.map(t => `'${t}'`).join(", ");
  // Emit whichever form is shorter, purely so the logged SQL stays readable.
  return excluded.length <= types.length
    ? `${p}record_type IN (${list(excluded)})`
    : `${p}record_type NOT IN (${list(types)})`;
}

/**
 * Wrap a match expression so it constrains only the record types the
 * field applies to. Records of other types pass through untouched
 * instead of being silently dropped by an && against an empty array.
 *
 * mode "strict" restores the previous behaviour unchanged, so the two
 * can be compared without a redeploy.
 */
function scopeFilterSql(field, matchSql, p = "v.", mode = "scoped") {
  if (mode === "strict") return `(${matchSql})`;
  const guard = notApplicableSql(field, p);
  return guard ? `(${guard} OR (${matchSql}))` : `(${matchSql})`;
}

// ============================================================
// Resolves concept-ID arrays on the per-type MVs (monument_types_arr,
// cultural_periods_arr, ...) into export columns, at export time rather
// than at MV refresh — the export is the only consumer, so the hot MVs
// stay as they are.
//
// Emits, per vocabulary:
//   <prefix>              display labels, in record order, de-duplicated
//   <prefix>_concept_ids  the concept IDs, in record order, de-duplicated
//   and for periods, <prefix>_date_from / _date_to
//
// De-duplication is on concept_id ONLY. Where a term is ambiguous, both
// candidate concept IDs are recorded deliberately because it is unknown
// which was meant; they resolve to different display strings via the
// bracketed context, so collapsing equal labels would throw that away.
// A concept recorded twice in one record IS collapsed.
// ============================================================

const VALUE_SEPARATOR = "; ";

// Languages with materialised label/display columns in the context views.
const LOOKUP_LANGS = ["en", "ru", "zh", "kk", "ky", "tg", "tk", "uz"];


/*
  Two lookup shapes exist and they are not interchangeable.
 
  Context views (site types, cultural periods) are hierarchical: keyed on
  concept_id, with label_<lang> for the bare term and display_<lang> for
  the disambiguating "term [parent]" form.
 
  Flat lookups (religion, languages) are keyed on canonical_value, have
  display_<lang> only, and no hierarchy — so there is no label fallback
  and nothing to disambiguate.
*/
const VOCAB_SOURCES = Object.freeze({
  site_types: Object.freeze({
    lookupView: "ui.v_lkp_site_types_context",
    keyColumn: "concept_id",
    hasLabelColumns: true,
    hasDates: false,
    idColumnSuffix: "_concept_ids"
  }),
  cultural_periods: Object.freeze({
    lookupView: "ui.v_lkp_cultural_periods_context",
    keyColumn: "concept_id",
    hasLabelColumns: true,
    hasDates: true,
    idColumnSuffix: "_concept_ids"
  }),
  religion: Object.freeze({
    lookupView: "ui.v_lkp_religion",
    keyColumn: "canonical_value",
    hasLabelColumns: false,
    hasDates: false,
    idColumnSuffix: "_canonical_values"
  }),
  language_display: Object.freeze({
    lookupView: "ui.v_lkp_langdisplay",
    keyColumn: "canonical_value",
    hasLabelColumns: false,
    hasDates: false,
    idColumnSuffix: "_canonical_values"
  })
});

function safeLookupLang(lang) {
  const value = String(lang || "en").toLowerCase();
  return LOOKUP_LANGS.includes(value) ? value : "en";
}

/**
 * Intermediate fallback language. Mirrors fallbackViewerLang() in
 * resourceViewerRoutes.js: the Central Asian languages fall back to
 * Russian before English, everything else straight to English.
 * The export MUST match the viewer here, or the same record shows a
 * different label in the app and in the download.
 */
function fallbackLookupLang(lang) {
  return ["kk", "ky", "tg", "tk", "uz"].includes(safeLookupLang(lang))
    ? "ru"
    : "en";
}

/** Ordered, de-duplicated language chain: requested -> fallback -> en. */
function langChain(lang) {
  const safe = safeLookupLang(lang);
  return [...new Set([safe, fallbackLookupLang(safe), "en"])];
}

/**
 * COALESCE chain for a lookup's display value.
 * `hasLabelColumns` gates the label_<lang> fallbacks — flat lookups have
 * no such columns and referencing them would be a hard SQL error.
 * Falls through to the raw key so an unmapped value still shows something.
 */
function displayExprSql(alias, lang, source) {
  const chain = langChain(lang);
  const hasLabels = source ? source.hasLabelColumns : true;
  const parts = chain.map(c => `${alias}.display_${c}`);
  if (hasLabels) parts.push(...chain.map(c => `${alias}.label_${c}`));
  return `COALESCE(${parts.join(", ")}, a.vkey)`;
}
 
 
/*
  `a(vkey, ord)` rather than a(concept_id, ord): the array holds concept
  IDs for the context views and canonical values for the flat lookups,
  so a neutral name is honest about both.
*/
function vocabArrayJoin({
  recordAlias, arrayColumn, vocab, joinAlias, exportPrefix, lang
}) {
  const source = VOCAB_SOURCES[vocab];
  if (!source) throw new Error(`Unknown vocabulary: ${vocab}`);
 
  const display = displayExprSql("lk", lang, source);
  const dateSelect = source.hasDates
    ? `,\n             lk.date_from,\n             lk.date_to`
    : "";
  const dateAggregates = source.hasDates
    ? `,\n      MIN(d.date_from)::int AS date_from,\n      MAX(d.date_to)::int   AS date_to`
    : "";
 
  const joinSql = `
  LEFT JOIN LATERAL (
    SELECT
      string_agg(d.label, '${VALUE_SEPARATOR}' ORDER BY d.ord) AS labels,
      string_agg(d.vkey,  '${VALUE_SEPARATOR}' ORDER BY d.ord) AS keys${dateAggregates}
    FROM (
      SELECT DISTINCT ON (a.vkey)
             a.vkey,
             a.ord,
             ${display} AS label${dateSelect}
      FROM unnest(${recordAlias}.${arrayColumn}) WITH ORDINALITY AS a(vkey, ord)
      LEFT JOIN ${source.lookupView} lk
        ON lk.${source.keyColumn} = a.vkey
      ORDER BY a.vkey, a.ord
    ) d
  ) ${joinAlias} ON TRUE`;
 
  const selectColumns = [
    { expr: `${joinAlias}.labels`, export: exportPrefix },
    { expr: `${joinAlias}.keys`,
      export: `${exportPrefix}${source.idColumnSuffix}` }
  ];
 
  if (source.hasDates) {
    selectColumns.push(
      { expr: `${joinAlias}.date_from`, export: `${exportPrefix}_date_from` },
      { expr: `${joinAlias}.date_to`,   export: `${exportPrefix}_date_to` }
    );
  }
 
  return { joinSql, selectColumns };
}

/**
 * Convenience: build all vocabulary joins declared on a record type's
 * export spec. `spec.vocabArrays` is
 *   [{ arrayColumn, vocab, exportPrefix }]
 */
function vocabArrayJoinsFor(spec, recordAlias, lang) {
  const joins = [];
  const columns = [];

  (spec.vocabArrays || []).forEach((entry, i) => {
    const built = vocabArrayJoin({
      recordAlias,
      arrayColumn: entry.arrayColumn,
      vocab: entry.vocab,
      joinAlias: `vocab_${i}`,
      exportPrefix: entry.exportPrefix,
      lang
    });
    joins.push(built.joinSql);
    columns.push(...built.selectColumns);
  });

  return { joinSql: joins.join("\n"), selectColumns: columns };
}

// ============================================================
// Per-type export specs 
//
// A spec says, for one record type: where its rows come from, and how
// each export column is built. Four mechanisms:
//
//   plain         raw MV column, taken as-is
//   lang          scalar controlled list; resolved through the MV's
//                 <base>_<lang> columns with fallback to en then raw
//   vocabArray    concept-ID array resolved against a context view,
//                 emitting <prefix> + <prefix>_concept_ids (+ dates)
//   langNumbered  a set of numbered <base>N_<lang> columns collapsed
//                 into one delimited column, de-duplicated
//
// langNumbered exists because not every controlled list is concept-coded.
// religions_arr holds literal values ({Islam}), not MT-/CP- style IDs, so
// it has no context view to join to and must come from religion1..3.
// ============================================================

/**
 * COALESCE over the MV's per-language columns, mirroring
 * viewerMvLangValueSql's fallback order so the export and the viewer
 * agree on what a value is called.
 */
function mvLangValueSql(alias, base, rawSql, lang) {
  const parts = langChain(lang).map(c => `${alias}."${base}_${c}"`);
  if (rawSql) parts.push(rawSql);
  return `COALESCE(${parts.join(", ")})`;
}

/**
 * COALESCE over a flat lookup's display columns, for a scalar (non-array)
 * controlled value that the MV stores raw. Falls back to the raw value so
 * an unmapped entry still shows something rather than going null.
 */
function scalarLookupDisplaySql(joinAlias, lang, rawSql) {
  const parts = langChain(lang).map(c => `${joinAlias}.display_${c}`);
  if (rawSql) parts.push(rawSql);
  return `COALESCE(${parts.join(", ")})`;
}

/**
 * Collapse numbered per-language columns into one delimited column.
 * De-duplicates and drops blanks while preserving slot order.
 */
function langNumberedSql(alias, base, count, lang, rawPattern) {
  const safe = safeLookupLang(lang);
  const values = [];
  for (let i = 1; i <= count; i += 1) {
    const raw = rawPattern ? `${alias}."${rawPattern.replace("{n}", i)}"` : null;
    values.push(mvLangValueSql(alias, `${base}${i}`, raw, safe));
  }
  return `(
      SELECT string_agg(v, '${VALUE_SEPARATOR}' ORDER BY ord)
      FROM (
        SELECT DISTINCT ON (v) v, ord
        FROM unnest(ARRAY[${values.join(", ")}]) WITH ORDINALITY AS u(v, ord)
        WHERE v IS NOT NULL AND btrim(v) <> ''
        ORDER BY v, ord
      ) dv
    )`;
}

const EXPORT_SPECS = Object.freeze({
  monument: Object.freeze({
    source: "ui.mv_monuments_caal",
    labelView: "ui.v_label_monuments",
    alias: "m",
    keyColumn: "id",
    geometryColumn: "geom",

    // Array columns resolved against a lookup. Concept-ID arrays join the
    // hierarchical context views; religions_arr holds canonical values and
    // joins the flat lookup instead.
    vocabArrays: Object.freeze([
      Object.freeze({
        arrayColumn: "monument_types_arr",
        vocab: "site_types",
        exportPrefix: "monument_types",
        labelKey: "Monument Type"
      }),
      Object.freeze({
        arrayColumn: "cultural_periods_arr",
        vocab: "cultural_periods",
        exportPrefix: "cultural_periods",
        labelKey: "Cultural Period"
      }),
      Object.freeze({
        arrayColumn: "religions_arr",
        vocab: "religion",
        exportPrefix: "religions",
        labelKey: "Religion"
      })
    ]),

    columns: Object.freeze([
      { kind: "plain", raw: "Primary Name",              export: "primary_name" },
      { kind: "plain", raw: "Primary Name (English)",    export: "primary_name_en" },
      { kind: "plain", raw: "Other Names",               export: "other_names" },
      { kind: "lang",  raw: "Country",  base: "country", export: "country" },
      { kind: "plain", raw: "Region",                    export: "region" },
      { kind: "lang",  raw: "Classification",
        base: "classification",                          export: "classification" },
      { kind: "plain", raw: "Internal Reference",        export: "internal_reference" },
      { kind: "plain", raw: "External Reference",        export: "external_reference" },
      { kind: "plain", raw: "Monument Passport",         export: "monument_passport" },

      // monument_types / monument_types_concept_ids come from vocabArrays

      { kind: "plain", raw: "Descriptive Date",          export: "descriptive_date" },

      // cultural_periods + _concept_ids + _date_from/_date_to from vocabArrays

      { kind: "plain", raw: "Start Date",                export: "start_date" },
      { kind: "plain", raw: "End Date",                  export: "end_date" },
      { kind: "plain", raw: "Primary Description",       export: "primary_description" },
      { kind: "plain", raw: "Primary Description (English)",
                                                         export: "primary_description_en" },
      { kind: "plain", raw: "Additional Notes",          export: "additional_notes" },
      { kind: "plain", raw: "Longitude",                 export: "recorded_longitude" },
      { kind: "plain", raw: "Latitude",                  export: "recorded_latitude" },
      { kind: "plain", raw: "Altitude",                  export: "altitude" },
      { kind: "lang",  raw: "Location Confidence",
        base: "location_confidence",                     export: "location_confidence" },
      { kind: "plain", raw: "Location Notes",            export: "location_notes" },
      { kind: "plain", raw: "Primary Address",           export: "primary_address" },

      { kind: "plain", raw: "Administrative Subdivision Name1",
                                                         export: "admin_subdivision_name_1" },
      { kind: "lang",  raw: "Administrative Subdivision Type1",
        base: "admin_subdivision_type1",                 export: "admin_subdivision_type_1" },
      { kind: "plain", raw: "Administrative Subdivision Name2",
                                                         export: "admin_subdivision_name_2" },
      { kind: "lang",  raw: "Administrative Subdivision Type2",
        base: "admin_subdivision_type2",                 export: "admin_subdivision_type_2" },
      { kind: "plain", raw: "Administrative Subdivision Name3",
                                                         export: "admin_subdivision_name_3" },
      { kind: "lang",  raw: "Administrative Subdivision Type3",
        base: "admin_subdivision_type3",                 export: "admin_subdivision_type_3" },
      { kind: "plain", raw: "Administrative Subdivision Name4",
                                                         export: "admin_subdivision_name_4" },
      { kind: "lang",  raw: "Administrative Subdivision Type4",
        base: "admin_subdivision_type4",                 export: "admin_subdivision_type_4" },

      { kind: "plain", raw: "Measurement Value1",        export: "measurement_value_1" },
      { kind: "lang",  raw: "Measurement Unit1",
        base: "measurement_unit1",                       export: "measurement_unit_1" },
      { kind: "lang",  raw: "Measurement Type1",
        base: "measurement_type1",                       export: "measurement_type_1" },
      { kind: "plain", raw: "Measurement Value2",        export: "measurement_value_2" },
      { kind: "lang",  raw: "Measurement Unit2",
        base: "measurement_unit2",                       export: "measurement_unit_2" },
      { kind: "lang",  raw: "Measurement Type2",
        base: "measurement_type2",                       export: "measurement_type_2" },
      { kind: "plain", raw: "Measurement Value3",        export: "measurement_value_3" },
      { kind: "lang",  raw: "Measurement Unit3",
        base: "measurement_unit3",                       export: "measurement_unit_3" },
      { kind: "lang",  raw: "Measurement Type3",
        base: "measurement_type3",                       export: "measurement_type_3" },
      { kind: "plain", raw: "Measurement Value4",        export: "measurement_value_4" },
      { kind: "lang",  raw: "Measurement Unit4",
        base: "measurement_unit4",                       export: "measurement_unit_4" },
      { kind: "lang",  raw: "Measurement Type4",
        base: "measurement_type4",                       export: "measurement_type_4" },

      { kind: "lang",  raw: "Designation",
        base: "designation",                             export: "designation" },
      { kind: "plain", raw: "World Heritage Site Name",
                                                         export: "world_heritage_site_name" },

      // Single raw column on the MV, resolved through the flat lookup.
      { kind: "langLookup", raw: "Preferred Language",
        vocab: "language_display", keyColumn: "iso_code",
        export: "recorded_language" },

      { kind: "plain", raw: "Recorder",                  export: "recorder" },
      { kind: "plain", raw: "Tstamp",                    export: "updated_at" }
    ]),

    // Shown in the KML balloon. Deliberately a subset
    kmlFields: Object.freeze([
      { column: "primary_name",             label: "Primary name" },
      { column: "primary_name_en",          label: "Primary name (English)" },
      { column: "region",                   label: "Region" },
      { column: "monument_passport",        label: "Monument passport" },
      { column: "primary_description",      label: "Description" },
      { column: "primary_description_en",   label: "Description (English)" },
      { column: "additional_notes",         label: "Additional notes" },
      { column: "designation",              label: "Designation" },
      { column: "world_heritage_site_name", label: "World Heritage site" },
      { column: "monument_types",           label: "Monument types" },
      { column: "cultural_periods",         label: "Cultural periods" },
      { column: "religions",                label: "Religions" },
      { column: "recorded_language",        label: "Recorded language" }
    ])
  }),
  archive: Object.freeze({
    source: "ui.mv_archive_caal_app",
    labelView: "ui.v_label_archive",
    alias: "ar",
    keyColumn: "id",
    geometryColumn: null,          // archives carry no geometry
 
    vocabArrays: Object.freeze([]), // no concept-ID arrays on this type
 
    columns: Object.freeze([
      { kind: "lang",  raw: "Level", base: "level",        export: "level" },
      { kind: "plain", raw: "Original Reference",          export: "original_reference" },
      { kind: "plain", raw: "Original Title",              export: "original_title" },
      { kind: "plain", raw: "English Title",               export: "english_title" },
      { kind: "lang",  raw: "Content Type",
        base: "content_type",                              export: "content_type" },
      { kind: "plain", raw: "Description",                 export: "description" },
      { kind: "plain", raw: "Description - alternative language",
                                                           export: "description_alt_language" },
      { kind: "plain", raw: "Number and Type of Original Material",
                                                           export: "original_material_number_and_type" },
      { kind: "lang",  raw: "Size and Dimensions of Original Material",
        base: "size_dimensions",                           export: "original_material_size" },
      { kind: "lang",  raw: "Condition of Original Material",
        base: "condition",                                 export: "original_material_condition" },
      { kind: "lang",  raw: "Related Countries",
        base: "related_countries",                         export: "related_countries" },
      { kind: "plain", raw: "Related Towns and Cities",    export: "related_towns_and_cities" },
      { kind: "lang",  raw: "Related Religions",
        base: "related_religions",                         export: "related_religions" },
      { kind: "lang",  raw: "Related Subjects",
        base: "related_subjects",                          export: "related_subjects" },
      { kind: "lang",  raw: "Other Subjects",
        base: "other_subjects",                            export: "other_subjects" },
      { kind: "plain", raw: "Dates of Original Material",  export: "original_material_dates" },
      { kind: "plain", raw: "Author of the Original Material",
                                                           export: "original_material_author" },
      { kind: "plain", raw: "Publisher of the Original Material",
                                                           export: "original_material_publisher" },
      { kind: "plain", raw: "Editor of the Original Material",
                                                           export: "original_material_editor" },
      { kind: "plain", raw: "Volume and Issue Number",     export: "volume_and_issue_number" },
      { kind: "lang",  raw: "Languages of Material",
        base: "languages_material",                        export: "languages_of_material" },
      { kind: "lang",  raw: "Script of Material",
        base: "script_material",                           export: "script_of_material" },
      { kind: "lang",  raw: "Writing System",
        base: "writing_system",                            export: "writing_system" },
      { kind: "lang",  base: "copyright_status",           export: "copyright_status" },
      { kind: "plain", raw: "Copyright Holder Name",       export: "copyright_holder_name" },
      { kind: "plain", raw: "Copyright Attribution",       export: "copyright_attribution" },
      { kind: "plain", raw: "Digital Folder Name",         export: "digital_folder_name" },
      { kind: "plain", raw: "Digital Files Name",          export: "digital_files_name" },
      { kind: "plain", raw: "Creation Date of Digital Files",
                                                           export: "digital_files_created" },
      { kind: "lang",  raw: "Format of Digital Files",
        base: "digital_format",                            export: "digital_files_format" },
      { kind: "plain", raw: "Number of Digital Files",     export: "digital_files_count" },
      { kind: "lang",  raw: "Colour", base: "colour",      export: "colour" },
      { kind: "plain", raw: "Resolution",                  export: "resolution" },
      { kind: "plain", raw: "Archive Recorder",            export: "recorder" },
      { kind: "plain", raw: "Date of Recording",           export: "date_of_recording" },
      { kind: "plain", raw: "Resource",                    export: "resource" }
    ]),
 
    // Archive has no geometry, so never reaches a KML placemark.
    // Listed for completeness.
    kmlFields: Object.freeze([])
  }),

  // ============================================================
// RS export specs — add these three keys inside EXPORT_SPECS,
// after `archive`. Remember the trailing comma on archive's `})`.
//
// No new spec mechanism: ui.v_rs3_*_export already emits the
// <base>_<lang> columns, so kind:"lang" resolves them through the
// existing langChain fallback.
// ============================================================

  rs3_poly: Object.freeze({
    source: "ui.v_rs3_poly_export",
    labelView: null,   // no label view yet
    alias: "rs",
    keyColumn: "id",
    keyType: "integer",
    vocabArrays: Object.freeze([]),   // view resolves types itself

    columns: Object.freeze([
      { kind: "plain", raw: 'Gridcode', export: 'gridcode' },
      { kind: "lang",  base: 'country', export: 'country' },
      { kind: "plain", raw: 'Region', export: 'region' },
      { kind: "plain", raw: 'Digitised dataset', export: 'digitised_dataset' },
      { kind: "lang",  base: 'visibility', export: 'visibility' },
      { kind: "lang",  base: 'anomaly_types', export: 'anomaly_types' },
      { kind: "lang",  base: 'origin', export: 'origin' },
      { kind: "lang",  base: 'monument_types', export: 'monument_types' },
      { kind: "plain", raw: 'monument_types_concept_ids', export: 'monument_types_concept_ids' },
      { kind: "plain", raw: 'Interpretation', export: 'interpretation' },
      { kind: "lang",  base: 'certainty', export: 'certainty' },
      { kind: "plain", raw: 'Comments', export: 'comments' },
      { kind: "lang",  base: 'merit_ground_truthing', export: 'merit_ground_truthing' },
      { kind: "plain", raw: 'Ground-truthed', export: 'ground_truthed' },

      // Condition: integer sorts, label reads.
      { kind: "plain", raw: 'overall_condition', export: 'overall_condition' },
      { kind: "lang",  base: 'condition', export: 'overall_condition_label' },
      { kind: "plain", raw: 'Notes on Condition', export: 'notes_on_condition' },

      // 11 booleans -> one list; 11 levels -> "label: level", level >= 2.
      { kind: "lang",  base: 'deterioration_causes', export: 'deterioration_causes' },
      { kind: "plain", raw: 'deterioration_causes_count', export: 'deterioration_cause_count' },
      { kind: "lang",  base: 'risks', export: 'risks' },
      { kind: "plain", raw: 'max_risk_level', export: 'max_risk_level' },
      { kind: "plain", raw: 'Notes on Risk', export: 'notes_on_risk' },

      // Measurements: type/unit resolved tolerantly in the view.
      // Rows storing numeric codes (408 / 815) come out NULL.
      { kind: "plain", raw: 'measurement_value_1', export: 'measurement_value_1' },
      { kind: "lang",  base: 'measurement_unit_1', export: 'measurement_unit_1' },
      { kind: "lang",  base: 'measurement_type_1', export: 'measurement_type_1' },
      { kind: "plain", raw: 'measurement_value_2', export: 'measurement_value_2' },
      { kind: "lang",  base: 'measurement_unit_2', export: 'measurement_unit_2' },
      { kind: "lang",  base: 'measurement_type_2', export: 'measurement_type_2' },
      { kind: "plain", raw: 'measurement_value_3', export: 'measurement_value_3' },
      { kind: "lang",  base: 'measurement_unit_3', export: 'measurement_unit_3' },
      { kind: "lang",  base: 'measurement_type_3', export: 'measurement_type_3' },
      { kind: "plain", raw: 'measurement_value_4', export: 'measurement_value_4' },
      { kind: "lang",  base: 'measurement_unit_4', export: 'measurement_unit_4' },
      { kind: "lang",  base: 'measurement_type_4', export: 'measurement_type_4' },

      { kind: "plain", raw: 'Date of Recording', export: 'date_of_recording' },
      { kind: "plain", raw: 'Date of assessment (GE image)', export: 'date_of_assessment' },
      { kind: "plain", raw: 'Recorder', export: 'recorder' },
      { kind: "plain", raw: 'Tstamp', export: 'updated_at' },
    ]),

    kmlFields: Object.freeze([
      { column: 'interpretation', label: 'Interpretation' },
      { column: 'monument_types', label: 'Monument types' },
      { column: 'certainty', label: 'Certainty' },
      { column: 'comments', label: 'Comments' },
      { column: 'overall_condition_label', label: 'Condition' },
      { column: 'notes_on_condition', label: 'Notes on condition' },
      { column: 'deterioration_causes', label: 'Causes of deterioration' },
      { column: 'risks', label: 'Risks' },
      { column: 'notes_on_risk', label: 'Notes on risk' },
      { column: 'visibility', label: 'Visible on' },
      { column: 'anomaly_types', label: 'Anomaly types' },
      { column: 'origin', label: 'Origin' },
    ])
  }),

  rs3_line: Object.freeze({
    source: "ui.v_rs3_line_export",
    labelView: null,   // no label view yet
    alias: "rs",
    keyColumn: "id",
    keyType: "integer",
    vocabArrays: Object.freeze([]),   // view resolves types itself

    columns: Object.freeze([
      { kind: "plain", raw: 'Gridcode', export: 'gridcode' },
      { kind: "lang",  base: 'country', export: 'country' },
      { kind: "plain", raw: 'Region', export: 'region' },
      { kind: "plain", raw: 'Digitised Dataset', export: 'digitised_dataset' },
      { kind: "lang",  base: 'visibility', export: 'visibility' },
      { kind: "lang",  base: 'anomaly_types', export: 'anomaly_types' },
      { kind: "lang",  base: 'origin', export: 'origin' },
      { kind: "lang",  base: 'monument_types', export: 'monument_types' },
      { kind: "plain", raw: 'monument_types_concept_ids', export: 'monument_types_concept_ids' },
      { kind: "plain", raw: 'Interpretation', export: 'interpretation' },
      { kind: "lang",  base: 'certainty', export: 'certainty' },
      { kind: "plain", raw: 'Comments', export: 'comments' },
      { kind: "lang",  base: 'merit_ground_truthing', export: 'merit_ground_truthing' },
      { kind: "plain", raw: 'Ground-truthed', export: 'ground_truthed' },

      // Condition: integer sorts, label reads.
      { kind: "plain", raw: 'overall_condition', export: 'overall_condition' },
      { kind: "lang",  base: 'condition', export: 'overall_condition_label' },
      { kind: "plain", raw: 'Notes on Condition', export: 'notes_on_condition' },

      // 11 booleans -> one list; 11 levels -> "label: level", level >= 2.
      { kind: "lang",  base: 'deterioration_causes', export: 'deterioration_causes' },
      { kind: "plain", raw: 'deterioration_causes_count', export: 'deterioration_cause_count' },
      { kind: "lang",  base: 'risks', export: 'risks' },
      { kind: "plain", raw: 'max_risk_level', export: 'max_risk_level' },
      { kind: "plain", raw: 'Notes on Risk', export: 'notes_on_risk' },

      // Measurements: type/unit resolved tolerantly in the view.
      // Rows storing numeric codes (408 / 815) come out NULL.
      { kind: "plain", raw: 'measurement_value_1', export: 'measurement_value_1' },
      { kind: "lang",  base: 'measurement_unit_1', export: 'measurement_unit_1' },
      { kind: "lang",  base: 'measurement_type_1', export: 'measurement_type_1' },
      { kind: "plain", raw: 'measurement_value_2', export: 'measurement_value_2' },
      { kind: "lang",  base: 'measurement_unit_2', export: 'measurement_unit_2' },
      { kind: "lang",  base: 'measurement_type_2', export: 'measurement_type_2' },
      { kind: "plain", raw: 'measurement_value_3', export: 'measurement_value_3' },
      { kind: "lang",  base: 'measurement_unit_3', export: 'measurement_unit_3' },
      { kind: "lang",  base: 'measurement_type_3', export: 'measurement_type_3' },
      { kind: "plain", raw: 'measurement_value_4', export: 'measurement_value_4' },
      { kind: "lang",  base: 'measurement_unit_4', export: 'measurement_unit_4' },
      { kind: "lang",  base: 'measurement_type_4', export: 'measurement_type_4' },

      { kind: "plain", raw: 'Date of Recording', export: 'date_of_recording' },
      { kind: "plain", raw: 'Date of assessment (GE image)', export: 'date_of_assessment' },
      { kind: "plain", raw: 'Recorder', export: 'recorder' },
      { kind: "plain", raw: 'Tstamp', export: 'updated_at' },
    ]),

    kmlFields: Object.freeze([
      { column: 'interpretation', label: 'Interpretation' },
      { column: 'monument_types', label: 'Monument types' },
      { column: 'certainty', label: 'Certainty' },
      { column: 'comments', label: 'Comments' },
      { column: 'overall_condition_label', label: 'Condition' },
      { column: 'notes_on_condition', label: 'Notes on condition' },
      { column: 'deterioration_causes', label: 'Causes of deterioration' },
      { column: 'risks', label: 'Risks' },
      { column: 'notes_on_risk', label: 'Notes on risk' },
      { column: 'visibility', label: 'Visible on' },
      { column: 'anomaly_types', label: 'Anomaly types' },
      { column: 'origin', label: 'Origin' },
    ])
  }),

  rs3_group: Object.freeze({
    source: "ui.v_rs3_group_export",
    labelView: null,   // no label view yet
    alias: "rs",
    keyColumn: "id",
    keyType: "integer",
    vocabArrays: Object.freeze([]),

    columns: Object.freeze([
      { kind: "lang",  base: 'country', export: 'country' },
      { kind: "plain", raw: 'Region', export: 'region' },
      { kind: "lang",  base: 'monument_types', export: 'monument_types' },
      { kind: "plain", raw: 'monument_types_concept_ids', export: 'monument_types_concept_ids' },
      { kind: "plain", raw: 'Interpretation', export: 'interpretation' },
      { kind: "lang",  base: 'certainty', export: 'certainty' },
      { kind: "plain", raw: 'Comments', export: 'comments' },
      { kind: "plain", raw: 'Date of Recording', export: 'date_of_recording' },
      { kind: "plain", raw: 'Recorder', export: 'recorder' },
      { kind: "plain", raw: 'Tstamp', export: 'updated_at' },
    ]),

    kmlFields: Object.freeze([
      { column: 'interpretation', label: 'Interpretation' },
      { column: 'monument_types', label: 'Monument types' },
      { column: 'certainty', label: 'Certainty' },
      { column: 'comments', label: 'Comments' },
    ])
  })
});


/**
 * The key each export column looks its label up by.
 * `labelKey` wins where a column has no source column of its own —
 * the vocabulary arrays and anything the view composes.
 */
function labelKeyFor(col) {
  return col.labelKey || col.raw || col.export;
}
 
/** snake_case -> Sentence case, for columns with no label row. */
function prettifyExportName(name) {
  const s = String(name || "").replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : name;
}
 
/**
 * Ordered [{ column, labelKey }] for a record type, so the caller can
 * resolve labels without re-deriving the column list.
 * Vocabulary-array columns are included with composed keys.
 */
function labelKeysForRecordType(recordType) {
  const spec = EXPORT_SPECS[recordType];
  if (!spec) return [];
  const out = spec.columns.map(c => ({ column: c.export, labelKey: labelKeyFor(c) }));
  for (const v of spec.vocabArrays || []) {
    const source = VOCAB_SOURCES[v.vocab];
    out.push({ column: v.exportPrefix, labelKey: v.labelKey || v.exportPrefix });
    if (source) {
      out.push({
        column: `${v.exportPrefix}${source.idColumnSuffix}`,
        labelKey: `${v.exportPrefix}${source.idColumnSuffix}`
      });
      if (source.hasDates) {
        out.push({ column: `${v.exportPrefix}_date_from`,
                   labelKey: `${v.exportPrefix}_date_from` });
        out.push({ column: `${v.exportPrefix}_date_to`,
                   labelKey: `${v.exportPrefix}_date_to` });
      }
    }
  }
  return out;
}

/**
 * SQL for one record type's export file, reusing the existing CTEs so the
 * per-type file covers exactly the rows the user filtered to.
 *
 * `ctes` and `sfx` are what exportRecordsSql already receives. `pickedSql`
 * is the body of the existing `picked` CTE, unchanged — the per-type query
 * joins its own MV onto it rather than reimplementing the selection.
 *
 * Types with no spec are not handled here; the caller falls back to
 * slicing the existing picked rows, so nothing regresses.
 */
function exportTypeRecordsSql({
  ctes, pickedSql, recordType, lang, commonCols, format = "csv"
}) {
  const built = buildTypeExportColumns(recordType, lang, format);
  if (!built) return null;

  const { spec, alias, joinSql, selectSql, columns } = built;

  // Identity first, then the record's own fields, then metadata.
  const { leading, trailing } = splitCommonFields(commonCols);
  const commonSelect = cols => cols.map(c => `p."${c}"`).join(",\n       ");

  /*
    GPKG needs the geometry as WKB plus per-row bounds, which the CSV path
    has no use for. These are passthrough columns consumed by
    viewerGeoPackage.js — they are deliberately NOT in `columns`, so they
    never become attribute columns in the output file.
  */
  const passthroughSelect =
    format === "gpkg"
      ? `,\n       p."geom_wkb", p."min_x", p."min_y", p."max_x", p."max_y"`
      : format === "kml"
        // caal_id_norm is the key the KML route merges these rows onto the
        // already-fetched placemark rows with.
        ? `,\n       p."caal_id_norm"`
        : "";

  let sourceJoinSql;

  switch (spec.keyType) {
    case "integer":
      sourceJoinSql = `
        ${alias}."${spec.keyColumn}" =
        NULLIF(
          p.source_row_id::text,
          ''
        )::integer
      `;
      break;

    case "bigint":
      sourceJoinSql = `
        ${alias}."${spec.keyColumn}" =
        NULLIF(
          p.source_row_id::text,
          ''
        )::bigint
      `;
      break;

    case "uuid":
      sourceJoinSql = `
        ${alias}."${spec.keyColumn}" =
        NULLIF(
          p.source_row_id::text,
          ''
        )::uuid
      `;
      break;

    default:
      sourceJoinSql = `
        ${alias}."${spec.keyColumn}"::text =
        p.source_row_id::text
      `;
  }

  const selectParts = [
  commonSelect(leading),
  selectSql,
  commonSelect(trailing)
].filter(
  (part) =>
    part &&
    part.trim()
);

return {
  sql: `${ctes}
  , picked AS (${pickedSql})
  SELECT
     ${selectParts.join(",\n       ")}${passthroughSelect}
  FROM picked p
  LEFT JOIN ${spec.source} ${alias}
    ON ${sourceJoinSql}
${joinSql}
  WHERE p.record_type = '${recordType}'
  ORDER BY p.export_role, p.caal_id`,
  columns: [
    ...leading,
    ...columns,
    ...trailing
  ]
};
}
 

/**
 * Build the SELECT list and LATERAL joins for one record type's export.
 * Returns { selectSql, joinSql, columns } — `columns` is the ordered
 * export column names, for the CSV header, GPKG DDL and manifest.
 *
 * Common fields (caal_id, record_type, geometry, source_*) are NOT
 * emitted here; they come from the existing export query so that
 * records.csv and the per-type files agree on them.
 */
function buildTypeExportColumns(recordType, lang, format = "csv") {
  const spec = EXPORT_SPECS[recordType];
  if (!spec) return null;

  const alias = spec.alias || "m";
  const parts = [];
  const scalarJoins = [];

  const requestedColumns =
    format === "kml"
      ? new Set(
          (spec.kmlFields || [])
            .map((field) => field.column)
        )
      : null;

  const scalarColumns =
    requestedColumns
      ? spec.columns.filter((column) =>
          requestedColumns.has(column.export)
        )
      : spec.columns;

  scalarColumns.forEach((col) => {
    let expr;
    if (col.kind === "plain") {
      expr = `${alias}."${col.raw}"`;
    } else if (col.kind === "lang") {
      expr = mvLangValueSql(
        alias, col.base, col.raw ? `${alias}."${col.raw}"` : null, lang
      );
    } else if (col.kind === "langNumbered") {
      expr = langNumberedSql(alias, col.base, col.count, lang, col.rawPattern);
    } else if (col.kind === "langLookup") {
      const source = VOCAB_SOURCES[col.vocab];
      if (!source) throw new Error(`Unknown vocabulary: ${col.vocab}`);
      const joinAlias = `lkp_${scalarJoins.length}`;
      const key = col.keyColumn || source.keyColumn;
      const raw = `${alias}."${col.raw}"`;
      scalarJoins.push(
        `  LEFT JOIN ${source.lookupView} ${joinAlias}\n` +
        `    ON ${joinAlias}.${key} = ${raw}`
      );
      expr = scalarLookupDisplaySql(joinAlias, lang, raw);
    } else {
      throw new Error(`Unknown column kind: ${col.kind}`);
    }
    parts.push({ expr, export: col.export });
  });

  const vocabSpec =
    requestedColumns
      ? {
          ...spec,

          vocabArrays:
            (spec.vocabArrays || [])
              .filter((entry) =>
                requestedColumns.has(
                  entry.exportPrefix
                )
              )
        }
      : spec;

  const vocab = vocabArrayJoinsFor(
    vocabSpec,
    alias,
    lang
  );
  parts.push(...vocab.selectColumns);

  return {
    spec,
    alias,
    joinSql: [scalarJoins.join("\n"), vocab.joinSql]
      .filter(Boolean).join("\n"),
    selectSql: parts
      .map(p => `${p.expr} AS "${p.export}"`)
      .join(",\n       "),
    columns: parts.map(p => p.export)
  };
}

module.exports = {
  RECORD_TYPES,
  COMMON_FIELDS,
  CONDITIONAL_FIELDS,
  LEADING_FIELDS,
  TRAILING_FIELDS,
  FIELD_ORDER,
  splitCommonFields,
  appliesTo,
  fieldsForRecordType,
  commonFields,
  filterFieldsFor,
  rowValues,
  notApplicableSql,
  scopeFilterSql,

  // vocabulary arrays
  VALUE_SEPARATOR,
  LOOKUP_LANGS,
  VOCAB_SOURCES,
  safeLookupLang,
  displayExprSql,
  vocabArrayJoin,
  vocabArrayJoinsFor,
  fallbackLookupLang,
  langChain,
  mvLangValueSql,
  scalarLookupDisplaySql,
  langNumberedSql,

  // per-type export specs
  EXPORT_SPECS,
  buildTypeExportColumns,
  exportTypeRecordsSql,

  // export labels
  labelKeysForRecordType,
  prettifyExportName
};
