// CrowdIntensity 0–100. A situational baseline (set by the sport: third down, power play, full count…) plus decaying
// bursts from events (touchdown, goal, home run…). tick(dt) smooths the value; listeners get it every tick.
export function createCrowdIntensity({ base = 30, rise = 6, fall = 0.6, decay = 0.35 } = {}) {
  let value = base, baseline = base, burst = 0;
  const subs = new Set();
  const clamp = v => Math.max(0, Math.min(100, v));
  return {
    get value() { return value; },
    get baseline() { return baseline; },
    get target() { return clamp(baseline + burst); },
    setBaseline(v) { baseline = clamp(+v || 0); },
    // amount: how much louder (0..100). Bursts stack but never exceed the scale.
    bump(amount) { burst = Math.min(100, burst + Math.max(0, +amount || 0)); },
    tick(dt) {
      if (!(dt > 0)) return value;
      burst *= Math.exp(-decay * dt);
      if (burst < 0.2) burst = 0;
      const target = clamp(baseline + burst);
      const k = 1 - Math.exp(-(target > value ? rise : fall) * dt);
      value = clamp(value + (target - value) * k);
      for (const s of subs) s(value);
      return value;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    dispose() { subs.clear(); },
  };
}
