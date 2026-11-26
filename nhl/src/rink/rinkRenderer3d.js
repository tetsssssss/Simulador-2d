// NHL renderer on the PlayCanvas stage: reads the SAME state the 2D rink renderer reads (state.players, state.puck, state.events) and draws it in 3D.
//   render(state, alpha, opts)  opts: { camera: PUCK|BROADCAST|TACTICAL|FULL, selected (id) }     pick(px,py) -> player object | null
import { createProps } from '../../../core/render3d/props.js';
import { createAthleteFactory, worldFromSim } from '../../../core/render3d/athletes.js';
import { createRink, rinkCamera, FT } from '../../../core/render3d/rinkScene.js';
import { replayStart, replayDue } from '../../../core/render3d/replayEvents.js';
import { followStep } from '../../../core/render3d/nflField.js';
import { createCrowdStands, rinkStands } from '../../../core/render3d/crowdStands.js';
import { parseColor } from '../../../core/render/spriteSheet.js';
import { skateGait } from '../../../core/anim/locomotion.js';
// benches: far side (outside the boards at z = -width), home then away, centred on the red line (world metres)
const BENCH_LEN = 6.4, BENCH_Z = -85 * FT - 0.55, BENCH_X = [75 * FT - 3.2, 125 * FT - 3.2];   // same bench doors as the engine (x 75 / 125 ft)

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
  let factory = null, rink = null, crowd = null, crowdKey = '', skaters = [], goalies = [], ready = false, initP = null, evIdx = 0, simRef = null, cam = null, last = 0, replaying = false, replayT = 0, puckE = null, props = null;
  const slot = new Map(), acts = new Map(), tint = new Map();
  const wall = () => performance.now() / 1000;

  let hdOn = stage.quality?.level !== 'low'; const benchEnts = [], benchPool = []; let benchMat = null, benchKey = '';   // LOD by quality (HD skater = 12 000 triangles, low-poly ~650)
  async function init() {
    factory = createAthleteFactory(stage, { base }); rink = createRink(stage);
    for (let i = 0; i < 12; i++) { const a = await factory.spawn('hockey', { hd: hdOn, name: 'sk' + i }); a.entity.enabled = false; skaters.push(a); }
    for (let i = 0; i < 2; i++) { const a = await factory.spawn('goalie', { hd: hdOn, name: 'gk' + i }); a.entity.enabled = false; goalies.push(a); }
    props = createProps(stage); puckE = props.puck(); stage.root.addChild(puckE);
    // player benches on the far side (both teams, like the NHL): a dark bench per team + up to 6 reserves each (low-poly, cheap),
    // filled from the players the engine has on the bench (p.onBench) — presentation only.
    { const { pc } = stage, m = new pc.StandardMaterial(); m.diffuse = new pc.Color(0.08, 0.09, 0.11); m.update(); benchMat = m;
      for (const [i, x0] of BENCH_X.entries()) { const e = new pc.Entity('bench' + i); e.addComponent('render', { type: 'box', material: m, castShadows: false }); e.setLocalScale(BENCH_LEN, 0.45, 0.5); e.setPosition(x0 + BENCH_LEN / 2, 0.22, BENCH_Z - 0.35); stage.root.addChild(e); benchEnts.push(e); }
      for (let i = 0; i < 12; i++) { const a = await factory.spawn('hockey', { hd: false, name: 'bn' + i }); a.entity.enabled = false; a.play('mv_idle'); a.setPartVisible?.('asu_metal', true); benchPool.push(a); } }
    ready = true;
  }
  function drawBench(state) {   // reserves sit on their team's bench, facing the ice
    const by = { home: [], away: [] }; const onIce = new Set((state.players || []).map(p => p.id)); for (const p of Object.values(state.roster || {}).sort((a, b) => (a.id < b.id ? -1 : 1))) if (!onIce.has(p.id) && !p.goalie && by[p.team]) by[p.team].push(p);   // same rule as the 2D bench
    const key = ['home', 'away'].map(t => by[t].slice(0, 6).map(p => p.id).join(',') + '|' + (state[t]?.color || '')).join('#'); if (key === benchKey) return; benchKey = key;
    let i = 0;
    for (const [ti, t] of ['home', 'away'].entries()) for (const [j, p] of by[t].slice(0, 6).entries()) { const a = benchPool[i++]; if (!a) break;
      const team = state[t] || {}, tk = `${team.color}|${team.color2}`; if (a.tk !== tk) { a.setTeam(team.color, team.color2); a.tk = tk; }
      a.entity.enabled = true; a.entity.setPosition(BENCH_X[ti] + 0.55 + j * (BENCH_LEN - 1.1) / 5, 0, BENCH_Z - 0.05); a.entity.setEulerAngles(0, -90, 0); void p; }
    for (; i < benchPool.length; i++) benchPool[i].entity.enabled = false;
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
    if (!crowd || crowdKey !== `${state.home?.color}|${state.away?.color}`) { crowd?.dispose(); crowdKey = `${state.home?.color}|${state.away?.color}`; const c = x => parseColor(x || '#244c8f').map(v => v / 255); crowd = createCrowdStands(stage, { ...rinkStands(undefined, undefined, undefined, { low: 0.5, medium: 0.8, high: 1 }[stage.quality?.level] || 0.8), concrete: [0.16, 0.17, 0.2], home: c(state.home?.color), away: c(state.away?.color) }); }
    crowd.update(dt, now); drawBench(state);
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
      const want = level !== 'low'; if (!ready || want === hdOn) return; hdOn = want; ready = false; const old = [...skaters, ...goalies]; skaters = []; goalies = [];
      for (let i = 0; i < 12; i++) { const a = await factory.spawn('hockey', { hd: hdOn, name: 'sk' + i }); a.entity.enabled = false; skaters.push(a); }
      for (let i = 0; i < 2; i++) { const a = await factory.spawn('goalie', { hd: hdOn, name: 'gk' + i }); a.entity.enabled = false; goalies.push(a); }
      old.forEach(a => a.dispose()); for (const [id, a] of slot) if (old.includes(a) || !a.pid) slot.delete(id); simRef = null; ready = true;
    },
    get hd() { return hdOn; }, crowdSeats: () => crowd?.seats || 0,
    replayInfo: () => ({ replaying, evIdx, t: replayT }),
    benchInfo: () => ({ n: benchPool.filter(a => a.entity.enabled).length, benches: benchEnts.length }),
    get ready() { return ready; }, athletes: () => [...skaters, ...goalies].filter(a => a.p), cameraState: () => (cam ? { pos: cam.pos.slice(), look: cam.look.slice(), replaying } : null),
    dispose() { crowd?.dispose(); rink?.dispose(); props?.dispose(); benchEnts.forEach(e => e.destroy()); benchPool.forEach(a => a.dispose()); benchMat?.destroy(); [...skaters, ...goalies].forEach(a => a.dispose()); skaters = []; goalies = []; factory?.dispose(); },
  };
}
