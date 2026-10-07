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
export function drawAvatar(ctx, o) {
  const { x, y, h, opts, kit = 'baseball', color = '#1d4ed8', color2 = '#ffffff', number = '', facing = null, moving = false, t = 0,
    prop = 'none', pose = 'stand', role = '', showNumber = true, seed = 0 } = o;
  const u = h / 10, a = { ...defaultAvatar('x'), ...opts };
  const dir = facing != null && Math.abs(Math.cos(facing)) > 0.2 ? Math.sign(Math.cos(facing)) : (o.dir || 1);
  const ph = t * 11 + seed * 1.7, sw = moving ? Math.sin(ph) : 0, bob = moving ? Math.abs(Math.cos(ph)) * 0.35 * u : 0;
  const skin = SKINS[a.skin % SKINS.length], skinD = shade(skin, 0.78), hair = HAIR_COLORS[a.hairColor % HAIR_COLORS.length];
  const bw = [0.88, 1, 1.18][a.build % 3], crouch = pose === 'crouch' ? 1.5 * u : 0;
  const pants = kit === 'baseball' ? (role === 'batter' || role === 'runner' ? '#e9edf2' : '#dfe5ec') : kit === 'hockey' ? shade(color, 0.62) : color2 === '#ffffff' ? '#e9edf2' : color2;
  const sock = kit === 'baseball' ? color : kit === 'hockey' ? color2 : color;
  ctx.save(); ctx.translate(x, y);
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(0, 0.2 * u, 2.1 * u * bw, 0.75 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, -bob);
  const hipY = -3.5 * u + crouch * 0.4, shY = -6.2 * u + crouch, headY = -8.2 * u + crouch * 1.1, torsoW = 3.1 * u * bw;
  const legW = 1.15 * u * (pose === 'goalie' ? 1.9 : 1);
  // back arm
  const armA = moving ? sw * 0.9 * u : 0;
  limb(ctx, -dir * torsoW * 0.5, shY + 0.2 * u, -dir * (torsoW * 0.55 + 0.2 * u) + armA * 0.3, shY + 2.5 * u, 0.95 * u, color);
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(-dir * (torsoW * 0.55 + 0.2 * u) + armA * 0.3, shY + 2.7 * u, 0.5 * u, 0, Math.PI * 2); ctx.fill();
  // legs
  const stride = moving ? 1.5 * u : 0.0, spread = pose === 'goalie' ? 1.1 * u : 0.75 * u;
  for (const s of [-1, 1]) {
    const fx = s * spread + s * sw * stride * dir * 0.5, fy = -0.3 * u * (moving && s * sw > 0 ? 1.6 : 0);
    limb(ctx, s * 0.7 * u, hipY, fx, hipY + 2.2 * u + crouch * 0.2, legW, pants);
    limb(ctx, fx, hipY + 2.2 * u + crouch * 0.2, fx, fy - 0.2 * u, legW * 0.92, sock);
    ctx.fillStyle = '#12161c'; rr(ctx, fx - 0.7 * u + dir * 0.2 * u, fy - 0.45 * u, 1.5 * u, 0.7 * u, 0.3 * u); ctx.fill();
  }
  if (pose === 'goalie') { ctx.fillStyle = shade(color2, 0.95); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = Math.max(1, u * 0.12); for (const s of [-1, 1]) { rr(ctx, s * spread - 0.75 * u, hipY + 0.2 * u, 1.5 * u, 3 * u, 0.5 * u); ctx.fill(); ctx.stroke(); } }
  // torso (jersey) + number
  ctx.fillStyle = color; rr(ctx, -torsoW / 2, shY, torsoW, hipY - shY + 0.6 * u, 0.9 * u); ctx.fill();
  ctx.fillStyle = color2; ctx.fillRect(-torsoW / 2, hipY - 0.15 * u, torsoW, 0.45 * u); // belt / hem stripe
  if (kit === 'football') { ctx.fillStyle = color2; ctx.fillRect(-torsoW / 2, shY + 0.2 * u, torsoW, 0.35 * u); }
  if (showNumber && number !== '' && u >= 3.3) {
    const fg = (() => { const n = parseInt(color.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return ((0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150) ? '#0b1118' : '#ffffff'; })();
    ctx.fillStyle = fg; ctx.font = `900 ${Math.max(6, u * 1.55)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(number), 0, shY + (hipY - shY) * 0.52);
  }
  // front arm + props
  const fa = moving ? -sw * 0.9 * u : 0, hx = dir * (torsoW * 0.55 + 0.2 * u) + fa * 0.3, hy = shY + 2.7 * u;
  if (prop === 'bat') { // two-hand grip held up behind the shoulder
    const gx = dir * 1.2 * u, gy = shY + 0.2 * u; limb(ctx, dir * torsoW * 0.4, shY + 0.4 * u, gx, gy, 0.95 * u, color);
    ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = 0.75 * u; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(gx - dir * 0.6 * u, gy + 0.5 * u); ctx.lineTo(gx - dir * 2.4 * u, gy - 3.4 * u); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(gx, gy, 0.5 * u, 0, Math.PI * 2); ctx.fill();
  } else if (prop === 'stick') {
    limb(ctx, dir * torsoW * 0.5, shY + 0.4 * u, hx + dir * 0.8 * u, hy + 0.6 * u, 0.95 * u, color);
    ctx.strokeStyle = '#d9dde3'; ctx.lineWidth = Math.max(1, 0.5 * u); ctx.beginPath(); ctx.moveTo(hx + dir * 0.8 * u, hy - 1.2 * u); ctx.lineTo(hx + dir * 2.4 * u, 0.1 * u); ctx.stroke();
    ctx.strokeStyle = '#11161c'; ctx.lineWidth = Math.max(1.2, 0.8 * u); ctx.beginPath(); ctx.moveTo(hx + dir * 2.4 * u, 0.1 * u); ctx.lineTo(hx + dir * 3.8 * u, 0.1 * u); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx + dir * 0.8 * u, hy + 0.6 * u, 0.5 * u, 0, Math.PI * 2); ctx.fill();
  } else {
    limb(ctx, dir * torsoW * 0.5, shY + 0.2 * u, hx, hy, 0.95 * u, color);
    if (prop === 'glove') { ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.arc(hx + dir * 0.3 * u, hy, 0.95 * u, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#3d2610'; ctx.lineWidth = Math.max(1, u * 0.14); ctx.stroke(); }
    else if (prop === 'ball') { ctx.fillStyle = '#7a4a22'; ctx.beginPath(); ctx.ellipse(hx + dir * 0.4 * u, hy - 0.4 * u, 0.95 * u, 0.6 * u, -0.5 * dir, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy + 0.2 * u, 0.5 * u, 0, Math.PI * 2); ctx.fill(); }
  }
  // head
  const hr = 1.95 * u * (a.build === 2 ? 1.04 : a.build === 0 ? 0.97 : 1);
  ctx.fillStyle = skinD; ctx.fillRect(-0.55 * u, headY + hr * 0.7, 1.1 * u, 0.9 * u); // neck
  const geared = a.gear === 0;
  // hair behind head (long / ponytail)
  if (a.hairStyle === 2 || a.hairStyle === 6) { ctx.fillStyle = hair; if (a.hairStyle === 2) rr(ctx, -hr * 1.05, headY - hr * 0.2, hr * 2.1, hr * 1.7, hr * 0.7); else { ctx.beginPath(); ctx.ellipse(-dir * hr * 1.05, headY + hr * 0.5, hr * 0.38, hr * 0.8, -dir * 0.35, 0, Math.PI * 2); } ctx.fill(); }
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, headY, hr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = skin; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * hr * 0.98, headY + hr * 0.1, hr * 0.2, 0, Math.PI * 2); ctx.fill(); } // ears
  // hair on top
  if (!geared) {
    ctx.fillStyle = hair;
    if (a.hairStyle === 0) { ctx.beginPath(); ctx.arc(0, headY, hr * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.lineTo(0, headY - hr * 0.35); ctx.fill(); }
    else if (a.hairStyle === 1 || a.hairStyle === 2 || a.hairStyle === 6) { ctx.beginPath(); ctx.arc(0, headY, hr * 1.06, Math.PI * 1.0, Math.PI * 2); ctx.lineTo(hr * 0.9, headY - hr * 0.1); ctx.lineTo(-hr * 0.9, headY - hr * 0.1); ctx.fill(); }
    else if (a.hairStyle === 3) { for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * hr * 0.45, headY - hr * (0.82 - Math.abs(i) * 0.12), hr * 0.5, 0, Math.PI * 2); ctx.fill(); } }
    else if (a.hairStyle === 5) { rr(ctx, -hr * 0.2, headY - hr * 1.5, hr * 0.4, hr * 1.1, hr * 0.15); ctx.fill(); }
  } else if (a.hairStyle !== 4) { // hair peeking under the headgear (sideburns / curls)
    ctx.fillStyle = hair; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * hr * 0.92, headY + hr * 0.15, hr * 0.17, hr * 0.42, 0, 0, Math.PI * 2); ctx.fill(); }
    if (a.hairStyle === 3) { for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * hr * 0.95, headY + hr * 0.25, hr * 0.3, 0, Math.PI * 2); ctx.fill(); } }
  }
  // face
  const ex = dir * hr * 0.28, ey = headY + hr * 0.12;
  if (a.accessory === 3) { ctx.fillStyle = 'rgba(10,10,10,.85)'; for (const s of [-1, 1]) ctx.fillRect(ex + s * hr * 0.4 - hr * 0.2, ey + hr * 0.18, hr * 0.4, hr * 0.12); }
  ctx.fillStyle = '#10141a'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(ex + s * hr * 0.4, ey, Math.max(0.7, hr * 0.13), 0, Math.PI * 2); ctx.fill(); }
  if (a.accessory === 1) { ctx.strokeStyle = '#10141a'; ctx.lineWidth = Math.max(1, hr * 0.1); for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(ex + s * hr * 0.4, ey, hr * 0.27, 0, Math.PI * 2); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(ex - hr * 0.13, ey); ctx.lineTo(ex + hr * 0.13, ey); ctx.stroke(); }
  if (hr > 6) { ctx.strokeStyle = shade(skin, 0.55); ctx.lineWidth = Math.max(1, hr * 0.08); ctx.beginPath(); ctx.arc(ex, ey + hr * 0.5, hr * 0.22, 0.2, Math.PI - 0.2); ctx.stroke(); } // smile
  if (a.beard === 1) { ctx.fillStyle = 'rgba(20,16,12,.32)'; ctx.beginPath(); ctx.arc(0, headY, hr * 0.99, 0.15, Math.PI - 0.15); ctx.fill(); }
  else if (a.beard === 2) { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(0, headY, hr * 1.02, 0.05, Math.PI - 0.05); ctx.arc(0, headY + hr * 0.2, hr * 0.7, Math.PI - 0.3, 0.3, true); ctx.fill(); }
  else if (a.beard === 3) { ctx.fillStyle = hair; rr(ctx, ex - hr * 0.5, ey + hr * 0.38, hr * 1.0, hr * 0.2, hr * 0.1); ctx.fill(); }
  if (a.accessory === 2 && (!geared || kit !== 'baseball')) { ctx.fillStyle = color2; ctx.fillRect(-hr * 1.0, headY - hr * 0.55, hr * 2.0, hr * 0.28); }
  // headgear
  if (geared) {
    ctx.fillStyle = color;
    if (kit === 'baseball') {
      const helmet = role === 'batter' || role === 'runner';
      ctx.beginPath(); ctx.arc(0, headY - hr * 0.08, hr * 1.06, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(hr * 0.98, headY - hr * 0.1); ctx.lineTo(-hr * 0.98, headY - hr * 0.1); ctx.closePath(); ctx.fill();
      if (helmet) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(-dir * hr * 0.78, headY + hr * 0.1, hr * 0.48, hr * 0.55, 0, 0, Math.PI * 2); ctx.fill(); } // ear flap
      ctx.fillStyle = shade(color, 0.7); ctx.beginPath(); ctx.ellipse(dir * hr * 0.75, headY - hr * 0.1, hr * 0.62, hr * 0.17, 0, 0, Math.PI * 2); ctx.fill(); // brim
    } else if (kit === 'hockey') {
      ctx.beginPath(); ctx.arc(0, headY - hr * 0.05, hr * 1.1, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(hr * 1.05, headY + hr * 0.25); ctx.lineTo(-hr * 1.05, headY + hr * 0.25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color2; ctx.fillRect(-hr * 1.02, headY - hr * 0.5, hr * 2.04, hr * 0.2);
      if (role === 'goalie') { ctx.strokeStyle = 'rgba(230,235,240,.9)'; ctx.lineWidth = Math.max(1, hr * 0.09); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * hr * 0.4, headY - hr * 0.1); ctx.lineTo(i * hr * 0.4, headY + hr * 0.95); ctx.stroke(); } }
    } else { // football
      ctx.beginPath(); ctx.arc(0, headY - hr * 0.05, hr * 1.14, Math.PI * 0.9, Math.PI * 2.1); ctx.lineTo(hr * 1.1, headY + hr * 0.45); ctx.lineTo(-hr * 1.1, headY + hr * 0.45); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color2; ctx.fillRect(-hr * 0.14, headY - hr * 1.12, hr * 0.28, hr * 0.9); // center stripe
      ctx.strokeStyle = '#d7dde5'; ctx.lineWidth = Math.max(1, hr * 0.11); ctx.beginPath(); ctx.moveTo(dir * hr * 0.2, headY + hr * 0.1); ctx.lineTo(dir * hr * 1.1, headY + hr * 0.25); ctx.moveTo(dir * hr * 0.2, headY + hr * 0.45); ctx.lineTo(dir * hr * 1.05, headY + hr * 0.5); ctx.stroke();
    }
  }
  ctx.restore();
}
