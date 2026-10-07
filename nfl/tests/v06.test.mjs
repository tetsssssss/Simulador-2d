// v0.6 (NFL engine + presentation): extended coverages, pass-rush moves + stunts, measured pocket + QB actions,
// run-game vocabulary, the "Por que terminou" explanation and sane calibration. Mechanisms and possibilities,
// not scripted results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineups } from './fixtures.mjs';
import { createPlay, step, runToEnd, chooseDefCall } from '../src/sim/playSim.js';
import { PLAYBOOK, DEF_CALLS, DEF_SLOTS } from '../src/sim/formation.js';
import { RUSH_MOVES } from '../src/sim/blocking.js';
import { explainPlay } from '../src/sim/explain.js';
import { pocketInfo } from '../src/sim/pocket.js';
import { createRng } from '../src/core/rng.js';
import { defCalls, cpuDefenseCall, newGameState } from '../src/game/match.js';

const ls = lineups('SEA', 'NE');
const mk = (seed, extra = {}) => createPlay({ offense: ls.offense, defense: ls.defense, ballOn: 30, playType: 'pass', seed, ...extra });
const fin = v => Number.isFinite(v);
const NEW_CALLS = ['COVER_0', 'COVER_4', 'COVER_6', 'TAMPA_2'];
const ALL_CALLS = ['COVER_0', 'COVER_1', 'COVER_2', 'COVER_3', 'COVER_4', 'COVER_6', 'TAMPA_2'];

function checkFinite(sim) {
  for (const e of sim.ents) assert.ok(fin(e.pos.x) && fin(e.pos.y) && fin(e.vel.x) && fin(e.vel.y) && fin(e.energy), `${e.slot} NaN`);
  for (const eng of sim.engagements) assert.ok(fin(eng.lev), 'leverage NaN');
  const pk = sim.qbState?.pocket;
  if (pk) assert.ok(fin(pk.collapse) && fin(pk.depth) && fin(pk.width), 'pocket NaN');
}

test('defensive call table: Cover 0/1/2/3/4/6 + Tampa 2, pt-BR labels, selectable in the UI list', () => {
  for (const k of ALL_CALLS) assert.ok(DEF_CALLS[k] && DEF_CALLS[k].label, k);
  const keys = defCalls().map(d => d.key);
  for (const k of ALL_CALLS) assert.ok(keys.includes(k), `${k} selectable`);
  // Every defender has exactly one job (rush, man or zone).
  for (const k of ALL_CALLS) {
    const c = DEF_CALLS[k];
    for (const s of DEF_SLOTS) assert.equal([c.rush.includes(s), !!c.man[s], !!c.zones[s]].filter(Boolean).length, 1, `${k} ${s}`);
  }
  assert.equal(DEF_CALLS.COVER_0.rush.length, 6, 'cover 0 sends six');
  assert.ok(Object.values(DEF_CALLS.COVER_0.zones).length === 0, 'cover 0 has no zones (no deep help)');
  assert.equal(Object.values(DEF_CALLS.COVER_4.zones).filter(z => z.startsWith('DEEP_QTR')).length, 4, 'quarters = four deep quarters');
  const c6 = Object.values(DEF_CALLS.COVER_6.zones);
  assert.ok(c6.some(z => z.startsWith('DEEP_QTR')) && c6.some(z => z.startsWith('DEEP_HALF')), 'cover 6 = quarters + half');
  assert.equal(DEF_CALLS.TAMPA_2.zones.MIKE, 'DEEP_MIDDLE_MIKE', 'tampa 2: the MIKE runs the deep middle');
});

test('CPU defense picker can call every coverage (seeded)', () => {
  const seen = new Set();
  for (let i = 0; i < 600; i++) seen.add(chooseDefCall(createRng(i), 1 + (i % 4), [2, 6, 10][i % 3], true));
  for (const k of [...ALL_CALLS, 'COVER_1_BLITZ']) assert.ok(seen.has(k), `${k} reachable`);
  const g = newGameState({ home: 'SEA', away: 'NE', seed: 'T' });
  assert.equal(cpuDefenseCall(g), cpuDefenseCall(g), 'same game state => same call');
  // the legacy menu (no flag) never returns the new calls: same RNG stream as before
  const legacy = new Set();
  for (let i = 0; i < 300; i++) legacy.add(chooseDefCall(createRng(i), 1, 8));
  for (const k of NEW_CALLS) assert.ok(!legacy.has(k));
});

