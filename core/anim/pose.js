// Data-driven pose / clip model shared by the 2D canvas avatar and the Blender export (tools/blender).
// A POSE is a plain object of joint values; a CLIP is a list of keyframes over normalised time 0..1 plus a duration in
// SIMULATION seconds (the renderers advance clips with sim.t, so game speed 0.5x..4x scales animations for free).
//
// Angle convention (radians, side view, "forward" = the way the athlete faces):
//   a*  upper-arm angle measured from straight down; +π/2 = horizontal forward, ±π = straight up, -π/2 = backward
//   f*  forearm angle, SAME convention, absolute (so the elbow flexion is f - a; the Blender export subtracts)
//   lean   torso rotation around the hip (+ forward)         crouch 0..1.6  hips drop       air 0..2  body lift (u)
//   l*/k*  foot offset forward (u) / foot lift (u) of the front (F) and back (B) leg
//   ball   which hand holds the ball: '' | 'F' | 'B' | 'FB'  (step value, not interpolated)
// F / B = the arm/leg on the facing side / the opposite side.
// Arm angles are UNWRAPPED automatically (defineClip): each key is moved by ±2π to stay within π of the previous one, so an
// overhand throw sweeps from cocked (-2.6) over the top (-π) to released (-3.9 = 2.35 - 2π), never back through 'straight down'.
export const NEUTRAL = Object.freeze({ lean: 0, crouch: 0, air: 0, aF: 0.15, fF: 0.45, aB: -0.12, fB: 0.2, lF: 0, kF: 0, lB: 0, kB: 0, ball: '' });
export const NUMERIC = Object.freeze(['lean', 'crouch', 'air', 'aF', 'fF', 'aB', 'fB', 'lF', 'kF', 'lB', 'kB']);
export const RANGE = Object.freeze({ lean: [-1.6, 1.6], crouch: [0, 1.6], air: [0, 2.5], aF: [-9.5, 9.5], fF: [-9.5, 9.5], aB: [-9.5, 9.5], fB: [-9.5, 9.5], lF: [-3, 3], lB: [-3, 3], kF: [0, 3], kB: [0, 3] });
export const BALL_HANDS = Object.freeze(['', 'F', 'B', 'FB']);

const smooth = t => t * t * (3 - 2 * t);
const EASES = { smooth, linear: t => t, in: t => t * t, out: t => 1 - (1 - t) * (1 - t) };

// Carry-forward: each key lists only the joints that change; the rest inherit from the previous key (first key from NEUTRAL).
const TAU = Math.PI * 2, ANGLES = ['aF', 'fF', 'aB', 'fB'];
export function defineClip(def) {
  let cur = { ...NEUTRAL }, prev = null;
  const keys = def.keys.map(([t, d]) => {
    cur = { ...cur, ...d };
    if (prev) { // shortest-path unwrapping: each arm angle is moved by ±2π so it stays within π of the previous key (arms sweep over the top, not through the hip)
      const fixed = { ...cur };
      for (const J of ANGLES) { let v = fixed[J]; while (v - prev[J] > Math.PI) v -= TAU; while (v - prev[J] < -Math.PI) v += TAU; fixed[J] = v; }
      cur = fixed;
    }
    prev = cur;
    return { t, pose: cur };
  });
  return Object.freeze({ loop: false, ease: 'smooth', ev: {}, ...def, keys });
}

export function samplePose(clip, p) {
  const ks = clip.keys, e = EASES[clip.ease] || smooth;
  if (clip.loop) p = p - Math.floor(p); else p = Math.max(0, Math.min(1, p));
  if (p <= ks[0].t) return ks[0].pose;
  const last = ks[ks.length - 1];
  if (p >= last.t) return last.pose;
  let i = 1; while (i < ks.length - 1 && ks[i].t < p) i++;
  const A = ks[i - 1], B = ks[i], k = e((p - A.t) / Math.max(1e-6, B.t - A.t)), out = { ball: A.pose.ball };
  for (const j of NUMERIC) out[j] = A.pose[j] + (B.pose[j] - A.pose[j]) * k;
  return out;
}

// Blend two poses (transitions between clips / into locomotion). w = weight of B.
export function blendPose(a, b, w) {
  const out = { ball: w < 0.5 ? a.ball : b.ball };
  for (const j of NUMERIC) out[j] = a[j] + (b[j] - a[j]) * w;
  return out;
}

export function validateClip(c) {
  const errs = [];
  if (!c.id || !c.name || !c.group || (!c.catalog && c.source !== 'extra')) errs.push('missing id/name/group, and catalog (or source: \'extra\' for rulebook/new entries)');
  if (!(c.dur > 0 && c.dur <= 12)) errs.push('dur out of range');
  if (!c.keys?.length || c.keys[0].t !== 0 || c.keys[c.keys.length - 1].t !== 1) errs.push('keys must span 0..1');
  c.keys?.forEach((k, i) => {
    if (i && k.t <= c.keys[i - 1].t) errs.push(`key ${i} not increasing`);
    for (const j of NUMERIC) { const v = k.pose[j], [lo, hi] = RANGE[j]; if (!Number.isFinite(v) || v < lo || v > hi) errs.push(`key ${i} ${j}=${v} out of [${lo},${hi}]`); }
    if (!BALL_HANDS.includes(k.pose.ball)) errs.push(`key ${i} bad ball hand`);
  });
  for (const [n, t] of Object.entries(c.ev || {})) if (!(t >= 0 && t <= 1)) errs.push(`event ${n} outside 0..1`);
  return errs;
}
