// CoverageSystem: man (trail with reaction delay + leverage) and zone (landmark drop, threat matching,
// QB-eyes read). Defenders perceive receivers with a delay set by their ratings, so they are not magnets.
import { DEF_CALLS, zoneDef } from './formation.js';
import { FIELD_W, clamp, dist, norm, sub } from './geometry.js';
import { seekVelocity, speedCap } from './movement.js';

// Delayed perception of another player (position + velocity `delay` seconds ago, extrapolated).
export function perceive(sim, target, delay, predict = 0) {
  const h = target.hist;
  const back = Math.min(h.length - 1, Math.round(delay / sim.dt));
  const s = h[h.length - 1 - back] || { x: target.pos.x, y: target.pos.y, vx: target.vel.x, vy: target.vel.y };
  const lead = delay * predict;
  return { x: s.x + s.vx * lead, y: s.y + s.vy * lead, vx: s.vx, vy: s.vy };
}

export function initCoverage(sim) {
  const call = DEF_CALLS[sim.defCall];
  for (const [slot, e] of Object.entries(sim.def)) {
    if (!e) continue;
    const R = e.prof.r;
    // Reaction delays (seconds): reading routes and reading the ball/run.
    e.readDelay = clamp(0.42 - 0.28 * (0.6 * (R.manCoverage + R.zoneCoverage) / 2 + 0.4 * R.playRecognition), 0.1, 0.42);
    e.ballReact = clamp(0.5 - 0.32 * (0.5 * R.playRecognition + 0.5 * R.anticipation), 0.12, 0.5);
    // Run/pass read: backers read the run first; defensive backs are pass-first (play-action respect).
    e.runRead = 0.35 + 0.9 * (1 - R.playRecognition) + (e.prof.group === 'DB' ? 0.45 : 0);
    if (call.rush.includes(slot)) {
      e.assignment = { type: 'RUSH', label: slot.endsWith('DE') ? 'EDGE_RUSH' : slot.endsWith('DT') ? 'INTERIOR_RUSH' : 'BLITZ' };
    } else if (call.man[slot]) {
      const tgt = sim.off[call.man[slot]];
      e.assignment = { type: 'MAN', target: tgt, label: `MAN→${call.man[slot]}` };
      // Press: jam check at the snap (release vs press coverage), contextual not a single dice.
      if (call.press && ['CBL', 'CBR'].includes(slot) && tgt) {
        const edge = e.prof.r.pressCoverage - tgt.prof.r.release + sim.rng.normal(0, 0.18);
        if (edge > 0.05) { tgt.jam = 0.25 + edge * 1.2; sim.emit('JAM', { by: e.id, on: tgt.id }, true); }
      }
    } else if (call.zones[slot]) {
      e.assignment = { type: 'ZONE', zone: zoneDef(call.zones[slot], sim.losX), label: call.zones[slot] };
    }
  }
}

function threatsIn(sim, zone, ahead = 0.6) {
  const out = [];
  for (const r of sim.receivers) {
    if (r.assignment?.type === 'PASS_PRO' || r.assignment?.type === 'STALK_BLOCK') continue;
    const fx = r.pos.x + r.vel.x * ahead, fy = r.pos.y + r.vel.y * ahead;
    if (fy >= zone.y0 - 2 && fy <= zone.y1 + 2 && fx <= zone.maxDepth + 3 && fx > sim.losX - 1) out.push(r);
  }
  return out;
}

