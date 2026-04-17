const map = L.map("map").setView([48.0, 67.0], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const recordDetails = document.getElementById("recordDetails");

function safeValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }
  return value;
}

function renderRecordDetails(properties) {
  recordDetails.innerHTML = `
    <div class="record-title">
      <h3>${safeValue(properties.primary_name)}</h3>
      <p>${safeValue(properties.caal_id)}</p>
    </div>

    <div class="detail-grid">
      <div class="detail-item">
        <span class="detail-label">Country</span>
        <div class="detail-value">${safeValue(properties.country)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">Classification</span>
        <div class="detail-value">${safeValue(properties.classification)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">Monument Type 1</span>
        <div class="detail-value">${safeValue(properties.monument_type1)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">Cultural Period 1</span>
        <div class="detail-value">${safeValue(properties.cultural_period1)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">Recorder</span>
        <div class="detail-value">${safeValue(properties.recorder)}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">Notes</span>
        <div class="detail-value">${safeValue(properties.notes)}</div>
      </div>
    </div>
  `;
}

function pointStyle(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 7,
    weight: 1,
    opacity: 1,
    fillOpacity: 0.85
  });
}

fetch("./data/monuments_sample.geojson")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load GeoJSON: ${response.status}`);
    }
    return response.json();
  })
  .then((geojson) => {
    const layer = L.geoJSON(geojson, {
      pointToLayer: pointStyle,
      onEachFeature: (feature, layer) => {
        const props = feature.properties;

        layer.bindPopup(`
          <div>
            <p class="popup-title">${safeValue(props.primary_name)}</p>
            <p class="popup-meta">${safeValue(props.caal_id)}</p>
          </div>
        `);

        layer.on("click", () => {
          renderRecordDetails(props);
        });
      }
    }).addTo(map);

    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  })
  .catch((error) => {
    console.error(error);
    recordDetails.innerHTML = `
      <div class="empty-state">
        <p>Could not load sample data.</p>
        <p>${error.message}</p>
      </div>
    `;
  });