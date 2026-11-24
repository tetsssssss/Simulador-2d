// MLB renderer on the PlayCanvas stage: reads the SAME state the 2D renderer reads (state.fielders / batter / runners / ball / events) and draws it in 3D.
//   render(state, alpha, opts)  opts: { camera: BROADCAST|BATTER|PITCHER|INFIELD|BALL|TACTICAL|FULL, selected }     pick(px,py) -> entity | null
import { createAthleteFactory, worldFromSim } from '../../../core/render3d/athletes.js';
import { createDiamond, diamondCamera, FT } from '../../../core/render3d/diamondScene.js';
import { followStep } from '../../../core/render3d/nflField.js';
import { createCrowdStands, arcStands } from '../../../core/render3d/crowdStands.js';
import { parseColor } from '../../../core/render/spriteSheet.js';
import { runGait } from '../../../core/anim/locomotion.js';

const lerp = (a, b, k) => a + (b - a) * k;
const ACTION_CLIP = { swing: 'bb_swing', dive: 'ps_catch_diving', celebrate: 'gs_arms_up', catch: 'ps_catch_hands' };
// Pure: clip for one player. e: entity, role: pitcher|batter|runner|catcher|fielder, speed in yards/s (as the 2D gait), act: {type,token} | null.
export function playerClip(e, role, { speed = 0, hasBall = false } = {}, act = null) {
  if (act) { const clip = act.type === 'throw' ? (role === 'pitcher' ? 'bb_pitch' : 'qb_overhand') : ACTION_CLIP[act.type]; if (clip) return { clip, loop: false, oneShot: true, token: act.token }; }
  const g = runGait({ speed, carrying: hasBall });
  if (g) return { clip: g, loop: true };
  return { clip: role === 'batter' ? 'bb_stance' : role === 'catcher' ? 'mv_athletic_ready' : 'mv_idle', loop: true };
}
export const roleOf = (e, kind) => e.role || (kind === 'batter' ? 'batter' : kind === 'runner' ? 'runner' : e.pos === 'P' ? 'pitcher' : e.pos === 'C' ? 'catcher' : 'fielder');