function zoneVelocity(sim, e) {
  const z = e.assignment.zone;
  const threats = threatsIn(sim, z);
  let target;
  if (z.deep) {
    // Stay deeper than the deepest threat in the area ("nobody behind me").
    let deepest = null;
    for (const t of threats) if (!deepest || t.pos.x > deepest.pos.x) deepest = t;
    if (deepest) {
      const p = perceive(sim, deepest, e.readDelay, 0.6);
      // Cushion grows with his vertical speed: gain depth before he gets on top of you.
      target = { x: Math.max(z.x, p.x + 3.2 + Math.max(0, p.vx) * 0.7), y: clamp(p.y, z.y0 + 1, z.y1 - 1) };
    } else target = { x: z.x + Math.min(4, sim.t * 0.8), y: z.y };
  } else {
    // Most dangerous threat in the zone: depth and vertical stem first ("wall"/carry the seam), then
    // proximity to the landmark. A shallow check-down is rallied on after the throw, not chased early.
    let near = null, nd = -1e9;
    for (const t of threats) {
      const danger = 0.5 * clamp(t.pos.x - sim.losX, 0, 14) + 0.6 * Math.max(0, t.vel.x) - 0.25 * dist(t.pos, { x: z.x, y: z.y });
      if (danger > nd) { nd = danger; near = t; }
    }
    if (near) {
      // Sit underneath / inside the receiver, between him and the QB, inside the zone limits.
      const p = perceive(sim, near, e.readDelay, 0.7);
      const toQb = norm(sub(sim.qb.pos, p));
      // Keep landmark depth (never come up to a shallow route before the throw); carry a vertical route
      // underneath him once he is deeper than the landmark.
      // A crosser already inside the zone is driven on (rob it at his depth).
      const crossing = Math.abs(p.vy) > Math.abs(p.vx) && p.y >= z.y0 && p.y <= z.y1;
      const depth = crossing ? p.x + toQb.x * 1.5 : Math.max(z.x, p.x - 0.8);
      target = { x: clamp(depth, sim.losX + 2, z.maxDepth), y: clamp(p.y + toQb.y * 1.5, z.y0 - 1, z.y1 + 1) };
    } else {
      target = { x: z.x, y: z.y };
    }
    // Read the QB's eyes: drift toward the receiver he is looking at.
    const eyes = sim.qbState?.lookingAt;
    if (eyes && sim.phase === 'PRE_THROW') {
      const k = 0.35 * e.prof.r.playRecognition;
      target = { x: target.x, y: clamp(target.y + clamp(eyes.pos.y - target.y, -6, 6) * k, z.y0 - 2, z.y1 + 2) };
    }
  }
  // Backpedal while dropping: slower than full speed -- but a deep defender opens his hips and runs as soon as a
  // vertical threat is closing his cushion.
  const pressed = z.deep && threats.some(t => t.vel.x > 4 && t.pos.x > e.pos.x - 7);
  return seekVelocity(e, target, pressed ? 1 : sim.t < 1.2 ? 0.78 : 0.95, 0.6);
}

function manVelocity(sim, e) {
  const tgt = e.assignment.target;
  if (!tgt || tgt.assignment?.type === 'PASS_PRO') {
    // Receiver stayed in to block: become a robber underneath.
    e.assignment = { type: 'ZONE', zone: zoneDef('ROBBER', sim.losX), label: 'ROBBER(green)' };
    return zoneVelocity(sim, e);
  }
  const R = e.prof.r;
  const p = perceive(sim, tgt, e.readDelay, 0.4 + 0.6 * R.anticipation);
  // Inside leverage, slight cushion early, trailing once the receiver is vertical.
  const inside = Math.sign(sim.by - tgt.pos.y) || 1;
  const cushion = sim.t < 1.0 ? 1.6 : 0.6;
  // Never chase a receiver into the backfield: hold at the line until he releases.
  // Off-man: never come downhill at a receiver who is still underneath -- keep the cushion (bail) and let him
  // close it; only press/trail technique plays tight.
  // (Only vs a vertical stem: a receiver breaking flat/underneath is driven on.)
  const vertical = p.vx > 1.5 && p.vx > Math.abs(p.vy);
  const keep = vertical ? Math.min(e.pos.x, p.x + 3) : -Infinity;
  const target = { x: Math.max(sim.losX + 1, p.x + cushion * (p.vx > 2 ? 1 : 0.3), keep), y: clamp(p.y + inside * 0.7, 1, FIELD_W - 1) };
  return seekVelocity(e, target, 1, 0.2);
}

export function coverageVelocity(sim, e) {
  const a = e.assignment;
  if (!a) return { x: 0, y: 0 };
  if (a.type === 'MAN') return manVelocity(sim, e);
  if (a.type === 'ZONE') return zoneVelocity(sim, e);
  return { x: 0, y: 0 };
}

// After the throw: defenders who can get there break on the ball; others rally to the target.
export function ballReactionVelocity(sim, e) {
  const ball = sim.ball;
  if (sim.t - ball.releaseT < e.ballReact) return null;
  const remain = Math.max(0, ball.T - ball.t);
  const reach = dist(e.pos, ball.aim);
  if (reach <= speedCap(e) * remain + 2.5) return seekVelocity(e, ball.aim, 1, 0.1);
  const tgt = ball.target;
  if (!tgt) return seekVelocity(e, e.pos, 0.3);
  return seekVelocity(e, { x: tgt.pos.x + tgt.vel.x * 0.5, y: tgt.pos.y + tgt.vel.y * 0.5 }, 1, 0.2);
}
