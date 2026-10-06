// Play simulation: determinism, physical continuity, scenarios A-E (possibilities, not scripted results).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineups } from './fixtures.mjs';
import { createPlay, step, runToEnd } from '../src/sim/playSim.js';

const ls = lineups('SEA', 'NE');
const play = (seed, extra = {}) => runToEnd(createPlay({ offense: ls.offense, defense: ls.defense, ballOn: 30, playType: 'pass', seed, ...extra }));
const batch = (n, prefix, extra) => Array.from({ length: n }, (_, i) => play(`${prefix}-${i}`, extra));
const has = (r, t) => r.events.some(e => e.type === t);
const rate = (arr, f) => arr.filter(f).length / arr.length;

test('determinism: same seed + same state => identical play', () => {
  for (const seed of ['NFL_TEST_PASS_001', 'NFL_TEST_RUN_001']) {
    const type = seed.includes('RUN') ? 'run' : 'pass';
    const a = play(seed, { playType: type }), b = play(seed, { playType: type });
    assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
    assert.equal(a.yards, b.yards);
  }
});

test('continuity: no player or ball teleports during a play', () => {
  for (let i = 0; i < 25; i++) {
    const sim = createPlay({ offense: ls.offense, defense: ls.defense, ballOn: 30, playType: i % 4 === 3 ? 'run' : 'pass', seed: `CONT-${i}` });
    let ballPrev = null;
    while (step(sim)) {
      for (const e of sim.ents) {
        const d = Math.hypot(e.pos.x - e.prev.x, e.pos.y - e.prev.y);
        assert.ok(d < 0.75, `${e.slot} moved ${d.toFixed(2)} yd in one tick`); // > 22 yd/s would be a teleport
      }
      if (sim.ball) {
        if (ballPrev) assert.ok(Math.hypot(sim.ball.pos.x - ballPrev.x, sim.ball.pos.y - ballPrev.y) < 1.2, 'ball flies, never jumps');
        ballPrev = { ...sim.ball.pos };
      } else ballPrev = null;
    }
  }
});

test('pass play pipeline: snap -> throw -> flight time -> catch/incomplete -> whistle', () => {
  const plays = batch(60, 'PIPE');
  for (const r of plays) {
    assert.equal(r.events[0].type, 'SNAP');
    assert.equal(r.events.at(-1).type, 'WHISTLE');
    const pa = r.events.find(e => e.type === 'PASS_ATTEMPT');
    const comp = r.events.find(e => e.type === 'PASS_COMPLETE');
    if (comp) {
      assert.ok(pa && comp.t > pa.t + 0.1, 'ball needs flight time');
      assert.ok(has(r, 'TACKLE') || has(r, 'OUT_OF_BOUNDS') || has(r, 'TOUCHDOWN') || has(r, 'FUMBLE'), 'completion ends with a tackle/OOB/TD');
    }
  }
  assert.ok(rate(plays, r => r.outcome === 'COMPLETE') > 0.3);
});

// Scenario A: clean pocket + open receiver.
const weakRush = { ratings: { passRush: 30, speed: 60, strength: 60, explosiveness: 40 } };
const eliteOL = { ratings: { passBlock: 195, blockFootwork: 195, blockStrength: 195 } };
const cleanOverrides = { LDE: weakRush, LDT: weakRush, RDT: weakRush, RDE: weakRush, LT: eliteOL, LG: eliteOL, C: eliteOL, RG: eliteOL, RT: eliteOL };
// Scenario B: pressure.
const weakOL = { ratings: { passBlock: 40, blockFootwork: 40, blockStrength: 40 } };
const eliteDL = { ratings: { passRush: 195, speed: 175, explosiveness: 195, strength: 195 } };
const pressureOverrides = { LT: weakOL, LG: weakOL, C: weakOL, RG: weakOL, RT: weakOL, LDE: eliteDL, LDT: eliteDL, RDT: eliteDL, RDE: eliteDL };

