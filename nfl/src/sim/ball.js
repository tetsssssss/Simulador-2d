// PassingSystem (throw planning, accuracy, ball flight) + CatchSystem (catch/drop/breakup/INT from spatial state).
import { FIELD_W, GRAVITY, clamp, dist, distToSegment, norm, sub } from './geometry.js';
import { speedCap, steer } from './movement.js';
import { updateRoute } from './routes.js';

const RELEASE_Z = 2.0, CATCH_Z = 1.4;

export function ballSpeed(qb) { return 17 + 13 * qb.prof.r.throwingPower; }
export function maxThrow(qb) { return 42 + 26 * qb.prof.r.throwingPower; }

// Where will the receiver be after `t` seconds if he keeps running his route?
// The QB "knows the route": we run the receiver's own route logic forward on a ghost copy
// (same steering limits), cached once per simulation tick.
const PRED_HZ = 30, PRED_MAX = 3.6;
function routeTrajectory(sim, e) {
  if (e._traj && e._traj.tick === sim.tick) return e._traj.pts;
  const R = e.route;
  const ghost = {
    ...e, pos: { ...e.pos }, vel: { ...e.vel }, hist: [],
    route: { ...R }, jam: e.jam, speedMul: e.speedMul, turnMul: e.turnMul,
  };
  const stub = { qbStartPos: sim.qbStartPos, defense: sim.defense, emit: () => {}, dt: 1 / PRED_HZ };
  const pts = [{ x: ghost.pos.x, y: ghost.pos.y }];
  const dt = 1 / PRED_HZ;
  for (let i = 0; i < PRED_MAX * PRED_HZ; i++) {
    steer(ghost, updateRoute(stub, ghost, dt), dt);
    ghost.pos.x += ghost.vel.x * dt; ghost.pos.y += ghost.vel.y * dt;
    pts.push({ x: ghost.pos.x, y: ghost.pos.y });
  }
  e._traj = { tick: sim.tick, pts };
  return pts;
}

