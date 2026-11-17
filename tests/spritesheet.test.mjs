// Sprite-sheet mode: pure helpers (frame choice, team tint, cache) + integrity of the shipped atlases (assets/sprites).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const SS = await import('../core/render/spriteSheet.js');
const { VISUAL_MODES, isAvatarMode, getVisualMode, setVisualMode } = await import('../core/render/avatars.js');
const { getClip } = await import('../core/anim/registry.js');
const { WIRED_CLIPS } = await import('../nfl/src/ui/animationMap.js');
const plan = JSON.parse(readFileSync(new URL('../tools/blender/atlas_plan.json', import.meta.url), 'utf8'));
const png = f => { const b = readFileSync(new URL('../assets/sprites/' + f, import.meta.url)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const atlas = k => JSON.parse(readFileSync(new URL(`../assets/sprites/${k}.json`, import.meta.url), 'utf8'));

test('frameFor: loops wrap (phase may exceed 1), one-shots clamp, missing clip → -1', () => {
  const loop = { n: 10, loop: true }, shot = { n: 10, loop: false };
  assert.equal(SS.frameFor(loop, 0), 0); assert.equal(SS.frameFor(loop, 0.55), 5); assert.equal(SS.frameFor(loop, 3.25), 2); assert.equal(SS.frameFor(loop, -0.1), 9);
  assert.equal(SS.frameFor(shot, 0), 0); assert.equal(SS.frameFor(shot, 0.5), 5); assert.equal(SS.frameFor(shot, 1), 9); assert.equal(SS.frameFor(shot, 7), 9); assert.equal(SS.frameFor(shot, -3), 0);
  assert.equal(SS.frameFor(null, 0.5), -1); assert.equal(SS.frameFor(loop, NaN), 0);
});
test('tintPixels: jersey(R) and pants(G) take the team colour, unmasked pixels keep theirs, alpha is untouched', () => {
  const base = new Uint8ClampedArray([200, 200, 200, 255, 200, 200, 200, 255, 200, 200, 200, 255, 90, 60, 40, 128]);
  const mask = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 0, 0, 0, 128]);
  const out = SS.tintPixels(base, mask, [10, 40, 110], [255, 255, 255]);
  assert.deepEqual([...out.slice(0, 4)], [Math.round(200 * 10 / 255), Math.round(200 * 40 / 255), Math.round(200 * 110 / 255), 255].map((v, i) => i < 3 ? out[i] : 255));
  assert.ok(out[0] < 10 && out[2] > out[0], 'navy jersey'); assert.deepEqual([...out.slice(4, 7)], [200, 200, 200]); assert.deepEqual([...out.slice(8, 12)], [200, 200, 200, 255]); assert.deepEqual([...out.slice(12, 16)], [90, 60, 40, 128]);
});
test('tintPixels: accent(B) channel takes the secondary colour; old masks without B still tint as before', () => {
  const base = new Uint8ClampedArray([200, 200, 200, 255, 200, 200, 200, 255]), mask = new Uint8ClampedArray([0, 0, 255, 255, 255, 0, 0, 255]);
  const out = SS.tintPixels(base, mask, [10, 40, 110], [255, 255, 255], [255, 0, 0]);
  assert.deepEqual([...out.slice(0, 3)], [200, 0, 0]); assert.ok(out[4] < 10 && out[6] > out[4]);
  assert.deepEqual([...SS.tintPixels(base, new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]), [1, 2, 3], [4, 5, 6]).slice(0, 3)], [200, 200, 200]);
});
test('LRU keeps the most recently used entries', () => {
  const c = new SS.LRU(3); c.set('a', 1); c.set('b', 2); c.set('c', 3); c.get('a'); c.set('d', 4);
  assert.equal(c.get('b'), undefined); assert.equal(c.get('a'), 1); assert.equal(c.size, 3);
});
test('dirFor: 5 atlas directions (E, SE, S, NE, N) + mirror for the left half; single-direction pages only mirror', () => {
  const deg = a => a * Math.PI / 180;
  assert.deepEqual(SS.dirFor(deg(0), 5), { d: 0, flip: false }); assert.deepEqual(SS.dirFor(deg(45), 5), { d: 1, flip: false }); assert.deepEqual(SS.dirFor(deg(90), 5), { d: 2, flip: false });
  assert.deepEqual(SS.dirFor(deg(-45), 5), { d: 3, flip: false }); assert.deepEqual(SS.dirFor(deg(-90), 5), { d: 4, flip: false });
  assert.deepEqual(SS.dirFor(deg(180), 5), { d: 0, flip: true }); assert.deepEqual(SS.dirFor(deg(135), 5), { d: 1, flip: true }); assert.deepEqual(SS.dirFor(deg(-135), 5), { d: 3, flip: true });
  assert.deepEqual(SS.dirFor(deg(-100), 5), { d: 4, flip: true }); // facing slightly left of straight up = N mirrored
  assert.deepEqual(SS.dirFor(deg(170), 1), { d: 0, flip: true }); assert.deepEqual(SS.dirFor(deg(10), 1), { d: 0, flip: false });
  const seen = new Set(); for (let a = -180; a < 180; a += 5) { const r = SS.dirFor(deg(a), 5); assert.ok(r.d >= 0 && r.d < 5); seen.add(r.d + (r.flip ? 'f' : '')); }
  assert.ok(seen.size >= 8, 'all 8 screen directions are reachable (5 rendered + 3 mirrored)');
});
test('resolveSheet: roles pick the right atlas and clip; legacy actions are translated; procedural-only actions fall back', () => {
  SS.setSheetHd(false);   // these checks are about the base kits; HD mapping has its own test below
  const R = (o, now = 0) => SS.resolveSheet({ kit: 'football', role: 'player', seed: 1, ...o }, now);
  assert.deepEqual(R({ action: { type: 'clip:mv_run', t: 0.3 } }), { kit: 'football', clip: 'mv_run', t: 0.3 });
  assert.equal(R({}).clip, 'mv_idle'); assert.equal(R({ role: 'ref', action: { type: 'clip:rf_holding', t: 0.5 } }).kit, 'ref');
  assert.equal(R({ kit: 'hockey', role: 'goalie', goalieState: 'BUTTERFLY' }).clip, 'gk_butterfly'); assert.equal(R({ kit: 'hockey', role: 'goalie', goalieState: 'BUTTERFLY' }).kit, 'hockey_goalie');
  assert.equal(R({ kit: 'hockey', role: 'goalie' }).clip, 'gk_ready'); assert.equal(R({ kit: 'hockey', role: 'skater' }).clip, 'hk_glide');
  assert.equal(R({ kit: 'hockey', role: 'skater', action: { type: 'shoot', t: 0.2, shot: 'slap' } }).clip, 'hk_slap'); assert.equal(R({ kit: 'hockey', action: { type: 'shoot', t: 0.2, shot: 'one-timer' } }).clip, 'hk_onetimer');
  assert.equal(R({ kit: 'hockey', action: { type: 'check', t: 0.5 } }).clip, 'hk_check');
  const bat = R({ kit: 'baseball', role: 'batter' }); assert.equal(bat.kit, 'baseball_bat'); assert.equal(bat.clip, 'bb_stance'); assert.equal(R({ kit: 'baseball', role: 'batter', action: { type: 'swing', t: 0.5 } }).clip, 'bb_swing');
  assert.equal(R({ kit: 'baseball', role: 'pitcher', action: { type: 'throw', t: 0.5 } }).clip, 'bb_pitch'); assert.equal(R({ kit: 'baseball', role: 'fielder', action: { type: 'throw', t: 0.5 } }).clip, 'qb_overhand');
  assert.equal(R({ kit: 'baseball', role: 'catcher' }).clip, 'bb_catcher_crouch'); assert.equal(R({ kit: 'baseball', pose: 'crouch' }).clip, 'bb_catcher_crouch');
  assert.equal(R({ action: { type: 'snap', t: 0.5 } }), null, 'no clip for a procedural-only action');
});
test('colour helpers: hex, short hex, rgb() and kit pants colours', () => {
  assert.deepEqual(SS.parseColor('#0a2870'), [10, 40, 112]); assert.deepEqual(SS.parseColor('#fff'), [255, 255, 255]); assert.deepEqual(SS.parseColor('rgb(10, 20, 30)'), [10, 20, 30]);
  assert.equal(SS.pantsColorFor('baseball', '#123456', '#ffffff'), '#dfe5ec'); assert.equal(SS.pantsColorFor('football', '#123456', '#ffffff'), '#e9edf2'); assert.equal(SS.pantsColorFor('football', '#123456', '#ff0000'), '#ff0000');
  assert.deepEqual(SS.parseColor(SS.pantsColorFor('hockey', '#c8c8c8', '#fff')), [124, 124, 124]);
});
test('visual modes: "Sprites 3D" is selectable, persisted and counts as an avatar mode', () => {
  assert.ok(VISUAL_MODES.some(([k]) => k === 'sheet')); assert.ok(isAvatarMode('sheet') && isAvatarMode('avatar') && !isAvatarMode('photo'));
  assert.equal(getVisualMode(), 'avatar'); setVisualMode('sheet'); assert.equal(getVisualMode(), 'sheet'); setVisualMode('avatar');
});
test('shipped atlases match the plan: kits, pages, clips, rows/frames, PNG sizes (<= 4096 px tall), registry membership', () => {
  assert.deepEqual(Object.keys(plan.kits).sort(), ['baseball', 'baseball_bat', 'football', 'football_hd', 'hockey', 'hockey_goalie', 'hockey_hd', 'ref']);
  for (const [kit, spec] of Object.entries(plan.kits)) {
    const a = atlas(kit), F = a.frame; assert.equal(F, plan.frame); assert.equal(a.pages.length, spec.pages.length, kit);
    const all = spec.pages.flatMap(p => p.clips); assert.deepEqual(Object.keys(a.clips).sort(), [...all].sort(), kit);
    spec.pages.forEach((pg, pi) => {
      const pageClips = Object.entries(a.clips).filter(([, e]) => e.page === pi), rowsUsed = pg.clips.length * pg.dirs, maxN = Math.max(...pageClips.map(([, e]) => e.n));
      assert.equal(a.pages[pi].dirs, pg.dirs); assert.equal(pageClips.length, pg.clips.length);
      pg.clips.forEach((id, ci) => { const e = a.clips[id]; assert.equal(e.row, ci * pg.dirs, `${kit}/${id} row`); assert.equal(e.dirs, pg.dirs); assert.ok(e.n >= 2 && getClip(id), `${kit}/${id}`); assert.equal(e.loop, !!getClip(id).loop); assert.equal(e.dur, getClip(id).dur); });
      for (const layer of ['color', 'mask']) { const { w, h } = png(`${kit}_${pg.name}_${layer}.png`); assert.equal(w, maxN * F, `${kit}/${pg.name} ${layer} width`); assert.equal(h, rowsUsed * F, `${kit}/${pg.name} ${layer} height`); assert.ok(h <= 4096, 'mobile texture limit'); }
    });
    assert.ok(a.body > 60 && a.feet > a.body && a.feet < F, `${kit} body box`);
  }
});
test('atlas coverage: every clip the renderers can ask for exists in the right kit atlas (else the avatar fallback is used)', async () => {
  const { runGait, skateGait } = await import('../core/anim/locomotion.js');
  const has = (kit, id) => !!atlas(kit).clips[id];
  for (const id of WIRED_CLIPS) assert.ok(has('football', id), `football atlas misses wired clip ${id}`);
  for (const sp of [1, 2, 4, 8]) for (const bw of [false, true]) for (const tn of [false, true]) { const id = skateGait({ speed: sp, backwards: bw, turning: tn }); assert.ok(has('hockey', id), `hockey atlas misses ${id}`); assert.equal(atlas('hockey').clips[id].dirs, 5, 'skating has 5 directions'); }
  for (const sp of [1, 3, 5, 8]) for (const c of [false, true]) { const id = runGait({ speed: sp, carrying: c }); assert.ok(has('baseball', id), `baseball atlas misses ${id}`); assert.equal(atlas('baseball').clips[id].dirs, 5); }
  for (const id of ['gk_ready', 'gk_butterfly', 'gk_slide', 'gk_glove', 'gk_blocker', 'gk_pad_save', 'gk_recover']) assert.ok(has('hockey_goalie', id), id);
  for (const id of ['hk_wrist', 'hk_snap', 'hk_slap', 'hk_backhand', 'hk_onetimer', 'hk_check', 'gs_arms_up']) assert.ok(has('hockey', id), id);
  for (const id of ['bb_stance', 'bb_swing']) assert.ok(has('baseball_bat', id), id);
  for (const id of ['bb_pitch', 'bb_field_ground', 'bb_catcher_crouch', 'qb_overhand', 'ps_catch_diving']) assert.ok(has('baseball', id), id);
  const { FOUL_KEYS, FOULS } = await import('../nfl/src/ui/penalties.js'); for (const k of FOUL_KEYS) assert.ok(has('ref', FOULS[k].ref), `ref atlas misses ${FOULS[k].ref}`); assert.ok(has('ref', 'rf_flag_throw'));
  // every legacy action the three renderers emit resolves to a clip that exists in the atlas it resolves to (or to null)
  const combos = [['football', 'player', 'catch'], ['football', 'player', 'celebrate'], ['football', 'player', 'dive'], ['football', 'player', 'check'], ['hockey', 'skater', 'check'], ['hockey', 'skater', 'celebrate'], ['baseball', 'fielder', 'swing'], ['baseball', 'batter', 'swing'], ['baseball', 'pitcher', 'throw'], ['baseball', 'fielder', 'celebrate'], ['baseball', 'fielder', 'dive'], ['baseball', 'fielder', 'catch']];
  for (const [kit, role, type] of combos) { const r = SS.resolveSheet({ kit, role, action: { type, t: 0.5 } }); if (r) assert.ok(has(r.kit, r.clip), `${kit}/${role}/${type} → ${r.kit}:${r.clip} not in atlas`); }
  for (const shot of ['wrist', 'snap', 'slap', 'backhand', 'one-timer']) { const r = SS.resolveSheet({ kit: 'hockey', role: 'skater', action: { type: 'shoot', t: 0.5, shot } }); assert.ok(has(r.kit, r.clip), shot); }
});

