import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv } from '../scripts/build-data.mjs';

const network = JSON.parse(await readFile(new URL('../data/network.json', import.meta.url), 'utf8'));

test('parseCsv: tanda kutip, koma di dalam kutip, BOM, CRLF', () => {
  const rows = parseCsv('\ufeffa,b\r\n"x, y","say ""hi"""\r\n1,\r\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: 'say "hi"' }, { a: '1', b: '' }]);
});

test('setiap pola valid: halte = offset, offset naik, frekuensi ada', () => {
  const nStop = network.stops.id.length;
  for (const p of network.patterns) {
    assert.equal(p.stops.length, p.t.length);
    assert.ok(p.stops.length >= 2);
    assert.ok(p.freq.length > 0);
    for (let i = 1; i < p.t.length; i++) assert.ok(p.t[i] >= p.t[i - 1]);
    for (const s of p.stops) assert.ok(s >= 0 && s < nStop);
    assert.ok(network.routes[p.route]);
    assert.ok(network.services[p.svc], `layanan ${p.svc} tidak ada di calendar`);
  }
});

test('setiap rute punya tarif yang terdefinisi', () => {
  for (const r of network.routes) assert.ok(network.fares[r.fare], r.id);
});
