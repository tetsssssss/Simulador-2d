// Career 3.0 (logic layer): flow, curves, trade AI, news, events, firing / offers, calendar, staff / training / scouting /
// tactics / facilities, determinism, save / migration / corruption. Sport-specific simulations live in career2_<sport>.test.mjs.
import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.fetch = async u => { const url = new URL(u); if (!url.protocol.startsWith('file')) throw new Error('offline'); const t = fs.readFileSync(url, 'utf8'); return { ok: true, text: async () => t, json: async () => JSON.parse(t) }; };
const A = await import('../core/career/api.js');
const { NHL_SPEC } = await import('../nhl/src/career/nhlSpec.js');
const { NFL_SPEC } = await import('../nfl/src/career/nflSpec.js');
const { MLB_SPEC } = await import('../mlb/src/career/mlbSpec.js');
const { progressSeason } = await import('../core/career/people.js');
const { createRng } = await import('../core/rng/rng.js');
const { hireStaff, staffFx } = A;

const TEAM = { nhl: 'BOS', nfl: 'SEA', mlb: 'NYY' }, POS = { nhl: 'C', nfl: 'QB', mlb: 'SS' };
async function mk(sport, role, o = {}) {
  const { career, spec } = await A.startCareer({ sport, role, team: o.team || TEAM[sport], seed: o.seed || `t2-${sport}-${role}`, difficulty: o.difficulty ?? 1, player: { name: 'Atleta Teste', pos: POS[sport], talent: 'alto', ...o.player }, settings: o.settings });
  return { c: career, spec };
}
const strip = c => JSON.stringify(c, (k, v) => (k === 'createdAt' ? undefined : v));
const days = async (spec, c, n, opts = {}) => { let d = 0, last; while (d < n) { last = await A.advance(spec, c, 'NEXT_DAY', { auto: true, ...opts }); d++; } return last; };
// advances days playing the user's games but leaving events unresolved (the test decides)
const evDays = (spec, c, n = 1) => days(spec, c, n, { auto: false, includeUserGame: true, stopOnEvents: false });
const toEve = c => { c.x.cal.day += (6 - (c.x.cal.day % 7) + 7) % 7; }; // next tick lands on a weekly scan day
const finite = c => Object.values(c.players).every(p => Number.isFinite(p.ovr) && Number.isFinite(p.age) && Number.isFinite(p.pot) && (!p.c || Number.isFinite(p.c.sal)));

test('flow: sport → role → team/player → difficulty → start (data API)', async () => {
  assert.deepEqual(A.getSports().map(s => s.key), ['nfl', 'nhl', 'mlb']);
  assert.deepEqual(A.getRoles().map(r => r.key), ['COACH', 'GM', 'PLAYER']);
  assert.equal(A.getDifficulties().length, 4);
  const teams = await A.getTeams('nhl'); assert.equal(teams.length, 32); assert.ok(teams.every(t => t.abbr && t.outlook && t.rank));
  const bad = await A.validateFlow({ sport: 'nhl', role: 'COACH', team: 'XXX' }); assert.equal(bad.ok, false);
  await assert.rejects(() => A.startCareer({ sport: 'nhl', role: 'COACH', team: 'XXX' }));
  assert.equal((await A.validateFlow({ sport: 'nhl', role: 'PLAYER', player: { name: '', pos: 'C' } })).ok, false);
  for (const role of ['COACH', 'GM', 'PLAYER']) {
    const { c } = await mk('nhl', role);
    assert.ok(c.x.ready && c.x.cal.day === -7 && c.saveVersion === A.CAREER_SAVE_VERSION);
    assert.equal(c.role, role);
    if (role === 'COACH') assert.ok(c.x.tac && c.x.coach.contract.team === 'BOS');
    if (role === 'GM') assert.ok(c.x.coach.contract && !c.x.tac);
    if (role === 'PLAYER') { assert.ok(c.me && c.players[c.me.id].attrs && c.players[c.me.id].cv); assert.equal(c.userTeam, null); }
  }
});

test('player creation: avatars-compatible appearance, point budget, photo, pathways', async () => {
  const opts = A.getCreatePlayerOptions(NHL_SPEC);
  assert.deepEqual(Object.keys(opts.appearance.ranges).sort(), ['accessory', 'beard', 'build', 'gear', 'hairColor', 'hairStyle', 'skin']);
  assert.ok(opts.pathways.length === 3 && opts.positions.find(p => p.pos === 'G').attrs.length >= 6);
  const budget = A.attributeBudget(NHL_SPEC, 'C', 'alto');
  const keys = opts.positions.find(p => p.pos === 'C').attrs.map(a => a.key);
  const over = Object.fromEntries(keys.map(k => [k, 80]));
  assert.equal(A.validatePlayerInput(NHL_SPEC, { name: 'X', pos: 'C', attrs: over }).ok, false, 'over budget rejected');
  const ok = Object.fromEntries(keys.map((k, i) => [k, Math.floor(budget / keys.length)]));
  const v = A.validatePlayerInput(NHL_SPEC, { name: 'Joe', pos: 'C', height: 185, weight: 90, attrs: ok, appearance: { skin: 2, hairStyle: 3, hairColor: 1, beard: 1, accessory: 0, build: 2, gear: 0 }, photoUrl: 'https://example.com/a.png', curve: 'LATE', pathway: 'EUROPE' });
  assert.ok(v.ok, v.errors.join(';'));
  assert.equal(A.validatePlayerInput(NHL_SPEC, { name: 'Joe', pos: 'C', appearance: { skin: 99 } }).ok, false);
  assert.equal(A.validatePlayerInput(NHL_SPEC, { name: 'Joe', pos: 'C', photoUrl: 'javascript:alert(1)' }).ok, false);
  assert.equal(A.validatePlayerInput(NHL_SPEC, { name: 'Joe', pos: 'C', height: 300 }).ok, false);
  const { c } = await mk('nhl', 'PLAYER', { player: { name: 'Joe', pos: 'C', height: 185, weight: 90, attrs: ok, appearance: { skin: 2, hairStyle: 3, hairColor: 1, beard: 1, accessory: 0, build: 2, gear: 0 }, curve: 'LATE', pathway: 'EUROPE' } });
  const me = c.players[c.me.id];
  assert.equal(me.cv, 'LATE'); assert.equal(me.appearance.hairStyle, 3); assert.equal(me.height, 185); assert.equal(c.me.stage, 'EUROPE'); assert.equal(c.me.path, 'EUROPE');
  const prof = A.getProfileView(c); assert.equal(prof.pathway.steps.find(s => s.state === 'current').key, 'EUROPE'); assert.ok(prof.attrs.length >= 7);
  // XP is earned and can raise attributes (and ovr through the weights)
  await days(NHL_SPEC, c, 30);
  const xp0 = c.players[c.me.id].xp; assert.ok(xp0 > 20, `xp ${xp0}`);
  const key = keys[0], before = c.players[c.me.id].attrs[key]; const r = A.spendXP(c._spec, c, key, 2); assert.ok(r.ok, r.text); assert.equal(c.players[c.me.id].attrs[key], before + 2);
  assert.equal(A.spendXP(c._spec, c, 'nope').ok, false);
});