export function createMlbRenderer3d(stage, { canvas3d, base = '/' } = {}) {
  const { pc } = stage;
  let factory = null, field = null, crowd = null, crowdKey = '', pool = [], ready = false, initP = null, evIdx = 0, simRef = null, cam = null, last = 0, replaying = false, ballE = null;
  const slot = new Map(), acts = new Map(), wall = () => performance.now() / 1000;
  async function init() {
    factory = createAthleteFactory(stage, { base }); field = createDiamond(stage);
    for (let i = 0; i < 15; i++) { const a = await factory.spawn('baseball', { name: 'p' + i }); a.entity.enabled = false; pool.push(a); }
    const m = new pc.StandardMaterial(); m.diffuse = new pc.Color(1, 1, 1); m.update(); ballE = new pc.Entity('ball'); ballE.addComponent('render', { type: 'sphere', material: m, castShadows: true }); ballE.setLocalScale(0.16, 0.16, 0.16); stage.root.addChild(ballE); ballE.mat = m;
    ready = true;
  }
  function pump(state) {
    const ev = state.events || []; if (evIdx > ev.length) evIdx = 0;
    for (; evIdx < ev.length; evIdx++) {
      const e = ev[evIdx], t0 = state.t ?? 0; if (replaying && e.t > t0) break;
      const set = (id, type, dt0, dur) => acts.set(id, { type, t0: t0 + dt0, dur, token: `${t0}|${type}|${id}` });
      if (e.type === 'PITCH') { set(e.pitcher, 'throw', 0, 0.85); if (e.decision && e.decision !== 'TAKE') set(e.batter, 'swing', 0.45, 0.55); }
      else if (e.type === 'PICKOFF_ATTEMPT') { set(e.pitcher, 'throw', 0, 0.7); set(e.runner, 'dive', 0.3, 0.7); }
      else if (e.type === 'HOME_RUN') { set(e.by, 'celebrate', 0, 3); crowd?.cheer(1); }
      else if (e.type === 'RUN_SCORES') { set(e.runner, 'celebrate', 0, 1.6); crowd?.cheer(0.6); }
    }
  }
  const actOf = (id, state) => { const A = acts.get(id); if (!A) return null; const k = ((state.t ?? 0) - A.t0) / A.dur; if (k < 0) return null; if (k > 1) { acts.delete(id); return null; } return A; };

  function render(state, alpha, opts = {}) {
    if (!ready) { initP ||= init().catch(e => console.error('3D MLB init failed', e)); return; }
    if (!state) return; if (state !== simRef) { simRef = state; evIdx = 0; acts.clear(); } pump(state);
    const now = wall(), dt = last ? Math.min(0.1, now - last) : 0; last = now; const k = Math.max(0, Math.min(1, alpha ?? 1));
    if (!crowd || crowdKey !== `${state.home?.color}|${state.away?.color}`) { crowd?.dispose(); crowdKey = `${state.home?.color}|${state.away?.color}`; const c = x => parseColor(x || '#244c8f').map(v => v / 255); crowd = createCrowdStands(stage, { ...arcStands(undefined, { low: 0.5, medium: 0.8, high: 1 }[stage.quality?.level] || 0.8), home: c(state.home?.color), away: c(state.away?.color) }); }
    crowd.update(dt, now);
    const items = [...(state.fielders || []).map(e => [e, 'fielder']), ...(state.batter ? [[state.batter, 'batter']] : []), ...(state.runners || []).map(e => [e, 'runner'])];
    const present = new Set();
    for (const [e, kind] of items) {
      if (!e || e.id == null) continue; present.add(e.id);
      let a = slot.get(e.id); if (!a) { a = pool.find(x => !x.used); if (!a) continue; a.used = true; slot.set(e.id, a); a.entity.enabled = true; }
      const team = state[e.team] || {}, tk = `${team.color}|${team.color2}`; if (a.tk !== tk) { a.setTeam(team.color, team.color2); a.tk = tk; }
      const px = e.px ?? e.x, py = e.py ?? e.y; a.e = e; a.setPosition('mlb', lerp(px, e.x, k), lerp(py, e.y, k)); a.setFacing(e.facing ?? 0);
      const role = roleOf(e, kind), speed = (Math.hypot(e.x - px, e.y - py) * 30) / 3, want = playerClip(e, role, { speed, hasBall: state.ball?.holder === e.id }, actOf(e.id, state));
      if (a.has(want.clip) && (want.oneShot ? a.token !== want.token : a.clip !== want.clip)) { a.play(want.clip, { loop: want.loop, blend: want.oneShot ? 0.06 : 0.15 }); a.token = want.token || null; }
    }
    for (const [id, a] of slot) if (!present.has(id)) { a.used = false; a.entity.enabled = false; a.e = null; slot.delete(id); }
    const b = state.ball; let bp = null;
    if (!b || b.hidden) ballE.enabled = false;
    else { const h = b.holder ? slot.get(b.holder) : null; ballE.enabled = true;
      if (h?.e) { const p = h.entity.getPosition(); ballE.setPosition(p.x, 1.2, p.z); bp = { x: h.e.x, y: h.e.y, z: 1 }; }
      else { const x = lerp(b.px ?? b.x, b.x, k), y = lerp(b.py ?? b.y, b.y, k), z = Math.max(0, lerp(b.pz ?? b.z ?? 0, b.z ?? 0, k)); ballE.setPosition(...worldFromSim('mlb', x, y, 0.1 + z * FT)); bp = { x, y, z }; } }
    const r = diamondCamera(opts.camera || 'BROADCAST', bp && state.phase === 'PLAY' ? { ...bp, hidden: false } : null);
    if (!cam) cam = { pos: r.pos.slice(), look: r.look.slice() }; else { cam.pos = followStep(cam.pos, r.pos, dt, 0.5); cam.look = followStep(cam.look, r.look, dt, 0.35); }
    stage.camera.setPosition(...cam.pos); stage.camera.lookAt(...cam.look);
  }
  const tmp = new pc.Vec3(), scr = new pc.Vec3();
  const project = (a, h = 1.1) => { const q = a.entity.getPosition(); tmp.set(q.x, q.y + h, q.z); stage.camera.camera.worldToScreen(tmp, scr); return scr.z > 0 ? { x: scr.x, y: scr.y } : null; };
  return {
    render,
    pick(px, py) { let best = null, bd = 34; for (const a of pool) { if (!a.e) continue; const s = project(a); if (!s) continue; const d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; best = a.e; } } return best; },
    beginReplay(sim) { replaying = true; simRef = sim; evIdx = 0; acts.clear(); }, endReplay(sim) { replaying = false; acts.clear(); evIdx = (sim?.events || []).length; },
    get ready() { return ready; }, crowdSeats: () => crowd?.seats || 0, athletes: () => pool.filter(a => a.e), cameraState: () => (cam ? { pos: cam.pos.slice(), look: cam.look.slice(), replaying } : null),
    dispose() { crowd?.dispose(); field?.dispose(); ballE?.destroy(); ballE?.mat?.destroy(); pool.forEach(a => a.dispose()); pool = []; factory?.dispose(); },
  };
}
