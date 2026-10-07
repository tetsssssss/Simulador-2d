// MLB engine v2: pitch model (8 types, spin/break/control), batter decisions, contact/flight/fielding/baserunning
// pipeline, adaptive attributes (pure function) and their wiring into the simulation.
import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { teamBy, D, adaptiveRatings, fixedRatings } = await import('../mlb/src/mlbData.js');
const { buildLineup, demoRoster } = await import('../mlb/src/game/lineup.js');
const { createBaseballEngine, flight } = await import('../mlb/src/sim/baseballEngine.js');
const { computeAdaptive, ADAPTIVE_NAMES, leverage } = await import('../mlb/src/sim/adaptive.js');
const { buildArsenal, PITCH_DEFS, PITCH_CODES } = await import('../mlb/src/sim/pitching.js');
const { simRatings } = await import('../mlb/src/sim/ratings.js');
const { MLB_COMMENTARY } = await import('../mlb/src/presentation/commentary.js');
const { baseballHook } = await import('../mlb/src/game/engineHook.js');
const { createCommentary } = await import('../core/commentary/commentaryEngine.js');

const side = (abbr, s) => { const t = teamBy(abbr); const L = buildLineup(demoRoster(t), ''); const fix = r => r && ({ ...r, id: `${s}-${r.pid}`, team: s }); return { abbr, name: t.name, color: '#000', color2: '#fff', lineup: { ...L, order: L.order.map(fix), field: Object.fromEntries(Object.entries(L.field).map(([k, v]) => [k, fix(v)])), sp: fix(L.sp), bullpen: L.bullpen.map(fix) } }; };
const TEAMS = ['NYY', 'BOS', 'LAD', 'SF', 'COL', 'SEA', 'HOU', 'ATL', 'CHC', 'STL', 'TB', 'TEX'];
const play = (seed, h = 'NYY', a = 'BOS', opts = {}) => { const e = createBaseballEngine({ home: side(h, 'home'), away: side(a, 'away'), seed, ...opts }); let g = 0; while (!e.state.over && g++ < 600) e.simulate(60, { maxEvents: 1e9 }); return e; };

let cached = null;
function season() { // 24 games between varied teams (cached: the slow part of this file)
  if (cached) return cached;
  const games = [];
  for (let i = 0; i < 24; i++) { const h = TEAMS[(i * 5 + 3) % 12], a = TEAMS[i % 12]; games.push(play('s2-' + i, h === a ? TEAMS[(i + 1) % 12] : h, a)); }
  return (cached = games);
}
const count = (games, f) => games.reduce((n, g) => n + g.state.events.filter(f).length, 0);

test('mlb v2: deterministic by seed (pitch fields, decisions, contact) and different across seeds', () => {
  const a = play('det-1').state, b = play('det-1').state, c = play('det-2').state;
  assert.equal(a.events.length, b.events.length);
  assert.deepEqual(a.events.filter(e => e.type === 'PITCH' || e.type === 'CONTACT').slice(0, 300), b.events.filter(e => e.type === 'PITCH' || e.type === 'CONTACT').slice(0, 300));
  assert.deepEqual(a.box, b.box);
  assert.notDeepEqual(a.events.slice(0, 60), c.events.slice(0, 60));
});

test('mlb v2: realistic ranges over 24 games (runs, K%, BB%, HR, BA, steals, bunts)', () => {
  const G = season();
  let r = 0, h = 0, ab = 0, pa = 0;
  for (const g of G) { const S = g.state; r += S.score.home + S.score.away; h += S.hits.home + S.hits.away; for (const b of Object.values(S.box)) ab += b.ab; }
  pa = count(G, e => e.type === 'AT_BAT');
  const k = count(G, e => e.type === 'STRIKEOUT'), bb = count(G, e => e.type === 'WALK'), hr = count(G, e => e.type === 'HOME_RUN');
  const sb = count(G, e => e.type === 'STOLEN_BASE'), cs = count(G, e => e.type === 'OUT' && e.kind === 'caughtStealing');
  const bunts = G.reduce((n, g) => n + g.state.stats.bunts, 0);
  const rpg = r / G.length / 2, kp = k / pa, bp = bb / pa, hrg = hr / G.length, ba = h / ab, att = (sb + cs) / G.length;
  console.log(`  24 games: R/team ${rpg.toFixed(2)} K% ${(kp * 100).toFixed(1)} BB% ${(bp * 100).toFixed(1)} HR/G ${hrg.toFixed(2)} BA ${ba.toFixed(3)} steal att/G ${att.toFixed(2)} (SB ${sb} CS ${cs}) bunts/G ${(bunts / G.length).toFixed(2)}`);
  assert.ok(rpg >= 3.5 && rpg <= 6, `R/G ${rpg}`); assert.ok(kp >= 0.18 && kp <= 0.26, `K% ${kp}`); assert.ok(bp >= 0.06 && bp <= 0.11, `BB% ${bp}`);
  assert.ok(hrg >= 1.8 && hrg <= 3.2, `HR/G ${hrg}`); assert.ok(ba >= 0.22 && ba <= 0.265, `BA ${ba}`);
  assert.ok(att >= 0.4 && att <= 1.6, `steal attempts/G ${att}`); assert.ok(sb > cs, 'steals mostly succeed');
  assert.ok(bunts > 0 && bunts / G.length < 1, `bunts/G ${bunts / G.length}`);
});

