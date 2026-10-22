(() => {
'use strict';
// Detail layouts copied from the authenticated Viewer in the supplied 19 October ZIP.
// This module has no authenticated API/session access. Its input is the public SQL projection.
window.createPublicViewerDetails=({get,onOpen,onLocate,onShowRelated,onClearRelated,onRelatedVisibility})=>{
 const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const I=window.publicViewerI18n;
 const t=(key,fallback)=>I?.t(key,fallback)||(key==='nav_monuments'?'Monuments':fallback||key);
 const vLabel=(key,fallback)=>I?.field(key,fallback,activeRecord?.identity.record_type)||({'Date of Recording':'Date','Still under CopyrightYN':'Still under Copyright?','Resource':'DOI'}[key]||fallback||key);
 if(!document.getElementById('public-readonly-layout-style-v2')){const style=document.createElement('style');style.id='public-readonly-layout-style-v2';style.textContent='#publicDetails .public-structured-value,#publicDetails .public-structured-value *{white-space:normal;}#publicDetails .detail-value.public-structured-value{height:auto;min-height:0;}#publicDetails .detail-value.public-readonly-list{white-space:normal;min-height:0;height:auto;font-size:inherit;}#publicDetails .public-readonly-list ul{margin:0;padding-block:0;padding-inline-start:1.1rem;min-height:0;height:auto;}#publicDetails .public-readonly-list li{margin:.15rem 0;min-height:0;line-height:1.45;}';document.head.append(style);}
 const fullLocationTypes=new Set(['institution','cartography','dataset']);
 const internalFields=/(password|token|secret|created_by|updated_by|deleted_by|workspace_code|^id$|digital object url|^(geom|geometry|geom_4326|centroid_4326)$)/i;
 const locationFields=/(geom|centroid|latitude|longitude|coordinate|easting|northing|altitude|location|address|bbox|wkt|wkb|geohash|projection|transformation|^(lat|lon|lng|x|y|srid|srs)$)/i;
 const fieldBlocked=(type,key)=>internalFields.test(key)||(!(type==='monument'&&key==='Location Confidence')&&!fullLocationTypes.has(type)&&locationFields.test(key));
 const safeFields=(type,raw)=>Object.fromEntries(Object.entries(raw||{}).filter(([key])=>!fieldBlocked(type,key)));
 let activeRecord=null,activeHost=null,lookupPromise=null,lookupsUnavailable=false,lookupsReady=false;
 const viewerLookupOptions=name=>[...(viewerMonumentLookups[name]||[]),...(viewerArchiveLookups[name]||[])];
 const viewerOptionLabel=item=>item?.label??item?.display_label??item?.value;
 const viewerLanguageDisplayName=value=>{if(!viewerHasDisplayValue(value))return value;const code=String(value).trim().toLowerCase();try{return new Intl.DisplayNames([I?.locale()||'en'],{type:'language'}).of(code)||value;}catch{return value;}};
 const renderDetailItem=(...args)=>renderViewerDetailItem(...args);
function viewerInstitutionCoordinate(record, axis) {
  const fieldName =
    axis === "longitude"
      ? "Longitude"
      : "Latitude";

  const directValue = viewerRecordFieldValue(
    record,
    fieldName,
    axis
  );

  if (viewerHasDisplayValue(directValue)) {
    return directValue;
  }

  if (
    record?.geometry?.type === "Point" &&
    Array.isArray(record.geometry.coordinates)
  ) {
    return axis === "longitude"
      ? record.geometry.coordinates[0]
      : record.geometry.coordinates[1];
  }

  return null;
}

function renderViewerInstitutionLocationGroup(record) {
  return renderViewerConfiguredGroup(
    t(
      "institution_location",
      "Institution Location"
    ),
    record,
    [
      {label:vLabel("Location Description","Location Description"),names:["Location Description"],fullWidth:true},
      {label:vLabel("Location Accuracy","Location Accuracy"),names:["Location Accuracy"]},
      {
        label: vLabel("Longitude", "Longitude"),
        names: ["Longitude", "longitude"],
        transform: (value, currentRecord) => {
          return viewerHasDisplayValue(value)
            ? value
            : viewerInstitutionCoordinate(
                currentRecord,
                "longitude"
              );
        }
      },
      {
        label: vLabel("Latitude", "Latitude"),
        names: ["Latitude", "latitude"],
        transform: (value, currentRecord) => {
          return viewerHasDisplayValue(value)
            ? value
            : viewerInstitutionCoordinate(
                currentRecord,
                "latitude"
              );
        }
      }
    ]
  );
}

function getDirectionalRelationType(rel) {
  const relationType = String(
    rel?.relation_type_norm ||
    rel?.relation_type ||
    ""
  )
    .trim()
    .toLowerCase();

  const direction = String(
    rel?.relation_direction || ""
  )
    .trim()
    .toLowerCase();

  const directionalLabels = {
    "contains / is contained within": {
      forward: "contains",
      reverse: "is contained within"
    },

    "is created by / created": {
      forward: "is created by",
      reverse: "created"
    },

    "is referred to in / refers to": {
      forward: "is referred to in",
      reverse: "refers to"
    },

    "is represented by / represents": {
      forward: "is represented by",
      reverse: "represents"
    },

    "is superseded by / supersedes": {
      forward: "is superseded by",
      reverse: "supersedes"
    }
  };

  const pair = directionalLabels[relationType];

  if (pair?.[direction]) {
    return pair[direction];
  }

  /*
    These currently have no approved reciprocal term in the database,
    or are intentionally symmetric.
  */
  return (
    rel?.relation_type ||
    rel?.relation_type_norm ||
    "Related resource"
  );
}


 function relationChip(rel,text){return `<button type="button" class="related-id-chip related-id-chip-found viewer-related-detail-chip public-detail-related-chip" data-public-related="${escapeHtml(rel.source_row_id)}" data-public-related-type="${escapeHtml(rel.record_type)}" title="Open related record">${escapeHtml(text||rel.caal_id)}</button>`;}
 function viewerArchiveHoldingInstitutionHtml(record){
  const rel=(record.public_relations||[]).find(r=>r.record_type==='institution'&&(/held by|holds|holding|created by|created/.test(String(r.relation_type_norm||r.relation_type).toLowerCase())||String(r.caal_id).startsWith('Act_')));
  return rel?relationChip(rel,rel.display_label||rel.caal_id):'<span class="empty-value">No holding institution recorded</span>';
 }
 function renderViewerRelatedResourcesGroup(record){
  const relations=record.public_relations||[],groups=new Map();
  for(const rel of relations){const key=getDirectionalRelationType(rel);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(rel);}
  const rows=[...groups].map(([key,items])=>`<div class="detail-item full-width"><span class="detail-label">${escapeHtml(I?.field(key,key)||key)}</span><div class="detail-value related-id-list viewer-related-detail-id-list">${items.map(r=>relationChip(r)).join('')}</div></div>`).join('');
  return `<div class="group-block"><div class="group-grid"><div class="detail-item full-width section-header"><span class="detail-section-title">Related Resources</span>${relations.length?'<div class="viewer-related-map-actions"><button type="button" class="action-btn subtle" data-public-show-related>Show related on map</button><button type="button" class="action-btn subtle" data-public-clear-related hidden>Clear related from map</button><div class="caal-relationship-controls viewer-relationship-controls" data-public-related-controls hidden><label><input type="checkbox" data-public-related-visibility="records" checked>Show related records</label><label><input type="checkbox" data-public-related-visibility="lines" checked>Show relationship lines</label></div></div>':''}</div>${rows||`<div class="detail-item full-width"><div class="detail-value" data-public-ui-message>${record.relationships_loading?'Loading related resources...':record.relationships_failed?'Related resources could not be loaded.':'No related resources are recorded for this resource.'}</div></div>`}${record.relationships_more?'<div class="detail-item full-width" data-public-ui-message>Showing the first 100 published relationships.</div>':''}</div></div>`;
 }
const viewerMonumentLookups = {};

const viewerArchiveLookups = {};

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
      "Location Confidence",
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
    custom: "archive_material"
  },
  {
    title: "Related Resources",
    custom: "related_resources"
  },
  {
    title: "Publication Details",
    custom: "archive_publication"
  },
  {
    title: "Content",
    custom: "archive_content"
  },
  {
    title: "Digital",
    custom: "archive_digital"
  },
  {
    title: "Metadata",
    custom: "archive_metadata"
  }
];

const VIEWER_INSTITUTION_DETAIL_GROUPS = [
  {
    title: "Institution Details",
    custom: "institution_details"
  },
  {
    title: "Institution Location",
    custom: "institution_location"
  },
  {
    title: "Related Resources",
    custom: "related_resources"
  }
];

const VIEWER_DETAIL_GROUPS = {
  monument: VIEWER_MONUMENT_DETAIL_GROUPS,
  archive: VIEWER_ARCHIVE_DETAIL_GROUPS,
  institution: VIEWER_INSTITUTION_DETAIL_GROUPS,
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

function renderViewerField(raw, fieldName, record = null) {
  const value = raw?.[fieldName];
  if(fieldName==='Location Confidence'&&record?.identity?.record_type==='monument'){
    return renderViewerDetailItem(vLabel(fieldName,fieldName),viewerTranslatedFieldValue(record,fieldName,value));
  }

  if (!hasViewerFieldValue(raw, fieldName)) {
    return "";
  }

  if (
    [
      "External Reference",
      "External reference",
      "external_reference"
    ].includes(fieldName)
  ) {
    const displayValue = viewerTranslatedFieldValue(
      record,
      fieldName,
      value
    );

    return `
      <div class="detail-item full-width">
        <span class="detail-label">
          ${escapeHtml(vLabel(fieldName, fieldName))}
        </span>

        <div class="detail-value">
          ${viewerExternalReferenceHtml(displayValue)}
        </div>
      </div>
    `;
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

function renderViewerMeasurementsGroup(raw,
  {
    unitTransform = (value) => value,
    typeTransform = (value) => value
  } = {}
) {
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
              <span class="detail-label">${escapeHtml(vLabel("Value", "Value"))}</span>
              <div class="detail-value">${viewerSafeDisplayValue(row.value)}</div>
            </div>

            <div class="measurement-field">
              <span class="detail-label">${escapeHtml(vLabel("Unit", "Unit"))}</span>
              <div class="detail-value">${viewerSafeDisplayValue(unitTransform(row.unit))}</div>
            </div>

            <div class="measurement-field">
              <span class="detail-label">${escapeHtml(vLabel("Type", "Type"))}</span>
              <div class="detail-value">${viewerSafeDisplayValue(typeTransform(row.type))}</div>
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
            <span>${escapeHtml(vLabel("Type", "Type"))}</span>
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

  if (
    record?.identity?.record_type ===
    "monument"
  ) {
    const monumentLookupByField = {
      Country: "country",
      Classification: "classification",
      Designation: "designation",
      "Location Confidence":
        "location_confidence"
    };

    const lookupName =
      monumentLookupByField[fieldName];

    if (lookupName) {
      return viewerLookupLabel(
        viewerMonumentLookups,
        lookupName,
        rawValue
      );
    }

    if (
      fieldName === "Preferred Language"
    ) {
      return viewerLanguageDisplayName(
        rawValue
      );
    }

    if (
      fieldName === "Date of Recording" ||
      fieldName === "Tstamp"
    ) {
      return viewerDateOnly(rawValue);
    }
  }

  return viewerDisplayValue(fieldName, rawValue);
}

function viewerBestMonumentType(record) {
  const path = record?.summary?.monument_type_path || [];
  return path.length ? path[path.length - 1] : "";
}

function viewerRecordTitle(record) {
  const recordType =
    record?.identity?.record_type || "";

  if (recordType === "survey_grid") {
    return compactViewerText(
      firstNonBlank(
        record?.raw?.gridcode,
        record?.identity?.caal_id,
        record?.summary?.display_label
      ),
      90
    );
  }

  if (recordType === "archive") {
    return compactViewerText(
      firstNonBlank(
        record?.summary?.display_label,
        record?.identity?.caal_id
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

function viewerHasDisplayValue(value) {
  if (value === null || value === undefined) return false;

  if (Array.isArray(value)) {
    return value.some(viewerHasDisplayValue);
  }

  return String(value).trim() !== "";
}

function viewerRecordFieldValue(record, ...fieldNames) {
  const sources = [
    record?.display,
    record?.raw,
    record?.summary,
    record?.identity,
    record
  ];

  /*
    Search translated display values first, followed by the raw record,
    summary and identity objects.
  */
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    for (const fieldName of fieldNames) {
      const value = source[fieldName];

      if (viewerHasDisplayValue(value)) {
        return viewerDisplayValue(fieldNames[0], value);
      }
    }
  }

  return null;
}

function viewerNormaliseLookupToken(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function viewerLookupItemAliases(item) {
  const raw = item?.raw || {};

  const values = [
    item?.value,
    item?.canonical_value,
    item?.id,
    item?.concept_id,
    item?.label,
    item?.display_label,
    item?.chip_label,
    item?.label_en,

    item?.display_en,
    item?.display_ru,
    item?.display_zh,
    item?.display_kk,
    item?.display_ky,
    item?.display_tg,
    item?.display_tk,
    item?.display_uz,

    raw?.value,
    raw?.canonical_value,
    raw?.id,
    raw?.concept_id,
    raw?.label,
    raw?.label_en,

    raw?.display_en,
    raw?.display_ru,
    raw?.display_zh,
    raw?.display_kk,
    raw?.display_ky,
    raw?.display_tg,
    raw?.display_tk,
    raw?.display_uz
  ];

  return new Set(
    values
      .map(viewerNormaliseLookupToken)
      .filter(Boolean)
  );
}

function viewerLookupLabel(
  lookups,
  lookupName,
  value
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return value;
  }

  const options =
    Array.isArray(lookups?.[lookupName])
      ? lookups[lookupName]
      : [];

  const token =
    viewerNormaliseLookupToken(value);

  const match =
    options.find((item) =>
      viewerLookupItemAliases(item).has(token)
    );

  return match
    ? (
        match.label ??
        match.display_label ??
        match.value ??
        value
      )
    : value;
}

function viewerLookupListValues(value) {
  if (!viewerHasDisplayValue(value)) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        String(item ?? "").trim()
      )
      .filter(Boolean);
  }

  const text =
    String(value).trim();

  /*
    JSON array.
  */
  if (
    text.startsWith("[") &&
    text.endsWith("]")
  ) {
    try {
      const parsed =
        JSON.parse(text);

      if (Array.isArray(parsed)) {
        return parsed
          .map((item) =>
            String(item ?? "").trim()
          )
          .filter(Boolean);
      }
    } catch {
      // Fall through.
    }
  }

  /*
    PostgreSQL text array.
  */
  if (
    text.startsWith("{") &&
    text.endsWith("}")
  ) {
    return text
      .slice(1, -1)
      .split(",")
      .map((item) =>
        item
          .trim()
          .replace(/^"(.*)"$/, "$1")
      )
      .filter(Boolean);
  }

  /*
    Normal CAAL multi-value fields.
  */
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function viewerLookupMultiValue(
  lookups,
  lookupName,
  value
) {
  return viewerLookupListValues(value)
    .map((item) =>
      viewerLookupLabel(
        lookups,
        lookupName,
        item
      )
    )
    .join(", ");
}

function renderViewerDetailHtmlItem(
  label,
  htmlValue,
  { fullWidth = false } = {}
) {
  return `
    <div class="detail-item ${fullWidth ? "full-width" : ""}">
      <span class="detail-label">${escapeHtml(label)}</span>
      <div class="detail-value">${htmlValue}</div>
    </div>
  `;
}

function renderViewerConfiguredGroup(title, record, fields) {
  const rows = fields.filter(field=>!(field.names||[]).some(name=>fieldBlocked(record.identity.record_type,name))).map((field) => {
    const label = field.label;

    if (typeof field.html === "function") {
      return renderViewerDetailHtmlItem(
        label,
        field.html(record),
        {
          fullWidth: field.fullWidth === true
        }
      );
    }

    let value = viewerRecordFieldValue(
      record,
      ...(field.names || [])
    );

    if (typeof field.transform === "function") {
      value = field.transform(value, record);
    }

    return renderViewerDetailItem(
      label,
      value,
      {
        fullWidth: field.fullWidth === true
      }
    );
  }).join("");

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">
            ${escapeHtml(title)}
          </span>
        </div>

        ${rows}
      </div>
    </div>
  `;
}

function viewerDateOnly(value) {
  if (!viewerHasDisplayValue(value)) {
    return value;
  }

  const text =
    String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}T/.test(text)
  ) {
    return text.slice(0, 10);
  }

  if (
    /^\d{4}-\d{2}-\d{2}\s/.test(text)
  ) {
    return text.slice(0, 10);
  }

  if (
    /^\d{1,2}\/\d{1,2}\/\d{4}\s/.test(
      text
    )
  ) {
    return text.split(/\s+/)[0];
  }

  return text;
}

function viewerNormaliseDoi(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?(dx\.)?doi\.org\//i, "")
    .replace(/^(www\.)?(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

function viewerDoiHtml(value) {
  if (!viewerHasDisplayValue(value)) {
    return viewerSafeDisplayValue(null);
  }

  const raw = String(value).trim();
  const doi = viewerNormaliseDoi(raw);

  if (!doi) {
    return viewerSafeDisplayValue(raw);
  }

  const href =
    `https://doi.org/${
      encodeURIComponent(doi).replace(/%2F/gi, "/")
    }`;

  return `
    <a
      href="${escapeHtml(href)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      ${escapeHtml(doi)}
    </a>
  `;
}

function viewerExternalReferenceHtml(value) {
  if (!viewerHasDisplayValue(value)) {
    return viewerSafeDisplayValue(null);
  }

  const text = String(value).trim();

  let parsedUrl;

  try {
    parsedUrl = new URL(text);
  } catch {
    return escapeHtml(text);
  }

  if (
    parsedUrl.protocol !== "http:" &&
    parsedUrl.protocol !== "https:"
  ) {
    return escapeHtml(text);
  }

  return `
    <a
      class="viewer-external-reference-link"
      href="${escapeHtml(parsedUrl.href)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      ${escapeHtml(text)}
    </a>
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
        ...viewerLookupItemAliases(item),
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

function renderViewerArchiveMaterialGroup(record) {
  return renderViewerConfiguredGroup(
    t("material_details", "Material Details"),
    record,
    [
      {
        label: vLabel("CAAL_ID", "CAAL_ID"),
        names: ["CAAL_ID", "caal_id"]
      },
      {
        label: t(
          "holding_institution",
          "Holding Institution"
        ),
        html: viewerArchiveHoldingInstitutionHtml
      },
      {
        label: vLabel("Level", "Level"),
        names: ["Level", "level"],
        transform: (value) =>
          viewerLookupLabel(
            viewerArchiveLookups,
            "level",
            value
          )
      },
      {
        label: vLabel(
          "Original Reference",
          "Original Reference"
        ),
        names: [
          "Original Reference",
          "original_reference"
        ]
      },
      {
        label: vLabel(
          "Original Title",
          "Original Title"
        ),
        names: [
          "Original Title",
          "original_title"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "English Title",
          "English Title"
        ),
        names: [
          "English Title",
          "english_title"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Content Type",
          "Content Type"
        ),
        names: [
          "Content Type",
          "content_type"
        ],
        transform: (value) =>
          viewerLookupLabel(
            viewerArchiveLookups,
            "content_type",
            value
          )
      },
      {
        label: vLabel(
          "Number and Type of Original Material",
          "Number and Type of Original Material"
        ),
        names: [
          "Number and Type of Original Material",
          "number_and_type_of_original_material"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Size and Dimensions of Original Material",
          "Size and Dimensions of Original Material"
        ),
        names: [
          "Size and Dimensions of Original Material",
          "size_and_dimensions_of_original_material"
        ]
      },
      {
        label: vLabel(
          "Condition of Original Material",
          "Condition of Original Material"
        ),
        names: [
          "Condition of Original Material",
          "condition_of_original_material"
        ],
        transform: (value) =>
          viewerLookupLabel(
            viewerArchiveLookups,
            "condition_original_material",
            value
          )
      }
    ]
  );
}

function renderViewerArchivePublicationGroup(record) {
  return renderViewerConfiguredGroup(
    t("publication_details", "Publication Details"),
    record,
    [
      {
        label: vLabel(
          "Dates of Original Material",
          "Dates of Original Material"
        ),
        names: [
          "Dates of Original Material",
          "dates_of_original_material"
        ]
      },
      {
        label: vLabel(
          "Author of the Original Material",
          "Author of the Original Material"
        ),
        names: [
          "Author of the Original Material",
          "author_of_the_original_material"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Publisher of the Original Material",
          "Publisher of the Original Material"
        ),
        names: [
          "Publisher of the Original Material",
          "publisher_of_the_original_material"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Editor of the Original Material",
          "Editor of the Original Material"
        ),
        names: [
          "Editor of the Original Material",
          "editor_of_the_original_material"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Volume and Issue Number",
          "Volume and Issue Number"
        ),
        names: [
          "Volume and Issue Number",
          "volume_and_issue_number"
        ]
      },
      {
        label: vLabel(
          "Still under CopyrightYN",
          "Still under Copyright?"
        ),
        names: [
          "Still under Copyright?",
          "Still under CopyrightYN",
          "still_under_copyright"
        ],
        transform: (value) =>
          viewerLookupLabel(
            viewerArchiveLookups,
            "copyright_status",
            value
          )
      },
      {
        label: vLabel(
          "Copyright Holder Name",
          "Copyright Holder Name"
        ),
        names: [
          "Copyright Holder Name",
          "copyright_holder_name"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Copyright Attribution",
          "Copyright Attribution"
        ),
        names: [
          "Copyright Attribution",
          "copyright_attribution"
        ],
        fullWidth: true
      }
    ]
  );
}

function renderViewerArchiveContentGroup(record) {
  return renderViewerConfiguredGroup(
    t("content", "Content"),
    record,
    [
      {
        label: vLabel("Description", "Description"),
        names: ["Description", "description"],
        fullWidth: true
      },
      {
        label: vLabel(
          "Description - alternative language",
          "Description - alternative language"
        ),
        names: [
          "Description - alternative language",
          "description_alternative_language"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Related Countries",
          "Related Countries"
        ),
        names: [
          "Related Countries",
          "related_countries"
        ],
        transform: (value) =>
          viewerLookupMultiValue(
            viewerArchiveLookups,
            "related_country",
            value
          ),
        fullWidth: true
      },
      {
        label: vLabel(
          "Related Towns and Cities",
          "Related Towns and Cities"
        ),
        names: [
          "Related Towns and Cities",
          "related_towns_and_cities"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Related Religions",
          "Related Religions"
        ),
        names: [
          "Related Religions",
          "related_religions"
        ],
        transform: (value) =>
          viewerLookupMultiValue(
            viewerArchiveLookups,
            "related_religion",
            value
          ),
        fullWidth: true
      },
      {
        label: vLabel(
          "Related Subjects",
          "Related Subjects"
        ),
        names: [
          "Related Subjects",
          "related_subjects"
        ],
        transform: (value) =>
          viewerLookupMultiValue(
            viewerArchiveLookups,
            "related_subject",
            value
          ),
        fullWidth: true
      },
      {
        label: vLabel(
          "Other Subjects",
          "Other Subjects"
        ),
        names: [
          "Other Subjects",
          "other_subjects"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Languages of Material",
          "Languages of Material"
        ),
        names: [
          "Languages of Material",
          "languages_of_material"
        ],
        transform: (value) =>
          viewerLookupMultiValue(
            viewerArchiveLookups,
            "language",
            value
          ),
        fullWidth: true
      },
      {
        label: vLabel(
          "Script of Material",
          "Script of Material"
        ),
        names: [
          "Script of Material",
          "script_of_material"
        ],
        transform: (value) =>
          viewerLookupLabel(
            viewerArchiveLookups,
            "script",
            value
          )
      },
      {
        label: vLabel(
          "Writing System",
          "Writing System"
        ),
        names: [
          "Writing System",
          "writing_system"
        ],
        transform: (value) =>
          viewerLookupLabel(
            viewerArchiveLookups,
            "writing_system",
            value
          )
      }
    ]
  );
}

function renderViewerArchiveDigitalGroup(record) {
  return renderViewerConfiguredGroup(
    t("digital_files", "Digital Files"),
    record,
    [
      {
        label: vLabel(
          "Digital Folder Name",
          "Digital Folder Name"
        ),
        names: [
          "Digital Folder Name",
          "digital_folder_name"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Digital Files Name",
          "Digital Files Name"
        ),
        names: [
          "Digital Files Name",
          "digital_files_name"
        ],
        fullWidth: true
      },
      {
        label: vLabel(
          "Creation Date of Digital Files",
          "Creation Date of Digital Files"
        ),
        names: [
          "Creation Date of Digital Files",
          "creation_date_of_digital_files"
        ],
        transform: viewerDateOnly
      },
      {
        label: vLabel(
          "Format of Digital Files",
          "Format of Digital Files"
        ),
        names: [
          "Format of Digital Files",
          "format_of_digital_files"
        ],
        transform: (value) =>
          viewerLookupLabel(
            viewerArchiveLookups,
            "format",
            value
          )
      },
      {
        label: vLabel(
          "Number of Digital Files",
          "Number of Digital Files"
        ),
        names: [
          "Number of Digital Files",
          "number_of_digital_files"
        ]
      },
      {
        label: vLabel("Colour", "Colour"),
        names: ["Colour", "colour"],
        transform: (value) =>
          viewerLookupLabel(
            viewerArchiveLookups,
            "colour",
            value
          )
      },
      {
        label: vLabel("Resolution", "Resolution"),
        names: ["Resolution", "resolution"]
      }
    ]
  );
}

function renderViewerArchiveMetadataGroup(record) {
  return renderViewerConfiguredGroup(
    t("metadata", "Metadata"),
    record,
    [
      {
        label: vLabel(
          "Archive Recorder",
          "Archive Recorder"
        ),
        names: [
          "Archive Recorder",
          "archive_recorder"
        ]
      },
      {
        label: vLabel(
          "Date of Recording",
          "Date of Recording"
        ),
        names: [
          "Date of Recording",
          "date_of_recording"
        ],
        transform: viewerDateOnly
      },
      {
        label: t(
          "recorded_language",
          "Recorded Language"
        ),
        names: [
          "Preferred Language",
          "preferred_language"
        ],
        transform: viewerLanguageDisplayName
      },
      {
        label: vLabel("Resource", "DOI"),
        names: ["Resource", "resource"],
        html: (currentRecord) => {
          const value = viewerRecordFieldValue(
            currentRecord,
            "Resource",
            "resource"
          );

          return viewerDoiHtml(value);
        }
      }
    ]
  );
}

function renderViewerInstitutionDetailsGroup(record) {
  return renderViewerConfiguredGroup(
    t("institution_details", "Institution Details"),
    record,
    [
      {
        label: vLabel("CAAL_ID", "CAAL_ID"),
        names: ["CAAL_ID", "caal_id"]
      },
      {
        label: vLabel("Primary Name", "Primary Name"),
        names: [
          "Primary Name",
          "primary_name"
        ],
        fullWidth: true
      },
      {
        label: t("name_ru", "Russian Name"),
        names: [
          "Russian Name",
          "Name RU",
          "name_ru"
        ],
        fullWidth: true
      },
      {
        label: vLabel("Other Names", "Other Names"),
        names: [
          "Other Names",
          "other_names"
        ],
        fullWidth: true
      },
      {
        label: t("actor_type", "Actor Type"),
        names: [
          "Actor Type",
          "actor_type"
        ]
      },
      {
        label: vLabel("Country", "Country"),
        names: ["Country", "country"]
      },
      {
        label: t("address", "Address"),
        names: ["Address", "address"],
        fullWidth: true
      },
      {
        label: vLabel("Description", "Description"),
        names: ["Description", "description"],
        fullWidth: true
      },
      {
        label: vLabel("External Reference", "External Reference"),
        html: (currentRecord) => {
          const value = viewerRecordFieldValue(
            currentRecord,
            "External Reference",
            "external_reference"
          );

          return viewerExternalReferenceHtml(value);
        },
        fullWidth: true
      }
    ]
  );
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

    case "monument_main":
      return renderViewerMonumentMainGroup(raw, record);

    case "monument_administration":
      return renderViewerMonumentAdministrationGroup(raw, record);

    case "monument_measurements":
      return renderViewerMonumentMeasurementsGroup(raw);

    case "archive_material":
      return renderViewerArchiveMaterialGroup(record);

    case "archive_publication":
      return renderViewerArchivePublicationGroup(record);

    case "archive_content":
      return renderViewerArchiveContentGroup(record);

    case "archive_digital":
      return renderViewerArchiveDigitalGroup(record);

    case "archive_metadata":
      return renderViewerArchiveMetadataGroup(record);

    case "institution_details":
      return renderViewerInstitutionDetailsGroup(record);

    case "institution_location":
      return renderViewerInstitutionLocationGroup(record);

    case "related_resources":
      return renderViewerRelatedResourcesGroup(record);

    case "metadata":
      return renderViewerMetadataGroup(raw, record);

    default:
      break;
  }

  const rows = (group.fields || [])
    .map((fieldName) =>
      renderViewerField(raw, fieldName, record)
    )
    .filter(Boolean)
    .join("");

  const subgroups = (group.subgroups || [])
    .map((subgroup) =>
      renderViewerSubgroup(raw, subgroup, record)
    )
    .filter(Boolean)
    .join("");

  if (!rows && !subgroups) return "";

  return `
    <div class="group-block">
      <div class="group-grid">
        <div class="detail-item full-width section-header">
          <span class="detail-section-title">
            ${escapeHtml(
              vLabel(group.title, group.title)
            )}
          </span>
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

function viewerLookupLegacyMultiValues(
  raw,
  fieldBase,
  count,
  lookups,
  lookupName
) {
  return viewerLegacyMultiValuesFromRaw(
    raw,
    fieldBase,
    count
  )
    .map((value) =>
      viewerLookupLabel(
        lookups,
        lookupName,
        value
      )
    )
    .filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    );
}

function renderViewerValueList(label, values) {
  const cleanValues = Array.isArray(values)
    ? values.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  const html=cleanValues.length
    ? `<ul class="detail-value-list">${cleanValues.map(value=>`<li>${viewerSafeDisplayValue(value)}</li>`).join('')}</ul>`
    : viewerSafeDisplayValue(null);
  return `<div class="detail-item full-width"><span class="detail-label">${escapeHtml(label)}</span><div class="detail-value public-readonly-list">${html}</div></div>`;
}

function renderViewerMonumentMainGroup(raw, record) {
  const monumentTypes =
    Array.isArray(
      record?.summary?.monument_type_path
    ) &&
    record.summary.monument_type_path.length
      ? record.summary.monument_type_path
      : viewerLookupLegacyMultiValues(
          raw,
          "Monument Type",
          6,
          viewerMonumentLookups,
          "monument_type"
        );

  const religions = viewerLookupLegacyMultiValues(raw, "Religion", 3,
      viewerMonumentLookups, "religion");

  const culturalPeriods = viewerLookupLegacyMultiValues(raw, "Cultural Period", 6,
      viewerMonumentLookups,
      "cultural_period"
    );  

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
              <div class="detail-value">
                ${viewerSafeDisplayValue(
                  viewerLookupLabel(
                    viewerMonumentLookups,
                    "admin_subdivision_type",
                    row.type
                  )
                )}
              </div>
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
  return renderViewerMeasurementsGroup(
    raw,
    {
      unitTransform: (value) =>
        viewerLookupLabel(
          viewerMonumentLookups,
          "measurement_unit",
          value
        ),

      typeTransform: (value) =>
        viewerLookupLabel(
          viewerMonumentLookups,
          "measurement_type",
          value
        )
    }
  );
}

 // Remove whole Location groups as well as filtering fields at the public SQL boundary.
 for(const [type,groups] of Object.entries(VIEWER_DETAIL_GROUPS)){
  if(fullLocationTypes.has(type))continue;
  for(let i=groups.length-1;i>=0;i--){if(/location/i.test(groups[i].title)||groups[i].custom==='institution_location')groups.splice(i,1);}
 }
 function adapt(publicRecord,relationships){
  const data=publicRecord.details_json||{},type=publicRecord.record_type;
  const record={identity:{record_type:type,caal_id:publicRecord.caal_id,dataset_label:({monument:'Monuments',archive:'Archive',institution:'Institutions',rs3_poly:'RS polygons',rs3_line:'RS lines',rs3_group:'RS groups',vernacular:'Vernacular',cartography:'Cartography',dataset:'Datasets'})[type]},
   source:{table:({rs3_poly:'CAAL_RS3_Poly',rs3_line:'CAAL_RS3_Line',rs3_group:'CAAL_RS3_Group'})[type]},
   summary:{display_label:publicRecord.display_label,monument_type_path:Array.isArray(data.monument_type_path)?data.monument_type_path:[]},
   raw:safeFields(type,data.raw),display:safeFields(type,data.display),geometry:type==='institution'?data.geometry:null,public_record:publicRecord,public_relations:relationships.relationships||[],
   relationships_failed:relationships.failed,relationships_more:relationships.has_more,relationships_loading:relationships.loading,
   detail_sections:(Array.isArray(data.sections)?data.sections:[]).filter(s=>fullLocationTypes.has(type)||!/location|geograph|spatial|coordinate/i.test(String(s.key)+' '+String(s.label))).map(s=>({...s,fields:(s.fields||[]).filter(f=>!fieldBlocked(type,f.key||'')&&!fieldBlocked(type,f.label||''))}))};
  // Compatible with the previous public projection while the SQL is being installed.
  if(!data.raw)for(const s of record.detail_sections)for(const f of s.fields)if(f.key)record.raw[f.key]=f.value;
  record.raw.CAAL_ID??=publicRecord.caal_id;
  return record;
 }
 let lookupLanguage=null,lookupVersion=0;
 async function ensureLookups(){
  const lang=I?.language()||'en';
  if(!lookupPromise||lookupLanguage!==lang){lookupLanguage=lang;const current=++lookupVersion;lookupsReady=false;
   lookupPromise=get('/detail-lookups?lang='+encodeURIComponent(lang)).then(data=>{if(current!==lookupVersion)return;for(const key of Object.keys(viewerMonumentLookups))delete viewerMonumentLookups[key];for(const key of Object.keys(viewerArchiveLookups))delete viewerArchiveLookups[key];Object.assign(viewerMonumentLookups,data.lookups?.monuments||{});Object.assign(viewerArchiveLookups,data.lookups?.archive||{});lookupsUnavailable=false;lookupsReady=true;}).catch(()=>{if(current!==lookupVersion)return;lookupsUnavailable=true;lookupsReady=true;lookupPromise=null;});}
  return lookupPromise;
 }
 function draw(host,record){
  if(activeRecord!==record||activeHost!==host)return;
  const scrollTop=host.scrollTop;
  if(I)record.identity.dataset_label=I.layer(record.identity.record_type);
  record.summary.monument_type_path=(I?.language()||'en')==='en'?(record.public_record.details_json?.monument_type_path||[]):[];
  record.display=(I?.language()||'en')==='en'?safeFields(record.identity.record_type,record.public_record.details_json?.display):{};
  const relatedShown=host.querySelector('[data-public-clear-related]')?.hidden===false;
  const relatedVisibility=Object.fromEntries([...host.querySelectorAll('[data-public-related-visibility]')].map(i=>[i.dataset.publicRelatedVisibility,i.checked]));
  const title=['rs3_poly','rs3_line','rs3_group'].includes(record.identity.record_type)?record.identity.caal_id:viewerRecordTitle(record);
  host.innerHTML=`<div class="record-title"><div class="record-title-actions record-title-actions-topright"><button type="button" class="icon-action-btn record-title-icon-btn" data-public-detail-target title="Centre on map" aria-label="Centre on map"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg></button></div><div class="record-title-main"><h3>${escapeHtml(title)}</h3><p class="copyable-field monument-title-caal-id"><span class="copyable-field-text">${escapeHtml(record.identity.caal_id)}</span><button type="button" class="copy-field-btn" data-public-copy title="Copy to clipboard" aria-label="Copy CAAL_ID"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/></svg></button></p></div></div><div class="group-stack">${renderViewerDetailGroups(record)}${!VIEWER_DETAIL_GROUPS[record.identity.record_type]?renderViewerRelatedResourcesGroup(record):''}</div>${!lookupsReady?'<p class="section-empty">Loading vocabulary labels...</p>':lookupsUnavailable?'<p class="section-empty">Some vocabulary labels could not be loaded; stored values are shown.</p>':''}`;
  // Rich display widgets inherit pre-wrap from text values unless reset explicitly.
  // Keep descriptive text's own line breaks, compact only structured values.
  for(const value of host.querySelectorAll('.detail-value')){
    if(value.querySelector('ul,ol,.viewer-rating-slider,.boolean-display,.viewer-indicator-grid')){
      value.classList.add('public-structured-value');
    }
  }
  I?.fragment(host,record.identity.record_type);
  host.querySelector('[data-public-detail-target]').onclick=()=>onLocate(record.public_record);
  host.querySelector('[data-public-copy]').onclick=async event=>{const button=event.currentTarget;try{await navigator.clipboard.writeText(record.identity.caal_id);button.title='CAAL_ID copied';}catch{button.title='Copy unavailable in this browser';}};
  host.querySelectorAll('[data-public-related]').forEach(button=>{button.onclick=()=>{const rel=record.public_relations.find(r=>String(r.source_row_id)===button.dataset.publicRelated&&r.record_type===button.dataset.publicRelatedType);if(rel)onOpen(rel,true);};});
  const show=host.querySelector('[data-public-show-related]'),clear=host.querySelector('[data-public-clear-related]'),controls=host.querySelector('[data-public-related-controls]');
  if(relatedShown&&show){show.hidden=true;clear.hidden=false;controls.hidden=false;}
  controls?.querySelectorAll('input').forEach(input=>{if(Object.hasOwn(relatedVisibility,input.dataset.publicRelatedVisibility))input.checked=relatedVisibility[input.dataset.publicRelatedVisibility];});
  host.scrollTop=scrollTop;
  if(show)show.onclick=async()=>{show.disabled=true;try{const ok=await onShowRelated?.(record.public_record,record.public_relations);if(activeRecord!==record)return;if(ok!==false){show.hidden=true;clear.hidden=false;controls.hidden=false;}}finally{show.disabled=false;}};
  if(clear)clear.onclick=()=>{onClearRelated?.();show.hidden=false;clear.hidden=true;controls.hidden=true;};
  controls?.querySelectorAll('input').forEach(input=>input.onchange=()=>onRelatedVisibility?.(Object.fromEntries([...controls.querySelectorAll('input')].map(i=>[i.dataset.publicRelatedVisibility,i.checked]))));
 }
 I?.onChange(async()=>{const record=activeRecord,pending=ensureLookups();if(record)draw(activeHost,record);await pending;if(record)draw(activeHost,record);});
 return {
  preload:ensureLookups,
  render(host,publicRecord,relationships={}){const record=adapt(publicRecord,relationships);activeRecord=record;activeHost=host;draw(host,record);if(!lookupsReady)void ensureLookups().then(()=>draw(host,record));},
  updateRelationships(publicRecord,relationships){
   const record=activeRecord;if(!record||record.public_record.record_type!==publicRecord.record_type||String(record.public_record.source_row_id)!==String(publicRecord.source_row_id))return;
   record.public_relations=relationships.relationships||[];record.relationships_failed=relationships.failed;record.relationships_more=relationships.has_more;record.relationships_loading=false;
   draw(activeHost,record);
  },
  clear(){activeRecord=null;activeHost=null;onClearRelated?.();}
 };
};
})();
