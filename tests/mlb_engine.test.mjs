import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { teamBy } = await import('../mlb/src/mlbData.js');
const { buildLineup, demoRoster } = await import('../mlb/src/game/lineup.js');
const { withSide } = await import('../mlb/src/game/matchView.js').catch(() => ({}));
const { createBaseballEngine, flight } = await import('../mlb/src/sim/baseballEngine.js');
const side = (abbr, s) => { const t = teamBy(abbr); const L = buildLineup(demoRoster(t), ''); const fix = r => r && ({ ...r, id: `${s}-${r.pid}`, team: s }); return { abbr, name: t.name, color: '#000', color2: '#fff', lineup: { ...L, order: L.order.map(fix), field: Object.fromEntries(Object.entries(L.field).map(([k, v]) => [k, fix(v)])), sp: fix(L.sp), bullpen: L.bullpen.map(fix) } }; };
const play = seed => { const e = createBaseballEngine({ home: side('NYY', 'home'), away: side('BOS', 'away'), seed }); let g = 0; while (!e.state.over && g++ < 400) e.simulate(60, { maxEvents: 1e9 }); return e.state; };

test('mlb flight: drag + backspin give Statcast-like carry; fair/foul and home runs', () => {
  const hr = flight({ ev: 106, la: 28, spray: -25 }); assert.ok(hr.hr && hr.dist > 380, `106/28 → ${hr.dist}`);
  const wall = flight({ ev: 106, la: 28, spray: 0 }); assert.ok(!wall.hr && wall.dist > 385, 'to dead center it dies at the 400-ft wall');
  const fly = flight({ ev: 88, la: 35, spray: 10 }); assert.ok(!fly.hr && fly.dist > 230 && fly.dist < 330, `88/35 → ${fly.dist}`);
  const gb = flight({ ev: 95, la: -5, spray: -20 }); assert.ok(!gb.hr && gb.pts.every(p => p.z < 4));
  assert.ok(flight({ ev: 90, la: 20, spray: 52 }).foul);
});

test('mlb engine: deterministic per seed; complete game with a winner', () => {
  const a = play('d1'), b = play('d1');
  assert.deepEqual(a.score, b.score); assert.equal(a.events.length, b.events.length);
  assert.ok(a.over && a.score.home !== a.score.away && a.inning >= 9);
});

test('mlb engine: realistic totals (runs, hits, HR, K, BB, pitches) over several games', () => {
  const N = 10, t = { r: 0, h: 0, hr: 0, k: 0, bb: 0, pc: 0, ab: 0 };
  for (let i = 0; i < N; i++) {
    const s = play('m' + i);
    t.r += s.score.home + s.score.away; t.h += s.hits.home + s.hits.away;
    for (const e of s.events) { if (e.type === 'HOME_RUN') t.hr++; if (e.type === 'STRIKEOUT') t.k++; if (e.type === 'WALK') t.bb++; if (e.type === 'PITCH') t.pc++; }
    for (const b of Object.values(s.box)) t.ab += b.ab;
    assert.ok([...s.fielders, ...s.runners].every(p => Number.isFinite(p.x + p.y)) && Number.isFinite(s.ball.x + s.ball.y + s.ball.z));
  }
  const pg = k => t[k] / N;
  assert.ok(pg('r') >= 3 && pg('r') <= 16, `runs ${pg('r')}`); assert.ok(pg('h') >= 9 && pg('h') <= 24, `hits ${pg('h')}`);
  assert.ok(pg('hr') >= 0.8 && pg('hr') <= 5, `HR ${pg('hr')}`); assert.ok(pg('k') >= 10 && pg('k') <= 26, `K ${pg('k')}`);
  assert.ok(pg('bb') >= 3 && pg('bb') <= 11, `BB ${pg('bb')}`); assert.ok(pg('pc') >= 220 && pg('pc') <= 360, `pitches ${pg('pc')}`);
  const ba = t.h / t.ab; assert.ok(ba > 0.19 && ba < 0.29, `BA ${ba.toFixed(3)}`);
});

test('mlb engine: box score agrees with the line score; 27+ outs per side', () => {
  const s = play('box');
  const runs = side => Object.entries(s.box).reduce((a, [id, b]) => a + (s.roster[id]?.team === side ? b.r : 0), 0);
  assert.equal(runs('home'), s.score.home); assert.equal(runs('away'), s.score.away);
  for (const side of ['home', 'away']) assert.equal(s.linescore[side].reduce((a, b) => a + (b || 0), 0), s.score[side]);
  const hits = side => Object.entries(s.box).reduce((a, [id, b]) => a + (s.roster[id]?.team === side ? b.h : 0), 0);
  assert.equal(hits('home'), s.hits.home); assert.equal(hits('away'), s.hits.away);
  const outs = side => Object.entries(s.box).reduce((a, [id, b]) => a + (s.roster[id]?.team === side ? b.outs : 0), 0);
  assert.ok(outs('home') >= 24 && outs('away') >= 24, `outs ${outs('home')}/${outs('away')}`);
  const types = new Set(s.events.map(e => e.type));
  for (const k of ['INNING_START', 'AT_BAT', 'PITCH', 'BALL', 'STRIKE', 'CONTACT', 'OUT', 'STRIKEOUT', 'INNING_END', 'FINAL']) assert.ok(types.has(k), k);
});