test('each coverage: alignment is real, no NaN, deterministic by seed (pass, deep, run)', () => {
  for (const defCall of ALL_CALLS) for (const playType of ['pass', 'deep', 'run']) {
    const extra = { defCall, playType, concept: playType === 'run' ? 'INSIDE_ZONE_R' : undefined };
    const a = mk(`COV-${defCall}-${playType}`, extra), b = mk(`COV-${defCall}-${playType}`, extra);
    assert.equal(a.call.def, defCall);
    while (step(a)) checkFinite(a);
    runToEnd(b);
    checkFinite(a);
    assert.equal(JSON.stringify(a.events), JSON.stringify(b.events), `${defCall} ${playType} events`);
    assert.equal(JSON.stringify(a.debugEvents), JSON.stringify(b.debugEvents), `${defCall} ${playType} debug events`);
    assert.equal(a.result.yards, b.result.yards);
    assert.ok(fin(a.result.yards) && fin(a.result.duration));
  }
});

test('coverage logic: Tampa MIKE sinks deep, quarters pattern-match verticals, Cover 0 has no safety help', () => {
  let mikeDepth = 0, mikeN = 0, matches = 0;
  for (let i = 0; i < 20; i++) {
    const t = mk(`TAMPA-${i}`, { defCall: 'TAMPA_2', playType: 'deep', concept: 'FOUR_VERTS' });
    assert.equal(t.def.MIKE.assignment.zone.name, 'DEEP_MIDDLE_MIKE');
    let maxD = 0;
    while (step(t) && t.t < 2.4) maxD = Math.max(maxD, t.def.MIKE.pos.x - t.losX);
    mikeDepth += maxD; mikeN++;
    const q = mk(`QTRS-${i}`, { defCall: 'COVER_4', playType: 'deep', concept: 'FOUR_VERTS' });
    runToEnd(q);
    matches += q.debugEvents.filter(e => e.type === 'MATCH').length;
  }
  assert.ok(mikeDepth / mikeN > 7.5, `MIKE reached ${(mikeDepth / mikeN).toFixed(1)} yd of depth on four verticals`);
  assert.ok(matches >= 10, `quarters matched verticals ${matches}x`);
  const c0 = mk('C0-1', { defCall: 'COVER_0' });
  assert.ok(c0.defense.filter(d => d.assignment?.type === 'MAN').length === 5 && c0.defense.filter(d => d.assignment?.type === 'RUSH').length === 6);
  assert.ok(!c0.defense.some(d => d.assignment?.type === 'ZONE'), 'no zone defenders in cover 0');
});

test('pass rush: RIP, SWIM, SPIN and COUNTER occur, win fights and end in pressures / sacks with the winning move', () => {
  const wins = {}, press = {}, sackMoves = {}, counters = {};
  let sacks = 0, pressures = 0;
  const calls = ['COVER_3', 'COVER_2', 'COVER_4', 'COVER_1', 'COVER_6', 'TAMPA_2', 'COVER_0'];
  for (let i = 0; i < 240; i++) {
    const sim = mk(`RUSH-${i}`, { defCall: calls[i % calls.length], playType: i % 4 === 3 ? 'deep' : 'pass', down: 2, distance: 8 });
    runToEnd(sim);
    for (const e of sim.debugEvents) {
      if (e.type === 'RUSH_WIN') wins[e.move] = (wins[e.move] || 0) + 1;
      if (e.type === 'PRESSURE') { pressures++; assert.ok('move' in e, 'PRESSURE records the rush move'); if (e.move) press[e.move] = (press[e.move] || 0) + 1; }
      if (e.type === 'RUSH_COUNTER') counters[e.to] = (counters[e.to] || 0) + 1;
    }
    const sk = sim.events.find(e => e.type === 'SACK');
    if (sk) { sacks++; assert.ok('move' in sk && 'unblocked' in sk, 'SACK records the winning move'); if (sk.move) sackMoves[sk.move] = (sackMoves[sk.move] || 0) + 1; }
  }
  for (const m of ['SPEED', 'POWER', 'RIP', 'SWIM', 'SPIN']) assert.ok(wins[m] > 0, `${m} wins fights: ${JSON.stringify(wins)}`);
  assert.ok(counters.COUNTER > 0, `COUNTER used after a stalemate: ${JSON.stringify(counters)}`);
  assert.ok(Object.keys(wins).length >= 6, JSON.stringify(wins));
  assert.ok(pressures >= 20 && Object.keys(press).length >= 4, `pressures ${pressures} ${JSON.stringify(press)}`);
  assert.ok(sacks >= 5 && Object.keys(sackMoves).length >= 2, `sacks ${sacks} ${JSON.stringify(sackMoves)}`);
  assert.ok(RUSH_MOVES.length >= 7);
});

