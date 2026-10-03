// Ubah GTFS resmi Transjakarta menjadi data/network.json + data/shapes.json.
//   node scripts/build-data.mjs          pakai .cache/gtfs.zip bila ada
//   node scripts/build-data.mjs --fresh  unduh ulang
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePolyline } from '../src/polyline.js';
import { pointSegmentMeters } from '../src/geo.js';

export const GTFS_URL = 'https://gtfs.transjakarta.co.id/files/file_gtfs.zip';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'gtfs.zip');
const SHAPE_TOLERANCE_M = 5;

async function ambilZip(fresh) {
  if (!fresh) {
    try {
      await stat(CACHE);
      return readFile(CACHE);
    } catch { /* belum ada cache */ }
  }
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`Unduh GTFS gagal: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, buf);
  return buf;
}

/** Ekstrak semua file dari zip (metode store/deflate) lewat central directory. */
export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Zip tidak valid: EOCD tidak ditemukan');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Zip tidak valid: central directory rusak');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    if (method === 0) files[name] = raw;
    else if (method === 8) files[name] = inflateRawSync(raw);
    else throw new Error(`Metode kompresi ${method} tidak didukung (${name})`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** Parser CSV RFC 4180 sederhana → array objek. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function detik(hms) {
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function simplify(coords, tol) {
  if (coords.length < 3) return coords;
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointSegmentMeters(coords[i], coords[a], coords[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

export function buildNetwork(files) {
  const baca = (nama, wajib = true) => {
    const f = files[nama];
    if (!f) {
      if (wajib) throw new Error(`File GTFS wajib hilang: ${nama}`);
      return [];
    }
    return parseCsv(f.toString('utf8'));
  };
  const routesCsv = baca('routes.txt');
  const tripsCsv = baca('trips.txt');
  const stopTimesCsv = baca('stop_times.txt');
  const stopsCsv = baca('stops.txt');
  const freqCsv = baca('frequencies.txt');
  const calCsv = baca('calendar.txt');
  const fareAttr = baca('fare_attributes.txt');
  const fareRules = baca('fare_rules.txt');
  const transfersCsv = baca('transfers.txt', false);
  const shapesCsv = baca('shapes.txt', false);

  // Stop_times per trip, urut stop_sequence.
  const perTrip = new Map();
  for (const st of stopTimesCsv) {
    let arr = perTrip.get(st.trip_id);
    if (!arr) perTrip.set(st.trip_id, (arr = []));
    arr.push(st);
  }
  for (const arr of perTrip.values()) arr.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));

  // Halte: hanya yang dipakai.
  const stopById = new Map(stopsCsv.map((s) => [s.stop_id, s]));
  const stopIndex = new Map();
  const stops = { id: [], name: [], lat: [], lon: [] };
  const idxHalte = (id) => {
    let i = stopIndex.get(id);
    if (i !== undefined) return i;
    const s = stopById.get(id);
    if (!s) throw new Error(`Halte ${id} di stop_times tidak ada di stops.txt`);
    i = stops.id.length;
    stopIndex.set(id, i);
    stops.id.push(id);
    stops.name.push(s.stop_name);
    stops.lat.push(Number(Number(s.stop_lat).toFixed(6)));
    stops.lon.push(Number(Number(s.stop_lon).toFixed(6)));
    return i;
  };

  // Tarif.
  const fares = {};
  for (const f of fareAttr) {
    fares[f.fare_id] = { price: Number(f.price), transferSec: f.transfer_duration ? Number(f.transfer_duration) : 0 };
  }
  const fareByRoute = new Map(fareRules.map((r) => [r.route_id, r.fare_id]));

  // Rute.
  const routeIndex = new Map();
  const routes = [];
  for (const r of routesCsv) {
    routeIndex.set(r.route_id, routes.length);
    const fare = fareByRoute.get(r.route_id);
    if (!fare || !fares[fare]) throw new Error(`Rute ${r.route_id} tanpa tarif`);
    routes.push({
      id: r.route_id,
      short: r.route_short_name || r.route_id,
      long: r.route_long_name,
      cat: r.route_desc,
      color: (r.route_color || '64748B').toUpperCase(),
      text: (r.route_text_color || 'FFFFFF').toUpperCase(),
      fare,
    });
  }

  // Frekuensi per trip.
  const freqByTrip = new Map();
  for (const f of freqCsv) {
    let arr = freqByTrip.get(f.trip_id);
    if (!arr) freqByTrip.set(f.trip_id, (arr = []));
    arr.push([detik(f.start_time), detik(f.end_time), Number(f.headway_secs)]);
  }

  const patterns = [];
  const shapeDipakai = new Set();
  for (const trip of tripsCsv) {
    const st = perTrip.get(trip.trip_id);
    if (!st || st.length < 2) continue;
    const freq = freqByTrip.get(trip.trip_id);
    if (!freq || !freq.length) throw new Error(`Trip ${trip.trip_id} tanpa frequencies`);
    const route = routeIndex.get(trip.route_id);
    if (route === undefined) throw new Error(`Trip ${trip.trip_id} merujuk rute tak dikenal ${trip.route_id}`);
    const t0 = detik(st[0].arrival_time || st[0].departure_time);
    const t = [];
    let prev = 0;
    for (const s of st) {
      // Offset harus naik monoton; data yang mundur dijepit ke offset sebelumnya.
      const v = Math.max(prev, detik(s.arrival_time || s.departure_time) - t0);
      t.push(v);
      prev = v;
    }
    freq.sort((a, b) => a[0] - b[0]);
    patterns.push({
      route,
      head: trip.trip_headsign,
      svc: trip.service_id,
      shape: trip.shape_id || '',
      stops: st.map((s) => idxHalte(s.stop_id)),
      t,
      freq,
    });
    if (trip.shape_id) shapeDipakai.add(trip.shape_id);
  }

  const services = {};
  for (const c of calCsv) {
    services[c.service_id] = {
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => c[d]).join(''),
      start: Number(c.start_date),
      end: Number(c.end_date),
    };
  }

  const transfers = [];
  for (const tr of transfersCsv) {
    const a = stopIndex.get(tr.from_stop_id);
    const b = stopIndex.get(tr.to_stop_id);
    if (a !== undefined && b !== undefined && a !== b) transfers.push([a, b]);
  }

  const titik = new Map();
  for (const s of shapesCsv) {
    if (!shapeDipakai.has(s.shape_id)) continue;
    let arr = titik.get(s.shape_id);
    if (!arr) titik.set(s.shape_id, (arr = []));
    arr.push([Number(s.shape_pt_sequence), Number(s.shape_pt_lat), Number(s.shape_pt_lon)]);
  }
  const shapes = {};
  for (const [id, arr] of titik) {
    arr.sort((a, b) => a[0] - b[0]);
    shapes[id] = encodePolyline(simplify(arr.map((p) => [p[1], p[2]]), SHAPE_TOLERANCE_M));
  }

  return {
    network: { generated: new Date().toISOString(), source: GTFS_URL, stops, routes, fares, services, patterns, transfers },
    shapes,
  };
}

async function main() {
  const fresh = process.argv.includes('--fresh');
  const files = unzip(await ambilZip(fresh));
  const { network, shapes } = buildNetwork(files);
  const dataDir = join(ROOT, 'data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'network.json'), JSON.stringify(network));
  await writeFile(join(dataDir, 'shapes.json'), JSON.stringify(shapes));
  console.log(`Halte ${network.stops.id.length}, rute ${network.routes.length}, pola ${network.patterns.length}, shape ${Object.keys(shapes).length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
