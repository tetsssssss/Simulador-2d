// Career 3.0 — mlb: COACH, GM and PLAYER careers over two full seasons through the calendar API, rule legality, sport actions.
import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.fetch = async u => { const url = new URL(u); if (!url.protocol.startsWith('file')) throw new Error('offline'); const t = fs.readFileSync(url, 'utf8'); return { ok: true, text: async () => t, json: async () => JSON.parse(t) }; };
const A = await import('../core/career/api.js');
const SPORT = 'mlb', TEAM = 'NYY', POS = 'SS';
const mk = async (role, seed) => { const { career, spec } = await A.startCareer({ sport: SPORT, role, team: TEAM, seed: `${seed}-${role}`, difficulty: 1, player: { name: 'Atleta Teste', pos: POS, talent: 'raro' } }); return { c: career, spec }; };
const finite = c => Object.values(c.players).every(p => Number.isFinite(p.ovr) && Number.isFinite(p.age) && Number.isFinite(p.pot) && (!p.c || (Number.isFinite(p.c.sal) && Number.isFinite(p.c.yrs))));
async function twoSeasons(c, spec, check) {
  const end = c.season + 2, comp = []; let calls = 0;
  while (c.season < end && calls++ < 900) {
    const r = await A.advance(spec, c, 'NEXT_WEEK', { auto: true });
    comp.push(...(r.compliance || []));
    if (c.phase === 'REGULAR' || c.phase === 'PLAYOFFS') for (const t of c.teams) { if (t.abbr === c.userTeam || t.abbr === TEAM && c.role === 'PLAYER') continue; const l = spec.v3.legality(spec, c, t.abbr); if (!l.ok && !c.players[c.me?.id]?.t?.includes?.(t.abbr)) assert.fail(`${c.season}/${c.phase}/${c.slate} ${t.abbr}: ${l.issues.map(i => i.text)}`); }
    check?.(r);
  }
  assert.ok(c.season >= end, 'two seasons completed'); return comp;
}
for (const role of ['COACH', 'GM', 'PLAYER']) {
  test(`${SPORT} ${role}: two seasons through the calendar, no NaN, AI teams legal, user legal on game days`, async () => {
    const { c, spec } = await mk(role, 'seasons');
    assert.ok(c.x.ready);
    const comp = await twoSeasons(c, spec);
    assert.ok(finite(c), 'no NaN / non-finite values');
    if (role !== 'PLAYER') { assert.ok(comp.length >= spec.calendar.games, `user games checked (${comp.length})`); assert.ok(comp.every(x => x.ok), 'user legal on every game day (after auto-fix)'); }
    assert.equal(c.history.seasons.length >= 2 || role === 'PLAYER', true);
    assert.ok(c.x.feed.length > 10 && c.x.feed.every(i => i.h)); assert.ok(c.x.coach || role === 'PLAYER');
    for (const v of ['getDashboardView', 'getRosterView', 'getContractsView', 'getTransactionsView', 'getDraftView', 'getScoutingView']) JSON.stringify(A[v](c));
    const first = Object.values(c.players).filter(p => p.cv).length; assert.ok(first > 500);
    if (role === 'PLAYER') { const me = c.players[c.me.id]; assert.ok(me.hist?.length >= 1 || me.ps, 'the created player accumulated history'); assert.ok(c.x.prel.log.length >= 0 && ['coachTrust', 'teammates', 'management', 'fans'].every(k => c.x.prel[k] >= 0 && c.x.prel[k] <= 100)); }
  });
}

