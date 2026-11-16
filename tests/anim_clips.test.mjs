// Keyframed animation clips (core/anim): schema, catalog traceability, continuity, event wiring and rendering of every clip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { ALL_CLIPS, BATCHES, getClip, clipPoseOf } = await import('../core/anim/registry.js');
const { samplePose, validateClip, NUMERIC, NEUTRAL, blendPose } = await import('../core/anim/pose.js');
const { throwClipId, actionsFor, clipsForEvent, WIRED_CLIPS } = await import('../nfl/src/ui/animationMap.js');
const A = await import('../core/render/avatars.js');
const ctxStub = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (t[k] ?? (() => {}))), set: (t, k, v) => { t[k] = v; return true; } });

const catalog = readFileSync(new URL('../docs/ANIMATION_2D_CATALOG.csv', import.meta.url), 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split(',')[1]);
const STAGE_SIZES = { qb: 25 };

test('every clip is valid (schema, ranges, key times, events)', () => {
  assert.ok(ALL_CLIPS.length >= 25);
  for (const c of ALL_CLIPS) assert.deepEqual(validateClip(c), [], c.id);
});
test('ids are unique and every clip maps to a real entry of the NFL catalog (traceability)', () => {
  const ids = new Set(), names = new Set();
  for (const c of ALL_CLIPS) { assert.ok(!ids.has(c.id), 'dup id ' + c.id); ids.add(c.id); assert.ok(catalog.includes(c.catalog), `${c.id}: "${c.catalog}" not in catalog`); assert.ok(!names.has(c.catalog), 'catalog name used twice: ' + c.catalog); names.add(c.catalog); }
});
test('batch sizes match the plan', () => { for (const [g, n] of Object.entries(STAGE_SIZES)) assert.equal(BATCHES[g].length, n, g); });
test('sampling is continuous (no joint moves > 0.6 rad (36 rad/s) between 1/60 s frames) and stays finite', () => {
  for (const c of ALL_CLIPS) {
    let prev = samplePose(c, 0); const steps = Math.ceil(c.dur * 60);
    for (let i = 1; i <= steps; i++) {
      const q = samplePose(c, i / steps), dtScale = (c.dur / steps) * 60; // normalise: steps are ~1/60 s
      for (const j of NUMERIC) { assert.ok(Number.isFinite(q[j]), `${c.id}.${j}`); assert.ok(Math.abs(q[j] - prev[j]) <= 0.6 / dtScale + 0.05, `${c.id}.${j} jumps ${(q[j] - prev[j]).toFixed(2)} at ${(i / steps).toFixed(2)}`); }
      prev = q;
    }
  }
});
test('loop clips close on themselves (end pose = start pose)', () => {
  for (const c of ALL_CLIPS.filter(c => c.loop)) { const a = samplePose(c, 0), b = samplePose(c, 1); for (const j of NUMERIC) assert.ok(Math.abs(a[j] - b[j]) < 1e-6, `${c.id}.${j}`); assert.deepEqual(samplePose(c, 3.25), samplePose(c, 0.25)); }
});
test('throws: ball leaves the hand exactly at the release event and the arm goes over the top', () => {
  const throws = ALL_CLIPS.filter(c => c.ev.release != null && c.group === 'qb' && /throw|pass|release|lob|bullet|touch|throwaway/i.test(c.name));
  assert.ok(throws.length >= 10);
  for (const c of throws) {
    const r = c.ev.release;
    assert.notEqual(samplePose(c, Math.max(0, r - 0.06)).ball, '', `${c.id}: ball in hand before release`);
    assert.equal(samplePose(c, Math.min(1, r + 0.04)).ball, '', `${c.id}: ball gone after release`);
  }
  for (const id of ['qb_overhand', 'qb_quick_release', 'qb_bullet', 'qb_touch', 'qb_lob']) { // overhead arcs reach straight-up (|a| ≥ 3.0) between cock and release
    const c = getClip(id); let reached = false; for (let i = 0; i <= 100; i++) if (Math.abs(samplePose(c, i / 100).aF) >= 3.0) reached = true; assert.ok(reached, id + ' never raises the arm overhead');
  }
});
test('blendPose interpolates joints and switches the ball hand at the midpoint', () => {
  const a = { ...NEUTRAL, lean: 0, ball: 'F' }, b = { ...NEUTRAL, lean: 1, ball: '' };
  assert.equal(blendPose(a, b, 0.25).lean, 0.25); assert.equal(blendPose(a, b, 0.25).ball, 'F'); assert.equal(blendPose(a, b, 0.75).ball, '');
});
test('clipPoseOf resolves clip actions only', () => {
  assert.equal(clipPoseOf({ type: 'swing', t: 0.5 }), null); assert.equal(clipPoseOf({ type: 'clip:nope', t: 0.5 }), null); assert.ok(clipPoseOf({ type: 'clip:qb_overhand', t: 0.5 }));
});
test('event mapping: every rule resolves to an existing clip; throw choice follows ball type, pressure, movement', () => {
  const sim = (o = {}) => ({ t: 10, losX: 30, qb: { id: 'q', pos: { x: 25, y: 20 }, vel: { x: o.spd || 0, y: 0 } }, qbState: { pocket: { collapse: o.col || 0 } } });
  const ev = (o = {}) => ({ type: 'PASS_ATTEMPT', passer: 'q', airYards: 10, ballType: 'BULLET', ...o });
  assert.equal(throwClipId(sim(), ev({ throwAway: true })), 'qb_throwaway');
  assert.equal(throwClipId(sim(), ev({ ballType: 'LOB', airYards: 35 })), 'qb_lob');
  assert.equal(throwClipId(sim({ col: 0.8 }), ev()), 'qb_under_pressure');
  assert.equal(throwClipId(sim({ spd: 5 }), ev()), 'qb_throw_on_run');
  assert.equal(throwClipId(sim({ spd: 5, col: 0.9 }), ev()), 'qb_off_platform');
  assert.equal(throwClipId(sim(), ev({ airYards: 3 })), 'qb_quick_release');
  assert.equal(throwClipId(sim(), ev()), throwClipId(sim(), ev()), 'deterministic');
  for (const e of [ev(), ev({ ballType: 'LOB' }), { type: 'SNAP' }, { type: 'HANDOFF', from: 'q', to: 'r' }, { type: 'QB_ACTION', id: 'q', action: 'SLIDE' }, { type: 'QB_ACTION', id: 'q', action: 'SCRAMBLE' }, { type: 'QB_ACTION', id: 'q', action: 'ROLL_OUT' }])
    for (const r of clipsForEvent(e, sim())) assert.ok(getClip(r.id), `${e.type} → ${r.id}`);
});
test('actionsFor aligns the release instant with the engine event and keeps the wind-up lead', () => {
  const s = { t: 12, losX: 30, qb: { id: 'q', pos: { x: 25, y: 20 }, vel: { x: 0, y: 0 } }, qbState: {} };
  const [a] = actionsFor({ type: 'PASS_ATTEMPT', passer: 'q', airYards: 10, ballType: 'TOUCH' }, s), c = getClip(a.type.slice(5));
  const pAtEvent = (s.t - a.t0) / a.dur; assert.ok(Math.abs(pAtEvent - (c.ev.release - 0.18)) < 1e-9);
  const later = (s.t + 0.18 * c.dur - a.t0) / a.dur; assert.ok(Math.abs(later - c.ev.release) < 1e-9, 'release reached 0.18 clip-time later');
  assert.ok(a.t0 <= s.t);
});
test('avatars render every clip across the whole timeline in all kits without throwing', () => {
  const ctx = ctxStub();
  for (const c of ALL_CLIPS) for (let k = 0; k <= 10; k++) for (const dir of [1, -1]) A.drawAvatar(ctx, { x: 40.3, y: 70.7, h: 60, opts: A.defaultAvatar('z'), kit: 'football', dir, facing: dir > 0 ? 0 : Math.PI, role: 'qb', action: { type: 'clip:' + c.id, t: k / 10 }, t: k * 0.3, number: 12, color: '#123456', color2: '#ffffff' });
  A.drawAvatar(ctx, { x: 10, y: 10, h: 40, opts: A.defaultAvatar('z'), kit: 'football', moving: true, phase: 12.3, speed: 0.8, t: 1 }); // distance-driven stride phase
});

