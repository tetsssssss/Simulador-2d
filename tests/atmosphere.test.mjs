import test from 'node:test';
import assert from 'node:assert/strict';
import { getAudio, DEFAULT_AUDIO, CATEGORIES } from '../core/audio/audioEngine.js';
import { createCrowdIntensity } from '../core/audio/crowdIntensity.js';
import { createAtmosphere } from '../core/presentation/atmosphere.js';
import { createCrowd, seatsAroundRect } from '../core/render/crowd.js';
import { NFL_ATMOSPHERE, nflStands } from '../nfl/src/presentation/atmosphere.js';
import { NHL_ATMOSPHERE, nhlStands } from '../nhl/src/presentation/atmosphere.js';
import { MLB_ATMOSPHERE, mlbStands } from '../mlb/src/presentation/atmosphere.js';

test('audio: five categories with separate volumes; silent no-op without WebAudio', () => {
  assert.deepEqual(CATEGORIES, ['AMBIENCE', 'CROWD', 'GAME_EFFECT', 'UI', 'COMMENTARY']);
  for (const c of CATEGORIES) assert.ok(DEFAULT_AUDIO[c] > 0 && DEFAULT_AUDIO[c] <= 1);
  const a = getAudio();
  assert.equal(a, getAudio(), 'one engine per document');
  assert.equal(a.play('whistle'), false);
  a.setAmbience('stadium'); a.setCrowd(150); assert.equal(a.crowdLevel, 100); a.setAmbience(null);
  assert.ok(Math.abs(a.volume('CROWD') - DEFAULT_AUDIO.master * DEFAULT_AUDIO.CROWD) < 1e-9);
});

test('crowd intensity: bursts rise fast, decay back to the situational baseline, clamped 0–100', () => {
  const ci = createCrowdIntensity({ base: 30 });
  ci.bump(80); for (let i = 0; i < 30; i++) ci.tick(1 / 30);
  assert.ok(ci.value > 70, `rises: ${ci.value}`);
  for (let i = 0; i < 900; i++) ci.tick(1 / 30);
  assert.ok(Math.abs(ci.value - 30) < 3, `decays to baseline: ${ci.value}`);
  ci.setBaseline(500); ci.bump(500); for (let i = 0; i < 300; i++) ci.tick(1 / 30);
  assert.ok(ci.value <= 100 && ci.value >= 95);
  ci.tick(NaN); assert.ok(Number.isFinite(ci.value));
});

test('atmosphere: NFL home defense on 3rd down is louder; home TD roars, away TD groans', () => {
  const ctx = { off: 'NE', def: 'SEA', home: 'SEA', away: 'NE', down: 3, homeScore: 0, awayScore: 0, quarter: 1, clock: 900 };
  assert.ok(NFL_ATMOSPHERE.baseline(ctx) > NFL_ATMOSPHERE.baseline({ ...ctx, down: 1 }));
  assert.ok(NFL_ATMOSPHERE.baseline(ctx) > NFL_ATMOSPHERE.baseline({ ...ctx, off: 'SEA', def: 'NE' }));
  const homeTd = NFL_ATMOSPHERE.react({ type: 'TOUCHDOWN', side: 'off' }, { ...ctx, off: 'SEA', def: 'NE' });
  const awayTd = NFL_ATMOSPHERE.react({ type: 'TOUCHDOWN', side: 'off' }, ctx);
  assert.ok(homeTd.bump > awayTd.bump); assert.equal(homeTd.sounds[0][0], 'cheer'); assert.equal(awayTd.sounds[0][0], 'groan');
  const played = []; const audio = { setAmbience() {}, setCrowd() {}, play: (n, o) => played.push([n, o.category]) };
  const crowd = { v: 0, setIntensity(v) { this.v = v; } };
  const atm = createAtmosphere({ rules: NFL_ATMOSPHERE, audio, crowd });
  atm.onEvent({ type: 'SACK', by: 'x', qb: 'y' }, ctx); for (let i = 0; i < 20; i++) atm.tick(1 / 30);
  assert.deepEqual(played.map(p => p[0]), ['thud', 'cheer']); assert.equal(played[0][1], 'GAME_EFFECT'); assert.equal(played[1][1], 'CROWD');
  assert.ok(crowd.v > 40, `crowd visual follows intensity: ${crowd.v}`);
});

test('atmosphere: NHL horn only for home goals, power play raises baseline; MLB full count / bases loaded / HR', () => {
  assert.equal(NHL_ATMOSPHERE.react({ type: 'GOAL', team: 'home' }, {}).sounds[0][0], 'horn');
  assert.ok(!NHL_ATMOSPHERE.react({ type: 'GOAL', team: 'away' }, {}).sounds.some(s => s[0] === 'horn'));
  const nc = { score: { home: 1, away: 1 }, period: 1, clock: 900 };
  assert.ok(NHL_ATMOSPHERE.baseline({ ...nc, powerPlay: 'home' }) > NHL_ATMOSPHERE.baseline(nc));
  const mc = { score: { home: 2, away: 2 }, inning: 3, balls: 0, strikes: 0, outs: 0, runners: [] };
  assert.ok(MLB_ATMOSPHERE.baseline({ ...mc, balls: 3, strikes: 2, runners: [1, 2, 3] }) >= MLB_ATMOSPHERE.baseline(mc) + 25);
  const hr = MLB_ATMOSPHERE.react({ type: 'HOME_RUN', runs: 1 }, { ...mc, batSide: 'home' });
  assert.ok(hr.bump >= 80 && hr.sounds.some(s => s[0] === 'organ'));
  assert.ok(MLB_ATMOSPHERE.react({ type: 'HOME_RUN', runs: 1 }, { ...mc, batSide: 'home', walkoff: true }).bump === 100);
});

test('crowd stands: seeded, team-colored, drawn through any camera without throwing', () => {
  const a = nflStands({ home: 'SEA', away: 'NE', homeColor: '#002244', awayColor: '#c60c30' }), b = nflStands({ home: 'SEA', away: 'NE', homeColor: '#002244', awayColor: '#c60c30' });
  assert.equal(a.count, b.count); assert.ok(a.count > 1500);
  assert.ok(nhlStands({ home: 'BOS', away: 'TOR' }).count > 800 && mlbStands({ home: 'NYY', away: 'BOS' }).count > 1500);
  const calls = { rect: 0, fill: 0 };
  const ctx = new Proxy({ canvas: { width: 800, height: 600 } }, { get: (t, k) => k in t ? t[k] : (...args) => { if (k === 'rect' || k === 'ellipse') calls.rect++; if (k === 'fill') calls.fill++; }, set: (t, k, v) => { t[k] = v; return true; } });
  for (const scale of [2, 12]) for (const v of [0, 100]) { a.setIntensity(v); a.draw(ctx, { cam: { sx: x => x * scale, sy: y => (y + 12) * scale, scale }, t: 1.3, view: { w: 800, h: 600 } }); }
  assert.ok(calls.rect > 100 && calls.fill > 4);
  const seats = seatsAroundRect({ x0: 0, y0: 0, x1: 10, y1: 10, rows: 1, spacing: 1, skip: [{ side: 'top', from: 2, to: 8 }] });
  assert.ok(!seats.some(s => s.side === 'top' && s.x > 2 && s.x < 8));
  assert.equal(createCrowd({ seats: [], home: '#fff' }).count, 0);
});
