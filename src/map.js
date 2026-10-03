// Satu-satunya modul yang menyentuh Leaflet (global `L` dari vendor/leaflet).
import { decodePolyline } from './polyline.js';
import { haversine } from './geo.js';

const JAKARTA = [-6.2, 106.83];

function pinIcon(label, cls) {
  return L.divIcon({
    className: `pin pin-${cls}`,
    html: `<span>${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function nearestIndex(coords, lat, lon, from = 0) {
  let best = from, bestD = Infinity;
  for (let i = from; i < coords.length; i++) {
    const d = haversine(lat, lon, coords[i][0], coords[i][1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Potongan shape antara halte naik dan turun; jatuh ke garis antar-halte bila shape tidak ada. */
function rideCoords(leg, network, shapes) {
  const p = network.patterns[leg.pattern];
  const { lat, lon } = network.stops;
  const viaStops = p.stops.slice(leg.fromPos, leg.toPos + 1).map((s) => [lat[s], lon[s]]);
  const enc = shapes && p.shape ? shapes[p.shape] : null;
  if (!enc) return viaStops;
  const coords = decodePolyline(enc);
  const a = nearestIndex(coords, lat[leg.fromStop], lon[leg.fromStop]);
  const b = nearestIndex(coords, lat[leg.toStop], lon[leg.toStop], a);
  if (b - a < 1) return viaStops;
  return [[lat[leg.fromStop], lon[leg.fromStop]], ...coords.slice(a, b + 1), [lat[leg.toStop], lon[leg.toStop]]];
}

export function createMap(el) {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView(JAKARTA, 12);
  // Tile standar OpenStreetMap: tanpa API key; pemakaian ringan pribadi sesuai kebijakan tile OSM.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const markers = { from: null, to: null };
  let routeLayer = null;
  let pickHandler = null;
  let bottomInset = 0;

  map.on('click', (e) => {
    if (pickHandler) pickHandler({ lat: e.latlng.lat, lon: e.latlng.lng });
  });

  function padding() {
    // Layar lebar: kartu dan panel ada di kolom kiri selebar 400 px (lihat styles.css).
    if (window.matchMedia('(min-width: 760px)').matches) return { paddingTopLeft: [440, 24], paddingBottomRight: [24, 24] };
    return { paddingTopLeft: [24, 150], paddingBottomRight: [24, bottomInset + 24] };
  }

  return {
    leaflet: map,
    setBottomInset(px) { bottomInset = px; },
    setPoint(which, point) {
      if (markers[which]) { markers[which].remove(); markers[which] = null; }
      if (!point) return;
      markers[which] = L.marker([point.lat, point.lon], {
        icon: pinIcon(which === 'from' ? 'A' : 'B', which),
        keyboard: false,
      }).addTo(map);
    },
    onPick(cb) {
      pickHandler = cb;
      el.classList.toggle('is-picking', !!cb);
    },
    fitPoints() {
      const pts = [markers.from, markers.to].filter(Boolean).map((m) => m.getLatLng());
      if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), 15));
      else if (pts.length === 2) map.fitBounds(L.latLngBounds(pts), { ...padding(), maxZoom: 16 });
    },
    flyTo(lat, lon, zoom = 16) {
      map.setView([lat, lon], zoom);
    },
    showItinerary(it, network, shapes) {
      if (routeLayer) routeLayer.remove();
      routeLayer = L.layerGroup().addTo(map);
      const all = [];
      for (const leg of it.legs) {
        if (leg.type === 'walk') {
          const c = [[leg.from.lat, leg.from.lon], [leg.to.lat, leg.to.lon]];
          L.polyline(c, { color: '#3B4A5C', weight: 4, opacity: 0.85, dashArray: '2 8', lineCap: 'round' }).addTo(routeLayer);
          all.push(...c);
          continue;
        }
        const route = network.routes[leg.route];
        const c = rideCoords(leg, network, shapes);
        L.polyline(c, { color: '#FFFFFF', weight: 9, opacity: 0.9 }).addTo(routeLayer);
        L.polyline(c, { color: `#${route.color}`, weight: 5, opacity: 1 }).addTo(routeLayer);
        for (const s of [leg.fromStop, leg.toStop]) {
          L.circleMarker([network.stops.lat[s], network.stops.lon[s]], {
            radius: 5, color: `#${route.color}`, weight: 3, fillColor: '#FFFFFF', fillOpacity: 1,
          }).addTo(routeLayer);
        }
        all.push(...c);
      }
      if (all.length) map.fitBounds(L.latLngBounds(all), { ...padding(), maxZoom: 17 });
    },
    clearItinerary() {
      if (routeLayer) { routeLayer.remove(); routeLayer = null; }
    },
    invalidate() { map.invalidateSize(); },
  };
}