test('scenario A — clean pocket: QB progresses, throws, ball travels, catches and tackles happen', () => {
  const plays = batch(60, 'A', { overrides: cleanOverrides, defCall: 'COVER_3' });
  assert.ok(rate(plays, r => has(r, 'PASS_ATTEMPT')) > 0.9);
  assert.ok(rate(plays, r => r.outcome === 'SACK') < 0.05);
  assert.ok(rate(plays, r => r.outcome === 'COMPLETE') > 0.5);
  assert.ok(plays.some(r => r.outcome === 'COMPLETE' && has(r, 'TACKLE')));
});

test('scenario B — pressure: pocket degrades and the QB reacts (sack / scramble / hurried / throwaway)', () => {
  const clean = batch(60, 'B0', { overrides: cleanOverrides, defCall: 'COVER_1' });
  const hot = batch(60, 'B1', { overrides: pressureOverrides, defCall: 'COVER_1_BLITZ' });
  const reacted = r => r.outcome === 'SACK' || has(r, 'SCRAMBLE') || r.events.some(e => e.type === 'PASS_ATTEMPT' && (e.hurried || e.throwAway));
  assert.ok(rate(hot, reacted) > 0.15, `pressure reactions ${rate(hot, reacted)}`);
  assert.ok(rate(hot, reacted) > 2 * rate(clean, reacted));
  assert.ok(rate(hot, r => r.outcome === 'SACK') > rate(clean, r => r.outcome === 'SACK'));
  assert.ok(hot.some(r => has(r, 'SHED')), 'sheds come from blocking interaction');
  const qbDisplaced = ps => rate(ps, r => r.events.some(e => e.type === 'SCRAMBLE') || r.outcome === 'SACK');
  assert.ok(qbDisplaced(hot) > qbDisplaced(clean), 'pressure moves/sacks the QB more often');
});

test('scenario C — covered primary: QB does not force read 1, he progresses', () => {
  const slowSlot = { ratings: { speed: 20, acceleration: 20, routeRunning: 20, release: 20, agility: 20, changeOfDirection: 20 } };
  const lockdown = { ratings: { manCoverage: 198, speed: 198, acceleration: 198, agility: 198, anticipation: 198, playRecognition: 198 } };
  const plays = batch(60, 'C', { concept: 'DRIVE', defCall: 'COVER_1', overrides: { ...cleanOverrides, SLOT: slowSlot, SS: lockdown } });
  const att = plays.map(r => r.events.find(e => e.type === 'PASS_ATTEMPT')).filter(Boolean);
  const forced = att.filter(e => e.read === 0).length; // read 1 of DRIVE = SLOT
  assert.ok(forced / att.length < 0.35, `read-1 forced ${forced}/${att.length}`);
  assert.ok(att.filter(e => e.read >= 1).length / att.length > 0.5, 'most throws come after progressing');
});

test('scenario D — incomplete passes do not invent catches, yards or receptions', () => {
  const plays = batch(120, 'D').filter(r => r.outcome === 'INCOMPLETE');
  assert.ok(plays.length > 5);
  for (const r of plays) {
    assert.ok(!has(r, 'PASS_COMPLETE'));
    assert.equal(r.yards, 0);
    assert.ok(has(r, 'INCOMPLETE'));
    assert.equal(r.spotX, r.events[0].losX);
  }
});

test('scenario E — defensive play: coverage can produce breakups and interceptions', () => {
  const ballhawk = { ratings: { manCoverage: 195, zoneCoverage: 195, playRecognition: 195, anticipation: 195, catching: 190, jumping: 190, speed: 190 } };
  const wildQB = { ratings: { shortAccuracy: 40, mediumAccuracy: 40, deepAccuracy: 40, awareness: 30, decisionMaking: 30, composure: 30 } };
  const base = batch(160, 'E0');
  const def = batch(160, 'E1', { overrides: { QB: wildQB, CBL: ballhawk, CBR: ballhawk, FS: ballhawk, SS: ballhawk } });
  const dp = r => r.outcome === 'INTERCEPTION' || has(r, 'PASS_BREAKUP') || r.events.some(e => e.type === 'INCOMPLETE' && e.reason === 'DEFLECTED');
  assert.ok(def.some(r => r.outcome === 'INTERCEPTION'), 'interceptions possible');
  assert.ok(def.some(r => has(r, 'PASS_BREAKUP')), 'breakups possible');
  assert.ok(rate(def, dp) > rate(base, dp), 'better coverage => more defensive plays');
});
