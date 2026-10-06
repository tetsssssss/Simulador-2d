// NFL play simulator (vertical slice). One play = fixed-timestep simulation of 22 players + ball.
// Pipeline per tick: AI intents -> blocking/engagements -> movement -> collisions -> ball -> contact -> whistle.
// The result (yards, completion, sack, turnover...) is read from the final simulation state, never pre-rolled.
import { createRng, hashSeed } from '../core/rng.js';
import { makeRatings, overall } from '../ratings.js';
import { buildProfile } from './attributes.js';
import { MID_Y, FIELD_W, clamp, dist, norm, sub } from './geometry.js';
import { OFF_SLOTS, DEF_SLOTS, PLAYBOOK, DEF_CALLS, assignSlots, alignment } from './formation.js';
import { steer, integrate, separate, seekVelocity, speedCap } from './movement.js';
import { initRoute, updateRoute, scrambleVelocity } from './routes.js';
import { initCoverage, coverageVelocity, ballReactionVelocity, perceive } from './coverage.js';
import { chooseRushMove, updateEngagements, tryEngage } from './blocking.js';
import { initQB, updateQB } from './qb.js';
import { updateBall } from './ball.js';
import { carrierVelocity, pursuitVelocity, escortVelocity, attemptTackles, checkCarrierDead, isSackable } from './tackle.js';
import { assignRunBlocks, runBlockVelocity } from './runBlocking.js';
import { initRunner, runnerVelocity } from './rbVision.js';
import { updateMoves } from './carrierMoves.js';

export const SIM_HZ = 30;
const MAX_PLAY_TIME = 20;

export function chooseDefCall(rng, down, distance) {
  const long = distance >= 7, short = distance <= 2;
  return rng.weighted([
    ['COVER_3', long ? 0.3 : 0.35], ['COVER_2', long ? 0.3 : 0.2],
    ['COVER_1', short ? 0.4 : 0.25], ['COVER_1_BLITZ', short || down >= 3 ? 0.25 : 0.12],
  ]);
}

export function chooseConcept(rng, playType, down, distance) {
  const book = PLAYBOOK[playType] || PLAYBOOK.pass;
  const names = Object.keys(book);
  if (playType === 'pass' && down >= 3 && distance >= 7) return rng.weighted(names.map(n => [n, n === 'DRIVE' || n === 'CURL_FLAT' ? 2 : 1]));
  return rng.pick(names);
}

function makeEntity(p, slot, side, xy, energy, overrides) {
  const id = p.gsis_id || p.full_name;
  return {
    id, slot, side, p, name: p.full_name, jersey: p.jersey_number || '', prof: buildProfile(p, overrides?.[slot]),
    pos: { x: xy[0], y: xy[1] }, prev: { x: xy[0], y: xy[1] }, home: { x: xy[0], y: xy[1] }, vel: { x: 0, y: 0 }, facing: side === 'off' ? 0 : Math.PI,
    energy: energy?.[id] ?? 1, stun: 0, down: false, hist: [], noBlock: 0, engagedWith: null, eng: null, assignment: null,
  };
}

