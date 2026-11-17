// Instant replay (presentation only): record every sim tick of a play, then re-play it slowly by writing the recorded state back into the
// finished sim object (which the renderer reads), then restore the final state. The simulation is never touched while it runs.
const MAX_FRAMES = 1200;   // 40 s at 30 Hz; plays end well before MAX_PLAY_TIME

export function createRecorder(max = MAX_FRAMES) {
  let frames = [];
  const cp = p => ({ x: p.x, y: p.y });
  return {
    reset() { frames = []; },
    get length() { return frames.length; },
    get duration() { return frames.length ? frames[frames.length - 1].t : 0; },
    capture(sim) {
      if (frames.length >= max) return;
      frames.push({
        t: sim.t, phase: sim.phase, carrier: sim.carrier ? sim.carrier.id : null,
        ents: sim.ents.map(e => [e.pos.x, e.pos.y, e.vel?.x ?? 0, e.vel?.y ?? 0, e.facing ?? 0, e.down ? 1 : 0]),
        ball: sim.ball ? { ...sim.ball, pos: cp(sim.ball.pos), vel: sim.ball.vel ? cp(sim.ball.vel) : undefined, z: sim.ball.z } : null,
      });
    },
    // Put the sim into the state at fractional frame index `i` (entities interpolate between frames i and i+1: prev = frame i, pos = frame i+1,
    // so the renderer's own alpha blend is 1 here and the sim looks continuous). Returns the clamped index.
    apply(sim, i) {
      if (!frames.length) return 0;
      const last = frames.length - 1, a = Math.max(0, Math.min(last, i)), k = Math.min(last - 1, Math.floor(a)), f0 = frames[Math.max(0, k)], f1 = frames[Math.min(last, k + 1)], u = last ? a - k : 0;
      const L = (x, y) => x + (y - x) * Math.max(0, Math.min(1, u));
      sim.ents.forEach((e, n) => {
        const A = f0.ents[n], B = f1.ents[n]; if (!A || !B) return;
        e.prev.x = A[0]; e.prev.y = A[1]; e.pos.x = B[0]; e.pos.y = B[1]; e.vel.x = B[2]; e.vel.y = B[3]; e.facing = B[4]; e.down = !!B[5];
      });
      const g = u > 0.5 ? f1 : f0;
      sim.phase = g.phase; sim.t = L(f0.t, f1.t); sim.carrier = g.carrier != null ? sim.ents.find(e => e.id === g.carrier) || null : null;
      sim.ball = g.ball ? { ...g.ball, pos: { ...g.ball.pos }, prev: { ...(f0.ball?.pos || g.ball.pos) } } : null;
      return a;
    },
  };
}
