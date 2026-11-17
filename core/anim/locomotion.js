// Sport-agnostic locomotion helpers shared by the NFL, MLB and NHL renderers:
//  * StridePhase: per-athlete phase that advances with the DISTANCE actually covered between frames (feet never skate),
//  * gait pickers that map real speed to a keyframed loop clip (core/anim/clips/*). One loop = one full stride cycle.
// Units are passed in: `scale` converts the sport's distance unit to yards (NFL: 1, MLB feet: 1/3, NHL feet: 1/3).

export class StridePhase {
  constructor(scale = 1) { this.scale = scale; this.map = new Map(); }
  // pos: {x,y} in sport units; now: seconds (wall clock). Returns the stride phase in radians.
  update(id, pos, now, seed = 0) {
    let st = this.map.get(id);
    if (!st) { st = { x: pos.x, y: pos.y, ph: seed * 0.7, t: now }; this.map.set(id, st); }
    const d = Math.hypot(pos.x - st.x, pos.y - st.y) * this.scale, dt = Math.max(1e-3, (now - st.t) / 1000), v = Math.min(11, d / dt);
    if (d < 3) st.ph += d * (2.5 - 0.11 * v);                    // d >= 3 yd in one frame = teleport (new play / faceoff): keep the phase
    st.x = pos.x; st.y = pos.y; st.t = now; return st.ph;
  }
  clear() { this.map.clear(); }
}

// speed in yd/s -> running gait (football/baseball): same thresholds the NFL renderer has always used
export function runGait({ speed, backwards = false, carrying = false }) {
  if (speed < 0.45) return null;
  if (backwards && speed > 0.8) return 'mv_backpedal';
  if (speed < 2.3) return 'mv_walk';
  if (speed < 4.3) return 'mv_jog';
  if (speed < 6.6) return carrying ? 'mv_run_ball' : 'mv_run';
  return carrying ? 'mv_sprint_ball' : 'mv_sprint';
}

// speed in yd/s -> skating gait (hockey): glide when slow, striding when fast, backwards skate, crossover when turning hard
export function skateGait({ speed, backwards = false, turning = false }) {
  if (speed < 0.6) return null;
  if (backwards && speed > 1.0) return 'hk_skate_back';
  if (turning && speed > 3) return 'hk_crossover';
  if (speed < 3.2) return 'hk_glide';
  return 'hk_skate';
}