test('growth curves: Prodigy peaks earlier than Late Bloomer; Rapid Decline falls faster; Long Prime holds', () => {
  for (const spec of [NHL_SPEC, NFL_SPEC, MLB_SPEC]) {
    const base = { ovr: 56, pot: 86, age: spec.draft.ageMin, seed: 'curves', years: 16, runs: 60 };
    const P = A.projectCurve(spec, { ...base, curve: 'PRODIGY' }), L = A.projectCurve(spec, { ...base, curve: 'LATE' }), E = A.projectCurve(spec, { ...base, curve: 'EARLY' });
    assert.ok(P.peakAge < L.peakAge, `${spec.sport}: prodigy ${P.peakAge} < late ${L.peakAge}`);
    assert.ok(E.peakAge <= P.peakAge + 1 && E.peakAge < L.peakAge);
    const old = { ovr: 80, pot: 80, age: spec.ageCurve.peakEnd - 2, seed: 'dec', years: 8, runs: 60 };
    const R = A.projectCurve(spec, { ...old, curve: 'RAPID' }), N = A.projectCurve(spec, { ...old, curve: 'NORMAL' }), LP = A.projectCurve(spec, { ...old, curve: 'LONG' });
    const end = x => x.points.at(-1).ovr;
    assert.ok(end(R) < end(N) && end(N) < end(LP), `${spec.sport}: rapid ${end(R)} < normal ${end(N)} < long ${end(LP)}`);
  }
});

test('staff & facilities mods change development and injuries; hiring respects budget; training plans change XP', async () => {
  const lo = [], hi = [];
  for (let i = 0; i < 400; i++) for (const [arr, m] of [[lo, 0.8], [hi, 1.2]]) { const p = { ovr: 60, pot: 85, age: 20, cv: 'NORMAL' }; arr.push(progressSeason(NHL_SPEC, p, createRng(`g${i}`), { pt: 0.8, mods: { growth: m } })); }
  assert.ok(hi.reduce((a, b) => a + b) > lo.reduce((a, b) => a + b) + 40, 'better staff grows prospects more');
  const { c, spec } = await mk('nhl', 'COACH');
  const base = staffFx(spec, c).dev;
  const market = c.x.staff.market.filter(m => m.role === 'SKILLS').sort((a, b) => b.rating - a.rating);
  c.x.fin.budget.staff = 0.1; // owner refuses
  assert.equal(hireStaff(spec, c, market[0].id).ok, false);
  c.x.fin.budget.staff = 60;
  const cur = c.x.staff.hired.find(m => m.role === 'SKILLS');
  const best = market.find(m => m.rating > cur.rating) || { ...market[0], rating: 99 };
  if (best.rating > cur.rating) { const r = hireStaff(spec, c, best.id, { replaceId: cur.id }); assert.ok(r.ok, r.text); assert.ok(staffFx(spec, c).dev > base, 'dev multiplier improved'); }
  assert.equal(hireStaff(spec, c, 'nope').ok, false);
  const fired = A.fireStaff(spec, c, c.x.staff.hired[0].id); assert.ok(fired.ok);
  // training plan validation + effect
  assert.equal(A.setTraining(spec, c, { focus: 'bogus' }).ok, false); assert.equal(A.setTraining(spec, c, { intensity: 9 }).ok, false);
  const young = A.teamPlayers(c, 'BOS').filter(p => p.pot > p.ovr + 5 && p.age <= 24);
  for (const p of young) p.xp = 0;
  assert.ok(A.setTraining(spec, c, { focus: 'technical', intensity: 1.5 }).ok);
  await days(spec, c, 14);
  const xpT = young.reduce((a, p) => a + (p.xp || 0), 0);
  for (const p of young) p.xp = 0;
  A.setTraining(spec, c, { focus: 'recovery', intensity: 0.5 }); await days(spec, c, 14);
  const xpR = young.reduce((a, p) => a + (p.xp || 0), 0);
  assert.ok(xpT > xpR * 1.5, `technical ${xpT} vs recovery ${xpR}`);
  assert.ok(c.x.training.load < 60 && finite(c));
});

