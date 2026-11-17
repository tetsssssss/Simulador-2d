import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherFor, stepParticles, createWeather, WEATHER_MODES } from '../core/render/weather.js';
test('weatherFor: deterministic per seed, indoor hockey always clear, sensible odds', () => {
  assert.equal(weatherFor('nfl', 'SEA@NE'), weatherFor('nfl', 'SEA@NE'));
  for (let i = 0; i < 50; i++) assert.equal(weatherFor('nhl', 'g' + i), 'clear');
  const c = {}; for (let i = 0; i < 2000; i++) { const k = weatherFor('nfl', 'seed' + i); c[k] = (c[k] || 0) + 1; }
  assert.ok(c.clear > 1200 && c.clear < 1650 && c.rain > 100 && c.snow > 50 && c.fog > 50, JSON.stringify(c));
  const m = {}; for (let i = 0; i < 1000; i++) { const k = weatherFor('mlb', 'x' + i); m[k] = (m[k] || 0) + 1; } assert.ok(!m.snow && m.clear > 650, JSON.stringify(m));
});
test('stepParticles keeps every particle inside the unit square (wraps)', () => {
  const ps = Array.from({ length: 50 }, (_, i) => ({ x: i / 50, y: (i * 7 % 50) / 50, s: 1, ph: i }));
  for (let k = 0; k < 400; k++) stepParticles(ps, 0.05, { vx: -0.3, vy: 1.4, sway: 0.05 }, k * 0.05);
  assert.ok(ps.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
});
test('createWeather.draw: clear draws nothing; rain / snow / fog draw; bad sizes are ignored', () => {
  const calls = []; const ctx = new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(k); }), set: () => true });
  const wx = createWeather({ sport: 'nfl', seed: 's' });
  wx.setMode('clear'); wx.draw(ctx, 800, 600); assert.equal(calls.length, 0);
  for (const m of ['rain', 'snow', 'fog']) { calls.length = 0; wx.setMode(m); assert.equal(wx.kind, m); wx.draw(ctx, 800, 600, 0.016); assert.ok(calls.includes('fillRect'), m); }
  calls.length = 0; wx.setMode('rain'); wx.draw(ctx, 0, 0); assert.equal(calls.length, 0);
  wx.setMode('bogus'); assert.ok(WEATHER_MODES.includes('auto') && ['clear', 'rain', 'snow', 'fog'].includes(wx.kind));
});