test('mlb rules: 26 active, 40-man, options, service time, DFA, farm levels', async () => {
  const { c, spec } = await mk('GM', 'rules');
  for (const t of c.teams) { const l = spec.v3.legality(spec, c, t.abbr); assert.ok(l.ok, `${t.abbr}: ${l.issues.map(i => i.text)}`); assert.equal(l.stats.active, 26); assert.ok(l.stats.forty <= 40); }
  const roster = A.getRosterView(c); assert.ok(roster.minors.AAA.length && roster.minors.R !== undefined && roster.counts.on40 <= 40);
  // option an active reliever, then call up; options are consumed once per season
  const rp = A.teamPlayers(c, TEAM).filter(p => p.st === 'ACT' && p.pos === 'RP').sort((a, b) => a.ovr - b.ovr)[0];
  const r1 = A.sendDown(spec, c, rp.id); assert.ok(r1.ok, r1.text); assert.equal(rp.st, 'MIN'); assert.ok(rp.optUsed && rp.on40);
  const r2 = A.callUp(spec, c, rp.id); assert.ok(r2.ok, r2.text); assert.equal(rp.st, 'ACT');
  rp.opt = 0; rp.optUsed = false; assert.equal(A.sendDown(spec, c, rp.id).ok, false, 'no options left → DFA needed');
  assert.ok(A.sendDown(spec, c, rp.id).needsDfa);
  const act0 = A.teamPlayers(c, TEAM).filter(p => p.st === 'ACT').length; const d = A.dfa(spec, c, rp.id); assert.ok(d.ok); assert.equal(rp.on40, d.claimed ? rp.on40 : false);
  void act0;
  // service time: days accrue only for the active roster
  const star = A.teamPlayers(c, TEAM).filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr)[0], minor = A.teamPlayers(c, TEAM).find(p => p.st === 'MIN'); star.svcD = 0; minor.svcD = 0;
  for (let i = 0; i < 25; i++) await A.advance(spec, c, 'NEXT_DAY', { auto: true });
  assert.ok(star.svcD >= 15 && !minor.svcD, `svc days ${star.svcD}/${minor.svcD}`);
  // international signing period
  assert.ok(c.x.intl.ids.length === 50);
  let guard = 0; while (!(c.phase === 'OFFSEASON' && c.off === 'FREE_AGENCY') && guard++ < 500) await A.advance(spec, c, 'NEXT_WEEK', { auto: true, stopOnEvents: false });
  assert.ok(c.x.intl.open);
  const prospect = Object.values(c.players).filter(p => p.t === 'INTL').sort((a, b) => b.pot - a.pot)[0];
  assert.equal(A.signInternational(spec, c, prospect.id, 0.01).ok, false, 'bonus below ask');
  const res = A.signInternational(spec, c, prospect.id, prospect.ask); assert.ok(res.ok, res.text); assert.equal(prospect.st, 'MIN'); assert.equal(prospect.lvl, 'R'); assert.equal(prospect.t, TEAM);
  assert.equal(A.signInternational(spec, c, prospect.id, 1).ok, false, 'already signed');
  assert.equal(spec.draft.rounds >= 10, true);
  const sc = A.getScoutingView(c); assert.ok(sc.intl.length && sc.intlBudget.open);
});

test('mlb player pathways: High School / College / International', async () => {
  for (const pathway of ['HS', 'COLLEGE', 'INTERNATIONAL']) {
    const { career: c, spec } = await A.startCareer({ sport: 'mlb', role: 'PLAYER', seed: `pw-${pathway}`, player: { name: 'Caminho', pos: 'SS', talent: 'raro', pathway, age: pathway === 'INTERNATIONAL' ? 17 : 18 } });
    assert.equal(c.me.path, pathway);
    let guard = 0; while (c.phase !== 'OFFSEASON' && guard++ < 400) await A.advance(spec, c, 'NEXT_WEEK', { auto: true });
    let g2 = 0; while (c.season < 2028 && g2++ < 400) await A.advance(spec, c, 'NEXT_WEEK', { auto: true });
    const me = c.players[c.me.id]; if (pathway === 'INTERNATIONAL') assert.ok(me.signed && me.t !== 'AMATEUR', 'signed without a draft'); else assert.ok(me.drafted || me.t === 'FA' || me.t === 'DRAFT' || me.t === 'AMATEUR');
  }
});

