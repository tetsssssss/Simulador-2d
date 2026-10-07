// Procedural "bonequinhos" (chibi athletes) drawn with canvas primitives — presentation only, no images needed.
// Each athlete has a small option set (skin, hair style/color, facial hair, accessory, build, headgear on/off). Defaults are
// derived deterministically from the player id, so every athlete looks different without any setup; the user can override
// any option in the avatar editor. Choices persist in localStorage (per sport + player id).
//
//   drawAvatar(ctx, { x, y, h, opts, kit, color, color2, number, facing, moving, t, prop, pose, role })
//     (x,y) = feet position (ground contact), h = total figure height in CSS px.

export const SKINS = ['#f6d5b8', '#efc29c', '#d9a073', '#b97a4f', '#8a5434', '#5b3722'];
export const HAIR_COLORS = ['#15110e', '#3b2415', '#6b4423', '#a8742f', '#d9b25f', '#8c8c92', '#b3341f'];
export const HAIR_STYLES = ['Raspado', 'Curto', 'Longo', 'Cacheado', 'Careca', 'Moicano', 'Rabo de cavalo'];
export const BEARDS = ['Nenhuma', 'Barba rala', 'Barba cheia', 'Bigode'];
export const ACCESSORIES = ['Nenhum', 'Óculos', 'Faixa', 'Eye black'];
export const BUILDS = ['Magro', 'Médio', 'Forte'];
export const GEAR = ['Equipado', 'Sem capacete/boné'];

const hash = s => { let h = 2166136261; for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (h, shift, n) => (((h >>> shift) ^ (h >>> (shift + 7))) >>> 0) % n;

export function defaultAvatar(id) {
  const h = hash(`avatar|${id}`);
  const hairR = pick(h, 6, 100);
  return {
    skin: pick(h, 0, SKINS.length), hairStyle: pick(h, 3, HAIR_STYLES.length), hairColor: hairR < 38 ? 0 : hairR < 62 ? 1 : hairR < 80 ? 2 : hairR < 90 ? 3 : hairR < 95 ? 4 : hairR < 98 ? 5 : 6,
    beard: pick(h, 11, 100) < 62 ? 0 : pick(h, 13, 3) + 1, accessory: pick(h, 17, 100) < 70 ? 0 : pick(h, 19, 3) + 1, build: pick(h, 21, BUILDS.length), gear: 0,
  };
}
export function randomAvatar(rng = Math.random) {
  const r = n => Math.floor(rng() * n);
  return { skin: r(SKINS.length), hairStyle: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), beard: rng() < 0.55 ? 0 : 1 + r(3), accessory: rng() < 0.6 ? 0 : 1 + r(3), build: r(BUILDS.length), gear: 0 };
}

// ---- persistence (v1): { [sport]: { [playerId]: opts } } + the global visual mode ----
const KEY = 'asu_avatars_v1', MODE_KEY = 'asu_visual_mode';
let mem = null;
function read() { if (mem) return mem; try { mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { mem = {}; } return mem; }
function write() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* private mode */ } }
export function getAvatar(sport, id) { return { ...defaultAvatar(`${sport}|${id}`), ...(read()[sport]?.[id] || {}) }; }
export function hasCustomAvatar(sport, id) { return !!read()[sport]?.[id]; }
export function setAvatar(sport, id, opts) { const m = read(); (m[sport] ||= {})[id] = { ...opts }; write(); }
export function resetAvatar(sport, id) { const m = read(); if (m[sport]) delete m[sport][id]; write(); }
export const VISUAL_MODES = [['avatar', 'Bonecos'], ['photo', 'Fotos'], ['plain', 'Cor + número']];
export function getVisualMode() { try { const v = localStorage.getItem(MODE_KEY); if (v === 'photo' || v === 'plain') return v; return 'avatar'; } catch { return 'avatar'; } }
export function setVisualMode(v) { try { localStorage.setItem(MODE_KEY, v); } catch { /* private mode */ } }

const shade = (hex, f) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); const c = k => Math.max(0, Math.min(255, Math.round(((n >> k) & 255) * f))); return `rgb(${c(16)},${c(8)},${c(0)})`; };
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function limb(ctx, x0, y0, x1, y1, w, color) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }

// kit: 'baseball' | 'hockey' | 'football'. prop: 'bat' | 'stick' | 'glove' | 'ball' | 'none'. pose: 'stand' | 'crouch' | 'goalie'.
// action (optional): { type: 'swing' | 'throw' | 'shoot' | 'catch' | 'celebrate' | 'dive' | 'check', t: 0..1 } — one-shot animations the sport
// renderer drives from engine events. Locomotion is a procedural cycle: two-bone legs (knee bend, foot lift), counter-swinging arms,
// forward lean with speed, head bob; hockey skaters glide (stride + lean) instead of stepping. Sharpness: the feet anchor is snapped to
// the device-pixel grid and strokes use round caps/joins, so small figures stay crisp instead of shimmering between pixels.
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => t * t * (3 - 2 * t);
export function drawAvatar(ctx, o) {
  const { h, opts, kit = 'baseball', color = '#1d4ed8', color2 = '#ffffff', number = '', facing = null, moving = false, t = 0,
    prop = 'none', pose = 'stand', role = '', showNumber = true, seed = 0, action = null, speed = null } = o;
  let { x, y } = o;
  const dpr = ctx.getTransform?.()?.a || 1;
  x = Math.round(x * dpr) / dpr; y = Math.round(y * dpr) / dpr;
  const u = h / 10, a = { ...defaultAvatar('x'), ...opts };
  const dir = facing != null && Math.abs(Math.cos(facing)) > 0.2 ? Math.sign(Math.cos(facing)) : (o.dir || 1);
  const sp = moving ? clamp01(speed == null ? 1 : speed) : 0;
  const skate = kit === 'hockey' && pose !== 'goalie';
  const ph = t * (skate ? 6 : 11) + seed * 1.7, sw = moving ? Math.sin(ph) : 0;
  const act = action && action.type ? { type: action.type, p: clamp01(action.t ?? 0) } : null;
  const breathe = moving ? 0 : Math.sin(t * 2.2 + seed) * 0.1 * u;
  const bob = moving ? Math.abs(Math.cos(ph)) * (skate ? 0.12 : 0.34) * u : breathe;
  const skin = SKINS[a.skin % SKINS.length], skinD = shade(skin, 0.78), hair = HAIR_COLORS[a.hairColor % HAIR_COLORS.length];
  const bw = [0.88, 1, 1.18][a.build % 3], crouch = pose === 'crouch' ? 1.5 * u : 0;
  const pants = kit === 'baseball' ? (role === 'batter' || role === 'runner' ? '#e9edf2' : '#dfe5ec') : kit === 'hockey' ? shade(color, 0.62) : color2 === '#ffffff' ? '#e9edf2' : color2;
  const sock = kit === 'baseball' ? color : kit === 'hockey' ? color2 : color;
  const lw = ctx.lineWidth; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.translate(x, y);
  // ground shadow (squashes while airborne / celebrating)
  const air = act?.type === 'celebrate' ? Math.abs(Math.sin(act.p * Math.PI * 3)) * 1.3 * u : 0;
  ctx.fillStyle = `rgba(0,0,0,${0.32 - air * 0.05})`; ctx.beginPath(); ctx.ellipse(0, 0.2 * u, (2.1 * u - air * 0.2) * bw, 0.75 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, -bob - air);
  const hipY = -3.5 * u + crouch * 0.4, shY = -6.2 * u + crouch, headY = -8.2 * u + crouch * 1.1, torsoW = 3.1 * u * bw;
  const legW = 1.15 * u * (pose === 'goalie' ? 1.9 : 1);
  // ---- legs: two bones (hip → knee → foot) ----
  const stride = (skate ? 1.9 : 1.55) * u * (0.6 + 0.4 * sp), spread = pose === 'goalie' ? 1.1 * u : 0.75 * u, legLen = 3.2 * u - crouch * 0.1;
  const legs = [-1, 1].map(s => {
    const phs = ph + (s > 0 ? Math.PI : 0), swing = moving ? Math.sin(phs) : 0, lift = moving && !skate ? Math.max(0, Math.cos(phs)) * 1.15 * u : 0;
    let fx = s * spread + swing * stride * dir * 0.55, fy = -lift;
    if (skate && moving) fx = s * spread * 0.9 + swing * stride * dir * 0.8; // push-and-glide
    if (act?.type === 'dive') fy = 0;
    const hx = s * 0.7 * u, hy = hipY, dx = fx - hx, dy = (fy) - hy - 0.0, d = Math.min(Math.hypot(dx, dy), legLen * 1.98) || 0.01;
    const k = Math.sqrt(Math.max(0, (legLen / 2) ** 2 - (d / 2) ** 2)), mx = hx + dx / 2 + (dy / d) * k * dir * (moving ? 1 : 0.35), my = hy + dy / 2 - (dx / d) * k * dir * (moving ? 1 : 0.35);
    return { s, fx, fy, hx, hy, mx, my };
  }).sort((p, q) => (p.fy - q.fy));
  for (const L of legs) {
    limb(ctx, L.hx, L.hy, L.mx, L.my, legW, pants); limb(ctx, L.mx, L.my, L.fx, L.fy - 0.2 * u, legW * 0.92, sock);
    ctx.fillStyle = skate ? '#d9dde3' : '#12161c'; rr(ctx, L.fx - 0.7 * u + dir * 0.25 * u, L.fy - 0.5 * u, 1.55 * u, 0.7 * u, 0.3 * u); ctx.fill();
    if (skate) { ctx.strokeStyle = '#8b95a3'; ctx.lineWidth = Math.max(1, 0.18 * u); ctx.beginPath(); ctx.moveTo(L.fx - 0.9 * u, L.fy + 0.28 * u); ctx.lineTo(L.fx + 1.1 * u, L.fy + 0.28 * u); ctx.stroke(); }
  }
  if (pose === 'goalie') { ctx.fillStyle = shade(color2, 0.95); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = Math.max(1, u * 0.12); for (const s of [-1, 1]) { rr(ctx, s * spread - 0.75 * u, hipY + 0.2 * u, 1.5 * u, 3 * u, 0.5 * u); ctx.fill(); ctx.stroke(); } }
  // ---- upper body pivots at the hip: lean with speed, wind-up / follow-through for actions ----
  let lean = dir * (sp * (skate ? 0.2 : 0.13)) + (act?.type === 'dive' ? dir * 1.1 * ease(Math.min(1, act.p * 2)) : 0);
  if (act?.type === 'swing') lean += dir * (-0.18 + 0.5 * ease(clamp01((act.p - 0.25) / 0.35)) - 0.22 * ease(clamp01((act.p - 0.7) / 0.3)));
  if (act?.type === 'throw') lean += dir * (-0.25 * ease(clamp01(act.p / 0.4)) + 0.55 * ease(clamp01((act.p - 0.4) / 0.25)) - 0.3 * ease(clamp01((act.p - 0.8) / 0.2)));
  if (act?.type === 'check') lean += dir * 0.35 * Math.sin(act.p * Math.PI);
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY);
  // back arm
  const armLen = 2.6 * u, aw = 0.95 * u;
  const sh = (side) => ({ x: side * torsoW * 0.5, y: shY + 0.25 * u });
  const swingA = moving ? sw * (skate ? 0.4 : 0.85) : 0;
  const handAt = (S, ang, len = armLen) => ({ x: S.x + Math.sin(ang) * len * dir, y: S.y + Math.cos(ang) * len });
  const backS = sh(-dir), backH = handAt(backS, -0.12 - swingA * 0.5 - (act?.type === 'celebrate' ? 2.9 + Math.sin(act.p * 20) * 0.3 : 0));
  limb(ctx, backS.x, backS.y, backH.x, backH.y, aw, color); ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(backH.x, backH.y + 0.15 * u, 0.5 * u, 0, Math.PI * 2); ctx.fill();
  // torso
  ctx.fillStyle = color; rr(ctx, -torsoW / 2, shY, torsoW, hipY - shY + 0.6 * u, 0.9 * u); ctx.fill();
  ctx.fillStyle = color2; ctx.fillRect(-torsoW / 2, hipY - 0.15 * u, torsoW, 0.45 * u);
  if (kit === 'football') { ctx.fillStyle = color2; ctx.fillRect(-torsoW / 2, shY + 0.2 * u, torsoW, 0.35 * u); }
  if (showNumber && number !== '' && u >= 3.3) {
    const fg = (() => { const n = parseInt(color.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return ((0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150) ? '#0b1118' : '#ffffff'; })();
    ctx.fillStyle = fg; ctx.font = `900 ${Math.max(6, Math.round(u * 1.55))}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(number), 0, shY + (hipY - shY) * 0.52);
  }
  // front arm + props
  const F = sh(dir), skinDot = (px, py) => { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(px, py, 0.5 * u, 0, Math.PI * 2); ctx.fill(); };
  if (prop === 'bat') {
    // swing: bat goes from raised-back (angle -2.4) through the zone to follow-through (+2.2) driven by action.p
    const sp0 = act?.type === 'swing' ? act.p : 0, ang = act?.type === 'swing' ? -2.4 + 4.6 * ease(clamp01((sp0 - 0.2) / 0.5)) : -2.3 + Math.sin(t * 3 + seed) * 0.07;
    const grip = { x: F.x + dir * 0.9 * u, y: F.y + 0.5 * u };
    limb(ctx, F.x, F.y, grip.x, grip.y, aw, color);
    const bx = grip.x + Math.sin(ang) * 3.7 * u * dir, by = grip.y - Math.cos(ang) * 3.7 * u;
    ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = Math.max(1.4, 0.8 * u); ctx.beginPath(); ctx.moveTo(grip.x - Math.sin(ang) * 0.5 * u * dir, grip.y + Math.cos(ang) * 0.5 * u); ctx.lineTo(bx, by); ctx.stroke();
    if (act?.type === 'swing' && sp0 > 0.3 && sp0 < 0.7) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, 0.5 * u); ctx.beginPath(); ctx.arc(grip.x, grip.y, 3.7 * u, -Math.PI / 2 - 2.2 * dir, -Math.PI / 2 + 0.2 * dir, dir < 0); ctx.stroke(); }
    skinDot(grip.x, grip.y);
  } else if (prop === 'stick') {
    const shoot = act?.type === 'shoot' ? ease(clamp01(act.p / 0.6)) : 0, aim = -0.35 + shoot * 1.05 + (moving ? Math.sin(ph) * 0.12 : 0);
    const hand = { x: F.x + dir * 1.0 * u, y: F.y + 2.2 * u }, hand2 = { x: F.x + dir * 0.2 * u, y: F.y + 1.5 * u };
    limb(ctx, F.x, F.y, hand.x, hand.y, aw, color);
    const tip = { x: hand.x + Math.sin(aim + 0.6) * 3.6 * u * dir, y: hand.y + Math.cos(aim + 0.6) * 3.6 * u }, groundY = 0.1 * u;
    ctx.strokeStyle = '#d9dde3'; ctx.lineWidth = Math.max(1.2, 0.5 * u); ctx.beginPath(); ctx.moveTo(hand2.x, hand2.y); ctx.lineTo(hand.x, hand.y); ctx.lineTo(tip.x, Math.min(tip.y, groundY)); ctx.stroke();
    ctx.strokeStyle = '#11161c'; ctx.lineWidth = Math.max(1.6, 0.85 * u); ctx.beginPath(); ctx.moveTo(tip.x, Math.min(tip.y, groundY)); ctx.lineTo(tip.x + dir * 1.5 * u, groundY); ctx.stroke();
    skinDot(hand.x, hand.y);
  } else {
    let ang = 0.15 + (moving ? -swingA * 0.55 : 0);
    if (act?.type === 'throw') ang = -2.6 + 3.2 * ease(clamp01((act.p - 0.3) / 0.35)) - 0.5 * ease(clamp01((act.p - 0.75) / 0.25));
    else if (act?.type === 'catch') ang = -1.9 + 0.9 * Math.sin(act.p * Math.PI);
    else if (act?.type === 'celebrate') ang = -2.9 + Math.sin(act.p * 20 + 1) * 0.3;
    else if (prop === 'glove') ang = 0.55; else if (prop === 'ball') ang = moving ? 0.9 : 0.6;
    const hnd = handAt(F, ang);
    limb(ctx, F.x, F.y, hnd.x, hnd.y, aw, color);
    if (prop === 'glove' && act?.type !== 'throw') { ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.arc(hnd.x + dir * 0.2 * u, hnd.y, 0.95 * u, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#3d2610'; ctx.lineWidth = Math.max(1, u * 0.14); ctx.stroke(); }
    else if (prop === 'ball' || (act?.type === 'throw' && act.p < 0.6)) { ctx.fillStyle = kit === 'football' ? '#7a4a22' : '#f4f1ea'; ctx.beginPath(); ctx.ellipse(hnd.x + dir * 0.35 * u, hnd.y - 0.35 * u, kit === 'football' ? 0.95 * u : 0.5 * u, kit === 'football' ? 0.6 * u : 0.5 * u, -0.5 * dir, 0, Math.PI * 2); ctx.fill(); }
    else skinDot(hnd.x, hnd.y + 0.2 * u);
  }
  // ---- head ----
  const hr = 1.95 * u * (a.build === 2 ? 1.04 : a.build === 0 ? 0.97 : 1), hdY = headY + (act?.type === 'celebrate' ? -0.1 * u : 0);
  ctx.fillStyle = skinD; ctx.fillRect(-0.55 * u, hdY + hr * 0.7, 1.1 * u, 0.9 * u);
  const geared = a.gear === 0;
  if (a.hairStyle === 2 || a.hairStyle === 6) { ctx.fillStyle = hair; if (a.hairStyle === 2) rr(ctx, -hr * 1.05, hdY - hr * 0.2, hr * 2.1, hr * 1.7, hr * 0.7); else { ctx.beginPath(); ctx.ellipse(-dir * hr * 1.05, hdY + hr * 0.5 + (moving ? Math.sin(ph) * 0.2 * u : 0), hr * 0.38, hr * 0.8, -dir * 0.35, 0, Math.PI * 2); } ctx.fill(); }
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, hdY, hr, 0, Math.PI * 2); ctx.fill();
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * hr * 0.98, hdY + hr * 0.1, hr * 0.2, 0, Math.PI * 2); ctx.fill(); }
  if (!geared) {
    ctx.fillStyle = hair;
    if (a.hairStyle === 0) { ctx.beginPath(); ctx.arc(0, hdY, hr * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.lineTo(0, hdY - hr * 0.35); ctx.fill(); }
    else if (a.hairStyle === 1 || a.hairStyle === 2 || a.hairStyle === 6) { ctx.beginPath(); ctx.arc(0, hdY, hr * 1.06, Math.PI * 1.0, Math.PI * 2); ctx.lineTo(hr * 0.9, hdY - hr * 0.1); ctx.lineTo(-hr * 0.9, hdY - hr * 0.1); ctx.fill(); }
    else if (a.hairStyle === 3) { for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * hr * 0.45, hdY - hr * (0.82 - Math.abs(i) * 0.12), hr * 0.5, 0, Math.PI * 2); ctx.fill(); } }
    else if (a.hairStyle === 5) { rr(ctx, -hr * 0.2, hdY - hr * 1.5, hr * 0.4, hr * 1.1, hr * 0.15); ctx.fill(); }
  } else if (a.hairStyle !== 4) {
    ctx.fillStyle = hair; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * hr * 0.92, hdY + hr * 0.15, hr * 0.17, hr * 0.42, 0, 0, Math.PI * 2); ctx.fill(); }
    if (a.hairStyle === 3) { for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * hr * 0.95, hdY + hr * 0.25, hr * 0.3, 0, Math.PI * 2); ctx.fill(); } }
  }
  const ex = dir * hr * 0.28, ey = hdY + hr * 0.12, blink = Math.sin(t * 0.9 + seed * 3) > 0.985;
  if (a.accessory === 3) { ctx.fillStyle = 'rgba(10,10,10,.85)'; for (const s of [-1, 1]) ctx.fillRect(ex + s * hr * 0.4 - hr * 0.2, ey + hr * 0.18, hr * 0.4, hr * 0.12); }
  ctx.fillStyle = '#10141a'; for (const s of [-1, 1]) { ctx.beginPath(); if (blink) ctx.rect(ex + s * hr * 0.4 - hr * 0.13, ey - 0.4, hr * 0.26, 0.9); else ctx.arc(ex + s * hr * 0.4, ey, Math.max(0.7, hr * 0.13), 0, Math.PI * 2); ctx.fill(); }
  if (a.accessory === 1) { ctx.strokeStyle = '#10141a'; ctx.lineWidth = Math.max(1, hr * 0.1); for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(ex + s * hr * 0.4, ey, hr * 0.27, 0, Math.PI * 2); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(ex - hr * 0.13, ey); ctx.lineTo(ex + hr * 0.13, ey); ctx.stroke(); }
  if (hr > 6) { ctx.strokeStyle = shade(skin, 0.55); ctx.lineWidth = Math.max(1, hr * 0.08); ctx.beginPath(); if (act?.type === 'celebrate') ctx.arc(ex, ey + hr * 0.35, hr * 0.32, 0.1, Math.PI - 0.1); else ctx.arc(ex, ey + hr * 0.5, hr * 0.22, 0.2, Math.PI - 0.2); ctx.stroke(); }
  if (a.beard === 1) { ctx.fillStyle = 'rgba(20,16,12,.32)'; ctx.beginPath(); ctx.arc(0, hdY, hr * 0.99, 0.15, Math.PI - 0.15); ctx.fill(); }
  else if (a.beard === 2) { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(0, hdY, hr * 1.02, 0.05, Math.PI - 0.05); ctx.arc(0, hdY + hr * 0.2, hr * 0.7, Math.PI - 0.3, 0.3, true); ctx.fill(); }
  else if (a.beard === 3) { ctx.fillStyle = hair; rr(ctx, ex - hr * 0.5, ey + hr * 0.38, hr * 1.0, hr * 0.2, hr * 0.1); ctx.fill(); }
  if (a.accessory === 2 && (!geared || kit !== 'baseball')) { ctx.fillStyle = color2; ctx.fillRect(-hr * 1.0, hdY - hr * 0.55, hr * 2.0, hr * 0.28); }
  if (geared) {
    ctx.fillStyle = color;
    if (kit === 'baseball') {
      const helmet = role === 'batter' || role === 'runner';
      ctx.beginPath(); ctx.arc(0, hdY - hr * 0.08, hr * 1.06, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(hr * 0.98, hdY - hr * 0.1); ctx.lineTo(-hr * 0.98, hdY - hr * 0.1); ctx.closePath(); ctx.fill();
      if (helmet) { ctx.beginPath(); ctx.ellipse(-dir * hr * 0.78, hdY + hr * 0.1, hr * 0.48, hr * 0.55, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = shade(color, 0.7); ctx.beginPath(); ctx.ellipse(dir * hr * 0.75, hdY - hr * 0.1, hr * 0.62, hr * 0.17, 0, 0, Math.PI * 2); ctx.fill();
    } else if (kit === 'hockey') {
      ctx.beginPath(); ctx.arc(0, hdY - hr * 0.05, hr * 1.1, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(hr * 1.05, hdY + hr * 0.25); ctx.lineTo(-hr * 1.05, hdY + hr * 0.25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color2; ctx.fillRect(-hr * 1.02, hdY - hr * 0.5, hr * 2.04, hr * 0.2);
      if (role === 'goalie') { ctx.strokeStyle = 'rgba(230,235,240,.9)'; ctx.lineWidth = Math.max(1, hr * 0.09); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * hr * 0.4, hdY - hr * 0.1); ctx.lineTo(i * hr * 0.4, hdY + hr * 0.95); ctx.stroke(); } }
    } else {
      ctx.beginPath(); ctx.arc(0, hdY - hr * 0.05, hr * 1.14, Math.PI * 0.9, Math.PI * 2.1); ctx.lineTo(hr * 1.1, hdY + hr * 0.45); ctx.lineTo(-hr * 1.1, hdY + hr * 0.45); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color2; ctx.fillRect(-hr * 0.14, hdY - hr * 1.12, hr * 0.28, hr * 0.9);
      ctx.strokeStyle = '#d7dde5'; ctx.lineWidth = Math.max(1, hr * 0.11); ctx.beginPath(); ctx.moveTo(dir * hr * 0.2, hdY + hr * 0.1); ctx.lineTo(dir * hr * 1.1, hdY + hr * 0.25); ctx.moveTo(dir * hr * 0.2, hdY + hr * 0.45); ctx.lineTo(dir * hr * 1.05, hdY + hr * 0.5); ctx.stroke();
    }
  }
  ctx.restore(); // lean pivot
  ctx.restore(); ctx.lineWidth = lw;
}
