// Weather overlay (presentation only — it never touches the simulation): rain, snow or fog drawn in screen space on top of the field.
// Mode comes from the user's preference (localStorage `asu_weather`: auto | clear | rain | snow | fog); `auto` picks deterministically from the game seed.
// Outdoor sports only (NFL, MLB). Pure helpers (`weatherFor`, `stepParticles`) are unit-tested without a canvas.
import { createRng, hashSeed } from '../rng/rng.js';

export const WEATHER_MODES = ['auto', 'clear', 'rain', 'snow', 'fog'];
// Deterministic "forecast" for a game: same seed, same sky. Odds are per sport (NFL: more snow late in the season is not modelled).
export function weatherFor(sport, seed) {
  const r = createRng(hashSeed(`${sport}:${seed}:wx`)).next();
  if (sport === 'nfl') return r < 0.72 ? 'clear' : r < 0.84 ? 'rain' : r < 0.92 ? 'snow' : 'fog';
  if (sport === 'mlb') return r < 0.8 ? 'clear' : r < 0.9 ? 'rain' : 'fog';
  return 'clear';                                   // hockey is indoors
}
let cachedPref = null;   // cached: read once, refreshed by the `storage` event (the shell menu changes it live)
export function weatherPref() {
  if (cachedPref === null) { cachedPref = readWeatherPref(); if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (!e.key || e.key === 'asu_weather') cachedPref = readWeatherPref(); }); }
  return cachedPref;
}
export const readWeatherPref = () => { try { const v = localStorage.getItem('asu_weather'); return WEATHER_MODES.includes(v) ? v : 'auto'; } catch { return 'auto'; } };

// Advance particles: x/y in 0..1 of the view, wrapping. Returns the same array (mutated).
export function stepParticles(ps, dt, { vx, vy, sway = 0 }, t = 0) {
  for (const p of ps) {
    p.y += (vy * p.s) * dt; p.x += (vx * p.s + (sway ? Math.sin(t * 1.3 + p.ph) * sway : 0)) * dt;
    if (p.y > 1) { p.y -= 1; p.x = (p.x + 0.37) % 1; } if (p.x > 1) p.x -= 1; if (p.x < 0) p.x += 1;
  }
  return ps;
}
const seedParticles = (n, seed) => { const r = createRng(hashSeed(seed)); return Array.from({ length: n }, () => ({ x: r.next(), y: r.next(), s: 0.7 + r.next() * 0.6, ph: r.next() * 6.28 })); };

export function createWeather({ sport = 'nfl', seed = 'wx' } = {}) {
  let mode = 'auto', rain = seedParticles(170, seed + 'r'), snow = seedParticles(120, seed + 's'), t = 0;
  const resolved = () => (mode === 'auto' ? weatherFor(sport, seed) : mode);
  return {
    setMode(m) { mode = WEATHER_MODES.includes(m) ? m : 'auto'; },
    get kind() { return resolved(); },
    draw(ctx, w, h, dt = 0.016) {
      const k = resolved(); if (k === 'clear' || !(w > 0 && h > 0)) return;
      t += dt; ctx.save();
      if (k === 'rain') {
        ctx.fillStyle = 'rgba(8,18,32,.16)'; ctx.fillRect(0, 0, w, h);
        stepParticles(rain, dt, { vx: -0.12, vy: 1.5 }, t);
        ctx.strokeStyle = 'rgba(190,215,240,.5)'; ctx.lineWidth = 1; ctx.beginPath();
        const len = Math.max(8, h * 0.028);
        for (const p of rain) { const X = p.x * w, Y = p.y * h; ctx.moveTo(X, Y); ctx.lineTo(X - len * 0.12, Y + len * p.s); }
        ctx.stroke();
      } else if (k === 'snow') {
        ctx.fillStyle = 'rgba(220,232,245,.07)'; ctx.fillRect(0, 0, w, h);
        stepParticles(snow, dt, { vx: -0.02, vy: 0.14, sway: 0.03 }, t);
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath();
        const rr = Math.max(1.2, h * 0.003);
        for (const p of snow) { const X = p.x * w, Y = p.y * h; ctx.moveTo(X + rr * p.s, Y); ctx.arc(X, Y, rr * p.s, 0, Math.PI * 2); }
        ctx.fill();
      } else if (k === 'fog') {
        for (let i = 0; i < 3; i++) {
          const cx = w * (0.2 + 0.3 * i) + Math.sin(t * 0.07 + i * 2) * w * 0.08, cy = h * (0.3 + 0.25 * i), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
          g.addColorStop(0, 'rgba(210,220,230,.26)'); g.addColorStop(1, 'rgba(210,220,230,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        }
        ctx.fillStyle = 'rgba(200,212,224,.1)'; ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    },
  };
}
