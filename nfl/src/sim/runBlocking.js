// RunBlockingScheme: per-concept run-blocking assignments and blocker behavior.
// Every blocker gets an explicit technique (REACH, DRIVE, DOUBLE, COMBO, PULL, SEAL, CLIMB, KICK, TRAP) and a target.
// Double teams / combos are real 2-on-1 engagements; the double-team state machine (DOUBLE -> CONTROL -> READ LB ->
// CLIMB) lives in blocking.js. Nothing here decides an outcome: it only says who blocks whom and how they move.
import { clamp, dist } from './geometry.js';
import { seekVelocity } from './movement.js';
import { tryEngage } from './blocking.js';

const LINE = ['LT', 'LG', 'C', 'RG', 'RT', 'TE'];

// Lateral coordinate toward the play side (u > 0 = play side of the ball).
const uOf = (sim, e) => (e.pos.y - sim.by) * sim.runSide;

function setBlock(o, tech, target, extra = {}) {
  o.assignment = { type: 'RUN_BLOCK', tech, target: target || null, climbTo: null, label: '', ...extra };
  labelBlock(o);
}

export function labelBlock(o) {
  const a = o.assignment;
  const t = a.target ? `→${a.target.slot}` : '';
  const c = a.climbTo ? `⇒${a.climbTo.slot}` : '';
  a.label = `${a.tech}${a.role ? ':' + a.role : ''}${t}${c}`;
}

// Second-level defender a blocker should climb to. Backers are taken in priority order (default: play-side LB,
// Mike, backside LB) so the man left unblocked is the backside one -- the RB's cutback read.
function climbTargetFor(sim, u, claimed, order) {
  const ps = sim.runSide > 0 ? 'SAM' : 'WILL', bs = sim.runSide > 0 ? 'WILL' : 'SAM';
  for (const k of order || [ps, 'MIKE', bs]) {
    const lb = sim.def[k];
    if (!lb || claimed.has(lb) || lb.assignment?.type === 'RUSH') continue;
    if (Math.abs(uOf(sim, lb) - u) < 6.5) return lb;
  }
  return null;
}