export function routePredict(sim, e, t) {
  const R = e.route;
  if (!R || R.block || (e.assignment?.type !== 'ROUTE' && e.assignment?.type !== 'CHECK_RELEASE')) return { x: e.pos.x + e.vel.x * t, y: e.pos.y + e.vel.y * t };
  const pts = routeTrajectory(sim, e);
  const f = Math.min(t * PRED_HZ, pts.length - 1), i = Math.floor(f), k = f - i;
  const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

export function ballTypeFor(d) { return d < 13 ? 'BULLET' : d < 28 ? 'TOUCH' : 'LOB'; }
const TYPE_SPEED = { BULLET: 1, TOUCH: 0.86, LOB: 0.72 };

// Plan a throw to receiver r: lead point, flight time, ball type. Null if out of range.
export function planThrow(sim, qb, r, extraDelay = 0) {
  const v0 = ballSpeed(qb);
  let T = dist(qb.pos, r.pos) / v0, aim = r.pos, type = 'BULLET';
  for (let i = 0; i < 5; i++) {
    aim = routePredict(sim, r, T + extraDelay);
    const d = dist(qb.pos, aim);
    type = ballTypeFor(d);
    T = d / (v0 * TYPE_SPEED[type]);
  }
  const d = dist(qb.pos, aim);
  if (d > maxThrow(qb)) return null;
  return { aim, T, type, d };
}

export function throwBall(sim, qb, r, plan, opts = {}) {
  const R = qb.prof.r, d = plan.d;
  const acc = d < 10 ? R.shortAccuracy : d < 20 ? R.mediumAccuracy : R.deepAccuracy;
  // Placement error grows faster than linearly with distance (deep balls are hard to drop in the bucket).
  let sd = (0.3 + 0.032 * d + 0.0012 * d * d) * (1.45 - acc);
  const moving = Math.hypot(qb.vel.x, qb.vel.y) > 2;
  if (moving) sd *= 1 + (1 - R.throwOnRun) * 0.9;
  const pressure = sim.qbState?.pressure || 0;
  sd *= 1 + pressure * (1.15 - R.composure) * 0.9;
  if (opts.hurried) sd *= 1.35;
  const u = norm(sub(plan.aim, qb.pos)), nrm = { x: -u.y, y: u.x };
  const eLong = opts.throwAway ? 0 : sim.rng.normal(0, sd * 1.1), eLat = opts.throwAway ? 0 : sim.rng.normal(0, sd);
  const aim = { x: plan.aim.x + u.x * eLong + nrm.x * eLat, y: plan.aim.y + u.y * eLong + nrm.y * eLat };
  const dd = dist(qb.pos, aim);
  const type = ballTypeFor(dd);
  const T = dd / (ballSpeed(qb) * TYPE_SPEED[type]);
  const vz0 = (CATCH_Z - RELEASE_Z + 0.5 * GRAVITY * T * T) / T;
  sim.ball = {
    pos: { x: qb.pos.x, y: qb.pos.y }, z: RELEASE_Z, from: { x: qb.pos.x, y: qb.pos.y }, aim, intended: plan.aim,
    vel: { x: (aim.x - qb.pos.x) / T, y: (aim.y - qb.pos.y) / T }, vz0, t: 0, T, type,
    releaseT: sim.t, target: r, passer: qb, throwAway: !!opts.throwAway, tipped: new Set(), resolved: false,
    peak: RELEASE_Z + vz0 * vz0 / (2 * GRAVITY),
  };
  sim.phase = 'BALL_AIR';
  sim.emit('PASS_ATTEMPT', {
    passer: qb.id, target: r ? r.id : null, airYards: Math.round((aim.x - sim.losX) * 10) / 10,
    ballType: type, hurried: !!opts.hurried, throwAway: !!opts.throwAway, read: sim.qbState?.readIdx ?? null,
  });
}

function incomplete(sim, reason, by) {
  sim.ball.resolved = true;
  sim.ball.dead = reason;
  sim.emit('INCOMPLETE', { reason, by: by ? by.id : null, target: sim.ball.target?.id || null });
  if (by && reason === 'BREAKUP') sim.emit('PASS_BREAKUP', { by: by.id });
}

export function updateBall(sim, dt) {
  const b = sim.ball;
  if (!b || sim.phase === 'DEAD') return;
  b.t += dt;
  b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt;
  b.z = RELEASE_Z + b.vz0 * b.t - 0.5 * GRAVITY * b.t * b.t;
  if (b.resolved) {
    if (b.z <= 0.05) { b.z = 0; sim.whistle('INCOMPLETE'); }
    return;
  }
  // In-flight: a defender in the throwing lane can tip / pick a low ball.
  if (b.t < b.T * 0.6 && !b.throwAway) {
    for (const d of sim.defense) {
      if (d.down || b.tipped.has(d)) continue;
      const reachZ = 2.15 + (d.prof.height - 72) * 0.03 + d.prof.r.jumping * 0.55;
      if (b.z > reachZ || dist(d.pos, b.pos) > 0.85) continue;
      b.tipped.add(d);
      const R = d.prof.r;
      const pTouch = 0.3 + 0.35 * R.playRecognition + 0.2 * R.jumping;
      if (!sim.rng.chance(pTouch)) continue;
      const pInt = (0.12 + 0.3 * R.catching * (d.prof.group === 'DB' ? 1 : 0.5)) * (sim.tune?.turnover ?? 1);
      if (sim.rng.chance(pInt)) return intercept(sim, d);
      return incomplete(sim, 'DEFLECTED', d);
    }
  }
  if (b.t >= b.T) resolveCatch(sim);
}

function intercept(sim, d) {
  const b = sim.ball;
  b.resolved = true; b.caught = true;
  sim.emit('INTERCEPTION', { by: d.id, passer: b.passer.id, x: Math.round(d.pos.x * 10) / 10 });
  sim.ball = null;
  sim.setCarrier(d);
}

function resolveCatch(sim) {
  const b = sim.ball;
  if (b.throwAway) return incomplete(sim, 'THROWAWAY');
  const rec = b.target;
  const outOfBounds = b.pos.y < 0 || b.pos.y > FIELD_W || b.pos.x > 120;
  const R = rec.prof.r;
  const dr = dist(rec.pos, b.pos);
  const reachR = rec.prof.reach + 0.45; // includes extension / dive
  const qr = clamp(1 - (dr / reachR) ** 2, 0, 1);
  // Best-positioned defender.
  let bd = null, qd = 0;
  for (const d of sim.defense) {
    if (d.down) continue;
    const q = clamp(1 - dist(d.pos, b.pos) / (d.prof.reach + 0.35), 0, 1);
    if (q > qd) { qd = q; bd = d; }
  }
  if (outOfBounds && qd === 0) return incomplete(sim, 'OUT_OF_BOUNDS');
  if (bd && qd > 0) {
    const D = bd.prof.r;
    const skill = 0.45 * (bd.assignment?.type === 'MAN' ? D.manCoverage : D.zoneCoverage) + 0.35 * D.playRecognition + 0.2 * D.jumping;
    // A trailing defender (receiver between him and the ball) has a worse angle.
    const trailing = dist(bd.pos, b.from) > dist(rec.pos, b.from) + 0.4 && qr > 0.2;
    const pDef = qd * (0.3 + 0.6 * skill) * (trailing ? 0.6 : 1) * (1 - 0.4 * qr * R.contestedCatch);
    if (sim.rng.chance(pDef)) {
      const pInt = (qd > qr ? 0.3 : 0.12) * (0.45 + 0.9 * D.catching) * (b.type === 'LOB' ? 1.25 : 1) * (sim.tune?.turnover ?? 1);
      if (!outOfBounds && sim.rng.chance(pInt)) return intercept(sim, bd);
      return incomplete(sim, 'BREAKUP', bd);
    }
  }
  if (qr <= 0) return incomplete(sim, b.z > 2.6 ? 'OVERTHROWN' : 'UNCATCHABLE');
  if (outOfBounds) return incomplete(sim, 'OUT_OF_BOUNDS');
  const contact = bd && dist(bd.pos, rec.pos) < 1.3;
  let pCatch = (0.87 + 0.12 * R.catching) * (0.72 + 0.28 * qr) * (contact ? 0.62 + 0.38 * R.contestedCatch : 1);
  if (b.type === 'BULLET' && b.T < 0.45) pCatch *= 0.95;
  pCatch *= 0.9 + 0.1 * rec.energy;
  if (sim.rng.chance(pCatch)) {
    b.resolved = true; b.caught = true;
    sim.emit('PASS_COMPLETE', { passer: b.passer.id, receiver: rec.id, x: Math.round(rec.pos.x * 10) / 10, contested: !!contact });
    sim.ball = null;
    sim.setCarrier(rec);
    return;
  }
  // Catchable ball that hit the hands (qr high) and wasn't caught = drop; fingertip misses are not drops.
  return incomplete(sim, qr > 0.45 && !contact ? 'DROP' : 'INCOMPLETE', qr > 0.45 && !contact ? rec : (contact ? bd : null));
}

// Lane danger for low throws: defenders sitting under the throwing line.
export function laneDanger(sim, from, aim, type) {
  if (type === 'LOB') return 0;
  let danger = 0;
  for (const d of sim.defense) {
    if (d.down || d.engagedWith) continue;
    if (d.pos.x < from.x + 1.5 || d.pos.x > aim.x - 1.5) continue;
    const dd = distToSegment(d.pos, from, aim);
    if (dd < 1.6) danger += (1.6 - dd) * (type === 'BULLET' ? 0.8 : 1.2);
  }
  return danger;
}
