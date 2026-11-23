import test from 'node:test';
import assert from 'node:assert/strict';
import { locomotion3d, clipSpeedFactor, ballPlacement, cameraRig, CAMERA_PRESETS } from '../nfl/src/ui/render3dLogic.js';
import { broadcastTarget } from '../core/render3d/nflField.js';
import { getClip } from '../core/anim/registry.js';
const ent = (o = {}) => ({ side: 'off', down: false, facing: 0, vel: { x: 0, y: 0 }, pos: { x: 50, y: 26 }, ...o });
test('locomotion3d: thresholds match the 2D gaits, ball carriers use the ball clips, defenders shuffle sideways and stand ready pre-snap, tackled players lie down', () => {
  assert.equal(locomotion3d(ent()).clip, 'mv_idle'); assert.equal(locomotion3d(ent({ vel: { x: 3, y: 0 } })).clip, 'mv_jog'); assert.equal(locomotion3d(ent({ vel: { x: 6, y: 0 } })).clip, 'mv_run'); assert.equal(locomotion3d(ent({ vel: { x: 9, y: 0 } })).clip, 'mv_sprint');
  const c = ent({ vel: { x: 6, y: 0 } }); assert.equal(locomotion3d(c, { carrier: c }).clip, 'mv_run_ball'); const s = ent({ vel: { x: 7, y: 0 } }); assert.equal(locomotion3d(s, { carrier: s }).clip, 'mv_sprint_ball');
  assert.equal(locomotion3d(ent({ vel: { x: -3, y: 0 } })).clip, 'mv_backpedal');
  const d = ent({ side: 'def', vel: { x: 0, y: 2 } }); assert.equal(locomotion3d(d).clip, 'mv_shuffle'); assert.equal(locomotion3d(ent({ vel: { x: 0, y: 2 } })).clip, 'mv_walk');   // offence never shuffles
  assert.equal(locomotion3d(ent({ side: 'def' }), { preSnap: true }).clip, 'mv_athletic_ready'); assert.equal(locomotion3d(ent({ side: 'def' }), { preSnap: false }).clip, 'mv_idle');
  const down = locomotion3d(ent({ down: true })); assert.deepEqual([down.clip, down.loop], ['ag_pile_bottom', false]);
  for (const o of [ent(), ent({ vel: { x: 4, y: 1 } }), ent({ side: 'def', vel: { x: 0, y: 3 } }), ent({ down: true })]) assert.ok(getClip(locomotion3d(o, { preSnap: true }).clip), 'every clip it can choose exists in the registry');
});
test('clipSpeedFactor: loops stretch with real speed within sane bounds; unknown clips play at 1', () => {
  assert.equal(clipSpeedFactor('mv_run', 5.5), 1); assert.ok(clipSpeedFactor('mv_run', 8) > 1.4); assert.equal(clipSpeedFactor('mv_run', 0.1), 0.6); assert.equal(clipSpeedFactor('mv_run', 50), 1.8); assert.equal(clipSpeedFactor('mv_idle', 3), 1);
});
test('ballPlacement: flying ball uses the ball, otherwise the carrier (or the QB before the throw); nothing when the ball is dead and nobody holds it', () => {
  assert.equal(ballPlacement(null), null);
  const fly = ballPlacement({ ball: { pos: { x: 60, y: 20 }, z: 3, vel: { x: 10, y: 0 } }, carrier: null }); assert.deepEqual([fly.x, fly.y, fly.z, fly.flying], [60, 20, 3, true]);
  const car = { pos: { x: 40, y: 10 }, facing: 0 }; const held = ballPlacement({ ball: { pos: { x: 0, y: 0 }, z: 0 }, carrier: car }); assert.ok(held.x > 40 && held.y === 10 && !held.flying && held.z > 0.5);
  const qb = { pos: { x: 30, y: 26 }, facing: 0 }; assert.ok(ballPlacement({ ball: null, carrier: null, phase: 'PRE_THROW', qb }).x > 30); assert.equal(ballPlacement({ ball: null, carrier: null, phase: 'DEAD', qb }), null);
});
test('camera presets: all four exist, broadcast equals the field module target, QB sits behind the quarterback facing downfield, end zone is behind the offence, x is clamped near the ends', () => {
  assert.deepEqual(CAMERA_PRESETS, ['BROADCAST', 'TACTICAL', 'QB', 'ENDZONE']);
  const b = cameraRig('BROADCAST', { ballX: 60 }), t = broadcastTarget('nfl', 60); assert.deepEqual(b.pos.map(v => +v.toFixed(6)), t.pos.map(v => +v.toFixed(6))); assert.deepEqual(b.look.map(v => +v.toFixed(6)), t.look.map(v => +v.toFixed(6)));
  const q = cameraRig('QB', { qb: { x: 35, y: 26.7 }, losX: 40 }); assert.ok(q.pos[0] < q.look[0] && q.pos[1] < 5 && Math.abs(q.pos[2] - q.look[2]) < 1e-9);
  const e = cameraRig('ENDZONE', { ballX: 40 }); assert.ok(e.pos[0] < 40 * 0.9144 && e.pos[1] > 5);
  assert.ok(cameraRig('BROADCAST', { ballX: 1 }).pos[0] >= 15 && cameraRig('BROADCAST', { ballX: 119 }).pos[0] <= 120 * 0.9144 - 15); assert.equal(cameraRig('???', { ballX: 60 }).pos[1], 17);
  for (const p of CAMERA_PRESETS) { const r = cameraRig(p, { ballX: 60, qb: { x: 50, y: 20 }, losX: 55 }); assert.ok(r.pos.every(Number.isFinite) && r.look.every(Number.isFinite), p); }
});
