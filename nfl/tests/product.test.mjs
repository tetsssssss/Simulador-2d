// Product layer (Prompt B): GameplaySettings → engine tuning, SaveManager (versioning, legacy migration,
// corruption), match layer (CPU calls, game state, headless full game) and career week flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineups, roster } from './fixtures.mjs';
import { createPlay, runToEnd } from '../src/sim/playSim.js';
import { buildProfile } from '../src/sim/attributes.js';
import { engineTuning, defaultGameplay, presetValues, sanitizeSettings, matchPreset, GAMEPLAY_SLIDERS } from '../src/core/gameplaySettings.js';
import { createSaveManager, memoryStorage, SAVE_VERSION, LEGACY_KEY } from '../src/core/saveManager.js';
import { newGameState, cpuOffenseCall, cpuDefenseCall, simulateGame, runFamilies, passConcepts, defCalls, conceptLabel } from '../src/game/match.js';
import { createCareer, completeWeek, normalizeCareer, nextGame, divisionTable } from '../src/game/career.js';
import { PLAYBOOK, DEF_CALLS } from '../src/sim/formation.js';

const teams = JSON.parse(readFileSync(new URL('../data/teams.json', import.meta.url), 'utf8'));
const ls = lineups('SEA', 'NE');
const play = (seed, opts = {}) => runToEnd(createPlay({ offense: ls.offense, defense: ls.defense, ballOn: 30, seed, ...opts }));

test('settings: defaults/Simulation preset produce no engine tuning (calibrated path)', () => {
  assert.equal(engineTuning(defaultGameplay()), null);
  assert.equal(engineTuning(presetValues('SIMULATION')), null);
  assert.equal(matchPreset(defaultGameplay()), 'SIMULATION');
  assert.equal(matchPreset(presetValues('CHAOTIC')), 'CHAOTIC');
  assert.notEqual(engineTuning(presetValues('BALANCED')), null);
  // sanitize clamps out-of-range values and unknown presets
  const s = sanitizeSettings({ preset: 'X', gameplay: { turnover: 99, coverage: -4 } });
  assert.equal(s.gameplay.turnover, 2); assert.equal(s.gameplay.coverage, 0.5); assert.equal(s.preset, 'CUSTOM');
  for (const sl of GAMEPLAY_SLIDERS) assert.ok(sl.min <= sl.def && sl.def <= sl.max, sl.key);
});

test('settings: tuning at default values is bit-identical to no tuning', () => {
  for (const seed of ['P1', 'P2', 'P3']) for (const playType of ['pass', 'run', 'deep']) {
    const a = play(seed, { playType }), b = play(seed, { playType, tuning: { influence: {}, turnover: 1, fatigue: 1 } });
    assert.deepEqual([a.outcome, a.yards, a.duration, a.events.length], [b.outcome, b.yards, b.duration, b.events.length]);
  }
});

test('settings: influence widens/compresses rating gaps around the midpoint', () => {
  const p = ls.offense[0];
  const base = buildProfile(p).r.shortAccuracy;
  const wide = buildProfile(p, {}, { shortAccuracy: 1.5 }).r.shortAccuracy;
  const flat = buildProfile(p, {}, { shortAccuracy: 0.5 }).r.shortAccuracy;
  assert.ok(Math.abs((wide - 0.5) - 1.5 * (base - 0.5)) < 1e-9 || wide === 1);
  assert.ok(Math.abs(flat - 0.5) < Math.abs(base - 0.5) + 1e-12);
});

test('settings: Turnover Frequency 0 removes interceptions and fumbles', () => {
  const tuning = engineTuning({ ...defaultGameplay(), turnover: 0 });
  let to = 0;
  for (let i = 0; i < 120; i++) {
    const r = play(`TO${i}`, { playType: ['pass', 'deep', 'run'][i % 3], tuning });
    if (r.events.some(e => e.type === 'INTERCEPTION' || (e.type === 'FUMBLE' && e.reason !== 'MESH'))) to++;
  }
  assert.equal(to, 0);
});