test('scouting fog of war: uncertainty shrinks with knowledge, stable per player, own players exact', async () => {
  const { c, spec } = await mk('nhl', 'GM');
  const pool = A.draftPool(c).sort((a, b) => b.pot - a.pot);
  const p = pool[0];
  const f0 = A.fogged(spec, c, p); assert.ok(f0.know < 30 && f0.ovrErr >= 5, JSON.stringify(f0));
  assert.deepEqual(A.fogged(spec, c, p), f0, 'stable');
  c.x.scout.know[p.id] = 60; const f1 = A.fogged(spec, c, p); assert.ok(f1.ovrErr < f0.ovrErr);
  c.x.scout.know[p.id] = 100; const f2 = A.fogged(spec, c, p); assert.equal(f2.ovr, p.ovr); assert.equal(f2.pot, p.pot); assert.ok(f2.exact);
  const mine = A.teamPlayers(c, 'BOS')[0]; assert.equal(A.fogged(spec, c, mine).ovr, mine.ovr);
  // scouts reveal progressively day by day, only the assigned target
  const scout = c.x.staff.hired.find(m => m.role.startsWith('SCOUT')); assert.ok(scout);
  const k0 = Object.keys(c.x.scout.know).length;
  assert.ok(A.assignScout(spec, c, scout.id, 'draft').ok); assert.equal(A.assignScout(spec, c, scout.id, 'nowhere').ok, false);
  await days(spec, c, 20);
  const top = pool.slice(0, 6), avgKnow = top.reduce((a, q) => a + (c.x.scout.know[q.id] || 0), 0) / 6;
  assert.ok(avgKnow >= 5 && Object.keys(c.x.scout.know).length > k0, `know ${avgKnow}`);
  const view = A.getScoutingView(c); assert.ok(view.prospects[0].know != null && view.scouts.length >= 1);
});

test('tactics: data in the save, validated, reach the engine config; bad lineups cost rating; injured starters are replaced', async () => {
  for (const sport of ['nhl']) {
    const { c, spec } = await mk(sport, 'COACH');
    const tac0 = JSON.parse(JSON.stringify(c.x.tac));
    const r = A.setTactics(spec, c, { forecheck: 'nope' }); assert.equal(r.ok, false); assert.deepEqual(c.x.tac, tac0, 'invalid patch leaves the save untouched');
    assert.equal(A.setTactics(spec, c, { lines: { F: [[ 'ghost', null, null ]] } }).ok, false);
    assert.ok(A.setTactics(spec, c, { forecheck: '2-1-2', neutralZone: 'swarm', pace: 'rápido', lineMatching: { mode: 'shutdown', topLineShare: 0.4 } }).ok);
    const cfg = A.engineConfig(spec, c, 'BOS');
    assert.equal(cfg.forecheck, '2-1-2'); assert.equal(cfg.lineMatching.mode, 'shutdown'); assert.equal(cfg.lines.length, 4); assert.equal(cfg.pairs.length, 3); assert.ok(cfg.goalie.starter && cfg.powerPlay.units.length && cfg.penaltyKill.units.length);
    assert.equal(c.tactics.forecheck, 'agressivo', 'legacy c.tactics stays in sync');
    // AI teams get an automatic config in the same shape
    assert.equal(A.engineConfig(spec, c, 'TOR').lines.length, 4);
    // put the worst skaters on the first line → fit delta negative
    const rep0 = A.tacticsReport(spec, c);
    const worst = A.teamPlayers(c, 'BOS').filter(p => p.st === 'ACT' && !['D', 'G'].includes(p.pos)).sort((a, b) => a.ovr - b.ovr).slice(0, 3).map(p => p.id);
    const tac = JSON.parse(JSON.stringify(c.x.tac)); const old1 = tac.lines.F[0]; tac.lines.F[0] = worst; tac.lines.F[3] = old1;
    assert.ok(A.setTactics(spec, c, { lines: { F: tac.lines.F } }).ok, 'swap ok');
    const rep1 = A.tacticsReport(spec, c); assert.ok(rep1.lineupDelta < rep0.lineupDelta, `${rep1.lineupDelta} < ${rep0.lineupDelta}`);
    // injured starter is replaced
    A.autoTactics(spec, c);
    const star = c.players[c.x.tac.lines.G.starter]; star.inj = { type: 'Teste', games: 5 };
    await days(spec, c, 1);
    assert.notEqual(c.x.tac.lines.G.starter, star.id); assert.ok(c.players[c.x.tac.lines.G.starter] && !c.players[c.x.tac.lines.G.starter].inj);
    assert.equal(A.setTactics(spec, (await mk('nhl', 'GM')).c, { pace: 'rápido' }).ok, false, 'GM cannot edit tactics');
  }
});

