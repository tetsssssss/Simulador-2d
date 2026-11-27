// Export every registered clip to JSON for Blender (tools/blender/build_nfl_sprites.py) or any other tool.
//   node tools/anim/export_clips.mjs [outFile]      default: exports/anim/nfl_clips.json
// Contains the skeleton/convention description, the raw keyframes and the clip baked at 30 fps (so the consumer never needs to
// re-implement the interpolation / arm unwrapping).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ALL_CLIPS } from '../../core/anim/registry.js';
import { samplePose, NUMERIC, validateClip } from '../../core/anim/pose.js';

const out = process.argv[2] || new URL('../../exports/anim/nfl_clips.json', import.meta.url).pathname;
const FPS = 30, r = v => Math.round(v * 1e5) / 1e5;
const clips = ALL_CLIPS.map(c => {
  const errs = validateClip(c); if (errs.length) throw new Error(`${c.id}: ${errs.join('; ')}`);
  const n = Math.max(2, Math.round(c.dur * FPS) + 1), frames = [];
  for (let i = 0; i < n; i++) { const p = samplePose(c, i / (n - 1)), f = { ball: p.ball }; for (const j of NUMERIC) f[j] = r(p[j]); frames.push(f); }
  return { id: c.id, name: c.name, catalog: c.catalog, group: c.group, duration: c.dur, loop: !!c.loop, events: c.ev, fps: FPS, frames, keys: c.keys.map(k => ({ t: k.t, pose: Object.fromEntries([...NUMERIC.map(j => [j, r(k.pose[j])]), ['ball', k.pose.ball]]) })) };
});
const doc = {
  format: 'asu-clips/1', fps: FPS, count: clips.length,
  convention: {
    view: 'side view, athlete faces +X (right); angles in radians, 0 = limb hanging straight down, +π/2 = horizontal forward, ±π = straight up',
    joints: { lean: 'torso pitch around the hip, + forward', crouch: 'hip drop 0..1.6 (units of 1.5 u)', air: 'body lift in u', aF: 'front upper-arm angle', fF: 'front FOREARM absolute angle (elbow = fF - aF)', aB: 'back upper-arm angle', fB: 'back forearm absolute angle', lF: 'front foot forward offset (u)', kF: 'front foot lift (u)', lB: 'back foot forward offset (u)', kB: 'back foot lift (u)', ball: "'' | 'F' | 'B' | 'FB' hand holding the ball" },
    unit: 'u = body height / 10 (the 2D avatar is 10 u tall)',
  },
  clips,
};
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(doc));
console.log(`exported ${clips.length} clips (${clips.reduce((a, c) => a + c.frames.length, 0)} baked frames) → ${out}`);
