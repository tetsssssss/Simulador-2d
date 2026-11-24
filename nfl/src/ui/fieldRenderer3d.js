// NFL renderer on the PlayCanvas stage: reads the SAME simulation state the 2D renderer reads (sim.ents, sim.ball, sim.events…) and draws it in 3D.
// Nothing here changes the simulation. Decisions are in render3dLogic.js (pure, tested); animation events reuse animationMap.js; fouls / signals reuse penalties.js.
//   render(sim, alpha, opts)  opts: { teams:{off,def,home,away}, camera (preset|null), huddle (0..1|null), selected (id) }
import { createAthleteFactory, worldFromSim } from '../../../core/render3d/athletes.js';
import { createWeather, weatherPref } from '../../../core/render/weather.js';
import { createStadium } from '../../../core/render3d/stadium.js';
import { applyLook, LOOK_NAMES, LOOK_MODES, lookByQuarter } from '../../../core/render3d/look.js';
import { createNflField, followStep } from '../../../core/render3d/nflField.js';
import { actionsFor, huddlePose, contactPull, CONTACT_CLIPS, smooth01 } from './animationMap.js';
import { buildPenalty, buildSignal, SIGNALS, REF_ID } from './penalties.js';
import { locomotion3d, ballPlacement, cameraRig } from './render3dLogic.js';
import { sideColors, TEAM_COLORS } from './teamColors.js';

const lerp = (a, b, k) => a + (b - a) * k;
const wall = () => performance.now() / 1000;

