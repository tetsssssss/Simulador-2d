// Ball carrier AI (spatial lane search), pursuit angles and TackleSystem.
// Tackle outcome comes from the contact itself: angle, closing speed, mass, tackling vs break-tackle skills,
// balance, fatigue and gang tackling. Possible results: tackle, broken tackle, fumble.
import { FIELD_W, clamp, dist, norm, sub, fromAngle, interceptPoint } from './geometry.js';
import { seekVelocity, speedCap } from './movement.js';
import { tryEngage } from './blocking.js';
import { contactGeometry, tackleModifier } from './carrierMoves.js';

export function carrierDir(c) { return c.side === 'off' ? 1 : -1; }

export function carrierVelocity(sim, c) {
  const dir = carrierDir(c);
  if (!c.carry) c.carry = { heading: 0, nextPick: 0 };
  const mv = c.moveState?.cur;
  if (mv && mv.heading != null) c.carry.heading = mv.heading;
  else if (sim.t >= c.carry.nextPick) {
    c.carry.nextPick = sim.t + 0.1;
    const V = c.prof.r.vision;
    const capC = Math.max(4, speedCap(c));
    let best = c.carry.heading, bestScore = -1e9;
    for (let deg = -84; deg <= 84; deg += 12) {
      const ang = deg * Math.PI / 180;
      const u = fromAngle(ang);
      const ud = { x: u.x * dir, y: u.y };
      let score = Math.cos(ang) * 5;
      for (const [k, w] of [[2.5, 1], [5.5, 0.6]]) {
        const p = { x: c.pos.x + ud.x * k, y: c.pos.y + ud.y * k };
        if (p.y < 0.6 || p.y > FIELD_W - 0.6) score -= 4 * w;
        const tc = k / capC;
        for (const d of sim.ents) {
          if (d.side === c.side || d.down) continue;
          const blocked = d.engagedWith ? 0.7 : 0;
          const td = Math.max(0, dist(d.pos, p) - 1.0) / Math.max(3, speedCap(d)) + blocked;
          const margin = td - tc;
          if (margin < 0.9) score -= (0.9 - margin) * 4 * w;
        }
      }
      score += Math.abs(ang - c.carry.heading) < 0.25 ? 0.6 : 0; // commitment, avoids jitter
      score += sim.rng.normal(0, 1.4 * (1 - V));
      if (score > bestScore) { bestScore = score; best = ang; }
    }
    c.carry.heading = best;
  }
  const u = fromAngle(c.carry.heading);
  const cap = speedCap(c);
  return { x: u.x * dir * cap, y: u.y * cap };
}

export function pursuitVelocity(sim, e) {
  const c = sim.carrier || sim.qb;
  const R = e.prof.r;
  // In close: converge on the body (short lead) instead of running a parallel intercept line.
  const d = dist(e.pos, c.pos);
  // Juked: he bit on the fake and is still flowing to the wrong side.
  if (e.juked && e.juked.until > sim.t) return seekVelocity(e, { x: c.pos.x, y: c.pos.y + e.juked.side * 2.2 }, 1, 0);
  if (d < 4) {
    const k = Math.min(0.15, d / Math.max(4, speedCap(e)) * 0.5);
    return seekVelocity(e, { x: c.pos.x + c.vel.x * k, y: c.pos.y + c.vel.y * k }, 1, 0);
  }
  // Pursuit angle quality: smart defenders lead the carrier correctly; poor ones under-lead and end up trailing.
  const lead = 0.78 + 0.27 * (0.5 * R.awareness + 0.5 * R.playRecognition);
  const ip = interceptPoint(e.pos, speedCap(e), c.pos, { x: c.vel.x * lead, y: c.vel.y * lead }, 3);
  return seekVelocity(e, ip.point, 1, 0.05);
}

