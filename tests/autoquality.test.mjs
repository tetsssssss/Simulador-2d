import test from 'node:test'; import assert from 'node:assert/strict';
import { createAutoQuality } from '../core/render3d/autoQuality.js';
import { readQualityMode } from '../core/render3d/quality.js';
const feed = (q, ms, n) => { let r = null; for (let i = 0; i < n; i++) r = q.push(ms) || r; return r; };
test('slow frames step the quality down one level at a time, to the floor', () => {
  const q = createAutoQuality({ start: 'high' }); assert.equal(feed(q, 40, 60), 'medium'); assert.equal(feed(q, 40, 60), 'low'); assert.equal(feed(q, 40, 300), null); assert.equal(q.level, 'low');
});
test('fast frames raise it only after the cooldown and never above max', () => {
  const q = createAutoQuality({ start: 'low', cooldown: 200 }); assert.equal(feed(q, 8, 150), null); assert.equal(feed(q, 8, 100), 'medium'); assert.equal(feed(q, 8, 300), 'high'); assert.equal(feed(q, 8, 400), null);
  const c = createAutoQuality({ start: 'medium', cooldown: 100, max: 'medium' }); assert.equal(feed(c, 5, 400), null);
});
test('isolated hitches do not change the level; a device that really runs at ~3 fps still steps down', () => {
  const q = createAutoQuality({ start: 'medium' }); for (let i = 0; i < 600; i++) assert.equal(q.push(i % 50 === 0 ? 1000 : 16), null);
  for (let i = 0; i < 300; i++) assert.equal(q.push(i % 3 === 0 ? 40 : 16), null);   // average ~24 ms < 28
  assert.equal(q.level, 'medium'); assert.equal(feed(createAutoQuality({ start: 'medium' }), 340, 60), 'low');
  const bi = createAutoQuality({ start: 'medium' }); let r = null; for (let i = 0; i < 120; i++) r = bi.push(i % 4 === 0 ? 900 : 4) || r; assert.equal(r, 'low', 'bimodal GPU stalls (average ~60 ms) step down');
});
test('readQualityMode defaults to auto without storage', () => { assert.equal(readQualityMode(), 'auto'); });
