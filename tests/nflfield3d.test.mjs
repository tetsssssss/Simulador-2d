import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldLayout, FIELD, broadcastTarget, followStep } from '../core/render3d/nflField.js';
import { worldFromSim } from '../core/render3d/athletes.js';
test('field layout: official dimensions, a line every 5 yd inside the end zones, numbers 10..50..10, hash marks 18 ft 6 in apart', () => {
  assert.equal(FIELD.length, 120); assert.ok(Math.abs(FIELD.width - 53.333) < 1e-3); assert.equal(FIELD.endZone, 10);
  const L = fieldLayout(); assert.equal(L.lines.length, 21); assert.deepEqual([L.lines[0].x, L.lines.at(-1).x], [10, 110]); assert.ok(L.lines[0].goal && L.lines.at(-1).goal && L.lines.filter(l => l.goal).length === 2);
  assert.equal(L.lines.filter(l => l.kind === 'major').length, 11);
  assert.deepEqual(L.numbers.map(n => n.label), ['10', '20', '30', '40', '50', '40', '30', '20', '10']); assert.deepEqual(L.numbers.map(n => n.x), [20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.ok(L.numbers.every(n => n.rows.length === 2 && n.rows[0].flip === false && n.rows[1].flip === true));
  assert.ok(Math.abs((L.hashY[1] - L.hashY[0]) - (FIELD.width - 2 * FIELD.hashFromSide)) < 1e-9); assert.ok(Math.abs(L.hashY[0] - 23.583) < 1e-2);
  assert.equal(L.endZones.length, 2); assert.equal(L.ticks.length, 99 - 19); assert.ok(L.ticks.every(t => t.x % 5 !== 0));
});
test('broadcast camera: stays on the near side of the field, keeps the ball in frame near the ends by clamping, and follows smoothly without overshoot', () => {
  const mid = broadcastTarget('nfl', 60), end = broadcastTarget('nfl', 2), far = broadcastTarget('nfl', 118);
  assert.ok(mid.pos[2] > 0 && mid.look[2] < 0 && mid.pos[1] > 5); assert.ok(Math.abs(mid.pos[0] - 60 * 0.9144) < 1e-9); assert.ok(end.pos[0] >= 18 && far.pos[0] <= 120 * 0.9144 - 18);
  let cur = [0, 17, 30]; const goal = [50, 17, 30], dists = []; for (let i = 0; i < 120; i++) { cur = followStep(cur, goal, 1 / 60); dists.push(goal[0] - cur[0]); }
  assert.ok(dists.every((d, i) => d >= 0 && (i === 0 || d <= dists[i - 1])), 'monotonic, no overshoot'); assert.ok(dists.at(-1) < 0.2);
  assert.deepEqual(followStep([1, 2, 3], [9, 9, 9], 0), [1, 2, 3]);                 // dt 0: no movement
  const a = followStep([0, 0, 0], [10, 0, 0], 1 / 30), b = followStep(followStep([0, 0, 0], [10, 0, 0], 1 / 60), [10, 0, 0], 1 / 60); assert.ok(Math.abs(a[0] - b[0]) < 1e-9, 'frame-rate independent');
});
test('the field sits in front of the world origin the same way athletes map: x downfield, y across -> -Z', () => {
  assert.deepEqual(worldFromSim('nfl', 0, 0), [0, 0, -0]); const far = worldFromSim('nfl', 120, FIELD.width); assert.ok(Math.abs(far[0] - 109.728) < 1e-3 && Math.abs(far[2] + 48.768) < 1e-3);
});
