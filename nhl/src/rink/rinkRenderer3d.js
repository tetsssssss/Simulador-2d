// NHL renderer on the PlayCanvas stage: reads the SAME state the 2D rink renderer reads (state.players, state.puck, state.events) and draws it in 3D.
//   render(state, alpha, opts)  opts: { camera: PUCK|BROADCAST|TACTICAL|FULL, selected (id) }     pick(px,py) -> player object | null
import { createAthleteFactory, worldFromSim } from '../../../core/render3d/athletes.js';
import { createRink, rinkCamera, FT } from '../../../core/render3d/rinkScene.js';
import { replayStart, replayDue } from '../../../core/render3d/replayEvents.js';
import { followStep } from '../../../core/render3d/nflField.js';
import { createCrowdStands, rinkStands } from '../../../core/render3d/crowdStands.js';
import { parseColor } from '../../../core/render/spriteSheet.js';
import { skateGait } from '../../../core/anim/locomotion.js';

const lerp = (a, b, k) => a + (b - a) * k;
const SHOT_CLIP = { wrist: 'hk_wrist', snap: 'hk_snap', slap: 'hk_slap', backhand: 'hk_backhand', 'one-timer': 'hk_onetimer', onetimer: 'hk_onetimer' };
const GOALIE_CLIP = { READY: 'gk_ready', BUTTERFLY: 'gk_butterfly', SLIDE: 'gk_slide', GLOVE: 'gk_glove', BLOCKER: 'gk_blocker', PAD_SAVE: 'gk_pad_save', RECOVER: 'gk_recover' };
// Pure: the clip a skater / goalie should play now (action = {clip,t0,dur,token} or null). speed in ft/s.
export function skaterClip(p, act) {
  if (p.goalie) return { clip: GOALIE_CLIP[p.state] || 'gk_ready', loop: !p.state || p.state === 'READY' };
  if (act) return { clip: act.clip, loop: false, oneShot: true, token: act.token };
  const id = skateGait({ speed: Math.hypot(p.vx || 0, p.vy || 0) / 3, backwards: !!p.back, turning: !!p.cross });
  return { clip: id || 'mv_idle', loop: true };
}

