// BlockingSystem + PassRushSystem.
// A block is an engagement with a continuous leverage value (lev > 0 favors the defender).
// Leverage evolves from the attribute matchup of the chosen technique, mass, fatigue and contextual noise;
// the engaged pair physically moves (pocket compression / run push), and sheds or stalemates emerge from lev.
// Run blocks add body position: the blocker's angle between the defender and the ball (fit) is fought over
// continuously (footwork vs agility), and a technique (REACH/DRIVE/SEAL/KICK/...) sets where he drives the man.
// Double teams: DOUBLE -> CONTROL (defender moved off the ball) -> READ LB -> one blocker CLIMBs to the backer.
import { dist, norm, sub, clamp } from './geometry.js';
import { labelBlock } from './runBlocking.js';

// Pass-rush moves. Each one is a distinct attribute contest (defender score vs the blocker's answer) plus a
// signature: SPEED bends the edge, POWER drives the blocker back, FINESSE is the generic swipe/club, RIP dips under
// the arm (bend), SWIM goes over the top (hands), SPIN is high-variance (rewards a clean spin, punishes a failed one)
// and COUNTER is only used after a first move stalled (reads the blocker's overset).
export const RUSH_MOVES = ['SPEED', 'POWER', 'FINESSE', 'RIP', 'SWIM', 'SPIN', 'COUNTER'];
export const BASE_RUSH_MOVES = ['SPEED', 'POWER', 'FINESSE'];
export const RUSH_MOVE_LABEL = { SPEED: 'Speed rush', POWER: 'Bull rush', FINESSE: 'Finesse', RIP: 'Rip', SWIM: 'Swim', SPIN: 'Spin', COUNTER: 'Counter' };

// The first rusher draw is unchanged (one RNG call per rusher); chooseRushMove returns SPEED/POWER/FINESSE.
export function chooseRushMove(def, rng) {
  const r = def.prof.r;
  return rng.weighted([
    ['SPEED', 0.2 + r.speed * 0.9 + r.explosiveness * 0.6],
    ['POWER', 0.2 + r.strength * 1.1 + (def.prof.mass - 1) * 1.2],
    ['FINESSE', 0.2 + r.passRush * 0.9 + r.agility * 0.4],
  ]);
}

// Refine the base family into the specific move (RIP/SWIM/SPIN) from the rusher's attributes. `rng` is a forked
// stream (sim.rng.fork) so the main play stream is not perturbed by the extra draws.
export function refineRushMove(def, base, rng) {
  const r = def.prof.r;
  if (base === 'SPEED') return rng.weighted([['SPEED', 0.5 + r.speed * 0.6], ['RIP', 0.15 + 0.9 * (0.5 * r.agility + 0.5 * r.explosiveness) + 0.3 * r.passRush]]);
  if (base === 'FINESSE') return rng.weighted([['FINESSE', 0.45], ['SWIM', 0.12 + 0.8 * r.passRush], ['SPIN', 0.06 + 0.7 * (0.6 * r.agility + 0.4 * r.changeOfDirection) * (1 - 0.4 * (def.prof.mass - 0.7))]]);
  return base;
}

// Calibration: the specialist moves are not strictly better than the base family (set-up cost / risk).
const MOVE_EDGE = { RIP: 0.9, SWIM: 0.9, SPIN: 0.88, COUNTER: 1.0 };
function rushScores(move, D, d) {
  return (MOVE_EDGE[move] ?? 1) * rushRaw(move, D, d);
}
function rushRaw(move, D, d) {
  switch (move) {
    case 'SPEED': return 0.5 * D.speed + 0.3 * D.explosiveness + 0.2 * D.passRush;
    case 'POWER': return 0.45 * D.strength + 0.25 * D.passRush + 0.3 * (0.5 + (d.prof.mass - 1) * 1.5);
    case 'RIP': return 0.35 * D.explosiveness + 0.3 * D.agility + 0.35 * D.passRush;
    case 'SWIM': return 0.5 * D.passRush + 0.3 * D.agility + 0.2 * D.strength;
    case 'SPIN': return 0.35 * D.agility + 0.25 * D.changeOfDirection + 0.2 * D.explosiveness + 0.2 * D.passRush;
    case 'COUNTER': return 0.4 * D.passRush + 0.3 * D.playRecognition + 0.3 * D.agility;
    default: return 0.6 * D.passRush + 0.2 * D.agility + 0.2 * D.explosiveness; // FINESSE
  }
}
function blockScores(move, B, b) {
  switch (move) {
    case 'SPEED': return 0.5 * B.blockFootwork + 0.3 * B.passBlock + 0.2 * B.agility;
    case 'POWER': return 0.45 * B.blockStrength + 0.25 * B.passBlock + 0.3 * (0.5 + (b.prof.mass - 1) * 1.5);
    case 'RIP': return 0.4 * B.blockFootwork + 0.35 * B.passBlock + 0.25 * B.awareness;
    case 'SWIM': return 0.5 * B.passBlock + 0.25 * B.awareness + 0.25 * B.blockStrength;
    case 'SPIN': return 0.45 * B.blockFootwork + 0.35 * B.awareness + 0.2 * B.passBlock;
    case 'COUNTER': return 0.45 * B.awareness + 0.3 * B.passBlock + 0.25 * B.blockFootwork;
    default: return 0.5 * B.passBlock + 0.3 * B.blockFootwork + 0.2 * B.awareness;
  }
}

