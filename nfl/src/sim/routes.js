// RouteSystem: geometric routes with phases RELEASE -> STEM -> BREAK -> POST_BREAK (+ SCRAMBLE rule).
// Separation is not a rating: it emerges from release vs press, acceleration, how much speed the receiver
// keeps through the break (routeRunning + agility) and the defender's reaction delay (coverage.js).
import { ROUTES } from './formation.js';
import { FIELD_W, MID_Y, clamp, dist, norm, sub, angleDiff, angleOf } from './geometry.js';
import { seekVelocity, speedCap } from './movement.js';

export function initRoute(e, name, side) {
  const def = ROUTES[name];
  const ax = e.pos.x, ay = e.pos.y;
  // Inward = toward the middle of the field; RB uses the side of his alignment.
  const inSign = side ?? (ay < MID_Y ? 1 : -1);
  const pts = def.pts.map(([dx, din]) => ({ x: Math.min(118.5, ax + dx), y: clamp(ay + din * inSign, 1.2, FIELD_W - 1.2) }));
  let len = 0, prev = { x: ax, y: ay }, breakLen = null;
  pts.forEach((p, i) => { len += dist(prev, p); if (i === 0) breakLen = len; prev = p; });
  e.route = { name, pts, idx: 0, settle: !!def.settle, cont: !!def.cont, check: !!def.check, block: !!def.block, phase: 'RELEASE', breakLen, t: 0, inSign };
  // Expected time to reach the first break at ~85% speed (used by the QB for timing).
  e.route.breakTime = breakLen / (e.prof.maxSpeed * 0.85) + 0.35;
  e.assignment = { type: def.block ? 'STALK_BLOCK' : def.check ? 'CHECK_RELEASE' : 'ROUTE', label: name };
}

export function routeTarget(e) {
  const R = e.route;
  return R.pts[Math.min(R.idx, R.pts.length - 1)];
}

// Desired velocity for a receiver running his route.
export function updateRoute(sim, e, dt) {
  const R = e.route;
  R.t += dt;
  // Press/jam at the line delays the release.
  if (e.jam > 0) { e.jam -= dt; e.speedMul = 0.35; } else e.speedMul = 1;
  const from = sim.qbStartPos || e.pos;
  if (R.idx >= R.pts.length) {
    if (R.settle) return settleVelocity(sim, e);
    // Continue along the last segment; bend upfield at the sideline.
    const a = R.pts[R.pts.length - 2] || from, b = R.pts[R.pts.length - 1];
    let dir = norm(sub(b, a));
    if ((e.pos.y < 2.5 && dir.y < 0) || (e.pos.y > FIELD_W - 2.5 && dir.y > 0)) dir = { x: 1, y: 0 };
    if (e.pos.x > 117) dir = { x: 0, y: dir.y || 0 };
    R.phase = 'POST_BREAK';
    return { x: dir.x * speedCap(e), y: dir.y * speedCap(e) };
  }
  const tgt = R.pts[R.idx];
  const d = dist(e.pos, tgt);
  R.phase = R.idx === 0 ? (R.t < 0.6 ? 'RELEASE' : 'STEM') : R.idx === R.pts.length - 1 ? 'POST_BREAK' : 'BREAK';
  let speedFrac = 1;
  e.turnMul = 1;
  const next = R.pts[R.idx + 1];
  if (next && d < 2.6) {
    // Approaching a break: sharper break = more deceleration; good route runners keep more speed.
    const turn = Math.abs(angleDiff(angleOf(sub(tgt, e.pos)), angleOf(sub(next, tgt))));
    const rr = e.prof.r.routeRunning;
    speedFrac = 1 - (turn / Math.PI) * (0.85 - 0.5 * rr);
    e.turnMul = 1 + 0.9 * rr;
    R.phase = 'BREAK';
  } else if (!next && R.settle && d < 2.2) {
    speedFrac = 0.5;
  }
  if (d < (next ? 0.9 : 0.6)) { R.idx++; if (R.idx === 1) sim.emit('ROUTE_BREAK', { id: e.id, route: R.name }, true); }
  return seekVelocity(e, tgt, speedFrac, next ? 0.1 : 0.5);
}

// Settled routes (curl, hitch, stick, check): sit in the window and drift away from the closest defender.
function settleVelocity(sim, e) {
  const anchor = e.route.pts[e.route.pts.length - 1];
  let near = null, nd = 99;
  for (const d of sim.defense) { const dd = dist(d.pos, e.pos); if (dd < nd) { nd = dd; near = d; } }
  let target = anchor;
  if (near && nd < 3.5) {
    const away = Math.sign(e.pos.y - near.pos.y) || 1;
    target = { x: anchor.x - 0.5, y: clamp(anchor.y + away * 2.5, 1.5, FIELD_W - 1.5) };
  }
  return seekVelocity(e, target, 0.55, 0.4);
}

// Scramble drill: receivers break off routes and work toward the scrambling QB's side, staying in front of him.
export function scrambleVelocity(sim, e) {
  const qb = sim.qb;
  const tx = Math.max(sim.losX + 3, e.pos.x - 1.5);
  const ty = clamp(e.pos.y + Math.sign(qb.pos.y - e.pos.y) * 4, 2, FIELD_W - 2);
  return seekVelocity(e, { x: tx, y: ty }, 0.8, 0.5);
}
