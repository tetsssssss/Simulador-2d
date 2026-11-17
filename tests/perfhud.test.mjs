import test from 'node:test';
import assert from 'node:assert/strict';
import { frameStats } from '../core/ui/perfHud.js';
test('frameStats: fps, percentiles and slow-frame count from frame deltas', () => {
  assert.deepEqual(frameStats([]), { fps: 0, p50: 0, p95: 0, max: 0, over33: 0 });
  const s = frameStats([...Array(95).fill(16.7), ...Array(5).fill(50)]);
  assert.ok(s.fps > 50 && s.fps < 58, String(s.fps)); assert.equal(s.p50, 16.7); assert.equal(s.p95, 50); assert.equal(s.max, 50); assert.equal(s.over33, 5);
  assert.equal(frameStats([16.7, 16.7, 16.7]).over33, 0);
});
