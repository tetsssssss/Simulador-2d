// Stats are a consequence of events: box score must agree with what happened on the field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineups, whoMap } from './fixtures.mjs';
import { createPlay, runToEnd } from '../src/sim/playSim.js';
import { emptyBox, applyPlayEvents } from '../src/sim/stats.js';

test('box score agrees with play results over 300 mixed plays', () => {
  const ls = lineups('KC', 'BUF');
  const who = whoMap(ls, 'KC', 'BUF');
  const box = emptyBox();
  let turnoverTackles = 0, cmp = 0, att = 0, passYds = 0, rushYds = 0, rushAtt = 0, sacks = 0, ints = 0;
  for (let i = 0; i < 300; i++) {
    const type = ['pass', 'deep', 'run'][i % 3];
    const r = runToEnd(createPlay({ offense: ls.offense, defense: ls.defense, ballOn: 25 + (i % 50), playType: type, seed: `ST-${i}` }));
    applyPlayEvents(box, r.events, who, 'KC');
    // NFL scoring rules: a completion / run that ends in a lost fumble still counts (yards to the fumble spot).
    const ev = t => r.events.find(e => e.type === t);
    const fumbleYds = ev('FUMBLE') ? Math.round(ev('FUMBLE').x - r.events[0].losX) : 0;
    if (ev('PASS_ATTEMPT')) att++;
    if (ev('PASS_COMPLETE')) { cmp++; passYds += r.outcome === 'COMPLETE' ? r.yards : fumbleYds; }
    if (ev('HANDOFF') || r.outcome === 'SCRAMBLE') { rushAtt++; rushYds += r.outcome === 'FUMBLE_LOST' ? fumbleYds : r.yards; }
    if (r.outcome === 'SACK') sacks++;
    if (r.turnover && r.events.some(e => e.type === 'TACKLE')) turnoverTackles++;
    if (r.outcome === 'INTERCEPTION') ints++;
    // per-play coherence: yards = spot - LOS
    if (!r.turnover) assert.equal(r.yards, Math.round(r.spotX - r.events[0].losX));
    if (r.outcome === 'COMPLETE') assert.ok(r.events.some(e => e.type === 'PASS_COMPLETE'));
  }
  const P = Object.values(box.players);
  const sum = f => P.reduce((s, p) => s + f(p), 0);
  assert.equal(sum(p => p.pass.att), att);
  assert.equal(sum(p => p.pass.cmp), cmp);
  assert.equal(sum(p => p.rec.rec), cmp, 'completions == receptions');
  assert.equal(sum(p => p.pass.yds), passYds);
  assert.equal(sum(p => p.rec.yds), passYds, 'passing yards == receiving yards');
  assert.equal(sum(p => p.rush.att), rushAtt);
  assert.equal(sum(p => p.rush.yds), rushYds);
  assert.equal(sum(p => p.pass.sacks), sacks);
  assert.equal(sum(p => p.pass.int), ints);
  assert.equal(sum(p => p.def.int), ints);
  assert.equal(box.teams.KC.passYds + box.teams.KC.rushYds, box.teams.KC.yards);
  // tackles by the offense only happen after a turnover (INT / fumble return)
  const offTacklesAllowed = turnoverTackles;
  assert.ok(sum(p => (p.team === 'KC' ? p.def.tkl : 0)) <= offTacklesAllowed);
});
