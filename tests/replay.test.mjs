import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder } from '../nfl/src/ui/replay.js';
const mkSim = () => ({ t: 0, phase: 'RUN', carrier: null, ball: null, ents: [{ id: 'a', pos: { x: 0, y: 0 }, prev: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, facing: 0, down: false }, { id: 'b', pos: { x: 5, y: 5 }, prev: { x: 5, y: 5 }, vel: { x: 0, y: 0 }, facing: 1, down: false }] });
test('recorder: captures every tick, replays interpolated, restores the final state, and leaves ball/carrier consistent', () => {
  const sim = mkSim(), rec = createRecorder();
  for (let i = 0; i <= 30; i++) { sim.t = i / 30; sim.ents[0].pos.x = i; sim.ents[1].down = i >= 20; if (i === 10) { sim.ball = { pos: { x: 3, y: 1 }, z: 2, type: 'LOB' }; } if (i >= 10) sim.ball.pos.x = i; sim.carrier = i >= 25 ? sim.ents[0] : null; if (i === 30) sim.phase = 'DEAD'; rec.capture(sim); }
  assert.equal(rec.length, 31); assert.ok(Math.abs(rec.duration - 1) < 1e-9);
  const final = { x: sim.ents[0].pos.x, phase: sim.phase };
  sim.ents[0].pos.x = 999; sim.phase = 'X';
  let a = rec.apply(sim, 5.5); assert.equal(a, 5.5);
  assert.equal(sim.ents[0].prev.x, 5); assert.equal(sim.ents[0].pos.x, 6); assert.equal(sim.ball, null); assert.equal(sim.carrier, null);
  rec.apply(sim, 15.2); assert.ok(sim.ball && sim.ball.type === 'LOB' && sim.ball.pos.x >= 15 && sim.ball.prev.x <= sim.ball.pos.x);
  rec.apply(sim, 22); assert.equal(sim.ents[1].down, true); rec.apply(sim, 18); assert.equal(sim.ents[1].down, false);
  rec.apply(sim, 100); assert.equal(sim.ents[0].pos.x, final.x); assert.equal(sim.phase, 'DEAD'); assert.equal(sim.carrier, sim.ents[0]);   // clamped to the last frame
  rec.apply(sim, -5); assert.equal(sim.ents[0].pos.x, 1);
  rec.reset(); assert.equal(rec.length, 0); assert.equal(rec.apply(sim, 3), 0);
});
test('recorder: bounded memory', () => { const rec = createRecorder(10), sim = mkSim(); for (let i = 0; i < 50; i++) rec.capture(sim); assert.equal(rec.length, 10); });
