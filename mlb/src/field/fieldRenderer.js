// MLB field renderer (presentation only — reads engine state, never mutates it).
// Draws the ballpark (fair/foul grass, infield dirt, warning track, outfield wall with distances, foul lines, bases,
// home plate, mound + rubber, batter's boxes, dugouts, bullpens), the athletes as photo sprites (pitcher and batter
// highlighted) and the ball with halo, trail, ground shadow and an "in the air" indicator.
// Cameras: BROADCAST · BATTER · PITCHER · TACTICAL · FULL.
import { attachHiDPI } from '../../../core/render/hidpi.js';
import { createCamera } from '../../../core/render/camera.js';
import { drawSprite, drawTrackedObject, zoomLevel } from '../../../core/render/sprites.js';
import { BASES, MOUND, FENCE, fenceDist, fencePoint } from './geometry.js';
import { photoImage } from '../photos.js';

export const CAMERAS = {
  BROADCAST: { label: 'Broadcast', cx: 0, cy: 76, view: 240, viewH: 184 },
  BATTER: { label: 'Batter', cx: 0, cy: 26, view: 92, viewH: 68 },
  PITCHER: { label: 'Pitcher', cx: 0, cy: 34, view: 120, viewH: 86 },
  TACTICAL: { label: 'Tactical', cx: 0, cy: 175, view: 470, viewH: 380 },
  FULL: { label: 'Full field', cx: 0, cy: 190, view: 640, viewH: 470 },
};
const R2 = Math.SQRT1_2;

