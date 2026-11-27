// Pure decisions of the 3D NFL renderer (no PlayCanvas, no DOM): which clip an athlete plays, how fast, where the ball is, where each camera preset stands.
// Kept apart from fieldRenderer3d.js so it is unit-tested in Node and the engine-facing adapter stays thin.
import { locomotionClipId } from './animationMap.js';

const NOMINAL = { mv_walk: 1.6, mv_jog: 3.3, mv_run: 5.5, mv_run_ball: 5.5, mv_sprint: 8, mv_sprint_ball: 8, mv_backpedal: 2.2, mv_shuffle: 2, mv_carioca: 4 };   // yd/s a loop is authored for
export const clipSpeedFactor = (clip, speed) => (NOMINAL[clip] ? Math.max(0.6, Math.min(1.8, speed / NOMINAL[clip])) : 1);   // stretch the loop so feet do not skate

// Locomotion of one athlete from real velocity (same thresholds as the 2D renderer). ctx: { carrier, preSnap }
export function locomotion3d(e, ctx = {}) {
  if (e.down) return { clip: 'ag_pile_bottom', loop: false, speed: 1 };
  const vx = e.vel?.x || 0, vy = e.vel?.y || 0, sp = Math.hypot(vx, vy), f = e.facing || 0;
  const back = sp > 0.5 && ((vx * Math.cos(f) + vy * Math.sin(f)) / sp) < -0.35;
  const lat = sp > 0.8 && Math.abs((-vx * Math.sin(f) + vy * Math.cos(f)) / sp) > 0.8, carrying = ctx.carrier === e;
  const clip = locomotionClipId({ speed: sp, backwards: back, carrying, lateral: lat && e.side === 'def', ready: e.side === 'def' && !carrying && !!ctx.preSnap });
  return clip ? { clip, loop: true, speed: clipSpeedFactor(clip, sp) } : { clip: 'mv_idle', loop: true, speed: 1 };
}

// Ball position in SIM coordinates ({x,y,z (metres), yaw radians}) or null. Flying: the ball itself; held: at the carrier's chest (or the QB's before the throw); nothing in play: null.
export function ballPlacement(sim) {
  if (!sim) return null; const b = sim.ball, c = sim.carrier;
  if (b && !c) { const v = b.vel || { x: 0, y: 0 }; return { x: b.pos.x, y: b.pos.y, z: Math.max(0.12, b.z ?? 1), yaw: Math.atan2(v.y, v.x) || 0, flying: true }; }
  const h = c || (['PRE_THROW', 'HANDOFF', 'SCRAMBLE'].includes(sim.phase) ? sim.qb : null);
  if (!h) return null; const f = h.facing || 0;
  return { x: h.pos.x + Math.cos(f) * 0.25, y: h.pos.y + Math.sin(f) * 0.25, z: 1.05, yaw: f, flying: false };
}

// Camera presets in WORLD metres (x downfield, z = -sim y). ctx: { ballX (yd), qb: {x,y} (yd) | null, losX (yd) }
const YD = 0.9144, MID_Z = -(160 / 3) * YD / 2;
export const CAMERA_PRESETS = ['BROADCAST', 'TACTICAL', 'QB', 'ENDZONE'];
export function cameraRig(preset, ctx = {}) {
  const bx = Math.max(15, Math.min(120 * YD - 15, (ctx.ballX ?? ctx.losX ?? 60) * YD));
  switch (preset) {
    case 'TACTICAL': return { pos: [bx, 58, 7], look: [bx, 0, -21] };
    case 'QB': { const q = ctx.qb || { x: ctx.losX ?? 60, y: 26.7 }, qx = q.x * YD, qz = -q.y * YD; return { pos: [qx - 8.5, 3.6, qz], look: [qx + 24, 1.6, qz] }; }
    case 'ENDZONE': return { pos: [Math.max(-14, bx - 38), 11, MID_Z], look: [bx + 6, 1.2, MID_Z] };
    default: return { pos: [bx, 17, 30], look: [bx, 0, -(160 / 3) * YD * 0.42] };            // BROADCAST (same as nflField.broadcastTarget)
  }
}
