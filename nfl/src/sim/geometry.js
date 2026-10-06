// Field coordinates are in yards. x runs along the field (0..120, end zones 0-10 and 110-120),
// offense always attacks +x. y runs across the field (0..FIELD_W).
export const FIELD_LEN = 120;
export const FIELD_W = 53.33;
export const MID_Y = FIELD_W / 2;
export const GRAVITY = 10.73; // yd/s^2

export const v = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });
export const len = a => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = a => { const l = Math.hypot(a.x, a.y); return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; };
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const angleOf = a => Math.atan2(a.y, a.x);
export const fromAngle = (ang, l = 1) => ({ x: Math.cos(ang) * l, y: Math.sin(ang) * l });
export function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

// Distance from point p to segment ab.
export function distToSegment(p, a, b) {
  const ab = sub(b, a), l2 = dot(ab, ab);
  if (l2 < 1e-9) return dist(p, a);
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1);
  return dist(p, add(a, scale(ab, t)));
}

// Earliest time a chaser at `from` with speed `speed` can reach a target moving with constant velocity.
// Returns { t, point } (t = Infinity if unreachable).
export function interceptPoint(from, speed, targetPos, targetVel, maxT = 4) {
  let best = { t: Infinity, point: targetPos };
  for (let t = 0; t <= maxT; t += 0.1) {
    const p = add(targetPos, scale(targetVel, t));
    if (dist(from, p) <= speed * t + 0.6) { best = { t, point: p }; break; }
  }
  if (best.t === Infinity) best = { t: Infinity, point: add(targetPos, scale(targetVel, maxT)) };
  return best;
}
