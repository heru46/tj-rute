// Mesin rute: RAPTOR berbasis ronde untuk jaringan yang seluruh tripnya
// berbasis frekuensi (GTFS frequencies.txt). Satu ronde = satu kali naik.
// Modul murni: tanpa DOM, bisa dites di Node.
import { haversine, walkSec } from './geo.js';

export const ACCESS_M = 1000;
export const TRANSFER_M = 400;
export const TRANSFER_PENALTY_SEC = 120;
export const MAX_RIDES = 4;
/** Bobot urutan tampilan: satu kali naik tambahan dianggap setara 5 menit. */
export const RIDE_SCORE_SEC = 300;

const CELL = 0.01; // derajat, ±1,1 km

function cellKey(lat, lon) {
  return `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
}

/** Bangun indeks sekali setelah data dimuat. */
export function prepare(network) {
  const { stops, patterns } = network;
  const n = stops.id.length;
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const k = cellKey(stops.lat[i], stops.lon[i]);
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(i);
  }

  const stopPatterns = Array.from({ length: n }, () => []);
  patterns.forEach((p, pi) => p.stops.forEach((s, pos) => stopPatterns[s].push([pi, pos])));

  const index = { network, grid, stopPatterns, footpaths: Array.from({ length: n }, () => []) };

  // Transfer jalan kaki: pasangan halte ≤ 400 m, ditambah transfers.txt.
  for (let i = 0; i < n; i++) {
    for (const { stop, meters } of nearbyStops(index, stops.lat[i], stops.lon[i], TRANSFER_M)) {
      if (stop !== i) index.footpaths[i].push([stop, walkSec(meters), meters]);
    }
  }
  for (const [a, b] of network.transfers || []) {
    if (index.footpaths[a].some((f) => f[0] === b)) continue;
    const meters = haversine(stops.lat[a], stops.lon[a], stops.lat[b], stops.lon[b]);
    index.footpaths[a].push([b, walkSec(meters), meters]);
  }
  return index;
}

/** Halte dalam radius, urut dari terdekat. */
export function nearbyStops(index, lat, lon, maxMeters) {
  const { stops } = index.network;
  const dLat = maxMeters / 110574 / CELL;
  const dLon = maxMeters / (111320 * Math.cos((lat * Math.PI) / 180)) / CELL;
  const out = [];
  for (let y = Math.floor(lat / CELL - dLat); y <= Math.floor(lat / CELL + dLat); y++) {
    for (let x = Math.floor(lon / CELL - dLon); x <= Math.floor(lon / CELL + dLon); x++) {
      const arr = index.grid.get(`${y}:${x}`);
      if (!arr) continue;
      for (const s of arr) {
        const m = haversine(lat, lon, stops.lat[s], stops.lon[s]);
        if (m <= maxMeters) out.push({ stop: s, meters: m });
      }
    }
  }
  return out.sort((a, b) => a.meters - b.meters);
}

function serviceActive(svc, date) {
  if (!svc) return false;
  const ymd = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  if (ymd < svc.start || ymd > svc.end) return false;
  return svc.days[(date.getDay() + 6) % 7] === '1';
}

/** Tunggu (detik) untuk naik pola di posisi pos pada waktu `time`; -1 bila tidak ada layanan. */
export function waitAt(pattern, pos, time) {
  const x = time - pattern.t[pos];
  for (const [s, e, h] of pattern.freq) {
    if (x < s) return s - x;
    if (x < e) return Math.round(h / 2);
  }
  return -1;
}

function stopPoint(network, s) {
  return { lat: network.stops.lat[s], lon: network.stops.lon[s], name: network.stops.name[s], stop: s };
}

function walkLeg(from, to, meters) {
  return { type: 'walk', from, to, meters, sec: walkSec(meters) };
}

/**
 * Cari rute A→B. Mengembalikan itinerary Pareto: tiap entri tiba lebih awal
 * daripada semua entri dengan jumlah kendaraan lebih sedikit.
 */
export function plan(index, query) {
  const { network } = index;
  const { from, to, departSec, date = new Date(), excludeRoutes } = query;
  const n = network.stops.id.length;
  const results = [];
  let bestDest = Infinity;

  const direct = haversine(from.lat, from.lon, to.lat, to.lon);
  if (direct <= ACCESS_M) {
    const leg = walkLeg(from, to, direct);
    bestDest = departSec + leg.sec;
    results.push({ departSec, arriveSec: bestDest, rides: 0, walkMeters: direct, legs: [leg] });
  }

  const access = nearbyStops(index, from.lat, from.lon, ACCESS_M);
  const egress = new Map(nearbyStops(index, to.lat, to.lon, ACCESS_M).map((e) => [e.stop, e.meters]));
  if (!access.length || !egress.size) return results;

  const patternOk = network.patterns.map(
    (p) => serviceActive(network.services[p.svc], date) && !(excludeRoutes && excludeRoutes.has(p.route)),
  );

  const best = new Float64Array(n).fill(Infinity);
  const tau = [new Float64Array(n).fill(Infinity)];
  const parents = [new Array(n).fill(null)];
  let marked = new Set();
  for (const { stop, meters } of access) {
    const v = departSec + walkSec(meters);
    if (v < tau[0][stop]) {
      tau[0][stop] = v;
      best[stop] = v;
      parents[0][stop] = { type: 'access', meters };
      marked.add(stop);
    }
  }

  const found = [];
  for (let k = 1; k <= MAX_RIDES && marked.size; k++) {
    const prev = tau[k - 1];
    const cur = Float64Array.from(prev);
    const par = new Array(n).fill(null);
    tau.push(cur);
    parents.push(par);

    // Pola yang perlu dipindai + posisi bertanda paling awal.
    const queue = new Map();
    for (const s of marked) {
      for (const [pi, pos] of index.stopPatterns[s]) {
        if (!patternOk[pi]) continue;
        const q = queue.get(pi);
        if (q === undefined || pos < q) queue.set(pi, pos);
      }
    }

    const byRide = [];
    const penalty = k > 1 ? TRANSFER_PENALTY_SEC : 0;
    for (const [pi, startPos] of queue) {
      const p = network.patterns[pi];
      let board = null;
      for (let pos = startPos; pos < p.stops.length; pos++) {
        const s = p.stops[pos];
        if (board) {
          const arr = board.key + p.t[pos];
          if (arr < best[s] && arr < bestDest) {
            cur[s] = arr;
            best[s] = arr;
            par[s] = { type: 'ride', pattern: pi, boardPos: board.pos, alightPos: pos, waitSec: board.wait, boardSec: board.boardSec };
            byRide.push(s);
          }
        }
        if (prev[s] < Infinity) {
          const w = waitAt(p, pos, prev[s]);
          if (w >= 0) {
            const wait = w + penalty;
            const key = prev[s] + wait - p.t[pos];
            if (!board || key < board.key) board = { pos, key, wait, boardSec: prev[s] + wait };
          }
        }
      }
    }

    const nextMarked = new Set(byRide);
    for (const s of byRide) {
      const ride = par[s];
      if (!ride || ride.type !== 'ride') continue;
      for (const [t, sec, meters] of index.footpaths[s]) {
        const v = cur[s] + sec;
        if (v < best[t] && v < bestDest) {
          cur[t] = v;
          best[t] = v;
          par[t] = { type: 'walk', from: s, meters, ride };
          nextMarked.add(t);
        }
      }
    }

    let roundBest = null;
    for (const s of nextMarked) {
      const m = egress.get(s);
      if (m === undefined) continue;
      const arrive = cur[s] + walkSec(m);
      if (arrive < bestDest && (!roundBest || arrive < roundBest.arrive)) roundBest = { stop: s, arrive, meters: m };
    }
    if (roundBest) {
      bestDest = roundBest.arrive;
      found.push({ k, ...roundBest });
    }
    marked = nextMarked;
  }

  for (const f of found) results.push(reconstruct(index, parents, f, query));
  return results;
}

function reconstruct(index, parents, f, query) {
  const { network } = index;
  const legs = [];
  const egressTo = stopPoint(network, f.stop);
  if (f.meters > 0) legs.push(walkLeg(egressTo, query.to, f.meters));
  let s = f.stop;
  let k = f.k;
  for (;;) {
    let kk = k;
    while (kk > 0 && parents[kk][s] === null) kk--;
    let p = parents[kk][s];
    if (p.type === 'access') {
      if (p.meters > 0) legs.push(walkLeg(query.from, stopPoint(network, s), p.meters));
      break;
    }
    if (p.type === 'walk') {
      legs.push(walkLeg(stopPoint(network, p.from), stopPoint(network, s), p.meters));
      s = p.from;
      p = p.ride;
    }
    const pat = network.patterns[p.pattern];
    legs.push({
      type: 'ride',
      pattern: p.pattern,
      route: pat.route,
      fromStop: pat.stops[p.boardPos],
      toStop: pat.stops[p.alightPos],
      fromPos: p.boardPos,
      toPos: p.alightPos,
      waitSec: p.waitSec,
      boardSec: p.boardSec,
      alightSec: p.boardSec + pat.t[p.alightPos] - pat.t[p.boardPos],
    });
    s = pat.stops[p.boardPos];
    k = kk - 1;
  }
  legs.reverse();
  return {
    departSec: query.departSec,
    arriveSec: f.arrive,
    rides: legs.filter((l) => l.type === 'ride').length,
    walkMeters: legs.reduce((a, l) => a + (l.type === 'walk' ? l.meters : 0), 0),
    legs,
  };
}

function routeKey(it) {
  return it.legs.filter((l) => l.type === 'ride').map((l) => l.route).join('>') || 'walk';
}

/**
 * Hasil utama + variasi: tiap rute yang dipakai hasil terbaik dikecualikan
 * satu per satu supaya muncul pilihan lain. Unik per urutan rute.
 */
export function planAlternatives(index, query, max = 5) {
  const base = plan(index, query);
  const byKey = new Map();
  const add = (it) => {
    const key = routeKey(it);
    const old = byKey.get(key);
    if (!old || it.arriveSec < old.arriveSec) byKey.set(key, it);
  };
  base.forEach(add);
  const excluded = new Set(query.excludeRoutes || []);
  const seeds = base.filter((b) => b.rides > 0);
  for (const seed of seeds) {
    for (const leg of seed.legs) {
      if (leg.type !== 'ride' || excluded.has(leg.route)) continue;
      const ex = new Set(excluded);
      ex.add(leg.route);
      plan(index, { ...query, excludeRoutes: ex }).forEach(add);
    }
  }
  const score = (it) => it.arriveSec + RIDE_SCORE_SEC * it.rides;
  const all = [...byKey.values()].sort((a, b) => score(a) - score(b) || a.rides - b.rides);
  if (!all.length) return all;
  const bestArrive = Math.min(...all.map((it) => it.arriveSec));
  const slack = Math.max(1800, 0.75 * (bestArrive - query.departSec));
  return all.filter((it) => it.arriveSec - bestArrive <= slack).slice(0, max);
}
