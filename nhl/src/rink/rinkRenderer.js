// NHL rink renderer (presentation only — reads engine state, never mutates it).
// Draws the official rink (boards, glass, lines, circles, creases, nets, benches, penalty boxes), the athletes as
// photo sprites (goalies with their own silhouette) and the puck with halo + trail + owner indicator.
// Cameras: BROADCAST · TACTICAL · PUCK (follow) · FULL (whole rink with benches).
import { attachHiDPI } from '../../../core/render/hidpi.js';
import { createCamera } from '../../../core/render/camera.js';
import { drawSprite, drawTrackedObject, zoomLevel } from '../../../core/render/sprites.js';
import { RINK, MIDY, FACEOFF_DOTS } from './geometry.js';
import { photoImage } from '../photos.js';
import { getAvatar } from '../../../core/render/avatars.js';

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
    if (crowd) crowd.draw(ctx, { cam, t: state.t ?? performance.now() / 1000, view: { w: W, h: H } });
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
      ctx.fillStyle = hexA(state.home.color || '#333', 0.08); ctx.beginPath(); ctx.arc(X(RINK.center), Y(MIDY), 9 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hexA(state.home.color || '#333', 0.22); ctx.font = `900 ${Math.max(10, 5 * s)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
    drawGlass(outer);
  }

  // Glass above the boards: a translucent band with a bright top edge, stanchions and a diagonal reflection sheen.
  function drawGlass(outer) {
    const s = S();
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(150,205,255,.22)'; ctx.lineWidth = Math.max(2, 1.9 * s); ctx.stroke(outer);           // glass body
    ctx.strokeStyle = 'rgba(235,248,255,.85)'; ctx.lineWidth = Math.max(1, 0.28 * s); ctx.stroke(outer);           // top edge
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, 0.18 * s); ctx.stroke(roundedRink(new Path2D(), -2.3)); // outer frame
    // stanchions every 12 ft along the long sides, reflection streaks inside the glass
    ctx.fillStyle = 'rgba(210,225,240,.55)';
    for (let x = 14; x < RINK.L - 10; x += 12) for (const y of [-1.2, RINK.W + 1.2]) ctx.fillRect(X(x) - 0.5, Y(y) - 1.2 * s, Math.max(1, 0.25 * s), 2.4 * s);
    ctx.lineWidth = Math.max(1, 0.45 * s); ctx.lineCap = 'round';
    for (let x = 8; x < RINK.L - 8; x += 31) for (const y of [-1.2, RINK.W + 1.2]) {
      const g = ctx.createLinearGradient(X(x), Y(y), X(x + 9), Y(y));
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(X(x), Y(y) + 0.5 * s); ctx.lineTo(X(x + 9), Y(y) - 0.5 * s); ctx.stroke();
    }
    ctx.restore();
  }

  function lerp(e, a) { return { x: (e.px ?? e.x) + (e.x - (e.px ?? e.x)) * a, y: (e.py ?? e.y) + (e.y - (e.py ?? e.y)) * a }; }

  function drawPlayers(state, a, opts) {
    screen = new Map();
    const s = S();
    const r = Math.max(4.5, Math.min(26, 1.55 * s)) * (opts.visual === 'avatar' ? 1.45 : 1); // ~1.55 ft body radius (avatars drawn larger)
    const level = zoomLevel(r);
    const list = [...state.players].sort((p, q) => (p.goalie ? 0 : 1) - (q.goalie ? 0 : 1));
    for (const p of list) {
      const pos = lerp(p, a), team = state[p.team] || {};
      const mode = opts.visual || (opts.showPhotos === false ? 'plain' : 'photo');
      const img = mode === 'photo' ? photoImage(p.p) : null;
      // hints for the avatar: goalie silhouette, low stance in crossovers / stops / wind-ups, facing side, stride flag
      const low = !p.goalie && (p.cross || p.wind || p.skate === 'brake');
      const avatar = mode === 'avatar' ? { opts: getAvatar('nhl', p.p?.id ?? p.pid ?? p.id), kit: 'hockey', role: p.goalie ? 'goalie' : 'skater', prop: 'stick', pose: p.goalie ? 'goalie' : low ? 'crouch' : 'stand',
        moving: Math.hypot(p.x - (p.px ?? p.x), p.y - (p.py ?? p.y)) > 0.03, seed: (p.num || 0) % 9, dir: Math.cos(p.facing || 0) >= 0 ? 1 : -1,
        crossover: !!p.cross, backward: !!p.back, goalieState: p.state || null } : null;
      const X0 = X(pos.x), Y0 = Y(pos.y), rr = p.goalie ? r * 1.06 : r;
      drawSprite(ctx, {
        x: X0, y: Y0, r: rr, color: team.color, color2: team.color2, number: p.num ?? '', pos: p.posLabel || p.pos, name: opts.showNames !== false ? p.last : '',
        img, avatar, shape: p.goalie ? 'goalie' : 'circle', facing: p.facing, carrier: state.puck?.owner === p.id, target: state.pass?.targetId === p.id,
        selected: opts.selected === p.id, dim: p.onBench, level, t: state.t || 0,
      });
      screen.set(p.id, { X: X0, Y: Y0, r: rr, p });
      if (p.goalie) drawGoalieState(p, X0, Y0, rr, state);
      else if (p.cross || p.skate === 'brake') drawStride(p, X0, Y0, rr, state.t || 0);
    }
    drawHighlights(state, a, r);
  }

  // Goalie save pose, read from goalie.state: pad spread (butterfly / pad save / slide), glove or blocker flash.
  const SAVE_COL = { BUTTERFLY: '#5cdcff', SLIDE: '#7cf0b6', GLOVE: '#ffd24a', BLOCKER: '#ff9a4a', PAD_SAVE: '#c58bff', RECOVER: '#ff6a6a' };
  function drawGoalieState(p, x, y, r, state) {
    const st = p.state; if (!st || st === 'READY') return;
    const col = SAVE_COL[st] || '#fff', ux = Math.cos(p.facing || 0), uy = Math.sin(p.facing || 0);
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.lineCap = 'round';
    if (st === 'BUTTERFLY' || st === 'PAD_SAVE' || st === 'SLIDE') { // pads fanned out sideways (perpendicular to facing)
      const span = r * (st === 'BUTTERFLY' ? 1.5 : st === 'SLIDE' ? 1.9 : 1.2), nx = -uy, ny = ux, ox = ux * r * 0.55, oy = uy * r * 0.55;
      ctx.lineWidth = Math.max(2, r * 0.32); ctx.beginPath(); ctx.moveTo(x + ox - nx * span, y + oy - ny * span); ctx.lineTo(x + ox + nx * span, y + oy + ny * span); ctx.stroke();
    } else if (st === 'GLOVE' || st === 'BLOCKER') { // hand flash toward the shot side
      const side = st === 'GLOVE' ? -1 : 1, nx = -uy, ny = ux;
      ctx.beginPath(); ctx.arc(x + ux * r * 0.8 + nx * side * r * 0.95, y + uy * r * 0.8 + ny * side * r * 0.95, Math.max(3, r * 0.3), 0, Math.PI * 2); ctx.fill();
    } else if (st === 'RECOVER') { ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  // short stride marks while a skater carves a crossover or stops hard (ice spray)
  function drawStride(p, x, y, r, t) {
    const back = (p.facing || 0) + Math.PI, k = Math.sin(t * 16 + (p.num || 0)), nx = -Math.sin(back), ny = Math.cos(back);
    ctx.save(); ctx.strokeStyle = p.skate === 'brake' ? 'rgba(180,215,255,.75)' : 'rgba(110,150,200,.55)'; ctx.lineWidth = Math.max(1, r * 0.12); ctx.lineCap = 'round';
    for (const sgn of [-1, 1]) { const o = sgn * r * 0.45 * (1 + 0.25 * k * sgn); ctx.beginPath(); ctx.moveTo(x + nx * o + Math.cos(back) * r * 0.9, y + ny * o + Math.sin(back) * r * 0.9 + r * 0.5); ctx.lineTo(x + nx * o + Math.cos(back) * r * 1.9, y + ny * o + Math.sin(back) * r * 1.9 + r * 0.5); ctx.stroke(); }
    ctx.restore();
  }
  // discreet highlights: arrow over the puck carrier (possession), pass target arrow line, short-lived ring on the last shooter
  function drawHighlights(state, a, r) {
    const pk = state.puck, carrier = pk?.owner ? screen.get(pk.owner) : null;
    ctx.save();
    if (carrier) { // possession chevron above the carrier
      const bob = Math.sin((state.t || 0) * 7) * 1.5, cx = carrier.X, cy = carrier.Y - carrier.r * 2.55 - 6 + bob, w = Math.max(4, r * 0.4);
      ctx.fillStyle = 'rgba(246,196,83,.95)'; ctx.strokeStyle = 'rgba(20,24,30,.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - w, cy - w); ctx.lineTo(cx + w, cy - w); ctx.lineTo(cx, cy + w * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    const tg = state.pass?.targetId ? screen.get(state.pass.targetId) : null;
    if (tg && pk && !pk.owner) { // dotted line puck → pass target
      const px = X(pk.x), py = Y(pk.y); ctx.strokeStyle = 'rgba(37,150,190,.65)'; ctx.lineWidth = 1.4; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tg.X, tg.Y); ctx.stroke(); ctx.setLineDash([]);
    }
    const ls = state.lastShotInfo, age = ls ? (state.t || 0) - ls.t : 9;
    if (ls && age >= 0 && age < 1.8 && screen.get(ls.by)) { // last shooter: ring that expands and fades
      const sc = screen.get(ls.by), k = age / 1.8;
      ctx.strokeStyle = `rgba(255,86,70,${0.9 * (1 - k)})`; ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.beginPath(); ctx.ellipse(sc.X, sc.Y + sc.r * 0.62, sc.r * (1.3 + 0.9 * k), sc.r * (1.3 + 0.9 * k) * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPuck(state, a, dt) {
    const pk = state.puck; if (!pk) return;
    const owner = pk.owner ? state.players.find(p => p.id === pk.owner) : null;
    let x, y;
    if (owner) { const o = lerp(owner, a); x = o.x + Math.cos(owner.facing || 0) * 2.2; y = o.y + Math.sin(owner.facing || 0) * 2.2; }
    else { x = (pk.px ?? pk.x) + (pk.x - (pk.px ?? pk.x)) * a; y = (pk.py ?? pk.y) + (pk.y - (pk.py ?? pk.y)) * a; }
    if (!Number.isFinite(x + y)) { x = RINK.center; y = MIDY; }
    const sx = X(x), sy = Y(y);
    if (!trail.length || Math.hypot(trail[trail.length - 1].x - sx, trail[trail.length - 1].y - sy) > 1) trail.push({ x: sx, y: sy });
    while (trail.length > 12) trail.shift();
    const speed = Math.hypot(pk.vx || 0, pk.vy || 0);
    const r = Math.max(3.4, Math.min(9, 0.8 * S()));
    // discreet trail (dark on white ice), only while the puck is travelling
    if (!owner && speed > 8 && trail.length > 1) {
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) { const k = i / trail.length; ctx.strokeStyle = `rgba(30,60,100,${0.28 * k})`; ctx.lineWidth = Math.max(1, r * 0.8 * k); ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke(); }
      ctx.restore();
    }
    // halo: warm ring so the puck never gets lost against the white ice (stronger when loose)
    ctx.save();
    const pulse = 1 + 0.12 * Math.sin((state.t || 0) * 9), hr = r * (owner ? 2.3 : 3.1) * pulse;
    const g = ctx.createRadialGradient(sx, sy - (pk.z || 0) * S() * 0.5, r * 0.6, sx, sy, hr);
    g.addColorStop(0, owner ? 'rgba(246,196,83,.5)' : 'rgba(255,110,60,.55)'); g.addColorStop(1, 'rgba(255,110,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, hr, 0, Math.PI * 2); ctx.fill();
    if (!owner) { ctx.strokeStyle = 'rgba(255,90,40,.85)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(sx, sy, r * 1.9, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    drawTrackedObject(ctx, { x: sx, y: sy, z: (pk.z || 0) * S() * 0.6, r, color: '#0b0f14', rim: '#f6c453', halo: 'rgba(255,255,255,0)', trail: [], airborne: (pk.z || 0) > 0.6 });
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
