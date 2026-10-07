// Crowd stands (shared visual). Seats are generated once in WORLD units by the sport (around the rink, the field or
// the ballpark outline) and drawn every frame through the sport camera (cam.sx/sy/scale) — so zoom and pan are free.
// Layers: concourse/steps, seat rows, fans (head+torso at close zoom, a single dot when far). Intensity 0–100 drives
// how many fans stand, bounce height, arm-waving and camera flashes. Team-colored blocks: home majority, away pocket.
import { createRng } from '../rng/rng.js';

const NEUTRAL = ['#d9dee5', '#9aa6b4', '#4b5664', '#2a323d', '#c9b79c', '#6d5a49'];

// Rows of seats around an axis-aligned rectangle (world units), skipping gaps (e.g. benches) given as {side,from,to}.
export function seatsAroundRect({ x0, y0, x1, y1, rows = 6, rowGap = 1, spacing = 1, skip = [] }) {
  const seats = [];
  for (let r = 0; r < rows; r++) {
    const o = r * rowGap;
    const sides = [
      { side: 'top', ax: x0 - o, ay: y0 - o, bx: x1 + o, by: y0 - o, nx: 0, ny: -1 },
      { side: 'bottom', ax: x0 - o, ay: y1 + o, bx: x1 + o, by: y1 + o, nx: 0, ny: 1 },
      { side: 'left', ax: x0 - o, ay: y0 - o, bx: x0 - o, by: y1 + o, nx: -1, ny: 0 },
      { side: 'right', ax: x1 + o, ay: y0 - o, bx: x1 + o, by: y1 + o, nx: 1, ny: 0 },
    ];
    for (const s of sides) {
      const len = Math.hypot(s.bx - s.ax, s.by - s.ay), n = Math.max(1, Math.floor(len / spacing));
      for (let i = 0; i <= n; i++) {
        const x = s.ax + (s.bx - s.ax) * (i / n), y = s.ay + (s.by - s.ay) * (i / n);
        const along = s.side === 'top' || s.side === 'bottom' ? x : y;
        if (skip.some(k => k.side === s.side && along >= k.from && along <= k.to)) continue;
        seats.push({ x, y, row: r, nx: s.nx, ny: s.ny, side: s.side });
      }
    }
  }
  return seats;
}

// Rows of seats outward from a closed polyline (world units). `outward(p)` → unit normal pointing away from the field.
export function seatsAlongOutline(points, { rows = 8, rowGap = 4, spacing = 4, start = 4, outward }) {
  const seats = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.01) continue;
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const t = k / n, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const nv = outward(p, a, b);
      for (let r = 0; r < rows; r++) { const d = start + r * rowGap; seats.push({ x: p.x + nv.x * d, y: p.y + nv.y * d, row: r, nx: nv.x, ny: nv.y, side: 'arc' }); }
    }
  }
  return seats;
}