function matchup(eng) {
  const d = eng.def, D = d.prof.r, en = x => 0.82 + 0.18 * x.energy;
  const blockers = eng.blockers;
  let bScore = 0;
  for (const b of blockers) {
    const B = b.prof.r;
    let s;
    if (eng.mode === 'RUN') {
      const tech = b.assignment?.tech;
      if (tech === 'REACH' || tech === 'SEAL' || tech === 'CLIMB' || (tech === 'PULL' && b.assignment.role === 'LEAD'))
        s = 0.35 * B.runBlock + 0.35 * B.blockFootwork + 0.15 * B.agility + 0.15 * B.blockStrength + 0.08 * (b.prof.mass - 1);
      else s = 0.4 * B.runBlock + 0.4 * B.blockStrength + 0.2 * B.blockFootwork + 0.14 * (b.prof.mass - 1);
      // Pullers and kick-out blocks arrive with momentum.
      if (tech === 'PULL' && eng.t < 0.4) s += 0.08;
    }
    else s = blockScores(eng.move, B, b);
    bScore += s * en(b) * (b.stun > 0 ? 0.5 : 1);
  }
  if (blockers.length > 1) bScore *= 0.68; // double team ~1.36x a single blocker
  let dScore;
  if (eng.mode === 'RUN') {
    // Second-level defenders beat blocks with quickness; down linemen with strength.
    dScore = d.prof.group === 'DL'
      ? 0.45 * D.runDefense + 0.35 * D.strength + 0.2 * D.explosiveness + 0.12 * (d.prof.mass - 1)
      : 0.45 * D.runDefense + 0.2 * D.strength + 0.2 * D.agility + 0.15 * D.playRecognition + 0.08 * (d.prof.mass - 1);
    // Body position: blocker squarely between the defender and the ball (fit) wins; a defender with the blocker
    // on his hip can cross face. Contributes continuously, never a binary win.
    dScore -= 0.1 * (eng.fit ?? 0);
  }
  else dScore = rushScores(eng.move, D, d);
  return dScore * en(d) - bScore;
}

export function createEngagement(sim, blocker, def, mode) {
  const B = blocker.prof.r, D = def.prof.r;
  // Get-off: who wins hand placement, plus closing momentum.
  const closing = Math.max(0, -((def.vel.x - blocker.vel.x) * (blocker.pos.x - def.pos.x) + (def.vel.y - blocker.vel.y) * (blocker.pos.y - def.pos.y)) / Math.max(0.3, dist(def.pos, blocker.pos)));
  const lev0 = 0.35 * (D.explosiveness - B.blockFootwork) + 0.06 * closing * (def.prof.mass - blocker.prof.mass + 0.3) + sim.rng.normal(0, 0.12);
  const eng = { blockers: [blocker], def, mode, move: def.rushMove || 'POWER', lev: clamp(lev0, -0.6, 0.6), t: 0 };
  if (mode === 'RUN') {
    // Hand placement / pad level at contact: technique (footwork + awareness) vs the defender's get-off.
    eng.lev = clamp(lev0 * 0.6 + 0.25 * (D.runDefense - 0.5 * (B.runBlock + B.blockFootwork)), -0.5, 0.5);
    eng.fit = fitOf(sim, eng, blocker);
    eng.attach = norm(sub(blocker.pos, def.pos));
  }
  if (mode === 'PASS') { eng.ms = { move: eng.move, t0: 0, phase: 'SET', spin: 0 }; def.rushAnim = { move: eng.move, phase: 'SET', t: 0, spin: 0 }; }
  def.engCount = (def.engCount || 0) + 1;
  blocker.engagedWith = def; def.engagedWith = blocker; blocker.eng = eng; def.eng = eng;
  sim.engagements.push(eng);
  if (mode === 'RUN') sim.emit('BLOCK_ENGAGE', { by: blocker.id, on: def.id, tech: blocker.assignment?.tech || null }, true);
  return eng;
}

