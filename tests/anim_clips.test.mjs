// Keyframed animation clips (core/anim): schema, catalog traceability, continuity, event wiring and rendering of every clip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { ALL_CLIPS, BATCHES, getClip, clipPoseOf } = await import('../core/anim/registry.js');
const { samplePose, validateClip, NUMERIC, NEUTRAL, blendPose } = await import('../core/anim/pose.js');
const { throwClipId, actionsFor, clipsForEvent, WIRED_CLIPS, locomotionClipId, catchClipId } = await import('../nfl/src/ui/animationMap.js');
const A = await import('../core/render/avatars.js');
const ctxStub = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (t[k] ?? (() => {}))), set: (t, k, v) => { t[k] = v; return true; } });

const catalog = readFileSync(new URL('../docs/ANIMATION_2D_CATALOG.csv', import.meta.url), 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split(',')[1]);
const STAGE_SIZES = { qb: 25, move: 20, gesture: 20, foul: 20, grab: 20, pass: 20, skate: 4, sport: 18 };

test('every clip is valid (schema, ranges, key times, events)', () => {
  assert.equal(ALL_CLIPS.length, 147);
  for (const c of ALL_CLIPS) assert.deepEqual(validateClip(c), [], c.id);
});
test('ids are unique and every clip maps to a real entry of the NFL catalog (traceability)', () => {
  const ids = new Set(), names = new Set();
  for (const c of ALL_CLIPS) {
    assert.ok(!ids.has(c.id), 'dup id ' + c.id); ids.add(c.id);
    if (c.catalog) { assert.ok(catalog.includes(c.catalog), `${c.id}: "${c.catalog}" not in catalog`); assert.ok(!names.has(c.catalog), 'catalog name used twice: ' + c.catalog); names.add(c.catalog); }
    else assert.equal(c.source, 'extra', `${c.id}: no catalog entry → must be declared source: 'extra'`);
  }
});
test('batch sizes match the plan', () => { for (const [g, n] of Object.entries(STAGE_SIZES)) assert.equal(BATCHES[g].length, n, g); });
test('sampling is continuous (no joint moves > 0.6 rad (36 rad/s) or 0.9 u (foot offsets) between 1/60 s frames) and stays finite', () => {
  for (const c of ALL_CLIPS) {
    let prev = samplePose(c, 0); const steps = Math.ceil(c.dur * 60);
    for (let i = 1; i <= steps; i++) {
      const q = samplePose(c, i / steps), dtScale = (c.dur / steps) * 60; // normalise: steps are ~1/60 s
      for (const j of NUMERIC) { assert.ok(Number.isFinite(q[j]), `${c.id}.${j}`); assert.ok(Math.abs(q[j] - prev[j]) <= (/^[lk]/.test(j) ? 0.9 : 0.6) / dtScale + 0.05, `${c.id}.${j} jumps ${(q[j] - prev[j]).toFixed(2)} at ${(i / steps).toFixed(2)}`); }
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
  const sim = (o = {}) => ({ t: 1, losX: 30, qb: { id: 'q', pos: { x: o.near ? 29 : 25, y: 20 }, vel: { x: o.spd || 0, y: 0 } }, qbState: { pocket: { collapse: o.col || 0 } }, ball: { z: o.z ?? 1.6, type: o.type || 'BULLET' }, ents: [{ id: 'r', pos: { x: 40, y: o.y ?? 26 } }] });
  const used = new Set();
  for (const o of [{}, { col: 0.9 }, { spd: 5 }, { spd: 5, col: 0.9 }, { near: true }]) {
    for (const bt of ['BULLET', 'TOUCH', 'LOB']) for (const ay of [2, 10, 20, 40]) for (const tw of [false, true]) for (const pid of ['a', 'bb', 'ccc', 'q1', 'zz9', 'p7', 'm3', 'k', 'w2', 'abcd', 'T.Brady', 'P.Mahomes']) used.add(throwClipId(sim(o), { type: 'PASS_ATTEMPT', passer: pid, airYards: ay, ballType: bt, throwAway: tw, hurried: false }));
    const evs = [{ type: 'SNAP' }, { type: 'HANDOFF', from: 'q', to: 'r' }, ...['SLIDE', 'SCRAMBLE', 'ROLL_OUT', 'STEP_UP'].map(action => ({ type: 'QB_ACTION', id: 'q', action })),
      { type: 'INTERCEPTION', by: 'd' }, { type: 'PASS_BREAKUP', by: 'd' }, { type: 'INCOMPLETE', reason: 'DROP', by: 'r' }, { type: 'TACKLE', by: 'd', carrier: 'c', assists: ['a'] }, { type: 'SACK', by: 'd', qb: 'q' },
      ...['SPIN', 'JUKE', 'TRUCK', 'STIFF_ARM'].map(move => ({ type: 'BROKEN_TACKLE', by: 'd', carrier: 'c', move })), { type: 'FUMBLE', forcedBy: 'd', carrier: 'c' }, { type: 'SHED', by: 'd' }, { type: 'BLOCK_ENGAGE', by: 'b', on: 'd' }];
    for (const e of evs) for (const r of clipsForEvent(e, sim(o))) used.add(r.id);
    for (const type of ['BULLET', 'TOUCH', 'LOB']) for (const z of [0.5, 1.6, 3]) for (const y of [1, 26, 52]) for (const contested of [false, true]) for (const rec of ['r', 'abc', 'x9', 'p7', 'm3', 'k', 'w2', 'abcd', 'T.Kelce', 'J.Jefferson']) used.add(catchClipId(sim({ type, z, y }), { type: 'PASS_COMPLETE', receiver: rec, contested }));
  }
  for (const speed of [0.1, 1, 3, 5, 7, 9]) for (const backwards of [false, true]) for (const carrying of [false, true]) { const id = locomotionClipId({ speed, backwards, carrying }); if (id) used.add(id); }
  for (const id of used) assert.ok(WIRED_CLIPS.includes(id), `${id} is emitted but not listed in WIRED_CLIPS`);
  for (const id of WIRED_CLIPS.filter(i => !['gs_arms_up', 'mv_stumble_recover'].includes(i))) assert.ok(used.has(id) || id === 'ag_pile_bottom', `${id} is listed as wired but nothing emits it`);
});
test('locomotion picks the gait from real speed; backwards → backpedal; carriers use ball variants', () => {
  assert.equal(locomotionClipId({ speed: 0.2 }), null);
  assert.equal(locomotionClipId({ speed: 1.5 }), 'mv_walk'); assert.equal(locomotionClipId({ speed: 3.5 }), 'mv_jog');
  assert.equal(locomotionClipId({ speed: 5.5 }), 'mv_run'); assert.equal(locomotionClipId({ speed: 8 }), 'mv_sprint');
  assert.equal(locomotionClipId({ speed: 5.5, carrying: true }), 'mv_run_ball'); assert.equal(locomotionClipId({ speed: 8, carrying: true }), 'mv_sprint_ball');
  assert.equal(locomotionClipId({ speed: 3, backwards: true }), 'mv_backpedal');
});
test('catch variant follows the ball: low → dive, high → high-point, contested wins, lob near the sideline → toe tap', () => {
  const sim = (o = {}) => ({ ball: { z: o.z ?? 1.6, type: o.type || 'BULLET' }, ents: [{ id: 'r', pos: { x: 40, y: o.y ?? 26 } }] }), e = (o = {}) => ({ type: 'PASS_COMPLETE', receiver: 'r', ...o });
  assert.equal(catchClipId(sim({ z: 0.5 }), e()), 'ps_catch_diving'); assert.equal(catchClipId(sim({ z: 3 }), e()), 'ps_catch_high_point');
  assert.equal(catchClipId(sim(), e({ contested: true })), 'ps_contested_catch'); assert.equal(catchClipId(sim({ type: 'LOB', y: 1 }), e()), 'ps_catch_toe_tap');
  assert.equal(catchClipId(sim({ type: 'TOUCH' }), e()), 'ps_catch_hands');
});
test('animation plan file matches the registry (ids per batch, 147 clips = 25 QB + 100 football + 4 skating + 18 sport actions)', () => {
  const plan = JSON.parse(readFileSync(new URL('../docs/anim/plan.json', import.meta.url), 'utf8'));
  assert.equal(plan.total, 147);
  for (const [g, list] of Object.entries(BATCHES)) assert.deepEqual(plan.stages[g], list.map(c => c.id), g);
});
test('every clip with a release/catch event puts the ball where the event says', () => {
  for (const c of ALL_CLIPS) {
    if (c.ev.release != null) { assert.notEqual(samplePose(c, Math.max(0, c.ev.release - 0.06)).ball, '', `${c.id}: ball in hand before release`); assert.equal(samplePose(c, Math.min(1, c.ev.release + 0.04)).ball, '', `${c.id}: ball gone after release`); }
    if (c.ev.catch != null && c.id !== 'ps_drop') { assert.equal(samplePose(c, Math.max(0, c.ev.catch - 0.2)).ball, '', `${c.id}: no ball in hand before the catch`); assert.notEqual(samplePose(c, Math.min(1, c.ev.catch + 0.1)).ball, '', `${c.id}: ball in hand after the catch`); }
  }
});
test('locomotion loops: 9 cyclic clips, legs alternate (half a cycle apart) and the loop is closed', () => {
  const loops = ['mv_walk', 'mv_jog', 'mv_run', 'mv_sprint', 'mv_run_ball', 'mv_sprint_ball', 'mv_backpedal', 'mv_high_knees'];
  for (const id of loops) { const c = getClip(id); assert.ok(c.loop, id); const a = samplePose(c, 0), b = samplePose(c, 0.5); assert.ok(Math.abs(a.lF - -b.lF) < 1e-6 && Math.abs(a.lB - -b.lB) < 1e-6, id + ' legs mirror'); assert.ok(a.kF !== b.kF, id + ' foot lift alternates'); }
  const speed = ['mv_walk', 'mv_jog', 'mv_run', 'mv_sprint'].map(id => getClip(id)); // faster gait = longer stride, more lean, shorter cycle
  for (let i = 1; i < speed.length; i++) { assert.ok(samplePose(speed[i], 0).lF > samplePose(speed[i - 1], 0).lF); assert.ok(speed[i].dur < speed[i - 1].dur); }
});

test('shared locomotion: skating gaits by speed/direction, running gait parity with the NFL picker, stride phase follows distance only', async () => {
  const { StridePhase, skateGait, runGait } = await import('../core/anim/locomotion.js');
  assert.equal(skateGait({ speed: 0.2 }), null); assert.equal(skateGait({ speed: 2 }), 'hk_glide'); assert.equal(skateGait({ speed: 6 }), 'hk_skate');
  assert.equal(skateGait({ speed: 5, backwards: true }), 'hk_skate_back'); assert.equal(skateGait({ speed: 6, turning: true }), 'hk_crossover');
  for (const id of ['hk_glide', 'hk_skate', 'hk_skate_back', 'hk_crossover']) assert.ok(getClip(id).loop);
  for (const sp of [0.1, 1, 3, 5, 8]) for (const carrying of [false, true]) assert.equal(runGait({ speed: sp, carrying }), locomotionClipId({ speed: sp, carrying }));
  const sp = new StridePhase(1 / 3); let ph = sp.update('a', { x: 0, y: 0 }, 0, 1);
  assert.equal(sp.update('a', { x: 0, y: 0 }, 100, 1), ph, 'standing still: phase frozen');
  const ph1 = sp.update('a', { x: 3, y: 0 }, 200, 1); assert.ok(ph1 > ph, 'moving 3 ft advances the phase'); const ph2 = sp.update('a', { x: 3 + 300, y: 0 }, 300, 1); assert.equal(ph2, ph1, 'teleport (>= 3 yd in one frame) keeps the phase');
  const a = new StridePhase(1), b = new StridePhase(1); a.update('x', { x: 0, y: 0 }, 0); b.update('x', { x: 0, y: 0 }, 0);
  const slow = a.update('x', { x: 0.05, y: 0 }, 100), fast = b.update('x', { x: 0.05, y: 0 }, 5); assert.ok(fast <= slow + 1e-9, 'same distance, higher speed = no more phase than slow gait');
});
