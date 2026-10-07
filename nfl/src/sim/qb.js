// QBProgressionEngine + pocket behavior.
// READ 1 -> READ 2 -> ... -> CHECKDOWN -> late scan / SCRAMBLE / THROW AWAY / hold.
// Reads take processing time (decisionMaking/awareness/anticipation), respect route timing, and the QB
// perceives openness with noise that grows with pressure. Pocket movement reacts to where pressure comes from.
import { FIELD_W, clamp, dist, norm, sub, fromAngle } from './geometry.js';
import { seekVelocity, speedCap } from './movement.js';
import { planThrow, throwBall, laneDanger } from './ball.js';
import { pocketInfo } from './pocket.js';

export const QB_ACTIONS = ['STEP_UP', 'SLIDE', 'ROLL_OUT', 'SCRAMBLE', 'THROW_AWAY'];

// Record a QB pocket action once per change (debug event + counters for the explanation / tests).
function qbAction(sim, action, why = null) {
  const s = sim.qbState;
  if (s.action === action) return;
  s.action = action;
  (sim.qbActions ||= []).push({ t: +sim.t.toFixed(2), action, why });
  sim.emit('QB_ACTION', { action, id: sim.qb.id, why, collapse: s.pocket?.collapse ?? null }, true);
}

export function initQB(sim, reads) {
  const q = sim.qb;
  // Blitz recognition (pre-snap): more rushers than the line can block -> hot reads. The QB goes to the quickest
  // route first, processes faster and accepts tighter windows (better QBs get more out of it).
  const extra = sim.call.type === 'pass' ? Math.max(0, sim.defense.filter(d => d.assignment?.type === 'RUSH').length - 4) : 0;
  let hot = 0;
  if (extra >= 2 && reads.length) { // 6+ rushers (Cover 0); the 5-man Cover 1 Blitz keeps its original timing
    hot = extra * (0.5 + 0.5 * (0.5 * q.prof.r.awareness + 0.5 * q.prof.r.decisionMaking));
    reads = [...reads].sort((a, b) => (a.route?.breakTime ?? 9) - (b.route?.breakTime ?? 9));
  }
  q.assignment = { type: 'QB', label: sim.call.type === 'run' ? 'HANDOFF' : 'DROPBACK+PROGRESSION' };
  sim.qbState = {
    state: sim.call.type === 'run' ? 'HANDOFF' : 'DROP',
    reads, readIdx: 0, readClock: 0, hot, evalTime: evalTime(sim, q) * (hot ? 0.88 : 1), lookingAt: reads[0] || null,
    // Deep shots take a deeper (7-step) drop.
    dropPoint: { x: sim.losX - (hot ? 6.2 : sim.call.playType === 'deep' ? 8.6 : 7.2), y: sim.by }, pressure: 0, pressureDir: { x: 0, y: 0 }, late: false,
    lastDecision: 0, windup: 0, target: null, hurried: false, log: [], pocket: null, action: null,
  };
}

function evalTime(sim, q) {
  const R = q.prof.r;
  return clamp(0.55 - 0.32 * (0.5 * R.decisionMaking + 0.3 * R.awareness + 0.2 * R.anticipation) + sim.rng.normal(0, 0.04), 0.2, 0.6);
}

// Pressure: how soon can defenders that are not being controlled reach the QB.
export function pressureInfo(sim) {
  const q = sim.qb;
  let keep = 1, dx = 0, dy = 0, imminent = null;
  for (const d of sim.defense) {
    if (d.down) continue;
    const dd = dist(d.pos, q.pos);
    if (dd > 9) continue;
    let c;
    if (d.eng) { if (d.eng.lev < 0.35) continue; c = clamp(1 - (dd - 1) / 3.5, 0, 1) * 0.5 * d.eng.lev; }
    else {
      const tr = Math.max(0, dd - 1) / Math.max(3, speedCap(d));
      c = clamp(1 - tr / 1.6, 0, 1);
      // A body between him and the QB (blocker about to engage) means he is not a free rusher yet.
      const toQ = norm(sub(q.pos, d.pos));
      for (const o of sim.offense) {
        if (o === q || o.down) continue;
        const rel = sub(o.pos, d.pos), ahead = rel.x * toQ.x + rel.y * toQ.y;
        const between = ahead > 0.2 && ahead < 2.6 && Math.abs(rel.x * toQ.y - rel.y * toQ.x) < 1.7;
        const accounted = o.assignment?.type === 'PASS_PRO' && o.assignment.target === d && !(o.noBlock > 0) && dist(o.pos, d.pos) < 3;
        if (between || accounted) { c *= 0.2; break; }
      }
    }
    if (c <= 0) continue;
    keep *= 1 - c;
    const u = norm(sub(q.pos, d.pos)); dx += u.x * c; dy += u.y * c;
    if (!d.eng && dd < 2.2) imminent = d;
  }
  return { P: 1 - keep, dir: norm({ x: dx, y: dy }), imminent };
}