export function createNhlRenderer3d(stage, { canvas3d, base = '/' } = {}) {
  const { pc } = stage, wrap = canvas3d.parentElement;
  let factory = null, rink = null, crowd = null, crowdKey = '', skaters = [], goalies = [], ready = false, initP = null, evIdx = 0, simRef = null, cam = null, last = 0, replaying = false, replayT = 0, puckE = null;
  const slot = new Map(), acts = new Map(), tint = new Map();
  const wall = () => performance.now() / 1000;

  let hdOn = stage.quality?.level !== 'low';   // LOD by quality (HD skater = 12 000 triangles, low-poly ~650)
  async function init() {
    factory = createAthleteFactory(stage, { base }); rink = createRink(stage);
    for (let i = 0; i < 12; i++) { const a = await factory.spawn('hockey', { hd: hdOn, name: 'sk' + i }); a.entity.enabled = false; skaters.push(a); }
    for (let i = 0; i < 2; i++) { const a = await factory.spawn('goalie', { name: 'gk' + i }); a.entity.enabled = false; goalies.push(a); }
    const m = new pc.StandardMaterial(); m.diffuse = new pc.Color(0.02, 0.02, 0.02); m.update(); puckE = new pc.Entity('puck'); puckE.addComponent('render', { type: 'cylinder', material: m, castShadows: true }); puckE.setLocalScale(0.2, 0.05, 0.2); stage.root.addChild(puckE); puckE.mat = m;
    ready = true;
  }
  function pump(state) {
    const ev = state.events || []; if (evIdx > ev.length) evIdx = 0;
    for (; evIdx < ev.length; evIdx++) {
      const e = ev[evIdx], t0 = state.t ?? 0;
      if (replaying && !replayDue(e, t0)) break;
      if (e.type === 'GOAL') crowd?.cheer(1);
      if (e.type === 'SHOT') acts.set(e.by, { clip: SHOT_CLIP[e.shotType] || 'hk_wrist', t0, dur: 0.6, token: `${t0}|shot` });
      else if (e.type === 'HIT') acts.set(e.by, { clip: 'hk_check', t0, dur: 0.45, token: `${t0}|hit` });
      else if (e.type === 'GOAL') { acts.set(e.by, { clip: 'gs_arms_up', t0, dur: 3, token: `${t0}|goal` }); for (const id of e.assists || []) acts.set(id?.id ?? id, { clip: 'gs_arms_up', t0, dur: 2.2, token: `${t0}|goal` }); }
    }
  }
  const actOf = (id, state) => { const A = acts.get(id); if (!A) return null; const k = ((state.t ?? 0) - A.t0) / A.dur; if (k < 0 || k > 1) { acts.delete(id); return null; } return A; };

  function render(state, alpha, opts = {}) {
    if (!ready) { initP ||= init().catch(e => console.error('3D NHL init failed', e)); return; }
    if (!state) return;
    if (opts.replay) {   // instant replay: a new state object per frame over a past interval -> follow the replay clock, never reset per frame
      if (!replaying || (state.t ?? 0) < replayT - 0.5) { replaying = true; acts.clear(); evIdx = replayStart(state.events, state.t ?? 0); }
      replayT = state.t ?? 0;
    } else if (replaying) { replaying = false; acts.clear(); simRef = state; evIdx = (state.events || []).length; }
    else if (state !== simRef) { simRef = state; evIdx = 0; acts.clear(); }
    pump(state);
    const now = wall(), dt = last ? Math.min(0.1, now - last) : 0; last = now; const k = Math.max(0, Math.min(1, alpha ?? 1));
    if (!crowd || crowdKey !== `${state.home?.color}|${state.away?.color}`) { crowd?.dispose(); crowdKey = `${state.home?.color}|${state.away?.color}`; const c = x => parseColor(x || '#244c8f').map(v => v / 255); crowd = createCrowdStands(stage, { ...rinkStands(undefined, undefined, undefined, { low: 0.5, medium: 0.8, high: 1 }[stage.quality?.level] || 0.8), home: c(state.home?.color), away: c(state.away?.color) }); }
    crowd.update(dt, now);
    const present = new Set(); let sk = 0, gk = 0;
    for (const p of state.players || []) {
      if (p.onBench) continue; present.add(p.id);
      let a = slot.get(p.id); if (!a) { const pool = p.goalie ? goalies : skaters; a = pool.find(x => !x.used) || null; if (!a) continue; a.used = true; a.pid = p.id; slot.set(p.id, a); a.entity.enabled = true; }
      const team = state[p.team] || {}, tk = `${team.color}|${team.color2}`; if (a.tk !== tk) { a.setTeam(team.color, team.color2); a.tk = tk; a.idk = ''; }
      if (a.idk !== `${p.num}|${p.last}`) { a.idk = `${p.num}|${p.last}`; a.setIdentity?.({ number: p.num, name: p.last, jersey: team.color }); }
      a.p = p; a.setPosition('nhl', lerp(p.px ?? p.x, p.x, k), lerp(p.py ?? p.y, p.y, k)); a.setFacing(p.facing || 0);
      const want = skaterClip(p, actOf(p.id, state));
      if (a.has(want.clip) && (want.oneShot ? a.token !== want.token : a.clip !== want.clip)) { a.play(want.clip, { loop: want.loop, blend: want.oneShot ? 0.06 : 0.15 }); a.token = want.token || null; }
    }
    for (const [id, a] of slot) if (!present.has(id)) { a.used = false; a.entity.enabled = false; a.p = null; slot.delete(id); }
    // puck: in front of the carrier, else its own position
    const pk = state.puck, ow = pk?.owner ? state.players.find(p => p.id === pk.owner) : null; let bx = 100;
    if (pk) { let x, y; if (ow) { x = lerp(ow.px ?? ow.x, ow.x, k) + Math.cos(ow.facing || 0) * 2.2; y = lerp(ow.py ?? ow.y, ow.y, k) + Math.sin(ow.facing || 0) * 2.2; } else { x = lerp(pk.px ?? pk.x, pk.x, k); y = lerp(pk.py ?? pk.y, pk.y, k); }
      if (Number.isFinite(x + y)) { bx = x; const w = worldFromSim('nhl', x, y, 0.03 + (ow ? 0 : (pk.z || 0) * FT)); puckE.setPosition(...w); } }
    const r = rinkCamera(opts.camera || 'BROADCAST', bx);
    if (!cam) cam = { pos: r.pos.slice(), look: r.look.slice() }; else { cam.pos = followStep(cam.pos, r.pos, dt, 0.35); cam.look = followStep(cam.look, r.look, dt, 0.25); }
    stage.camera.setPosition(...cam.pos); stage.camera.lookAt(...cam.look);
  }
  const tmp = new pc.Vec3(), scr = new pc.Vec3();
  const project = (a, h = 1.1) => { const q = a.entity.getPosition(); tmp.set(q.x, q.y + h, q.z); stage.camera.camera.worldToScreen(tmp, scr); return scr.z > 0 ? { x: scr.x, y: scr.y } : null; };
  return {
    render,
    pick(px, py) { let best = null, bd = 34; for (const a of [...skaters, ...goalies]) { if (!a.p) continue; const s = project(a); if (!s) continue; const d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; best = a.p; } } return best; },
    screenOf(id) { const a = slot.get(id); return a ? project(a) : null; },
    beginReplay(sim) { replaying = true; simRef = sim; evIdx = 0; acts.clear(); }, endReplay(sim) { replaying = false; acts.clear(); evIdx = (sim?.events || []).length; },
    async setQuality(level) {
      const want = level !== 'low'; if (!ready || want === hdOn) return; hdOn = want; ready = false; const old = skaters; skaters = [];
      for (let i = 0; i < 12; i++) { const a = await factory.spawn('hockey', { hd: hdOn, name: 'sk' + i }); a.entity.enabled = false; skaters.push(a); }
      old.forEach(a => a.dispose()); for (const [id, a] of slot) if (!a.pid || old.includes(a)) slot.delete(id); goalies.forEach(a => { if (!a.p) a.used = false; }); simRef = null; ready = true;
    },
    get hd() { return hdOn; }, crowdSeats: () => crowd?.seats || 0,
    replayInfo: () => ({ replaying, evIdx, t: replayT }),
    get ready() { return ready; }, athletes: () => [...skaters, ...goalies].filter(a => a.p), cameraState: () => (cam ? { pos: cam.pos.slice(), look: cam.look.slice(), replaying } : null),
    dispose() { crowd?.dispose(); rink?.dispose(); puckE?.destroy(); puckE?.mat?.destroy(); [...skaters, ...goalies].forEach(a => a.dispose()); skaters = []; goalies = []; factory?.dispose(); },
  };
}
