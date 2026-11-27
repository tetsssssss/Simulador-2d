// Minimal WebSocket (RFC 6455) server on top of node:http — text frames only, no dependencies.
// Enough for a local game-state stream to the Unreal client. Not a general-purpose library (no extensions, no fragmentation of outgoing frames).
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const acceptKey = key => createHash('sha1').update(key + GUID).digest('base64');

// Server -> client frame (never masked). opcode 1 = text, 8 = close, 10 = pong.
export function encodeFrame(data, opcode = 1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'), n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([head, payload]);
}

// Client -> server frames (masked). Returns { frames: [{ opcode, payload }], rest } — `rest` is an incomplete tail to keep for the next chunk.
export function decodeFrames(buf) {
  const frames = []; let o = 0;
  while (buf.length - o >= 2) {
    const b0 = buf[o], b1 = buf[o + 1], opcode = b0 & 15, masked = !!(b1 & 128); let len = b1 & 127, p = o + 2;
    if (len === 126) { if (buf.length - p < 2) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (buf.length - p < 8) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    const mask = masked ? buf.subarray(p, p + 4) : null; if (masked) p += 4;
    if (buf.length - p < len) break;
    const payload = Buffer.from(buf.subarray(p, p + len)); if (mask) for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
    frames.push({ opcode, payload }); o = p + len;
  }
  return { frames, rest: buf.subarray(o) };
}

// attach(httpServer, onConnection): onConnection(ws) with ws.send(text), ws.close(), ws.on('message', text), ws.on('close').
export function attachWebSocketServer(server, onConnection, path = '/') {
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || (path !== '*' && req.url.split('?')[0] !== path)) { socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return; }
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${acceptKey(key)}`, '', ''].join('\r\n'));
    const ws = new EventEmitter(); let rest = Buffer.alloc(0), closed = false;
    ws.send = text => { if (!closed && !socket.destroyed) socket.write(encodeFrame(text)); };
    ws.close = () => { if (!closed) { closed = true; try { socket.write(encodeFrame(Buffer.alloc(0), 8)); } catch { /* gone */ } socket.end(); } };
    socket.on('data', chunk => {
      const r = decodeFrames(Buffer.concat([rest, chunk])); rest = r.rest;
      for (const f of r.frames) {
        if (f.opcode === 1) ws.emit('message', f.payload.toString('utf8'));
        else if (f.opcode === 8) ws.close();
        else if (f.opcode === 9 && !socket.destroyed) socket.write(encodeFrame(f.payload, 10));   // ping -> pong
      }
    });
    socket.on('close', () => { closed = true; ws.emit('close'); });
    socket.on('error', () => { closed = true; });
    onConnection(ws, req);
  });
}
