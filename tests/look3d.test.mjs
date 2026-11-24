import test from 'node:test'; import assert from 'node:assert/strict';
import { LOOKS, LOOK_NAMES, lookFor, lookByQuarter } from '../core/render3d/look.js';
import { seatLayout, STAND } from '../core/render3d/stadium.js';
test('looks: day/dusk/night valid, night darker and floodlit', () => {
  assert.deepEqual(LOOK_NAMES, ['day', 'dusk', 'night']); assert.equal(lookFor('x'), LOOKS.day);
  assert.ok(LOOKS.night.sun.intensity < LOOKS.day.sun.intensity && LOOKS.night.sky[2] < 0.2 && LOOKS.night.flood === 1 && LOOKS.day.flood === 0);
  assert.deepEqual(['day', 'day', 'dusk', 'night', 'night'].map((_, i) => lookByQuarter(i + 1)), ['day', 'day', 'dusk', 'night', 'night']);
});
test('seatLayout: deterministic, 4 stands, nobody on the field, rows rise', () => {
  const a = seatLayout(), b = seatLayout(); assert.equal(a.length, b.length); assert.ok(a.length > 5000 && a.length < 40000);
  assert.ok(a.every(s => (s.z > 0 || s.z < -48.8) || (s.x < 0 || s.x > 109.7)), 'seats outside the pitch');
  assert.ok(a.every(s => s.y >= 1.1 && s.y <= STAND.rows * STAND.rowH + 1.2));
  assert.ok(seatLayout(109.7, 48.8, STAND, 0.5).length < a.length * 0.6);
});