// Fit: cosine between (defender -> blocker) and (defender -> ball). 1 = perfectly walled off, -1 = blocker behind him.
function fitOf(sim, eng, b) {
  const goal = defenderGoal(sim, eng);
  const u = norm(sub(b.pos, eng.def.pos)), g = norm(sub(goal, eng.def.pos));
  return u.x * g.x + u.y * g.y;
}

// Direction a winning run blocker moves his man, from the technique.
function driveDir(sim, eng) {
  const b = eng.blockers[0], s = sim.runSide || 1, tech = b.assignment?.tech;
  if (eng.blockers.length > 1) return { x: 1, y: 0 };                            // double: vertical push
  if (tech === 'REACH' || tech === 'SEAL') return norm({ x: 0.45, y: -s });       // turn him away from the play
  if (tech === 'KICK' || (tech === 'PULL' && b.assignment.role !== 'LEAD')) return norm({ x: 0.3, y: s }); // kick / trap him out
  return null;                                                                   // drive him away from the ball
}

function release(sim, eng, outcome) {
  // Block log (feeds the "Por que terminou" explanation): who won each fight and how it ended.
  (sim.blockLog ||= []).push({ t: +sim.t.toFixed(2), mode: eng.mode, def: eng.def.id, blockers: eng.blockers.map(b => b.id), tech: eng.blockers[0]?.assignment?.tech || null, move: eng.mode === 'PASS' ? eng.move : null, lev: +eng.lev.toFixed(2), outcome: outcome === 'SHED' ? 'DEF_WIN' : outcome === 'BREAK' ? 'BREAK' : 'BLOCK_WIN', at: { x: +eng.def.pos.x.toFixed(1), y: +eng.def.pos.y.toFixed(1) } });
  for (const b of eng.blockers) { b.engagedWith = null; b.eng = null; }
  if (eng.mode === 'PASS' && eng.def.rushAnim) eng.def.rushAnim.phase = outcome === 'SHED' ? 'WON' : 'END';
  if (eng.mode === 'RUN') eng.def.lastRunShed = sim.t;
  eng.def.engagedWith = null; eng.def.eng = null;
  sim.engagements.splice(sim.engagements.indexOf(eng), 1);
  if (outcome === 'SHED') {
    for (const b of eng.blockers) { b.stun = 0.35; b.noBlock = 0.8; b.beatenBy = eng.def; }
    eng.def.noBlock = 0.7;
    if (eng.mode === 'PASS') { eng.def.winMove = eng.move; eng.def.shedFrom = eng.blockers.map(b => b.id); sim.emit('RUSH_WIN', { by: eng.def.id, over: eng.blockers.map(b => b.id), move: eng.move, t: +sim.t.toFixed(2) }, true); }
    // Pass-rush wins are game events (pressure); run-block disengages are debug detail.
    sim.emit('SHED', { by: eng.def.id, from: eng.blockers.map(b => b.id), move: eng.move, mode: eng.mode }, eng.mode === 'RUN');
  }
}

// Point the defender is trying to reach.
function defenderGoal(sim, eng) {
  if (eng.mode === 'RUN') return sim.carrier ? sim.carrier.pos : sim.meshPoint || sim.qb.pos;
  return sim.qb.pos;
}

