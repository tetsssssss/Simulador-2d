// NHL rink in the PlayCanvas stage (world metres: x 0..60.96, z 0..-25.9; sim feet * 0.3048, y -> -z). Pure layout/camera maths + drawing.
import { RINK, MIDY, FACEOFF_DOTS, goalX } from '../../nhl/src/rink/geometry.js';
export const FT = 0.3048, LEN = RINK.L * FT, WID = RINK.W * FT;

// Boards follow a rounded rectangle (corner radius 28 ft). Returns a closed list of {x,y} points in feet.
export function boardsPath(seg = 8) {
  const { L, W, cornerR: r } = RINK, pts = [];
  for (const [cx, cy, a0] of [[r, r, Math.PI], [L - r, r, -Math.PI / 2], [L - r, W - r, 0], [r, W - r, Math.PI / 2]])
    for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * (Math.PI / 2); pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  return pts;
}
// Camera presets (same names as the 2D game: PUCK / BROADCAST / TACTICAL / FULL). px = puck x in feet.
export const RINK_CAMERAS = ['PUCK', 'BROADCAST', 'TACTICAL', 'FULL'];
export function rinkCamera(preset, px = RINK.center) {
  const bx = Math.max(10, Math.min(LEN - 10, px * FT)), mz = -WID / 2;
  switch (preset) {
    case 'PUCK': return { pos: [bx, 5.5, 7], look: [bx, 0.4, mz + 2] };
    case 'TACTICAL': return { pos: [LEN / 2, 46, mz + 6], look: [LEN / 2, 0, mz] };
    case 'FULL': return { pos: [LEN / 2, 30, 24], look: [LEN / 2, 0, mz] };
    default: return { pos: [bx, 11, 15], look: [bx, 0, mz + 3] };
  }
}

export function drawIceTexture(cv, ppf = 12) {
  const { L, W, cornerR: r } = RINK; cv.width = L * ppf; cv.height = W * ppf; const c = cv.getContext('2d'); c.scale(ppf, ppf);
  c.fillStyle = '#d9ebf5'; c.fillRect(0, 0, L, W);
  const line = (x, col, w) => { c.fillStyle = col; c.fillRect(x - w / 2, 0, w, W); };
  line(RINK.center, '#c8202d', 1); line(RINK.goalLine, '#c8202d', 0.35); line(L - RINK.goalLine, '#c8202d', 0.35); line(RINK.blueLine, '#1f4fb4', 1); line(L - RINK.blueLine, '#1f4fb4', 1);
  const circle = (x, y, rad, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke(); };
  for (const d of FACEOFF_DOTS) { c.fillStyle = d.kind === 'center' ? '#1f4fb4' : '#c8202d'; c.beginPath(); c.arc(d.x, d.y, d.kind === 'neutral' ? 0.7 : 1, 0, Math.PI * 2); c.fill(); if (d.kind !== 'neutral') circle(d.x, d.y, RINK.circleR, d.kind === 'center' ? '#1f4fb4' : '#c8202d', 0.2); }
  for (const s of [-1, 1]) { const gx = goalX(s); c.fillStyle = 'rgba(80,140,230,.45)'; c.beginPath(); c.arc(gx, MIDY, RINK.creaseR, s < 0 ? -Math.PI / 2 : Math.PI / 2, s < 0 ? Math.PI / 2 : -Math.PI / 2 + Math.PI * 2 - Math.PI * 2, false); c.fill(); }
  // outside the rounded boards the ice is dark (apron) — drawn as a mask of the rounded rectangle
  c.globalCompositeOperation = 'destination-in'; c.beginPath(); c.roundRect(0, 0, L, W, r); c.fill();
}

