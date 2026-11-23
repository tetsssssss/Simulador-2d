// Local simulation server for the 3D client:   node tools/unreal/sim_server.mjs [port=8765]
// The client connects to ws://127.0.0.1:<port>/ and sends { "type":"start", "sport":"nfl", "home":"SEA", "away":"NE", "seed":"x", "speed":1 }.
// Only NFL is streamed so far (NHL / MLB adapters are the next step). Localhost only: nothing is exposed to the network.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attachWebSocketServer } from './ws.mjs';
import { decodeClient, encode } from './protocol.mjs';
import { createNflSession } from './nfl_stream.mjs';
import { parseCSV, normalizePlayer } from '../../nfl/src/dataService.js';

const HZ = 30;
let rosterCache = null;
export const loadNflRoster = () => (rosterCache ||= parseCSV(readFileSync(fileURLToPath(new URL('../../nfl/data/roster_2026.csv', import.meta.url)), 'utf8')).map(normalizePlayer).filter(p => p.full_name && p.team));

export function startServer({ port = 8765, host = '127.0.0.1', roster = loadNflRoster } = {}) {
  const http = createServer((req, res) => { res.writeHead(426, { 'content-type': 'text/plain' }); res.end('ASU simulation server: connect with a WebSocket client.\n'); });
  attachWebSocketServer(http, ws => {
    let session = null, timer = null, speed = 1, paused = false, acc = 0;
    const stop = () => { clearInterval(timer); timer = null; session = null; };
    const pump = () => {   // every 1/HZ s of wall time advance `speed` ticks (a tick = 1/HZ s of game time)
      if (!session || paused) return; acc += speed;
      while (acc >= 1 && session) { acc -= 1; for (const m of session.next()) ws.send(encode(m)); if (session?.done) { stop(); break; } }
    };
    ws.on('message', text => {
      const m = decodeClient(text);
      if (m.type === 'error') return ws.send(encode({ type: 'error', error: m.error }));
      if (m.type === 'ping') return ws.send(encode({ type: 'pong' }));
      if (m.type === 'start') {
        if (m.sport !== 'nfl') return ws.send(encode({ type: 'error', error: `sport "${m.sport}" is not streamed yet (only nfl)` }));
        stop(); speed = m.speed; paused = false; acc = 0;
        try { session = createNflSession({ roster: roster(), home: m.home, away: m.away, seed: m.seed }); } catch (e) { return ws.send(encode({ type: 'error', error: String(e.message || e) })); }
        timer = setInterval(pump, 1000 / HZ);
      } else if (m.type === 'pause') paused = true; else if (m.type === 'resume') paused = false; else if (m.type === 'speed') speed = m.speed; else if (m.type === 'stop') stop();
    });
    ws.on('close', stop);
  });
  return new Promise(resolve => http.listen(port, host, () => resolve({ port: http.address().port, close: () => new Promise(r => http.close(r)) })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer({ port: +process.argv[2] || 8765 });
  console.log(`ASU simulation server: ws://127.0.0.1:${port}/   (Ctrl+C to stop)`);
}
