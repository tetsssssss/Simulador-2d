// Defensive line stunts (twists). Two rushers on the same side exchange gaps:
//   TE (tackle-end): the tackle crashes first, the end loops inside behind him.
//   ET (end-tackle): the end crashes inside first, the tackle loops outside around him.
// The penetrator takes his blocker (and often the neighbor's help) across the face; the looper waits behind him,
// untouchable by the line for a beat (he is not in contact yet), then runs through the vacated gap. Whether the
// line passes the stunt off is a per-blocker awareness read: a blocker who reads it holds for the looper, one who
// does not helps on the penetrator and the looper comes free. Everything is tracked in sim.stunt + debug events.
import { clamp, dist } from './geometry.js';
import { seekVelocity } from './movement.js';

export const STUNT_TYPES = ['TE', 'ET'];

// Decide (seeded, forked stream) whether this play has a stunt. opts.stunt forces 'TE' | 'ET' | 'NONE'.
export function planStunt(sim, opts = {}) {
  if (sim.call.type !== 'pass') return null;
  const rush = sim.defense.filter(d => d.assignment?.type === 'RUSH');
  if (rush.length !== 4) return null; // no stunts when blitzing
  const r = sim.rng.fork('stunt');
  let type = opts.stunt;
  if (type === 'NONE' || type === false) return null;
  if (!type) {
    if (!r.chance(0.14)) return null;
    type = r.pick(STUNT_TYPES);
  }
  const side = r.chance(0.5) ? 'R' : 'L';
  const tackle = sim.def[side + 'DT'], end = sim.def[side + 'DE'];
  const pen = type === 'TE' ? tackle : end, loop = type === 'TE' ? end : tackle;
  const loopT = 0.42 + 0.08 * (1 - pen.prof.r.explosiveness);
  const st = { type, side, pen, loop, loopT, phase: 'WAIT', t: 0, picked: null, gapY: loop.home.y, penGapY: pen.home.y };
  pen.stunt = { role: 'PEN' }; loop.stunt = { role: 'LOOP' };
  loop.noBlock = loopT + 0.05;
  // Blockers whose man is the looper may read the exchange (pass it off) -- seeded per blocker by awareness.
  for (const o of sim.offense) {
    if (o.assignment?.type === 'PASS_PRO' && o.assignment.target === loop) o.stuntRead = r.chance(0.3 + 0.62 * o.prof.r.awareness);
  }
  sim.stunt = st;
  sim.emit('STUNT', { type, side, pen: pen.id, loop: loop.id, readByLine: sim.offense.filter(o => o.stuntRead).map(o => o.id) }, true);
  return st;
}

// Desired velocity of the two stunting rushers; null = no stunt behavior for this player.
export function stuntVelocity(sim, e) {
  const st = sim.stunt;
  if (!st || !e.stunt || e.engagedWith) return null;
  if (e.stunt.role === 'PEN') {
    // Crash across the face toward the looper's gap, getting a little depth into the backfield.
    if (sim.t > 1.4) return null;
    return seekVelocity(e, { x: sim.losX - 0.1, y: st.gapY + (st.penGapY - st.gapY) * 0.15 }, 1, 0.1);
  }
  st.t = sim.t;
  if (st.phase === 'WAIT') {
    // Slide behind the penetrator (stay at depth, mirror toward the gap he is vacating).
    if (sim.t >= st.loopT || st.pen.down) {
      st.phase = 'LOOP';
      sim.emit('STUNT_LOOP', { by: e.id, around: st.pen.id, t: +sim.t.toFixed(2) }, true);
    } else return seekVelocity(e, { x: e.home.x + 0.4, y: e.pos.y + (st.penGapY - e.pos.y) * 0.5 }, 0.55, 0.1);
  }
  // LOOP: through the vacated gap, then to the QB.
  const viaGap = { x: sim.losX - 0.3, y: st.penGapY };
  const target = e.pos.x > sim.losX + 0.2 && dist(e.pos, viaGap) > 1.4 ? viaGap : sim.qb.pos;
  return seekVelocity(e, { x: target.x, y: clamp(target.y, 1, 52) }, 1, 0.05);
}

// Pass protection hook: a blocker who read the stunt mirrors the looper (waits for him) instead of helping.
export function stuntBlockVelocity(sim, e, a) {
  const st = sim.stunt;
  if (!st || a !== st.loop || !e.stuntRead || st.picked) return null;
  if (st.phase === 'LOOP' || a.eng) return null; // looper is coming: normal engagement picks him up
  if (!e.stuntNoted) { e.stuntNoted = true; sim.emit('STUNT_PICKUP', { by: e.id, on: a.id, t: +sim.t.toFixed(2) }, true); }
  return seekVelocity(e, { x: Math.min(sim.losX - 0.5, a.pos.x - 1.4), y: a.pos.y + (sim.qb.pos.y - a.pos.y) * 0.25 }, 0.8, 0.1);
}
