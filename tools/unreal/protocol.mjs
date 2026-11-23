// Message protocol between the JS simulation (this repo) and a 3D client (Unreal). JSON text frames, one message per frame. PROTOCOL_VERSION bumps on breaking changes.
//   server -> client                                                           client -> server
//   hello       { protocol, sport, hz, units, axes }                            start { sport:'nfl', home, away, seed, speed }
//   play_start  { play, down, distance, losX, call, roster:[{id,name,jersey,pos,team,side,slot}] }   pause / resume
//   tick        { t, ents:[{id,x,y,vx,vy,f,down,clip}], ball:{x,y,z,holder}, events:[...] }          speed { speed }
//   play_end    { result, text, notes, score, clock, quarter, down, distance, ballOn }                stop
//   game_over   { score }                                                                                      ping -> pong
// Units: NFL field in YARDS (x downfield 0..120 incl. end zones, y across 0..53.33); facing f in radians (0 = +x). Unreal: 1 yard = 91.44 cm.
export const PROTOCOL_VERSION = 1;
export const YARD_TO_CM = 91.44;
const r2 = n => Math.round(n * 100) / 100;

export function hello(sport, hz = 30) {
  return { type: 'hello', protocol: PROTOCOL_VERSION, sport, hz, units: { nfl: 'yards', yardToCm: YARD_TO_CM }, axes: { x: 'downfield 0..120 (end zones included)', y: 'across 0..53.33', facing: 'radians, 0 = +x' } };
}
export function playStart(sim, g, who) {
  return {
    type: 'play_start', play: g.playNo + 1, down: sim.down, distance: sim.distance, losX: sim.losX, ballOn: g.ballOn,
    call: { type: sim.call.playType, concept: sim.call.concept, defense: sim.call.defLabel },
    roster: sim.ents.map(e => ({ id: e.id, name: who[e.id]?.name || e.name || e.id, jersey: e.jersey ?? e.p?.jersey_number ?? null, pos: e.p?.position || e.slot, team: who[e.id]?.team || null, side: e.side, slot: e.slot })),
  };
}
// `clipOf(entity)` -> clip id or null (locomotion / action chosen by the caller); `events` = events since the previous tick.
export function tick(sim, events = [], clipOf = () => null) {
  const b = sim.ball;
  return {
    type: 'tick', t: r2(sim.t),
    ents: sim.ents.map(e => ({ id: e.id, x: r2(e.pos.x), y: r2(e.pos.y), vx: r2(e.vel?.x || 0), vy: r2(e.vel?.y || 0), f: r2(e.facing || 0), down: !!e.down, clip: clipOf(e) })),
    ball: b ? { x: r2(b.pos.x), y: r2(b.pos.y), z: r2(b.z || 0), holder: sim.carrier ? sim.carrier.id : null } : (sim.carrier ? { x: r2(sim.carrier.pos.x), y: r2(sim.carrier.pos.y), z: 1, holder: sim.carrier.id } : null),
    events,
  };
}
export const encode = msg => JSON.stringify(msg);
export function decodeClient(text) {
  let m; try { m = JSON.parse(text); } catch { return { type: 'error', error: 'invalid json' }; }
  if (!m || typeof m.type !== 'string') return { type: 'error', error: 'missing type' };
  if (m.type === 'start') return { type: 'start', sport: String(m.sport || 'nfl'), home: String(m.home || 'SEA'), away: String(m.away || 'NE'), seed: String(m.seed || 'unreal'), speed: Math.max(0.25, Math.min(16, +m.speed || 1)) };
  if (m.type === 'speed') return { type: 'speed', speed: Math.max(0.25, Math.min(16, +m.speed || 1)) };
  return ['pause', 'resume', 'stop', 'ping'].includes(m.type) ? { type: m.type } : { type: 'error', error: `unknown type ${String(m.type).slice(0, 20)}` };
}
