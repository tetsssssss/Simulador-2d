// BlockingSystem + PassRushSystem.
// A block is an engagement with a continuous leverage value (lev > 0 favors the defender).
// Leverage evolves from the attribute matchup of the chosen technique, mass, fatigue and contextual noise;
// the engaged pair physically moves (pocket compression / run push), and sheds or stalemates emerge from lev.
import { dist, norm, sub, clamp } from './geometry.js';

export const RUSH_MOVES = ['SPEED', 'POWER', 'FINESSE'];

export function chooseRushMove(def, rng) {
  const r = def.prof.r;
  return rng.weighted([
    ['SPEED', 0.2 + r.speed * 0.9 + r.explosiveness * 0.6],
    ['POWER', 0.2 + r.strength * 1.1 + (def.prof.mass - 1) * 1.2],
    ['FINESSE', 0.2 + r.passRush * 0.9 + r.agility * 0.4],
  ]);
}

function matchup(eng) {
  const d = eng.def, D = d.prof.r, en = x => 0.82 + 0.18 * x.energy;
  const blockers = eng.blockers;
  let bScore = 0;
  for (const b of blockers) {
    const B = b.prof.r;
    let s;
    if (eng.mode === 'RUN') s = 0.45 * B.runBlock + 0.35 * B.blockStrength + 0.2 * B.blockFootwork + 0.12 * (b.prof.mass - 1);
    else if (eng.move === 'SPEED') s = 0.5 * B.blockFootwork + 0.3 * B.passBlock + 0.2 * B.agility;
    else if (eng.move === 'POWER') s = 0.45 * B.blockStrength + 0.25 * B.passBlock + 0.3 * (0.5 + (b.prof.mass - 1) * 1.5);
    else s = 0.5 * B.passBlock + 0.3 * B.blockFootwork + 0.2 * B.awareness;
    bScore += s * en(b) * (b.stun > 0 ? 0.5 : 1);
  }
  if (blockers.length > 1) bScore *= 0.68; // double team ~1.36x a single blocker
  let dScore;
  if (eng.mode === 'RUN') dScore = 0.45 * D.runDefense + 0.35 * D.strength + 0.2 * D.explosiveness + 0.12 * (d.prof.mass - 1);
  else if (eng.move === 'SPEED') dScore = 0.5 * D.speed + 0.3 * D.explosiveness + 0.2 * D.passRush;
  else if (eng.move === 'POWER') dScore = 0.45 * D.strength + 0.25 * D.passRush + 0.3 * (0.5 + (d.prof.mass - 1) * 1.5);
  else dScore = 0.6 * D.passRush + 0.2 * D.agility + 0.2 * D.explosiveness;
  return dScore * en(d) - bScore;
}

export function createEngagement(sim, blocker, def, mode) {
  const B = blocker.prof.r, D = def.prof.r;
  // Get-off: who wins hand placement, plus closing momentum.
  const closing = Math.max(0, -((def.vel.x - blocker.vel.x) * (blocker.pos.x - def.pos.x) + (def.vel.y - blocker.vel.y) * (blocker.pos.y - def.pos.y)) / Math.max(0.3, dist(def.pos, blocker.pos)));
  const lev0 = 0.35 * (D.explosiveness - B.blockFootwork) + 0.06 * closing * (def.prof.mass - blocker.prof.mass + 0.3) + sim.rng.normal(0, 0.12);
  const eng = { blockers: [blocker], def, mode, move: def.rushMove || 'POWER', lev: clamp(lev0, -0.6, 0.6), t: 0 };
  blocker.engagedWith = def; def.engagedWith = blocker; blocker.eng = eng; def.eng = eng;
  sim.engagements.push(eng);
  return eng;
}

function release(sim, eng, outcome) {
  for (const b of eng.blockers) { b.engagedWith = null; b.eng = null; }
  eng.def.engagedWith = null; eng.def.eng = null;
  sim.engagements.splice(sim.engagements.indexOf(eng), 1);
  if (outcome === 'SHED') {
    for (const b of eng.blockers) { b.stun = 0.35; b.noBlock = 0.8; b.beatenBy = eng.def; }
    eng.def.noBlock = 0.7;
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
    const m = matchup(eng);
    // Run blocks are hard to sustain once the ball carrier is right there: the defender gets off to tackle.
    if (eng.mode === 'RUN' && sim.carrier && sim.carrier.side !== d.side) {
      const c = sim.carrier, dc = dist(d.pos, c.pos);
      const near = Math.max(0, 1 - dc / 3.2);
      // Ball already past him (or far away): he simply turns and chases; a block can't hold that.
      const dir = c.side === 'off' ? 1 : -1;
      const past = (c.pos.x - d.pos.x) * dir > 1 || dc > 7 ? 1 : 0;
      eng.lev += (near * (1.0 + 1.2 * d.prof.r.tackling) + past * 1.6) * dt;
    }
    eng.lev += m * 1.9 * dt + sim.rng.normal(0, 0.62) * Math.sqrt(dt);
    eng.lev = Math.max(-1.6, eng.lev);
    // Counter move after a stalemate.
    if (eng.mode === 'PASS' && eng.lev < -0.9 && sim.rng.chance(dt * 0.9)) {
      d.rushMove = eng.move = sim.rng.pick(RUSH_MOVES.filter(x => x !== eng.move));
      eng.lev = -0.45;
    }
    if (eng.lev >= 1) { release(sim, eng, 'SHED'); continue; }
    // Pair motion: winning defender drives toward his goal; winning blocker drives him away.
    const toGoal = norm(sub(goal, d.pos));
    let vx = 0, vy = 0;
    if (eng.lev > 0) {
      const push = eng.move === 'POWER' || eng.mode === 'RUN' ? 1.7 : 0.9;
      vx = toGoal.x * eng.lev * push; vy = toGoal.y * eng.lev * push;
      if (eng.mode === 'PASS' && eng.move === 'SPEED') {
        // Speed rush bends around the edge: lateral (outside) component.
        const out = Math.sign(d.pos.y - sim.qb.pos.y) || 1;
        vy += out * 1.4 * (eng.lev + 0.3);
      }
    } else {
      const drive = eng.mode === 'RUN' ? 1.3 : 0.35;
      vx = -toGoal.x * -eng.lev * drive; vy = -toGoal.y * -eng.lev * drive;
    }
    d.vel.x = vx; d.vel.y = vy;
    d.pos.x += vx * dt; d.pos.y += vy * dt;
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

// Try to start new engagements / double teams between free blockers and defenders.
export function tryEngage(sim, blocker, def, mode) {
  if (!def || def.down || blocker.down || blocker.engagedWith || (blocker.noBlock > 0) || def === sim.carrier) return false;
  if (dist(blocker.pos, def.pos) > 1.15) return false;
  if (mode === 'PASS') {
    // A rusher who just shed is through the gap; and a blocker can only pick up a rusher he is in front of.
    if (def.noBlock > 0 && !def.eng) return false;
    const toQ = norm(sub(sim.qb.pos, def.pos));
    if ((blocker.pos.x - def.pos.x) * toQ.x + (blocker.pos.y - def.pos.y) * toQ.y < 0.1) return false;
  }
  if (def.eng) {
    if (def.eng.blockers.length < 2 && def.eng.mode === mode) {
      def.eng.blockers.push(blocker); blocker.engagedWith = def; blocker.eng = def.eng;
      def.eng.lev -= 0.25;
      return true;
    }
    return false;
  }
  createEngagement(sim, blocker, def, mode);
  return true;
}
