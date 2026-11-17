import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinchTracker, ladderStep } from '../core/ui/touchZoom.js';
const two = d => [{ x: 0, y: 0 }, { x: d, y: 0 }];
test('pinch tracker: spreading = zoom in (-1), pinching = zoom out (+1), small moves and non-pairs do nothing, long pinches walk several steps', () => {
  const t = createPinchTracker(0.28);
  assert.equal(t.update(two(100)), 0); assert.equal(t.update(two(110)), 0); assert.equal(t.update(two(135)), -1);           // base 100 -> 135 > 1.28
  assert.equal(t.update(two(150)), 0); assert.equal(t.update(two(180)), -1);                                                   // baseline reset after each step
  assert.equal(t.update(two(120)), 1);                                                                                          // 120 < 180/1.28
  assert.equal(t.update([{ x: 0, y: 0 }]), 0); assert.equal(t.update(two(200)), 0);                                            // lone finger resets, next pair re-baselines
  assert.equal(t.update(two(1)), 0); t.reset(); assert.equal(t.update(null), 0);
});
test('ladderStep: clamps at both ends and starts from the middle when the current camera is not on the ladder', () => {
  const L = ['PUCK', 'BROADCAST', 'TACTICAL', 'FULL'];
  assert.equal(ladderStep(L, 'BROADCAST', -1), 'PUCK'); assert.equal(ladderStep(L, 'PUCK', -1), 'PUCK'); assert.equal(ladderStep(L, 'TACTICAL', 1), 'FULL'); assert.equal(ladderStep(L, 'FULL', 1), 'FULL');
  assert.equal(ladderStep(L, 'BALL', 1), 'FULL'); assert.equal(ladderStep(['close', 'medium', 'full'], 'medium', -1), 'close');
});

test('rotate hint: only on a narrow upright screen, only on match routes, and never after being dismissed', async () => {
  const { needsRotateHint } = await import('../core/ui/mobileNav.js');
  const base = { width: 390, height: 844, hash: '#play', dismissed: false };
  assert.equal(needsRotateHint(base), true); assert.equal(needsRotateHint({ ...base, hash: '#rink' }), true); assert.equal(needsRotateHint({ ...base, hash: '#diamond' }), true);
  assert.equal(needsRotateHint({ ...base, hash: '#home' }), false); assert.equal(needsRotateHint({ ...base, width: 844, height: 390 }), false);
  assert.equal(needsRotateHint({ ...base, width: 820, height: 1180 }), false); assert.equal(needsRotateHint({ ...base, dismissed: true }), false); assert.equal(needsRotateHint({ ...base, hash: undefined }), false);
});
