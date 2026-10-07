// Career 3.0 — nfl: COACH, GM and PLAYER careers over two full seasons through the calendar API, rule legality, sport actions.
import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.fetch = async u => { const url = new URL(u); if (!url.protocol.startsWith('file')) throw new Error('offline'); const t = fs.readFileSync(url, 'utf8'); return { ok: true, text: async () => t, json: async () => JSON.parse(t) }; };
const A = await import('../core/career/api.js');
const SPORT = 'nfl', TEAM = 'SEA', POS = 'QB';
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

test('nfl rules: cap hard, 53-man, practice squad, franchise tag, 7-round tradable picks', async () => {
  const { c, spec } = await mk('GM', 'rules');
  for (const t of c.teams) { const l = spec.v3.legality(spec, c, t.abbr); assert.ok(l.ok || t.abbr === TEAM, `${t.abbr}: ${l.issues.map(i => i.text)}`); assert.ok(l.stats.payroll <= spec.cap.limit + 0.01); }
  assert.equal(spec.draft.rounds, 7); assert.equal(A.teamPicks(spec, c, TEAM, { years: 1 }).length, 7);
  // practice squad
  const ps = A.teamPlayers(c, TEAM).filter(p => p.st === 'MIN').length; const fa = Object.values(c.players).filter(p => p.t === 'FA' && p.st === 'FA').sort((a, b) => b.ovr - a.ovr);
  if (fa.length && ps < 16) { const r = A.signPracticeSquad(spec, c, fa[0].id); assert.ok(r.ok, r.text); assert.equal(c.players[fa[0].id].st, 'MIN'); const up = A.promotePracticeSquad(spec, c, fa[0].id); if (A.teamPlayers(c, TEAM).filter(p => p.st === 'ACT').length < 53) assert.ok(up.ok, up.text); }
  // franchise tag: only in the offseason, once per season, needs an expiring contract
  const star = A.teamPlayers(c, TEAM).filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr)[0];
  assert.equal(A.franchiseTag(spec, c, star.id).ok, false, 'not during the season');
  let guard = 0; while (!(c.phase === 'OFFSEASON' && c.off === 'RESIGN') && guard++ < 80) await A.advance(spec, c, 'NEXT_WEEK', { auto: true, stopOnEvents: false });
  assert.equal(c.off, 'RESIGN');
  const exp = A.teamPlayers(c, TEAM).filter(p => p.expiring || p.c?.yrs <= 1).sort((a, b) => b.ovr - a.ovr)[0];
  if (exp) { exp.expiring = true; const r = A.franchiseTag(spec, c, exp.id); assert.ok(r.ok, r.text); assert.equal(exp.c.kind, 'TAG'); assert.equal(exp.c.yrs, 1); assert.equal(A.franchiseTag(spec, c, exp.id).ok, false, 'one tag per season'); }
  // a hard-cap trade that would break the cap is refused
  const rich = A.teamPlayers(c, 'KC').sort((a, b) => b.c.sal - a.c.sal)[0]; const l = spec.v3.legality(spec, c, TEAM);
  rich.c.sal = l.stats.capSpace + 40;
  const ev = A.evaluateOffer(spec, c, { from: TEAM, to: 'KC', give: { players: [] , picks: [A.teamPicks(spec, c, TEAM)[0].key] }, get: { players: [rich.id] } }); assert.equal(ev.accept, false); assert.ok(ev.reasons.join().includes('teto'));
  const tx = A.getTransactionsView(c); assert.ok(tx.picks.mine.length >= 7);
});

test('nfl player pathway: College → Draft → Rookie Camp → Depth Chart → NFL', async () => {
  const { c, spec } = await mk('PLAYER', 'path');
  assert.equal(c.me.stage, 'COLLEGE'); const steps = A.getProfileView(c).pathway.steps.map(s => s.key); assert.deepEqual(steps, ['COLLEGE', 'DRAFT', 'ROOKIE_CAMP', 'DEPTH_CHART', 'NFL']);
  let guard = 0; while (c.season < 2030 && guard++ < 700) { await A.advance(spec, c, 'NEXT_WEEK', { auto: true }); if (c.players[c.me.id].drafted && c.phase === 'REGULAR') break; }
  const me = c.players[c.me.id]; assert.ok(me.drafted || me.t === 'FA', 'drafted or undrafted FA'); if (me.drafted) assert.ok(['ROOKIE_CAMP', 'DEPTH_CHART', null].includes(c.me.sub) || c.me.stage === 'NFL');
});

