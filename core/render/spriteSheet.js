// Sprite-sheet athletes rendered in Blender (tools/blender/make_atlas.sh → assets/sprites/<kit>_{color,mask}.png + <kit>.json).
//  * colour atlas: the athlete with white jersey/helmet/pants (shaded), one ROW per clip, frames left→right;
//  * mask atlas:   R = jersey+helmet, G = pants, alpha = silhouette → the game tints per team: out = base × lerp(1, team, mask);
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
// out = base × lerp(1, tint, mask): jersey(R) and pants(G) channels of the mask pick the team colour, the rest keeps its own colour.
export function tintPixels(base, mask, jersey, pants) {
  const out = new Uint8ClampedArray(base.length);
  for (let i = 0; i < base.length; i += 4) {
    const r = mask[i] / 255, g = mask[i + 1] / 255, keep = Math.max(0, 1 - r - g);
    for (let k = 0; k < 3; k++) out[i + k] = base[i + k] * (keep + r * jersey[k] / 255 + g * pants[k] / 255);
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
const cache = new LRU(900);

function loadImage(url) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }); }
export function loadKit(kit, base = BASE) {
  let k = kits.get(kit); if (k) return k;
  k = { meta: null, color: null, mask: null, state: 'loading' }; kits.set(kit, k);
  Promise.all([fetch(`${base}${kit}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }), loadImage(`${base}${kit}_color.png`), loadImage(`${base}${kit}_mask.png`)])
    .then(([meta, color, mask]) => { Object.assign(k, { meta, color, mask, state: 'ready' }); }).catch(() => { k.state = 'error'; });
  return k;
}
export function sheetReady(kit) { const k = loadKit(kit); return k.state === 'ready'; }
export function hasClip(kit, clip) { const k = kits.get(kit); return !!(k && k.state === 'ready' && k.meta.clips[clip]); }

function tintedFrame(k, kit, clip, col, jersey, pants) {
  const key = `${kit}|${clip}|${col}|${jersey}|${pants}`; let c = cache.get(key); if (c) return c;
  const F = k.meta.frame, e = k.meta.clips[clip], sx = col * F, sy = e.row * F;
  const a = canvasFactory(F, F), actx = a.getContext('2d', { willReadFrequently: true }); actx.drawImage(k.color, sx, sy, F, F, 0, 0, F, F);
  const b = canvasFactory(F, F), bctx = b.getContext('2d', { willReadFrequently: true }); bctx.drawImage(k.mask, sx, sy, F, F, 0, 0, F, F);
  const base = actx.getImageData(0, 0, F, F), mk = bctx.getImageData(0, 0, F, F), tinted = tintPixels(base.data, mk.data, parseColor(jersey), parseColor(pants));
  base.data.set(tinted); actx.putImageData(base, 0, 0); cache.set(key, a); return a;
}

// o: { x, feetY, h, kit, clip, t, dir, jersey, pants }  → true when drawn. h = the avatar height in pixels (body of the sprite scaled to it).
export function drawSheet(ctx, o) {
  const k = loadKit(o.kit); if (k.state !== 'ready') return false;
  let clip = o.clip, e = k.meta.clips[clip], t = o.t;
  if (!e) return false;
  const col = frameFor(e, t), F = k.meta.frame, s = o.h / k.meta.body, img = tintedFrame(k, o.kit, clip, col, o.jersey, o.pants);
  ctx.save(); ctx.translate(o.x, o.feetY); if (o.dir < 0) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(img, -F / 2 * s, -k.meta.feet * s, F * s, F * s); ctx.restore();
  return true;
}
// Pick the clip/time for an avatar action: clips pass through; no action = idle loop; legacy procedural actions are not in the atlas.
export function clipTimeFor(action, t, seed = 0, kit = '') {
  if (!action) return { clip: IDLE_CLIP, t: t / 2.4 + seed * 0.13 };
  if (typeof action.type === 'string' && action.type.startsWith('clip:')) return { clip: action.type.slice(5), t: action.t ?? 0 };
  return null;
}
export function pantsColorFor(kit, color, color2) {
  if (kit === 'baseball') return '#dfe5ec';
  if (kit === 'hockey') { const [r, g, b] = parseColor(color); return `rgb(${Math.round(r * 0.62)},${Math.round(g * 0.62)},${Math.round(b * 0.62)})`; }
  return color2 === '#ffffff' ? '#e9edf2' : color2;
}