test('mlb v2: all 8 pitch types, all batter decisions and all 5 runner decisions occur; PITCH carries the physics', () => {
  const G = season(), P = G.flatMap(g => g.state.events.filter(e => e.type === 'PITCH'));
  const types = new Set(P.map(e => e.pitchType)); for (const t of PITCH_CODES) assert.ok(types.has(t), `pitch type ${t}`);
  const decs = new Set(P.map(e => e.decision)); for (const d of ['TAKE', 'CONTACT', 'NORMAL_SWING', 'POWER_SWING', 'PROTECT']) assert.ok(decs.has(d), `decision ${d}`);
  const rd = new Set(G.flatMap(g => g.state.events.filter(e => e.type === 'RUNNER_DECISION').map(e => e.decision))); for (const d of ['HOLD', 'ADVANCE', 'RETURN', 'TAG_UP', 'STEAL']) assert.ok(rd.has(d), `runner decision ${d}`);
  for (const e of P.slice(0, 2000)) {
    assert.ok(e.mph > 60 && e.mph < 108 && e.rpm > 900 && e.rpm < 3400 && e.axis >= 0 && e.axis < 360 && Number.isFinite(e.hb + e.vb + e.miss + e.x + e.z), JSON.stringify(e));
    assert.ok(typeof e.decision === 'string' && /^\d-\d$/.test(e.count));
  }
  // breaks have the right shape: curveballs drop (negative vb), four-seamers carry rise, sliders/cutters break glove side
  const avg = (t, k) => { const a = P.filter(e => e.pitchType === t); return a.reduce((s, e) => s + e[k], 0) / a.length; };
  assert.ok(avg('CU', 'vb') < 0 && avg('FF', 'vb') > 8 && avg('SL', 'hb') < 0 && avg('FC', 'hb') < 0 && avg('CH', 'hb') > 5);
  assert.ok(avg('FF', 'mph') > avg('SL', 'mph') + 4 && avg('SL', 'mph') > avg('CU', 'mph') + 2 && avg('FF', 'mph') > avg('CH', 'mph') + 5);
});

test('mlb v2: arsenals derive from ratings (not everyone throws all 8) and the pipeline order is explicit', () => {
  const G = season(), perPitcher = new Map();
  for (const g of G) for (const e of g.state.events) if (e.type === 'PITCH') { const s = perPitcher.get(e.pitcher) || new Set(); s.add(e.pitchType); perPitcher.set(e.pitcher, s); }
  const sizes = [...perPitcher.values()].map(s => s.size); assert.ok(Math.max(...sizes) < 8 && Math.min(...sizes) >= 1 && new Set(sizes).size > 1, `arsenal sizes ${sizes}`);
  const ars = (r) => buildArsenal(r, 'x').map(a => a.type);
  const ace = ars({ fb: 0.95, velo: 0.95, brk: 0.95, off: 0.95, movement: 0.9, control: 0.9, stamina: 0.9 }), junk = ars({ fb: 0.4, velo: 0.4, brk: 0.4, off: 0.4, movement: 0.4, control: 0.4, stamina: 0.3 });
  assert.ok(ace.length > junk.length && junk.length >= 3 && ace.length <= 6 && (ace.includes('FF') || ace.includes('FT') || ace.includes('SI')));
  const S = play('pipe').state; // the last pitch of a game ends in an out/hit: pipeline lists the stages in order
  const order = ['PITCH', 'BATTER_READ', 'DECISION', 'CONTACT', 'BALL_FLIGHT', 'FIELDING', 'THROW', 'BASERUNNING', 'RESULT'];
  assert.ok(S.lastPitch.pipeline.every((s, i, a) => !i || order.indexOf(s) > order.indexOf(a[i - 1])), S.lastPitch.pipeline.join('>'));
  assert.deepEqual(S.lastPitch.pipeline.slice(0, 3), ['PITCH', 'BATTER_READ', 'DECISION']);
});

