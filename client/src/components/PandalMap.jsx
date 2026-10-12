import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const directionsUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.lat},${p.lng}`)}&travelmode=driving`;

const diyaIcon = L.divIcon({
  className: 'pandal-div-icon',
  html: '<span class="diya-pin"><span>🪔</span></span>',
  iconSize: [34, 42],
  iconAnchor: [17, 38],
  popupAnchor: [0, -34]
});

function popupContent(p) {
  const precision = p.locationPrecision === 'approximate' ? 'Approximate area pin — verify the exact entrance before travelling.' : 'Landmark-level pin; the exact entrance may differ.';
  const recordNote = p.recordStatus === 'source-listed'
    ? `Name appears in ${p.sourceLabel || 'a published guide'}; the pin and current-season status are not independently confirmed.`
    : 'This directory entry is not independently verified; confirm the name, pin and operation locally.';
  const sourceUrl = typeof p.sourceUrl === 'string' && /^https?:\/\//i.test(p.sourceUrl) ? p.sourceUrl : '';
  const coordinateSourceUrl = typeof p.coordinateSourceUrl === 'string' && /^https?:\/\//i.test(p.coordinateSourceUrl) ? p.coordinateSourceUrl : '';
  const seasonNote = p.seasonStatus === 'confirmed' ? 'Season status marked confirmed in the directory.' : 'Current-season operation and opening hours are unconfirmed.';
  return `<div class="map-popup">
    <div class="popup-kicker">${escapeHtml(p.district)}</div>
    <div class="popup-name">${escapeHtml(p.name)}</div>
    <div class="popup-area">${escapeHtml(p.area)}</div>
    ${p.theme ? `<p class="popup-theme">${escapeHtml(p.theme)}</p>` : ''}
    <div class="popup-warning">ⓘ ${escapeHtml(precision)} ${escapeHtml(recordNote)} ${escapeHtml(seasonNote)}</div>
    ${sourceUrl ? `<a class="popup-source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">View name/theme source ↗</a>` : ''}
    ${coordinateSourceUrl && coordinateSourceUrl !== sourceUrl ? `<a class="popup-source" href="${escapeHtml(coordinateSourceUrl)}" target="_blank" rel="noopener noreferrer">View map-pin source ↗</a>` : ''}
    <a class="popup-directions" href="${directionsUrl(p)}" target="_blank" rel="noopener noreferrer">Get directions to map pin ↗</a>
  </div>`;
}

function ClusteredPandalMarkers({ pandals }) {
  const map = useMap();
  useEffect(() => {
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 42,
      disableClusteringAtZoom: 15,
      chunkedLoading: true
    });
    pandals.forEach((p) => {
      if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) return;
      const marker = L.marker([Number(p.lat), Number(p.lng)], { icon: diyaIcon, title: p.name, alt: p.name });
      marker.bindPopup(popupContent(p), { maxWidth: 280, minWidth: 210 });
      cluster.addLayer(marker);
    });
    map.addLayer(cluster);
    return () => { map.removeLayer(cluster); cluster.clearLayers(); };
  }, [map, pandals]);
  return null;
}

function MapViewport({ command, pandals }) {
  const map = useMap();
  const lastCommandKey = useRef(null);
  const lastCommandType = useRef(null);
  useEffect(() => {
    if (!command) return;
    const isNewCommand = lastCommandKey.current !== command.key || lastCommandType.current !== command.type;

    if (command.type === 'statewide') {
      // Wait for the directory to load before computing bounds on first mount.
      if (!isNewCommand || !pandals.length) return;
      if (pandals.length) {
        const points = pandals.map((p) => [Number(p.lat), Number(p.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180);
        if (points.length === 1) map.setView(points[0], 14);
        else if (points.length > 1) {
          const bounds = L.latLngBounds(points);
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
        }
        lastCommandKey.current = command.key;
        lastCommandType.current = command.type;
      }
      return;
    }

    // Filtering or typing in search should not repeatedly reset the viewport.
    if (!isNewCommand) return;
    if (command.type === 'user' && Number.isFinite(command.lat) && Number.isFinite(command.lng)) {
      map.flyTo([command.lat, command.lng], command.zoom || 13, { duration: 0.7 });
    } else if (command.type === 'pandal' && Number.isFinite(command.lat) && Number.isFinite(command.lng)) {
      map.flyTo([command.lat, command.lng], command.zoom || 16, { duration: 0.7 });
    }
    lastCommandKey.current = command.key;
    lastCommandType.current = command.type;
  }, [map, command, pandals]);
  return null;
}

export default function PandalMap({ pandals, userPosition, command }) {
  return (
    <div className="map-frame">
      <MapContainer center={[24.15, 87.95]} zoom={6} minZoom={5} maxZoom={19} scrollWheelZoom preferCanvas>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ClusteredPandalMarkers pandals={pandals} />
        {userPosition?.source === 'gps' && Number.isFinite(userPosition.accuracy) && userPosition.accuracy > 0 && (
          <Circle center={[userPosition.lat, userPosition.lng]} radius={Math.min(userPosition.accuracy, 5000)} pathOptions={{ color: '#2377ef', weight: 1, opacity: 0.65, fillColor: '#2377ef', fillOpacity: 0.08 }} />
        )}
        {userPosition && (
          <CircleMarker center={[userPosition.lat, userPosition.lng]} radius={9} pathOptions={{ color: '#ffffff', weight: 4, fillColor: '#2377ef', fillOpacity: 1 }}>
            <Popup><strong>{userPosition.source === 'gps' ? 'Your live location' : 'Selected area centre'}</strong><br />{userPosition.source === 'gps' ? `Position supplied by your device${Number.isFinite(userPosition.accuracy) ? ` · accuracy around ${Math.round(userPosition.accuracy)} m` : ''}.` : 'This is an approximate reference point, not GPS.'}</Popup>
          </CircleMarker>
        )}
        <MapViewport command={command} pandals={pandals} />
      </MapContainer>
      <div className="map-legend"><span className="legend-live" />Your location <span className="legend-diya">🪔</span>Pandal listing</div>
    </div>
  );
}

export { directionsUrl };
