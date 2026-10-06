// Ball-carrier moves: CUT, JUKE, SPIN, STIFF_ARM, TRUCK (or NONE: lower the pads and secure the ball).
// A move is a real engine decision taken just before contact: the carrier compares the expected payoff of each
// move given the geometry (head on / angle / from behind), masses and both players' ratings, perceived with
// noise that shrinks with awareness. Effects are physical (heading, speed, turn authority) and feed the
// TackleSystem (tackleModifier), never a scripted result.
import { clamp, dist, norm, sub } from './geometry.js';

export const MOVES = ['CUT', 'JUKE', 'SPIN', 'STIFF_ARM', 'TRUCK'];
const DURATION = { CUT: 0.25, JUKE: 0.3, SPIN: 0.4, STIFF_ARM: 0.45, TRUCK: 0.3 };

const carrierHeading = c => Math.atan2(c.vel.y, c.vel.x * (c.side === 'off' ? 1 : -1));

function clearMove(c) { c.moveState.cur = null; c.speedMul = 1; c.turnMul = 1; }

// Geometry of a would-be tackler relative to the carrier. facing: 1 = head on, -1 = from behind.
export function contactGeometry(c, d) {
  const dir = c.side === 'off' ? 1 : -1;
  const toC = norm(sub(c.pos, d.pos));
  const cs = Math.hypot(c.vel.x, c.vel.y);
  const cu = cs > 0.5 ? { x: c.vel.x / cs, y: c.vel.y / cs } : { x: dir, y: 0 };
  const closing = Math.max(0, (d.vel.x - c.vel.x) * toC.x + (d.vel.y - c.vel.y) * toC.y);
  return { toC, cu, cs, closing, facing: -(cu.x * toC.x + cu.y * toC.y) };
}

export function moveQualities(c, d, g) {
  const R = c.prof.r, D = d.prof.r, massR = c.prof.mass / d.prof.mass;
  const q = {};
  if (g.cs > 2.5 && g.facing > 0.1) q.JUKE = 0.45 * R.elusiveness + 0.3 * R.agility + 0.25 * R.changeOfDirection - (0.4 * D.agility + 0.3 * D.playRecognition + 0.3 * D.tackling) + 0.1;
  q.SPIN = 0.4 * R.balance + 0.35 * R.agility + 0.25 * R.elusiveness - (0.5 * D.tackling + 0.5 * D.strength) + (Math.abs(g.facing) < 0.6 ? 0.08 : -0.15);
  q.STIFF_ARM = 0.55 * R.stiffArm + 0.3 * R.strength + 0.25 * (massR - 1) - (0.5 * D.tackling + 0.3 * D.strength + 0.2 * (d.prof.mass - 1)) + (g.facing > -0.4 && g.facing < 0.75 ? 0.1 : -0.2);
  if (g.facing > 0.35) q.TRUCK = 0.45 * R.trucking + 0.3 * R.strength + 0.6 * (massR - 1) - (0.4 * D.hitPower + 0.35 * D.tackling + 0.25 * D.strength) + 0.05;
  if (g.cs > 3) q.CUT = 0.5 * R.agility + 0.5 * R.changeOfDirection - 0.55 * D.agility - 0.2 * D.playRecognition + 0.05;
  return q;
}

// Called every tick for the ball carrier (not for a passer still in the pocket).
export function updateMoves(sim, c) {
  const ms = c.moveState || (c.moveState = { cur: null, cd: 0 });
  if (ms.cur && sim.t > ms.cur.until) clearMove(c);
  if (ms.cur || sim.t < ms.cd) return ms.cur;
  // The most imminent free tackler.
  let threat = null, tBest = 1e9;
  for (const d of sim.ents) {
    if (d.side === c.side || d.down || d.stun > 0 || (d.eng && d.eng.lev < 0.4)) continue;
    const dd = dist(d.pos, c.pos);
    if (dd > 3.2) continue;
    const g = contactGeometry(c, d);
    if (g.closing < 0.3 && dd > 1.4) continue;
    const tc = Math.max(0, dd - d.prof.reach) / Math.max(0.5, g.closing);
    if (tc < tBest) { tBest = tc; threat = d; }
  }
  if (!threat || tBest > 0.45) return null;
  const g = contactGeometry(c, threat);
  const q = moveQualities(c, threat, g);
  const R = c.prof.r;
  const sd = 0.05 + 0.2 * (1 - R.awareness);
  let best = 'NONE', bq = -0.04 + sim.rng.normal(0, 0.02);
  for (const m of MOVES) {
    if (q[m] === undefined) continue;
    if (m === 'CUT' && tBest < 0.15) continue; // too late to cut
    const v = q[m] + sim.rng.normal(0, sd);
    if (v > bq) { bq = v; best = m; }
  }
  ms.cd = sim.t + 0.55;
  if (best === 'NONE') { ms.cd = sim.t + 0.3; return null; }
  const cur = { type: best, vs: threat, q: q[best], until: sim.t + DURATION[best], heading: null };
  ms.cur = cur;
  // Away from the tackler's side.
  const lat = Math.sign((c.pos.y - threat.pos.y) || 1);
  const h = carrierHeading(c);
  switch (best) {
    case 'CUT':
      c.turnMul = 1.4 + 0.8 * (0.5 * R.agility + 0.5 * R.changeOfDirection); c.speedMul = 0.88 + 0.08 * R.changeOfDirection;
      cur.heading = clamp(h + lat * 0.75, -1.4, 1.4); break;
    case 'JUKE':
      c.turnMul = 1.5 + 0.7 * R.agility; c.speedMul = 0.82;
      cur.heading = clamp(h + lat * 0.95, -1.45, 1.45);
      // The fake: the tackler bites if the move beats his recognition.
      if (q.JUKE + sim.rng.normal(0, 0.12) > 0) { threat.juked = { until: sim.t + 0.35, side: -lat }; }
      break;
    case 'SPIN': c.speedMul = 0.7; break;
    case 'STIFF_ARM': c.speedMul = 0.93; break;
    case 'TRUCK': c.speedMul = 0.9; break;
  }
  if (cur.heading != null && c.carry) { c.carry.heading = cur.heading; c.carry.nextPick = cur.until; }
  // Moves are part of the play log (debug channel): who, which move, against whom.
  sim.emit('RB_MOVE', { move: best, by: c.id, vs: threat.id, q: +cur.q.toFixed(2) }, true);
  return cur;
}

// Contribution of the active move to escaping this tackle attempt (added to the carrier's evade score).
export function tackleModifier(sim, c, d, g) {
  const mv = c.moveState?.cur;
  if (!mv) return { bonus: 0, move: null };
  const q = clamp(mv.q, -0.4, 0.6);
  let fit;
  switch (mv.type) {
    case 'TRUCK': fit = g.facing > 0.3 ? 1 : 0.25; break;
    case 'STIFF_ARM': fit = g.facing > -0.4 && g.facing < 0.8 ? 1 : 0.3; break;
    case 'SPIN': fit = g.facing < 0.5 ? 1 : 0.45; break;
    case 'JUKE': fit = d.juked && d.juked.until > sim.t ? 1 : mv.vs === d ? 0.4 : 0.2; break;
    default: fit = 0.5; // CUT: mostly avoidance through movement
  }
  if (mv.vs && mv.vs !== d) fit *= 0.5;
  return { bonus: clamp(0.06 + 0.5 * q, -0.12, 0.38) * fit, move: mv.type };
}
