// Atmosphere — PresentationEngine listener that turns sport events into crowd intensity + sounds.
// The RULES are per sport ({ ambience, baseline(ctx), react(ev, ctx) → { bump, sounds:[[name, opts]] } });
// this module only applies them: CrowdIntensity → AudioEngine crowd bed + crowd stands visual.
import { createCrowdIntensity } from '../audio/crowdIntensity.js';

export function createAtmosphere({ rules, audio = null, crowd = null, intensity = createCrowdIntensity({ base: 30 }) }) {
  audio?.setAmbience(rules.ambience || null);
  let lastCtx = null;
  return {
    intensity,
    onEvent(ev, ctx = {}) {
      lastCtx = ctx;
      if (rules.baseline) intensity.setBaseline(rules.baseline(ctx, ev));
      const r = rules.react?.(ev, ctx) || {};
      if (r.bump) intensity.bump(r.bump);
      if (audio) for (const [name, opts] of r.sounds || []) audio.play(name, opts);
    },
    tick(dt) {
      const v = intensity.tick(dt);
      audio?.setCrowd(v);
      crowd?.setIntensity(v);
    },
    refreshBaseline(ctx) { if (rules.baseline) intensity.setBaseline(rules.baseline(ctx || lastCtx || {})); },
    dispose() { audio?.setAmbience(null); audio?.setCrowd(0); intensity.dispose(); },
  };
}