export function createCrowd({ seats, home = '#1d4f91', away = '#a71930', seed = 'crowd', awayShare = 0.18, fill = 0.9, unit = 1, rowGap = 1 }) {
  const rng = createRng(String(seed));
  const fans = [];
  // away fans sit in one or two contiguous pockets (blocks of seats), not sprinkled randomly
  const pocket = Math.floor(rng.next() * seats.length), pocketLen = Math.floor(seats.length * awayShare);
  seats.forEach((s, i) => {
    if (rng.next() > fill) return;
    const inPocket = ((i - pocket + seats.length) % seats.length) < pocketLen;
    const r = rng.next();
    const color = inPocket ? (r < 0.75 ? away : NEUTRAL[Math.floor(rng.next() * NEUTRAL.length)]) : (r < 0.62 ? home : r < 0.68 ? away : NEUTRAL[Math.floor(rng.next() * NEUTRAL.length)]);
    fans.push({ ...s, color, skin: ['#f1c9a5', '#d9a77f', '#a8714d', '#6b4630', '#e8b996'][Math.floor(rng.next() * 5)], phase: rng.next() * Math.PI * 2, eager: rng.next(), flash: rng.next() });
  });
  // group by color once → batched fills per frame
  const byColor = new Map();
  for (const f of fans) { if (!byColor.has(f.color)) byColor.set(f.color, []); byColor.get(f.color).push(f); }
  let intensity = 30;

  return {
    get count() { return fans.length; },
    setIntensity(v) { intensity = Math.max(0, Math.min(100, +v || 0)); },
    get intensity() { return intensity; },
    // cam: { sx(x), sy(y), scale } in px per world unit. `t` seconds. `view` optional {w,h} to cull off-screen fans.
    draw(ctx, { cam, t = 0, view = null }) {
      const s = cam.scale * unit; // px per seat unit
      if (!(s > 0)) return;
      const k = intensity / 100, standShare = 0.15 + 0.8 * k * k, bounce = (0.05 + 0.25 * k) * s;
      const W = view?.w ?? ctx.canvas.width, H = view?.h ?? ctx.canvas.height, pad = 2 * s;
      const close = s >= 7, rad = Math.max(0.9, Math.min(s * 0.32, 7));
      // steps / seat rows: dark bands so the stands read as stands even when sparse
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      for (const f of fans) {
        if (f.row % 2) continue;
        const x = cam.sx(f.x), y = cam.sy(f.y);
        if (x < -pad || y < -pad || x > W + pad || y > H + pad) continue;
        ctx.fillRect(x - s * 0.55, y - s * 0.45 * rowGap, s * 1.1, s * 0.9 * rowGap);
      }
      for (const [color, list] of byColor) {
        ctx.fillStyle = color; ctx.beginPath();
        for (const f of list) {
          const x = cam.sx(f.x), y0 = cam.sy(f.y);
          if (x < -pad || y0 < -pad || x > W + pad || y0 > H + pad) continue;
          const standing = f.eager < standShare;
          const y = y0 - (standing ? bounce * (0.5 + 0.5 * Math.sin(t * (5 + 4 * k) + f.phase)) : 0);
          if (close) { ctx.moveTo(x + rad * 1.1, y + rad * 0.9); ctx.ellipse(x, y + rad * 0.9, rad * 1.1, rad * 0.8, 0, 0, Math.PI * 2); }
          else ctx.rect(x - rad, y - rad, rad * 2, rad * 2);
        }
        ctx.fill();
      }
      if (close) {
        // heads + raised arms
        ctx.beginPath();
        for (const f of fans) {
          const x = cam.sx(f.x), y0 = cam.sy(f.y);
          if (x < -pad || y0 < -pad || x > W + pad || y0 > H + pad) continue;
          const standing = f.eager < standShare;
          const y = y0 - (standing ? bounce * (0.5 + 0.5 * Math.sin(t * (5 + 4 * k) + f.phase)) : 0);
          ctx.moveTo(x + rad * 0.55, y - rad * 0.2); ctx.arc(x, y - rad * 0.2, rad * 0.55, 0, Math.PI * 2);
        }
        ctx.fillStyle = '#d6a985'; ctx.fill();
        if (k > 0.45) {
          ctx.strokeStyle = 'rgba(230,200,170,.8)'; ctx.lineWidth = Math.max(1, rad * 0.3); ctx.beginPath();
          for (const f of fans) {
            if (f.eager > standShare * 0.6) continue;
            const x = cam.sx(f.x), y = cam.sy(f.y) - bounce;
            if (x < -pad || y < -pad || x > W + pad || y > H + pad) continue;
            const w = Math.sin(t * 7 + f.phase) * rad * 0.5;
            ctx.moveTo(x - rad * 0.6, y); ctx.lineTo(x - rad * 0.9 + w, y - rad * 1.6); ctx.moveTo(x + rad * 0.6, y); ctx.lineTo(x + rad * 0.9 + w, y - rad * 1.6);
          }
          ctx.stroke();
        }
      }
      // camera flashes on big moments
      if (k > 0.7) {
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        const slot = Math.floor(t * 12);
        for (const f of fans) {
          if (((f.flash * 997 + slot * 0.6180339) % 1) > 0.006 * (k - 0.7) / 0.3) continue;
          const x = cam.sx(f.x), y = cam.sy(f.y);
          if (x < 0 || y < 0 || x > W || y > H) continue;
          ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
      }
      ctx.restore();
    },
  };
}
