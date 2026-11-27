import test from 'node:test'; import assert from 'node:assert/strict';
import { replayStart, replayDue } from '../core/render3d/replayEvents.js';
const ev = [{ t: 1 }, { t: 2.5 }, { t: 2.5 }, { t: 4 }, { t: 9 }];
test('replayStart: first event at/after the replay start; none before', () => {
  assert.equal(replayStart(ev, 0), 0); assert.equal(replayStart(ev, 2.5), 1); assert.equal(replayStart(ev, 3), 3); assert.equal(replayStart(ev, 10), 5); assert.equal(replayStart([], 3), 0);
});
test('replayDue: an event fires once the replay clock reaches it, not before', () => {
  assert.equal(replayDue({ t: 4 }, 3.9), false); assert.equal(replayDue({ t: 4 }, 4), true); assert.equal(replayDue({ t: 4 }, 5), true);
});