test('WIRED_CLIPS lists only real clips and covers every clip the mapping can emit', () => {
  for (const id of WIRED_CLIPS) assert.ok(getClip(id), id);
  const sim = (o = {}) => ({ t: 1, losX: 30, qb: { id: 'q', pos: { x: o.near ? 29 : 25, y: 20 }, vel: { x: o.spd || 0, y: 0 } }, qbState: { pocket: { collapse: o.col || 0 } } });
  const used = new Set();
  for (const o of [{}, { col: 0.9 }, { spd: 5 }, { spd: 5, col: 0.9 }, { near: true }]) {
    for (const bt of ['BULLET', 'TOUCH', 'LOB']) for (const ay of [2, 10, 20, 40]) for (const tw of [false, true]) for (const pid of ['a', 'bb', 'ccc', 'q1', 'zz9']) used.add(throwClipId(sim(o), { type: 'PASS_ATTEMPT', passer: pid, airYards: ay, ballType: bt, throwAway: tw, hurried: false }));
    for (const e of [{ type: 'SNAP' }, { type: 'HANDOFF', from: 'q', to: 'r' }, ...['SLIDE', 'SCRAMBLE', 'ROLL_OUT', 'STEP_UP'].map(action => ({ type: 'QB_ACTION', id: 'q', action }))]) for (const r of clipsForEvent(e, sim(o))) used.add(r.id);
  }
  for (const id of used) assert.ok(WIRED_CLIPS.includes(id), `${id} is emitted but not listed in WIRED_CLIPS`);
});

test('animation plan: 4 stages × 25 = 100 distinct catalog entries; stage 1 is exactly the implemented QB batch', () => {
  const plan = JSON.parse(readFileSync(new URL('../docs/anim/plan.json', import.meta.url), 'utf8')), all = Object.values(plan.stages).flat();
  assert.equal(all.length, 100); assert.equal(new Set(all).size, 100, 'no entry planned twice'); assert.equal(plan.total, 100);
  for (const [k, v] of Object.entries(plan.stages)) { assert.equal(v.length, 25, k); for (const n of v) assert.ok(catalog.includes(n), `${k}: "${n}" not in catalog`); }
  assert.deepEqual([...plan.stages['1-qb-passe']].sort(), BATCHES.qb.map(c => c.catalog).sort());
});