test('rush moves are distinct attribute contests (finesse-heavy rusher picks swipe/swim/spin, power rusher bull-rushes)', () => {
  const finesse = { ratings: { passRush: 199, agility: 199, changeOfDirection: 199, strength: 60, speed: 120 } };
  const power = { ratings: { strength: 199, passRush: 90, agility: 70, speed: 80, explosiveness: 90 } };
  const count = ov => { const m = {}; for (let i = 0; i < 80; i++) { const s = mk(`MV-${i}`, { defCall: 'COVER_3', overrides: { LDE: ov, RDE: ov } }); for (const d of [s.def.LDE, s.def.RDE]) m[d.rushMove] = (m[d.rushMove] || 0) + 1; } return m; };
  const f = count(finesse), p = count(power);
  const fin2 = (f.SWIM || 0) + (f.SPIN || 0) + (f.FINESSE || 0), pin = (p.SWIM || 0) + (p.SPIN || 0) + (p.FINESSE || 0);
  assert.ok(fin2 > pin, `finesse rusher ${JSON.stringify(f)} vs power rusher ${JSON.stringify(p)}`);
  assert.ok((p.POWER || 0) > (f.POWER || 0), `power moves ${JSON.stringify(p)} vs ${JSON.stringify(f)}`);
});

test('stunts: TE / ET twists are planned, tracked in state + events, the looper loops and the line may read it', () => {
  for (const type of ['TE', 'ET']) {
    let loops = 0, pickups = 0, n = 0;
    for (let i = 0; i < 40; i++) {
      const sim = mk(`STUNT-${type}-${i}`, { defCall: 'COVER_3', stunt: type });
      assert.ok(sim.stunt && sim.stunt.type === type);
      assert.notEqual(sim.stunt.pen, sim.stunt.loop);
      assert.equal(sim.stunt.pen.slot.slice(0, 1), sim.stunt.loop.slot.slice(0, 1), 'same side');
      assert.equal(type === 'TE' ? sim.stunt.pen.slot.endsWith('DT') : sim.stunt.pen.slot.endsWith('DE'), true, 'penetrator');
      assert.ok(sim.debugEvents.some(e => e.type === 'STUNT' && e.type !== undefined));
      runToEnd(sim); checkFinite(sim);
      n++;
      if (sim.debugEvents.some(e => e.type === 'STUNT_LOOP')) loops++;
      if (sim.debugEvents.some(e => e.type === 'STUNT_PICKUP')) pickups++;
      assert.equal(explainPlay(sim).stunt.type, type, 'explanation reports the stunt');
    }
    assert.ok(loops >= n * 0.7, `${type}: looper looped ${loops}/${n}`);
    assert.ok(pickups > 0 && pickups < n, `${type}: line reads some stunts, not all (${pickups}/${n})`);
  }
  assert.equal(mk('STUNT-NONE', { stunt: 'NONE' }).stunt, undefined);
  assert.equal(mk('STUNT-BLITZ', { defCall: 'COVER_0', stunt: 'TE' }).stunt, undefined, 'no stunts on blitzes');
  // natural frequency (seeded, off the main RNG stream)
  let natural = 0;
  for (let i = 0; i < 150; i++) if (mk(`NAT-${i}`, { defCall: 'COVER_3' }).stunt) natural++;
  assert.ok(natural >= 8 && natural <= 45, `natural stunts ${natural}/150`);
});

