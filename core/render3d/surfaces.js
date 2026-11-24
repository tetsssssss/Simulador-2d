// Procedural surface detail for the 3D fields (grass blades / mottling, ice scratches and skate marks, raked dirt). Deterministic (seeded) and drawn into the same 2D canvases
// as the markings, BEFORE the lines, so the paint stays crisp. No external assets.
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function lattice(w, h, cell, r) { const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = r(); return { gw, at: (x, y) => { const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1]; return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty; } }; }
// Per-pixel grain: green pixels get mottling + blade streaks, brown pixels get speckle, everything else is left alone (ice has its own pass).
export function grainPass(c, w, h, { seed = 7, grass = 1, dirt = 1, ppu = 20 } = {}) {
  if (!c.getImageData) return;
  const img = c.getImageData(0, 0, w, h), d = img.data, r = rng(seed), big = lattice(w, h, Math.max(8, ppu * 3), r), mid = lattice(w, h, Math.max(4, ppu * 0.6), r), blade = lattice(w, h, 3, r);
  const BS = 2, bw = Math.ceil(w / BS), bh = Math.ceil(h / BS), gk = new Float32Array(bw * bh), dk = new Float32Array(bw * bh);   // low-frequency parts evaluated per 2x2 block (4x cheaper)
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { const x = bx * BS, y = by * BS, bg = big.at(x, y) - 0.5, md = mid.at(x, y) - 0.5; gk[by * bw + bx] = bg * 26 + md * 18 + (blade.at(x * 0.25, y) - 0.5) * 22; dk[by * bw + bx] = bg * 22 + md * 16; }
  let n = (seed * 2654435761) >>> 0 || 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
    n ^= n << 13; n >>>= 0; n ^= n >>> 17; n ^= n << 5; n >>>= 0; const u = n / 4294967296;
    let k = 0;
    if (G > R * 1.15 && G > B * 1.3) k = grass * (gk[(y >> 1) * bw + (x >> 1)] + (u - 0.5) * 12);
    else if (R > B * 1.25 && R >= G && R < 235) k = dirt * (dk[(y >> 1) * bw + (x >> 1)] + (u - 0.5) * 24 + (u < 0.012 ? -30 : 0));
    if (k) { const nr = R + k * 0.8, ng = G + k, nb = B + k * 0.55; d[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr; d[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng; d[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb; }
  }
  c.putImageData(img, 0, 0);
}
// Raked dirt: faint concentric arcs around a centre (units already in canvas pixels) + pebbles.
export function rakeDirt(c, cx, cy, r0, r1, { seed = 3, n = 40 } = {}) { const r = rng(seed); c.save(); c.lineWidth = 1.2; for (let i = 0; i < n; i++) { const rad = r0 + (r1 - r0) * r(), a0 = r() * Math.PI * 2, span = 0.4 + r() * 1.2; c.strokeStyle = r() < 0.5 ? 'rgba(90,60,30,.10)' : 'rgba(235,205,160,.09)'; c.beginPath(); c.arc(cx, cy, rad, a0, a0 + span); c.stroke(); } c.restore(); }
// Worn spots (cleats / skates): soft radial patches.
export function wear(c, x, y, rad, rgba) { const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, rgba); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
// Ice: long thin skate scratches, a few swirls and a faint cloudy tint, in world feet-per-pixel scale `ppf`.
export function iceMarks(c, L, W, { seed = 11, n = 900 } = {}) {
  const r = rng(seed); c.save(); c.lineCap = 'round';
  for (let i = 0; i < n; i++) { const x = r() * L, y = r() * W, len = 4 + r() * 22, a = (r() - 0.5) * 0.7 + (r() < 0.35 ? Math.PI / 2 : 0); c.strokeStyle = r() < 0.7 ? 'rgba(255,255,255,.6)' : 'rgba(110,140,170,.3)'; c.lineWidth = 0.06 + r() * 0.09; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 2, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 2, x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke(); }
  for (let i = 0; i < 26; i++) { const x = r() * L, y = r() * W, rad = 1.5 + r() * 4; c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 0.09; c.beginPath(); c.ellipse(x, y, rad * 1.8, rad, r() * 3, 0, Math.PI * (1 + r())); c.stroke(); }
  for (let i = 0; i < 16; i++) { const x = r() * L, y = r() * W, rad = 6 + r() * 14, g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(235,245,255,.35)'); g.addColorStop(1, 'rgba(235,245,255,0)'); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  c.restore();
}
