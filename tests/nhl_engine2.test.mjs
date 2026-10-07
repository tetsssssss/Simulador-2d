// NHL engine v2: skating, puck entity, pass/shot catalogues, goalie state machine, event vocabulary, ranges over 12 games.
import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJSON } from './env.mjs';
const { fromSnapshot } = await import('../nhl/src/nhlData.js');
const { buildLineup } = await import('../nhl/src/game/lineup.js');
const { createHockeyEngine, DT, EVENT_TYPES, PASS_KINDS, SHOT_TYPES, GOALIE_STATES } = await import('../nhl/src/sim/hockeyEngine.js');
const { insideRink } = await import('../nhl/src/rink/geometry.js');
const { createCommentary } = await import('../core/commentary/commentaryEngine.js');
const { NHL_COMMENTARY } = await import('../nhl/src/presentation/commentary.js');
const snap = readJSON('nhl/data/roster_snapshot.json');
const team = a => ({ abbr: a, name: a, color: '#000', color2: '#fff', lineup: buildLineup(snap.players.filter(p => p.team === a).map(fromSnapshot)) });
const PAIRS = [['BOS', 'TOR'], ['EDM', 'COL'], ['NYR', 'FLA'], ['VGK', 'DAL']];
const N = 12;

// One shared 12-game batch (stepped manually so every tick can be inspected).
let batchP = null;
function batch() {
  return batchP ||= (() => {
    const B = { games: [], types: new Set(), pass: new Set(), shot: new Set(), gstate: new Set(), skate: new Set(), events: [], nan: 0, dupes: 0, outside: 0, turnTooFast: 0, over: 0, minEnergy: 1, benchGain: false, puckFields: true, lastTouchSeen: false, icing: 0, maxSpd: 0 };
    for (let i = 0; i < N; i++) {
      const [h, a] = PAIRS[i % PAIRS.length], e = createHockeyEngine({ home: team(h), away: team(a), seed: 'v2-' + i }), S = e.state;
      const prev = new Map(); let k = 0;
      while (!S.over && k++ < 4e5) {
        e.step();
        if (S.phase === 'FACEOFF') prev.clear(); // players are placed on the dots (teleport), not skated
        const P = S.puck;
        if (new Set(S.players.map(p => p.id)).size !== S.players.length) B.dupes++;
        if (!Number.isFinite(P.x + P.y + P.vx + P.vy + P.z + P.spin + P.dir)) B.nan++;
        if (!insideRink(P.x, P.y, 0)) B.outside++;
        if (!('owner' in P && 'lastTouch' in P && 'spin' in P && 'dir' in P && 'vx' in P)) B.puckFields = false;
        if (P.lastTouch) B.lastTouchSeen = true;
        for (const p of S.players) {
          if (!Number.isFinite(p.x + p.y + p.vx + p.vy + p.ax + p.ay + p.energy + p.facing)) B.nan++;
          if (p.goalie) { B.gstate.add(p.state); continue; }
          B.skate.add(p.skate); B.maxSpd = Math.max(B.maxSpd, Math.hypot(p.vx, p.vy)); B.minEnergy = Math.min(B.minEnergy, p.energy);
          const f0 = prev.get(p.id); if (f0 != null) { let d = Math.abs(p.facing - f0); if (d > Math.PI) d = 2 * Math.PI - d; if (d > 12 * DT + 1e-6) B.turnTooFast++; }
          prev.set(p.id, p.facing);
        }
        if (k % 30 === 0) for (const r of Object.values(S.roster)) if (r.onBench && r.energy > 0.99 && !r.goalie) B.benchGain = true;
      }
      for (const ev of S.events) { B.types.add(ev.type); if (ev.type === 'PASS') B.pass.add(ev.kind); if (ev.type === 'SHOT') B.shot.add(ev.shotType); if (ev.type === 'SAVE') B.gstate.add(ev.save); B.events.push(ev); }
      B.games.push({ S, e, h, a });
    }
    return B;
  })();
}

test('nhl v2: deterministic by seed (events, score, positions); different seeds diverge', () => {
  const run = seed => { const e = createHockeyEngine({ home: team('BOS'), away: team('TOR'), seed }); e.simulate(600, { maxEvents: 1e9 }); return e.state; };
  const a = run('d1'), b = run('d1'), c = run('d2');
  assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
  assert.deepEqual(a.players.map(p => [p.x, p.y, p.state, p.skate]), b.players.map(p => [p.x, p.y, p.state, p.skate]));
  assert.notEqual(JSON.stringify(a.events), JSON.stringify(c.events));
});

