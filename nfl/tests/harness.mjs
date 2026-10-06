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

const pct = (a, b) => +(100 * a / Math.max(1, b)).toFixed(1);
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Run game: stuff/TFL/explosive rates, broken tackles per carry, RB decisions and moves.
export function runMetrics(runs) {
  const n = runs.length, ys = runs.map(p => (p.turnover ? 0 : p.yards));
  const count = (type, key) => { const m = {}; for (const p of runs) for (const e of [...p.events, ...(p.debugEvents || [])]) if (e.type === type) m[e[key]] = (m[e[key]] || 0) + 1; return m; };
  return {
    runMedian: median(ys), stuffPct: pct(ys.filter(y => y <= 0).length, n), tflPct: pct(ys.filter(y => y < 0).length, n),
    run4plusPct: pct(ys.filter(y => y >= 4).length, n), explosiveRunPct: pct(ys.filter(y => y >= 10).length, n), run20plusPct: pct(ys.filter(y => y >= 20).length, n),
    brokenTacklesPerCarry: +(runs.reduce((s, p) => s + p.events.filter(e => e.type === 'BROKEN_TACKLE').length, 0) / Math.max(1, n)).toFixed(3),
    rbDecisions: count('RB_DECISION', 'decision'), rbMoves: count('RB_MOVE', 'move'),
    ...(() => {
      const c = runs.filter(p => p.contactX != null && !p.turnover);
      const ybc = c.reduce((s, p) => s + p.contactX, 0) / Math.max(1, c.length);
      const yac = c.reduce((s, p) => s + (p.yards - p.contactX), 0) / Math.max(1, c.length);
      return { ybcPerCarry: +ybc.toFixed(2), yacoPerCarry: +yac.toFixed(2) };
    })(),
  };
}

// Passing depth split: air yards vs yards after catch.
export function passDepth(pass) {
  const comp = pass.filter(p => p.outcome === 'COMPLETE');
  const air = comp.map(p => p.events.find(e => e.type === 'PASS_ATTEMPT')?.airYards || 0);
  const yac = comp.map((p, i) => p.yards - air[i]);
  return {
    airYdsPerCmp: +(air.reduce((a, b) => a + b, 0) / Math.max(1, comp.length)).toFixed(2),
    yacPerCmp: +(yac.reduce((a, b) => a + b, 0) / Math.max(1, comp.length)).toFixed(2),
    pass20plusPctAtt: pct(comp.filter(p => p.yards >= 20).length, pass.filter(p => p.events.some(e => e.type === 'PASS_ATTEMPT' && !e.throwAway)).length),
    brokenTacklesPerCmp: +(comp.reduce((s, p) => s + p.events.filter(e => e.type === 'BROKEN_TACKLE').length, 0) / Math.max(1, comp.length)).toFixed(3),
  };
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
    ...runMetrics(runs), ...passDepth(pass),
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
