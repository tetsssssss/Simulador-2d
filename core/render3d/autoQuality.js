// Automatic quality for the 3D mode (pure, unit-tested). Feed it every frame time (ms); it answers with a new level only when the change is justified:
//  * slow  : the AVERAGE of the last `window` frames is above `slowMs`  -> one level down  (average, not share: a GPU that blocks on some frames and not others still averages slow)
//  * fast  : average below `fastMs`, no frame above 3x `fastMs`, and `cooldown` frames passed since the last change -> one level up (never above `max`)
// A frame longer than `hitchMs` counts as `hitchMs` (one outlier = one slow frame, harmless; a device that really runs at 3 fps still downgrades).
// The caller skips hidden-tab / long-pause gaps (see overlay.js).
import { QUALITY_LEVELS } from './quality.js';
export function createAutoQuality({ start = 'medium', window: W = 60, slowMs = 28, fastMs = 15, cooldown = 600, hitchMs = 250, max = 'high' } = {}) {
  let level = start, buf = [], since = 0; const idx = l => QUALITY_LEVELS.indexOf(l);
  return {
    get level() { return level; },
    push(ms) {
      if (!(ms > 0)) return null; since++; buf.push(Math.min(ms, hitchMs)); if (buf.length > W) buf.shift(); if (buf.length < W) return null;
      const avg = buf.reduce((a, c) => a + c, 0) / W;
      if (avg > slowMs && idx(level) > 0) { level = QUALITY_LEVELS[idx(level) - 1]; buf = []; since = 0; return level; }
      if (since >= cooldown && avg < fastMs && Math.max(...buf) < fastMs * 3 && idx(level) < idx(max)) { level = QUALITY_LEVELS[idx(level) + 1]; buf = []; since = 0; return level; }
      return null;
    },
  };
}