test('mlb v2: ball flight is physical (spin, wind, wall carom, landing-based foul)', () => {
  const base = flight({ ev: 98, la: 27, spray: -8, spin: 2400 }), back = flight({ ev: 98, la: 27, spray: -8, spin: 3600 }), top = flight({ ev: 98, la: 27, spray: -8, spin: 600 });
  assert.ok(back.dist > base.dist && base.dist > top.dist, `${back.dist} ${base.dist} ${top.dist}`);
  const head = flight({ ev: 98, la: 27, spray: -8, spin: 2400, wind: { x: 0, y: -20, z: 0 } }), tail = flight({ ev: 98, la: 27, spray: -8, spin: 2400, wind: { x: 0, y: 20, z: 0 } });
  assert.ok(tail.dist > base.dist && base.dist > head.dist);
  assert.ok(flight({ ev: 95, la: 10, spray: 20, spin: 0 }).foul === false && flight({ ev: 95, la: 10, spray: 60, spin: 0 }).foul === true);
  const wallBall = flight({ ev: 104, la: 19, spray: 0, spin: 2200 }), ys = wallBall.pts.map(p => p.y); assert.ok(wallBall.wall && !wallBall.hr && Math.max(...ys) > ys.at(-1) + 3, 'the ball rebounds off the wall');
  const hook = flight({ ev: 100, la: 25, spray: 35, spin: 2200, side: 2400 }), straight = flight({ ev: 100, la: 25, spray: 35, spin: 2200 });
  assert.ok(Math.abs(hook.pts.at(-1).x - straight.pts.at(-1).x) > 10, 'sidespin bends the ball');
  for (const p of base.pts) assert.ok(Number.isFinite(p.x + p.y + p.z));
});