test('nhl v2: ranges over 12 games (goals, shots, SV%, penalties, icing)', () => {
  const B = batch(); let g = 0, sog = 0, pen = 0, pp = 0, ic = 0;
  for (const { S } of B.games) {
    assert.ok(S.over && S.period >= 3);
    g += S.score.home + S.score.away - (S.shootout ? 1 : 0); sog += S.shots.home + S.shots.away;
    for (const e of S.events) { if (e.type === 'PENALTY') pen++; if (e.type === 'POWER_PLAY') pp++; if (e.type === 'ICING') ic++; }
  }
  const gpg = g / N, spg = sog / N, sv = 1 - g / sog;
  assert.ok(gpg >= 4.5 && gpg <= 8, `goals/game ${gpg}`);
  assert.ok(spg >= 45 && spg <= 80, `shots/game ${spg}`);
  assert.ok(sv >= 0.88 && sv <= 0.93, `sv% ${sv}`);
  assert.ok(pen / N >= 2 && pen / N <= 12 && pp === pen, `penalties/game ${pen / N}, pp ${pp}`);
  assert.ok(ic / N < 12, `icing/game ${ic / N}`);
});

test('nhl v2: box score equals scoreboard, assists/goals are consistent', () => {
  for (const { S } of batch().games) {
    for (const side of ['home', 'away']) {
      const goals = Object.entries(S.box).reduce((a, [id, b]) => a + (S.roster[id].team === side ? b.g : 0), 0);
      const sog = Object.entries(S.box).reduce((a, [id, b]) => a + (S.roster[id].team === side ? b.sog : 0), 0);
      assert.equal(goals + (S.shootout?.winner === side ? 1 : 0), S.score[side]); assert.equal(sog, S.shots[side]);
      const ga = Object.entries(S.box).reduce((a, [id, b]) => a + (S.roster[id].team === side && S.roster[id].goalie ? b.ga : 0), 0);
      assert.equal(ga + (S.shootout?.winner && S.shootout.winner !== side ? 1 : 0), S.score[side === 'home' ? 'away' : 'home']);
    }
  }
});

test('nhl v2: no NaN, puck always inside the rink, puck entity has owner/lastTouch/spin/direction', () => {
  const B = batch();
  assert.equal(B.nan, 0); assert.equal(B.outside, 0); assert.equal(B.dupes, 0, 'a skater is never on the ice twice'); assert.ok(B.puckFields && B.lastTouchSeen);
});

test('nhl v2: skating states, turn rate limit, speed bound and energy', () => {
  const B = batch();
  for (const st of ['idle', 'accel', 'coast', 'brake', 'turn', 'backward', 'crossover']) assert.ok(B.skate.has(st), `skate state ${st} (saw ${[...B.skate]})`);
  assert.equal(B.turnTooFast, 0, 'heading never turns faster than 12 rad/s');
  assert.ok(B.maxSpd < 45, `max skater speed ${B.maxSpd}`);
  assert.ok(B.minEnergy < 0.9 && B.minEnergy >= 0.2, `energy drains (min ${B.minEnergy})`);
  assert.ok(B.benchGain, 'benched players recover to full energy');
});

test('nhl v2: every pass kind, shot type and goalie state occurs; events carry them', () => {
  const B = batch();
  for (const k of PASS_KINDS) assert.ok(B.pass.has(k), `pass ${k}`);
  for (const k of SHOT_TYPES) assert.ok(B.shot.has(k), `shot ${k}`);
  for (const k of GOALIE_STATES) assert.ok(B.gstate.has(k), `goalie ${k}`);
  for (const k of B.pass) assert.ok(PASS_KINDS.includes(k)); for (const k of B.shot) assert.ok(SHOT_TYPES.includes(k));
  assert.ok([...B.gstate].every(s => GOALIE_STATES.includes(s)));
});

test('nhl v2: every event type of the vocabulary is emitted and well formed', () => {
  const B = batch(), need = EVENT_TYPES.filter(t => t !== 'SHOOTOUT'); // shootouts only happen in tied 3rd/OT games
  for (const t of need) assert.ok(B.types.has(t), `event ${t}`);
  for (const e of B.events) {
    assert.ok(EVENT_TYPES.includes(e.type), `unknown event ${e.type}`);
    if (e.type === 'TURNOVER') assert.ok(['interception', 'takeaway', 'loose'].includes(e.cause));
    if (e.type === 'RECEPTION') assert.ok(e.by && e.from && PASS_KINDS.includes(e.kind));
  }
});

test('nhl v2: commentary narrates every emitted event without undefined/NaN', () => {
  const B = batch(), S = B.games[0].S, c = createCommentary({ pack: NHL_COMMENTARY, seed: 'v2' });
  const ctx = { name: id => S.roster[id]?.name, last: id => S.roster[id]?.last, team: s => S[s].abbr, score: { home: 2, away: 1 }, period: 2, clock: 600, clockLabel: '2º 10:00' };
  const seen = new Set();
  for (const e of B.events) {
    const l = c.describe(e, ctx);
    if (l) { seen.add(e.type); assert.ok(!/undefined|NaN|null/.test(l.text), `${e.type}: ${l.text}`); }
  }
  for (const t of ['PASS', 'SHOT', 'SAVE', 'GOAL', 'HIT', 'PENALTY', 'TURNOVER', 'RECEPTION']) assert.ok(seen.has(t), `narrated ${t}`);
});