export function createPlay(opts) {
  const seed = opts.seed ?? 'play';
  const rng = createRng(hashSeed(String(seed)));
  const ballOn = clamp(opts.ballOn ?? 25, 1, 99);
  const losX = 10 + ballOn;
  const by = opts.by ?? MID_Y;
  const down = opts.down ?? 1, distance = opts.distance ?? 10;
  const playType = opts.playType || 'pass';
  const callType = playType === 'run' ? 'run' : 'pass';
  const concept = opts.concept || chooseConcept(rng, playType, down, distance);
  const defCall = opts.defCall || chooseDefCall(rng, down, distance);
  const ratingOf = p => overall(p, makeRatings(p));
  const slots = assignSlots({ offense: opts.offense, defense: opts.defense }, ratingOf);
  for (const s of OFF_SLOTS) if (!slots.off[s]) throw new Error(`Lineup incompleto: falta ${s} no ataque`);
  for (const s of DEF_SLOTS) if (!slots.def[s]) throw new Error(`Lineup incompleto: falta ${s} na defesa`);
  const al = alignment(losX, by, defCall);
  // Run plays: the back aligns deeper (downhill track through the mesh point, ball at speed).
  if (callType === 'run') al.o.RB = [losX - (PLAYBOOK.run[concept]?.pull ? 7.2 : 6.6), by + 0.4 * (PLAYBOOK.run[concept]?.side || 1) * -1];
  const sim = {
    seed, rng, dt: 1 / SIM_HZ, t: 0, tick: 0, losX, by, ballOn, down, distance,
    call: { type: callType, playType, concept, def: defCall, defLabel: DEF_CALLS[defCall].label },
    defCall, off: {}, def: {}, ents: [], offense: [], defense: [], receivers: [],
    engagements: [], events: [], debugEvents: [], phase: callType === 'run' ? 'HANDOFF' : 'PRE_THROW',
    ball: null, carrier: null, passAttempted: false, result: null, meshPoint: null,
  };
  sim.emit = (type, data = {}, debug = false) => {
    const ev = { t: Math.round(sim.t * 100) / 100, type, ...data };
    (debug ? sim.debugEvents : sim.events).push(ev);
    if (type === 'PASS_ATTEMPT') sim.passAttempted = true;
    return ev;
  };
  sim.setCarrier = e => {
    sim.carrier = e; e.carry = null;
    if (e !== sim.qb || sim.qbState?.state === 'RUNNER') sim.phase = 'CARRY';
    if (e.engagedWith) { const eng = e.eng; if (eng) { for (const b of eng.blockers) { b.engagedWith = null; b.eng = null; } sim.engagements.splice(sim.engagements.indexOf(eng), 1); } e.engagedWith = null; e.eng = null; }
  };
  sim.whistle = reason => { if (sim.phase !== 'DEAD') { sim.phase = 'DEAD'; sim.deadReason = reason; sim.result = computeResult(sim); } };

  for (const s of OFF_SLOTS) { const e = makeEntity(slots.off[s], s, 'off', al.o[s], opts.energy, opts.overrides); sim.off[s] = e; sim.offense.push(e); }
  for (const s of DEF_SLOTS) { const e = makeEntity(slots.def[s], s, 'def', al.d[s], opts.energy, opts.overrides); sim.def[s] = e; sim.defense.push(e); }
  sim.ents = [...sim.offense, ...sim.defense];
  sim.qb = sim.off.QB;
  sim.receivers = ['X', 'Z', 'SLOT', 'TE', 'RB'].map(s => sim.off[s]);
  sim.qbStartPos = { ...sim.qb.pos };

  // Defensive assignments (coverage + rush).
  initCoverage(sim);
  for (const e of sim.defense) if (e.assignment?.type === 'RUSH') e.rushMove = chooseRushMove(e, rng);
  for (const e of sim.defense) if (e.assignment?.type === 'RUSH') e.assignment.label += `:${e.rushMove}`;

  if (callType === 'pass') {
    const c = PLAYBOOK[playType][concept];
    for (const s of ['X', 'Z', 'SLOT', 'TE', 'RB']) initRoute(sim.off[s], c[s], s === 'RB' ? -1 : undefined);
    const pairs = { LT: 'LDE', LG: 'LDT', RG: 'RDT', RT: 'RDE' };
    for (const [o, d] of Object.entries(pairs)) sim.off[o].assignment = { type: 'PASS_PRO', target: sim.def[d], label: `PASS_PRO→${d}` };
    sim.off.C.assignment = { type: 'PASS_PRO', target: null, label: 'PASS_PRO:SCAN' };
    initQB(sim, c.reads.map(s => sim.off[s]));
  } else {
    const c = PLAYBOOK.run[concept];
    sim.runSide = c.side;
    sim.meshPoint = { x: losX - 4.3, y: by + (0.6 + (c.mesh || 0)) * c.side };
    sim.runAim = { x: losX + 1, y: clamp(by + c.aim * c.side, 3, FIELD_W - 3) };
    for (const s of ['X', 'Z', 'SLOT']) { initRoute(sim.off[s], 'STALK'); sim.off[s].assignment.label = 'STALK_BLOCK'; }
    sim.off.RB.assignment = { type: 'BALL_CARRIER', label: `${concept}` };
    assignRunBlocks(sim, c);
    initQB(sim, []);
  }
  sim.emit('SNAP', { losX, down, distance, concept, defCall });
  return sim;
}