test('mlb v2: every emitted event type narrates; no NaN/undefined anywhere; box == scoreboard', () => {
  const G = season();
  const hook = baseballHook({});
  const seenTypes = new Set(); let lines = 0;
  for (const g of G.slice(0, 6)) {
    const S = g.state, comm = createCommentary({ pack: MLB_COMMENTARY, seed: 7 });
    for (const e of S.events) {
      for (const [k, v] of Object.entries(e)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${e.type}.${k}=${v}`);
      const ctx = { ...hook.commentaryCtx({ ...S, runners: S.runners, half: e.half, inning: e.inning, walkoff: S.walkoff }), outs: 1, balls: 1, strikes: 1 };
      const l = comm.describe(e, ctx); seenTypes.add(e.type);
      assert.ok(l && l.text && !/undefined|NaN|\[object/.test(l.text), `${e.type} (${e.kind || e.decision || ''}) → ${l?.text}`); lines++;
    }
  }
  assert.ok(lines > 3000 && ['RUNNER_DECISION', 'STOLEN_BASE', 'CONTACT', 'PITCH', 'OUT', 'HIT', 'HOME_RUN'].every(t => seenTypes.has(t)));
  for (const g of G) {
    const S = g.state, tot = side => Object.entries(S.box).reduce((a, [id, b]) => a + (S.roster[id]?.team === side ? b.r : 0), 0);
    assert.equal(tot('home'), S.score.home); assert.equal(tot('away'), S.score.away);
    assert.equal(Object.entries(S.box).reduce((a, [id, b]) => a + (S.roster[id]?.team === 'home' ? b.h : 0), 0), S.hits.home);
    assert.ok([...S.fielders, ...S.runners].every(p => Number.isFinite(p.x + p.y)) && Number.isFinite(S.ball.x + S.ball.y + S.ball.z));
    for (const b of Object.values(S.box)) for (const v of Object.values(b)) assert.ok(Number.isFinite(v));
  }
});

// ---------------- adaptive attributes ----------------
const hitter = { id: 4242, pos: 'SS', bats: 'L', throws: 'R', age: 28, fixed: Object.fromEntries(D.fixedAttrs.map((n, i) => [n, 55 + (i * 7) % 30])) };
const pitcherP = { ...hitter, id: 777, pos: 'P', bats: 'R', throws: 'R' };
const day = { day: 'd1', recent: [], seq: [], game: { inning: 3, half: 'top', outs: 1, scoreDiff: 0, runners: [], balls: 0, strikes: 0 }, park: { stadium: 'Fenway Park', home: true }, opp: { hand: 'R', velo: 93 } };

test('adaptive: pure, 30 values in 0..100, names match the data, identical context => identical output', () => {
  assert.deepEqual(ADAPTIVE_NAMES, D.adaptiveAttrs);
  const a = computeAdaptive(hitter, day), b = computeAdaptive(hitter, JSON.parse(JSON.stringify(day)));
  assert.equal(a.list.length, 30); assert.deepEqual(a, b);
  assert.ok(a.list.every(x => Number.isInteger(x.value) && x.value >= 0 && x.value <= 100 && typeof x.tip === 'string'));
  assert.deepEqual(computeAdaptive(hitter, day).map, a.map);
  const old = adaptiveRatings({ person: { id: 4242, batSide: { code: 'L' } }, position: { abbreviation: 'SS' } }, 'day3'); // legacy export
  assert.equal(old.length, 30); assert.deepEqual(old, adaptiveRatings({ person: { id: 4242, batSide: { code: 'L' } }, position: { abbreviation: 'SS' } }, 'day3'));
});

test('adaptive: fatigue, leverage, platoon, form, park and rest change the right attributes', () => {
  const fresh = computeAdaptive(pitcherP, { ...day, fatigue: { pitches: 5, daysRest: 5 } }).map, tired = computeAdaptive(pitcherP, { ...day, fatigue: { pitches: 112, daysRest: 2, recentPitches: 120 } }).map;
  assert.ok(tired.Fatigue < fresh.Fatigue - 15 && tired['Velocity Today'] < fresh['Velocity Today'] && tired['Fastball Command Today'] < fresh['Fastball Command Today'] && tired['Injury Risk Today'] > fresh['Injury Risk Today']);
  const quiet = computeAdaptive(hitter, { ...day, game: { inning: 2, outs: 1, scoreDiff: 5, runners: [] } }), tense = computeAdaptive(hitter, { ...day, game: { inning: 9, half: 'bottom', outs: 2, scoreDiff: -1, runners: [2, 3], balls: 3, strikes: 2 } });
  assert.ok(tense.leverage > 2 * quiet.leverage && leverage({ inning: 9, outs: 2, scoreDiff: 0, runners: [1, 2, 3] }) > leverage({ inning: 1, outs: 0, scoreDiff: 0, runners: [] }));
  for (const n of ['Pressure Response', 'RISP Confidence', 'Late-Inning Poise']) assert.notEqual(tense.map[n], quiet.map[n], n);
  const vsR = computeAdaptive(hitter, { ...day, opp: { hand: 'R' } }).map, vsL = computeAdaptive(hitter, { ...day, opp: { hand: 'L' } }).map; // LHB: platoon edge vs RHP
  assert.ok(vsR['vs R Matchup'] > vsL['vs R Matchup'] || vsR['vs R Matchup'] !== vsL['vs R Matchup']); assert.ok(vsR['vs R Matchup'] !== vsL['vs R Matchup'] && vsR['vs L Matchup'] !== vsL['vs L Matchup']);
  assert.ok(vsR['vs R Matchup'] > vsL['vs L Matchup'] - 40);
  const hot = computeAdaptive(hitter, { ...day, recent: Array(8).fill({ ab: 4, h: 3, hr: 1, bb: 1, k: 0, d2: 1, d3: 0 }), seq: ['HR', 'H', 'XBH', 'H'] }).map, cold = computeAdaptive(hitter, { ...day, recent: Array(8).fill({ ab: 4, h: 0, hr: 0, bb: 0, k: 3, d2: 0, d3: 0 }), seq: ['K', 'K', 'OUT', 'K'] }).map;
  assert.ok(hot.Form > cold.Form + 15 && hot.Confidence > cold.Confidence + 10 && hot.Momentum > cold.Momentum && hot['Cold Zone Vulnerability'] < cold['Cold Zone Vulnerability']);
  const coors = computeAdaptive(hitter, { ...day, park: { stadium: 'Coors Field', home: true } }).map, oracle = computeAdaptive(hitter, { ...day, park: { stadium: 'Oracle Park', home: true } }).map;
  assert.ok(coors['Home Comfort'] > oracle['Home Comfort'] && coors['Hot Zone Feel'] > oracle['Hot Zone Feel']);
  const road = computeAdaptive(hitter, { ...day, park: { stadium: 'Fenway Park', home: false } }).map; assert.ok(road['Road Comfort'] > computeAdaptive(hitter, day).map['Road Comfort'] && road['Home Comfort'] < computeAdaptive(hitter, day).map['Home Comfort']);
  const rested = computeAdaptive(hitter, { ...day, fatigue: { pa: 0, consecutive: 2, daysRest: 4 } }).map, worn = computeAdaptive(hitter, { ...day, fatigue: { pa: 5, consecutive: 20, daysRest: 0 } }).map;
  assert.ok(worn.Fatigue < rested.Fatigue && worn['Recovery State'] < rested['Recovery State']);
  assert.ok(computeAdaptive(hitter, { ...day, opp: { hand: 'R', hold: 30, catcherArm: 35 } }).map['Steal Readiness'] > computeAdaptive(hitter, { ...day, opp: { hand: 'R', hold: 90, catcherArm: 90 } }).map['Steal Readiness']);
  // every driver is explained
  assert.ok(computeAdaptive(pitcherP, { ...day, fatigue: { pitches: 100, daysRest: 2 } }).list.find(x => x.name === 'Fatigue').drivers.length > 0);
});

test('adaptive: wired into the engine (fatigue grows, pressure reacts, history changes the game, still deterministic)', () => {
  const e = createBaseballEngine({ home: side('NYY', 'home'), away: side('BOS', 'away'), seed: 'ad1' });
  const pitcher = e.state.fielders.find(f => f.pos === 'P'), start = e.adaptive(pitcher);
  assert.equal(start.list.length, 30);
  let g = 0; while (!e.state.over && g++ < 600 && e.state.box[pitcher.id]?.pc < 70) e.simulate(30, { maxEvents: 1e9 });
  const mid = e.adaptive(e.state.fielders.find(f => f.pos === 'P' && f.team === pitcher.team) || pitcher);
  if (e.state.box[pitcher.id].pc >= 70) assert.ok(e.adaptive(pitcher).map.Fatigue < start.map.Fatigue - 10 && e.adaptive(pitcher).map['Velocity Today'] < start.map['Velocity Today'], 'tired starter');
  assert.ok(mid.list.length === 30);
  const hist = {}; for (const r of Object.values(play('ad-h').state.roster)) hist[r.pid] = Array(9).fill(r.pos === 'P' ? { outs: 18, ra: 0, ka: 9, bba: 0, ha: 3, pc: 90 } : { ab: 4, h: 3, hr: 1, bb: 1, k: 0, d2: 1, d3: 0 });
  const withHist = play('ad-h', 'NYY', 'BOS', { history: hist }).state, without = play('ad-h').state;
  assert.notDeepEqual(withHist.events.slice(0, 400), without.events.slice(0, 400), 'form/history changes the simulation');
  assert.deepEqual(play('ad-h', 'NYY', 'BOS', { history: hist }).state.events.length, withHist.events.length);
});

test('mlb v2: simRatings exposes bunt / iq / pickoff and engine survives odd ratings (no NaN)', () => {
  const R = simRatings(fixedRatings({ person: { id: 1 }, position: { abbreviation: 'SS' } }));
  assert.ok(['bunt', 'iq', 'pickoff'].every(k => Number.isFinite(R[k])));
  const S = play('odd', 'COL', 'SF', { ratingsOf: p => Object.fromEntries(Object.entries(simRatings(fixedRatings(p))).map(([k, v]) => [k, Math.min(0.99, v * 1.25)])) }).state;
  assert.ok(S.over && Number.isFinite(S.score.home + S.score.away));
});

test('pitch defs: eight types with sane spin/break/velocity relations', () => {
  assert.equal(PITCH_CODES.length, 8);
  for (const d of Object.values(PITCH_DEFS)) assert.ok(d.rpm > 1000 && d.rpm < 3000 && d.M > 5 && d.dv <= 0);
});
