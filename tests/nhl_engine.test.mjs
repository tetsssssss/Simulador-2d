import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJSON } from './env.mjs';
const { fromSnapshot, makeAttrs, overall } = await import('../nhl/src/nhlData.js');
const { buildLineup } = await import('../nhl/src/game/lineup.js');
const { createHockeyEngine } = await import('../nhl/src/sim/hockeyEngine.js');
const snap = readJSON('nhl/data/roster_snapshot.json');
const team = a => ({ abbr: a, name: a, color: '#000', color2: '#fff', lineup: buildLineup(snap.players.filter(p => p.team === a).map(fromSnapshot)) });
const play = seed => { const e = createHockeyEngine({ home: team('BOS'), away: team('TOR'), seed }); while (!e.state.over) e.simulate(120, { maxEvents: 1e9 }); return e.state; };

test('nhl ratings: calibrated with real stats (stars above the league mean)', () => {
  const all = snap.players.map(fromSnapshot), ovr = p => overall(p, makeAttrs(p));
  const mean = all.reduce((a, p) => a + ovr(p), 0) / all.length;
  for (const n of ['Auston Matthews', 'David Pastrnak', 'Connor McDavid', 'Cale Makar']) assert.ok(ovr(all.find(p => `${p.firstName.default} ${p.lastName.default}` === n)) > mean + 6, n);
});

test('nhl engine: deterministic per seed, full game ends with a winner', () => {
  const a = play('det'), b = play('det');
  assert.deepEqual(a.score, b.score); assert.equal(a.events.length, b.events.length);
  assert.ok(a.over && a.score.home !== a.score.away && a.period >= 3);
});

test('nhl engine: realistic game totals over several games (goals, shots, save%, PP, hits)', () => {
  const N = 6, t = { g: 0, sog: 0, pp: 0, hit: 0, fo: 0 };
  for (let i = 0; i < N; i++) {
    const s = play('r' + i);
    t.g += s.score.home + s.score.away - (s.shootout ? 1 : 0); t.sog += s.shots.home + s.shots.away;
    for (const e of s.events) { if (e.type === 'POWER_PLAY') t.pp++; if (e.type === 'HIT') t.hit++; if (e.type === 'FACEOFF') t.fo++; }
    assert.ok(s.players.every(p => Number.isFinite(p.x + p.y + p.vx + p.vy)) && Number.isFinite(s.puck.x + s.puck.y), 'no NaN');
  }
  const pg = k => t[k] / N;
  assert.ok(pg('g') >= 3 && pg('g') <= 11, `goals/game ${pg('g')}`);
  assert.ok(pg('sog') >= 40 && pg('sog') <= 95, `SOG/game ${pg('sog')}`);
  const svp = 1 - t.g / t.sog; assert.ok(svp > 0.86 && svp < 0.94, `sv% ${svp.toFixed(3)}`);
  assert.ok(pg('pp') >= 1 && pg('pp') <= 14, `PP/game ${pg('pp')}`);
  assert.ok(pg('hit') >= 15 && pg('hit') <= 110, `hits/game ${pg('hit')}`);
  assert.ok(pg('fo') >= 30 && pg('fo') <= 140, `faceoffs/game ${pg('fo')}`);
});

test('nhl engine: stats agree with the score and events carry the full vocabulary', () => {
  const s = play('stats');
  const goals = side => Object.entries(s.box).reduce((a, [id, b]) => a + (s.roster[id].team === side ? b.g : 0), 0);
  const so = side => (s.shootout?.winner === side ? 1 : 0);
  assert.equal(goals('home') + so('home'), s.score.home); assert.equal(goals('away') + so('away'), s.score.away);
  const sog = side => Object.entries(s.box).reduce((a, [id, b]) => a + (s.roster[id].team === side ? b.sog : 0), 0);
  assert.equal(sog('home'), s.shots.home); assert.equal(sog('away'), s.shots.away);
  const types = new Set(s.events.map(e => e.type));
  for (const t of ['PERIOD_START', 'FACEOFF', 'PASS', 'ZONE_ENTRY', 'SHOT', 'SAVE', 'HIT', 'TAKEAWAY', 'PERIOD_END', 'FINAL']) assert.ok(types.has(t), t);
  // every goal names a scorer on the scoring team and assists from teammates
  for (const g of s.events.filter(e => e.type === 'GOAL')) { assert.equal(s.roster[g.by]?.team, g.team); for (const a of g.assists) assert.equal(s.roster[a].team, g.team); }
});

test('nhl engine: advance() is frame-rate independent and returns an interpolation alpha', () => {
  const e = createHockeyEngine({ home: team('BOS'), away: team('TOR'), seed: 'alpha' });
  for (let i = 0; i < 120; i++) { const a = e.advance(1 / 60); assert.ok(a >= 0 && a <= 1); }
  const t1 = e.state.t; const f = createHockeyEngine({ home: team('BOS'), away: team('TOR'), seed: 'alpha' });
  for (let i = 0; i < 40; i++) f.advance(1 / 20);
  assert.ok(Math.abs(t1 - f.state.t) < 0.05);
  e.setSpeed(4); const t2 = e.state.t; e.advance(0.1); assert.ok(e.state.t - t2 > 0.35);
});
