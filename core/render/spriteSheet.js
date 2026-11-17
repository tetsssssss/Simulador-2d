// Sprite-sheet athletes rendered in Blender (tools/blender/make_atlas.sh → assets/sprites/<kit>_{color,mask}.png + <kit>.json).
//  * colour atlas: the athlete with white jersey/helmet/pants (shaded), one ROW per clip, frames left→right;
//  * mask atlas:   R = jersey+helmet, G = pants, alpha = silhouette → the game tints per team: out = base × lerp(1, team, mask);
//  * paged atlases (<kit>_<page>_{color,mask}.png): locomotion pages carry 5 facing directions (E, SE, S, NE, N; the other three are mirrors),
//    event pages 1 (mirrored left/right);
//  * frames are looked up from the same clip data the 2D avatar uses (action { type:'clip:<id>', t }), so both modes animate alike;
//  * tinted frames are cached (LRU) per (kit, clip, frame, colours): 96×96 pixels each, built on first use.
// Anything not in the atlas (legacy procedural actions, clips not exported for that kit, assets still loading) returns false and the
// caller falls back to the procedural avatar — the sheet mode never shows an empty slot.
const BASE = typeof import.meta !== 'undefined' && import.meta.url ? new URL('../../assets/sprites/', import.meta.url).href : 'assets/sprites/';
const kits = new Map();                      // kit -> { meta, color, mask, state: 'loading'|'ready'|'error' }
let canvasFactory = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
export function setCanvasFactory(f) { canvasFactory = f; }                    // tests inject a fake
export const IDLE_CLIP = 'mv_idle';

export function parseColor(c) {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(String(c)); if (m) return [+m[1], +m[2], +m[3]];
  const h = String(c || '#808080').replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h.padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---- pure helpers (unit-tested) ----
// Frame column for a clip at time t: loops wrap (t may exceed 1: stride phase / 2π), one-shots clamp to the last frame.
export function frameFor(entry, t) {
  if (!entry) return -1; const n = entry.n;
  t = Number.isFinite(t) ? t : 0;
  return entry.loop ? Math.floor((t - Math.floor(t)) * n) % n : Math.max(0, Math.min(n - 1, Math.floor(t * n)));
}
// out = base × lerp(1, tint, mask): jersey(R), pants(G) and accent(B) channels of the mask pick the team colours, the rest keeps its own colour.
export function tintPixels(base, mask, jersey, pants, accent = [255, 255, 255]) {
  const out = new Uint8ClampedArray(base.length);
  for (let i = 0; i < base.length; i += 4) {
    const r = mask[i] / 255, g = mask[i + 1] / 255, b = mask[i + 2] / 255, keep = Math.max(0, 1 - r - g - b);
    for (let k = 0; k < 3; k++) out[i + k] = base[i + k] * (keep + r * jersey[k] / 255 + g * pants[k] / 255 + b * accent[k] / 255);
    out[i + 3] = base[i + 3];
  }
  return out;
}
export class LRU {
  constructor(max) { this.max = max; this.m = new Map(); }
  get(k) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; }
  set(k, v) { this.m.set(k, v); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value); }
  get size() { return this.m.size; }
}
const cache = new LRU(1800);   // 96x96x4 = 36 KB per tinted frame (~65 MB worst case); 5 directions x gaits x 2 team palettes thrash a smaller cache

