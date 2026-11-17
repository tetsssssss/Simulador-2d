import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommentary } from '../core/commentary/commentaryEngine.js';
import { commentaryPack, packLocales } from '../core/commentary/packs.js';

const names = { s1: 'Alex Stone', g1: 'Sam Keeper', h1: 'Bo Ruiz', p1: 'Cal Reed' };
const ctx = {
  name: id => names[id] || 'Alex Stone', last: id => (names[id] || 'Alex Stone').split(' ')[1], team: s => (s === 'home' ? 'HOME' : 'AWAY'),
  score: { home: 3, away: 2, off: 3, def: 2 }, off: 'HOME', def: 'AWAY', home: 'HOME', away: 'AWAY', homeScore: 3, awayScore: 2,
  down: 3, distance: 7, spot: 'AWAY 35', redZone: false, quarter: 2, clock: 400, period: 2, inning: 5, outs: 1, balls: 2, strikes: 1, runners: [1], qbId: 's1', losX: 30, prevDown: 3,
};
const PT_WORDS = /\b(para|com|não|jogo|bola|disco|corrida|defesa|pelo|pela|uma|sai|vence|fim)\b/i;
const ev = (type, i) => ({
  type, winner: 's1', loser: 'g1', team: i % 2 ? 'home' : 'away', from: 's1', to: 'h1', by: 's1', on: 'h1', goalie: 'g1', shooter: 's1', minutes: 2, infraction: 'tripping', carried: !!(i % 2), period: 1,
  assists: ['h1'], passer: 's1', target: 'h1', receiver: 'h1', carrier: 'h1', qb: 'p1', id: 's1', x: 30 + i * 6, airYards: [4, 30, 12][i % 3], reason: ['DROP', 'BREAKUP', 'DEFLECTED', 'OVERTHROWN'][i % 4],
  side: 'off', lost: !!(i % 2), batter: 'h1', pitcher: 'p1', pitchType: 'SL', mph: 88 + i * 3, kind: ['called', 'fly', 'groundout', 'ground', 'swinging', 'line'][i % 6], ev: 90 + i * 4, spray: [-20, 0, 20][i % 3],
  bases: 1 + (i % 3), runs: 1 + (i % 4), fielder: 'p1', runner: 'h1', half: i % 2 ? 'top' : 'bottom', inning: 1 + i, quarter: 1 + (i % 4), result: i % 2 ? 'OUT' : 'SAFE', decision: ['STEAL', 'TAG_UP', 'HOLD'][i % 3], base: 2 + (i % 2), lob: i % 3,
});

for (const sport of ['nfl', 'nhl', 'mlb']) {
  test(`${sport}: en-US pack covers every pt-BR event type, is marked en-US and never leaks Portuguese/undefined`, () => {
    const pt = commentaryPack(sport, 'pt-BR'), en = commentaryPack(sport, 'en-US');
    assert.equal(en.$lang, 'en-US'); assert.notEqual(pt, en);
    for (const k of Object.keys(pt).filter(k => !k.startsWith('$'))) assert.ok(Array.isArray(en[k]) && en[k].length, `en pack lacks ${k}`);
    const c = createCommentary({ pack: en, seed: 7 });
    assert.equal(c.lang, 'en-US');
    for (const k of Object.keys(en).filter(k => !k.startsWith('$'))) for (let i = 0; i < 24; i++) {
      const l = c.describe(ev(k, i), ctx);
      if (l) assert.ok(!/undefined|NaN|\[object/.test(l.text) && !PT_WORDS.test(l.text), `${sport}/${k}: ${l.text}`);
    }
  });
}
test('commentaryPack: unknown locale falls back to pt-BR, es-* maps to its base, unknown sport throws', () => {
  assert.equal(commentaryPack('nfl', 'fr-FR').$lang ?? 'pt-BR', 'pt-BR');
  assert.equal(commentaryPack('nhl', 'en-GB').$lang, 'en-US');
  assert.deepEqual(packLocales('mlb').sort(), ['en-US', 'pt-BR']);
  assert.throws(() => commentaryPack('nba'));
});

test('story hook: milestones are appended (2nd goal, hat trick) in both languages; names are introduced in full once', () => {
  for (const [loc, second, hat] of [['pt-BR', /Segundo gol/, /HAT TRICK/], ['en-US', /Second goal/, /HAT TRICK/]]) {
    const c = createCommentary({ pack: commentaryPack('nhl', loc), seed: 3 });
    const out = [1, 2, 3].map(() => c.describe({ type: 'GOAL', by: 's1', team: 'home', assists: [] }, ctx).text);
    assert.ok(second.test(out[1]) && hat.test(out[2]), out.join(' | ')); assert.ok(!/Segundo|Second|HAT/.test(out[0]));
  }
  const c = createCommentary({ pack: commentaryPack('nhl', 'en-US'), seed: 5 }), a = c.describe({ type: 'SHOT', by: 's1', team: 'home' }, ctx).text, b = c.describe({ type: 'SHOT', by: 's1', team: 'home' }, ctx).text;
  assert.ok(a.includes('Alex Stone') && !b.includes('Alex Stone') && b.includes('Stone'), `${a} | ${b}`);
});
