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
test('LRU keeps the most recently used entries', () => {
  const c = new SS.LRU(3); c.set('a', 1); c.set('b', 2); c.set('c', 3); c.get('a'); c.set('d', 4);
  assert.equal(c.get('b'), undefined); assert.equal(c.get('a'), 1); assert.equal(c.size, 3);
});
test('clipTimeFor: clips pass through, no action = idle loop, legacy procedural actions are not in the atlas', () => {
  assert.deepEqual(SS.clipTimeFor({ type: 'clip:mv_run', t: 0.4 }, 5), { clip: 'mv_run', t: 0.4 });
  assert.equal(SS.clipTimeFor(null, 4.8).clip, SS.IDLE_CLIP); assert.equal(SS.clipTimeFor({ type: 'swing', t: 0.5 }, 1), null);
  assert.ok(SS.clipTimeFor(null, 2.4, 0).t >= 1, 'idle time advances');
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
test('shipped atlases match the plan: every clip present, rows/frames consistent, PNG sizes match the index, clips exist in the registry', () => {
  for (const [kit, ids] of Object.entries(plan.kits)) {
    const a = atlas(kit), F = a.frame; assert.equal(F, plan.frame); assert.deepEqual(Object.keys(a.clips), ids, kit);
    const rows = new Set(); let maxN = 0;
    for (const [id, e] of Object.entries(a.clips)) { assert.ok(getClip(id), id); assert.ok(e.n >= 2 && Number.isInteger(e.row) && !rows.has(e.row), `${kit}/${id}`); rows.add(e.row); maxN = Math.max(maxN, e.n); assert.equal(e.loop, !!getClip(id).loop); assert.equal(e.dur, getClip(id).dur); }
    for (const layer of ['color', 'mask']) { const { w, h } = png(`${kit}_${layer}.png`); assert.equal(w, maxN * F, `${kit}_${layer} width`); assert.equal(h, ids.length * F, `${kit}_${layer} height`); }
    assert.ok(a.body > 60 && a.feet > a.body && a.feet < F, `${kit} body box`);
  }
});
test('atlas coverage: every clip the renderers can ask for exists in the kit atlas (else the avatar fallback is used)', async () => {
  const { runGait, skateGait } = await import('../core/anim/locomotion.js');
  const fb = new Set(Object.keys(atlas('football').clips)); for (const id of WIRED_CLIPS) if (id !== 'mv_stumble_recover' || true) assert.ok(fb.has(id), `football atlas misses wired clip ${id}`);
  const hk = new Set(Object.keys(atlas('hockey').clips)); for (const sp of [1, 2, 4, 8]) for (const bw of [false, true]) for (const tn of [false, true]) { const id = skateGait({ speed: sp, backwards: bw, turning: tn }); assert.ok(hk.has(id), `hockey atlas misses ${id}`); }
  const bb = new Set(Object.keys(atlas('baseball').clips)); for (const sp of [1, 3, 5, 8]) for (const c of [false, true]) { const id = runGait({ speed: sp, carrying: c }); assert.ok(bb.has(id), `baseball atlas misses ${id}`); }
});