export function createRink(stage) {
  const { pc, app, root } = stage, parts = [], mats = [];
  const mat = (fn) => { const m = new pc.StandardMaterial(); fn(m); m.update(); mats.push(m); return m; };
  const cv = document.createElement('canvas'); drawIceTexture(cv);
  const tex = new pc.Texture(app.graphicsDevice, { width: cv.width, height: cv.height, format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, anisotropy: 8 }); tex.setSource(cv);
  const ice = mat(m => { m.diffuse = new pc.Color(1, 1, 1); m.diffuseMap = tex; m.opacityMap = tex; m.opacityMapChannel = 'a'; m.blendType = pc.BLEND_NORMAL; m.alphaTest = 0.5; m.opacityMapChannel = 'a'; m.useMetalness = true; m.metalness = 0.0; m.gloss = 0.85; });
  const add = (e, name) => { e.name = name; root.addChild(e); parts.push(e); return e; };
  const mk = (type, material, shadow = false) => { const e = new pc.Entity(); e.addComponent('render', { type, material, castShadows: shadow, receiveShadows: true }); return e; };
  const apron = mk('plane', mat(m => { m.diffuse = new pc.Color(0.07, 0.08, 0.1); m.gloss = 0.1; m.useMetalness = true; m.metalness = 0; })); apron.setLocalScale(LEN + 40, 1, WID + 40); apron.setPosition(LEN / 2, -0.02, -WID / 2); add(apron, 'apron');
  const sheet = mk('plane', ice); sheet.setLocalScale(LEN, 1, WID); sheet.setPosition(LEN / 2, 0, -WID / 2); add(sheet, 'ice');
  const boardM = mat(m => { m.diffuse = new pc.Color(0.93, 0.93, 0.95); m.gloss = 0.3; m.useMetalness = true; m.metalness = 0; }), glassM = mat(m => { m.diffuse = new pc.Color(0.7, 0.85, 1); m.opacity = 0.16; m.blendType = pc.BLEND_NORMAL; m.cull = pc.CULLFACE_NONE; });
  const P = boardsPath(), n = P.length;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], dx = (b.x - a.x) * FT, dz = -(b.y - a.y) * FT, len = Math.hypot(dx, dz); if (len < 1e-3) continue;
    const cx = ((a.x + b.x) / 2) * FT, cz = -((a.y + b.y) / 2) * FT, yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
    const w = mk('box', boardM, true); w.setLocalScale(len + 0.02, 1.07, 0.12); w.setPosition(cx, 0.535, cz); w.setEulerAngles(0, yaw, 0); add(w, 'boards');
    const g = mk('box', glassM); g.setLocalScale(len + 0.02, 0.95, 0.04); g.setPosition(cx, 1.07 + 0.475, cz); g.setEulerAngles(0, yaw, 0); add(g, 'glass');
  }
  const red = mat(m => { m.diffuse = new pc.Color(0.8, 0.1, 0.12); m.gloss = 0.4; m.useMetalness = true; m.metalness = 0.2; }), netM = mat(m => { m.diffuse = new pc.Color(1, 1, 1); m.opacity = 0.35; m.blendType = pc.BLEND_NORMAL; m.cull = pc.CULLFACE_NONE; });
  for (const s of [-1, 1]) {
    const gx = goalX(s) * FT, hw = (RINK.netW * FT) / 2, h = 1.22, d = RINK.netD * FT * s * -1, z0 = -MIDY * FT;
    for (const dz of [-hw, hw]) { const p = mk('box', red, true); p.setLocalScale(0.08, h, 0.08); p.setPosition(gx, h / 2, z0 + dz); add(p, 'post'); }
    const bar = mk('box', red, true); bar.setLocalScale(0.08, 0.08, hw * 2); bar.setPosition(gx, h, z0); add(bar, 'bar');
    const back = mk('box', netM); back.setLocalScale(Math.abs(d), h, hw * 2); back.setPosition(gx + d / 2, h / 2, z0); add(back, 'net');
  }
  const wasGround = stage.ground.enabled; stage.ground.enabled = false;
  const sc = app.scene; sc.fog.density = 0; stage.camera.camera.clearColor = new pc.Color(0.05, 0.06, 0.09); sc.ambientLight = new pc.Color(0.5, 0.52, 0.58);
  stage.sun.light.intensity = 1.2; stage.sun.light.color = new pc.Color(1, 1, 1); stage.sun.setEulerAngles(78, 10, 0);
  return { dispose() { parts.forEach(p => p.destroy()); mats.forEach(m => m.destroy()); tex.destroy(); stage.ground.enabled = wasGround; } };
}