test('fadeStep: cross-fades only when the clip changes, over FADE seconds, then settles', () => {
  const st = {}, A = { kit: 'football', clip: 'idle', img: 'A' }, B = { kit: 'football', clip: 'run', img: 'B' };
  assert.deepEqual(SS.fadeStep(st, A, 10), { from: null, k: 1 });                 // first draw: nothing to fade from
  assert.deepEqual(SS.fadeStep(st, { ...A, img: 'A2' }, 10.1), { from: null, k: 1 }); // same clip: no fade
  const r1 = SS.fadeStep(st, B, 10.2); assert.equal(r1.k, 0); assert.equal(r1.from.img, 'A2');
  const r2 = SS.fadeStep(st, B, 10.2 + SS.FADE / 2); assert.ok(r2.k > 0.45 && r2.k < 0.55); assert.ok(r2.from);
  const r3 = SS.fadeStep(st, B, 10.2 + SS.FADE + 0.01); assert.equal(r3.k, 1); assert.equal(r3.from, null);
  const r4 = SS.fadeStep(st, A, 11); assert.equal(r4.k, 0); assert.equal(r4.from.clip, 'run');   // switching back fades again
});

test('HD kits: mapping covers football/hockey only; kitFor picks HD when enabled, low-poly when off or when the HD atlas failed to load', async () => {
  assert.deepEqual({ ...SS.HD_KITS }, { football: 'football_hd', hockey: 'hockey_hd' });
  assert.equal(SS.kitFor('baseball'), 'baseball'); assert.equal(SS.kitFor('hockey_goalie'), 'hockey_goalie'); assert.equal(SS.kitFor('ref'), 'ref');
  SS.setSheetHd(false); assert.equal(SS.kitFor('football'), 'football'); assert.equal(SS.kitFor('hockey'), 'hockey');
  SS.setSheetHd(true); assert.equal(SS.kitFor('football'), 'football_hd');             // first ask: chosen and loading
  await new Promise(r => setTimeout(r, 50));                                           // in Node the atlas cannot load -> state 'error' -> falls back
  assert.equal(SS.kitFor('football'), 'football'); assert.equal(SS.resolveSheet({ kit: 'football', role: 'player' }, 0).kit, 'football');
  assert.equal(SS.resolveSheet({ kit: 'hockey', role: 'goalie', goalieState: 'READY' }, 0).kit, 'hockey_goalie');
  assert.equal(SS.resolveSheet({ kit: 'hockey', role: 'skater', action: { type: 'shoot', shot: 'slap', t: 0.2 } }, 0).clip, 'hk_slap');   // logic stays keyed on the base kit
  SS.setSheetHd(false);
});
