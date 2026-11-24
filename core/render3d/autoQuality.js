// Automatic quality for the 3D mode (pure, unit-tested). Feed it every frame time (ms); it answers with a new level only when the change is justified:
//  * slow  : >= `slowShare` of the last `window` frames took longer than `slowMs`  -> one level down
//  * fast  : every one of the last `window` frames took less than `fastMs` and `cooldown` frames passed since the last change -> one level up (never above `max`)
// Hidden-tab / hitch frames (> `hitchMs`) are ignored, so a tab switch does not downgrade the game.
import { QUALITY_LEVELS } from './quality.js';
export function createAutoQuality({ start = 'medium', window: W = 90, slowMs = 28, fastMs = 15, slowShare = 0.6, cooldown = 600, hitchMs = 250, max = 'high' } = {}) {
  let level = start, buf = [], since = 0; const idx = l => QUALITY_LEVELS.indexOf(l);
  return {
    get level() { return level; },
    push(ms) {
      if (!(ms > 0) || ms > hitchMs) return null; since++; buf.push(ms); if (buf.length > W) buf.shift(); if (buf.length < W) return null;
      const slow = buf.filter(x => x > slowMs).length / W;
      if (slow >= slowShare && idx(level) > 0) { level = QUALITY_LEVELS[idx(level) - 1]; buf = []; since = 0; return level; }
      if (since >= cooldown && buf.every(x => x < fastMs) && idx(level) < idx(max)) { level = QUALITY_LEVELS[idx(level) + 1]; buf = []; since = 0; return level; }
      return null;
    },
  };
}