export function assignRunBlocks(sim, concept) {
  const c = concept, s = c.side;
  sim.runSide = s;
  const line = LINE.map(k => sim.off[k]).sort((a, b) => uOf(sim, b) - uOf(sim, a)); // play side first
  const dl = ['LDE', 'LDT', 'RDT', 'RDE'].map(k => sim.def[k]);
  // Extra rushers (blitz LB) count as front defenders too.
  const lbs = ['WILL', 'MIKE', 'SAM'].map(k => sim.def[k]);
  const front = [...dl, ...lbs.filter(l => l.assignment?.type === 'RUSH')].sort((a, b) => uOf(sim, b) - uOf(sim, a));
  const claimed = new Set();
  const free = new Set(line);
  const bs = k => sim.off[(s > 0 ? 'L' : 'R') + k]; // backside lineman by position (G/T)

  // ---- pullers (gap / trap schemes) ----
  const pullers = [];
  if (c.pull) {
    for (const [pos, role] of Object.entries(c.pull)) {
      const o = bs(pos);
      free.delete(o);
      pullers.push({ o, role });
    }
  }
  const psEnd = front[0]; // end man on the line, play side
  const psDT = front.filter(d => d.prof.group === 'DL' && /DT$/.test(d.slot)).sort((a, b) => uOf(sim, b) - uOf(sim, a))[0];
  const bsEnd = front[front.length - 1];
  const excluded = new Set();
  for (const p of pullers) {
    let tgt = null;
    if (p.role === 'KICK') tgt = psEnd;
    else if (p.role === 'TRAP') tgt = psDT;
    if (tgt) { excluded.add(tgt); claimed.add(tgt); }
    p.target = tgt;
  }

  // ---- backside seal: backside-most blocker cuts off the backside end man (zone / duo / gap) ----
  const lastBlocker = [...free].sort((a, b) => uOf(sim, a) - uOf(sim, b))[0];
  if (lastBlocker && /T$|TE/.test(lastBlocker.slot) && bsEnd && !claimed.has(bsEnd) && uOf(sim, bsEnd) < uOf(sim, lastBlocker) - 0.4) {
    setBlock(lastBlocker, 'SEAL', bsEnd); free.delete(lastBlocker); claimed.add(bsEnd);
  }

  // ---- gap schemes without a kick-out puller: the play-side-most blocker bases the end man out ----
  if ((c.scheme === 'GAP' || c.scheme === 'TRAP') && psEnd && !claimed.has(psEnd)) {
    const edge = [...free].sort((a, b) => uOf(sim, b) - uOf(sim, a))[0];
    if (edge && uOf(sim, psEnd) > uOf(sim, edge) - 1) { setBlock(edge, 'KICK', psEnd); free.delete(edge); claimed.add(psEnd); excluded.add(psEnd); }
  }

  // ---- down linemen ----
  const pairs = new Map(); // defender -> blockers[]
  const ordered = [...free].sort((a, b) => uOf(sim, b) - uOf(sim, a));
  if (c.scheme === 'ZONE' || c.scheme === 'DUO') {
    // Zone rule: I own the defender on me or in my play-side gap (closest such blocker on his backside).
    for (const d of front) {
      if (claimed.has(d)) continue;
      const du = uOf(sim, d);
      let owner = null;
      for (const o of ordered) { if (pairs.has(o) || o.assignment?.type === 'RUN_BLOCK') continue; if (uOf(sim, o) <= du + 0.75) { owner = o; break; } }
      if (!owner) continue; // backside of everybody: left alone (or sealed above)
      claimed.add(d);
      const playShade = du - uOf(sim, owner);
      const tech = c.scheme === 'DUO' ? 'DRIVE' : (c.reach || playShade > 0.45) ? 'REACH' : 'DRIVE';
      setBlock(owner, tech, d);
      pairs.set(d, [owner]);
    }
    // Uncovered linemen: combo with the play-side neighbor's defender (duo: double), else climb.
    for (const o of ordered) {
      if (o.assignment?.type === 'RUN_BLOCK') continue;
      const ou = uOf(sim, o);
      let best = null, bd = 1e9;
      for (const [d, bl] of pairs) {
        if (bl.length >= 2 || d.prof.group !== 'DL') continue;
        const du = uOf(sim, d), gapU = du - ou;
        // Play-side neighbor's man (zone); duo also helps on the backside neighbor's interior man.
        const ok = gapU > -0.8 && gapU < 2.2 || (c.scheme === 'DUO' && gapU > -2.4 && gapU < 2.2 && /DT$/.test(d.slot));
        if (ok && Math.abs(gapU) < bd) { bd = Math.abs(gapU); best = d; }
      }
      if (best) {
        const bl = pairs.get(best); bl.push(o);
        const lb = climbTargetFor(sim, uOf(sim, best), claimed);
        if (lb) claimed.add(lb);
        const tech = c.scheme === 'DUO' ? 'DOUBLE' : 'COMBO';
        for (const b of bl) { setBlock(b, tech, best, { climbTo: lb, partner: bl.find(x => x !== b) }); }
      }
    }
  } else {
    // Gap / trap: block down (the man on me or to my inside), center blocks back for the puller.
    for (const o of ordered) {
      if (o.assignment?.type === 'RUN_BLOCK') continue;
      const ou = uOf(sim, o);
      let best = null, bu = -1e9;
      for (const d of front) {
        if (excluded.has(d) || (claimed.has(d) && !pairs.has(d))) continue;
        const du = uOf(sim, d);
        if (du <= ou + 0.6 && ou - du <= (o.slot === 'C' ? 2.6 : 1.8) && du > bu) { bu = du; best = d; }
      }
      if (!best) continue;
      const bl = pairs.get(best);
      if (bl && bl.length < 2) {
        bl.push(o);
        const lb = climbTargetFor(sim, uOf(sim, best), claimed, ['MIKE', s > 0 ? 'WILL' : 'SAM']); // pullers own the play-side backer
        if (lb) claimed.add(lb);
        for (const b of bl) setBlock(b, 'DOUBLE', best, { climbTo: lb, partner: bl.find(x => x !== b) });
      } else if (!bl) {
        claimed.add(best); pairs.set(best, [o]);
        setBlock(o, 'DRIVE', best, { role: o.slot === 'C' ? 'BACK' : 'DOWN' });
      }
    }
  }

  // ---- pullers' second-level / kick targets ----
  for (const p of pullers) {
    if (p.role === 'LEAD') {
      const lb = climbTargetFor(sim, c.aim, claimed) || sim.def.MIKE;
      claimed.add(lb); p.target = lb;
    }
    const hole = sim.by + s * (p.role === 'TRAP' ? c.aim - 0.4 : p.role === 'KICK' ? c.aim + 0.8 : c.aim);
    setBlock(p.o, 'PULL', p.target, { role: p.role, holeY: hole, pulled: false });
  }

  // ---- everybody left climbs to an unclaimed linebacker (or the nearest second-level threat later) ----
  for (const o of ordered) {
    if (o.assignment?.type === 'RUN_BLOCK') continue;
    const lb = climbTargetFor(sim, uOf(sim, o) + 0.8, claimed);
    if (lb) claimed.add(lb);
    setBlock(o, 'CLIMB', lb);
  }
  // Untangle second-level paths: swap backer targets between climbers when that shortens the total lateral
  // distance (a tackle climbing inside while the combo next to him climbs outside would cross paths).
  const climbers = [];
  for (const o of line) {
    const a = o.assignment;
    if (a.tech === 'CLIMB' && a.target) climbers.push({ u: uOf(sim, o), get: () => a.target, set: lb => { a.target = lb; labelBlock(o); } });
    else if ((a.tech === 'COMBO' || a.tech === 'DOUBLE') && a.climbTo && !climbers.some(c2 => c2.pair === a.target)) {
      const mates = line.filter(x => x.assignment.target === a.target && x.assignment.climbTo);
      climbers.push({ pair: a.target, u: uOf(sim, a.target), get: () => a.climbTo, set: lb => { for (const m of mates) { m.assignment.climbTo = lb; labelBlock(m); } } });
    }
  }
  for (let i = 0; i < climbers.length; i++) for (let j = i + 1; j < climbers.length; j++) {
    const A = climbers[i], B = climbers[j], la = A.get(), lb = B.get();
    const now = Math.abs(A.u - uOf(sim, la)) + Math.abs(B.u - uOf(sim, lb));
    const swapped = Math.abs(A.u - uOf(sim, lb)) + Math.abs(B.u - uOf(sim, la));
    if (swapped < now - 0.5) { A.set(lb); B.set(la); }
  }
  // Wide receivers stalk the corners / force player.
  const wrTargets = { X: 'CBL', Z: 'CBR', SLOT: 'SS' };
  for (const [w, d] of Object.entries(wrTargets)) sim.off[w].blockTarget = sim.def[d];
  // Gap schemes hit later (pullers must get there): the RB presses the design longer.
  sim.runPlan = { scheme: c.scheme, aimY: sim.by + s * c.aim, doubleHold: c.doubleHold ?? 0.5, press: c.pull ? 0.55 : 0.32 };
}

