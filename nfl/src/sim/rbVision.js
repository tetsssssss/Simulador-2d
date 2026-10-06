// RunningBackDecisionEngine: the ball carrier on a designed run reads the line of scrimmage.
// It builds the real lanes (gaps between bodies at the line), scores each one (width, free defenders, closing
// speed / pursuit angle, blockers, first down, sideline, play design) from what the RB perceives, and picks a
// decision: FOLLOW_BLOCK, CUTBACK, BOUNCE, CUT_INSIDE, ACCELERATE or HESITATE. Nothing is picked at random:
// perception noise and field of view come from vision/awareness, commitment and cut cost from agility,
// patience from vision (+ balance while stuttering), time to the hole from speed/acceleration, trust in the
// design from discipline.
// Once through the line the carrier switches to open-field running (tackle.js carrierVelocity).
import { FIELD_W, clamp, dist, distToSegment, fromAngle } from './geometry.js';
import { seekVelocity, speedCap } from './movement.js';
import { perceive } from './coverage.js';

export const RB_DECISIONS = ['FOLLOW_BLOCK', 'CUTBACK', 'BOUNCE', 'CUT_INSIDE', 'ACCELERATE', 'HESITATE'];
const BODY_HALF = 0.48;

export function initRunner(sim, rb) {
  const R = rb.prof.r;
  rb.run = {
    phase: 'PRESS', decision: null, lane: null, handoffT: sim.t, nextEval: sim.t, hesitated: 0,
    pressTime: (sim.runPlan.press ?? 0.32) - 0.12 * R.vision,            // stay on the designed track this long
    patience: 0.2 + 0.55 * R.vision,                                   // how long he can wait for a block
    evalEvery: clamp(0.17 - 0.08 * R.awareness, 0.08, 0.17),
    perceiveDelay: clamp(0.22 - 0.16 * R.awareness, 0.05, 0.22),
    fov: (40 + 75 * R.vision) * Math.PI / 180,                           // half-angle he reads well
    history: [], noise: new Map(),
  };
}

// Bodies that form the wall at the line, as lateral intervals.
function wall(sim, rb) {
  const xs = [];
  for (const e of sim.ents) {
    if (e === rb || e === sim.qb || e.down) continue;
    if (e.pos.x < sim.losX - 1.8 || e.pos.x > sim.losX + 3.2) continue;
    if (Math.abs(e.pos.y - rb.pos.y) > 18) continue;
    xs.push({ lo: e.pos.y - BODY_HALF, hi: e.pos.y + BODY_HALF, e });
  }
  xs.sort((a, b) => a.lo - b.lo);
  return xs;
}

// Candidate lanes: gaps between bodies (wide gaps give a lane on each edge), plus the two outside edges.
function buildLanes(sim, rb) {
  const bodies = wall(sim, rb);
  const lanes = [];
  const add = (y, width, outer) => { if (y > 1 && y < FIELD_W - 1) lanes.push({ y, width, outer }); };
  let prev = 1;
  for (let i = 0; i <= bodies.length; i++) {
    const lo = prev, hi = i < bodies.length ? bodies[i].lo : FIELD_W - 1;
    const w = hi - lo, outer = i === 0 || i === bodies.length;
    if (w >= 0.35) {
      if (w > 3.6) { if (i > 0) add(lo + 1.4, w, outer); if (i < bodies.length) add(hi - 1.4, w, outer); }
      else add((lo + hi) / 2, w, outer);
    }
    if (i < bodies.length) prev = Math.max(prev, bodies[i].hi);
  }
  // The designed hole is always a candidate, even while it is still being created (pullers, combos).
  const aimY = sim.runPlan.aimY;
  if (!lanes.some(l => Math.abs(l.y - aimY) < 1)) {
    let lo = 1, hi = FIELD_W - 1;
    for (const b of bodies) { if (b.hi <= aimY) lo = Math.max(lo, b.hi); if (b.lo >= aimY) hi = Math.min(hi, b.lo); }
    add(aimY, Math.max(0.1, hi - lo), false);
  }
  return lanes.filter(l => Math.abs(l.y - rb.pos.y) < 14);
}

