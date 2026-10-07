import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.fetch = async u => { const url = new URL(u); if (!url.protocol.startsWith('file')) throw new Error('offline'); const t = fs.readFileSync(url, 'utf8'); return { ok: true, text: async () => t, json: async () => JSON.parse(t) }; };
const C = await import('../core/career/careerCore.js');
const { createCareerStore, memoryStorage, CAREER_SAVE_VERSION, migrations } = await import('../core/career/saveStore.js');
const { buildSchedule } = await import('../core/career/league.js');
const { NHL_SPEC } = await import('../nhl/src/career/nhlSpec.js');
const { MLB_SPEC } = await import('../mlb/src/career/mlbSpec.js');
const { NFL_SPEC } = await import('../nfl/src/career/nflSpec.js');
const SPECS = { nhl: NHL_SPEC, mlb: MLB_SPEC, nfl: NFL_SPEC };

async function season(spec, c) {
  let n = 0;
  while (c.phase !== 'OFFSEASON' && n++ < 2000) { if (c.phase === 'PLAYOFFS') await C.playPlayoffGameDay(spec, c); else await C.playSlate(spec, c); }
  while (c.phase === 'OFFSEASON' && n++ < 2100) { if (c.off === 'DRAFT') C.runDraft(spec, c, { auto: true }); C.advanceOffseason(spec, c); }
}

test('schedule: every team plays the season length, home/away balanced', () => {
  const teams = Array.from({ length: 30 }, (_, i) => ({ abbr: 'T' + i, div: 'D' + (i % 6) }));
  const { schedule } = buildSchedule(teams, { games: 162, seriesLength: 3, seed: 'x' });
  for (const t of teams) { const g = schedule.filter(x => x.h === t.abbr || x.a === t.abbr); assert.equal(g.length, 162); const h = g.filter(x => x.h === t.abbr).length; assert.ok(h >= 70 && h <= 92, `${t.abbr} home ${h}`); }
});

for (const [sport, spec] of Object.entries(SPECS)) {
  test(`career ${sport}: a full GM season → playoffs → champion → offseason (awards, draft, FA) → next season`, async () => {
    const team = { nhl: 'BOS', mlb: 'NYY', nfl: 'SEA' }[sport];
    const c = await C.createCareer(spec, { role: 'GM', team, seed: 'T' + sport, settings: { engineGames: false } });
    assert.ok(c.teams.length >= 30 && Object.keys(c.players).length > 700);
    await season(spec, c);
    assert.equal(c.season, spec.calendar.firstSeason + 1); assert.equal(c.phase, 'PRESEASON');
    const prev = c.history.seasons.at(-1); assert.equal(prev.team, team);
    const gp = prev.w + prev.l + (prev.t || 0) + (prev.otl || 0); assert.equal(gp, spec.calendar.games);
    assert.ok(prev.champion, 'a champion was crowned');
    assert.ok(c.history.transactions.some(t => t.kind === 'DRAFT'), 'draft happened');
    assert.ok(c.history.awards.length >= 1);
    assert.ok(Object.values(c.players).every(p => Number.isFinite(p.ovr) && Number.isFinite(p.age)), 'no NaN in players');
    assert.ok(C.teamPlayers(c, team).length >= spec.roster.min - 5);
  });
}

test('career: player role (NHL) — Junior → declared → drafted → pro roster or AHL', async () => {
  const c = await C.createCareer(NHL_SPEC, { role: 'PLAYER', seed: 'PL', settings: { engineGames: false }, player: { name: 'Teste Jogador', pos: 'C', talent: 'raro', age: 17 } });
  assert.equal(c.me.stage, 'JUNIOR');
  await season(NHL_SPEC, c); await season(NHL_SPEC, c);
  const me = c.players[c.me.id];
  assert.ok(me.drafted && me.t !== 'AMATEUR', `drafted (${me.t}, ${c.me.stage})`);
  assert.ok(['NHL', 'AHL'].includes(c.me.stage));
  assert.ok(me.hist.some(h => h.t === 'Junior (CHL)'));
});

test('career systems: contracts negotiation, trade evaluation (value, not only OVR), relationships, save/load round trip', async () => {
  const c = await C.createCareer(NHL_SPEC, { role: 'GM', team: 'BOS', seed: 'SYS', settings: { engineGames: false } });
  const mine = C.teamPlayers(c, 'BOS').sort((a, b) => b.ovr - a.ovr), star = mine[0], scrub = mine.at(-1);
  const other = C.teamPlayers(c, 'TOR').sort((a, b) => b.ovr - a.ovr);
  const bad = C.proposeTrade(NHL_SPEC, c, { give: [scrub.id], get: [other[0].id], aiTeam: 'TOR' });
  assert.equal(bad.ok, false, 'a scrub for a star is refused');
  const ask = C.contractAsk(NHL_SPEC, star);
  assert.equal(C.negotiate(NHL_SPEC, star, { sal: ask.sal * 0.5, yrs: ask.yrs }).ok, false);
  assert.equal(C.negotiate(NHL_SPEC, star, { sal: ask.sal, yrs: ask.yrs }).ok, true);
  const r0 = star.rel.tr; C.talkTo(c, star.id, 'praise'); assert.ok(star.rel.tr >= r0);
  const store = createCareerStore(memoryStorage());
  store.save(c); const back = store.load(c.id);
  assert.equal(back.status, 'ok'); assert.equal(back.save.saveVersion, CAREER_SAVE_VERSION);
  assert.equal(Object.keys(back.save.career.players).length, Object.keys(c.players).length);
  assert.ok(!('_spec' in back.save.career), 'runtime spec is not saved');
  store.autosave({ ...c, name: 'auto' }); assert.equal(store.load(c.id).from, 'auto');
  store.save(c); assert.equal(store.load(c.id).from, 'manual', 'manual save supersedes the autosave');
});

test('saves: migration is non-destructive (backup kept), future versions refused, NFL slots imported as copies', () => {
  const mem = memoryStorage(), store = createCareerStore(mem);
  const nflSlot = { version: 1, createdAt: '2026-01-01T00:00:00Z', career: { name: 'Dinastia', team: 'SEA', week: 5, wins: 3, losses: 1, seed: 'ABC' }, settings: null, metadata: {} };
  mem.setItem('asu_nfl_save_2', JSON.stringify(nflSlot));
  const ids = store.importNflSlots();
  assert.equal(ids.length, 1); assert.equal(mem.getItem('asu_nfl_save_2'), JSON.stringify(nflSlot), 'original NFL slot untouched');
  const s = store.load(ids[0]); assert.equal(s.status, 'ok'); assert.equal(s.save.sport, 'nfl'); assert.equal(s.save.career.legacyNfl.team, 'SEA');
  assert.equal(store.importNflSlots().length, 0, 'imported once');
  // an old v1 hub save is migrated with a backup of the raw text
  const v1 = { saveVersion: 1, id: 'old1', sport: 'nhl', role: 'GM', name: 'Old', career: { id: 'old1', sport: 'nhl', role: 'GM' } };
  mem.setItem('asu_career_old1', JSON.stringify(v1));
  const m = store.load('old1'); assert.equal(m.status, 'ok'); assert.ok(m.migrated); assert.equal(mem.getItem('asu_career_old1_backup_v1'), JSON.stringify(v1));
  assert.throws(() => migrations.migrate({ saveVersion: 99 }), /futura/);
  mem.setItem('asu_career_bad', '{not json'); assert.equal(store.load('bad').status, 'corrupt'); assert.ok(mem.getItem('asu_career_bad_corrupt'));
});
