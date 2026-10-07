import test from 'node:test';
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const A = await import('../core/render/avatars.js');

const ctxStub = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (t[k] ?? (() => {})) ), set: (t, k, v) => { t[k] = v; return true; } });

test('defaults are deterministic, in range and varied', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const a = A.defaultAvatar(`mlb|${i}`), b = A.defaultAvatar(`mlb|${i}`);
    assert.deepEqual(a, b);
    assert.ok(a.skin >= 0 && a.skin < A.SKINS.length && a.hairStyle >= 0 && a.hairStyle < A.HAIR_STYLES.length && a.hairColor >= 0 && a.hairColor < A.HAIR_COLORS.length);
    assert.ok(a.beard >= 0 && a.beard < A.BEARDS.length && a.accessory >= 0 && a.accessory < A.ACCESSORIES.length && a.build >= 0 && a.build < A.BUILDS.length);
    seen.add(JSON.stringify(a));
  }
  assert.ok(seen.size > 150, 'avatars should look different');
});
test('custom avatar persists per sport + id and can be reset', () => {
  const def = A.getAvatar('nhl', 8478402);
  A.setAvatar('nhl', 8478402, { ...def, skin: 5, hairStyle: 4 });
  assert.equal(A.getAvatar('nhl', 8478402).skin, 5);
  assert.equal(A.getAvatar('mlb', 8478402).skin, A.defaultAvatar('mlb|8478402').skin);
  assert.ok(A.hasCustomAvatar('nhl', 8478402));
  A.resetAvatar('nhl', 8478402);
  assert.equal(A.hasCustomAvatar('nhl', 8478402), false);
});
test('visual mode defaults to avatar and round-trips', () => {
  assert.equal(A.getVisualMode(), 'avatar');
  A.setVisualMode('photo'); assert.equal(A.getVisualMode(), 'photo');
  A.setVisualMode('plain'); assert.equal(A.getVisualMode(), 'plain');
});
test('drawAvatar renders every option / kit / prop / pose without throwing', () => {
  const ctx = ctxStub();
  for (const kit of ['baseball', 'hockey', 'football']) for (const prop of ['bat', 'stick', 'glove', 'ball', 'none']) for (const pose of ['stand', 'crouch', 'goalie']) for (const role of ['batter', 'runner', 'goalie', 'player']) {
    for (let i = 0; i < 6; i++) A.drawAvatar(ctx, { x: 50, y: 80, h: 30 + i * 12, opts: A.randomAvatar(() => (i * 0.37 + 0.11) % 1), kit, prop, pose, role, color: '#12345a', color2: '#ffffff', number: 12, moving: i % 2 === 0, t: i, facing: i % 3 ? 0 : Math.PI });
  }
});
