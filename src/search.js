// Saran lokasi: halte (lokal, instan) dan tempat dari Photon (OpenStreetMap).
import { haversine } from './geo.js';

const PHOTON = 'https://photon.komoot.io/api/';
const BBOX = '106.4,-6.75,107.2,-6.0';

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Halte dengan nama sama digabung jadi satu entri (titik tengah). */
function buildStopEntries(network) {
  const byName = new Map();
  const { name, lat, lon } = network.stops;
  for (let i = 0; i < name.length; i++) {
    const key = normalize(name[i]);
    let e = byName.get(key);
    if (!e) byName.set(key, (e = { key, name: name[i], stops: [], lat: 0, lon: 0 }));
    e.stops.push(i);
    e.lat += lat[i];
    e.lon += lon[i];
  }
  return [...byName.values()].map((e) => ({ ...e, lat: e.lat / e.stops.length, lon: e.lon / e.stops.length }));
}

export function createSearch(network) {
  const entries = buildStopEntries(network);
  const byKey = new Map(entries.map((e) => [e.key, e]));

  function suggestStops(text, max = 6) {
    const q = normalize(text);
    if (!q) return [];
    const scored = [];
    for (const e of entries) {
      let score;
      if (e.key.startsWith(q)) score = 0;
      else if (e.key.includes(` ${q}`)) score = 1;
      else if (e.key.includes(q)) score = 2;
      else continue;
      scored.push([score, e.key.length, e]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return scored.slice(0, max).map(([, , e]) => ({
      kind: 'stop',
      name: e.name,
      detail: e.stops.length > 1 ? `Halte · ${e.stops.length} titik naik` : 'Halte',
      lat: e.lat,
      lon: e.lon,
      stop: e.stops[0],
    }));
  }

  async function suggestPlaces(text, signal, max = 5) {
    const q = String(text || '').trim();
    if (q.length < 3) return [];
    const url = `${PHOTON}?q=${encodeURIComponent(q)}&bbox=${BBOX}&limit=${max + 3}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
    const data = await res.json();
    const seen = new Set();
    const out = [];
    for (const f of data.features || []) {
      const p = f.properties || {};
      const nameText = p.name || [p.street, p.housenumber].filter(Boolean).join(' ');
      if (!nameText) continue;
      const detail = [p.street && p.name ? p.street : '', p.district || p.locality, p.city || p.county]
        .filter(Boolean)
        .join(', ');
      const key = `${nameText}|${detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lat = f.geometry.coordinates[1];
      const lon = f.geometry.coordinates[0];
      // Tempat OSM bernama sama dengan halte terdekat hanya menggandakan saran halte.
      const twin = byKey.get(normalize(nameText));
      if (twin && haversine(lat, lon, twin.lat, twin.lon) < 500) continue;
      out.push({ kind: 'place', name: nameText, detail, lat, lon });
      if (out.length >= max) break;
    }
    return out;
  }

  /** Halte langsung, tempat menyusul; galat Photon tidak membuang saran halte. */
  async function suggest(text, signal) {
    const stops = suggestStops(text);
    try {
      const places = await suggestPlaces(text, signal);
      return { stops, places, placesFailed: false };
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return { stops, places: [], placesFailed: true };
    }
  }

  return { suggest, suggestStops };
}
