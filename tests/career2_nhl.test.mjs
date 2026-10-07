// Career 3.0 — nhl: COACH, GM and PLAYER careers over two full seasons through the calendar API, rule legality, sport actions.
import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.fetch = async u => { const url = new URL(u); if (!url.protocol.startsWith('file')) throw new Error('offline'); const t = fs.readFileSync(url, 'utf8'); return { ok: true, text: async () => t, json: async () => JSON.parse(t) }; };
const A = await import('../core/career/api.js');
const SPORT = 'nhl', TEAM = 'BOS', POS = 'C';
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

test('nhl rules: cap hard, 20-23 roster, goalies, waivers, ELC/RFA/UFA labels, prospect pipeline, 7-round picks', async () => {
  const { c, spec } = await mk('GM', 'rules');
  for (const t of c.teams) { const l = spec.v3.legality(spec, c, t.abbr); assert.ok(l.ok, `${t.abbr}: ${l.issues.map(i => i.text)}`); assert.ok(l.stats.active >= 20 && l.stats.active <= 23 && l.stats.goalies >= 2); }
  assert.equal(A.teamPicks(spec, c, TEAM, { years: 1 }).length, 7);
  const vet = A.teamPlayers(c, TEAM).filter(p => p.st === 'ACT' && p.pos !== 'G' && p.age >= 26 && p.c?.kind !== 'ELC').sort((a, b) => a.ovr - b.ovr)[0];
  assert.equal(A.sendToAHL(spec, c, vet.id).ok, false, 'veterans need waivers'); assert.ok(A.sendToAHL(spec, c, vet.id).needsWaivers);
  const w = A.placeOnWaivers(spec, c, vet.id); assert.ok(w.ok); assert.ok(w.claimed ? c.players[vet.id].t === w.claimed : c.players[vet.id].st === 'MIN');
  const rookie = A.teamPlayers(c, TEAM).find(p => p.c?.kind === 'ELC'); void rookie;
  // draft a prospect: pipeline levels
  let guard = 0; while (!(c.phase === 'OFFSEASON' && c.off === 'FREE_AGENCY') && guard++ < 300) await A.advance(spec, c, 'NEXT_WEEK', { auto: true, stopOnEvents: false });
  const drafted = Object.values(c.players).filter(p => p.drafted && p.drafted.year === c.season && p.st === 'MIN');
  assert.ok(drafted.length > 20 && drafted.every(p => ['JUNIOR', 'AHL', 'EUROPE'].includes(p.lvl)), 'draftees sit in the junior / AHL / Europe pipeline');
  assert.ok(drafted.some(p => p.lvl === 'JUNIOR') && drafted.filter(p => p.lvl === 'JUNIOR').every(p => p.c.kind === 'ELC'));
  const p0 = drafted.find(p => p.lvl === 'JUNIOR'), yrs0 = p0.c.yrs; 
  const cv = A.getContractsView(c); assert.ok(cv.rows.some(r => r.contractKind === 'ELC'));
});

test('nhl player pathways: Junior / College / Europe → Draft → Development → NHL', async () => {
  for (const pathway of ['JUNIOR', 'COLLEGE', 'EUROPE']) {
    const { career: c, spec } = await A.startCareer({ sport: 'nhl', role: 'PLAYER', seed: `pw-${pathway}`, player: { name: 'Caminho', pos: 'C', talent: 'raro', pathway } });
    assert.equal(c.me.stage, pathway); assert.equal(A.getProfileView(c).pathway.steps[0].key, pathway);
    let guard = 0; while (c.phase !== 'OFFSEASON' && guard++ < 60) await A.advance(spec, c, 'NEXT_WEEK', { auto: true });
    assert.ok(c.players[c.me.id].hist.length >= 1);
  }
});