// ---------- per-role intents ----------

function freeRushers(sim) {
  return sim.defense.filter(d => !d.down && !d.engagedWith && (d.assignment?.type === 'RUSH') && d.pos.x < sim.losX + 3.5);
}

function passProVelocity(sim, e) {
  const q = sim.qb;
  let a = e.assignment.target;
  if (!a || a.down || (a.engagedWith && a.engagedWith !== e) || e.assignment.label === 'PASS_PRO:SCAN') {
    // Scan: most dangerous free rusher, else help on the closest engaged rusher.
    let best = null, bd = 1e9;
    for (const d of freeRushers(sim)) { const dd = dist(d.pos, q.pos) + dist(d.pos, e.pos) * 0.5; if (dd < bd) { bd = dd; best = d; } }
    if (!best) for (const d of sim.defense) if (d.eng && d.eng.blockers.length < 2 && dist(d.pos, e.pos) < 3.5) { const dd = dist(d.pos, e.pos); if (dd < bd) { bd = dd; best = d; } }
    a = best;
  }
  if (!a) return seekVelocity(e, { x: sim.losX - 2, y: e.pos.y }, 0.5, 0.3);
  if (tryEngage(sim, e, a, 'PASS')) return { x: 0, y: 0 };
  // Opportunistic: any free rusher in reach.
  for (const d of freeRushers(sim)) if (tryEngage(sim, e, d, 'PASS')) return { x: 0, y: 0 };
  const u = norm(sub(q.pos, a.pos));
  const tgt = { x: Math.min(sim.losX - 0.3, a.pos.x + u.x * 1.0), y: a.pos.y + u.y * 1.0 };
  return seekVelocity(e, tgt, 0.75 + 0.25 * e.prof.r.blockFootwork, 0.1);
}

// Run defense up front: attack the gap to a controlled depth (squeeze / spill), track the ball laterally, and
// only chase into the backfield when the ball is right there. Penetration depth comes from get-off + recognition.
function runFrontVelocity(sim, e) {
  const c = sim.carrier, ref = c ? c.pos : sim.meshPoint;
  if (c && dist(e.pos, c.pos) < 3.5) return pursuitVelocity(sim, e);
  const R = e.prof.r;
  // Backside end on a run away: honor the QB's boot fake / cutback (contain) for a while -- discipline.
  const backside = /DE$/.test(e.slot) && (e.pos.y - sim.by) * sim.runSide < -2.5;
  if (backside && c && (c.pos.y - sim.by) * sim.runSide > -1 && sim.t < 0.9 + 0.9 * R.discipline)
    return seekVelocity(e, { x: sim.losX - 0.4, y: e.home.y + sim.runSide * 0.8 }, 0.5, 0.2);
  const depthX = sim.losX - 0.3 - 0.9 * (0.5 * R.explosiveness + 0.5 * R.playRecognition);
  // Unblocked and the ball still far: shuffle/squeeze under control instead of sprinting down the line.
  const far = !c || dist(e.pos, c.pos) > 5;
  const sq = e.pos.y + (ref.y - e.pos.y) * (far ? 0.3 : 0.45);
  const tgt = { x: Math.max(depthX, ref.x + 1.2), y: far ? clamp(sq, e.home.y - 2, e.home.y + 2) : sq };
  return seekVelocity(e, tgt, far ? 0.6 : 1, 0.05);
}

