// NFL field in 3D: striped grass texture (generated in a 2D canvas: yard lines, hash marks, numbers, end zones with team colours / abbreviations — no third-party logos),
// goal posts, ball, line-of-scrimmage / first-down markers and a broadcast camera. Layout and camera maths are pure and unit-tested; drawing needs a canvas.
import { worldFromSim } from './athletes.js';

export const FIELD = Object.freeze({ length: 120, width: 160 / 3, endZone: 10, hashFromSide: 70.75 / 3, hashGap: 18.5 / 3 });   // yards (width 53.33; hash marks 70'9" from the sideline, 18'6" apart)
const YD = 0.9144;

// Everything drawn on the grass, in field yards (x downfield 0..120, y across 0..53.33). Pure data -> tested.
export function fieldLayout() {
  const lines = []; for (let x = 10; x <= 110; x += 5) lines.push({ x, kind: x % 10 === 0 ? 'major' : 'minor', goal: x === 10 || x === 110 });
  const numbers = []; for (let x = 20; x <= 100; x += 10) { const v = x <= 60 ? x - 10 : 110 - x; numbers.push({ x, label: String(v), rows: [{ y: 11.5, flip: false }, { y: FIELD.width - 11.5, flip: true }] }); }
  const hashY = [FIELD.hashFromSide, FIELD.width - FIELD.hashFromSide]; const ticks = []; for (let x = 11; x <= 109; x++) if (x % 5 !== 0) ticks.push({ x, ys: [...hashY, 0.6, FIELD.width - 0.6] });
  return { lines, numbers, hashY, ticks, endZones: [{ x0: 0, x1: 10, side: 'home' }, { x0: 110, x1: 120, side: 'away' }], stripeEvery: 5 };
}