// Teammates of the carrier block the most dangerous nearby pursuer.
export function escortVelocity(sim, e) {
  const c = sim.carrier;
  let best = null, bd = 1e9;
  for (const d of sim.ents) {
    if (d.side === e.side || d.down || d.engagedWith) continue;
    const dc = dist(d.pos, c.pos);
    if (dc > 12) continue;
    const de = dist(d.pos, e.pos);
    if (de > 7) continue;
    const score = dc + de * 0.6;
    if (score < bd) { bd = score; best = d; }
  }
  if (!best) return seekVelocity(e, { x: c.pos.x + carrierDir(c) * 4, y: e.pos.y }, 0.6, 0.5);
  if (tryEngage(sim, e, best, 'RUN')) return { x: 0, y: 0 };
  const u = norm(sub(c.pos, best.pos));
  return seekVelocity(e, { x: best.pos.x + u.x * 0.8, y: best.pos.y + u.y * 0.8 }, 1, 0.05);
}

export function isSackable(sim, c) {
  return c === sim.qb && sim.call.type !== 'run' && !sim.passAttempted && c.pos.x < sim.losX;
}

// Ball holder for contact purposes: carrier, or the QB holding the ball before a throw.
export function ballHolder(sim) {
  if (sim.carrier) return sim.carrier;
  if (sim.phase === 'PRE_THROW' || sim.phase === 'SCRAMBLE') return sim.qb;
  return null;
}

export function attemptTackles(sim) {
  const c = ballHolder(sim);
  if (!c || c.down) return;
  const C = c.prof.r, dir = carrierDir(c);
  for (const d of sim.ents) {
    if (d.side === c.side || d.down || d.stun > 0 || (d.tackleCd || 0) > sim.t) continue;
    // Still engaged: only a defender winning the block can reach out for an (arm) tackle.
    if (d.engagedWith && !(d.eng && d.eng.lev > (d.eng.mode === 'RUN' ? 0.6 : 0.4))) continue;
    const fromBlock = !!d.engagedWith;
    const dd = dist(d.pos, c.pos);
    // Wrap range, or a lunge / diving arm tackle a bit further out (lower success).
    const wrapRange = d.prof.reach * 0.9 + 0.35, lunge = dd > wrapRange;
    if (dd > wrapRange + 0.55) continue;
    // Head-on contact (tackler in front of the carrier's path) gives a clean wrap; from behind = arm tackle.
    const g = contactGeometry(c, d);
    // Only dive when he cannot close to wrap range anymore (carrier pulling away / sliding by); otherwise keep
    // closing and wrap up on a later tick.
    if (lunge && g.closing * sim.dt * 3 > dd - wrapRange) continue;
    d.tackleCd = sim.t + 0.9;
    if (sim.firstContact == null) sim.firstContact = { x: c.pos.x, t: sim.t, by: d.id };
    const D = d.prof.r;
    const { closing, cs, cu, facing } = g;
    const angleQ = 0.5 + 0.5 * facing;
    const headOnPower = facing > 0.3 && c.prof.mass > d.prof.mass;
    const tackleSkill = 0.55 * D.tackling + 0.2 * D.hitPower + 0.25 * D.strength;
    const mod = isSackable(sim, c) ? { bonus: 0, move: null } : tackleModifier(sim, c, d, g);
    const evade = 0.4 * C.breakTackle + 0.25 * C.balance + 0.2 * (headOnPower ? C.trucking : C.elusiveness) + 0.15 * C.strength + mod.bonus;
    const juked = d.juked && d.juked.until > sim.t;
    const momentum = (d.prof.mass * (closing + 1)) / (c.prof.mass * (cs + 1));
    let gang = 0;
    for (const o of sim.ents) if (o !== d && o.side === d.side && !o.down && dist(o.pos, c.pos) < 1.7) gang++;
    const holdingBall = isSackable(sim, c); // QB still a passer behind the LOS
    let p = 0.9 + 0.55 * (tackleSkill - evade) + 0.16 * (angleQ - 0.5) + 0.08 * clamp(momentum - 1, -1, 1) + 0.12 * gang - 0.1 * (1 - d.energy);
    if (holdingBall) p += 0.08;
    if (lunge) p -= 0.22;
    if (juked) p -= 0.2;
    if (fromBlock) p -= 0.15;
    p = clamp(p, 0.15, 0.96);
    // Fumble on contact: hit power vs ball security, worse on blind-side hits.
    const pFumble = (0.004 + 0.022 * D.hitPower * (1 - C.carrying)) * (closing > 3 ? 1.4 : 0.8) * (facing < -0.3 ? 1.6 : 1) * (sim.tune?.turnover ?? 1);
    if (sim.rng.chance(p)) {
      if (!holdingBall && sim.rng.chance(pFumble)) return fumble(sim, c, d);
      // Yards after contact: the carrier's momentum carries the pile forward (less when met square).
      const fall = clamp(cs * (0.2 + 0.08 * C.balance) * (c.prof.mass / d.prof.mass) * (facing > 0.5 ? 0.7 : 1), 0, 2.6);
      const assists = sim.ents.filter(o => o !== d && o.side === d.side && !o.down && dist(o.pos, c.pos) < 1.6).map(o => o.id);
      c.pos.x += (cu.x * dir > 0 ? dir : 0) * fall;
      c.down = true;
      if (holdingBall) sim.emit('SACK', { by: d.id, qb: c.id, x: +c.pos.x.toFixed(1), move: d.winMove || d.rushMove || null, unblocked: !d.engCount, stunt: sim.stunt ? (sim.stunt.pen === d || sim.stunt.loop === d ? sim.stunt.type : null) : null, collapse: sim.qbState?.pocket?.collapse ?? null });
      else sim.emit('TACKLE', { by: d.id, carrier: c.id, assists, x: +c.pos.x.toFixed(1) });
      sim.whistle(holdingBall ? 'SACK' : 'TACKLE');
      return;
    }
    // Broken: a truck / stiff arm puts the tackler on the ground longer; spinning out costs the carrier speed.
    d.stun = mod.move === 'TRUCK' ? 1.2 : mod.move === 'STIFF_ARM' ? 0.95 : 0.75; d.down = false; d.vel.x *= 0.2; d.vel.y *= 0.2;
    const keep = mod.move === 'TRUCK' ? 0.62 : mod.move === 'SPIN' ? 0.8 : 0.72;
    c.vel.x *= keep; c.vel.y *= keep;
    sim.emit('BROKEN_TACKLE', { by: d.id, carrier: c.id, sackEscape: holdingBall, move: mod.move, lunge, fromBlock });
  }
}

