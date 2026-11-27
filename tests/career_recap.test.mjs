// Post-game recap (core/career/recap.js): built only from facts of the save, persisted in c.x.recap, survives save -> load.
import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.fetch = async u => { const url = new URL(u); if (!url.protocol.startsWith('file')) throw new Error('offline'); const t = fs.readFileSync(url, 'utf8'); return { ok: true, text: async () => t, json: async () => JSON.parse(t) }; };
const A = await import('../core/career/api.js');
const { NHL_SPEC } = await import('../nhl/src/career/nhlSpec.js');

test('recap: a simulated user game is recorded with the real score, record change and consequences; persisted through save/load', async () => {
  const { career: c, spec } = await A.startCareer({ sport: 'nhl', role: 'COACH', team: 'BOS', difficulty: 1, seed: 'RECAP1' });
  assert.equal(A.getRecap(c), null, 'a new career has no recap');
  let guard = 0; while (!A.pendingGameDay(spec, c) && guard++ < 30) await A.advance(spec, c, 'NEXT_GAME', { includeUserGame: false, stopOnEvents: false, autoFix: true });
  assert.ok(A.pendingGameDay(spec, c), 'reached a game day');
  const before = A.recapSnapshot(spec, c), st0 = { ...c.standings.BOS };
  const r = await A.playUserGame(spec, c); assert.ok(r.ok);
  const rc = A.recordRecap(spec, c, before, r.played, 'sim');
  assert.ok(rc && rc.games.length === 1, 'one game');
  const g = rc.games[0], st1 = c.standings.BOS;
  assert.ok(Number.isFinite(g.us) && Number.isFinite(g.them) && g.us !== g.them);
  assert.equal(g.won, st1.w === st0.w + 1, 'win flag agrees with the standings');
  assert.equal(rc.record.before, before.record); assert.notEqual(rc.record.after, rc.record.before);
  for (const k of ['board', 'morale', 'fans', 'rep', 'cash']) assert.ok(rc.delta[k] === null || Number.isFinite(rc.delta[k]), k);
  assert.deepEqual(c.x.recap, rc);
  const json = JSON.parse(JSON.stringify(c)); assert.deepEqual(json.x.recap, rc, 'plain JSON (save-safe)');
  void NHL_SPEC;
});
test('recap: an advance without user games keeps the previous recap; snapshot is null without a team', async () => {
  const { career: c, spec } = await A.startCareer({ sport: 'nhl', role: 'COACH', team: 'TOR', difficulty: 1, seed: 'RECAP2' });
  const snap = A.recapSnapshot(spec, c); c.x.recap = { v: 1, keep: true };
  assert.equal(A.recordRecap(spec, c, snap, [{ day: 1, kind: 'SLATE', user: [] }]), null); assert.deepEqual(c.x.recap, { v: 1, keep: true });
  assert.equal(A.recordRecap(spec, c, null, []), null);
  assert.equal(A.recapSnapshot(spec, { ...c, role: 'PLAYER', players: c.players, me: null }), null);
});
