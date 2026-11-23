// Simulation stream for the 3D client: WebSocket framing, protocol shape, an NFL game as messages, and a live server round trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFrame, decodeFrames, acceptKey } from '../tools/unreal/ws.mjs';
import { decodeClient, hello, PROTOCOL_VERSION, YARD_TO_CM } from '../tools/unreal/protocol.mjs';
import { createNflSession } from '../tools/unreal/nfl_stream.mjs';
import { startServer } from '../tools/unreal/sim_server.mjs';
import { roster } from '../nfl/tests/fixtures.mjs';

test('websocket: accept key matches the RFC 6455 example; frames round-trip at every length class, masked client frames decode, partial input is kept', () => {
  assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  for (const n of [0, 5, 125, 126, 300, 65535, 70000]) { const s = 'x'.repeat(n), f = encodeFrame(s); const d = decodeFrames(f); assert.equal(d.frames.length, 1); assert.equal(d.frames[0].payload.toString(), s); assert.equal(d.rest.length, 0); }
  const mask = Buffer.from([1, 2, 3, 4]), msg = Buffer.from('{"type":"ping"}'), body = Buffer.from(msg.map((b, i) => b ^ mask[i & 3]));
  const masked = Buffer.concat([Buffer.from([0x81, 0x80 | msg.length]), mask, body]);
  assert.equal(decodeFrames(masked).frames[0].payload.toString(), '{"type":"ping"}');
  const half = decodeFrames(masked.subarray(0, 6)); assert.equal(half.frames.length, 0); assert.equal(half.rest.length, 6);
  const two = decodeFrames(Buffer.concat([masked, masked])); assert.equal(two.frames.length, 2);
});

test('protocol: client messages are validated and clamped; hello declares version, units and axes', () => {
  assert.equal(decodeClient('nope').type, 'error'); assert.equal(decodeClient('{"a":1}').type, 'error'); assert.equal(decodeClient('{"type":"rm -rf"}').type, 'error');
  const s = decodeClient('{"type":"start","home":"KC","speed":999}'); assert.deepEqual([s.type, s.sport, s.home, s.away, s.speed], ['start', 'nfl', 'KC', 'NE', 16]);
  assert.equal(decodeClient('{"type":"speed","speed":0}').speed, 1); assert.equal(decodeClient('{"type":"pause"}').type, 'pause');
  const h = hello('nfl'); assert.equal(h.protocol, PROTOCOL_VERSION); assert.equal(h.units.yardToCm, YARD_TO_CM); assert.ok(h.axes.facing);
});

test('NFL session: hello, then play_start with 22 named athletes, ticks with finite numbers, events once, play_end with result and score; same seed = same stream', () => {
  const run = seed => { const s = createNflSession({ roster: roster(), seed, quarterMin: 4 }), msgs = []; for (let i = 0; i < 4000 && !s.done; i++) msgs.push(...s.next()); return { msgs, s }; };
  const { msgs } = run('ST-1');
  assert.equal(msgs[0].type, 'hello'); assert.equal(msgs[1].type, 'play_start'); assert.equal(msgs[1].roster.length, 22);
  assert.ok(msgs[1].roster.every(r => r.id && r.name && r.side && r.slot)); assert.equal(new Set(msgs[1].roster.map(r => r.id)).size, 22);
  const ticks = msgs.filter(m => m.type === 'tick'); assert.ok(ticks.length > 60);
  for (const t of ticks) { assert.equal(t.ents.length, 22); for (const e of t.ents) assert.ok(Number.isFinite(e.x + e.y + e.vx + e.vy + e.f), JSON.stringify(e)); }
  assert.ok(ticks.some(t => t.ents.some(e => e.clip && e.clip.startsWith('mv_'))), 'locomotion clips are hinted');
  const evTypes = ticks.flatMap(t => t.events.map(e => e.type)); assert.ok(evTypes.includes('SNAP') || evTypes.includes('HANDOFF')); assert.equal(evTypes.filter(t => t === 'WHISTLE').length, msgs.filter(m => m.type === 'play_end').length);
  const end = msgs.find(m => m.type === 'play_end'); assert.ok(end.result.outcome && end.text && end.score && end.clock);
  assert.doesNotThrow(() => JSON.stringify(msgs));
  const again = run('ST-1').msgs; assert.deepEqual(again.slice(0, 200), msgs.slice(0, 200));
  assert.notDeepEqual(run('ST-2').msgs.slice(1, 3), msgs.slice(1, 3));
});

test('NFL session: a whole game ends with game_over, after which next() is empty', () => {
  const s = createNflSession({ roster: roster(), seed: 'FULL', quarterMin: 3 }); let over = false, n = 0;
  while (!s.done && n++ < 400000) for (const m of s.next()) if (m.type === 'game_over') over = true;
  assert.ok(over && s.done); assert.deepEqual(s.next(), []);
});

test('live server: a WebSocket client starts a game at high speed and receives hello → play_start → ticks → play_end; pause stops the flow; bad input gets an error', async () => {
  const srv = await startServer({ port: 0, roster }); const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/`), got = [];
  try {
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = e => got.push(JSON.parse(e.data));
    ws.send('{"type":"start","sport":"nfl","home":"SEA","away":"NE","seed":"live","speed":16}');
    for (let i = 0; i < 100 && !got.some(m => m.type === 'play_end'); i++) await new Promise(r => setTimeout(r, 50));
    assert.deepEqual(got.slice(0, 2).map(m => m.type), ['hello', 'play_start']); assert.ok(got.some(m => m.type === 'tick') && got.some(m => m.type === 'play_end'));
    ws.send('{"type":"pause"}'); await new Promise(r => setTimeout(r, 120)); const n = got.length; await new Promise(r => setTimeout(r, 200)); assert.equal(got.length, n, 'no messages while paused');
    ws.send('{"type":"start","sport":"nba"}'); await new Promise(r => setTimeout(r, 100)); assert.equal(got.at(-1).type, 'error'); assert.match(got.at(-1).error, /not streamed/);
    ws.send('garbage'); await new Promise(r => setTimeout(r, 100)); assert.equal(got.at(-1).error, 'invalid json');
  } finally { ws.close(); await srv.close(); }
});
