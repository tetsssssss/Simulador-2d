// NHL rink renderer (presentation only — reads engine state, never mutates it).
// Draws the official rink (boards, glass, lines, circles, creases, nets, benches, penalty boxes), the athletes as
// photo sprites (goalies with their own silhouette) and the puck with halo + trail + owner indicator.
// Cameras: BROADCAST · TACTICAL · PUCK (follow) · FULL (whole rink with benches).
import { attachHiDPI } from '../../../core/render/hidpi.js';
import { createCamera } from '../../../core/render/camera.js';
import { drawSprite, drawTrackedObject, zoomLevel } from '../../../core/render/sprites.js';
import { RINK, MIDY, FACEOFF_DOTS } from './geometry.js';
import { photoImage } from '../photos.js';

export const CAMERAS = {
  BROADCAST: { label: 'Broadcast', view: 128 },
  TACTICAL: { label: 'Tactical', view: 206 },
  PUCK: { label: 'Puck follow', view: 78 },
  FULL: { label: 'Full rink', view: 232, viewH: 120 },
};

export function createRinkRenderer(canvas, { crowd = null } = {}) {
  const hd = attachHiDPI(canvas, { minW: 320, minH: 200 });
  const ctx = hd.ctx;
  const cam = createCamera({ worldMinX: -14, worldMinY: -18, worldMaxX: RINK.L + 14, worldMaxY: RINK.W + 22, margin: 2 });
  let mode = 'BROADCAST', lastT = null, screen = new Map();
  const trail = [];
  let rinkCache = null, rinkKey = '';

  const S = () => cam.scale;
  const X = x => cam.sx(x), Y = y => cam.sy(y);

  function roundedRink(path = new Path2D(), inset = 0) {
    const r = RINK.cornerR - inset, x0 = X(inset), y0 = Y(inset), x1 = X(RINK.L - inset), y1 = Y(RINK.W - inset), rr = r * S();
    path.moveTo(x0 + rr, y0); path.arcTo(x1, y0, x1, y1, rr); path.arcTo(x1, y1, x0, y1, rr); path.arcTo(x0, y1, x0, y0, rr); path.arcTo(x0, y0, x1, y0, rr); path.closePath();
    return path;
  }

  function drawArena(state) {
    const W = hd.w, H = hd.h;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1018'); g.addColorStop(1, '#05080d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (crowd) crowd.draw(ctx, { cam, x0: X(-14), y0: Y(-18), x1: X(RINK.L + 14), y1: Y(RINK.W + 22), rink: { x0: X(-1), y0: Y(-1), x1: X(RINK.L + 1), y1: Y(RINK.W + 1) }, t: state.t || 0 });
    // Benches (bottom side) and penalty boxes (top side), outside the boards.
    const benches = [
      { x0: 58, x1: 92, team: state.home }, { x0: 108, x1: 142, team: state.away },
    ];
    for (const b of benches) {
      ctx.fillStyle = '#121c28'; ctx.fillRect(X(b.x0), Y(RINK.W + 1.5), (b.x1 - b.x0) * S(), 6 * S());
      ctx.fillStyle = b.team?.color || '#34506e'; ctx.fillRect(X(b.x0), Y(RINK.W + 1.5), (b.x1 - b.x0) * S(), 1.1 * S());
      if (S() > 3) { ctx.fillStyle = 'rgba(233,240,247,.75)'; ctx.font = `700 ${Math.max(9, S() * 2.1)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${b.team?.abbr || ''} BENCH`, X((b.x0 + b.x1) / 2), Y(RINK.W + 5)); }
    }
    const boxes = [{ x0: 80, x1: 93, label: 'PEN' }, { x0: 95, x1: 105, label: 'OFF' }, { x0: 107, x1: 120, label: 'PEN' }];
    for (const b of boxes) {
      ctx.fillStyle = '#121c28'; ctx.fillRect(X(b.x0), Y(-7.5), (b.x1 - b.x0) * S(), 6 * S());
      ctx.strokeStyle = '#2b3d54'; ctx.lineWidth = 1; ctx.strokeRect(X(b.x0), Y(-7.5), (b.x1 - b.x0) * S(), 6 * S());
      if (S() > 3) { ctx.fillStyle = 'rgba(160,180,200,.7)'; ctx.font = `700 ${Math.max(8, S() * 1.6)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.label, X((b.x0 + b.x1) / 2), Y(-4.5)); }
    }
  }

  function drawIce(state) {
    const s = S();
    // glass (outer) + boards
    const outer = roundedRink(new Path2D(), -1.2);
    ctx.fillStyle = 'rgba(160,210,255,.10)'; ctx.fill(outer);
    ctx.strokeStyle = 'rgba(190,225,255,.35)'; ctx.lineWidth = Math.max(1, 0.5 * s); ctx.stroke(outer);
    const ice = roundedRink(new Path2D(), 0);
    const g = ctx.createLinearGradient(0, Y(0), 0, Y(RINK.W));
    g.addColorStop(0, '#eef6fc'); g.addColorStop(0.5, '#f7fbfe'); g.addColorStop(1, '#e8f2fa');
    ctx.fillStyle = g; ctx.fill(ice);
    ctx.save(); ctx.clip(ice);
    // attack-zone tint for the team with the puck (who is attacking = visible at a glance)
    const own = state.possession;
    if (own && state.attack) {
      const dir = state.attack[own], team = state[own];
      const x0 = dir > 0 ? RINK.L - RINK.blueLine : 0, x1 = dir > 0 ? RINK.L : RINK.blueLine;
      ctx.fillStyle = hexA(team?.color || '#4d9bff', 0.07); ctx.fillRect(X(x0), Y(0), (x1 - x0) * s, RINK.W * s);
    }
    // goal lines (red), blue lines, center red line
    const vline = (x, w, color) => { ctx.fillStyle = color; ctx.fillRect(X(x - w / 2), Y(0), w * s, RINK.W * s); };
    vline(RINK.goalLine, 0.17, '#d42b3a'); vline(RINK.L - RINK.goalLine, 0.17, '#d42b3a');
    vline(RINK.blueLine, 1, '#2563c9'); vline(RINK.L - RINK.blueLine, 1, '#2563c9');
    vline(RINK.center, 1, '#d42b3a');
    // center line dashes (visual cue of the official pattern)
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let y = 1.5; y < RINK.W; y += 4) ctx.fillRect(X(RINK.center - 0.08), Y(y), 0.16 * s, 1.6 * s);
    // trapezoids behind the nets
    ctx.strokeStyle = '#d42b3a'; ctx.lineWidth = Math.max(1, 0.17 * s);
    for (const side of [-1, 1]) {
      const gx = side < 0 ? RINK.goalLine : RINK.L - RINK.goalLine, ex = side < 0 ? 0 : RINK.L;
      ctx.beginPath(); ctx.moveTo(X(gx), Y(MIDY - 11)); ctx.lineTo(X(ex), Y(MIDY - 14)); ctx.moveTo(X(gx), Y(MIDY + 11)); ctx.lineTo(X(ex), Y(MIDY + 14)); ctx.stroke();
    }
    // faceoff circles + dots
    for (const d of FACEOFF_DOTS) {
      const red = d.kind !== 'center';
      if (d.kind !== 'neutral') {
        ctx.strokeStyle = red ? '#d42b3a' : '#2563c9'; ctx.lineWidth = Math.max(1, 0.17 * s);
        ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), RINK.circleR * s, 0, Math.PI * 2); ctx.stroke();
        if (red) { // hash marks
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(X(d.x + sx * 2.9), Y(d.y + sy * RINK.circleR * 0.97)); ctx.lineTo(X(d.x + sx * 2.9), Y(d.y + sy * (RINK.circleR + 2))); ctx.stroke(); }
        }
      }
      ctx.fillStyle = red ? '#d42b3a' : '#2563c9';
      ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), (d.kind === 'center' ? 0.5 : 1) * s, 0, Math.PI * 2); ctx.fill();
    }
    // home team mark at center ice
    if (state.home && s > 2.5) {
      ctx.fillStyle = hexA(state.home.color || '#333', 0.12); ctx.beginPath(); ctx.arc(X(RINK.center), Y(MIDY), 9 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hexA(state.home.color || '#333', 0.45); ctx.font = `900 ${Math.max(10, 5 * s)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(state.home.abbr || '', X(RINK.center), Y(MIDY));
    }
    // goal creases + nets
    for (const side of [-1, 1]) {
      const gx = side < 0 ? RINK.goalLine : RINK.L - RINK.goalLine;
      ctx.fillStyle = 'rgba(90,160,235,.35)'; ctx.strokeStyle = '#d42b3a'; ctx.lineWidth = Math.max(1, 0.17 * s);
      ctx.beginPath();
      const a0 = side < 0 ? -Math.PI / 2 : Math.PI / 2, a1 = side < 0 ? Math.PI / 2 : Math.PI * 1.5;
      ctx.moveTo(X(gx), Y(MIDY - 4)); ctx.arc(X(gx), Y(MIDY), RINK.creaseR * s, a0, a1, false); ctx.closePath(); ctx.fill(); ctx.stroke();
      // net (behind the goal line)
      const nx0 = side < 0 ? gx - RINK.netD : gx, nx1 = side < 0 ? gx : gx + RINK.netD;
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(X(nx0), Y(MIDY - 3), (nx1 - nx0) * s, 6 * s);
      ctx.strokeStyle = 'rgba(120,130,140,.6)'; ctx.lineWidth = 0.6;
      for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(X(nx0), Y(MIDY - 3 + k)); ctx.lineTo(X(nx1), Y(MIDY - 3 + k)); ctx.stroke(); }
      ctx.strokeStyle = '#d42b3a'; ctx.lineWidth = Math.max(1.5, 0.35 * s);
      ctx.beginPath(); ctx.moveTo(X(gx), Y(MIDY - 3)); ctx.lineTo(X(side < 0 ? nx0 : nx1), Y(MIDY - 3)); ctx.lineTo(X(side < 0 ? nx0 : nx1), Y(MIDY + 3)); ctx.lineTo(X(gx), Y(MIDY + 3)); ctx.stroke();
    }
    ctx.restore();
    // boards: white with yellow kick plate
    ctx.strokeStyle = '#f2f5f8'; ctx.lineWidth = Math.max(2, 0.8 * s); ctx.stroke(ice);
    ctx.strokeStyle = '#f2c230'; ctx.lineWidth = Math.max(1, 0.25 * s); ctx.stroke(roundedRink(new Path2D(), 0.45));
  }

  function lerp(e, a) { return { x: (e.px ?? e.x) + (e.x - (e.px ?? e.x)) * a, y: (e.py ?? e.y) + (e.y - (e.py ?? e.y)) * a }; }

  function drawPlayers(state, a, opts) {
    screen = new Map();
    const s = S();
    const r = Math.max(4.5, Math.min(26, 1.55 * s)); // ~1.55 ft body radius
    const level = zoomLevel(r);
    const list = [...state.players].sort((p, q) => (p.goalie ? 0 : 1) - (q.goalie ? 0 : 1));
    for (const p of list) {
      const pos = lerp(p, a), team = state[p.team] || {};
      const img = opts.showPhotos !== false ? photoImage(p.p) : null;
      const X0 = X(pos.x), Y0 = Y(pos.y), rr = p.goalie ? r * 1.06 : r;
      drawSprite(ctx, {
        x: X0, y: Y0, r: rr, color: team.color, color2: team.color2, number: p.num ?? '', pos: p.posLabel || p.pos, name: opts.showNames !== false ? p.last : '',
        img, shape: p.goalie ? 'goalie' : 'circle', facing: p.facing, carrier: state.puck?.owner === p.id, target: state.pass?.targetId === p.id,
        selected: opts.selected === p.id, dim: p.onBench, level, t: state.t || 0,
      });
      screen.set(p.id, { X: X0, Y: Y0, r: rr, p });
    }
  }

  function drawPuck(state, a, dt) {
    const pk = state.puck; if (!pk) return;
    const owner = pk.owner ? state.players.find(p => p.id === pk.owner) : null;
    let x, y;
    if (owner) { const o = lerp(owner, a); x = o.x + Math.cos(owner.facing || 0) * 2.2; y = o.y + Math.sin(owner.facing || 0) * 2.2; }
    else { x = (pk.px ?? pk.x) + (pk.x - (pk.px ?? pk.x)) * a; y = (pk.py ?? pk.y) + (pk.y - (pk.py ?? pk.y)) * a; }
    const sx = X(x), sy = Y(y);
    trail.push({ x: sx, y: sy }); while (trail.length > 9) trail.shift();
    const speed = Math.hypot(pk.vx || 0, pk.vy || 0);
    const r = Math.max(3, Math.min(8, 0.75 * S()));
    drawTrackedObject(ctx, { x: sx, y: sy, z: (pk.z || 0) * S(), r, color: '#0b0f14', rim: '#f6c453', halo: owner ? 'rgba(246,196,83,.35)' : 'rgba(255,255,255,.75)', trail: owner || speed < 6 ? trail.slice(-3) : trail, airborne: (pk.z || 0) > 0.6 });
  }

  function cameraTarget(state) {
    const c = CAMERAS[mode];
    const pk = state.puck || { x: RINK.center, y: MIDY };
    if (mode === 'TACTICAL') return [RINK.center, MIDY, c.view, 92];
    if (mode === 'FULL') return [RINK.center, MIDY + 2, c.view, c.viewH];
    if (mode === 'PUCK') return [pk.x, pk.y, c.view, 46];
    // BROADCAST: horizontal follow of the puck, vertical stays near center (TV feel), whole width of the ice visible
    return [pk.x * 0.82 + RINK.center * 0.18, MIDY + (pk.y - MIDY) * 0.25, c.view, 92];
  }

  function render(state, alpha = 1, opts = {}) {
    const now = performance.now() / 1000, dt = lastT ? Math.min(0.1, now - lastT) : 0; lastT = now;
    if (opts.camera && opts.camera !== mode) mode = opts.camera;
    hd.begin();
    cam.setViewport(hd.w, hd.h);
    const [tx, ty, vw, vh] = cameraTarget(state);
    cam.target(tx, ty, vw, vh);
    cam.update(dt, mode === 'PUCK' ? 5 : 3.2);
    drawArena(state);
    drawIce(state);
    if (opts.debug && opts.drawDebug) opts.drawDebug(ctx, cam, state, screen);
    drawPlayers(state, alpha, opts);
    drawPuck(state, alpha, dt);
  }

  return {
    render,
    setCamera(m) { if (CAMERAS[m]) mode = m; },
    get camera() { return mode; },
    pick(px, py) { let best = null, bd = Infinity; for (const [id, sc] of screen) { const d = Math.hypot(sc.X - px, sc.Y - py); if (d < Math.max(10, sc.r + 4) && d < bd) { bd = d; best = sc.p; } } return best; },
    toScreen: (x, y) => ({ x: X(x), y: Y(y) }),
    get size() { return { w: hd.w, h: hd.h, dpr: hd.dpr }; },
    dispose() { hd.dispose(); },
  };
}

function hexA(hex, a) {
  const h = (hex || '#000').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
