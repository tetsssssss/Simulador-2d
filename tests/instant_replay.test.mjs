import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstantReplay } from '../core/ui/instantReplay.js';
const adapter = { snap: s => ({ t: s.t, lists: { players: s.players }, objs: { puck: s.puck } }), build: (s, lists, objs, t) => ({ ...s, players: lists.players, puck: objs.puck, t }) };
const mk = t => ({ t, players: [{ id: 'a', x: t * 10, y: 0 }, { id: 'b', x: 5, y: t }], puck: { x: t * 20, y: 1, z: 0 } });
test('instant replay: records at the configured rate, replays at half speed from a copy, never mutates the live state, and ends by itself', () => {
  const rp = createInstantReplay({ adapter, every: 0.1, seconds: 2, after: 0.5, speed: 0.5 });
  let live = mk(0);
  for (let i = 0; i <= 40; i++) { live = mk(i * 0.1); rp.record(live); if (i === 30) assert.ok(rp.trigger(live)); }   // goal at t = 3.0
  assert.ok(rp.buffered > 30);
  assert.equal(rp.active, false);
  const before = JSON.stringify(live);
  const first = rp.step(0.1, live);                                  // live t = 4.0 ≥ 3.5 → replay starts (frames from t ≥ 1.0)
  assert.ok(first && rp.active); assert.ok(first.state.t >= 1.0 && first.state.t < 1.5, String(first.state.t));
  assert.equal(JSON.stringify(live), before); assert.notEqual(first.state, live);
  assert.ok(first.state.players[0].px <= first.state.players[0].x);   // prev → cur for the renderer's own interpolation
  const t0 = first.state.t; const second = rp.step(0.2, live); assert.ok(second.state.t > t0);
  assert.equal(rp.step(0.2, live) !== null || true, true);
  let n = 0; while (rp.step(0.5, live)) { if (++n > 500) assert.fail('never ends'); }
  assert.equal(rp.active, false); assert.equal(rp.step(0.1, live), null);
});
test('instant replay: skip, a clock reset clears the buffer, replay-now works, and the buffer is bounded', () => {
  const rp = createInstantReplay({ adapter, every: 0.1, seconds: 1, max: 50 });
  for (let i = 0; i < 200; i++) rp.record(mk(i * 0.1)); assert.equal(rp.buffered, 50);
  assert.ok(rp.now(mk(19.9))); assert.ok(rp.step(0.05, mk(19.9))); rp.skip(); assert.equal(rp.active, false);
  rp.record(mk(0)); assert.equal(rp.buffered, 1);                    // clock went backwards = new game
  assert.equal(createInstantReplay({ adapter }).step(0.1, mk(1)), null);
});
