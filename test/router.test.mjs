import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, plan, planAlternatives, nearbyStops } from '../src/router.js';

// Enam halte di satu garis timur–barat, ±497 m antar-halte (terlalu jauh untuk
// transfer jalan kaki 400 m). Halte 5 jauh di luar jaringan.
const LAT = -6.2;
const lon = (i) => 106.8 + i * 0.0045;
const net = {
  stops: {
    id: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'],
    name: ['Nol', 'Satu', 'Dua', 'Tiga', 'Empat', 'Jauh'],
    lat: [LAT, LAT, LAT, LAT, LAT, LAT],
    lon: [lon(0), lon(1), lon(2), lon(3), lon(4), 107.5],
  },
  routes: [
    { id: 'A', short: 'A', long: 'Nol - Dua', cat: 'BRT', color: 'FF0000', text: 'FFFFFF', fare: 'FP' },
    { id: 'B', short: 'B', long: 'Dua - Empat', cat: 'BRT', color: '00FF00', text: 'FFFFFF', fare: 'FP' },
    { id: 'C', short: 'C', long: 'Nol - Empat (Minggu)', cat: 'BRT', color: '0000FF', text: 'FFFFFF', fare: 'FP' },
  ],
  fares: { FP: { price: 3500, transferSec: 10800 } },
  services: {
    SH: { days: '1111111', start: 20200101, end: 20301231 },
    HM: { days: '0000001', start: 20200101, end: 20301231 },
  },
  patterns: [
    { route: 0, head: 'Dua', svc: 'SH', shape: '', stops: [0, 1, 2], t: [0, 120, 240], freq: [[18000, 79200, 600]] },
    { route: 1, head: 'Empat', svc: 'SH', shape: '', stops: [2, 3, 4], t: [0, 120, 240], freq: [[18000, 79200, 300]] },
    { route: 2, head: 'Empat', svc: 'HM', shape: '', stops: [0, 4], t: [0, 300], freq: [[18000, 79200, 600]] },
  ],
  transfers: [],
};
const index = prepare(net);
const SENIN = new Date(2026, 9, 5); // Senin 5 Okt 2026
const MINGGU = new Date(2026, 9, 4);
const at = (i) => ({ lat: LAT, lon: lon(i), name: `titik ${i}` });
const rides = (it) => it.legs.filter((l) => l.type === 'ride');
const routesOf = (it) => rides(it).map((l) => net.routes[l.route].id).join('>');

test('naik langsung: tunggu = headway/2, tiba = berangkat + tunggu + waktu tempuh', () => {
  const res = plan(index, { from: at(0), to: at(2), departSec: 28800, date: SENIN });
  const it = res.find((r) => r.rides === 1);
  assert.equal(routesOf(it), 'A');
  assert.equal(rides(it)[0].waitSec, 300);
  assert.equal(it.arriveSec, 28800 + 300 + 240);
});

test('transfer di halte yang sama: tunggu kedua = headway/2 + penalti 120 s', () => {
  const res = plan(index, { from: at(0), to: at(4), departSec: 28800, date: SENIN });
  const it = res.find((r) => r.rides === 2);
  assert.equal(routesOf(it), 'A>B');
  assert.equal(rides(it)[1].waitSec, 150 + 120);
  assert.equal(it.arriveSec, 28800 + 300 + 240 + 270 + 240);
  assert.ok(!res.some((r) => routesOf(r).includes('C')), 'rute Minggu tidak boleh muncul hari Senin');
});

test('hari layanan: rute khusus Minggu dipakai pada hari Minggu', () => {
  const res = plan(index, { from: at(0), to: at(4), departSec: 28800, date: MINGGU });
  const best = res.reduce((a, b) => (a.arriveSec <= b.arriveSec ? a : b));
  assert.equal(routesOf(best), 'C');
  assert.equal(best.arriveSec, 28800 + 300 + 300);
});

test('di luar jam operasi tidak ada rute', () => {
  const res = plan(index, { from: at(0), to: at(4), departSec: 81000, date: SENIN });
  assert.deepEqual(res, []);
});

test('sebelum jendela frekuensi: menunggu sampai layanan mulai', () => {
  const res = plan(index, { from: at(0), to: at(2), departSec: 17400, date: SENIN });
  const it = res.find((r) => r.rides === 1);
  assert.equal(rides(it)[0].waitSec, 600);
  assert.equal(it.arriveSec, 18000 + 240);
});

test('tidak ada halte dalam 1 km dari asal → kosong', () => {
  const res = plan(index, { from: { lat: -6.22, lon: lon(0), name: 'jauh' }, to: at(4), departSec: 28800, date: SENIN });
  assert.deepEqual(res, []);
});

test('A–B dekat menghasilkan opsi jalan kaki saja', () => {
  const to = { lat: LAT, lon: lon(0) + 0.0054, name: 'dekat' };
  const res = plan(index, { from: at(0), to, departSec: 28800, date: SENIN });
  const walk = res.find((r) => r.rides === 0);
  assert.equal(walk.legs.length, 1);
  assert.equal(walk.legs[0].type, 'walk');
});

test('excludeRoutes membuang rute dari hasil', () => {
  const res = plan(index, { from: at(0), to: at(2), departSec: 28800, date: SENIN, excludeRoutes: new Set([0]) });
  assert.ok(res.every((r) => !rides(r).some((l) => l.route === 0)));
});

test('planAlternatives: unik per urutan rute dan terurut dari skor (tiba + 5 menit per naik)', () => {
  const res = planAlternatives(index, { from: at(0), to: at(4), departSec: 28800, date: MINGGU });
  const keys = res.map(routesOf);
  assert.equal(new Set(keys).size, keys.length);
  const score = (it) => it.arriveSec + 300 * it.rides;
  for (let i = 1; i < res.length; i++) assert.ok(score(res[i - 1]) <= score(res[i]));
  assert.deepEqual(keys.slice(0, 2), ['C', 'A>B']);
});

test('opsi langsung yang 3 menit lebih lambat diurutkan di atas opsi dengan transfer', () => {
  // C setiap hari, tiba 180 s setelah A>B (A>B tiba 29850 pada 08:00).
  const slowC = { ...net.patterns[2], svc: 'SH', t: [0, 29850 + 180 - 29100] };
  const idx2 = prepare({ ...net, patterns: [net.patterns[0], net.patterns[1], slowC] });
  const res = planAlternatives(idx2, { from: at(0), to: at(4), departSec: 28800, date: SENIN });
  assert.deepEqual(res.map(routesOf).slice(0, 2), ['C', 'A>B']);
  assert.ok(res[0].arriveSec > res[1].arriveSec);
});

test('nearbyStops mengurutkan dari yang terdekat dan menghormati radius', () => {
  const near = nearbyStops(index, LAT, lon(0) + 0.0001, 600);
  assert.deepEqual(near.map((n) => n.stop), [0, 1]);
});