function loadImage(url) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }); }
export function loadKit(kit, base = BASE) {
  let k = kits.get(kit); if (k) return k;
  k = { meta: null, pages: [], state: 'loading' }; kits.set(kit, k);
  fetch(`${base}${kit}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(meta => Promise.all(meta.pages.flatMap(pg => [loadImage(`${base}${kit}_${pg.name}_color.png`), loadImage(`${base}${kit}_${pg.name}_mask.png`)])).then(imgs => ({ meta, imgs })))
    .then(({ meta, imgs }) => Promise.all(imgs.map(im => (im.decode ? im.decode().catch(() => {}) : null))).then(() => ({ meta, imgs })))   // decode now, not on the first drawImage (that was a 116 ms hitch)
    .then(({ meta, imgs }) => { k.meta = meta; k.pages = meta.pages.map((pg, i) => ({ color: imgs[i * 2], mask: imgs[i * 2 + 1] })); k.state = 'ready'; })
    .catch(() => { k.state = 'error'; });
  return k;
}
// Start loading every kit of a sport as soon as the sheet mode is on (idempotent); until ready the avatar fallback is drawn.
export const SPORT_KITS = { nfl: ['football', 'ref'], nhl: ['hockey', 'hockey_goalie'], mlb: ['baseball', 'baseball_bat'] };
// "HD" athletes: skinned models imported from Meshy .glb (tools/blender/athlete_import.py), rendered into football_hd / hockey_hd atlases with the
// same clips. Used for outfield / skater athletes when the preference is on (default on); goalies, referees and baseball keep the low-poly atlases.
export const HD_KITS = Object.freeze({ football: 'football_hd', hockey: 'hockey_hd' });
let hdOn = null;
export function sheetHd() {
  if (hdOn === null) {
    try { hdOn = localStorage.getItem('asu_sheet_hd') !== '0'; } catch { hdOn = true; }
    if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (!e.key || e.key === 'asu_sheet_hd') { try { hdOn = localStorage.getItem('asu_sheet_hd') !== '0'; } catch { /* private */ } } });
  }
  return hdOn;
}
export function setSheetHd(on) { hdOn = !!on; try { localStorage.setItem('asu_sheet_hd', on ? '1' : '0'); } catch { /* private */ } }
// Kit to actually use for `base`: the HD atlas when enabled and not failed to load, otherwise the low-poly one.
// Only ONE of the two sets is loaded at a time (each is ~100-200 MB of decoded images): the HD set while it works, the low-poly set if HD failed or is off.
// While the chosen atlas is still loading, drawSheet() returns false and the procedural avatar is drawn (same as the very first frames of any kit).
export function kitFor(base) {
  const hd = HD_KITS[base]; if (!hd || !sheetHd()) return base;
  if (kits.get(hd)?.state === 'error') { loadKit(base); return base; }
  loadKit(hd); return hd;
}
export function preloadKits(sport) { for (const k of SPORT_KITS[sport] || []) loadKit(kitFor(k)); }
export function sheetReady(kit) { const k = loadKit(kit); return k.state === 'ready'; }
export function hasClip(kit, clip) { const k = kits.get(kit); return !!(k && k.state === 'ready' && k.meta.clips[clip]); }

// Facing → atlas direction. phi = screen angle (0 = right, +π/2 = down/toward the camera). Atlas order: E, SE, S, NE, N (right half only).
export function dirFor(phi, dirs) {
  const c = Math.cos(phi), flip = c < 0;
  if (dirs <= 1) return { d: 0, flip };
  let psi = flip ? Math.PI - phi : phi; psi = Math.atan2(Math.sin(psi), Math.cos(psi));          // right half: -90°..90°
  const deg = psi * 180 / Math.PI;
  const d = deg < -67.5 ? 4 : deg < -22.5 ? 3 : deg < 22.5 ? 0 : deg < 67.5 ? 1 : 2;           // N, NE, E, SE, S
  return { d, flip };
}

function tintedFrame(k, kit, clip, row, col, jersey, pants, accent = '#ffffff') {
  const key = `${kit}|${clip}|${row}|${col}|${jersey}|${pants}|${accent}`; let c = cache.get(key); if (c) return c;
  const F = k.meta.frame, e = k.meta.clips[clip], pg = k.pages[e.page], sx = col * F, sy = row * F;
  const a = canvasFactory(F, F), actx = a.getContext('2d', { willReadFrequently: true }); actx.drawImage(pg.color, sx, sy, F, F, 0, 0, F, F);
  const b = canvasFactory(F, F), bctx = b.getContext('2d', { willReadFrequently: true }); bctx.drawImage(pg.mask, sx, sy, F, F, 0, 0, F, F);
  const base = actx.getImageData(0, 0, F, F), mk = bctx.getImageData(0, 0, F, F), tinted = tintPixels(base.data, mk.data, parseColor(jersey), parseColor(pants), parseColor(accent));
  base.data.set(tinted); actx.putImageData(base, 0, 0); cache.set(key, a); return a;
}

// o: { x, feetY, h, kit, clip, t, phi (screen facing, optional), dir (±1 fallback), jersey, pants } → true when drawn.
// h = the avatar height in pixels (the sprite body is scaled to it, feet anchored at feetY).
// Cross-fade when an athlete switches clip (idle → run, run → tackle…): the last frame of the old clip stays under the new clip, which fades in
// over FADE seconds (wall clock). Pure state machine so it is unit-tested: step(state, cur, now) → { from, k } (from = frame to keep drawing under, or null).
export const FADE = 0.14;
export function fadeStep(st, cur, now, fade = FADE) {
  if (st.last && (st.last.kit !== cur.kit || st.last.clip !== cur.clip)) { st.from = st.last; st.at = now; }
  let k = 1;
  if (st.from) { k = Math.max(0, Math.min(1, (now - st.at) / fade)); if (k >= 1) st.from = null; }
  st.last = cur;
  return { from: st.from || null, k };
}
const fades = new Map();       // athlete key -> fade state (bounded)
let clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
export function setSheetClock(f) { clock = f; }
function drawFrame(ctx, img, flip, x, feetY, s, F, feet, alpha) {
  ctx.save(); ctx.translate(x, feetY); if (flip) ctx.scale(-1, 1); ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true; ctx.drawImage(img, -F / 2 * s, -feet * s, F * s, F * s); ctx.restore();
}

// o: { x, feetY, h, kit, clip, t, phi (screen facing, optional), dir (±1 fallback), jersey, pants, accent, key } → true when drawn.
// h = the avatar height in pixels (the sprite body is scaled to it, feet anchored at feetY). key = stable athlete id (enables the cross-fade).
export function drawSheet(ctx, o) {
  const k = loadKit(o.kit); if (k.state !== 'ready') return false;
  const e = k.meta.clips[o.clip]; if (!e) return false;
  const { d, flip } = o.phi != null ? dirFor(o.phi, e.dirs) : { d: 0, flip: (o.dir || 1) < 0 };
  const col = frameFor(e, o.t), F = k.meta.frame, s = o.h / k.meta.body, img = tintedFrame(k, o.kit, o.clip, e.row + d, col, o.jersey, o.pants, o.accent);
  let from = null, a = 1;
  if (o.key != null) {
    let st = fades.get(o.key); if (!st) { st = {}; fades.set(o.key, st); if (fades.size > 600) fades.delete(fades.keys().next().value); }
    const r = fadeStep(st, { kit: o.kit, clip: o.clip, img, flip }, clock()); from = r.from; a = r.k;
  }
  if (from && from.img) drawFrame(ctx, from.img, from.flip, o.x, o.feetY, s, F, k.meta.feet, 1);
  drawFrame(ctx, img, flip, o.x, o.feetY, s, F, k.meta.feet, a);
  return true;
}

// Atlas kit + clip + time for an avatar (null = not covered → the caller draws the procedural avatar).
//  * clip actions pass through; legacy one-shot actions are translated per sport; no action = the role's idle/stance loop;
//  * goalies use the goalie atlas driven by their save state, batters the bat atlas, referees the striped atlas.
const LEGACY = {
  hockey: { check: 'hk_check', celebrate: 'gs_arms_up' },
  baseball: { celebrate: 'gs_arms_up', dive: 'ps_catch_diving', catch: 'ps_catch_hands', throw: 'qb_overhand' },
  football: { celebrate: 'gs_arms_up', catch: 'ps_catch_hands', dive: 'ps_catch_diving', check: 'ag_arm_tackle', throw: 'qb_overhand' },
};
const SHOT_CLIP = { wrist: 'hk_wrist', snap: 'hk_snap', slap: 'hk_slap', backhand: 'hk_backhand', 'one-timer': 'hk_onetimer', onetimer: 'hk_onetimer' };
const GOALIE_CLIP = { READY: 'gk_ready', BUTTERFLY: 'gk_butterfly', SLIDE: 'gk_slide', GLOVE: 'gk_glove', BLOCKER: 'gk_blocker', PAD_SAVE: 'gk_pad_save', RECOVER: 'gk_recover' };
export function resolveSheet(av, now = 0) {
  const { kit, role, action, pose, seed = 0 } = av; let atlas = kit, clip = null, t = 0;
  if (role === 'ref') atlas = 'ref'; else if (role === 'goalie') atlas = 'hockey_goalie'; else if (kit === 'baseball' && role === 'batter') atlas = 'baseball_bat';
  if (action && typeof action.type === 'string' && action.type.startsWith('clip:')) { clip = action.type.slice(5); t = action.t ?? 0; }
  else if (action && atlas === 'hockey' && action.type === 'shoot') { clip = SHOT_CLIP[action.shot] || 'hk_wrist'; t = action.t ?? 0; }
  else if (action && atlas === 'baseball' && action.type === 'throw' && role === 'pitcher') { clip = 'bb_pitch'; t = action.t ?? 0; }
  else if (action && action.type === 'swing' && atlas === 'baseball_bat') { clip = 'bb_swing'; t = action.t ?? 0; }   // only batters swing
  else if (action && LEGACY[kit]?.[action.type]) { clip = LEGACY[kit][action.type]; t = action.t ?? 0; }
  else if (action) return null;                                                            // procedural-only action: no clip for it
  else if (atlas === 'hockey_goalie') { clip = GOALIE_CLIP[av.goalieState] || 'gk_ready'; t = clip === 'gk_ready' ? now / 1.6 + seed * 0.13 : 1; }
  else if (atlas === 'baseball_bat') { clip = 'bb_stance'; t = now / 1.8 + seed * 0.13; }
  else if (kit === 'baseball' && (pose === 'crouch' || role === 'catcher')) { clip = 'bb_catcher_crouch'; t = now / 1.8 + seed * 0.13; }
  else if (kit === 'hockey') { clip = 'hk_glide'; t = now / 1.2 + seed * 0.13; }
  else { clip = IDLE_CLIP; t = now / 2.4 + seed * 0.13; }
  if (atlas === 'hockey_goalie' && action) { /* goalie one-shots are driven by goalieState, not by legacy actions */ clip = GOALIE_CLIP[av.goalieState] || clip; }
  return { kit: kitFor(atlas), clip, t };
}
export function pantsColorFor(kit, color, color2) {
  if (kit === 'baseball') return '#dfe5ec';
  if (kit === 'hockey') { const [r, g, b] = parseColor(color); return `rgb(${Math.round(r * 0.62)},${Math.round(g * 0.62)},${Math.round(b * 0.62)})`; }
  return color2 === '#ffffff' ? '#e9edf2' : color2;
}
