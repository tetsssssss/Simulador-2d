// MLB field renderer (presentation only — reads engine state, never mutates it).
// Draws the ballpark (fair/foul grass, infield dirt, warning track, outfield wall with distances, foul lines, bases,
// home plate, mound + rubber, batter's boxes, dugouts, bullpens), the athletes as photo sprites (pitcher and batter
// highlighted) and the ball with halo, trail, ground shadow and an "in the air" indicator.
// Cameras: BROADCAST · PITCHER · BATTER · INFIELD · BALL (field follow: ball + fielder with it + lead runner) · TACTICAL · FULL.
// Every camera keeps the ball in frame while it is in play (the view stretches to include it); an edge arrow points to it
// if it is ever off-screen. Pitches draw a trail from release to the plate and the strike zone at the plate.
import { attachHiDPI } from '../../../core/render/hidpi.js';
import { createCamera } from '../../../core/render/camera.js';
import { drawSprite, drawTrackedObject, zoomLevel } from '../../../core/render/sprites.js';
import { BASES, MOUND, FENCE, fenceDist, fencePoint } from './geometry.js';
import { photoImage } from '../photos.js';
import { getAvatar } from '../../../core/render/avatars.js';

export const CAMERAS = {
  BROADCAST: { label: 'Broadcast', cx: 0, cy: 160, view: 450, viewH: 345 },
  BATTER: { label: 'Batter', cx: 0, cy: 26, view: 92, viewH: 68 },
  PITCHER: { label: 'Pitcher', cx: 0, cy: 34, view: 120, viewH: 86 },
  INFIELD: { label: 'Infield', cx: 0, cy: 64, view: 170, viewH: 128 },
  BALL: { label: 'Seguir bola', cx: 0, cy: 80, view: 150, viewH: 112 }, // field follow
  TACTICAL: { label: 'Tactical', cx: 0, cy: 175, view: 470, viewH: 380 },
  FULL: { label: 'Full field', cx: 0, cy: 190, view: 640, viewH: 470 },
};
const R2 = Math.SQRT1_2;
export function fenceArc(inset = 0, n = 48) { const out = []; for (let i = 0; i <= n; i++) { const a = -Math.PI / 4 + (Math.PI / 2) * (i / n); out.push(fencePoint(a, inset)); } return out; }
// Ballpark outline in world feet (foul territory + fair territory up to the wall). Also used for the crowd stands.
export function parkOutline() {
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


export function createFieldRenderer(canvas, { crowd = null } = {}) {
  const hd = attachHiDPI(canvas, { minW: 320, minH: 220 });
  const ctx = hd.ctx;
  const cam = createCamera({ worldMinX: -340, worldMinY: -200, worldMaxX: 340, worldMaxY: 470, margin: 0 });
  cam.flipY = true; // world +y (toward center field) points up on screen; home plate at the bottom
  let mode = 'BROADCAST', lastT = null, screen = new Map();
  const trail = [];
  const S = () => cam.scale, X = x => cam.sx(x), Y = y => cam.sy(y);

  function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.closePath(); }
  function drawPark(state) {
    const s = S(), W = hd.w, H = hd.h;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a1018'); g.addColorStop(1, '#06090e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (crowd) crowd.draw(ctx, { cam, t: state.t ?? performance.now() / 1000, view: { w: W, h: H } });
    // grass (whole park incl. foul territory): concentric mowing rings around home plate + soft light falloff
    const park = parkOutline();
    poly(park); ctx.fillStyle = '#2b7637'; ctx.fill();
    ctx.save(); poly(park); ctx.clip();
    const hx = X(0), hy = Y(0);
    for (let k = 0; k < 24; k++) {
      if (k % 2) continue; const r0 = k * 20 * s, r1 = (k + 1) * 20 * s;
      ctx.beginPath(); ctx.arc(hx, hy, r1, 0, Math.PI * 2); ctx.arc(hx, hy, r0, 0, Math.PI * 2, true); ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
    }
    const lg = ctx.createRadialGradient(X(0), Y(150), 40 * s, X(0), Y(150), 330 * s); lg.addColorStop(0, 'rgba(255,255,220,.09)'); lg.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // warning track (15 ft) inside the wall
    const outer = fenceArc(0), inner = fenceArc(15);
    poly([...outer, ...inner.reverse()]); ctx.fillStyle = '#9c734a'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,190,.16)'; ctx.lineWidth = Math.max(1, 0.5 * s); ctx.beginPath(); fenceArc(7.5).forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke();
    // infield dirt: circle around the mound clipped to a wedge slightly wider than fair territory
    ctx.save();
    poly([{ x: 0, y: -14 }, { x: -170, y: 150 }, { x: 170, y: 150 }]); ctx.clip();
    ctx.fillStyle = '#b98a57'; ctx.beginPath(); ctx.arc(X(MOUND.x), Y(MOUND.y), 95 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // home plate area dirt
    ctx.fillStyle = '#b98a57'; ctx.beginPath(); ctx.arc(X(0), Y(0), 13 * s, 0, Math.PI * 2); ctx.fill();
    // basepaths (dirt strips along the diamond edges)
    const f = BASES.first, sc = BASES.second;
    ctx.strokeStyle = '#b98a57'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, 7 * s);
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(f.x), Y(f.y)); ctx.lineTo(X(sc.x), Y(sc.y)); ctx.lineTo(X(-f.x), Y(f.y)); ctx.closePath(); ctx.stroke(); ctx.lineCap = 'butt';
    // infield grass
    poly([{ x: 0, y: 12 }, { x: f.x - 5, y: f.y - 0.5 }, { x: 0, y: sc.y - 9 }, { x: -f.x + 5, y: f.y - 0.5 }]); ctx.fillStyle = '#38903f'; ctx.fill();
    ctx.save(); ctx.clip(); for (let k = -14; k < 14; k++) { if (k % 2) continue; ctx.fillStyle = 'rgba(255,255,255,.055)'; poly([{ x: -90 + k * 9, y: -10 }, { x: -90 + k * 9 + 9, y: -10 }, { x: 90 + k * 9 + 9, y: 190 }, { x: 90 + k * 9, y: 190 }]); ctx.fill(); } ctx.restore();
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
    { const n = 28, arc = fenceArc(0, n); ctx.lineWidth = Math.max(3, 2.2 * s); for (let i = 0; i < n; i++) { ctx.strokeStyle = i % 2 ? '#1b4a33' : (state.home?.color ? hexA(state.home.color, 0.85) : '#245a3f'); ctx.beginPath(); ctx.moveTo(X(arc[i].x), Y(arc[i].y)); ctx.lineTo(X(arc[i + 1].x), Y(arc[i + 1].y)); ctx.stroke(); } }
    ctx.strokeStyle = '#f2c230'; ctx.lineWidth = Math.max(1, 0.4 * s);
    ctx.beginPath(); fenceArc(-1).forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke();
    if (s > 0.9) {
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `800 ${Math.max(9, 7 * s)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const a of [-Math.PI / 4 + 0.05, -Math.PI / 8, 0, Math.PI / 8, Math.PI / 4 - 0.05]) { const p = fencePoint(a, 9); ctx.fillText(String(Math.round(fenceDist(a) / 5) * 5), X(p.x), Y(p.y)); }
    }
    // foul poles
    for (const sgn of [-1, 1]) { const e = fencePoint(sgn * Math.PI / 4); ctx.strokeStyle = '#f2c230'; ctx.lineWidth = Math.max(2, 0.9 * s); ctx.beginPath(); ctx.moveTo(X(e.x), Y(e.y)); ctx.lineTo(X(e.x), Y(e.y) - 16 * s); ctx.stroke(); }
    // coaches' boxes (1B / 3B) and on-deck circles
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, 0.22 * s);
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.translate(X(sgn * (BASES.first.x + 16)), Y(BASES.first.y - 14)); ctx.rotate(sgn > 0 ? Math.PI / 4 : -Math.PI / 4); ctx.strokeRect(-3 * s, -10 * s, 6 * s, 20 * s); ctx.restore();
      ctx.beginPath(); ctx.arc(X(sgn * 44), Y(14), 5 * s, 0, Math.PI * 2); ctx.stroke();
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
    const base = Math.max(8.5, Math.min(24, 2.6 * s)) * (opts.visual === 'avatar' ? 1.55 : 1);
    const items = [];
    for (const f of state.fielders || []) items.push({ e: f, role: f.pos === 'P' ? 'pitcher' : 'circle', scale: f.pos === 'P' ? 1.22 : 1 });
    if (state.batter) items.push({ e: state.batter, role: 'batter', scale: 1.28 });
    for (const r of state.runners || []) items.push({ e: r, role: 'circle', scale: 1.05 });
    for (const { e, role, scale } of items) {
      const team = state[e.team] || {}, p = lerp(e, a), r = base * scale;
      const mode = opts.visual || (opts.showPhotos === false ? 'plain' : 'photo');
      const img = mode === 'photo' ? photoImage(e.p) : null;
      const X0 = X(p.x), Y0 = Y(p.y);
      let avatar = null;
      if (mode === 'avatar') {
        const moving = Math.hypot(e.x - (e.px ?? e.x), e.y - (e.py ?? e.y)) > 0.02, isC = e.pos === 'C', rl = e.role || (role === 'batter' ? 'batter' : role === 'pitcher' ? 'pitcher' : e.base != null || e.runner ? 'runner' : isC ? 'catcher' : 'fielder');
        const hasBall = state.ball?.holder === e.id;
        avatar = { opts: getAvatar('mlb', e.pid ?? e.id), kit: 'baseball', role: rl, prop: rl === 'batter' ? 'bat' : rl === 'runner' ? 'none' : hasBall ? 'ball' : 'glove', pose: isC ? 'crouch' : 'stand', moving, seed: (e.pid ?? 0) % 7, dir: p.x > 0 ? -1 : 1 };
      }
      drawSprite(ctx, {
        x: X0, y: Y0, r, color: team.color, color2: team.color2, number: e.num, pos: e.pos, name: opts.showNames !== false ? e.last : '', img,
        shape: role, avatar, facing: e.facing != null ? -e.facing : null, carrier: state.ball?.holder === e.id, target: state.throwTarget === e.id,
        selected: opts.selected === e.id, level: zoomLevel(r), t: state.t || 0,
      });
      screen.set(e.id, { X: X0, Y: Y0, r, e });
    }
  }

  const PITCH_COL = { FF: '#ff7a59', FT: '#ff9a59', SI: '#e8b04a', FC: '#c9a0ff', SL: '#6bd0ff', CU: '#6b8cff', CH: '#7be39b', FS: '#4fe0c8' };
  // Strike zone at the plate (x ±0.83 ft, z 1.5–3.5 ft, lifted like the ball) + the pitch trail from release to the plate + last location.
  function drawPitch(state) {
    const s = S(); if (s < 2.2) return;
    const lift = z => z * s * 0.55, y0 = Y(0.5), x0 = X(0);
    const tr = state.pitchTrail, lp = state.lastPitch; if (!tr?.pts?.length) return;
    const col = PITCH_COL[tr.type] || '#fff', live = state.phase === 'PITCH';
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const n = tr.pts.length, step = Math.max(1, Math.floor(n / 10)); // ~10 fading segments (cheap), full path
    for (let i = step; i < n + step; i += step) {
      const a = tr.pts[i - step], b = tr.pts[Math.min(n - 1, i)], f = Math.min(1, i / n);
      ctx.strokeStyle = col; ctx.globalAlpha = (live ? 0.18 + 0.6 * f : 0.1 + 0.28 * f); ctx.lineWidth = Math.max(1.2, 0.34 * s * (0.4 + 0.6 * f));
      ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y) - lift(a.z)); ctx.lineTo(X(b.x), Y(b.y) - lift(b.z)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (lp && !live) { ctx.fillStyle = lp.inZone ? '#5be38f' : '#ff6b6b'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(lp.x), y0 - lift(lp.z), Math.max(2.2, 0.32 * s), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore(); void x0;
  }
  // Discreet highlights: runners (dashed ring), the batter (bat arc while swinging) and the fielder holding the ball.
  function drawHighlights(state) {
    if (S() >= 2.2) { const s = S(); ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = Math.max(1, 0.12 * s); ctx.setLineDash([3, 3]); ctx.strokeRect(X(-0.83), Y(0.5) - 3.5 * s * 0.55, 1.66 * s, 2 * s * 0.55); ctx.restore(); } // strike zone
    ctx.save(); ctx.lineWidth = 1.4;
    for (const r of state.runners || []) { const sc = screen.get(r.id); if (!sc) continue; ctx.strokeStyle = 'rgba(255,224,130,.75)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(sc.X, sc.Y, sc.r * 1.45, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
    const b = state.batter && screen.get(state.batter.id);
    if (b && state.batter.swing && (state.t - state.batter.swing.t) < 0.35) {
      const k = (state.t - state.batter.swing.t) / 0.35, dir = state.batter.bats === 'L' ? 1 : -1;
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = Math.max(2, b.r * 0.2); ctx.lineCap = 'round';
      const a0 = dir > 0 ? -Math.PI * 0.95 : -Math.PI * 0.05; ctx.beginPath(); ctx.arc(b.X, b.Y, b.r * 1.9, a0, a0 + dir * Math.PI * 1.15 * k, dir < 0); ctx.stroke();
    }
    const h = state.ball?.holder && screen.get(state.ball.holder);
    if (h) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.X, h.Y, h.r * 1.3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  // Edge arrow if the ball is ever off-screen.
  function drawOffscreenArrow(sx, sy) {
    const W = hd.w, H = hd.h, m = 14; if (sx > m && sx < W - m && sy > m && sy < H - m) return;
    const cx = W / 2, cy = H / 2, ang = Math.atan2(sy - cy, sx - cx), ex = Math.max(m, Math.min(W - m, sx)), ey = Math.max(m, Math.min(H - m, sy));
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = '#d23a3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  function drawBall(state, a) {
    const b = state.ball;
    if (!b || b.hidden) { trail.length = 0; return; }
    const x = (b.px ?? b.x) + (b.x - (b.px ?? b.x)) * a, y = (b.py ?? b.y) + (b.y - (b.py ?? b.y)) * a, z = Math.max(0, (b.pz ?? b.z ?? 0) + ((b.z ?? 0) - (b.pz ?? b.z ?? 0)) * a);
    const sx = X(x), sy = Y(y), lift = z * S() * 0.55;
    trail.push({ x: sx, y: sy - lift }); while (trail.length > 18) trail.shift();
    drawOffscreenArrow(sx, sy - lift);
    const r = Math.max(4.2, Math.min(8.5, 0.7 * S()));
    drawTrackedObject(ctx, { x: sx, y: sy, z: lift, r, color: '#ffffff', rim: '#d23a3a', halo: 'rgba(255,255,255,.85)', trail: b.holder ? [] : trail, airborne: z > 3 });
    if (b.landing && z > 3) { // landing spot ring for fly balls (readability)
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(b.landing.x), Y(b.landing.y), 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // Frame that contains the camera's default view AND the points that must stay visible (ball, holder, lead runner).
  function stretch(c, pts, pad = 26) {
    let x0 = c.cx - c.view / 2, x1 = c.cx + c.view / 2, y0 = c.cy - c.viewH / 2, y1 = c.cy + c.viewH / 2;
    for (const p of pts) { x0 = Math.min(x0, p.x - pad); x1 = Math.max(x1, p.x + pad); y0 = Math.min(y0, p.y - pad); y1 = Math.max(y1, p.y + pad); }
    const w = x1 - x0, h = y1 - y0, k = Math.max(w / c.view, h / c.viewH);
    return [(x0 + x1) / 2, (y0 + y1) / 2, c.view * k, c.viewH * k];
  }
  function keyPoints(state) {
    const b = state.ball, pts = [];
    if (b && !b.hidden) pts.push({ x: b.x, y: b.y });
    const h = b?.holder && (state.fielders || []).find(f => f.id === b.holder); if (h) pts.push({ x: h.x, y: h.y });
    return pts;
  }
  function cameraTarget(state) {
    const c = CAMERAS[mode], inPlay = state.phase === 'PLAY' && state.ball && !state.ball.hidden;
    if (mode === 'BALL') { // field follow: ball + fielder holding it + the most advanced runner
      const pts = keyPoints(state); if (inPlay) { const lead = [...(state.runners || [])].sort((a, d) => (d.prog ?? d.base) - (a.prog ?? a.base))[0]; if (lead) pts.push({ x: lead.x, y: lead.y }); }
      if (!pts.length) return [c.cx, c.cy, c.view, c.viewH];
      const [x, y, v, vh] = stretch({ cx: 0, cy: 70, view: 120, viewH: 90 }, pts, 22); return [x * 0.85, y, Math.max(c.view * 0.8, v), Math.max(c.viewH * 0.8, vh)];
    }
    if (mode === 'BROADCAST' && state.ball && !state.ball.hidden && (state.ball.y > 120 || Math.abs(state.ball.x) > 90)) {
      const b = state.ball; return [b.x * 0.7, Math.max(c.cy, b.y * 0.75), c.view * 1.25, c.viewH * 1.25];
    }
    if (inPlay && mode !== 'FULL' && mode !== 'TACTICAL') return stretch(c, keyPoints(state), 34); // close cameras never lose the ball
    return [c.cx, c.cy, c.view, c.viewH];
  }

  function render(state, alpha = 1, opts = {}) {
    const now = performance.now() / 1000, dt = lastT ? Math.min(0.1, now - lastT) : 0; lastT = now;
    if (opts.camera && CAMERAS[opts.camera]) mode = opts.camera;
    hd.begin(); cam.setViewport(hd.w, hd.h);
    const [tx, ty, vw, vh] = opts.cameraTarget || cameraTarget(state);
    cam.target(tx, ty, vw, vh); cam.update(dt, state.phase === 'PLAY' ? 7 : 2.6); // snappier while the ball is in play so it never leaves the frame
    drawPark(state);
    if (opts.debug && opts.drawDebug) opts.drawDebug(ctx, cam, state, screen);
    drawPitch(state);
    drawAthletes(state, alpha, opts);
    drawHighlights(state);
    drawBall(state, alpha);
    const vg = ctx.createRadialGradient(hd.w / 2, hd.h / 2, Math.min(hd.w, hd.h) * 0.35, hd.w / 2, hd.h / 2, Math.max(hd.w, hd.h) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, hd.w, hd.h);
  }

  return {
    render, setCamera(m) { if (CAMERAS[m]) mode = m; }, get camera() { return mode; },
    pick(px, py) { let best = null, bd = Infinity; for (const [, sc] of screen) { const d = Math.hypot(sc.X - px, sc.Y - py); if (d < Math.max(10, sc.r + 4) && d < bd) { bd = d; best = sc.e; } } return best; },
    toScreen: (x, y) => ({ x: X(x), y: Y(y) }), get size() { return { w: hd.w, h: hd.h, dpr: hd.dpr }; }, dispose() { hd.dispose(); },
  };
}

function hexA(hex, a) { const h = (hex || '#000').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