// Time margin of the first defender to point P versus the RB (seconds; negative = he gets there first).
// Blocked defenders need time to get off the block; a defender with a free blocker in his path is accounted for.
function marginAt(sim, rb, P, tRB, delay, collectFree) {
  let worst = 3;
  for (const d of sim.defense) {
    if (d.down) continue;
    const pd = perceive(sim, d, delay);
    const dd = Math.hypot(pd.x - P.x, pd.y - P.y);
    if (dd > 16) continue;
    let extra = d.stun || 0;
    if (d.eng) extra += d.eng.lev < 0 ? 0.8 + 0.5 * Math.min(1, -d.eng.lev) : Math.max(0.1, 0.55 - 0.45 * d.eng.lev);
    else {
      for (const o of sim.offense) {
        if (o === rb || o === sim.qb || o.down || o.engagedWith || o.noBlock > 0) continue;
        const between = distToSegment(o.pos, d.pos, P) < 1.0 && dist(o.pos, d.pos) < dd;
        const onHim = o.assignment?.target === d && dist(o.pos, d.pos) < 3.5;
        if (between || onHim) { extra += 0.45; break; }
      }
    }
    const cap = Math.max(3, speedCap(d));
    // Closing speed / pursuit angle: already moving at P = arrives sooner; flowing away = must turn first.
    const closing = dd > 0.01 ? (pd.vx * (P.x - pd.x) + pd.vy * (P.y - pd.y)) / dd : 0;
    const avg = clamp((cap + closing) / 2, 1.6, cap);
    const m = Math.max(0, dd - d.prof.reach - 0.3) / avg + extra - tRB;
    if (m < worst) worst = m;
    if (collectFree && !d.eng && m < 0.4) collectFree.add(d);
  }
  return worst;
}

function timeTo(rb, P, agility) {
  const cap = Math.max(4, speedCap(rb));
  const sp = Math.hypot(rb.vel.x, rb.vel.y);
  const want = Math.atan2(P.y - rb.pos.y, P.x - rb.pos.x);
  const cur = sp > 0.5 ? Math.atan2(rb.vel.y, rb.vel.x) : want;
  let da = Math.abs(want - cur); if (da > Math.PI) da = 2 * Math.PI - da;
  // Travel at ~cruise speed + time lost getting up to speed (acceleration / burst) + cost of turning (agility).
  const burst = Math.max(0, 0.85 * cap - sp) / (2 * rb.prof.accel);
  return dist(rb.pos, P) / (0.85 * cap) + burst + (da / Math.PI) * (0.5 - 0.3 * agility) * Math.min(1, sp / 4);
}

export function scoreLanes(sim, rb, noise = true) {
  const R = rb.prof.r, run = rb.run, plan = sim.runPlan, s = sim.runSide;
  const xP = Math.max(sim.losX + 0.8, rb.pos.x + 1.2);
  const lanes = buildLanes(sim, rb);
  const free = new Set();
  const aimU = (plan.aimY - sim.by) * s;
  const ys = lanes.map(l => (l.y - sim.by) * s);
  const maxU = Math.max(...ys);
  const togo = sim.distance;
  const heading = Math.hypot(rb.vel.x, rb.vel.y) > 1 ? Math.atan2(rb.vel.y, rb.vel.x) : 0;
  for (const l of lanes) {
    const P = { x: xP, y: l.y }, P2 = { x: xP + 5, y: l.y + (l.y - rb.pos.y) * 0.15 }, P3 = { x: xP + 10, y: P2.y };
    const tRB = timeTo(rb, P, R.agility);
    const t2 = tRB + 5 / Math.max(4, speedCap(rb)), t3 = t2 + 5 / Math.max(4, speedCap(rb));
    const m1 = marginAt(sim, rb, P, tRB, run.perceiveDelay, free);
    const m2 = marginAt(sim, rb, P2, t2, run.perceiveDelay);
    const m3 = marginAt(sim, rb, P3, t3, run.perceiveDelay);
    // Blockers: a lead blocker in the corridor ahead of me, and winning blocks bordering the lane.
    let support = 0, lead = null;
    for (const o of sim.offense) {
      if (o === rb || o === sim.qb || o.down) continue;
      if (!o.engagedWith && o.pos.x > rb.pos.x + 0.5 && o.pos.x < P2.x && Math.abs(o.pos.y - (rb.pos.y + (l.y - rb.pos.y) * clamp((o.pos.x - rb.pos.x) / (P.x - rb.pos.x + 0.01), 0, 1.3))) < 1.6) {
        support += 0.6; if (!lead || o.pos.x < lead.pos.x) lead = o;
      } else if (o.eng && o.eng.lev < 0 && Math.abs(o.pos.y - l.y) < 1.5 && Math.abs(o.pos.x - xP) < 2.5) support += 0.2;
    }
    // Pullers still in transit are coming to the designed hole: the RB trusts that timing.
    if (Math.abs(l.y - plan.aimY) < 2) for (const o of sim.offense) if (o.assignment?.tech === 'PULL' && !o.engagedWith && !o.down) support += 0.7;
    support = Math.min(1.8, support);
    const proj = m3 > 0.2 ? 10 : m2 > 0.2 ? 5 : m1 > 0 ? 2.5 : 0;
    const fd = proj >= togo ? (sim.down >= 3 ? 1.3 : 0.6) : 0;
    const dS = Math.min(l.y, FIELD_W - l.y);
    const side = dS < 5 ? (5 - dS) * 0.4 : 0;
    const dDesign = Math.abs(l.y - plan.aimY);
    const design = (0.3 + 0.7 * R.discipline) * Math.max(0, 1 - dDesign / 6);
    const lateral = Math.abs(l.y - rb.pos.y) * (0.08 + 0.1 * (1 - R.agility));
    // Path obstruction: a defender's body (blocked or not) sitting on my track to the hole.
    let blockedPath = 0;
    for (const d of sim.defense) if (!d.down && distToSegment(d.pos, rb.pos, P) < 0.75 && dist(d.pos, rb.pos) > 0.3) blockedPath += 1;
    let score = 0.5 * Math.min(l.width, 2.6) + 2.2 * clamp(m1, -1.2, 0.8) + 1.0 * clamp(m2, -1, 1) + 0.4 * clamp(m3, -1, 1)
      + support + fd + 0.1 * proj - side + design - lateral - 1.2 * Math.min(2, blockedPath);
    // Perception: outside the field of view he reads it late and poorly.
    const ang = Math.abs(Math.atan2(l.y - rb.pos.y, Math.max(0.5, xP - rb.pos.x)) - heading);
    const blind = ang > run.fov ? 1 : 0;
    l.trueScore = score;
    if (noise) {
      // Misreads are persistent (AR(1) per lane region), not re-rolled every look: no random dithering.
      const key = Math.round(l.y / 1.5);
      const prev = run.noise.get(key);
      const sd = 0.2 + 0.9 * (1 - R.vision) + blind * 0.7 * (1 - R.vision);
      const n = prev === undefined ? sim.rng.normal(0, sd) : 0.85 * prev + 0.53 * sim.rng.normal(0, sd);
      run.noise.set(key, n);
      score += n - blind * (0.9 - 0.7 * R.vision);
    }
    const u = (l.y - sim.by) * s;
    l.type = l.outer && u >= maxU - 0.01 && u > aimU + 1 ? 'BOUNCE' : u < Math.min(aimU - 3.5, 0.5) ? 'CUTBACK' : u < aimU - 1.2 ? 'CUT_INSIDE' : 'FOLLOW';
    Object.assign(l, { x: xP, score, m1, m2, m3, support, lead, proj });
  }
  return { lanes, free };
}