test('pocket is measured from OL/DL positions and collapses with real losses; QB actions are driven by it', () => {
  const weak = { ratings: { passBlock: 55, blockFootwork: 55, blockStrength: 55, awareness: 55 } };
  const strong = { ratings: { passBlock: 198, blockFootwork: 198, blockStrength: 198, awareness: 198 } };
  const rusher = { ratings: { passRush: 198, strength: 195, speed: 185, explosiveness: 195, agility: 195 } };
  const OL = ['LT', 'LG', 'C', 'RG', 'RT'];
  const run = (olRatings, tag, n = 60) => {
    const out = { maxCollapse: 0, plays: 0, actions: {}, sacks: 0 };
    for (let i = 0; i < n; i++) {
      const ov = { LDE: rusher, LDT: rusher, RDT: rusher, RDE: rusher };
      for (const k of OL) ov[k] = olRatings;
      const sim = mk(`${tag}-${i}`, { defCall: ['COVER_3', 'COVER_4', 'COVER_2', 'COVER_6'][i % 4], overrides: ov });
      let mx = 0;
      while (step(sim)) {
        const pk = sim.qbState.pocket;
        if (pk) { assert.ok(pk.collapse >= 0 && pk.collapse <= 1); mx = Math.max(mx, pk.collapse); }
      }
      out.maxCollapse += mx; out.plays++;
      for (const a of sim.qbActions || []) out.actions[a.action] = (out.actions[a.action] || 0) + 1;
      if (sim.result.outcome === 'SACK') out.sacks++;
    }
    out.maxCollapse /= out.plays;
    return out;
  };
  const w = run(weak, 'PW'), s = run(strong, 'PS');
  assert.ok(w.maxCollapse > s.maxCollapse + 0.1, `weak line collapses more: ${w.maxCollapse.toFixed(2)} vs ${s.maxCollapse.toFixed(2)}`);
  assert.ok(w.sacks > s.sacks, `weak line allows more sacks (${w.sacks} vs ${s.sacks})`);
  // pocketInfo is a pure read of positions
  const sim = mk('POCKET-PURE'); for (let i = 0; i < 20; i++) step(sim);
  assert.deepEqual({ ...pocketInfo(sim), nearest: null }, { ...pocketInfo(sim), nearest: null });
  for (const a of ['STEP_UP', 'SLIDE', 'ROLL_OUT', 'SCRAMBLE', 'THROW_AWAY']) assert.ok((w.actions[a] || 0) + (s.actions[a] || 0) > 0, `QB action ${a} occurs: ${JSON.stringify(w.actions)}`);
});

test('run game vocabulary is exercised and visible: reach, drive, double, combo, pull, seal, climb, kick-out', () => {
  const techs = new Set(), dbg = new Set(), byConcept = {};
  for (const concept of Object.keys(PLAYBOOK.run)) for (let i = 0; i < 6; i++) {
    const sim = mk(`VOC-${concept}-${i}`, { playType: 'run', concept });
    runToEnd(sim);
    for (const e of sim.debugEvents) {
      dbg.add(e.type);
      if (e.type === 'BLOCK_ASSIGN') { techs.add(e.tech); (byConcept[concept] ||= new Set()).add(e.tech); }
    }
  }
  for (const t of ['REACH', 'DRIVE', 'DOUBLE', 'COMBO', 'PULL', 'SEAL', 'CLIMB', 'KICK']) assert.ok(techs.has(t), `${t} assigned: ${[...techs]}`);
  for (const e of ['BLOCK_ASSIGN', 'BLOCK_ENGAGE', 'DOUBLE_TEAM', 'DOUBLE_CONTROL', 'CLIMB', 'PULL_TURN', 'RB_DECISION']) assert.ok(dbg.has(e), `debug event ${e} seen: ${[...dbg]}`);
  assert.ok(byConcept.DUO_R.has('DOUBLE') && byConcept.OUTSIDE_ZONE_R.has('REACH') && byConcept.POWER_R.has('PULL') && byConcept.COUNTER_L.has('PULL') && byConcept.INSIDE_ZONE_R.has('COMBO'));
});