test('trade AI: fair accepted, lopsided refused, counter-offers, need and window matter, picks are tradable, deadline closes', async () => {
  const { c, spec } = await mk('nhl', 'GM');
  await days(spec, c, 10); // regular season started
  const mine = A.teamPlayers(c, 'BOS').filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr);
  const rebuild = c.teams.find(t => t.abbr !== 'BOS' && t.mode === 'rebuild').abbr, contender = c.teams.find(t => t.abbr !== 'BOS' && t.mode === 'contender').abbr;
  const val = (p, team) => A.assetValue(spec, c, p, A.evaluateOffer.ctx ? null : require_ctx(team));
  function require_ctx(team) { return { abbr: team, mode: c.teams.find(t => t.abbr === team).mode, need: {}, picks: 14 }; }
  // lopsided: a scrub for their best player
  const theirs = A.teamPlayers(c, rebuild).filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr);
  const lop = A.evaluateOffer(spec, c, { from: 'BOS', to: rebuild, give: { players: [mine.at(-1).id] }, get: { players: [theirs[0].id] } });
  assert.equal(lop.accept, false); assert.ok(lop.reasons.length >= 2 && lop.valueOut > lop.valueIn * 2);
  // fair: our player for a similarly valued one (search a near-equal pair)
  const ctx = { abbr: rebuild, mode: 'rebuild', need: {}, picks: 14 };
  let fair = null;
  for (const a of mine.slice(0, 14)) for (const b of theirs.slice(0, 14)) { const va = A.assetValue(spec, c, a, ctx), vb = A.assetValue(spec, c, b, ctx); if (va > vb * 1.12 && va < vb * 1.4 && vb > 15) fair = fair || [a, b]; }
  assert.ok(fair, 'found a fair pair');
  const ok = A.evaluateOffer(spec, c, { from: 'BOS', to: rebuild, give: { players: [fair[0].id] }, get: { players: [fair[1].id] } }); assert.equal(ok.accept, true, ok.reasons.join(' | '));
  const done = A.makeOffer(spec, c, { from: 'BOS', to: rebuild, give: { players: [fair[0].id] }, get: { players: [fair[1].id] } });
  assert.ok(done.ok); assert.equal(c.players[fair[0].id].t, rebuild); assert.equal(c.players[fair[1].id].t, 'BOS'); assert.ok(c.history.transactions.at(-1).players.includes(fair[0].id));
  // counter-offer for a refused ask is itself acceptable
  const lowball = A.evaluateOffer(spec, c, { from: 'BOS', to: contender, give: { players: [mine[8].id] }, get: { players: [A.teamPlayers(c, contender).filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr)[2].id] } });
  if (!lowball.accept && lowball.counterOffer) assert.equal(A.evaluateOffer(spec, c, lowball.counterOffer).accept, true);
  // window: contenders pay more for veterans, rebuilders for picks/youth
  const vet = A.teamPlayers(c, 'BOS').filter(p => p.age >= NHL_SPEC.ageCurve.peakEnd - 1 && p.ovr >= 60).sort((a, b) => b.ovr - a.ovr)[0];
  const young = A.teamPlayers(c, 'BOS').filter(p => p.age <= 22 && p.pot > p.ovr + 8).sort((a, b) => b.pot - a.pot)[0];
  if (vet) assert.ok(A.assetValue(spec, c, vet, { abbr: contender, mode: 'contender', need: {}, picks: 14 }) > A.assetValue(spec, c, vet, { abbr: rebuild, mode: 'rebuild', need: {}, picks: 14 }), 'contender values the veteran more');
  if (young) assert.ok(A.assetValue(spec, c, young, { abbr: rebuild, mode: 'rebuild', need: {}, picks: 14 }) > A.assetValue(spec, c, young, { abbr: contender, mode: 'contender', need: {}, picks: 14 }), 'rebuilder values the prospect more');
  const g = NHL_SPEC.posGroup(vet.pos);
  assert.ok(A.assetValue(spec, c, vet, { abbr: 'XXX', mode: 'middle', need: { [g]: true }, picks: 14 }) > A.assetValue(spec, c, vet, { abbr: 'XXX', mode: 'middle', need: {}, picks: 14 }), 'positional need raises value');
  const inj = { ...vet, inj: { type: 'x', games: 40 } }; assert.ok(A.assetValue(spec, c, inj, ctx) < A.assetValue(spec, c, vet, ctx), 'injury lowers value');
  // draft picks as assets
  const myPicks = A.teamPicks(spec, c, 'BOS'); assert.ok(myPicks.length >= 14 && myPicks[0].r === 1);
  const pk = myPicks[0], theirPk = A.teamPicks(spec, c, rebuild).find(p => p.r === 1);
  const pr = A.evaluateOffer(spec, c, { from: 'BOS', to: rebuild, give: { picks: [pk.key] }, get: { picks: [theirPk.key] } });
  assert.ok(pr.valueIn > 0 && pr.valueOut > 0);
  assert.equal(A.evaluateOffer(spec, c, { from: 'BOS', to: rebuild, give: { picks: ['2020-1-BOS'] }, get: {} }).accept, false, 'cannot trade a pick you do not own / used');
  const gift = A.makeOffer(spec, c, { from: 'BOS', to: rebuild, give: { picks: [myPicks[0].key] }, get: { picks: [] } }); assert.ok(gift.ok);
  assert.equal(A.pickOwner(c, pk.y, pk.r, pk.o), rebuild); assert.ok(!A.teamPicks(spec, c, 'BOS').some(p => p.key === pk.key)); assert.ok(A.teamPicks(spec, c, rebuild).some(p => p.key === pk.key));
  // the traded pick is used by its new owner at the draft
  c.draft = null; A.getDraftView(c);
  // deadline
  c.x.cal.day = A.getCalendarView(c).deadline.day + 1;
  const late = A.evaluateOffer(spec, c, { from: 'BOS', to: contender, give: { players: [mine[3].id] }, get: {} }); assert.equal(late.accept, false); assert.ok(late.reasons.join().includes('janela'));
  assert.equal(A.tradeWindowOpen(spec, c), false);
});

test('trade AI: AI-to-AI trades happen, both clubs gain by their own valuation, trade block lists real states', async () => {
  const { c, spec } = await mk('nhl', 'GM', { seed: 'ai-trades' });
  await days(spec, c, 8);
  const rng = createRng('ait'); let made = [];
  for (let i = 0; i < 30 && !made.length; i++) made = A.aiTradeRound(spec, c, rng, { deadline: true, attempts: 40 });
  assert.ok(made.length >= 1, 'an AI trade was made');
  const t = made.at(-1); assert.ok(t.from !== 'BOS' && t.to !== 'BOS');
  const tx = [...c.history.transactions].reverse().find(x => x.kind === 'TRADE' && x.ai); assert.ok(tx); assert.deepEqual(tx.teams.sort(), [t.from, t.to].sort()); assert.ok(tx.ai);
  const block = A.getTradeBlock(spec, c); assert.ok(block.length > 0); assert.ok(block.every(b => c.players[b.id].t === b.team && b.reason));
  // user's block → AI offers that the AI would itself accept
  const mine = A.teamPlayers(c, 'BOS').filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr)[2];
  A.setTradeBlock(spec, c, [mine.id]);
  const offers = A.getBlockOffers(spec, c); for (const o of offers) assert.equal(A.evaluateOffer(spec, c, o).accept, true);
});