export function updateEngagements(sim, dt) {
  for (const eng of [...sim.engagements]) {
    eng.t += dt;
    const d = eng.def;
    if (d.down || eng.blockers.some(b => b.down)) { release(sim, eng, 'BREAK'); continue; }
    // Stop pass-rush fights once the ball is out / carrier is far away.
    const goal = defenderGoal(sim, eng);
    if (eng.mode === 'PASS' && sim.phase !== 'PRE_THROW' && sim.phase !== 'SCRAMBLE') eng.mode = 'RUN';
    if (eng.mode === 'RUN') {
      eng.fit = eng.blockers.reduce((m, b) => Math.max(m, fitOf(sim, eng, b)), -1);
      if (eng.blockers.length > 1 && updateDouble(sim, eng, dt)) continue;
    }
    const m = matchup(eng);
    // Run blocks are hard to sustain once the ball carrier is right there: the defender gets off to tackle,
    // unless the blocker has him walled off (good fit).
    if (eng.mode === 'RUN' && sim.carrier && sim.carrier.side !== d.side) {
      const c = sim.carrier, dc = dist(d.pos, c.pos);
      const near = Math.max(0, 1 - dc / 3.2) * (0.1 + 0.9 * (1 - eng.fit) / 2);
      // Ball already past him (or far away): he simply turns and chases; a block can't hold that.
      const dir = c.side === 'off' ? 1 : -1;
      const past = (c.pos.x - d.pos.x) * dir > 1 || dc > 7 ? 1 : 0;
      eng.lev += (near * (1.0 + 1.2 * d.prof.r.tackling) + past * 1.6) * dt;
    }
    // Move signature: SPIN is high variance (explosive when it works), the first 0.2 s are hand fighting (SET).
    const ms = eng.ms;
    let sd = eng.mode === 'RUN' ? 0.42 : 0.47, rate = 1.9;
    if (ms && eng.mode === 'PASS') {
      ms.t0 += dt;
      ms.phase = ms.t0 < 0.2 ? 'SET' : ms.t0 < 0.65 ? 'EXECUTE' : 'GRIND';
      if (ms.phase === 'SET') rate = 1.1;
      if (eng.move === 'SPIN' && ms.phase === 'EXECUTE') { sd = 0.8; ms.spin += dt * 9.5; }
      if (eng.move === 'SPIN' && ms.phase === 'GRIND' && !ms.resolved) { ms.resolved = true; eng.lev += eng.lev > 0.2 ? 0.25 : -0.3; } // clean spin vs lost momentum
      if (eng.move === 'COUNTER' && ms.phase === 'EXECUTE') sd = 0.6;
      d.rushAnim = { move: eng.move, phase: ms.phase, t: +ms.t0.toFixed(2), spin: ms.spin };
      if (eng.move === 'SPIN' && ms.phase === 'EXECUTE') d.facing += dt * 9.5; // spin is visible
    }
    eng.lev += m * rate * dt + sim.rng.normal(0, sd) * Math.sqrt(dt);
    eng.lev = Math.max(-1.6, eng.lev);
    // Counter move after a stalemate: read the blocker's reaction (overset) and counter, else switch move.
    if (eng.mode === 'PASS' && eng.lev < -0.9 && sim.rng.chance(dt * 0.9)) {
      const prev = eng.move;
      const counter = prev !== 'COUNTER' && sim.rng.chance(0.3 + 0.5 * d.prof.r.passRush);
      d.rushMove = eng.move = counter ? 'COUNTER' : sim.rng.pick(BASE_RUSH_MOVES.filter(x => x !== prev));
      eng.lev = counter ? -0.1 : -0.45;
      eng.ms = { move: eng.move, t0: 0, phase: 'SET', spin: 0, from: prev };
      if (d.assignment?.label) d.assignment.label = d.assignment.label.replace(/:[A-Z_]+$/, `:${eng.move}`);
      (eng.switches ||= []).push({ t: +sim.t.toFixed(2), from: prev, to: eng.move });
      sim.emit('RUSH_COUNTER', { by: d.id, from: prev, to: eng.move }, true);
    }
    if (eng.lev >= 1) { release(sim, eng, 'SHED'); continue; }
    // Pair motion: winning defender drives toward his goal; winning blocker drives him away.
    const toGoal = norm(sub(goal, d.pos));
    let vx = 0, vy = 0;
    if (eng.lev > 0) {
      const push = eng.move === 'POWER' || eng.mode === 'RUN' ? 1.7 : 0.9;
      vx = toGoal.x * eng.lev * push; vy = toGoal.y * eng.lev * push;
      if (eng.mode === 'PASS' && (eng.move === 'SPEED' || eng.move === 'RIP')) {
        // Speed rush / rip bend around the edge: lateral (outside) component.
        const out = Math.sign(d.pos.y - sim.qb.pos.y) || 1;
        vy += out * (eng.move === 'RIP' ? 1.1 : 1.4) * (eng.lev + 0.3);
      } else if (eng.mode === 'PASS' && (eng.move === 'SWIM' || eng.move === 'SPIN' || eng.move === 'COUNTER')) {
        // Over the top / back inside: slice toward the QB's inside shoulder.
        const inn = -(Math.sign(d.pos.y - sim.qb.pos.y) || 1);
        vy += inn * 0.55 * (eng.lev + 0.3);
      }
    } else {
      const drive = eng.mode === 'RUN' ? 1.3 : 0.35;
      const dd = eng.mode === 'RUN' && driveDir(sim, eng);
      const away = dd ? norm({ x: dd.x * 0.65 - toGoal.x * 0.35, y: dd.y * 0.65 - toGoal.y * 0.35 }) : { x: -toGoal.x, y: -toGoal.y };
      vx = away.x * -eng.lev * drive; vy = away.y * -eng.lev * drive;
    }
    d.vel.x = vx; d.vel.y = vy;
    d.pos.x += vx * dt; d.pos.y += vy * dt;
    if (eng.mode === 'RUN') { runAttach(sim, eng, toGoal, vx, vy, dt); continue; }
    // Blockers stay glued between defender and goal.
    eng.blockers.forEach((b, i) => {
      const off = (i - (eng.blockers.length - 1) / 2) * 0.7;
      const tx = d.pos.x + toGoal.x * 0.85 - toGoal.y * off, ty = d.pos.y + toGoal.y * 0.85 + toGoal.x * off;
      b.vel.x = vx; b.vel.y = vy;
      const k = Math.min(1, dt * 9);
      b.pos.x += (tx - b.pos.x) * k; b.pos.y += (ty - b.pos.y) * k;
    });
  }
}