// Draws the field into `canvas` (PX_PER_YD pixels per yard). Colours are CSS strings.
export const PX_PER_YD = 20;
export function drawFieldTexture(canvas, { homeColor = '#0a2870', awayColor = '#b3141d', homeAbbr = 'HOME', awayAbbr = 'AWAY' } = {}) {
  const W = FIELD.length * PX_PER_YD, H = Math.round(FIELD.width * PX_PER_YD); canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d'), L = fieldLayout(), px = v => v * PX_PER_YD;
  for (let x = 0; x < FIELD.length; x += L.stripeEvery) { c.fillStyle = ((x / L.stripeEvery) | 0) % 2 ? '#2c7a32' : '#2f8236'; c.fillRect(px(x), 0, px(L.stripeEvery), H); }
  for (const z of L.endZones) { c.fillStyle = z.side === 'home' ? homeColor : awayColor; c.fillRect(px(z.x0), 0, px(z.x1 - z.x0), H); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px(z.x0), 0, px(z.x1 - z.x0), H); }
  c.strokeStyle = '#f4f4f0'; c.lineCap = 'butt';
  for (const l of L.lines) { c.lineWidth = px(l.goal ? 0.33 : l.kind === 'major' ? 0.22 : 0.14); c.beginPath(); c.moveTo(px(l.x), 0); c.lineTo(px(l.x), H); c.stroke(); }
  c.lineWidth = px(0.4); c.strokeRect(px(0.2), px(0.2), W - px(0.4), H - px(0.4));            // end lines and sidelines
  c.lineWidth = px(0.1); for (const t of L.ticks) for (const y of t.ys) { c.beginPath(); c.moveTo(px(t.x), px(y - 0.35)); c.lineTo(px(t.x), px(y + 0.35)); c.stroke(); }
  c.fillStyle = '#f4f4f0'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 ${px(2.6)}px "Arial Narrow", Arial, sans-serif`;
  for (const n of L.numbers) for (const r of n.rows) { c.save(); c.translate(px(n.x), px(r.y)); if (r.flip) c.rotate(Math.PI); c.fillText(n.label, 0, 0); c.restore(); }
  for (const [x, abbr, flip] of [[5, homeAbbr, false], [115, awayAbbr, true]]) { c.save(); c.translate(px(x), H / 2); c.rotate(flip ? Math.PI / 2 : -Math.PI / 2); c.font = `900 ${px(5)}px Arial, sans-serif`; c.fillStyle = 'rgba(255,255,255,.92)'; c.fillText(String(abbr).toUpperCase().slice(0, 8), 0, 0); c.restore(); }
  c.beginPath(); c.arc(px(60), H / 2, px(5), 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.14)'; c.fill();   // midfield disc (no logo)
  return canvas;
}

// Broadcast camera: behind the near sideline, high, looking at the ball's x. followCam eases toward the target with a critically damped step (frame-rate independent).
export function broadcastTarget(sport, ballX, { height = 17, back = 30 } = {}) {
  const x = Math.max(18, Math.min(FIELD.length * YD - 18, ballX * YD));
  return { pos: [x, height, back], look: [x, 0, -FIELD.width * YD * 0.42] };
}
export function followStep(cur, target, dt, smooth = 0.18) {   // smooth = seconds to close ~63 % of the gap
  const k = 1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, smooth));
  return cur.map((v, i) => v + (target[i] - v) * k);
}

export async function createNflField(stage, opts = {}) {
  const { pc, app, root } = stage;
  const cv = document.createElement('canvas'); drawFieldTexture(cv, opts);
  const tex = new pc.Texture(app.graphicsDevice, { width: cv.width, height: cv.height, format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, anisotropy: 8 }); tex.setSource(cv);
  const mat = new pc.StandardMaterial(); mat.diffuse = new pc.Color(1, 1, 1); mat.diffuseMap = tex; mat.gloss = 0.08; mat.metalness = 0; mat.useMetalness = true; mat.update();
  stage.ground.enabled = false;     // the stand-in plane of the empty scene
  const L = FIELD.length * YD, Wd = FIELD.width * YD, field = new pc.Entity('field'); root.addChild(field);
  const turf = new pc.Entity('turf'); turf.addComponent('render', { type: 'plane', material: mat, castShadows: false, receiveShadows: true });
  turf.setLocalScale(L, 1, Wd); turf.setPosition(L / 2, 0, -Wd / 2); field.addChild(turf);
  const apronMat = new pc.StandardMaterial(); apronMat.diffuse = new pc.Color(0.07, 0.2, 0.09); apronMat.update();
  const apron = new pc.Entity('apron'); apron.addComponent('render', { type: 'plane', material: apronMat, receiveShadows: true }); apron.setLocalScale(L + 90, 1, Wd + 70); apron.setPosition(L / 2, -0.02, -Wd / 2); field.addChild(apron);
  // goal posts (yellow): base, crossbar at 10 ft (3.05 m), uprights 18'6" apart reaching ~9 m
  const yellow = new pc.StandardMaterial(); yellow.diffuse = new pc.Color(0.98, 0.82, 0.1); yellow.update();
  const part = (type, s, p) => { const e = new pc.Entity('post'); e.addComponent('render', { type, material: yellow, castShadows: true }); e.setLocalScale(...s); e.setPosition(...p); field.addChild(e); return e; };
  for (const x of [0, L]) { const dir = x === 0 ? -0.5 : 0.5, w = (18.5 / 3) * YD; part('cylinder', [0.25, 3.05, 0.25], [x + dir, 1.5, -Wd / 2]); part('box', [0.12, 0.12, w], [x + dir, 3.05, -Wd / 2]); for (const s of [-1, 1]) part('cylinder', [0.1, 6.5, 0.1], [x + dir, 3.05 + 3.25, -Wd / 2 + s * w / 2]); }
  // ball (NFL ball ~28 cm long): a flattened sphere along the throw direction
  const brown = new pc.StandardMaterial(); brown.diffuse = new pc.Color(0.42, 0.2, 0.09); brown.gloss = 0.35; brown.update();
  const ball = new pc.Entity('ball'); ball.addComponent('render', { type: 'sphere', material: brown, castShadows: true }); ball.setLocalScale(0.28, 0.17, 0.17); ball.enabled = false; field.addChild(ball);
  // line of scrimmage (blue) and first-down line (yellow): thin boxes across the field
  const mk = (r, g, b) => { const m = new pc.StandardMaterial(); m.diffuse = new pc.Color(r, g, b); m.emissive = new pc.Color(r * .6, g * .6, b * .6); m.update(); const e = new pc.Entity('line'); e.addComponent('render', { type: 'box', material: m, castShadows: false }); e.setLocalScale(0.25, 0.03, Wd); e.setPosition(0, 0.03, -Wd / 2); e.enabled = false; field.addChild(e); return e; };
  const los = mk(0.2, 0.5, 1), fd = mk(1, 0.85, 0.1);
  return {
    field, ball,
    setBall(x, y, z = 0.14, yaw = 0) { ball.enabled = true; ball.setPosition(...worldFromSim('nfl', x, y, z)); ball.setEulerAngles(0, yaw, 0); },
    hideBall() { ball.enabled = false; },
    setLines(losX, fdX) { for (const [e, x] of [[los, losX], [fd, fdX]]) { e.enabled = Number.isFinite(x) && x >= 0 && x <= FIELD.length; if (e.enabled) e.setPosition(x * YD, 0.03, -Wd / 2); } },
    dispose() { tex.destroy(); mat.destroy(); apronMat.destroy(); yellow.destroy(); brown.destroy(); field.destroy(); stage.ground.enabled = true; },
  };
}