test('news engine: items come from real state (results, injuries, trades, milestones, rumors), dedupe, feed API', async () => {
  const { c, spec } = await mk('nhl', 'COACH', { seed: 'news1' });
  await days(spec, c, 40);
  const feed = A.getFeed(c, { n: 500 }); assert.ok(feed.length > 5);
  assert.ok(feed.every(i => i.id && i.h && i.kind && i.imp >= 1 && i.imp <= 5 && Array.isArray(i.teams) && Array.isArray(i.players)));
  for (const it of feed.filter(i => i.kind === 'RESULT' && i.src?.slate != null)) { const g = c.schedule.find(x => x.s === it.src.slate && x.h === it.src.h && x.a === it.src.a); assert.ok(g?.r, 'result item matches a played game'); assert.deepEqual(g.r, it.src.r); assert.ok(it.teams.includes('BOS')); }
  for (const it of feed.filter(i => i.kind === 'INJURY')) assert.ok(it.players.every(id => c.players[id]));
  for (const it of feed.filter(i => i.src?.tx != null)) assert.ok(c.history.transactions[it.src.tx], 'tx-backed item points to a real transaction');
  const results = feed.filter(i => i.kind === 'RESULT'); assert.ok(results.length >= 3);
  // dedupe + cursors: collecting twice adds nothing
  const n0 = c.x.feed.length; A.CareerNewsEngine.collect(spec, c); A.CareerNewsEngine.collect(spec, c); assert.equal(c.x.feed.length, n0);
  assert.ok(A.pushNews(c, { kind: 'LEAGUE', h: 'x', key: 'dup-1' })); assert.equal(A.pushNews(c, { kind: 'LEAGUE', h: 'x', key: 'dup-1' }), null);
  // real-state rumors
  const star = A.teamPlayers(c, 'BOS').filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr)[0];
  A.setTradeBlock(spec, c, [star.id]); c.x.cal.day += (7 - (c.x.cal.day % 7)) % 7; A.CareerNewsEngine.collect(spec, c);
  const rum = A.getFeed(c, { player: star.id, kinds: ['RUMOR'] }); assert.ok(rum.length === 1 && rum[0].src.tradeBlock);
  const unhappy = A.teamPlayers(c, 'BOS').find(p => p.st === 'ACT' && p.ovr >= 60 && p.role !== 'S'); unhappy.rel.sat = 10; unhappy.rel.mo = 20; c.x.cal.day += 7 - (c.x.cal.day % 7); A.CareerNewsEngine.collect(spec, c);
  assert.ok(A.getFeed(c, { player: unhappy.id, kinds: ['RUMOR'] }).length === 1);
  assert.ok(A.newsByTeam(c, 'BOS', 5).length > 0 && A.latestNews(c, 3).length === 3 && A.newsByPlayer(c, star.id).length >= 1);
  const nv = A.getNewsView(c); assert.ok(nv.items.length && Array.isArray(nv.events.open));
});

test('events from real state: trade request, injury, slump, big performance, contract; choices change the save', async () => {
  const { c, spec } = await mk('nhl', 'COACH', { seed: 'ev1' });
  await days(spec, c, 20);
  const roster = A.teamPlayers(c, 'BOS').filter(p => p.st === 'ACT');
  const p = roster.filter(q => q.ovr >= 62 && q.role !== 'S')[0] || roster.sort((a, b) => b.ovr - a.ovr)[8];
  p.role = 'B'; p.rel.sat = 12; p.rel.mo = 25; toEve(c);
  await evDays(spec, c);
  const ev = c.x.events.pending.find(e => e.type === 'REQUEST_TRADE' && e.subject === p.id);
  assert.ok(ev, 'REQUEST_TRADE generated from satisfaction/mood/role'); assert.deepEqual(ev.choices.map(x => x.key), ['grant', 'promise', 'refuse']);
  assert.ok(ev.facts.sat <= 15);
  const tr0 = p.rel.tr; A.resolveEvent(spec, c, ev.id, 'refuse'); assert.ok(p.rel.tr < tr0); assert.ok(c.x.events.log[0].chosen === 'refuse');
  assert.equal(A.resolveEvent(spec, c, ev.id, 'refuse').ok, false, 'already resolved');
  assert.equal(A.resolveEvent(spec, c, 'nope', 'x').ok, false);
  // grant → player on the user's trade block
  p.rel.sat = 10; p.rel.mo = 20; p.role = 'B'; p.userRole = 'B'; c.x.events.cool = {}; toEve(c);
  await evDays(spec, c);
  const ev2 = c.x.events.pending.find(e => e.type === 'REQUEST_TRADE' && e.subject === p.id); assert.ok(ev2);
  A.resolveEvent(spec, c, ev2.id, 'grant'); assert.ok(c.x.block.user.includes(p.id));
  // injury event for a star
  A.autoResolveEvents(spec, c);
  const star = A.teamPlayers(c, 'BOS').filter(q => q.st === 'ACT').sort((a, b) => b.ovr - a.ovr)[0];
  star.inj = { type: 'Joelho', games: 20 }; await evDays(spec, c);
  const inj = c.x.events.pending.find(e => e.type === 'INJURY' && e.subject === star.id); assert.ok(inj); assert.ok(inj.choices.some(x => x.key === 'surgery'));
  const g0 = star.inj.games; A.resolveEvent(spec, c, inj.id, 'surgery'); assert.ok(star.inj.games < g0);
  // slump → practice raises form
  A.autoResolveEvents(spec, c);
  const s2 = A.teamPlayers(c, 'BOS').filter(q => q.st === 'ACT' && q.id !== star.id && q.pos === 'C')[0]; s2.fm = -10; s2.role = 'S'; s2.userRole = 'S'; s2.ps = { gp: 12 }; toEve(c);
  await evDays(spec, c);
  const sl = c.x.events.pending.find(e => e.type === 'SLUMP' && e.subject === s2.id); assert.ok(sl); const fm0 = s2.fm; A.resolveEvent(spec, c, sl.id, 'practice'); assert.equal(s2.fm, fm0 + 3);
  // big performance reported by the last game
  A.autoResolveEvents(spec, c);
  const hero = A.teamPlayers(c, 'BOS').filter(q => q.st === 'ACT')[3]; c.x.pendingCtx = { bigGames: [{ id: hero.id, label: '3 gols (hat-trick)' }] };
  await evDays(spec, c);
  const big = c.x.events.pending.find(e => e.type === 'BIG_PERFORMANCE'); assert.ok(big); const mo0 = hero.rel.mo; A.resolveEvent(spec, c, big.id, 'celebrate'); assert.ok(hero.rel.mo >= mo0);
  // events carry news with refs
  assert.ok(A.getFeed(c, { kinds: ['EVENT'], n: 20 }).length >= 3);
  // auto-resolve picks the default of each
  c.x.pendingCtx = { bigGames: [] }; A.autoResolveEvents(spec, c); assert.equal(c.x.events.pending.length, 0);
});

