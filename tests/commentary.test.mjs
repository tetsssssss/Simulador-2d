import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommentary } from '../core/commentary/commentaryEngine.js';
import { createPresentation } from '../core/presentation/presentationEngine.js';
import { NFL_COMMENTARY } from '../nfl/src/presentation/commentary.js';
import { NHL_COMMENTARY } from '../nhl/src/presentation/commentary.js';
import { MLB_COMMENTARY } from '../mlb/src/presentation/commentary.js';

const names = { a: 'Patrick Mahomes', b: 'Travis Kelce', c: 'Fred Warner', g1: 'Jeremy Swayman', s1: 'David Pastrnak', p1: 'Gerrit Cole', h1: 'Rafael Devers' };
const base = { name: id => names[id], last: id => names[id]?.split(' ').pop(), off: 'KC', def: 'SF', home: 'KC', away: 'SF', homeScore: 7, awayScore: 3, score: { off: 7, def: 3, home: 2, away: 1 }, quarter: 2, clock: 600, down: 3, distance: 4, spot: 'KC 40', losX: 50, period: 2, team: s => s.toUpperCase(), outs: 1, balls: 1, strikes: 2, runners: [1, 2, 3], inning: 5, half: 'top' };

test('commentary: reproducible per seed and varied across repeats', () => {
  const run = seed => { const c = createCommentary({ pack: NFL_COMMENTARY, seed }); return Array.from({ length: 6 }, () => c.describe({ type: 'PASS_COMPLETE', passer: 'a', receiver: 'b' }, base).text); };
  assert.deepEqual(run('x'), run('x'));
  assert.ok(new Set(run('x')).size >= 3, 'at least three different phrasings in six repeats');
});

test('commentary: NFL lines use real context (names, yards, priorities)', () => {
  const c = createCommentary({ pack: NFL_COMMENTARY, seed: 1 });
  const tk = c.describe({ type: 'TACKLE', by: 'c', carrier: 'b', x: 58 }, base);
  assert.match(tk.text, /(Warner|Kelce)/); assert.match(tk.text, /8 jardas/);
  const td = c.describe({ type: 'TOUCHDOWN', by: 'b', side: 'off' }, base);
  assert.equal(td.priority, 3); assert.equal(td.tone, 'score'); assert.match(td.text, /Kelce/);
  const it = c.describe({ type: 'INTERCEPTION', by: 'c', passer: 'a' }, base);
  assert.equal(it.tone, 'turnover');
  for (const t of ['SNAP', 'HANDOFF', 'SACK', 'INCOMPLETE', 'FUMBLE', 'FIRST_DOWN', 'TURNOVER_ON_DOWNS', 'FIELD_GOAL', 'FINAL']) {
    const l = c.describe({ type: t, to: 'b', qb: 'a', by: 'c', reason: 'DROP', good: true, carrier: 'b' }, base);
    assert.ok(l && l.text && !/undefined|NaN/.test(l.text), `${t} → ${l?.text}`);
  }
});

test('commentary: sequence memory (same receiver streak)', () => {
  const c = createCommentary({ pack: NFL_COMMENTARY, seed: 3, avoidRecent: 0 });
  const texts = Array.from({ length: 12 }, () => c.describe({ type: 'PASS_COMPLETE', passer: 'a', receiver: 'b' }, base).text);
  assert.ok(texts.slice(2).some(t => /De novo/.test(t)), 'streak line appears after repeated targets');
  assert.ok(!/De novo/.test(texts[0]));
});

test('commentary: NHL and MLB packs cover their event vocabularies without undefined', () => {
  const nhl = createCommentary({ pack: NHL_COMMENTARY, seed: 1 });
  for (const t of ['FACEOFF', 'PASS', 'ZONE_ENTRY', 'HIT', 'SHOT', 'SAVE', 'REBOUND', 'PENALTY', 'POWER_PLAY', 'GOAL', 'BLOCK', 'TAKEAWAY', 'PERIOD_START', 'FINAL']) {
    const l = nhl.describe({ type: t, winner: 's1', loser: 'g1', team: 'home', from: 's1', to: 's1', by: 's1', on: 's1', goalie: 'g1', shooter: 's1', minutes: 2, infraction: 'tripping', carried: true, period: 1, assists: [] }, base);
    assert.ok(l && !/undefined|NaN/.test(l.text), `${t} → ${l?.text}`);
  }
  const mlb = createCommentary({ pack: MLB_COMMENTARY, seed: 1 });
  for (const t of ['AT_BAT', 'PITCH', 'BALL', 'STRIKE', 'FOUL', 'CONTACT', 'HIT', 'HOME_RUN', 'STRIKEOUT', 'WALK', 'OUT', 'RUN_SCORES', 'INNING_START', 'FINAL']) {
    const l = mlb.describe({ type: t, batter: 'h1', pitcher: 'p1', by: 'h1', pitchType: 'SL', mph: 88, kind: t === 'CONTACT' ? 'fly' : t === 'OUT' ? 'flyout' : 'called', ev: 101, spray: 20, bases: 2, runs: 4, fielder: 'p1', runner: 'h1', team: 'away', half: 'top', inning: 5 }, base);
    assert.ok(l && !/undefined|NaN/.test(l.text), `${t} → ${l?.text}`);
  }
});

test('presentation: emits to listeners and stops after dispose', () => {
  const seen = []; const p = createPresentation({ sport: 'x', listeners: [{ onEvent: e => seen.push(e.type), dispose: () => seen.push('disposed') }] });
  p.emit({ type: 'A' }); p.dispose(); p.emit({ type: 'B' });
  assert.deepEqual(seen, ['A', 'disposed']);
});

test('speech: commentary forwards only high-priority lines to the speech adapter', () => {
  const said = []; const c = createCommentary({ pack: NFL_COMMENTARY, seed: 2, speech: { minPriority: 2, speak: t => said.push(t) } });
  c.describe({ type: 'HANDOFF', to: 'b' }, base); c.describe({ type: 'TOUCHDOWN', by: 'b', side: 'off' }, base);
  assert.equal(said.length, 1); assert.match(said[0], /Kelce|TOUCHDOWN/);
});