// Free (unassigned) defenders of the front: nobody on the offense was given them.
export function unblockedDefenders(sim) {
  const tgt = new Set(sim.offense.map(o => o.assignment?.target).filter(Boolean));
  for (const k of ['X', 'Z', 'SLOT']) if (sim.off[k].blockTarget) tgt.add(sim.off[k].blockTarget);
  return sim.defense.filter(d => !tgt.has(d) && !d.down);
}

function retarget(sim, e) {
  // Lost my man (down / taken by a teammate): nearest free defender in front of me, closest to the ball.
  const c = sim.carrier || sim.off.RB;
  let best = null, bd = 1e9;
  for (const d of sim.defense) {
    if (d.down || d.engagedWith || d.pos.x < e.pos.x - 1) continue;
    const dd = dist(d.pos, e.pos);
    if (dd > 7) continue;
    const score = dd + 0.4 * dist(d.pos, c.pos);
    if (score < bd) { bd = score; best = d; }
  }
  return best;
}

// Desired velocity for a run blocker following his technique.
export function runBlockVelocity(sim, e) {
  const a = e.assignment, s = sim.runSide;
  let t = a.target || e.blockTarget;
  if (t && (t.down || (t.engagedWith && t.engagedWith !== e && !(t.eng && t.eng.blockers.length < 2 && t.eng.blockers.some(b => b.assignment?.target === t))))) t = null;
  // Pullers: open (gain a bit of depth), run flat behind the line to the hole, then turn up.
  if (a.tech === 'PULL' && !a.pulled) {
    // Kick / trap: pull until reaching the inside shoulder of the man, wherever he squeezed to.
    const goalY = (a.role === 'KICK' || a.role === 'TRAP') && a.target && !a.target.down ? a.target.pos.y - s * 0.7 : a.holeY;
    const du = (goalY - e.pos.y) * s;
    if (du > 0.9) return seekVelocity(e, { x: Math.min(e.pos.x, sim.losX - 1.1), y: goalY + s * 0.6 }, 1, 0); // flat pull
    a.pulled = true;
    sim.emit('PULL_TURN', { by: e.id, role: a.role }, true);
  }
  if (!t) {
    if (a.tech === 'CLIMB' || a.tech === 'PULL' || sim.t > 0.6) t = retarget(sim, e);
    if (!t) return seekVelocity(e, { x: e.pos.x + 2.5, y: e.pos.y + s * 0.5 }, 0.6, 0.3);
    if (t !== a.target) { a.target = t; labelBlock(e); }
  }
  if (tryEngage(sim, e, t, 'RUN')) return { x: 0, y: 0 };
  // Approach point by technique (where the blocker wants his body relative to the defender).
  let tgt;
  switch (a.tech) {
    case 'REACH': tgt = { x: t.pos.x - 0.3, y: t.pos.y + s * 0.85 }; break;          // get to his play-side shoulder
    case 'SEAL': tgt = { x: t.pos.x - 0.2, y: t.pos.y + s * 0.7 }; break;            // wall him off from the play
    case 'KICK': tgt = { x: t.pos.x - 0.3, y: t.pos.y - s * 0.6 }; break;            // inside-out, drive him wide
    case 'PULL':
      if (a.role === 'KICK' || a.role === 'TRAP') tgt = { x: t.pos.x - 0.4, y: t.pos.y - s * 0.6 }; // inside-out
      else tgt = { x: t.pos.x - 0.5, y: t.pos.y - s * 0.3 };
      break;
    case 'CLIMB': {
      // Take an angle to where the backer is going (lead grows with distance).
      const k = clamp(dist(e.pos, t.pos) / 7, 0, 0.5);
      tgt = { x: t.pos.x + t.vel.x * k, y: t.pos.y + t.vel.y * k };
      break;
    }
    default: tgt = { x: t.pos.x - 0.4, y: t.pos.y - s * 0.15 };
  }
  return seekVelocity(e, tgt, 1, 0.05);
}