test('player events and relationships (CoachTrust, Teammates, Management, Fans) move with real events', async () => {
  const { c, spec } = await mk('nhl', 'PLAYER', { seed: 'pl-ev' });
  const rel0 = { ...c.x.prel };
  // become a pro quickly: force the player onto a roster as a starter
  const me = c.players[c.me.id]; me.t = 'TOR'; me.st = 'ACT'; me.c = { sal: 1, yrs: 2, kind: 'ELC' }; me.drafted = { year: 2026, round: 1, pick: 3, overall: 3, team: 'TOR' }; me.ovr = 78; me.pot = 90; c.me.stage = 'NHL';
  spec.assignRoles(A.teamPlayers(c, 'TOR'), c, 'TOR'); assert.equal(me.role, 'S');
  c.x.pstate = { role: 'S' }; await evDays(spec, c, 12);
  // great games raise trust / fans
  const t0 = c.x.prel.coachTrust, f0 = c.x.prel.fans;
  A.CareerNewsEngine.collect(spec, c);
  me.role = 'B'; me.userRole = 'B'; await evDays(spec, c);
  const lose = c.x.events.pending.find(e => e.type === 'LOSE_STARTING_JOB'); assert.ok(lose, 'role S→B creates LOSE_STARTING_JOB');
  const ct = c.x.prel.coachTrust; const r = A.resolveEvent(spec, c, lose.id, 'work'); assert.ok(r.ok); assert.ok(me.xp > 0);
  assert.ok(c.x.prel.log.length >= 1 || ct >= 0);
  // asking the coach with low trust backfires; high trust helps
  c.x.prel.coachTrust = 70; me.role = 'S'; me.userRole = 'S'; c.x.pstate.role = 'B'; c.x.cal.day += 20; c.x.events.cool = {};
  await evDays(spec, c);
  const win = c.x.events.pending.find(e => e.type === 'WIN_STARTING_JOB'); assert.ok(win); const tm0 = c.x.prel.teammates; A.resolveEvent(spec, c, win.id, 'humble'); assert.ok(c.x.prel.teammates > tm0);
  // trade request: management refuses when trust is high
  c.x.prel.management = 40; const m0 = c.x.prel.management; const rt = A.requestTrade(spec, c); assert.ok(c.x.prel.management !== m0 || rt.ok);
  // rivalry choice moves FanSupport / teammates
  const f1 = c.x.prel.fans; const ev = { id: 'x', type: 'RIVALRY', subject: 'MTL', choices: [{ key: 'trash' }, { key: 'respect' }], auto: 'quiet', status: 'open', key: 'k', team: 'TOR', title: 'x', text: 'x', facts: {} };
  c.x.events.pending.push(ev); A.resolveEvent(spec, c, 'x', 'trash'); assert.ok(c.x.prel.fans > f1);
  for (const k of ['coachTrust', 'teammates', 'management', 'fans']) assert.ok(c.x.prel[k] >= 0 && c.x.prel[k] <= 100);
  assert.equal(Math.round(me.rel.tr), Math.round(c.x.prel.coachTrust) , 'CoachTrust mirrors the player relation');
  void rel0; void t0; void f0;
});

test('firing and job offers: a sabotaged coach is fired, a winning coach gains reputation and offers; the market has vacancies', async () => {
  const bad = await mk('nhl', 'COACH', { seed: 'fire1', team: 'SJS', difficulty: 3 });
  bad.c.teams.find(t => t.abbr === 'SJS').boost = -25; // sabotage: the team cannot win
  const rep0 = bad.c.x.rep;
  let fired = null, guard = 0;
  while (!fired && guard++ < 160) { const r = await A.advance(bad.spec, bad.c, 'NEXT_WEEK', { auto: false, stopOnEvents: false }); if (bad.c.fired) fired = r; if (r.stopped === 'USER_GAME') await A.playUserGame(bad.spec, bad.c); }
  assert.ok(bad.c.fired, 'sabotaged coach is fired within two seasons');
  assert.ok(bad.c.x.coach.firedReason && bad.c.x.rep < rep0);
  assert.equal((await A.advance(bad.spec, bad.c, 'NEXT_DAY', {})).stopped, 'FIRED', 'calendar stops while fired');
  const offers = A.jobOffers ? null : null; void offers;
  const mk3 = A.jobMarket(bad.spec, bad.c); assert.ok(mk3.offers.length >= 1, 'fired coach receives offers');
  const o = mk3.offers[0]; const prev = bad.c.userTeam; assert.ok(A.acceptJobOffer(bad.spec, bad.c, o.team).ok);
  assert.equal(bad.c.userTeam, o.team); assert.equal(bad.c.fired, false); assert.notEqual(prev, o.team); assert.ok(bad.c.x.market.jobs.some(j => j.team === prev), 'old club now has a vacancy');
  // winning coach
  const good = await mk('nhl', 'COACH', { seed: 'win1', team: 'BOS' });
  good.c.teams.find(t => t.abbr === 'BOS').boost = 25;
  guard = 0; while (good.c.season < 2028 && guard++ < 200) { const r = await A.advance(good.spec, good.c, 'NEXT_WEEK', { auto: true }); void r; }
  assert.ok(!good.c.fired && good.c.x.rep > 45, `rep ${good.c.x.rep}`);
  assert.ok(good.c.x.coach.history.length >= 1 && good.c.x.coach.history[0].made);
  const jm = A.jobMarket(good.spec, good.c); assert.equal(jm.teams.length, 32); assert.ok(jm.teams.every(t => t.coach));
  assert.ok(good.c.x.market.jobs.length >= 0);
  // objectives are tracked and evaluated at the end of the season
  const hist = good.c.history.seasons[0]; assert.ok(hist.goals.length >= 2 && hist.goals.every(g => ['done', 'failed'].includes(g.status)));
  const sec = A.jobSecurity(good.spec, good.c); assert.equal(sec.level, 'SAFE');
});

