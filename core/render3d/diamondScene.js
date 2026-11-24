// MLB ballpark in the PlayCanvas stage (world metres; sim feet * 0.3048, home plate at the origin, +y (centre field) -> -z). Pure layout/camera maths + drawing.
import { BASE, MOUND, BASES, FENCE, fencePoint } from '../../mlb/src/field/geometry.js';
import { grainPass, rakeDirt, wear } from './surfaces.js';
import { createProps } from './props.js';
export const FT = 0.3048;
export const TEX = { x0: -440, x1: 440, y0: -70, y1: 450, ppf: 2.4 };

// Outfield fence as a polyline (feet), angle -45..45 degrees.
export function fenceLine(n = 36) { const out = []; for (let i = 0; i <= n; i++) out.push(fencePoint(((-45 + (90 * i) / n) * Math.PI) / 180)); return out; }
export const DIAMOND_CAMERAS = ['BROADCAST', 'BATTER', 'PITCHER', 'INFIELD', 'BALL', 'TACTICAL', 'FULL'];
// ball = {x,y,z} in feet (or null). Returns world { pos, look }.
export function diamondCamera(preset, ball = null) {
  const bx = ball ? ball.x * FT : 0, bz = ball ? -ball.y * FT : -MOUND.y * FT;
  switch (preset) {
    case 'BATTER': return { pos: [-4.2, 1.9, 4.2], look: [0, 1.1, -MOUND.y * FT] };
    case 'PITCHER': return { pos: [3.4, 3.6, -MOUND.y * FT - 7], look: [0, 1.2, 1] };
    case 'INFIELD': return { pos: [0, 16, 20], look: [0, 0, -24] };
    case 'BALL': return { pos: [bx * 0.5, 12, bz + 24], look: [bx, 0, bz] };
    case 'TACTICAL': return { pos: [0, 135, -50], look: [0, 0, -52] };
    case 'FULL': return { pos: [0, 70, 62], look: [0, 0, -50] };
    default: { // behind home plate, high; swings out to follow deep balls
      const deep = ball && !ball.hidden && (ball.y > 120 || Math.abs(ball.x) > 90), fz = deep ? Math.max(bz, -ball.y * FT * 0.8) : -MOUND.y * FT * 0.8, fx = deep ? bx * 0.6 : 0;
      return { pos: [fx * 0.3, 9, 13 + (deep ? 6 : 0)], look: [fx, 0.5, fz] };
    }
  }
}

let fieldCache = null;   // grain pass is per-pixel: build once, copy afterwards
export function drawFieldTexture(cv) {
  if (fieldCache) return fieldCache;   // shared, read-only (only uploaded to the GPU)
  drawFieldTextureRaw(cv);
  if (typeof document !== 'undefined' && cv.getContext && cv.getContext('2d').getImageData) { fieldCache = document.createElement('canvas'); fieldCache.width = cv.width; fieldCache.height = cv.height; fieldCache.getContext('2d').drawImage(cv, 0, 0); return fieldCache; }
  return cv;
}
function drawFieldTextureRaw(cv) {
  const { x0, x1, y0, y1, ppf } = TEX; cv.width = Math.round((x1 - x0) * ppf); cv.height = Math.round((y1 - y0) * ppf);
  const c = cv.getContext('2d'), X = x => (x - x0) * ppf, Y = y => (y1 - y) * ppf, R = r => r * ppf;
  c.fillStyle = '#2f7d32'; c.fillRect(0, 0, cv.width, cv.height);
  for (let y = y0; y < y1; y += 20) if (((y - y0) / 20) % 2 === 0) { c.fillStyle = 'rgba(255,255,255,.045)'; c.fillRect(0, Y(y), cv.width, R(20)); }   // mowing stripes
  const dirt = '#b98a58', dirtD = '#a67845';
  c.strokeStyle = dirtD; c.lineWidth = R(14); c.lineJoin = 'round'; c.beginPath(); fenceLine().forEach((p, i) => { const q = fencePoint(Math.atan2(p.x, p.y), 7); i ? c.lineTo(X(q.x), Y(q.y)) : c.moveTo(X(q.x), Y(q.y)); }); c.stroke();   // warning track
  c.fillStyle = dirt; c.beginPath(); c.arc(X(0), Y(MOUND.y), R(95), 0, Math.PI * 2); c.fill();                       // infield dirt
  c.beginPath(); c.arc(X(0), Y(0), R(26), 0, Math.PI * 2); c.fill();
  const inset = 8, f = BASES.first, s = BASES.second, t = BASES.third; c.fillStyle = '#2f7d32'; c.beginPath();       // inner grass diamond
  c.moveTo(X(0), Y(17)); c.lineTo(X(f.x - inset), Y(f.y)); c.lineTo(X(0), Y(s.y - 11)); c.lineTo(X(t.x + inset), Y(t.y)); c.closePath(); c.fill();
  c.fillStyle = dirtD; c.beginPath(); c.arc(X(0), Y(MOUND.y), R(MOUND.r), 0, Math.PI * 2); c.fill(); c.fillStyle = dirt; c.beginPath(); c.arc(X(0), Y(0), R(13), 0, Math.PI * 2); c.fill();
  rakeDirt(c, X(0), Y(MOUND.y), R(40), R(95), { n: 70 }); wear(c, X(0), Y(0), R(14), 'rgba(80,55,28,.35)'); wear(c, X(0), Y(MOUND.y), R(9), 'rgba(80,55,28,.35)'); for (const b of [BASES.first, BASES.second, BASES.third]) wear(c, X(b.x), Y(b.y), R(9), 'rgba(80,55,28,.25)');
  grainPass(c, cv.width, cv.height, { seed: 5, ppu: ppf });
  c.strokeStyle = '#fff'; c.lineWidth = R(0.45); for (const sg of [-1, 1]) { const e = fencePoint(sg * Math.PI / 4); c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(e.x), Y(e.y)); c.stroke(); }   // foul lines
  c.fillStyle = '#fff'; for (const b of [BASES.first, BASES.second, BASES.third]) { c.save(); c.translate(X(b.x), Y(b.y)); c.rotate(Math.PI / 4); c.fillRect(-R(0.75), -R(0.75), R(1.5), R(1.5)); c.restore(); }
  c.strokeStyle = '#fff'; c.lineWidth = R(0.3);                              // plate + batter's boxes
  for (const sx of [-1, 1]) c.strokeRect(X(sx * 3.5 - 2), Y(-3), R(4), R(6));
  void BASE; void FENCE;
}

