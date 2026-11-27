import test from 'node:test'; import assert from 'node:assert/strict';
import { latheData, footballProfile, puckProfile, plateData, netData } from '../core/render3d/props.js';
test('football profile: 0.28 m long, pointed ends, white stripes near both ends', () => {
  const p = footballProfile(); assert.ok(Math.abs(p[p.length - 1].a - p[0].a - 0.28) < 1e-9); assert.ok(p[0].r < 0.01 && p.at(-1).r < 0.01);
  assert.ok(Math.max(...p.map(q => q.r)) <= 0.0851); const w = p.filter(q => q.c[0] > 200); assert.ok(w.some(q => q.a < 0) && w.some(q => q.a > 0));
});
test('lathe: consistent vertex / colour / index counts, valid indices, unit normals', () => {
  const d = latheData(footballProfile(), 12, 'x'), nv = d.P.length / 3; assert.equal(d.C.length, nv * 4); assert.equal(d.N.length, d.P.length); assert.ok(d.I.every(i => i < nv)); assert.equal(d.I.length % 3, 0);
  for (let i = 0; i < d.N.length; i += 3) assert.ok(Math.abs(Math.hypot(d.N[i], d.N[i + 1], d.N[i + 2]) - 1) < 1e-4);
});
test('puck profile spans one unit tall and is narrower than 1 (scaled to 20 x 5 cm by the caller)', () => { const p = puckProfile(); assert.equal(p[0].a, -0.5); assert.equal(p.at(-1).a, 0.5); assert.ok(Math.max(...p.map(q => q.r)) <= 0.5); });
test('home plate is a pentagon: 17 in front edge toward the pitcher, point toward the catcher, normals up/side', () => {
  const d = plateData(0.03), xs = []; for (let i = 0; i < d.P.length; i += 3) xs.push([d.P[i], d.P[i + 2]]);
  assert.ok(Math.abs(Math.max(...xs.map(a => a[0])) - 0.216) < 1e-6); assert.ok(xs.some(a => Math.abs(a[1] - 0.216) < 1e-6 && Math.abs(a[0]) < 1e-9)); assert.ok(xs.every(a => a[1] >= -0.2161)); assert.ok(d.I.every(i => i < d.P.length / 3));
});
test('hockey net: 4 panels, back narrower than the mouth, extends toward the boards (dir)', () => {
  for (const dir of [-1, 1]) { const n = netData(0.9, 1.22, 1, dir), xs = []; for (let i = 0; i < n.P.length; i += 3) xs.push(n.P[i]); assert.equal(n.P.length / 3, 16); assert.ok(dir > 0 ? Math.max(...xs) === 1 : Math.min(...xs) === -1); assert.equal(n.UV.length / 2, 16); assert.ok(n.I.every(i => i < 16)); }
});