// Openness as the QB perceives it (yards of margin before a defender can reach the catch point).
export function evaluateTarget(sim, q, r, noise = true) {
  if (!r || r.down || r.assignment?.type === 'PASS_PRO') return { open: -99, plan: null };
  const windup = 0.22;
  const plan = planThrow(sim, q, r, windup);
  if (!plan || plan.aim.x > 119.5 || plan.aim.y < 0.8 || plan.aim.y > FIELD_W - 0.8) return { open: -99, plan: null };
  let margin = 99;
  for (const d of sim.defense) {
    if (d.down || (d.eng && d.eng.lev < 0.8)) continue;
    // Defender needs to see the throw (~ball reaction) and accelerate before closing.
    const tAvail = Math.max(0, plan.T + windup - (d.ballReact ?? 0.3));
    let m = dist(d.pos, plan.aim) - speedCap(d) * tAvail * 0.75 - d.prof.reach;
    // Leverage: a defender deeper than the catch point (ball thrown in front of him) can only tackle.
    // (only when he is not already on top of the catch point).
    if (dist(d.pos, q.pos) > dist(plan.aim, q.pos) + 0.8 && dist(d.pos, plan.aim) > 2.2) {
      const u = norm(sub(plan.aim, d.pos));
      if (d.vel.x * u.x + d.vel.y * u.y < 2) m += 1.0; // not already driving on the catch point
    }
    if (m < margin) margin = m;
  }
  margin = Math.min(margin, 8) - laneDanger(sim, q.pos, plan.aim, plan.type);
  if (!noise) return { open: margin, plan };
  const R = q.prof.r, P = sim.qbState.pressure;
  const sd = 0.35 + 1.5 * (1 - (0.55 * R.awareness + 0.45 * R.decisionMaking)) + 0.9 * P * (1.1 - R.composure);
  return { open: margin + sim.rng.normal(0, sd), plan, trueOpen: margin };
}

function available(sim, r) {
  if (!r.route) return true;
  if (r.route.settle && r.route.idx >= r.route.pts.length - 1) return true;
  return r.route.t >= r.route.breakTime - 0.4 * sim.qb.prof.r.anticipation;
}

function threshold(sim, plan, isLast) {
  const s = sim.qbState;
  // Margin in yards: > 0 open, -1..0 tight/contested window.
  // Play design: the first read is the preferred throw; the checkdown is a last resort.
  let th = -0.5 - 0.6 * s.pressure - (s.readIdx === 0 ? 0.1 : 0) + (isLast && !s.late ? 0.3 : 0) - (s.late ? 0.6 : 0);
  // Down & distance: on 3rd/4th down prefer throws that reach the sticks.
  if (sim.down >= 3 && plan && plan.aim.x < sim.losX + sim.distance) th += 0.7;
  if (s.hot) th -= 0.04 * s.hot;
  // The longer he holds it, the tighter the window he accepts.
  if (sim.t > 3) th -= 0.5 * (sim.t - 3);
  return th;
}

function startThrow(sim, r, plan, hurried) {
  const s = sim.qbState;
  s.state = 'WINDUP'; s.target = r; s.windup = 0; s.hurried = hurried;
  s.log.push({ t: +sim.t.toFixed(2), decision: 'THROW', target: r.slot, read: s.readIdx, hurried });
}

function escapeLane(sim) {
  const q = sim.qb;
  let best = null, bestScore = -1;
  for (const deg of [-100, -70, -40, -15, 15, 40, 70, 100]) {
    const u = fromAngle(deg * Math.PI / 180);
    let score = 99;
    for (const k of [2, 4.5]) {
      const p = { x: q.pos.x + u.x * k, y: q.pos.y + u.y * k };
      if (p.y < 1 || p.y > FIELD_W - 1) { score = -1; break; }
      for (const d of sim.defense) { if (!d.down) score = Math.min(score, dist(d.pos, p) - (d.eng ? 1.5 : 0)); }
    }
    if (score > bestScore) { bestScore = score; best = u; }
  }
  return { dir: best, score: bestScore };
}