export function decideRun(sim, rb) {
  const run = rb.run, R = rb.prof.r;
  const { lanes, free } = scoreLanes(sim, rb);
  sim.runDebug = { lanes, free: [...free].map(d => d.id), chosen: null, decision: run.decision };
  if (!lanes.length) { run.phase = 'OPEN'; return; }
  let best = lanes[0];
  for (const l of lanes) if (l.score > best.score) best = l;
  // Commitment: keep the current lane unless another one is clearly better (cutting costs speed).
  let cur = run.lane ? lanes.reduce((m, l) => (!m || Math.abs(l.y - run.lane.y) < Math.abs(m.y - run.lane.y) ? l : m), null) : null;
  if (cur && Math.abs(cur.y - run.lane.y) > 1.3) cur = null;
  // Stalled (bounced off a body): no commitment to a lane that is not going anywhere.
  if (cur && Math.hypot(rb.vel.x, rb.vel.y) < 2.5 && sim.t - run.handoffT > 0.4) cur = null;
  const switchCost = 0.35 + 0.6 * (1 - R.agility);
  let chosen = cur && best !== cur && best.score < cur.score + switchCost ? cur : best;
  const sinceHandoff = sim.t - run.handoffT;
  let decision;
  if (run.phase === 'PRESS') {
    // Pressing the designed track: only a clearly better lane makes him leave the design this early.
    const design = lanes.reduce((m, l) => (!m || Math.abs(l.y - sim.runPlan.aimY) < Math.abs(m.y - sim.runPlan.aimY) ? l : m), null);
    if (best.score < design.score + 1.0 + 0.8 * (1 - R.vision)) chosen = design;
  }
  // Patience (HESITATE): the hole is not there yet but a block next to it is still developing, nobody is about to
  // hit me and I am still in the backfield -> stutter and let it open.
  const crowded = sim.defense.some(d => !d.down && !d.eng && dist(d.pos, rb.pos) < 3.5);
  const developing = sim.offense.some(o => o.eng && o.eng.lev < -0.1 && Math.abs(o.pos.y - chosen.y) < 2.2);
  if (chosen.m1 < -0.15 && developing && !crowded && run.hesitated < run.patience * 0.45 && sinceHandoff > run.pressTime && rb.pos.x < sim.losX - 1.5) decision = 'HESITATE';
  else if (chosen.type !== 'FOLLOW') decision = chosen.type;             // CUTBACK / BOUNCE / CUT_INSIDE
  else if (chosen.m1 > 0.45 && chosen.m2 > 0.25) decision = 'ACCELERATE'; // design hole is clean: hit it
  else decision = 'FOLLOW_BLOCK';
  const prevY = run.lane?.y;
  if (decision !== run.decision || prevY === undefined || Math.abs(chosen.y - prevY) > 1.3) {
    const ev = { decision, laneY: +chosen.y.toFixed(1), laneType: chosen.type, score: +chosen.score.toFixed(2), lanes: lanes.length, free: free.size };
    sim.emit('RB_DECISION', ev, true);
    run.history.push({ t: +sim.t.toFixed(2), ...ev });
    // Hard direction change at speed = a cut (plant foot): agility makes it sharper, costs a little speed.
    const sp = Math.hypot(rb.vel.x, rb.vel.y);
    if (prevY !== undefined && Math.abs(chosen.y - prevY) > 2.5 && sp > 3) startCut(sim, rb);
  }
  // Gap schemes: on the design lane, a puller still on his way is THE lead blocker (read his hip).
  if (decision === 'FOLLOW_BLOCK' && Math.abs(chosen.y - sim.runPlan.aimY) < 2) {
    const puller = sim.offense.find(o => o.assignment?.tech === 'PULL' && !o.engagedWith && !o.down && o.pos.x > rb.pos.x);
    if (puller) chosen.lead = puller;
  }
  run.decision = decision; run.lane = chosen;
  sim.runDebug.chosen = chosen; sim.runDebug.decision = decision;
}