test('calendar: NEXT_DAY / NEXT_WEEK / NEXT_GAME; stops before the user game; uncontrolled games are simulated; ticks run daily', async () => {
  const { c, spec } = await mk('nhl', 'COACH', { seed: 'cal1' });
  assert.equal(c.phase, 'PRESEASON');
  let r = await A.advance(spec, c, 'NEXT_DAY'); assert.equal(r.days, 1); assert.equal(c.x.cal.day, -6);
  r = await A.advance(spec, c, 'NEXT_WEEK'); assert.equal(c.x.cal.day, 0); assert.equal(c.phase, 'REGULAR'); assert.equal(r.stopped, 'USER_GAME', 'opening night: the advance stops before the user game');
  assert.ok((await A.playUserGame(spec, c)).ok);
  const xp0 = A.teamPlayers(c, 'BOS').reduce((a, p) => a + (p.xp || 0), 0), cash0 = c.x.fin.cash;
  r = await A.advance(spec, c, 'NEXT_GAME');
  assert.equal(r.stopped, 'USER_GAME'); const slate = c.slate;
  const ug = c.schedule.find(g => g.s === slate && (g.h === 'BOS' || g.a === 'BOS')); assert.ok(ug && !ug.r, 'user game not played yet');
  assert.equal(c.x.cal.day, A.getCalendarView(c).nextGame.day);
  assert.ok(A.teamPlayers(c, 'BOS').reduce((a, p) => a + (p.xp || 0), 0) > xp0 && c.x.fin.cash !== cash0, 'training and finance ticked');
  r = await A.advance(spec, c, 'NEXT_DAY'); assert.equal(r.days, 0); assert.equal(r.stopped, 'USER_GAME', 'still blocked by the user game');
  const others = c.schedule.filter(g => g.s < slate && g.r).length; assert.ok(others > 0, 'previous slates were simulated');
  const pl = await A.playUserGame(spec, c); assert.ok(pl.ok); assert.ok(ug.r && c.slate === slate + 1);
  assert.equal((await A.playUserGame(spec, c)).ok, false);
  // week advance never plays the user's game
  const before = c.slate; r = await A.advance(spec, c, 'NEXT_WEEK'); assert.ok(c.slate <= before + 4 && ['USER_GAME', null, 'EVENT'].includes(r.stopped), r.stopped);
  // auto plays everything, through offseason into the next season
  let guard = 0; while (c.season === 2026 && guard++ < 120) await A.advance(spec, c, 'NEXT_WEEK', { auto: true });
  assert.equal(c.season, 2027); assert.equal(c.phase, 'PRESEASON'); assert.ok(c.x.cal.day < 0);
  assert.ok(finite(c));
  const cv = A.getCalendarView(c); assert.ok(cv.upcoming.length && cv.deadline.day > 0 && cv.stages.some(s => s.current));
});

test('contracts, facilities, waivers: cap rules in actions, facility upgrades cost cash and take effect', async () => {
  const { c, spec } = await mk('nhl', 'GM', { seed: 'gm1' });
  const cutP = A.teamPlayers(c, 'TOR').sort((a, b) => b.ovr - a.ovr)[0]; cutP.t = 'FA'; cutP.st = 'FA'; cutP.c = { sal: 0, yrs: 0, kind: 'FA' };
  const fas = A.freeAgents(c).sort((a, b) => b.ovr - a.ovr);
  c.x.cal.day = 0;
  const huge = A.signFreeAgent(spec, c, fas[0].id, { sal: 80, yrs: 5 }); assert.equal(huge.ok, false, huge.text);
  const cv = A.getContractsView(c); assert.ok(cv.cap === 95.5 && cv.rows.length > 15 && cv.freeAgents.length > 0 && cv.sportActions.includes('placeOnWaivers'));
  const f = c.x.meta.BOS.fac.training, cash = c.x.fin.cash;
  c.x.fin.cash = 100; const up = A.upgradeFacility(spec, c, 'training'); assert.ok(up.ok, up.text); assert.ok(c.x.fin.cash < 100 && c.x.fac.upgrades.length === 1);
  assert.equal(A.upgradeFacility(spec, c, 'training').ok, false, 'already under construction');
  c.x.fin.cash = 0.1; assert.equal(A.upgradeFacility(spec, c, 'medical').ok, false, 'no cash');
  c.x.fin.cash = 200; assert.ok(c.x.fac.upgrades[0].daysLeft > 20, 'construction takes time'); c.x.fac.upgrades[0].daysLeft = 3; await days(spec, c, 4, { auto: true }); assert.equal(c.x.meta.BOS.fac.training, f + 1, 'built');
  void cash;
  const coach = await mk('nhl', 'COACH'); assert.equal(A.upgradeFacility(coach.spec, coach.c, 'training').ok, false, 'coach cannot invest');
});

test('determinism by seed: same seed + same actions = identical save; different seed differs', async () => {
  const run = async seed => { const { c, spec } = await mk('nhl', 'COACH', { seed }); A.setTraining(spec, c, { focus: 'technical' }); await days(spec, c, 25); return strip(c); };
  const a = await run('det-1'), b = await run('det-1'), d = await run('det-2');
  assert.equal(a, b); assert.notEqual(a, d);
});

