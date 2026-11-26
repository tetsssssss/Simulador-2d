// Quick-result calibration of the career league sim (core/career/league.js quickResult): NHL overtime rate with tieBoost.
import test from 'node:test';
import assert from 'node:assert/strict';
const { quickResult } = await import('../core/career/league.js');
const RNG = await import('../core/rng/rng.js');
const run = (scoring, n = 20000) => { const rng = RNG.createRng(12345), spec = { homeAdvantage: 2, scoring }; let ot = 0, goals = 0; for (let i = 0; i < n; i++) { const r = quickResult(spec, 80 + (i % 7), 80 + (i % 5), rng); if (r.ot) ot++; goals += r.hs + r.as - (r.ot ? 1 : 0); assert.ok(r.hs !== r.as); } return { ot: ot / n, goals: goals / n }; };
test('NHL quick results: tieBoost brings OT/SO near the real ~23 % without changing regulation goals', () => {
  const base = { kind: 'poisson', mean: 3.05, k: 0.018, ties: false, otLoss: true, otAdds: 1 };
  const a = run(base), b = run({ ...base, tieBoost: 0.24 });
  assert.ok(a.ot > 0.13 && a.ot < 0.19, `plain Poisson OT ${a.ot}`);
  assert.ok(b.ot > 0.20 && b.ot < 0.26, `with tieBoost OT ${b.ot}`);
  assert.ok(Math.abs(b.goals - a.goals) < 0.12, `regulation goals ${a.goals.toFixed(2)} -> ${b.goals.toFixed(2)}`);
});
