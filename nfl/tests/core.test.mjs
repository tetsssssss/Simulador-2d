// RNG, ratings keys, movement physics, lineup selection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { ATTRIBUTES, keyForAttribute, makeRatings } from '../src/ratings.js';
import { buildProfile } from '../src/sim/attributes.js';
import { steer, integrate } from '../src/sim/movement.js';
import { lineups, roster } from './fixtures.mjs';

test('RNG: same seed -> same sequence; different seed -> different', () => {
  const a = createRng('NFL_TEST'), b = createRng('NFL_TEST'), c = createRng('OTHER');
  const sa = Array.from({ length: 20 }, () => a.next()), sb = Array.from({ length: 20 }, () => b.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, Array.from({ length: 20 }, () => c.next()));
});

test('RNG: range/int/chance/weighted/normal are sane', () => {
  const r = createRng(7);
  let w = { a: 0, b: 0 }, sum = 0, sq = 0;
  for (let i = 0; i < 20000; i++) {
    const x = r.range(2, 5); assert.ok(x >= 2 && x < 5);
    const k = r.int(1, 3); assert.ok(k >= 1 && k <= 3);
    w[r.weighted([['a', 3], ['b', 1]])]++;
    const n = r.normal(); sum += n; sq += n * n;
  }
  assert.ok(Math.abs(w.a / 20000 - 0.75) < 0.02);
  assert.ok(Math.abs(sum / 20000) < 0.05 && Math.abs(sq / 20000 - 1) < 0.06);
});

test('ratings: all 50 attribute keys are proper camelCase and unique (regression: keys used to lose capitals)', () => {
  const keys = ATTRIBUTES.map(keyForAttribute);
  assert.equal(new Set(keys).size, 50);
  for (const k of ['changeOfDirection', 'throwingPower', 'shortAccuracy', 'deepAccuracy', 'throwOnRun', 'routeRunning', 'passBlock', 'blockFootwork', 'manCoverage', 'playRecognition', 'decisionMaking']) assert.ok(keys.includes(k), k);
  const r = makeRatings({ full_name: 'Test', position: 'QB' });
  for (const k of keys) assert.ok(Number.isFinite(r[k]) && r[k] >= 1 && r[k] <= 200, k);
});

test('movement: acceleration is limited (no teleport), top speed depends on ratings', () => {
  const ls = lineups();
  const mk = p => ({ prof: buildProfile(p), pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, energy: 1, stun: 0, facing: 0 });
  const wr = mk(ls.offense.find(p => p.position === 'WR')), ol = mk(ls.offense.find(p => p.position === 'OL'));
  const dt = 1 / 30;
  let maxStep = 0;
  for (let i = 0; i < 90; i++) for (const e of [wr, ol]) { const before = { ...e.pos }; steer(e, { x: 20, y: 0 }, dt); integrate(e, dt); if (e === wr) maxStep = Math.max(maxStep, e.pos.x - before.x); }
  assert.ok(maxStep <= wr.prof.maxSpeed * dt + 1e-9, 'never faster than top speed');
  assert.ok(wr.pos.x > ol.pos.x + 2, 'WR covers more ground than OL in 3s');
  // From standstill the first tick cannot reach full speed.
  const e = mk(ls.offense[0]); steer(e, { x: 20, y: 0 }, dt);
  assert.ok(Math.hypot(e.vel.x, e.vel.y) <= e.prof.accel * dt + 1e-9);
  // Reversing direction at speed takes time (momentum).
  const f = mk(ls.offense.find(p => p.position === 'WR')); f.vel = { x: 8, y: 0 };
  steer(f, { x: -8, y: 0 }, dt);
  assert.ok(f.vel.x > 7, 'cannot reverse instantly');
});

test('lineups: real players, active starters, CB/S slotted from depth_chart_position', () => {
  const ls = lineups('SEA', 'NE');
  assert.equal(ls.offense.length, 11); assert.equal(ls.defense.length, 11);
  const all = [...ls.offense, ...ls.defense];
  assert.ok(all.every(p => p.full_name && p.gsis_id), 'real roster entries');
  assert.ok(all.every(p => p.status === 'ACT'), 'no IR / practice squad starters when actives exist');
  const dcp = ls.defense.map(p => p.depth_chart_position);
  assert.equal(dcp.filter(x => x === 'CB').length, 2);
  assert.equal(dcp.filter(x => ['FS', 'SS', 'S'].includes(x)).length, 2);
  assert.ok(roster().length > 2500);
});