export function createFieldRenderer(canvas, { crowd = null } = {}) {
  const hd = attachHiDPI(canvas, { minW: 320, minH: 220 });
  const ctx = hd.ctx;
  const cam = createCamera({ worldMinX: -300, worldMinY: -90, worldMaxX: 300, worldMaxY: 470, margin: 0 });
  cam.flipY = true; // world +y (toward center field) points up on screen; home plate at the bottom
  let mode = 'BROADCAST', lastT = null, screen = new Map();
  const trail = [];
  const S = () => cam.scale, X = x => cam.sx(x), Y = y => cam.sy(y);

  function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.closePath(); }
  function fenceArc(inset = 0, n = 48) { const out = []; for (let i = 0; i <= n; i++) { const a = -Math.PI / 4 + (Math.PI / 2) * (i / n); out.push(fencePoint(a, inset)); } return out; }
  function parkOutline() {
    const off = 46, u = { x: -R2, y: R2 }, nL = { x: -R2, y: -R2 }, v = { x: R2, y: R2 }, nR = { x: R2, y: -R2 };
    const pts = [];
    pts.push({ x: u.x * FENCE.line, y: u.y * FENCE.line });
    pts.push({ x: u.x * FENCE.line + nL.x * off, y: u.y * FENCE.line + nL.y * off });
    pts.push({ x: nL.x * off, y: nL.y * off });
    for (let i = 0; i <= 16; i++) { const a = Math.PI * 1.25 + (Math.PI * 0.5) * (i / 16); pts.push({ x: Math.cos(a) * 62, y: Math.sin(a) * 62 }); }
    pts.push({ x: nR.x * off, y: nR.y * off });
    pts.push({ x: v.x * FENCE.line + nR.x * off, y: v.y * FENCE.line + nR.y * off });
    for (const p of fenceArc(0).reverse()) pts.push(p);
    return pts;
  }

  function drawPark(state) {
    const s = S(), W = hd.w, H = hd.h;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a1018'); g.addColorStop(1, '#06090e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (crowd) crowd.draw(ctx, { cam, outline: parkOutline().map(p => ({ x: X(p.x), y: Y(p.y) })), t: state.t || 0, sport: 'mlb' });
    // grass (whole park incl. foul territory) with mowing stripes
    const park = parkOutline();
    poly(park); ctx.fillStyle = '#2e7d3c'; ctx.fill();
    ctx.save(); poly(park); ctx.clip();
    for (let k = -8; k < 30; k++) { if (k % 2) continue; ctx.fillStyle = 'rgba(255,255,255,.035)'; const y0 = k * 18; poly([{ x: -400, y: y0 }, { x: 400, y: y0 }, { x: 400, y: y0 + 18 }, { x: -400, y: y0 + 18 }]); ctx.fill(); }
    ctx.restore();
    // warning track (15 ft) inside the wall
    const outer = fenceArc(0), inner = fenceArc(15);
    poly([...outer, ...inner.reverse()]); ctx.fillStyle = '#a07a4e'; ctx.fill();
    // infield dirt: circle around the mound clipped to a wedge slightly wider than fair territory
    ctx.save();
    poly([{ x: 0, y: -14 }, { x: -170, y: 150 }, { x: 170, y: 150 }]); ctx.clip();
    ctx.fillStyle = '#b98a57'; ctx.beginPath(); ctx.arc(X(MOUND.x), Y(MOUND.y), 95 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // home plate area dirt
    ctx.fillStyle = '#b98a57'; ctx.beginPath(); ctx.arc(X(0), Y(0), 13 * s, 0, Math.PI * 2); ctx.fill();
    // infield grass
    const f = BASES.first, sc = BASES.second;
    poly([{ x: 0, y: 12 }, { x: f.x - 5, y: f.y - 0.5 }, { x: 0, y: sc.y - 9 }, { x: -f.x + 5, y: f.y - 0.5 }]); ctx.fillStyle = '#35893f'; ctx.fill();
    // base cut-outs + mound
    for (const b of [BASES.first, BASES.second, BASES.third]) { ctx.fillStyle = '#b98a57'; ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), 11 * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#c0915d'; ctx.beginPath(); ctx.arc(X(MOUND.x), Y(MOUND.y), MOUND.r * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(X(-1), Y(MOUND.y + 0.25), 2 * s, Math.max(1, 0.5 * s)); // rubber
    // foul lines
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, 0.33 * s);
    for (const sgn of [-1, 1]) { const end = fencePoint(sgn * Math.PI / 4); ctx.beginPath(); ctx.moveTo(X(sgn * 1.2), Y(1.2)); ctx.lineTo(X(end.x), Y(end.y)); ctx.stroke(); }
    // batter's boxes + catcher's box
    ctx.lineWidth = Math.max(1, 0.25 * s); ctx.strokeStyle = 'rgba(255,255,255,.9)';
    for (const sgn of [-1, 1]) ctx.strokeRect(X(sgn > 0 ? 1.2 : -5.2), Y(3), 4 * s, 6 * s);
    ctx.strokeRect(X(-1.7), Y(-3), 3.4 * s, 5 * s);
    // bases + home plate
    for (const b of [BASES.first, BASES.second, BASES.third]) { ctx.save(); ctx.translate(X(b.x), Y(b.y)); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#fff'; const w = Math.max(4, 1.25 * s); ctx.fillRect(-w / 2, -w / 2, w, w); ctx.restore(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(X(-0.71), Y(0.71)); ctx.lineTo(X(0.71), Y(0.71)); ctx.lineTo(X(0.71), Y(0)); ctx.lineTo(X(0), Y(-0.71)); ctx.lineTo(X(-0.71), Y(0)); ctx.closePath(); ctx.fill();
    // outfield wall + distance markers
    ctx.strokeStyle = '#1d3b2b'; ctx.lineWidth = Math.max(3, 2.2 * s);
    ctx.beginPath(); fenceArc(0).forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke();
    ctx.strokeStyle = '#f2c230'; ctx.lineWidth = Math.max(1, 0.4 * s);
    ctx.beginPath(); fenceArc(-1).forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke();
    if (s > 0.9) {
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `800 ${Math.max(9, 7 * s)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const a of [-Math.PI / 4 + 0.05, -Math.PI / 8, 0, Math.PI / 8, Math.PI / 4 - 0.05]) { const p = fencePoint(a, 9); ctx.fillText(String(Math.round(fenceDist(a) / 5) * 5), X(p.x), Y(p.y)); }
    }
    // dugouts (team colored roofs) + bullpens, all in foul territory
    const dug = (sgn, team) => {
      const along = 74, off = 54, u = { x: sgn * R2, y: R2 }, n = { x: sgn * R2, y: -R2 };
      const c = { x: u.x * along + n.x * off, y: u.y * along + n.y * off };
      ctx.save(); ctx.translate(X(c.x), Y(c.y)); ctx.rotate(sgn > 0 ? Math.PI / 4 : -Math.PI / 4);
      ctx.fillStyle = '#16202c'; ctx.fillRect(-26 * s, -4.5 * s, 52 * s, 9 * s);
      ctx.fillStyle = team?.color || '#2a4a6b'; ctx.fillRect(-26 * s, -4.5 * s, 52 * s, 2 * s);
      if (s > 1.4) { ctx.fillStyle = 'rgba(233,240,247,.85)'; ctx.font = `800 ${Math.max(9, 4 * s)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${team?.abbr || ''} DUGOUT`, 0, 1.2 * s); }
      ctx.restore();
    };
    dug(1, state.home); dug(-1, state.away);
    const pen = (sgn, team) => {
      const along = 255, off = 28, u = { x: sgn * R2, y: R2 }, n = { x: sgn * R2, y: -R2 };
      const c = { x: u.x * along + n.x * off, y: u.y * along + n.y * off };
      ctx.save(); ctx.translate(X(c.x), Y(c.y)); ctx.rotate(sgn > 0 ? Math.PI / 4 : -Math.PI / 4);
      ctx.fillStyle = 'rgba(185,138,87,.85)'; ctx.fillRect(-30 * s, -6 * s, 60 * s, 12 * s);
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(-30 * s, -6 * s, 60 * s, 12 * s);
      if (s > 1.1) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `700 ${Math.max(8, 3.6 * s)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${team?.abbr || ''} BULLPEN`, 0, 0); }
      ctx.restore();
    };
    pen(1, state.home); pen(-1, state.away);
    // occupied bases: subtle team-colored glow
    for (const r of state.runners || []) { const b = [null, BASES.first, BASES.second, BASES.third][r.base]; if (!b) continue; const team = state[r.team]; ctx.fillStyle = hexA(team?.color || '#f6c453', 0.35); ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), 6 * s, 0, Math.PI * 2); ctx.fill(); }
  }

  const lerp = (e, a) => ({ x: (e.px ?? e.x) + (e.x - (e.px ?? e.x)) * a, y: (e.py ?? e.y) + (e.y - (e.py ?? e.y)) * a });

  function drawAthletes(state, a, opts) {
    screen = new Map();
    const s = S();
    // Athletes are drawn larger than their physical size so photos/numbers stay readable on wide shots.
    const base = Math.max(8.5, Math.min(24, 2.6 * s));
    const items = [];
    for (const f of state.fielders || []) items.push({ e: f, role: f.pos === 'P' ? 'pitcher' : 'circle', scale: f.pos === 'P' ? 1.22 : 1 });
    if (state.batter) items.push({ e: state.batter, role: 'batter', scale: 1.28 });
    for (const r of state.runners || []) items.push({ e: r, role: 'circle', scale: 1.05 });
    for (const { e, role, scale } of items) {
      const team = state[e.team] || {}, p = lerp(e, a), r = base * scale;
      const img = opts.showPhotos !== false ? photoImage(e.p) : null;
      const X0 = X(p.x), Y0 = Y(p.y);
      drawSprite(ctx, {
        x: X0, y: Y0, r, color: team.color, color2: team.color2, number: e.num, pos: e.pos, name: opts.showNames !== false ? e.last : '', img,
        shape: role, facing: e.facing != null ? -e.facing : null, carrier: state.ball?.holder === e.id, target: state.throwTarget === e.id,
        selected: opts.selected === e.id, level: zoomLevel(r), t: state.t || 0,
      });
      screen.set(e.id, { X: X0, Y: Y0, r, e });
    }
  }

  function drawBall(state, a) {
    const b = state.ball;
    if (!b || b.hidden) { trail.length = 0; return; }
    const x = (b.px ?? b.x) + (b.x - (b.px ?? b.x)) * a, y = (b.py ?? b.y) + (b.y - (b.py ?? b.y)) * a, z = Math.max(0, (b.pz ?? b.z ?? 0) + ((b.z ?? 0) - (b.pz ?? b.z ?? 0)) * a);
    const sx = X(x), sy = Y(y), lift = z * S() * 0.55;
    trail.push({ x: sx, y: sy - lift }); while (trail.length > 12) trail.shift();
    const r = Math.max(3.2, Math.min(7, 0.55 * S()));
    drawTrackedObject(ctx, { x: sx, y: sy, z: lift, r, color: '#ffffff', rim: '#d23a3a', halo: 'rgba(255,255,255,.85)', trail: b.holder ? [] : trail, airborne: z > 3 });
    if (b.landing && z > 3) { // landing spot ring for fly balls (readability)
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(b.landing.x), Y(b.landing.y), 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function cameraTarget(state) {
    const c = CAMERAS[mode];
    if (mode === 'BROADCAST' && state.ball && !state.ball.hidden && (state.ball.y > 120 || Math.abs(state.ball.x) > 90)) {
      const b = state.ball; return [b.x * 0.7, Math.max(c.cy, b.y * 0.75), c.view * 1.25, c.viewH * 1.25];
    }
    return [c.cx, c.cy, c.view, c.viewH];
  }

  function render(state, alpha = 1, opts = {}) {
    const now = performance.now() / 1000, dt = lastT ? Math.min(0.1, now - lastT) : 0; lastT = now;
    if (opts.camera && CAMERAS[opts.camera]) mode = opts.camera;
    hd.begin(); cam.setViewport(hd.w, hd.h);
    const [tx, ty, vw, vh] = opts.cameraTarget || cameraTarget(state);
    cam.target(tx, ty, vw, vh); cam.update(dt, 2.6);
    drawPark(state);
    if (opts.debug && opts.drawDebug) opts.drawDebug(ctx, cam, state, screen);
    drawAthletes(state, alpha, opts);
    drawBall(state, alpha);
  }

  return {
    render, setCamera(m) { if (CAMERAS[m]) mode = m; }, get camera() { return mode; },
    pick(px, py) { let best = null, bd = Infinity; for (const [, sc] of screen) { const d = Math.hypot(sc.X - px, sc.Y - py); if (d < Math.max(10, sc.r + 4) && d < bd) { bd = d; best = sc.e; } } return best; },
    toScreen: (x, y) => ({ x: X(x), y: Y(y) }), get size() { return { w: hd.w, h: hd.h, dpr: hd.dpr }; }, dispose() { hd.dispose(); },
  };
}

function hexA(hex, a) { const h = (hex || '#000').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
