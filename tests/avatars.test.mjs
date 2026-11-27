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

test('one-shot actions (swing/throw/shoot/catch/celebrate/dive/check/snap/handoff) render across their whole timeline', () => {
  const ctx = ctxStub();
  for (const type of ['swing', 'throw', 'shoot', 'catch', 'celebrate', 'dive', 'check', 'snap', 'handoff']) for (let k = 0; k <= 10; k++) for (const prop of ['bat', 'stick', 'glove', 'ball', 'none'])
    A.drawAvatar(ctx, { x: 40.3, y: 70.7, h: 60, opts: A.defaultAvatar('z'), kit: 'baseball', prop, action: { type, t: k / 10 }, moving: k % 2 === 0, speed: k / 10, t: k * 0.3 });
});

test('avatar styles: athlete is the default, cartoon stays selectable and both render every kit/pose', () => {
  assert.deepEqual(A.AVATAR_STYLES.map(s => s[0]), ['athlete', 'chibi']);
  assert.equal(A.getAvatarStyle(), 'athlete');
  A.setAvatarStyle('chibi'); assert.equal(A.getAvatarStyle(), 'chibi'); A.setAvatarStyle('athlete'); assert.equal(A.getAvatarStyle(), 'athlete');
  const ctx = ctxStub();
  for (const style of ['athlete', 'chibi']) for (const kit of ['football', 'hockey', 'baseball']) for (const pose of ['stand', 'crouch', 'goalie']) for (const moving of [false, true])
    A.drawAvatar(ctx, { x: 40.3, y: 70.7, h: 60, opts: A.defaultAvatar('s'), style, kit, pose, moving, phase: 1.3, speed: 0.8, t: 1, number: 7, color: '#123456', color2: '#ffffff', dir: -1 });
  A.drawAvatar(ctx, { x: 40, y: 70, h: 12, opts: A.defaultAvatar('tiny'), style: 'athlete', kit: 'football', number: 7 }); // tiny sizes must not throw
});
test('positional physique: linemen heavy, receivers/DBs slim, QB medium; custom avatars keep the user build', () => {
  assert.equal(A.positionBuild('nfl', 'LT'), 2); assert.equal(A.positionBuild('nfl', 'RDE'), 2); assert.equal(A.positionBuild('nfl', 'TE'), 2);
  assert.equal(A.positionBuild('nfl', 'QB'), 1); assert.equal(A.positionBuild('nfl', 'MIKE'), 1);
  assert.equal(A.positionBuild('nfl', 'X'), 0); assert.equal(A.positionBuild('nfl', 'CBL'), 0); assert.equal(A.positionBuild('nfl', 'K'), 0);
  assert.equal(A.positionBuild('nhl', 'LD'), 2); assert.equal(A.positionBuild('nhl', 'C'), null); assert.equal(A.positionBuild('mlb', 'P'), null);
  assert.equal(A.avatarFor('nfl', 'pos-test-1', 'LT').build, 2); assert.equal(A.avatarFor('nfl', 'pos-test-2', 'X').build, 0);
  A.setAvatar('nfl', 'pos-custom', { ...A.defaultAvatar('nfl|pos-custom'), build: 1 }); assert.equal(A.avatarFor('nfl', 'pos-custom', 'LT').build, 1, 'user choice wins');
});

test('fatigue pip: only below 50 % energy, scales with energy, amber to red, and never for unknown energy', async () => {
  const { fatigueLevel, drawFatigue } = await import('../core/render/sprites.js');
  assert.equal(fatigueLevel(1), null); assert.equal(fatigueLevel(0.5), null); assert.equal(fatigueLevel(undefined), null); assert.equal(fatigueLevel(null), null); assert.equal(fatigueLevel('x'), null);
  assert.equal(fatigueLevel(0.25), 0.5); assert.equal(fatigueLevel(0), 0); assert.equal(fatigueLevel(-3), 0);
  const calls = []; const ctx = new Proxy({}, { get: (_, k) => (...a) => { calls.push([k, a]); }, set: (_, k, v) => { calls.push(['set:' + k, v]); return true; } });
  assert.equal(drawFatigue(ctx, 10, 10, 12, 0.9), false); assert.equal(calls.length, 0);
  assert.equal(drawFatigue(ctx, 10, 10, 12, 0.1), true); const rects = calls.filter(c => c[0] === 'fillRect'); assert.equal(rects.length, 2);
  assert.ok(rects[1][1][2] < rects[0][1][2], 'bar shorter than its track');
});
