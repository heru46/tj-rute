import { test } from 'node:test';
import assert from 'node:assert/strict';
import { price } from '../src/fare.js';

const network = {
  routes: [
    { id: '1', fare: 'FP' },
    { id: '2', fare: 'FP' },
    { id: 'JAK.1', fare: 'GR' },
    { id: '1T', fare: 'PP' },
    { id: '6H', fare: 'FP2' },
  ],
  fares: {
    FP: { price: 3500, transferSec: 10800 },
    FP2: { price: 3500, transferSec: 10800 },
    GR: { price: 0, transferSec: 10800 },
    PP: { price: 20000, transferSec: 10800 },
  },
};
const ride = (route, boardSec) => ({ type: 'ride', route, boardSec });
const walk = { type: 'walk', meters: 100, sec: 104 };
const it = (...legs) => ({ legs });

test('integrasi FP dibayar sekali dalam 3 jam', () => {
  assert.deepEqual(price(it(walk, ride(0, 28800), ride(1, 30000), walk), network), { total: 3500, perLeg: [3500, 0] });
});

test('FP setelah 3 jam dari tap pertama dibayar lagi', () => {
  assert.deepEqual(price(it(ride(0, 28800), ride(1, 28800 + 10801)), network), { total: 7000, perLeg: [3500, 3500] });
});

test('Mikrotrans gratis dan tidak memulai jendela integrasi', () => {
  assert.deepEqual(price(it(ride(2, 20000), ride(0, 28800), ride(1, 39000)), network), { total: 3500, perLeg: [0, 3500, 0] });
});

test('Royaltrans dibayar per naik, terpisah dari integrasi FP', () => {
  assert.deepEqual(price(it(ride(0, 28800), ride(3, 29000), ride(3, 31000)), network), { total: 43500, perLeg: [3500, 20000, 20000] });
});

test('FP2 satu grup integrasi dengan FP', () => {
  assert.deepEqual(price(it(ride(4, 28800), ride(0, 29500)), network), { total: 3500, perLeg: [3500, 0] });
});

test('jalan kaki saja gratis', () => {
  assert.deepEqual(price(it(walk), network), { total: 0, perLeg: [] });
});
