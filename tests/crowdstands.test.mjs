import test from 'node:test'; import assert from 'node:assert/strict';
import { rinkStands, arcStands, S_RINK, S_PARK } from '../core/render3d/crowdStands.js';
test('rink stands: far side + ends only, nobody on the ice or on the near side, deterministic', () => {
  const a = rinkStands(), b = rinkStands(); assert.equal(a.seats.length, b.seats.length); assert.ok(a.seats.length > 1000 && a.seats.length < 20000);
  assert.ok(a.seats.every(s => !(s.x >= 0 && s.x <= 60.96 && s.z <= 0 && s.z >= -25.908)), 'inside the rink');
  assert.ok(a.seats.every(s => s.z <= 0.5), 'near side (z>0, where the camera stands) is open');
  assert.equal(a.slabs.length, S_RINK.rows * 3); assert.ok(rinkStands(60.96, 25.9, S_RINK, 0.5).seats.length < a.seats.length * 0.6);
});
test('ballpark arc stands: behind the fence (never in fair or warning-track ground), rows rise outward', () => {
  const a = arcStands(); assert.ok(a.seats.length > 2000 && a.seats.length < 30000); assert.equal(a.slabs.length, S_PARK.rows * 40);
  const FT = 0.3048; for (const s of a.seats) { const d = Math.hypot(s.x / FT, -s.z / FT); assert.ok(d > 330 - 1 && -s.z >= 0, `seat at ${d.toFixed(0)} ft`); }
  const lo = a.seats.filter(s => s.y < 2), hi = a.seats.filter(s => s.y > 8), avg = L => L.reduce((t, s) => t + Math.hypot(s.x, s.z), 0) / L.length; assert.ok(avg(hi) > avg(lo));
});
