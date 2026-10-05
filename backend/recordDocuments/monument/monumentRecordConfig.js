// ============================================================
// monumentRecordConfig.js
// Presentation structure for the downloadable CAAL Monument Record.
// ============================================================

const MONUMENT_RECORD_SECTIONS = Object.freeze([
  Object.freeze({
    key: "identification",
    number: "I",
    title: "Identification",
    alwaysShow: true
  }),
  Object.freeze({
    key: "chronology",
    number: "II",
    title: "Chronology"
  }),
  Object.freeze({
    key: "location",
    number: "III",
    title: "Location"
  }),
  Object.freeze({
    key: "description",
    number: "IV",
    title: "Description"
  }),
  Object.freeze({
    key: "measurements",
    number: "V",
    title: "Dimensions and measurements"
  }),
  Object.freeze({
    key: "related_resources",
    number: "VI",
    title: "Related resources",
    alwaysShow: true,
    reserveSpace: true
  }),
  Object.freeze({
    key: "record_information",
    number: "VII",
    title: "Record information"
  }),
  Object.freeze({
    key: "documentary_material",
    number: "VIII",
    title: "Documentary material"
  })
]);

const EMPTY_SENTINELS = Object.freeze([
  "no data",
  "n/a",
  "not recorded",
  "нет данных"
]);

const DEFAULT_BRANDING = Object.freeze({
  organisation: "Central Asian Archaeological Landscapes",
  subtitle: "",
  logoSrc: null,
  secondaryLogoSrc: null
});

const DEFAULT_DOCUMENT_LABELS = Object.freeze({
  document_title: "Monument Record",
  caal_id: "Monument ID",
  names: "Names",
  identifiers_and_references: "Identifiers and references",
  classification_and_status: "Classification and heritage status",
  monument_passport: "Monument passport reference"
});

module.exports = {
  MONUMENT_RECORD_SECTIONS,
  EMPTY_SENTINELS,
  DEFAULT_BRANDING,
  DEFAULT_DOCUMENT_LABELS
};