test('save: versioned envelope, slots, export/import, delete', () => {
  const st = memoryStorage(), sm = createSaveManager(st);
  assert.equal(sm.slots().every(s => s.status === 'empty'), true);
  const c = createCareer({ team: 'SEA', teams });
  const env = sm.save(2, c, { preset: 'SIMULATION' });
  assert.equal(env.version, SAVE_VERSION);
  assert.equal(env.metadata.team, 'SEA');
  assert.equal(sm.activeSlot(), 2);
  const json = sm.exportSlot(2);
  sm.importInto(4, json);
  assert.equal(sm.load(4).save.career.team, 'SEA');
  assert.throws(() => sm.importInto(5, '{nope'));
  assert.throws(() => sm.importInto(5, JSON.stringify({ version: 1, career: {} })));
  sm.remove(2);
  assert.equal(sm.load(2).status, 'empty');
});

test('save: legacy asu_career is migrated (and backed up), corrupted slot is reported not discarded', () => {
  const st = memoryStorage();
  st.setItem(LEGACY_KEY, JSON.stringify({ team: 'KC', week: 5, wins: 3, losses: 1, injuries: [], trades: [] }));
  const sm = createSaveManager(st);
  const m = sm.migrateLegacy();
  assert.equal(m.slot, 1);
  const s = sm.load(1).save;
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.career.team, 'KC'); assert.equal(s.career.wins, 3);
  assert.ok(st.getItem('asu_career_legacy_backup'));
  assert.equal(sm.migrateLegacy(), null, 'migration runs once');
  const c = normalizeCareer(s.career, teams);
  assert.equal(c.schedule.length, 17);
  assert.equal(c.schedule.filter(g => g.result?.legacy).length, 4);
  assert.equal(nextGame(c).week, 5);
  st.setItem('asu_nfl_save_3', '{"version":1, broken');
  assert.equal(sm.load(3).status, 'corrupt');
  assert.ok(st.getItem('asu_nfl_save_3_corrupt'));
});

test('match: play-call panel lists only implemented concepts/coverages', () => {
  assert.equal(runFamilies().length * 2, Object.keys(PLAYBOOK.run).length);
  assert.equal(passConcepts('pass').length, Object.keys(PLAYBOOK.pass).length);
  assert.equal(defCalls().length, Object.keys(DEF_CALLS).length);
  assert.equal(conceptLabel('INSIDE_ZONE_L'), 'Inside Zone Left');
  const g = newGameState({ seed: 'CPU' });
  const a = cpuOffenseCall(g), b = cpuOffenseCall(g);
  assert.deepEqual(a, b);
  assert.ok(PLAYBOOK[a.playType][a.concept]);
  assert.ok(DEF_CALLS[cpuDefenseCall(g)]);
});

test('match: headless full game with the engine is deterministic and consistent', async () => {
  const run = () => simulateGame({ roster: roster(), home: 'SEA', away: 'NE', seed: 'FULLGAME', quarterMin: 4 });
  const g = await run(), h = await run();
  assert.equal(g.over, true);
  assert.deepEqual([g.homeScore, g.awayScore, g.playNo], [h.homeScore, h.awayScore, h.playNo]);
  const tds = g.scoring.filter(s => s.text.startsWith('TD')).length, sf = g.scoring.filter(s => s.text === 'Safety').length;
  assert.equal(g.homeScore + g.awayScore, tds * 7 + sf * 2);
  const plays = Object.values(g.box.teams).reduce((n, t) => n + t.plays, 0);
  assert.equal(plays, g.playNo);
});

test('career: week completes with engine score, standings and schedule advance', () => {
  const c = createCareer({ team: 'SEA', teams, seed: 'CAR' });
  const g = nextGame(c);
  const ug = g.home ? { home: 'SEA', away: g.opp, homeScore: 24, awayScore: 17 } : { home: g.opp, away: 'SEA', homeScore: 17, awayScore: 24 };
  completeWeek(c, teams, roster(), ug, { injury: 0 });
  assert.equal(c.wins, 1); assert.equal(c.week, 2);
  assert.equal(c.standings.SEA.w, 1); assert.equal(c.standings[g.opp].l, 1);
  const games = Object.values(c.standings).reduce((n, s) => n + s.w + s.l + s.t, 0);
  assert.equal(games, 32);
  assert.equal(divisionTable(c, teams).length, 4);
});
