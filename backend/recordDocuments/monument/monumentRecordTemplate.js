// ============================================================
// monumentRecordTemplate.js
// Zero-dependency semantic HTML renderer.
// ============================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderField(field) {
  if (!field) return "";

  return `
    <div class="record-field${field.wide ? " record-field-wide" : ""}">
      <dt>${escapeHtml(field.label)}</dt>
      <dd class="${field.multiline ? "record-multiline" : ""}">
        ${escapeHtml(field.value)}
      </dd>
    </div>
  `;
}

function renderGroup(group) {
  if (!group || !Array.isArray(group.fields) || !group.fields.length) {
    return "";
  }

  return `
    <div class="record-subgroup">
      <h3>${escapeHtml(group.title)}</h3>
      <dl class="record-field-grid">
        ${group.fields.map(renderField).join("")}
      </dl>
    </div>
  `;
}

function renderMap(map, labels = {}) {
  if (!map) return "";

  const body = map.imageSrc
    ? `<img class="record-map-image" src="${escapeHtml(map.imageSrc)}" alt="" />`
    : `
      <div class="record-map-placeholder" aria-label="Location map placeholder">
        <div class="record-map-crosshair">+</div>
        <div class="record-map-placeholder-text">
          ${escapeHtml(
            labels.map_location ||
            "OSM location map"
          )}
        </div>
      </div>
    `;

  return `
    <figure class="record-map">
      ${body}
      <figcaption>
        <span>${escapeHtml(map.latitudeText)} | ${escapeHtml(map.longitudeText)}</span>
        <span>
          ${escapeHtml(
            labels.map_attribution ||
            "Map data:"
          )}
          ${escapeHtml(map.attribution)}
        </span>
      </figcaption>
    </figure>
  `;
}

function renderRelatedResources(section, labels = {}) {
  const items = Array.isArray(section.items) ? section.items : [];

  if (!items.length) {
    return `<div class="record-related-reserved" aria-hidden="true"></div>`;
  }

  return `
    <table class="record-related-table">
      <thead>
        <tr>
          <th>
            ${escapeHtml(
              labels.related_relationship || "Relationship" )}
          </th>

          <th>
            ${escapeHtml(
              labels.related_resource || "Resource" )}
          </th>

          <th>
            ${escapeHtml(
              labels.related_reference || "Reference" )}
          </th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td>${escapeHtml(item.relationship || "")}</td>
            <td>${escapeHtml(item.label || item.record_type || "")}</td>
            <td>${escapeHtml(item.caal_id || item.reference || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderDocumentaryMaterial(section) {
  const items = Array.isArray(section.items) ? section.items : [];
  if (!items.length) return "";

  return `
    <div class="record-documentary-grid">
      ${items.map((item) => `
        <figure class="record-documentary-item">
          ${item.imageSrc
            ? `<img src="${escapeHtml(item.imageSrc)}" alt="" />`
            : ""
          }
          <figcaption>
            ${escapeHtml(item.caption || item.label || "")}
          </figcaption>
        </figure>
      `).join("")}
    </div>
  `;
}

function renderSection(section) {
  const heading = `
    <h2>
      <span class="record-section-number">${escapeHtml(section.number)}.</span>
      ${escapeHtml(section.title)}
    </h2>
  `;

  if (section.key === "identification") {
    return `
      <section class="record-section record-identification">
        ${heading}
        ${(section.groups || []).map(renderGroup).join("")}
      </section>
    `;
  }

  if (section.key === "description") {
    return `
      <section class="record-section record-description">
        ${heading}
        ${(section.paragraphs || []).map((paragraph) => `
          <div class="record-description-block">
            <h3>${escapeHtml(paragraph.label)}</h3>
            <p>${escapeHtml(paragraph.value)}</p>
          </div>
        `).join("")}
      </section>
    `;
  }

  if (section.key === "measurements") {
    return `
      <section class="record-section">
        ${heading}
        <dl class="record-field-grid">
          ${(section.rows || []).map((row) =>
            renderField({ label: row.label, value: row.value })
          ).join("")}
        </dl>
      </section>
    `;
  }

  if (section.key === "location") {
    return `
      <section class="record-section record-location">
        ${heading}
        <dl class="record-field-grid">
          ${(section.fields || []).map(renderField).join("")}
        </dl>
        ${renderMap(section.map)}
      </section>
    `;
  }

  if (section.key === "related_resources") {
    return `
      <section class="record-section record-related-resources">
        ${heading}
        ${renderRelatedResources(section)}
      </section>
    `;
  }

  if (section.key === "documentary_material") {
    return `
      <section class="record-section record-documentary">
        ${heading}
        ${renderDocumentaryMaterial(section)}
      </section>
    `;
  }

  return `
    <section class="record-section">
      ${heading}
      <dl class="record-field-grid">
        ${(section.fields || []).map(renderField).join("")}
      </dl>
    </section>
  `;
}

function renderMonumentRecordHtml(model, options = {}) {
  const inlineCss = options.inlineCss || "";
  const cssHref = options.cssHref || null;

  return `<!doctype html>
<html lang="${escapeHtml(model.lang || "en")}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(model.documentTitle)} - ${escapeHtml(model.caalId || "")}</title>
  ${cssHref ? `<link rel="stylesheet" href="${escapeHtml(cssHref)}" />` : ""}
  ${inlineCss ? `<style>${inlineCss}</style>` : ""}
</head>
<body>
  <article class="record-document">
    <header class="record-header">
      <div class="record-branding">
        <div class="record-branding-left">
          ${model.branding?.logoSrc
            ? `<img class="record-logo" src="${escapeHtml(model.branding.logoSrc)}" alt="" />`
            : ""
          }
          <div>
            <div class="record-organisation">
              ${escapeHtml(model.branding?.organisation || "")}
            </div>
            ${model.branding?.subtitle
              ? `<div class="record-organisation-subtitle">${escapeHtml(model.branding.subtitle)}</div>`
              : ""
            }
          </div>
        </div>

        ${model.branding?.secondaryLogoSrc
          ? `<img class="record-logo record-logo-secondary" src="${escapeHtml(model.branding.secondaryLogoSrc)}" alt="" />`
          : ""
        }
      </div>

      <div class="record-title-block">
        <div class="record-kicker">${escapeHtml(model.documentTitle)}</div>
        <h1>${escapeHtml(model.primaryName)}</h1>

        ${model.secondaryName
          ? `<div class="record-secondary-name">${escapeHtml(model.secondaryName)}</div>`
          : ""
        }

        ${model.caalId
          ? `
            <div class="record-id">
              <span class="record-id-label">${escapeHtml(model.caalIdLabel)}</span>
              <span>${escapeHtml(model.caalId)}</span>
            </div>
          `
          : ""
        }

        ${model.locationSummary
          ? `<div class="record-location-summary">${escapeHtml(model.locationSummary)}</div>`
          : ""
        }
      </div>
    </header>

    <main>
      ${(model.sections || []).map(renderSection).join("")}
    </main>

    <footer class="record-footer">
      <span>${escapeHtml(model.caalId || "")}</span>
      <span>${escapeHtml(model.generatedAt || "")}</span>
    </footer>
  </article>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  renderMonumentRecordHtml
};