test('"Por que terminou": explanation derived from real events exists for every finished play (300 plays, no NaN)', () => {
  const calls = Object.keys(DEF_CALLS);
  const outcomes = {};
  for (let i = 0; i < 300; i++) {
    const playType = ['pass', 'pass', 'deep', 'run'][i % 4];
    const sim = mk(`EXP-${i}`, { playType, defCall: calls[i % calls.length], down: 1 + (i % 4), distance: [10, 6, 3][i % 3], ballOn: 5 + (i * 7) % 85, concept: playType === 'run' ? Object.keys(PLAYBOOK.run)[i % 12] : undefined });
    runToEnd(sim);
    checkFinite(sim);
    const r = sim.result;
    assert.ok(fin(r.yards) && fin(r.spotX), 'result finite');
    const x = explainPlay(sim);
    assert.ok(x && typeof x.why === 'string' && x.why.length > 8, `why for ${r.outcome}`);
    assert.ok(x.lines.length >= 1 && x.lines[0].k === 'Fim');
    for (const l of x.lines) assert.ok(!/undefined|NaN|null|\[object/.test(l.t), `bad text: ${l.t}`);
    outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
    // evidence checks
    if (r.outcome === 'SACK') assert.ok(x.pressure.length >= 1 || sim.events.find(e => e.type === 'SACK').by === null, 'sack lists the rusher');
    if (r.outcome === 'COMPLETE') assert.ok(x.passer && x.receiver, 'passer + receiver');
    if (sim.events.some(e => e.type === 'TACKLE')) assert.ok(x.tacklers.length >= 1);
    if (playType === 'run') assert.ok(x.lines.some(l => l.k === 'Corrida'));
  }
  assert.ok(outcomes.COMPLETE && outcomes.INCOMPLETE && outcomes.RUSH, JSON.stringify(outcomes));
  assert.equal(explainPlay(mk('EXP-LIVE')), null, 'no explanation before the whistle');
});

test('calibration stays sane with the full coverage menu (mixed plays over the whole league)', () => {
  const teams = ['SEA', 'NE', 'KC', 'SF', 'BUF', 'DAL', 'PHI', 'GB'];
  let att = 0, cmp = 0, passPlays = 0, sacks = 0, ints = 0, rushes = 0, rushYds = 0, nan = 0;
  for (let t = 0; t < teams.length; t++) {
    const l = lineups(teams[t], teams[(t + 3) % teams.length]);
    for (let i = 0; i < 70; i++) {
      const rng = createRng(`CAL-${t}-${i}`);
      const playType = ['pass', 'pass', 'deep', 'run'][i % 4];
      const defCall = chooseDefCall(rng, 1 + (i % 3), [10, 6, 3][i % 3], true);
      const sim = createPlay({ offense: l.offense, defense: l.defense, ballOn: 20 + (i * 7) % 55, down: 1 + (i % 3), distance: [10, 6, 3][i % 3], playType, defCall, seed: `CAL-${t}-${i}` });
      const r = runToEnd(sim);
      if (![r.yards, r.spotX, r.duration].every(fin)) nan++;
      if (playType === 'run') { rushes++; rushYds += r.turnover ? 0 : r.yards; continue; }
      passPlays++;
      if (r.events.some(e => e.type === 'PASS_ATTEMPT' && !e.throwAway)) att++;
      if (r.outcome === 'COMPLETE') cmp++;
      if (r.outcome === 'SACK') sacks++;
      if (r.outcome === 'INTERCEPTION') ints++;
    }
  }
  const cmpPct = 100 * cmp / att, sackPct = 100 * sacks / passPlays, ypc = rushYds / rushes, intPct = 100 * ints / att;
  assert.equal(nan, 0);
  assert.ok(cmpPct > 54 && cmpPct < 74, `completion ${cmpPct.toFixed(1)}%`);
  assert.ok(sackPct > 2 && sackPct < 9, `sack rate ${sackPct.toFixed(1)}%`);
  assert.ok(intPct < 5.5, `int rate ${intPct.toFixed(1)}%`);
  assert.ok(ypc > 3.3 && ypc < 5.3, `yards/carry ${ypc.toFixed(2)}`);
});

test('300 mixed plays: no NaN in any tick, same seed => same play (incl. new systems)', () => {
  const calls = Object.keys(DEF_CALLS);
  for (let i = 0; i < 300; i++) {
    const playType = ['pass', 'deep', 'run', 'pass', 'deep'][i % 5];
    const opts = { playType, defCall: calls[i % calls.length], down: 1 + (i % 4), distance: [10, 5, 2][i % 3], concept: playType === 'run' ? Object.keys(PLAYBOOK.run)[i % 12] : undefined };
    const a = mk(`N300-${i}`, opts);
    while (step(a)) if (a.tick % 6 === 0) checkFinite(a);
    checkFinite(a);
    if (i % 15 === 0) {
      const b = mk(`N300-${i}`, opts); runToEnd(b);
      assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
      assert.equal(JSON.stringify(a.debugEvents), JSON.stringify(b.debugEvents));
      assert.equal(JSON.stringify(explainPlay(a)), JSON.stringify(explainPlay(b)));
    }
  }
});