export async function createNflRenderer3d(stage, { canvas3d, base = '/' } = {}) {
  const { pc, app } = stage, wrap = canvas3d.parentElement;
  let factory = null, field = null, stadium = null, lookName = (() => { try { const v = localStorage.getItem('asu_3d_look'); return LOOK_MODES.includes(v) ? v : 'auto'; } catch { return 'auto'; } })(), shownLook = '', pool = [], ref = null, ready = false, initP = null;
  let lastHk = null, simRef = null, evIdx = 0, replaying = false, teamKey = '', cam = null, last = 0, tintKey = '';
  const acts = new Map(), contacts = new Map(), byId = new Map(); let refAct = null, refUntil = 0;
  const labels = document.createElement('div'); labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3;font:700 11px system-ui,sans-serif'; wrap.appendChild(labels);
  const wxCv = document.createElement('canvas'); wxCv.id = 'wx3d'; wxCv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2'; wrap.appendChild(wxCv);
  let wx = null, wxSeed = '', wxKind = 'clear', fogMul = 1;
  function drawWeather(opts, dt) {
    const seed = `${opts.teams?.home || ''}@${opts.teams?.away || ''}`, w = wrap.clientWidth, h = wrap.clientHeight; if (!(w > 0 && h > 0)) return;
    if (!wx || wxSeed !== seed) { wx = createWeather({ sport: 'nfl', seed }); wxSeed = seed; }
    wx.setMode(weatherPref()); const k = wx.kind;
    if (wxCv.width !== w || wxCv.height !== h) { wxCv.width = w; wxCv.height = h; }
    const c = wxCv.getContext('2d'); c.clearRect(0, 0, w, h); wx.draw(c, w, h, dt);
    if (k !== wxKind) { wxKind = k; fogMul = k === 'fog' ? 4 : k === 'rain' ? 1.8 : 1; if (stadium) applyLook(stage, lookName, stadium.floods, fogMul); }
  }
  const ring = (r, g, b) => { const m = new pc.StandardMaterial(); m.diffuse = new pc.Color(0, 0, 0); m.emissive = new pc.Color(r, g, b); m.update(); const e = new pc.Entity('ring'); e.addComponent('render', { type: 'cylinder', material: m, castShadows: false, receiveShadows: false }); e.setLocalScale(1.5, 0.03, 1.5); e.enabled = false; stage.root.addChild(e); return { e, m }; };
  const selRing = ring(1, 1, 1), carRing = ring(1, 0.78, 0.2);

  let hdOn = stage.quality?.level !== 'low';   // LOD by quality: HD athletes are 12 000 triangles each, the low-poly ones ~630
  const lookFor3d = opts => (lookName === 'auto' ? lookByQuarter(opts?.game?.quarter || 1) : lookName);
  async function init(opts) {
    factory = createAthleteFactory(stage, { base });
    const t = opts.teams || {}, home = t.home || 'HOME', away = t.away || 'AWAY';
    field = await createNflField(stage, { homeColor: TEAM_COLORS[home] || '#0a2870', awayColor: TEAM_COLORS[away] || '#b3141d', homeAbbr: home, awayAbbr: away });
    stadium = createStadium(stage, { density: { low: 0.5, medium: 0.8, high: 1 }[stage.quality?.level] || 0.8 }); applyLook(stage, shownLook = lookFor3d(opts), stadium.floods, fogMul);
    const sc = sideColors(t.off, t.def);
    for (let i = 0; i < 22; i++) { const side = i < 11 ? 'off' : 'def', [c1, c2] = sc[side]; const a = await factory.spawn('football', { hd: hdOn, color: c1, color2: c2, name: `p${i}` }); a.play('mv_idle'); a.number = ''; pool.push(a); }
    ready = true;
  }
  const label = a => { if (!a.label) { const s = document.createElement('span'); s.style.cssText = 'position:absolute;transform:translate(-50%,-100%);padding:0 4px;border-radius:4px;background:rgba(0,0,0,.6);color:#fff;white-space:nowrap'; labels.appendChild(s); a.label = s; } return a.label; };

  function bind(sim, opts) {   // a new play: the 22 pooled athletes take the 22 entities, with the right team colours
    simRef = sim; evIdx = 0; acts.clear(); contacts.clear(); byId.clear(); refAct = null;
    const sc = sideColors(opts.teams?.off, opts.teams?.def), key = `${opts.teams?.off}|${opts.teams?.def}`;
    sim.ents.forEach((e, i) => { const a = pool[i]; if (!a) return; byId.set(e.id, a); a.e = e; a.token = null;
      const side = e.side; if (tintKey !== key || a.side !== side) { a.setTeam(...sc[side]); a.side = side; }
      a.number = e.jersey ?? e.p?.jersey_number ?? ''; a.name = e.name || e.p?.full_name || ''; });
    tintKey = key; field.setLines(sim.losX, sim.losX + sim.distance);
  }

  function pump(sim) {   // new engine events -> clip actions (same mapping as the 2D renderer), contacts, fouls and referee signals
    const ev = sim.events || []; if (evIdx > ev.length) evIdx = 0;
    for (; evIdx < ev.length; evIdx++) {
      const e = ev[evIdx]; if (replaying && e.t > (sim.t ?? 0)) break;
      if (e.type === 'WHISTLE') { for (const [id, A] of acts) if (A.loop) acts.delete(id); if (/TOUCHDOWN/i.test(String(e.outcome || '')) && sim.carrier) acts.set(sim.carrier.id, { type: 'clip:gs_arms_up', t0: sim.t ?? 0, dur: 1.6, loop: true }); stadium?.cheer(1); }
      for (const a of actionsFor(e, sim)) acts.set(a.who, { type: a.type, t0: a.t0, dur: a.dur, loop: a.loop });
      if (e.type === 'TACKLE' && e.carrier != null) { if (e.by != null) contacts.set(e.by, { c: e.carrier, gap: 0.75 }); for (const a of e.assists || []) contacts.set(a, { c: e.carrier, gap: 1.0 }); }
      const sg = e.type === 'PENALTY' ? buildPenalty(e.foul, sim, { by: e.by, on: e.on, now: wall() }) : SIGNALS[e.type] ? buildSignal(e.type, sim, { now: wall() }) : null;
      if (sg) { refAct = sg; refUntil = sg.until; for (const a of sg.actions) if (a.who !== REF_ID) acts.set(a.who, { type: a.type, t0: a.t0, dur: a.dur, loop: false, wall: true }); }
    }
  }
  const actOf = (id, sim) => { const A = acts.get(id); if (!A) return null; const now = A.wall ? wall() : (sim.t ?? 0), k = (now - A.t0) / A.dur; if (k < 0) return null; if (k > 1 && !A.loop) { acts.delete(id); return null; } return { A, k: Math.min(1, k), elapsed: now - A.t0 }; };

  async function showRef(sim) {
    if (!refAct || wall() > refUntil) { if (ref) ref.entity.enabled = false; return; }
    if (!ref) { ref = await factory.spawn('ref', { hd: false, name: 'ref' }); }
    if (!refAct || wall() > refUntil) { ref.entity.enabled = false; return; }   // the signal ended while the model was loading
    ref.entity.enabled = true; const r = refAct.ref; ref.setPosition('nfl', r.pos.x, r.pos.y); ref.setFacing(r.facing || 0);
    const A = refAct.actions.find(a => a.who === REF_ID), now = wall(); let cur = A;
    while (cur && now > cur.t0 + cur.dur && cur.next) cur = { ...cur.next, t0: cur.t0 + cur.dur };
    if (cur && now >= cur.t0) { const id = cur.type.slice(5); if (ref.clip !== id) ref.play(id, { loop: false, blend: 0.1 }); } else if (ref.clip !== 'mv_idle') ref.play('mv_idle');
  }

  let lastOpts = null;
  function render(sim, alpha, opts = {}) {
    lastOpts = opts;
    if (!ready) { initP ||= init(opts).catch(e => { console.error('3D renderer init failed', e); }); return; }
    if (!sim) return; if (sim !== simRef) bind(sim, opts); pump(sim);
    const now = wall(), dt = last ? Math.min(0.1, now - last) : 0; last = now; const k = Math.max(0, Math.min(1, alpha ?? 1));
    const preSnap = (sim.t ?? 0) < 0.2, carrier = sim.carrier || null, hk = opts.huddle ?? null; lastHk = hk;
    for (let i = 0; i < sim.ents.length; i++) {
      const e = sim.ents[i], a = pool[i]; if (!a) continue;
      let p = { x: lerp(e.prev.x, e.pos.x, k), y: lerp(e.prev.y, e.pos.y, k) }, facing = e.facing || 0, breaking = false;
      if (hk != null && e.side === 'off' && sim.offense) { const hp = huddlePose(hk, sim.offense.indexOf(e), sim.offense.length, { x: sim.losX - 8.5, y: sim.by }, p); if (hp.active) { p = { x: hp.x, y: hp.y }; facing = hp.facing; breaking = hp.breaking; } }
      const act = actOf(e.id, sim), ct = contacts.get(e.id);
      if (ct && act && CONTACT_CLIPS.has(act.A.type)) { const ce = byId.get(ct.c)?.e || sim.ents.find(x => x.id === ct.c); if (ce) p = contactPull(p, { x: lerp(ce.prev.x, ce.pos.x, k), y: lerp(ce.prev.y, ce.pos.y, k) }, ct.gap, smooth01(act.k / 0.45)); }
      a.setPosition('nfl', p.x, p.y); a.setFacing(facing);
      let want; if (act) want = { clip: act.A.type.slice(5), loop: !!act.A.loop, speed: 1, oneShot: !act.A.loop, token: `${act.A.t0}|${act.A.type}` };
      else if (breaking) want = { clip: 'mv_jog', loop: true, speed: 1 }; else want = locomotion3d(e, { carrier, preSnap });
      if (a.has(want.clip)) {
        if (want.oneShot ? a.token !== want.token : a.clip !== want.clip) { a.play(want.clip, { loop: want.loop, blend: want.oneShot ? 0.08 : 0.15 }); a.token = want.token || null; if (want.oneShot && act?.elapsed > 0.02) { const L = a.entity.anim.baseLayer; try { L.activeStateCurrentTime = act.elapsed; } catch { /* clip shorter than the lead */ } } }
        if (Math.abs((a.speed || 1) - want.speed) > 0.04) { a.entity.anim.speed = want.speed; a.speed = want.speed; }
      }
    }
    { const want = lookFor3d(opts); if (stadium && want !== shownLook) { shownLook = want; applyLook(stage, want, stadium.floods, fogMul); } stadium?.setBoard(opts.game); }
    showRef(sim); stadium?.update(dt, wall()); drawWeather(opts, dt);
    const bp = ballPlacement(sim); if (bp) field.setBall(bp.x, bp.y, bp.z, (bp.yaw * 180) / Math.PI); else field.hideBall();
    // camera: preset target, smoothed
    const r = cameraRig(opts.camera || 'BROADCAST', { ballX: bp ? bp.x : sim.losX, qb: sim.qb ? { x: sim.qb.pos.x, y: sim.qb.pos.y } : null, losX: sim.losX });
    if (!cam) cam = { pos: r.pos.slice(), look: r.look.slice() }; else { cam.pos = followStep(cam.pos, r.pos, dt, 0.35); cam.look = followStep(cam.look, r.look, dt, 0.25); }
    stage.camera.setPosition(...cam.pos); stage.camera.lookAt(...cam.look);
    updateOverlays(sim, opts, carrier);
  }

  const tmp = new pc.Vec3(), scr = new pc.Vec3();
  const project = (a, h = 2.05) => { const p = a.entity.getPosition(); tmp.set(p.x, p.y + h, p.z); stage.camera.camera.worldToScreen(tmp, scr); return scr.z > 0 ? { x: scr.x, y: scr.y } : null; };
  function updateOverlays(sim, opts, carrier) {
    const sel = opts.selected;
    for (let i = 0; i < sim.ents.length; i++) {
      const e = sim.ents[i], a = pool[i]; if (!a) continue; const s = project(a), L = label(a);
      if (!s) { L.style.display = 'none'; continue; }
      const important = e === carrier || e === sim.qb || e.id === sel; L.style.display = ''; L.style.left = `${s.x}px`; L.style.top = `${s.y}px`;
      L.textContent = important ? `${a.number} ${String(a.name).split(' ').slice(-1)[0]}` : `${a.number}`; L.style.background = e.id === sel ? '#f5c542' : e === carrier ? 'rgba(245,196,66,.85)' : 'rgba(0,0,0,.6)'; L.style.color = e.id === sel || e === carrier ? '#111' : '#fff';
    }
    for (const [rg, id] of [[selRing, sel], [carRing, carrier?.id]]) { const a = id != null ? byId.get(id) : null; rg.e.enabled = !!a; if (a) { const p = a.entity.getPosition(); rg.e.setPosition(p.x, 0.04, p.z); } }
  }

  return {
    render,
    // CSS-pixel position (relative to the canvas) -> the entity under it, or null (nearest athlete within 30 px of its torso)
    pick(px, py) { let best = null, bd = 30; pool.forEach((a, i) => { const s = project(a, 1.1); if (!s || !a.e) return; const d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; best = a.e; } }); return best; },
    simT: () => simRef?.t ?? 0, lastHuddle: () => lastHk,
    screenOf(id) { const a = byId.get(id); return a ? project(a, 1.1) : null; },
    beginReplay(sim) { replaying = true; simRef = sim; evIdx = 0; acts.clear(); contacts.clear(); },
    endReplay(sim) { replaying = false; acts.clear(); evIdx = (sim?.events || []).length; },
    // Quality changed (user or auto): Low swaps the 22 athletes to the low-poly models (and back), keeping the simulation binding.
    async setQuality(level) {
      const want = level !== 'low'; if (!ready || want === hdOn) return; hdOn = want; ready = false;
      const old = pool, sc = sideColors(simRef ? lastOpts?.teams?.off : null, simRef ? lastOpts?.teams?.def : null); pool = [];
      for (let i = 0; i < 22; i++) { const side = i < 11 ? 'off' : 'def', [c1, c2] = sc[side]; const a = await factory.spawn('football', { hd: hdOn, color: c1, color2: c2, name: `p${i}` }); a.play('mv_idle'); a.number = ''; pool.push(a); }
      old.forEach(a => { a.label?.remove(); a.dispose(); }); byId.clear(); simRef = null; tintKey = ''; ready = true;
    },
    get hd() { return hdOn; },
    get ready() { return ready; },
    setLook(n) { if (!LOOK_MODES.includes(n)) return false; lookName = n; try { localStorage.setItem('asu_3d_look', n); } catch { /* private */ } if (stadium) { shownLook = n === 'auto' ? lookByQuarter(lastOpts?.game?.quarter || 1) : n; applyLook(stage, shownLook, stadium.floods, fogMul); } return true; },
    get shownLook() { return shownLook; },
    get look() { return lookName; }, weather: () => wxKind, stadiumInfo: () => stadium && { seats: stadium.seats, floods: stadium.floods.filter(f => f.enabled).length, board: stadium.boardKey() },
    cameraState: () => (cam ? { pos: cam.pos.slice(), look: cam.look.slice(), replaying } : null),
    athletes: () => pool,
    dispose() { labels.remove(); selRing.e.destroy(); carRing.e.destroy(); selRing.m.destroy(); carRing.m.destroy(); ref?.dispose(); pool.forEach(a => a.dispose()); pool = []; field?.dispose(); stadium?.dispose(); wxCv.remove(); factory?.dispose(); },
  };
}