export function createDiamond(stage) {
  const { pc, app, root } = stage, parts = [], mats = [], { x0, x1, y0, y1 } = TEX;
  const mat = fn => { const m = new pc.StandardMaterial(); fn(m); m.update(); mats.push(m); return m; };
  const cv = drawFieldTexture(document.createElement('canvas'));
  const tex = new pc.Texture(app.graphicsDevice, { width: cv.width, height: cv.height, format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, anisotropy: 8 }); tex.setSource(cv);
  const turfM = mat(m => { m.diffuse = new pc.Color(1, 1, 1); m.diffuseMap = tex; m.gloss = 0.05; m.useMetalness = true; m.metalness = 0; });
  const add = (e, n) => { e.name = n; root.addChild(e); parts.push(e); return e; };
  const mk = (type, material, shadow = false) => { const e = new pc.Entity(); e.addComponent('render', { type, material, castShadows: shadow, receiveShadows: true }); return e; };
  const turf = mk('plane', turfM); turf.setLocalScale((x1 - x0) * FT, 1, (y1 - y0) * FT); turf.setPosition(((x0 + x1) / 2) * FT, 0, -((y0 + y1) / 2) * FT); add(turf, 'turf');
  const out = mk('plane', mat(m => { m.diffuse = new pc.Color(0.1, 0.3, 0.12); })); out.setLocalScale(700, 1, 700); out.setPosition(0, -0.03, -90); add(out, 'apron');
  const wallM = mat(m => { m.diffuse = new pc.Color(0.08, 0.3, 0.2); m.gloss = 0.2; m.useMetalness = true; m.metalness = 0; }), poleM = mat(m => { m.diffuse = new pc.Color(1, 0.85, 0.1); });
  const F = fenceLine(); for (let i = 0; i < F.length - 1; i++) {
    const a = F[i], b = F[i + 1], dx = (b.x - a.x) * FT, dz = -(b.y - a.y) * FT, len = Math.hypot(dx, dz), yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
    const w = mk('box', wallM, true); w.setLocalScale(len + 0.05, 2.4, 0.3); w.setPosition(((a.x + b.x) / 2) * FT, 1.2, -((a.y + b.y) / 2) * FT); w.setEulerAngles(0, yaw, 0); add(w, 'fence');
  }
  for (const sg of [-1, 1]) { const e = fencePoint(sg * Math.PI / 4), p = mk('cylinder', poleM); p.setLocalScale(0.2, 12, 0.2); p.setPosition(e.x * FT, 6, -e.y * FT); add(p, 'pole'); }
  const white = mat(m => { m.diffuse = new pc.Color(0.97, 0.97, 0.97); });
  for (const b of [BASES.first, BASES.second, BASES.third]) { const e = mk('box', white); e.setLocalScale(0.38, 0.08, 0.38); e.setPosition(b.x * FT, 0.04, -b.y * FT); e.setEulerAngles(0, 45, 0); add(e, 'base'); }
  const props = createProps(stage); props.homePlate();
  const mound = mk('cylinder', mat(m => { m.diffuse = new pc.Color(0.65, 0.47, 0.27); })); mound.setLocalScale(MOUND.r * 2 * FT, 0.25, MOUND.r * 2 * FT); mound.setPosition(0, 0.12, -MOUND.y * FT); add(mound, 'mound'); props.pitcherRubber(root, 0.26).setPosition(0, 0.262, -MOUND.y * FT);
  const wasGround = stage.ground.enabled; stage.ground.enabled = false;
  const markers = root.children.filter(e => e.name === 'marker' && e.enabled); markers.forEach(m => { m.enabled = false; });
  return { dispose() { props.dispose(); parts.forEach(p => p.destroy()); mats.forEach(m => m.destroy()); tex.destroy(); stage.ground.enabled = wasGround; markers.forEach(m => { if (m.root) m.enabled = true; }); } };
}