export function updateQB(sim, dt) {
  const q = sim.qb, s = sim.qbState, R = q.prof.r;
  if (s.state === 'DONE') return seekVelocity(q, { x: q.pos.x - 0.2, y: q.pos.y }, 0.2);
  if (s.state === 'HANDOFF') {
    const mesh = sim.meshPoint;
    if (sim.carrier) { s.state = 'DONE'; return { x: 0, y: 0 }; }
    return seekVelocity(q, mesh, 0.55, 0.3);
  }
  const pi = pressureInfo(sim);
  s.pressure = pi.P; s.pressureDir = pi.dir;
  const pk = s.pocket = pocketInfo(sim);
  if (pk.collapse > 0.6 && !s.flaggedCollapse) { s.flaggedCollapse = true; sim.emit('POCKET_COLLAPSE', { t: +sim.t.toFixed(2), leak: pk.leak, sector: pk.sector, depth: pk.depth, by: pk.nearest?.id || null }, true); }
  if (pi.P > 0.55 && !s.flaggedPressure) {
    s.flaggedPressure = true;
    const by = pi.imminent || pk.nearest;
    const move = by ? (by.winMove || by.rushMove || null) : null;
    (sim.pressureLog ||= []).push({ t: +sim.t.toFixed(2), by: by?.id || null, move, won: !!by?.winMove, unblocked: !!by && !by.engCount });
    sim.emit('PRESSURE', { t: +sim.t.toFixed(2), by: by?.id || null, move, leak: pk.leak, collapse: pk.collapse }, true);
  }

  if (s.state === 'WINDUP') {
    s.windup += dt;
    if (s.windup >= 0.22 * (s.hurried ? 0.6 : 1)) {
      const plan = s.throwAway ? s.throwAwayPlan : (planThrow(sim, q, s.target) || s.fallbackPlan);
      if (plan) throwBall(sim, q, s.target, plan, { hurried: s.hurried, throwAway: s.throwAway });
      s.state = 'DONE';
    }
    return seekVelocity(q, q.pos, 0.2);
  }

  if (s.state === 'DROP') {
    if (sim.t > 0.35) { s.lookingAt = s.reads[0]; }
    if (dist(q.pos, s.dropPoint) < 0.5 || sim.t > 1.25) { s.state = 'SET'; s.readClock = sim.t > 0.6 ? 0.15 : 0; }
    return seekVelocity(q, s.dropPoint, 0.75, 0.4);
  }

  // SET or SCRAMBLE: keep reading.
  const scrambling = s.state === 'SCRAMBLE';
  const behindLos = q.pos.x < sim.losX - 0.3;
  if (scrambling && !behindLos) { s.state = 'RUNNER'; sim.emit('QB_RUN', { id: q.id }, true); }
  if (s.state === 'RUNNER') return null; // carrier AI drives him

  s.readClock += dt;
  const reads = s.reads;
  const r = reads[Math.min(s.readIdx, reads.length - 1)];
  s.lookingAt = r;

  // Decision cadence.
  if (sim.t - s.lastDecision >= 0.1) {
    s.lastDecision = sim.t;
    // Imminent hit: hurried throw to the current look if anything is there, else throw away when allowed.
    // Composure decides whether he can still get a throw off with a rusher in his face.
    if (pi.imminent && dist(pi.imminent.pos, q.pos) < 1.8 && sim.rng.chance(0.2 + 0.45 * R.composure)) {
      const ev = evaluateTarget(sim, q, r);
      if (ev.plan && ev.open > threshold(sim, ev.plan, true) - 1.4) { startThrow(sim, r, ev.plan, true); return { x: 0, y: 0 }; }
      if (outsideTackleBox(sim) && sim.rng.chance(0.4 + 0.5 * R.awareness)) { throwAway(sim); return { x: 0, y: 0 }; }
    }
    // Escape / scramble: under heavy pressure with the current look not open, a mobile QB leaves the pocket.
    if (!scrambling && (pi.P > 0.55 || (s.late && sim.t > 3.5))) {
      const cur = evaluateTarget(sim, q, r);
      if (!(cur.plan && cur.open >= threshold(sim, cur.plan, false))) {
        const lane = escapeLane(sim);
        const mobile = 0.15 + 0.6 * R.speed + 0.25 * R.elusiveness;
        // The bigger the open lane, the more willing he is to tuck it (an open lane + a mobile QB = run).
        if (lane.score > 2.2 && sim.rng.chance(mobile * 0.45 * (0.7 + 0.3 * clamp((lane.score - 2.2) / 4, 0, 1)))) {
          s.state = 'SCRAMBLE'; s.scrambleDir = lane.dir;
          sim.phase = 'SCRAMBLE';
          qbAction(sim, 'SCRAMBLE', `lane ${lane.score.toFixed(1)}`);
          sim.emit('SCRAMBLE', { id: q.id }, false);
          return null;
        } else if (outsideTackleBox(sim) && ((sim.t > 3.2 && sim.rng.chance(0.25 * R.awareness)) || (pi.P > 0.6 && lane.score <= 2.2 && sim.rng.chance(0.35 + 0.45 * R.awareness)))) {
          // No window, no lane, outside the box: live to play another down.
          throwAway(sim); return { x: 0, y: 0 };
        }
      }
    }
    // Hot-read clock: against a blitz the QB gives himself ~2 s, then scans for the best available window.
    if (s.hot && !s.late && sim.t > 2.3 - 0.35 * R.decisionMaking) { s.late = true; s.readIdx = s.reads.length - 1; s.readClock = 0.3; }
    if (!s.late) {
      if (s.readClock >= s.evalTime) {
        const isLast = s.readIdx >= reads.length - 1;
        if (!available(sim, r) && s.readClock < s.evalTime + 0.7 && pi.P < 0.5) {
          // Route not there yet: keep eyes on it (timing).
        } else {
          const ev = evaluateTarget(sim, q, r);
          if (ev.plan && ev.open >= threshold(sim, ev.plan, isLast)) { startThrow(sim, r, ev.plan, pi.P > 0.6); return { x: 0, y: 0 }; }
          s.log.push({ t: +sim.t.toFixed(2), decision: 'NEXT', from: r?.slot, read: s.readIdx, open: +ev.open.toFixed(2) });
          sim.emit('QB_READ', { read: s.readIdx, target: r?.id || null, verdict: 'covered' }, true);
          s.readIdx++; s.readClock = 0; s.evalTime = evalTime(sim, q) * (s.hot ? 0.88 : 1);
          if (s.readIdx >= reads.length) { s.late = true; s.readIdx = reads.length - 1; }
        }
      }
    } else if (s.readClock >= 0.3) {
      // Late in the down: quick rescan of everyone, take the best look.
      s.readClock = 0;
      let best = null;
      for (const x of reads) { const ev = evaluateTarget(sim, q, x); if (ev.plan && (!best || ev.open > best.open)) best = { ...ev, r: x }; }
      if (best && best.open >= threshold(sim, best.plan, true)) { startThrow(sim, best.r, best.plan, pi.P > 0.6); return { x: 0, y: 0 }; }
      if (best) s.lookingAt = best.r;
    }
    // Pressure + no window + outside the tackle box (legal to ground it) + nowhere to go: live for another down.
    if (outsideTackleBox(sim) && behindLos && (pi.P > 0.5 || pk.collapse > 0.55) && (s.readIdx >= 1 || s.late) && sim.rng.chance(0.2 + 0.5 * R.awareness)) {
      throwAway(sim); return { x: 0, y: 0 };
    }
    if (!scrambling && (sim.t > 6.5 || (sim.t > 5 && outsideTackleBox(sim)))) { throwAway(sim); return { x: 0, y: 0 }; }
  }

  // Scrambling QB moves like a ball carrier (seeking space) while still able to throw.
  if (scrambling || s.state === 'SCRAMBLE') return null;
  // Pocket movement.
  return pocketVelocity(sim, pi, pk);
}