function fumble(sim, c, d) {
  sim.emit('FUMBLE', { carrier: c.id, forcedBy: d.id, x: +c.pos.x.toFixed(1) });
  const spot = { x: c.pos.x + sim.rng.range(-2.5, 2.5), y: clamp(c.pos.y + sim.rng.range(-2.5, 2.5), 0.5, FIELD_W - 0.5) };
  const cands = sim.ents.filter(o => !o.down && dist(o.pos, spot) < 7 && o !== c);
  const rec = cands.length ? sim.rng.weighted(cands.map(o => [o, 1 / (dist(o.pos, spot) ** 2 + 0.5)])) : c;
  sim.emit('FUMBLE_RECOVERY', { by: rec.id, side: rec.side, lost: rec.side !== c.side, x: +spot.x.toFixed(1) });
  c.down = true;
  sim.fumbleSpot = spot; sim.fumbleRecoveredBy = rec;
  sim.whistle('FUMBLE');
}

// Out of bounds / touchdown / safety checks for the carrier.
export function checkCarrierDead(sim) {
  const c = sim.carrier;
  if (!c) return;
  const dir = carrierDir(c);
  if (dir > 0 && c.pos.x >= 110) { sim.emit('TOUCHDOWN', { by: c.id, side: c.side }); return sim.whistle('TOUCHDOWN'); }
  if (dir < 0 && c.pos.x <= 10) { sim.emit('TOUCHDOWN', { by: c.id, side: c.side }); return sim.whistle('TOUCHDOWN'); }
  if (c.pos.y < 0 || c.pos.y > FIELD_W) {
    c.pos.y = clamp(c.pos.y, 0, FIELD_W);
    sim.emit('OUT_OF_BOUNDS', { carrier: c.id, x: +c.pos.x.toFixed(1) });
    return sim.whistle('OUT_OF_BOUNDS');
  }
}
