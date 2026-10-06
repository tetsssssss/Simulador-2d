import { writeFileSync } from 'node:fs';
import { lineups } from './fixtures.mjs';
import { createPlay, runToEnd } from '../src/sim/playSim.js';

export const GOLDEN = [
  ['NFL_TEST_PASS_001', { playType: 'pass' }],
  ['NFL_TEST_PASS_002', { playType: 'pass', defCall: 'COVER_1' }],
  ['NFL_TEST_DEEP_001', { playType: 'deep', defCall: 'COVER_2' }],
  ['NFL_TEST_PRESSURE_001', { playType: 'pass', defCall: 'COVER_1_BLITZ' }],
  ['NFL_TEST_RUN_001', { playType: 'run', concept: 'INSIDE_ZONE_R' }],
  ['NFL_TEST_RUN_002', { playType: 'run', concept: 'OUTSIDE_ZONE_L' }],
];

export function goldenSummaries() {
  const ls = lineups('SEA', 'NE');
  const out = {};
  for (const [seed, opts] of GOLDEN) {
    const r = runToEnd(createPlay({ offense: ls.offense, defense: ls.defense, ballOn: 30, seed, ...opts }));
    out[seed] = { concept: r.concept, defCall: r.defCall, outcome: r.outcome, yards: r.yards, duration: r.duration, events: r.events.map(e => e.type).join(' ') };
  }
  return out;
}

if (process.argv.includes('--update')) {
  writeFileSync(new URL('./golden.json', import.meta.url), JSON.stringify(goldenSummaries(), null, 2) + '\n');
  console.log('golden.json updated');
}
