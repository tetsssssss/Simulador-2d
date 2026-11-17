// NFL flags in the engine: opt-in per play, deterministic, accept/decline logic, game-level effects.
import test from 'node:test';
import assert from 'node:assert/strict';
const { createPlay, runToEnd } = await import('../nfl/src/sim/playSim.js');
const { FOUL_RULES, pickFoul, decideFlag, FOUL_LABEL } = await import('../nfl/src/sim/fouls.js');
const { FOULS } = await import('../nfl/src/ui/penalties.js');
const { lineups, roster } = await import('../nfl/tests/fixtures.mjs');
const { createRng } = await import('../nfl/src/core/rng.js');
const { simulateGame, DEFAULT_PENALTY_RATE } = await import('../nfl/src/game/match.js');
const ls = lineups('SEA', 'NE');
const play = (i, extra = {}) => createPlay({ offense: ls.offense, defense: ls.defense, ballOn: 30, down: 2, distance: 8, playType: ['pass', 'run', 'deep'][i % 3], seed: `PE-${i}`, ...extra });

test('rules table is consistent with the presentation table (side, yards) and every foul has a label', () => {
  for (const k of Object.keys(FOUL_RULES)) { assert.ok(FOUL_LABEL[k], k); assert.ok(FOULS[k], `ui lacks ${k}`); assert.equal(FOULS[k].side, FOUL_RULES[k].side, `${k} side`); assert.equal(FOULS[k].yards, FOUL_RULES[k].yards, `${k} yards`); }
});
test('default createPlay never flags (calibration / golden runs stay flag-free); same seed → same flag', () => {
  for (let i = 0; i < 40; i++) { const r = runToEnd(play(i)); assert.ok(!r.penalty && !r.events.some(e => e.type === 'PENALTY')); }
  const a = runToEnd(play(5, { penaltyRate: 1 })), b = runToEnd(play(5, { penaltyRate: 1 }));
  assert.deepEqual(a.events.filter(e => e.type.startsWith('PENALTY')), b.events.filter(e => e.type.startsWith('PENALTY')));
});
test('penaltyRate 1: every play has one flag; pre-snap fouls end the play at once with ± yards, in-play fouls accept or decline', () => {
  let pre = 0, inplay = 0, acc = 0, dec = 0;
  for (let i = 0; i < 120; i++) {
    const sim = play(i, { penaltyRate: 1 }), r = runToEnd(sim), pen = r.events.filter(e => e.type === 'PENALTY');
    assert.equal(pen.length, 1, `seed ${i}`); assert.ok(r.penalty); const rule = FOUL_RULES[pen[0].foul];
    assert.ok(sim.ents.some(e => e.id === pen[0].by) || pen[0].by === null);
    if (rule.phase === 'pre') { pre++; assert.equal(r.outcome, 'PENALTY'); assert.equal(Math.abs(r.yards), rule.yards); assert.equal(Math.sign(r.yards), rule.side === 'off' ? -1 : 1); assert.ok(r.duration < 0.1); }
    else { inplay++; assert.ok(r.events.some(e => e.type === 'PENALTY_RESULT')); if (r.penalty.accepted) { acc++; assert.ok(!r.turnover && !r.touchdown && !r.safety); assert.equal(Math.abs(r.yards) <= rule.yards, true); } else dec++; }
    assert.ok(Number.isFinite(r.yards) && r.spotX >= 0 && r.spotX <= 120);
  }
  assert.ok(pre > 15 && inplay > 40 && acc > 10 && dec > 5, `pre ${pre} in ${inplay} acc ${acc} dec ${dec}`);
});
test('decideFlag: offended team takes the flag unless the play was clearly better', () => {
  const R = FOUL_RULES;
  assert.equal(decideFlag(R.DPI, { yards: 4, outcome: 'COMPLETE' }, 8), true);            // 15 yd + auto first beats a 4 yd gain
  assert.equal(decideFlag(R.DPI, { yards: 30, outcome: 'COMPLETE' }, 8), false);          // 30 yd play stands
  assert.equal(decideFlag(R.DPI, { yards: 0, touchdown: 'off' }, 8), false);              // never wipe out a touchdown you scored
  assert.equal(decideFlag(R.HOLDING_DEFENSE, { yards: 0, turnover: true }, 8), true);     // offense takes the flag after an interception
  assert.equal(decideFlag(R.HOLDING_OFFENSE, { yards: 0, turnover: true }, 8), false);    // defense keeps the takeaway
  assert.equal(decideFlag(R.HOLDING_OFFENSE, { yards: 0, touchdown: 'off' }, 8), true);   // defense wipes out the touchdown
  assert.equal(decideFlag(R.HOLDING_OFFENSE, { yards: 2, outcome: 'RUSH' }, 8), true);
  assert.equal(decideFlag(R.HOLDING_OFFENSE, { yards: -9, outcome: 'RUSH' }, 8), false);  // a tackle for loss is better than 10 yd
  const rng = createRng(3), seen = new Set(); for (let i = 0; i < 400; i++) seen.add(pickFoul(rng, 'run'));
  assert.ok(!seen.has('DPI') && !seen.has('ROUGHING_PASSER') && seen.has('FALSE_START'), [...seen].join());
});
test('full games: ~8–16 accepted flags per game, valid down/distance/spot after every flag, and rate 0 gives none', async () => {
  const n = 3; let flags = 0;
  for (let i = 0; i < n; i++) {
    const g = await simulateGame({ roster: roster(), home: 'SEA', away: 'NE', seed: 'FLG' + i, quarterMin: 15 });
    assert.ok(g.over && g.ballOn >= 1 && g.ballOn <= 99 && g.down >= 1 && g.down <= 4 && g.distance >= 1);
    flags += g.log.filter(l => l.kind === 'flag').length;
  }
  assert.ok(flags / n >= 6 && flags / n <= 20, `flags/game ${flags / n}`); assert.equal(DEFAULT_PENALTY_RATE, 0.065);
  const z = await simulateGame({ roster: roster(), home: 'SEA', away: 'NE', seed: 'FLG0', quarterMin: 8, tuning: { penaltyRate: 0 } });
  assert.equal(z.log.filter(l => l.kind === 'flag').length, 0);
});