function rushVelocity(sim, e) {
  if (sim.call.type === 'run' && sim.carrier?.side !== 'def') return runFrontVelocity(sim, e);
  const goalEnt = sim.carrier || (sim.call.type === 'run' ? null : sim.qb);
  const goal = goalEnt ? goalEnt.pos : (sim.meshPoint || sim.qb.pos);
  const d = dist(e.pos, goal);
  if (goalEnt && d < 6 && !e.engagedWith) return pursuitVelocity(sim, e);
  // Edge rushers keep contain: aim outside the QB until close.
  let tgt = goal;
  if (e.slot.endsWith('DE') && d > 4) tgt = { x: goal.x, y: goal.y + (Math.sign(e.pos.y - goal.y) || 1) * 2.5 };
  return seekVelocity(e, tgt, 1, 0.05);
}

function checkReleaseVelocity(sim, e) {
  // RB: scan for an unblocked rusher first; pick him up, else release into the route.
  if (sim.t < 1.1 && e.assignment.type === 'CHECK_RELEASE') {
    let threat = null, bd = 1e9;
    for (const d of sim.defense) {
      if (d.down || d.engagedWith || d.assignment?.type !== 'RUSH') continue;
      // Already accounted for by a lineman (assigned or the scanning center closing on him)?
      const handled = sim.offense.some(o => o !== e && o.assignment?.type === 'PASS_PRO' && !o.engagedWith && (o.assignment.target === d || (!o.assignment.target && dist(o.pos, d.pos) < 2.5)));
      const dd = dist(d.pos, sim.qb.pos);
      if (!handled && dd < 12 && dd < bd) { bd = dd; threat = d; }
    }
    if (threat && sim.t > 0.2) {
      e.assignment = { type: 'PASS_PRO', target: threat, label: `BLITZ_PICKUP→${threat.slot}` };
      sim.emit('BLITZ_PICKUP', { by: e.id, on: threat.id }, true);
      return passProVelocity(sim, e);
    }
    return seekVelocity(e, { x: sim.qb.pos.x + 0.6, y: sim.qb.pos.y + 1.3 }, 0.5, 0.2);
  }
  if (e.assignment.type === 'PASS_PRO') return passProVelocity(sim, e);
  return updateRoute(sim, e, sim.dt);
}

function offenseIntent(sim, e) {
  const a = e.assignment;
  if (sim.phase === 'CARRY') {
    if (sim.carrier.side !== 'off') return pursuitVelocity(sim, e);
    if (e === sim.qb) return seekVelocity(e, { x: e.pos.x - 1.5, y: e.pos.y - sim.runSide * 2.5 }, 0.6, 0.3); // carry out the fake
    // Designed run: linemen and stalk blockers keep their assignments; everyone else escorts.
    if (sim.call.type === 'run' && (a.type === 'RUN_BLOCK' || (a.type === 'STALK_BLOCK' && e.blockTarget))) {
      if (a.type === 'RUN_BLOCK') return runBlockVelocity(sim, e);
      if (tryEngage(sim, e, e.blockTarget, 'RUN')) return { x: 0, y: 0 };
      if (!e.blockTarget.engagedWith) return seekVelocity(e, e.blockTarget.pos, 0.9, 0.05);
    }
    return escortVelocity(sim, e);
  }
  if (sim.call.type === 'run') {
    if (e.slot === 'RB') {
      // Path through the mesh point toward the aiming point.
      const tgt = dist(e.pos, sim.meshPoint) > 0.8 && e.pos.x < sim.meshPoint.x ? sim.meshPoint : sim.runAim;
      return seekVelocity(e, tgt, 1, 0);
    }
    if (a.type === 'RUN_BLOCK') return runBlockVelocity(sim, e);
    if (a.type === 'STALK_BLOCK') {
      if (e.route.t > 0.8 && e.blockTarget) { if (tryEngage(sim, e, e.blockTarget, 'RUN')) return { x: 0, y: 0 }; return seekVelocity(e, e.blockTarget.pos, 0.9, 0.05); }
      return updateRoute(sim, e, sim.dt);
    }
    return { x: 0, y: 0 };
  }
  if (a.type === 'PASS_PRO') return passProVelocity(sim, e);
  if (sim.phase === 'BALL_AIR') {
    const b = sim.ball;
    if (b && b.target === e && sim.t - b.releaseT > 0.04 + 0.16 * (1 - e.prof.r.awareness)) {
      const remain = Math.max(0.05, b.T - b.t);
      const need = dist(e.pos, b.aim) / remain;
      return seekVelocity(e, b.aim, clamp(need / speedCap(e), 0.5, 1), 0.05);
    }
    if (e.route) { const v = e.route.check ? checkReleaseVelocity(sim, e) : updateRoute(sim, e, sim.dt); return { x: v.x * 0.7, y: v.y * 0.7 }; }
    return { x: 0, y: 0 };
  }
  if (sim.phase === 'SCRAMBLE' && e.route && !e.route.check) return scrambleVelocity(sim, e);
  if (e.route?.check) return checkReleaseVelocity(sim, e);
  if (e.route) return updateRoute(sim, e, sim.dt);
  return { x: 0, y: 0 };
}

