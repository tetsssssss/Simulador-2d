import test from 'node:test'; import assert from 'node:assert/strict';
import { fenceLine, diamondCamera, DIAMOND_CAMERAS, FT } from '../core/render3d/diamondScene.js';
import { playerClip, roleOf } from '../mlb/src/field/fieldRenderer3d.js';
import { CAMERAS } from '../mlb/src/field/fieldRenderer.js';
test('fence: 330 ft at the lines, 400 ft to centre', () => {
  const F = fenceLine(); assert.equal(F.length, 37);
  assert.ok(Math.abs(Math.hypot(F[0].x, F[0].y) - 330) < 0.5 && Math.abs(Math.hypot(F[36].x, F[36].y) - 330) < 0.5 && Math.abs(Math.hypot(F[18].x, F[18].y) - 400) < 0.5);
});
test('every 2D camera preset has a 3D camera; broadcast follows deep balls; batter cam is behind the plate', () => {
  for (const k of Object.keys(CAMERAS)) assert.ok(DIAMOND_CAMERAS.includes(k), k);
  const a = diamondCamera('BROADCAST', null), b = diamondCamera('BROADCAST', { x: 100, y: 300, z: 20 });
  assert.ok(b.look[2] < a.look[2], 'looks further out for a deep ball'); assert.ok(diamondCamera('BATTER').pos[2] > 0 && a.pos[2] > 0);
  void FT;
});
test('playerClip: idle by role, gait by speed, actions override', () => {
  assert.equal(playerClip({}, 'batter').clip, 'bb_stance'); assert.equal(playerClip({}, 'fielder').clip, 'mv_idle'); assert.equal(playerClip({}, 'catcher').clip, 'mv_athletic_ready');
  assert.equal(playerClip({}, 'runner', { speed: 7 }).clip, 'mv_sprint');
  assert.equal(playerClip({}, 'pitcher', {}, { type: 'throw', token: 'a' }).clip, 'bb_pitch'); assert.equal(playerClip({}, 'fielder', {}, { type: 'throw', token: 'a' }).clip, 'qb_overhand');
  assert.equal(playerClip({}, 'batter', {}, { type: 'swing', token: 'a' }).clip, 'bb_swing');
  assert.equal(roleOf({ pos: 'P' }, 'fielder'), 'pitcher'); assert.equal(roleOf({}, 'runner'), 'runner');
});
