import test from 'node:test'; import assert from 'node:assert/strict';
import { boardsPath, rinkCamera, RINK_CAMERAS, LEN, WID, FT } from '../core/render3d/rinkScene.js';
import { skaterClip } from '../nhl/src/rink/rinkRenderer3d.js';
test('rink: official 200x85 ft in metres and a closed rounded boards path inside it', () => {
  assert.ok(Math.abs(LEN - 60.96) < 0.01 && Math.abs(WID - 25.908) < 0.01);
  const P = boardsPath(); assert.equal(P.length, 36);
  assert.ok(P.every(p => p.x >= -1e-6 && p.x <= 200 + 1e-6 && p.y >= -1e-6 && p.y <= 85 + 1e-6));
  assert.ok(Math.hypot(P[0].x - 0, P[0].y - 28) < 1e-6, 'starts at the left board tangent');
});
test('rink cameras: all presets exist, follow the puck but stay inside the building, tactical is highest', () => {
  const c = Object.fromEntries(RINK_CAMERAS.map(k => [k, rinkCamera(k, 100)]));
  assert.ok(c.TACTICAL.pos[1] > c.FULL.pos[1] && c.FULL.pos[1] > c.BROADCAST.pos[1] && c.BROADCAST.pos[1] > c.PUCK.pos[1]);
  assert.ok(rinkCamera('BROADCAST', 0).pos[0] >= 10 && rinkCamera('BROADCAST', 200).pos[0] <= LEN - 10);
  assert.ok(rinkCamera('BROADCAST', 40).pos[0] < rinkCamera('BROADCAST', 160).pos[0]);
  void FT;
});
test('skaterClip: gait by speed, action overrides, goalie by save state', () => {
  assert.equal(skaterClip({ vx: 0, vy: 0 }, null).clip, 'mv_idle');
  assert.equal(skaterClip({ vx: 40, vy: 0 }, null).clip, 'hk_skate');
  assert.equal(skaterClip({ vx: 40, vy: 0, back: true }, null).clip, 'hk_skate_back');
  assert.equal(skaterClip({ vx: 40, vy: 0 }, { clip: 'hk_slap', token: 't' }).clip, 'hk_slap');
  assert.deepEqual(skaterClip({ goalie: true, state: 'BUTTERFLY' }, null), { clip: 'gk_butterfly', loop: false });
  assert.equal(skaterClip({ goalie: true }, null).clip, 'gk_ready');
});