// Run block body position: each blocker keeps his own contact angle around the defender. The blocker works his
// feet to get between the man and the ball (footwork); the defender works to the blocker's edge (agility) and
// slides off when he is winning. This is what makes leverage gradual instead of a coin flip.
function runAttach(sim, eng, toGoal, vx, vy, dt) {
  const d = eng.def, D = d.prof.r;
  eng.blockers.forEach((b, i) => {
    const B = b.prof.r;
    let a = b === eng.blockers[0] && eng.attach ? eng.attach : norm(sub(b.pos, d.pos));
    if (a.x === 0 && a.y === 0) a = toGoal;
    const work = (0.6 + 0.9 * B.blockFootwork - 0.5 * D.agility) * (eng.lev < 0 ? 1 : 0.35) - Math.max(0, eng.lev) * (0.4 + 0.8 * D.agility);
    // Rotate the contact angle toward the goal side (positive work) or away from it (defender winning).
    const cross = a.x * toGoal.y - a.y * toGoal.x, dot = a.x * toGoal.x + a.y * toGoal.y;
    const ang = Math.atan2(cross, dot);                                  // angle from attach to goal direction
    const stepA = clamp(work * 1.6 * dt, -0.12, 0.12) * Math.sign(ang || 1);
    const ca = Math.cos(stepA), sa = Math.sin(stepA);
    a = norm({ x: a.x * ca - a.y * sa, y: a.x * sa + a.y * ca });
    if (eng.blockers.length > 1) {
      // Double team: hip to hip, side by side in front of the man.
      const off = (i - 0.5) * 0.75;
      a = norm({ x: toGoal.x * 0.85 - toGoal.y * off, y: toGoal.y * 0.85 + toGoal.x * off });
    }
    if (b === eng.blockers[0]) eng.attach = a;
    const tx = d.pos.x + a.x * 0.85, ty = d.pos.y + a.y * 0.85;
    b.vel.x = vx; b.vel.y = vy;
    const k = Math.min(1, dt * 9);
    b.pos.x += (tx - b.pos.x) * k; b.pos.y += (ty - b.pos.y) * k;
  });
}

