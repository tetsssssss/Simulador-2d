// MovementSystem: momentum-based steering. Players cannot teleport or turn instantly:
// forward acceleration, braking and lateral (turning) acceleration are limited by ratings and mass.
import { len, clamp, dist } from './geometry.js';

export function speedCap(e) {
  const fatigue = 0.86 + 0.14 * e.energy;
  return e.prof.maxSpeed * fatigue * (e.speedMul ?? 1);
}

// Steer the velocity toward `desired` (yd/s vector) respecting acceleration limits.
export function steer(e, desired, dt) {
  if (e.stun > 0) { desired = { x: desired.x * 0.25, y: desired.y * 0.25 }; }
  const cap = speedCap(e);
  let dl = len(desired);
  if (dl > cap) { desired = { x: desired.x / dl * cap, y: desired.y / dl * cap }; dl = cap; }
  const s = len(e.vel);
  const p = e.prof;
  if (s < 0.6) {
    // From (near) standstill: any direction, limited by acceleration.
    const dx = desired.x - e.vel.x, dy = desired.y - e.vel.y, d = Math.hypot(dx, dy);
    const lim = p.accel * dt;
    const k = d > lim ? lim / d : 1;
    e.vel.x += dx * k; e.vel.y += dy * k;
  } else {
    const fx = e.vel.x / s, fy = e.vel.y / s;
    const dx = desired.x - e.vel.x, dy = desired.y - e.vel.y;
    const along = dx * fx + dy * fy;
    const latX = dx - fx * along, latY = dy - fy * along;
    const accEff = p.accel * (1 - 0.55 * (s / p.maxSpeed) ** 2);
    const a = along > 0 ? Math.min(along, accEff * dt) : Math.max(along, -p.brake * dt);
    // Turning at speed is harder: lateral authority falls as speed rises.
    const latLim = p.turn * (e.turnMul ?? 1) * dt * (1.15 - 0.45 * (s / p.maxSpeed));
    const ll = Math.hypot(latX, latY);
    const lk = ll > latLim ? latLim / ll : 1;
    e.vel.x += fx * a + latX * lk;
    e.vel.y += fy * a + latY * lk;
  }
  const ns = len(e.vel);
  if (ns > cap && ns > 0) { e.vel.x *= cap / ns; e.vel.y *= cap / ns; }
}

// Desired velocity to reach a point, slowing down on arrival.
export function seekVelocity(e, target, speedFrac = 1, arrive = 0.4) {
  const dx = target.x - e.pos.x, dy = target.y - e.pos.y, d = Math.hypot(dx, dy);
  if (d < arrive * 0.3) return { x: 0, y: 0 };
  const sp = Math.min(speedCap(e) * speedFrac, Math.sqrt(2 * e.prof.brake * Math.max(0, d - arrive * 0.5)) + 0.4);
  return { x: dx / d * sp, y: dy / d * sp };
}

export function integrate(e, dt) {
  e.pos.x += e.vel.x * dt;
  e.pos.y += e.vel.y * dt;
  const s = len(e.vel);
  if (s > 0.3) e.facing = Math.atan2(e.vel.y, e.vel.x);
  // Stamina: exertion drains energy; better stamina drains less.
  const ex = (s / e.prof.maxSpeed) ** 2;
  e.energy = clamp(e.energy - dt * ex * 0.02 * (1.45 - e.prof.r.stamina), 0, 1);
  if (e.stun > 0) e.stun = Math.max(0, e.stun - dt);
}

// Body separation for players that are not locked in a block together.
// The ball carrier slides past his own teammates (he runs off their hips) instead of bouncing off them.
export function separate(ents, dt, carrier = null) {
  const R = 0.8;
  for (let i = 0; i < ents.length; i++) {
    const a = ents[i]; if (a.down) continue;
    for (let j = i + 1; j < ents.length; j++) {
      const b = ents[j]; if (b.down) continue;
      if (a.engagedWith === b || b.engagedWith === a) continue;
      if (carrier && (a === carrier || b === carrier) && a.side === b.side) continue;
      // A rusher who just beat his blocker has won the corner: he slips past that blocker's shoulder.
      if ((a.beatenBy === b && a.noBlock > 0) || (b.beatenBy === a && b.noBlock > 0)) continue;
      // A run blocker working to the second level slides off the hip of a defender already engaged by a teammate.
      if ((a.engagedWith && b.assignment?.type === 'RUN_BLOCK' && b.side !== a.side && !b.engagedWith) ||
          (b.engagedWith && a.assignment?.type === 'RUN_BLOCK' && a.side !== b.side && !a.engagedWith)) continue;
      const d = dist(a.pos, b.pos);
      if (d >= R || d < 1e-6) continue;
      const overlap = (R - d);
      const nx = (b.pos.x - a.pos.x) / d, ny = (b.pos.y - a.pos.y) / d;
      const ma = a.prof.mass, mb = b.prof.mass, tot = ma + mb;
      a.pos.x -= nx * overlap * (mb / tot); a.pos.y -= ny * overlap * (mb / tot);
      b.pos.x += nx * overlap * (ma / tot); b.pos.y += ny * overlap * (ma / tot);
      // Remove closing velocity (inelastic contact), mass weighted.
      const rel = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
      if (rel < 0) {
        a.vel.x += nx * rel * (mb / tot); a.vel.y += ny * rel * (mb / tot);
        b.vel.x -= nx * rel * (ma / tot); b.vel.y -= ny * rel * (ma / tot);
      }
    }
  }
}
