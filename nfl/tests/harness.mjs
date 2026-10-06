// Statistical harness: runs N simulated plays and prints distributions.
// Usage: node tests/harness.mjs [plays=1000] [playType=pass|deep|run|mix] [off=SEA] [def=NE]
import { lineups } from './fixtures.mjs';
import { createPlay, runToEnd } from '../src/sim/playSim.js';

export function runBatch(n, playType = 'mix', off = 'SEA', def = 'NE', extra = {}) {
  const ls = lineups(off, def);
  const plays = [];
  const types = ['pass', 'pass', 'deep', 'run'];
  for (let i = 0; i < n; i++) {
    const pt = playType === 'mix' ? types[i % types.length] : playType;
    const sim = createPlay({ offense: ls.offense, defense: ls.defense, ballOn: 20 + (i * 7) % 55, down: 1 + (i % 3), distance: [10, 6, 3][i % 3], playType: pt, seed: `H-${off}-${def}-${i}`, ...extra });
    const r = runToEnd(sim);
    r.qbLog = sim.qbState.log; r.debugEvents = sim.debugEvents;
    plays.push(r);
  }
  return plays;
}

export function summarize(plays) {
  const pass = plays.filter(p => p.playType !== 'run');
  const att = pass.filter(p => p.events.some(e => e.type === 'PASS_ATTEMPT' && !e.throwAway)).length;
  const cmp = pass.filter(p => p.outcome === 'COMPLETE').length;
  const sacks = pass.filter(p => p.outcome === 'SACK').length;
  const ints = pass.filter(p => p.outcome === 'INTERCEPTION').length;
  const scr = pass.filter(p => p.outcome === 'SCRAMBLE').length;
  const passYds = pass.filter(p => p.outcome === 'COMPLETE').reduce((s, p) => s + p.yards, 0);
  const runs = plays.filter(p => p.playType === 'run');
  const rushYds = runs.reduce((s, p) => s + (p.turnover ? 0 : p.yards), 0);
  const reasons = {};
  for (const p of pass) for (const e of p.events) if (e.type === 'INCOMPLETE') reasons[e.reason] = (reasons[e.reason] || 0) + 1;
  const ttt = pass.map(p => p.events.find(e => e.type === 'PASS_ATTEMPT')?.t).filter(Boolean);
  const reads = pass.map(p => p.events.find(e => e.type === 'PASS_ATTEMPT')?.read).filter(x => x != null);
  const readDist = reads.reduce((m, r) => (m[r] = (m[r] || 0) + 1, m), {});
  return {
    plays: plays.length, passPlays: pass.length, att, cmpPct: +(100 * cmp / Math.max(1, att)).toFixed(1),
    ypa: +(passYds / Math.max(1, att)).toFixed(2), sackPct: +(100 * sacks / Math.max(1, pass.length)).toFixed(1),
    intPct: +(100 * ints / Math.max(1, att)).toFixed(1), qbRunPct: +(100 * scr / Math.max(1, pass.length)).toFixed(1),
    scrambleStartPct: +(100 * pass.filter(p => p.events.some(e => e.type === 'SCRAMBLE')).length / Math.max(1, pass.length)).toFixed(1),
    explosivePass: pass.filter(p => p.outcome === 'COMPLETE' && p.yards >= 20).length,
    avgTimeToThrow: +(ttt.reduce((a, b) => a + b, 0) / Math.max(1, ttt.length)).toFixed(2),
    readDist, incompleteReasons: reasons,
    runs: runs.length, ypc: +(rushYds / Math.max(1, runs.length)).toFixed(2),
    explosiveRun: runs.filter(p => p.yards >= 10).length, stuffed: runs.filter(p => p.yards <= 0).length,
    fumblesLost: plays.filter(p => p.outcome === 'FUMBLE_LOST').length, tds: plays.filter(p => p.touchdown).length,
    timeouts: plays.filter(p => p.reason === 'TIME').length,
    avgDuration: +(plays.reduce((s, p) => s + p.duration, 0) / plays.length).toFixed(2),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [n = 1000, type = 'mix', off = 'SEA', def = 'NE'] = process.argv.slice(2);
  const t0 = Date.now();
  const plays = runBatch(Number(n), type, off, def);
  console.log(summarize(plays));
  console.log(`(${plays.length} plays in ${Date.now() - t0} ms)`);
}