// Double-team state machine. Returns true when the engagement was dissolved this tick.
function updateDouble(sim, eng, dt) {
  const dbl = eng.double || (eng.double = { phase: 'DOUBLE', t: 0 });
  dbl.t += dt;
  const hold = sim.runPlan?.doubleHold ?? 0.5;
  const lb = eng.blockers.map(b => b.assignment?.climbTo).find(Boolean);
  if (dbl.phase === 'DOUBLE' && dbl.t > 0.2 && eng.lev < -0.2) {
    dbl.phase = 'CONTROL';
    sim.emit('DOUBLE_CONTROL', { on: eng.def.id, by: eng.blockers.map(b => b.id), lev: +eng.lev.toFixed(2) }, true);
  }
  if (dbl.phase === 'CONTROL') {
    if (eng.lev > 0.15) { dbl.phase = 'DOUBLE'; return false; } // lost control: both stay on him
    dbl.phase = 'READ';
  }
  if (dbl.phase === 'READ') {
    if (eng.lev > 0.15) { dbl.phase = 'DOUBLE'; return false; }
    // Read the backer: he fits downhill / into our gap (close) or the hold time expires -> one blocker climbs.
    const target = lb && !lb.down && !lb.engagedWith ? lb : null;
    const close = target && dist(target.pos, eng.def.pos) < 3.6;
    const fired = target && target.vel.x < -1.2;
    if (!(close || fired || dbl.t > hold + 0.5 || (target && dbl.t > hold))) return false;
    if (!target && dbl.t < hold + 0.5) return false;
    // Climber: the blocker on the backer's side (so the other keeps leverage on the down lineman).
    const ref = target ? target.pos : { x: eng.def.pos.x + 3, y: eng.def.pos.y };
    const [b0, b1] = eng.blockers;
    const climber = Math.abs(b0.pos.y - ref.y) < Math.abs(b1.pos.y - ref.y) ? b0 : b1;
    eng.blockers.splice(eng.blockers.indexOf(climber), 1);
    climber.engagedWith = null; climber.eng = null; climber.noBlock = 0.05;
    eng.def.engagedWith = eng.blockers[0];
    eng.attach = norm(sub(eng.blockers[0].pos, eng.def.pos));
    eng.lev += 0.15; // the remaining blocker loses the help
    climber.assignment = { ...climber.assignment, tech: 'CLIMB', target, partner: null, fromDouble: true };
    labelBlock(climber);
    dbl.phase = 'CLIMB';
    sim.emit('CLIMB', { by: climber.id, from: eng.def.id, to: target ? target.id : null, t: +sim.t.toFixed(2) }, true);
  }
  return false;
}

// Try to start new engagements / double teams between free blockers and defenders.
export function tryEngage(sim, blocker, def, mode) {
  if (!def || def.down || blocker.down || blocker.engagedWith || (blocker.noBlock > 0) || def === sim.carrier) return false;
  // Run blockers on the second level can fit up a backer from a bit further (he runs into them).
  if (dist(blocker.pos, def.pos) > (mode === 'RUN' && def.prof.group !== 'DL' ? 1.35 : 1.15)) return false;
  if (mode === 'PASS') {
    // A rusher who just shed is through the gap; and a blocker can only pick up a rusher he is in front of.
    if (def.noBlock > 0 && !def.eng) return false;
    const toQ = norm(sub(sim.qb.pos, def.pos));
    if ((blocker.pos.x - def.pos.x) * toQ.x + (blocker.pos.y - def.pos.y) * toQ.y < 0.1) return false;
  }
  if (def.eng) {
    if (def.eng.blockers.length < 2 && def.eng.mode === mode) {
      // A climber that already left this double does not come back to it.
      if (mode === 'RUN' && def.eng.double?.phase === 'CLIMB') return false;
      def.eng.blockers.push(blocker); blocker.engagedWith = def; blocker.eng = def.eng;
      def.eng.lev -= 0.25;
      if (mode === 'RUN') {
        def.eng.double = { phase: 'DOUBLE', t: 0 };
        sim.emit('DOUBLE_TEAM', { on: def.id, by: def.eng.blockers.map(b => b.id), tech: blocker.assignment?.tech || null }, true);
      }
      return true;
    }
    return false;
  }
  createEngagement(sim, blocker, def, mode);
  return true;
}