// Run fit (second level): after reading run, fill downhill to the line on the ball's track and keep leverage;
// attack the carrier once he is close or has crossed the line (no blind crash into the backfield).
function runFitVelocity(sim, e) {
  const c = sim.carrier;
  if (!c) return seekVelocity(e, { x: sim.losX + 1.5, y: e.pos.y + (sim.meshPoint.y - e.pos.y) * 0.4 }, 0.7, 0.2);
  const dc = dist(e.pos, c.pos);
  if (dc < 3.2 || c.pos.x > sim.losX + 0.3 || e.pos.x < sim.losX + 0.3) return pursuitVelocity(sim, e);
  const R = e.prof.r;
  const lead = 0.25 + 0.35 * R.playRecognition;
  // Downhill under control: fit at the second level until the ball comes, then trigger. He tracks the ball as
  // he perceives it (read delay): misdirection (counter step, pullers) pulls slow readers out of position.
  const near = dc < 5.5;
  const pc = perceive(sim, c, e.readDelay ?? 0.25);
  const tgt = { x: Math.max(sim.losX + (near ? 0.6 : 1.4), Math.min(e.pos.x, c.pos.x + 3)), y: pc.y + pc.vy * lead };
  return seekVelocity(e, tgt, near ? 1 : 0.8, 0.05);
}

function defenseIntent(sim, e) {
  const a = e.assignment;
  if (sim.phase === 'CARRY') {
    if (sim.carrier.side === 'def') return escortVelocity(sim, e);
    // Designed run: fronts squeeze, backers fit, until the ball declares (then everybody pursues).
    if (sim.call.type === 'run' && sim.carrier === sim.off.RB) {
      if (a.type === 'RUSH') return runFrontVelocity(sim, e);
      if (sim.t > e.runRead) return runFitVelocity(sim, e);
      return coverageVelocity(sim, e);
    }
    return pursuitVelocity(sim, e);
  }
  if (sim.call.type === 'run' && a.type !== 'RUSH' && sim.t > e.runRead) {
    if (!e.flaggedRun) { e.flaggedRun = true; sim.emit('RUN_READ', { by: e.id }, true); }
    return runFitVelocity(sim, e);
  }
  if (a.type === 'RUSH') return rushVelocity(sim, e);
  if (sim.phase === 'BALL_AIR') {
    const v = ballReactionVelocity(sim, e);
    if (v) return v;
  }
  if (sim.phase === 'SCRAMBLE' && sim.t - (sim.scrambleT || 0) > e.ballReact + 0.3 && dist(e.pos, sim.qb.pos) < 10) return pursuitVelocity(sim, e);
  return coverageVelocity(sim, e);
}