function outsideTackleBox(sim) { return Math.abs(sim.qb.pos.y - sim.by) > 4.6 || sim.qb.pos.x > sim.losX - 0.5; }

function throwAway(sim) {
  const s = sim.qbState, q = sim.qb;
  const side = q.pos.y < sim.by ? -1 : 1;
  const aim = { x: q.pos.x + 8, y: side < 0 ? -3 : FIELD_W + 3 };
  const d = dist(q.pos, aim);
  s.state = 'WINDUP'; s.windup = 0; s.throwAway = true; s.hurried = true;
  s.target = null;
  s.throwAwayPlan = { aim, T: d / 22, type: 'BULLET', d };
  s.log.push({ t: +sim.t.toFixed(2), decision: 'THROW_AWAY' });
  qbAction(sim, 'THROW_AWAY', s.pocket?.leak ? `pocket ${s.pocket.leak}` : 'sem janela');
  sim.emit('THROW_AWAY', { id: q.id }, true);
}

// Pocket movement driven by where the pocket is breaking (measured in pocket.js), not by dice:
//   edge pressure + clear front   -> STEP_UP (climb the pocket, away from the edge)
//   edge pressure + front closed  -> ROLL_OUT away from it when the lane outside is open
//   interior pressure             -> SLIDE laterally to the side with more room
//   otherwise                     -> hold the launch point
function pocketVelocity(sim, pi, pk) {
  const q = sim.qb, s = sim.qbState;
  let tgt = s.dropPoint, spd = 0.5;
  if (pi.P > 0.2 && pk.leak) {
    const edgeSign = pk.sector === 'L' ? -1 : pk.sector === 'R' ? 1 : (Math.sign(pi.dir.y) || 1) * -1; // side the pressure comes from
    if (pk.leak === 'EDGE') {
      // Front clear? no defender within 3 yds ahead of the QB in the middle of the pocket.
      let frontClear = true, away = 99;
      for (const d of sim.defense) {
        if (d.down) continue;
        const rel = sub(d.pos, q.pos);
        if (rel.x > 0.5 && rel.x < 3.2 && Math.abs(rel.y) < 2.2 && !(d.eng && d.eng.lev < -0.2)) frontClear = false;
        if (Math.sign(rel.y) === -edgeSign || rel.y === 0) away = Math.min(away, Math.hypot(rel.x, rel.y));
      }
      if (pk.collapse > 0.5 && away > 3.5) {
        // The edge is gone and the middle is closing: leave the pocket away from it.
        qbAction(sim, 'ROLL_OUT', `colapso ${Math.round(pk.collapse * 100)}% borda ${pk.sector}`);
        spd = 0.85;
        tgt = { x: Math.min(sim.losX - 2, q.pos.x + 0.5), y: clamp(q.pos.y - edgeSign * 3.2, sim.by - 11, sim.by + 11) };
      } else if (frontClear && q.pos.x < sim.losX - 3) {
        qbAction(sim, 'STEP_UP', `borda ${pk.sector}`);
        tgt = { x: Math.min(sim.losX - 2.5, q.pos.x + 1.6), y: clamp(q.pos.y - edgeSign * 0.8, sim.by - 4, sim.by + 4) };
      } else if (away > 3.5) {
        qbAction(sim, 'ROLL_OUT', `fora da borda ${pk.sector}`);
        spd = 0.85;
        tgt = { x: Math.min(sim.losX - 2, q.pos.x + 0.5), y: clamp(q.pos.y - edgeSign * 3.2, sim.by - 11, sim.by + 11) };
      } else tgt = { x: q.pos.x - 0.4, y: clamp(q.pos.y - edgeSign * 1.2, sim.by - 5, sim.by + 5) };
    } else {
      // Interior: slide to the side with more room (clearance of the nearest defender on each side).
      const clear = sgn => { let m = 99; for (const d of sim.defense) { if (d.down) continue; const p = { x: q.pos.x, y: q.pos.y + sgn * 2.6 }; m = Math.min(m, dist(d.pos, p) - (d.eng ? 1.2 : 0)); } return m; };
      const side = clear(-1) > clear(1) ? -1 : 1;
      qbAction(sim, 'SLIDE', `interior → ${side < 0 ? 'L' : 'R'}`);
      tgt = { x: q.pos.x - 0.4, y: clamp(q.pos.y + side * 2.6, sim.by - 5.5, sim.by + 5.5) };
    }
  } else if (s.action === 'STEP_UP' || s.action === 'SLIDE' || s.action === 'ROLL_OUT') {
    if (pi.P < 0.1) s.action = null; // pocket cleaned up: next movement is a new action
  }
  return seekVelocity(q, tgt, spd, 0.3);
}
