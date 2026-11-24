import test from 'node:test'; import assert from 'node:assert/strict';
import { createAutoQuality } from '../core/render3d/autoQuality.js';
import { readQualityMode } from '../core/render3d/quality.js';
const feed = (q, ms, n) => { let r = null; for (let i = 0; i < n; i++) r = q.push(ms) || r; return r; };
test('slow frames step the quality down one level at a time, to the floor', () => {
  const q = createAutoQuality({ start: 'high' }); assert.equal(feed(q, 40, 90), 'medium'); assert.equal(feed(q, 40, 90), 'low'); assert.equal(feed(q, 40, 300), null); assert.equal(q.level, 'low');
});
test('fast frames raise it only after the cooldown and never above max', () => {
  const q = createAutoQuality({ start: 'low', cooldown: 200 }); assert.equal(feed(q, 8, 150), null); assert.equal(feed(q, 8, 100), 'medium'); assert.equal(feed(q, 8, 300), 'high'); assert.equal(feed(q, 8, 400), null);
  const c = createAutoQuality({ start: 'medium', cooldown: 100, max: 'medium' }); assert.equal(feed(c, 5, 400), null);
});
test('hitches / hidden tab frames and mixed frame times do not change the level', () => {
  const q = createAutoQuality({ start: 'medium' }); assert.equal(feed(q, 1000, 500), null);
  for (let i = 0; i < 300; i++) assert.equal(q.push(i % 3 === 0 ? 40 : 16), null);   // 33 % slow < 60 %
  assert.equal(q.level, 'medium');
});
test('readQualityMode defaults to auto without storage', () => { assert.equal(readQualityMode(), 'auto'); });
