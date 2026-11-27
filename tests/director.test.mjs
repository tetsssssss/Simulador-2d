import test from 'node:test';
import assert from 'node:assert/strict';
import { wantedShot, createDirector, MIN_HOLD } from '../nfl/src/ui/director.js';
test('wantedShot follows the play', () => {
  assert.equal(wantedShot({ phase: 'RUN', huddle: true }), 'TACTICAL');
  assert.equal(wantedShot({ phase: 'RUN', simPhase: 'PRE_THROW' }), 'QB'); assert.equal(wantedShot({ phase: 'RUN', simPhase: 'HANDOFF' }), 'QB');
  assert.equal(wantedShot({ phase: 'RUN', simPhase: 'BALL_AIR' }), 'BROADCAST'); assert.equal(wantedShot({ phase: 'RUN', simPhase: 'CARRY' }), 'BROADCAST');
  assert.equal(wantedShot({ phase: 'REPLAY', scoring: true }), 'ENDZONE'); assert.equal(wantedShot({ phase: 'REPLAY' }), 'BROADCAST'); assert.equal(wantedShot({ phase: 'AWAIT' }), 'BROADCAST');
});
test('director holds a shot for MIN_HOLD, but cuts at once for the huddle and for replay start/end', () => {
  const d = createDirector();
  assert.equal(d.pick({ phase: 'RUN', huddle: true }, 0), 'TACTICAL');                    // huddle starts: immediate
  assert.equal(d.pick({ phase: 'RUN', simPhase: 'PRE_THROW' }, 0.5), 'TACTICAL');         // too soon to change
  assert.equal(d.pick({ phase: 'RUN', simPhase: 'PRE_THROW' }, MIN_HOLD + 0.1), 'QB');
  assert.equal(d.pick({ phase: 'RUN', simPhase: 'BALL_AIR' }, MIN_HOLD + 0.3), 'QB');     // held
  assert.equal(d.pick({ phase: 'RUN', simPhase: 'BALL_AIR' }, 2 * MIN_HOLD + 0.5), 'BROADCAST');
  assert.equal(d.pick({ phase: 'REPLAY', scoring: true }, 2 * MIN_HOLD + 0.6), 'ENDZONE');   // forced cut into the replay
  assert.equal(d.pick({ phase: 'AWAIT' }, 2 * MIN_HOLD + 0.7), 'BROADCAST');              // forced cut out of the replay
});