// Ball carrier: moves before contact; a designed-run RB reads the line (RunningBackDecisionEngine) until he is
// through it, then runs in the open field.
function carrierIntent(sim, e) {
  if (!isSackable(sim, e)) updateMoves(sim, e);
  if (e.run && e.run.phase !== 'OPEN') { const v = runnerVelocity(sim, e); if (v) return v; }
  return carrierVelocity(sim, e);
}

// ---------- simulation step ----------

export function step(sim) {
  if (sim.phase === 'DEAD') return false;
  const dt = sim.dt;
  sim.t += dt; sim.tick++;
  for (const e of sim.ents) { e.prev.x = e.pos.x; e.prev.y = e.pos.y; if (e.noBlock > 0) e.noBlock -= dt; }
  if (sim.ball) sim.ball.prev = { x: sim.ball.pos.x, y: sim.ball.pos.y, z: sim.ball.z };

  // 1. intents
  for (const e of sim.ents) {
    if (e.down) { e.vel.x = 0; e.vel.y = 0; continue; }
    if (e.engagedWith) continue;
    let desired;
    if (e === sim.qb && sim.call.type === 'pass' && sim.carrier !== e) {
      desired = updateQB(sim, dt);
      if (desired === null) {
        if (!sim.scrambleT) { sim.scrambleT = sim.t; }
        desired = carrierIntent(sim, e);
        if (sim.qbState.state === 'RUNNER' && sim.carrier !== e) sim.setCarrier(e);
      }
    } else if (e === sim.qb && sim.call.type === 'run' && !sim.carrier) desired = updateQB(sim, dt);
    else if (e === sim.carrier) desired = carrierIntent(sim, e);
    else if (e === sim.qb && sim.phase !== 'CARRY') desired = seekVelocity(e, e.pos, 0.2);
    else desired = e.side === 'off' ? offenseIntent(sim, e) : defenseIntent(sim, e);
    if (e.engagedWith) continue; // became engaged while choosing intent
    steer(e, desired, dt);
  }
  // 2. blocking
  updateEngagements(sim, dt);
  // 3. movement + collisions
  for (const e of sim.ents) if (!e.engagedWith && !e.down) integrate(e, dt);
  separate(sim.ents, dt, sim.carrier);
  for (const e of sim.ents) { e.hist.push({ x: e.pos.x, y: e.pos.y, vx: e.vel.x, vy: e.vel.y }); if (e.hist.length > 40) e.hist.shift(); }

  // 4. handoff
  if (sim.call.type === 'run' && !sim.carrier) {
    const rb = sim.off.RB;
    if (sim.t > 0.45 && dist(rb.pos, sim.qb.pos) < 1.2) {
      sim.emit('HANDOFF', { from: sim.qb.id, to: rb.id });
      sim.setCarrier(rb);
      rb.carry = { heading: Math.atan2(sim.runAim.y - rb.pos.y, sim.runAim.x - rb.pos.x), nextPick: sim.t + 0.2 };
      initRunner(sim, rb);
      sim.qbState.state = 'DONE';
    } else if (sim.t > 3) {
      sim.emit('FUMBLE', { carrier: sim.qb.id, forcedBy: null, x: +sim.qb.pos.x.toFixed(1), reason: 'MESH' });
      sim.whistle('FUMBLE');
    }
  }
  // 5. ball
  if (sim.ball) updateBall(sim, dt);
  if (sim.phase === 'DEAD') return false;
  // 6. contact and boundaries
  attemptTackles(sim);
  if (sim.phase === 'DEAD') return false;
  checkCarrierDead(sim);
  if (sim.phase !== 'DEAD' && sim.call.type === 'pass' && !sim.carrier && (sim.qb.pos.y < 0 || sim.qb.pos.y > FIELD_W)) {
    sim.emit('OUT_OF_BOUNDS', { carrier: sim.qb.id, x: +sim.qb.pos.x.toFixed(1) });
    sim.whistle('OUT_OF_BOUNDS');
  }
  if (sim.phase !== 'DEAD' && sim.t >= MAX_PLAY_TIME) sim.whistle('TIME');
  return sim.phase !== 'DEAD';
}