function startCut(sim, rb) {
  const R = rb.prof.r;
  const ms = rb.moveState || (rb.moveState = { cur: null, cd: 0 });
  if (ms.cur) return;
  ms.cur = { type: 'CUT', until: sim.t + 0.25, q: 0.5 * R.agility + 0.5 * R.changeOfDirection - 0.5, vs: null };
  rb.turnMul = 1.4 + 0.8 * (0.5 * R.agility + 0.5 * R.changeOfDirection);
  rb.speedMul = 0.9 + 0.08 * R.changeOfDirection;
  sim.emit('RB_MOVE', { move: 'CUT', by: rb.id, vs: null, q: +ms.cur.q.toFixed(2) }, true);
}

// Desired velocity of the designed-run carrier before he is through the line.
export function runnerVelocity(sim, rb) {
  const run = rb.run;
  if (rb.pos.x > sim.losX + 1.4 || sim.t - run.handoffT > 2.2) { run.phase = 'OPEN'; return null; }
  if (run.phase === 'PRESS' && (sim.t - run.handoffT > run.pressTime || rb.pos.x > sim.losX - 2.2)) run.phase = 'READ';
  if (sim.t >= run.nextEval) { run.nextEval = sim.t + run.evalEvery; decideRun(sim, rb); }
  if (run.phase === 'OPEN' || !run.lane) return null;
  if (run.decision === 'HESITATE') run.hesitated += sim.dt;
  const mv = rb.moveState?.cur;
  if (mv && mv.heading != null) { const u = fromAngle(mv.heading); const cap = speedCap(rb); return { x: u.x * cap, y: u.y * cap }; }
  const l = run.lane, R = rb.prof.r;
  switch (run.decision) {
    case 'HESITATE': // stutter: gather, drift toward the best look, let the blocks develop
      return seekVelocity(rb, { x: rb.pos.x + 2, y: rb.pos.y + clamp(l.y - rb.pos.y, -1.5, 1.5) }, 0.5 + 0.15 * R.balance, 0);
    case 'ACCELERATE':
      return seekVelocity(rb, { x: l.x + 4, y: l.y }, 1, 0);
    case 'FOLLOW_BLOCK':
      // A puller still running flat: stay on his inside hip, he opens the door.
      if (l.lead && l.lead.assignment?.tech === 'PULL' && !l.lead.assignment.pulled && !l.lead.engagedWith)
        return seekVelocity(rb, { x: Math.min(l.lead.pos.x - 1.6, sim.losX - 1.6), y: l.lead.pos.y - sim.runSide * 0.6 }, 0.85, 0);
      // Read the lead blocker's hip: aim just off his shoulder, never stack up behind a slow lineman.
      if (l.lead && !l.lead.engagedWith && l.lead.vel.x > 1.5) return seekVelocity(rb, { x: Math.max(l.lead.pos.x + 1.5, rb.pos.x + 2.5), y: l.lead.pos.y + (l.y - l.lead.pos.y) * 0.6 }, 0.95, 0);
      return seekVelocity(rb, { x: l.x + 2, y: l.y }, 0.95, 0);
    default: // CUTBACK / BOUNCE / CUT_INSIDE
      return seekVelocity(rb, { x: l.x + 2, y: l.y }, 0.95, 0);
  }
}
