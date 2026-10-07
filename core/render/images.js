// Shared image cache + crisp drawing helpers (no stretched photos). One HTMLImageElement per URL, loaded once.
// A failed URL is remembered (not retried every frame) and resolves to the provided fallback.
const cache = new Map();

export function loadImage(url, fallback = null) {
  if (!url) return fallback ? loadImage(fallback) : null;
  let rec = cache.get(url);
  if (!rec) {
    const img = new Image();
    img.decoding = 'async';
    rec = { img, ok: false, failed: false, fallback };
    img.onload = () => { rec.ok = true; };
    img.onerror = () => { rec.failed = true; };
    img.src = url;
    cache.set(url, rec);
  }
  if (rec.ok) return rec.img;
  if (rec.failed && rec.fallback && rec.fallback !== url) return loadImage(rec.fallback);
  return null;
}
export function imageState(url) { const r = cache.get(url); return r ? (r.ok ? 'ok' : r.failed ? 'failed' : 'loading') : 'none'; }
export function cacheSize() { return cache.size; }

// object-fit: cover into (x,y,w,h); focusY picks the vertical focus (0.15 = faces near the top of headshots).
export function drawImageCover(ctx, img, x, y, w, h, focusY = 0.15) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  const sx = (iw - sw) / 2, sy = Math.max(0, Math.min(ih - sh, (ih - sh) * focusY * 2));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Circular photo with cover crop.
export function drawCirclePhoto(ctx, img, cx, cy, r, focusY = 0.12) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  drawImageCover(ctx, img, cx - r, cy - r, r * 2, r * 2, focusY);
  ctx.restore();
}