export function runToEnd(sim) { while (step(sim)); return sim.result; }

// ---------- result (read from final state) ----------

function computeResult(sim) {
  const ev = sim.events;
  const has = t => ev.some(e => e.type === t);
  const find = t => ev.find(e => e.type === t);
  const losX = sim.losX;
  const r = {
    seed: sim.seed, playType: sim.call.playType, concept: sim.call.concept, defCall: sim.defCall, defLabel: sim.call.defLabel,
    outcome: '', yards: 0, spotX: losX, turnover: false, touchdown: null, safety: false, clockStops: false,
    duration: Math.round(sim.t * 100) / 100, reason: sim.deadReason, events: ev,
    // Yards before first contact (relative to the LOS), for calibration (YBC / YAC split).
    contactX: sim.firstContact ? Math.round((sim.firstContact.x - losX) * 10) / 10 : null,
  };
  const c = sim.carrier;
  const fumbleRec = find('FUMBLE_RECOVERY');
  const td = find('TOUCHDOWN');
  if (find('INTERCEPTION')) {
    r.outcome = 'INTERCEPTION'; r.turnover = true; r.clockStops = true;
    r.spotX = clamp(c ? c.pos.x : losX, 0, 120);
    if (td) r.touchdown = 'def';
  } else if (fumbleRec && fumbleRec.lost) {
    r.outcome = 'FUMBLE_LOST'; r.turnover = true; r.clockStops = true;
    r.spotX = clamp(sim.fumbleSpot?.x ?? losX, 0, 120);
  } else if (sim.deadReason === 'FUMBLE' && !fumbleRec) {
    r.outcome = 'FUMBLE_LOST'; r.turnover = true; r.clockStops = true; r.spotX = sim.qb.pos.x;
  } else if (has('PASS_ATTEMPT') && !has('PASS_COMPLETE')) {
    r.outcome = 'INCOMPLETE'; r.clockStops = true; r.spotX = losX;
  } else if (sim.deadReason === 'SACK' || (sim.call.type === 'pass' && !has('PASS_ATTEMPT') && sim.qb.pos.x < losX && (!c || c === sim.qb))) {
    r.outcome = 'SACK';
    r.spotX = (fumbleRec ? sim.fumbleSpot.x : sim.qb.pos.x);
    if (!has('SACK')) sim.emit('SACK', { by: null, qb: sim.qb.id, x: +r.spotX.toFixed(1) });
  } else if (has('PASS_COMPLETE')) {
    r.outcome = 'COMPLETE'; r.spotX = fumbleRec ? sim.fumbleSpot.x : c.pos.x;
  } else if (sim.call.type === 'pass' && c === sim.qb) {
    r.outcome = 'SCRAMBLE'; r.spotX = fumbleRec ? sim.fumbleSpot.x : c.pos.x;
  } else {
    r.outcome = 'RUSH'; r.spotX = c ? (fumbleRec ? sim.fumbleSpot.x : c.pos.x) : losX;
  }
  if (!r.turnover && td && td.side === 'off') { r.touchdown = 'off'; r.spotX = 110; }
  r.spotX = Math.round(clamp(r.spotX, 0, 120) * 10) / 10;
  if (!r.turnover) {
    r.yards = Math.round(r.spotX - losX);
    if (r.spotX <= 10 && !r.touchdown) { r.safety = true; sim.emit('SAFETY', { x: r.spotX }); }
  }
  if (has('OUT_OF_BOUNDS') || r.touchdown || r.safety) r.clockStops = true;
  sim.emit('WHISTLE', { reason: sim.deadReason, outcome: r.outcome, yards: r.yards, spotX: r.spotX });
  return r;
}