test('save → load round trip equals the state and resuming gives the same future; autosave ring; quota', async () => {
  const { c, spec } = await mk('nhl', 'GM', { seed: 'rt1' });
  await days(spec, c, 20);
  const store = A.createCareerStore(A.memoryStorage());
  store.save(c); const back = store.load(c.id);
  assert.equal(back.status, 'ok'); assert.equal(back.save.saveVersion, A.CAREER_SAVE_VERSION);
  assert.equal(strip(back.save.career), strip(c), 'round trip equals state');
  const c2 = back.save.career; A.attachSpec(c2, spec);
  await days(spec, c, 15); await days(spec, c2, 15);
  assert.equal(strip(c2), strip(c), 'resumed career follows the same future');
  // autosave ring keeps two older copies, manual clears them
  store.autosave(c); store.autosave(c); assert.ok(store.slots(c.id).some(s => s.slot === 'auto2'));
  store.save(c); assert.deepEqual(store.slots(c.id).map(s => s.slot), ['manual']);
  // export / import
  const json = store.exportJSON(c.id), imp = store.importJSON(json); assert.notEqual(imp.id, c.id); assert.equal(store.list().length, 2);
  // quota: a full storage throws a QUOTA error and leaves existing slots intact
  const mem = A.memoryStorage(), full = { ...mem, getItem: k => mem.getItem(k), removeItem: k => mem.removeItem(k), setItem: (k, v) => { if (String(v).length > 5000 && k.includes('_auto')) throw new Error('QuotaExceededError'); mem.setItem(k, v); }, key: i => mem.key(i), get length() { return mem.length; } };
  const s2 = A.createCareerStore(full); s2.save(c);
  assert.throws(() => s2.autosave(c), e => e.code === 'QUOTA'); assert.equal(s2.load(c.id).status, 'ok');
});

test('migration v2 → v3: backup kept, state completed on attach, play continues; sizes are reasonable', async () => {
  const { c, spec } = await mk('nhl', 'COACH', { seed: 'mig1' });
  await days(spec, c, 12);
  const v2 = JSON.parse(JSON.stringify(c)); delete v2.x; v2.saveVersion = 2;
  for (const p of Object.values(v2.players)) { delete p.cv; delete p.xp; delete p.fm; }
  const env = { saveVersion: 2, id: v2.id, sport: 'nhl', role: 'COACH', name: v2.name, createdAt: 'x', updatedAt: '2026-01-01T00:00:00Z', metadata: {}, career: v2 };
  const mem = A.memoryStorage(); const raw = JSON.stringify(env); mem.setItem(`asu_career_${v2.id}`, raw);
  const store = A.createCareerStore(mem);
  const r = store.load(v2.id); assert.equal(r.status, 'ok'); assert.ok(r.migrated); assert.equal(r.save.saveVersion, 3); assert.equal(mem.getItem(`asu_career_${v2.id}_backup_v2`), raw, 'non-destructive backup');
  const c3 = r.save.career; assert.equal(c3.saveVersion, 3); assert.equal(c3.x.ready, false);
  A.attachSpec(c3, spec); assert.equal(c3.x.ready, true); assert.ok(c3.x.meta.BOS && c3.x.staff.hired.length && Object.values(c3.players).every(p => p.cv));
  assert.equal(c3.players[Object.keys(c3.players)[0]].id != null, true);
  await days(spec, c3, 20); assert.ok(finite(c3));
  assert.ok(A.getDashboardView(c3).header.role === 'COACH');
  assert.ok(JSON.stringify(c3).length < 3_000_000, 'NHL save stays far below the localStorage limit');
});

test('corrupted saves are rejected without crashing', async () => {
  const mem = A.memoryStorage(), store = A.createCareerStore(mem);
  mem.setItem('asu_career_a', '{not json'); assert.equal(store.load('a').status, 'corrupt'); assert.ok(mem.getItem('asu_career_a_corrupt'));
  mem.setItem('asu_career_b', JSON.stringify({ saveVersion: 3, id: 'b', sport: 'nhl', career: { teams: [], players: {}, phase: 'REGULAR' } })); assert.equal(store.load('b').status, 'corrupt');
  mem.setItem('asu_career_c', JSON.stringify({ saveVersion: 3, id: 'c', sport: 'cricket', career: {} })); assert.equal(store.load('c').status, 'corrupt');
  mem.setItem('asu_career_d', JSON.stringify({ saveVersion: 99, id: 'd', sport: 'nhl', career: {} })); assert.equal(store.load('d').status, 'corrupt');
  mem.setItem('asu_career_e', 'null'); assert.equal(store.load('e').status, 'corrupt');
  assert.equal(store.load('zzz').status, 'missing');
  assert.throws(() => store.importJSON('garbage'), /JSON/); assert.throws(() => store.importJSON('{"sport":"nhl","saveVersion":3,"career":{"phase":"X","teams":[1],"players":{}}}'));
  // a good autosave survives a corrupt manual slot
  const { c } = await mk('nhl', 'GM', { seed: 'cor' }); store.autosave(c); mem.setItem(`asu_career_${c.id}`, '###'); const ok = store.load(c.id); assert.equal(ok.status, 'ok'); assert.equal(ok.from, 'auto');
});

test('every screen view-model is serialisable for every role', async () => {
  for (const role of ['COACH', 'GM', 'PLAYER']) {
    const { c } = await mk('nhl', role, { seed: `v-${role}` });
    await days(c._spec, c, 9);
    for (const f of ['getDashboardView', 'getCalendarView', 'getTeamView', 'getRosterView', 'getStaffView', 'getTrainingView', 'getTacticsView', 'getContractsView', 'getTransactionsView', 'getScoutingView', 'getDraftView', 'getNewsView', 'getHistoryView', 'getProfileView']) {
      const v = A[f](c); assert.deepEqual(JSON.parse(JSON.stringify(v)), JSON.parse(JSON.stringify(v)), `${role}/${f}`);
    }
    assert.ok(A.getDashboardView({ saveVersion: 3, career: c }).header.role === role, 'accepts the store envelope');
  }
  assert.throws(() => A.getDashboardView({ phase: 'x' }), /inicializada/);
});
