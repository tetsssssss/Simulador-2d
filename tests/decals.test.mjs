import test from 'node:test'; import assert from 'node:assert/strict';
import { textColors, cleanNumber, shortName, DECAL_SPECS } from '../core/render3d/decals.js';
test('textColors: white text on dark jerseys, dark text on light ones, safe on bad input', () => {
  assert.equal(textColors('#0a2870').fg, '#ffffff'); assert.equal(textColors('#f5f5f0').fg, '#101216'); assert.equal(textColors([240, 200, 20]).fg, '#101216');
  assert.ok(textColors(undefined).fg && textColors('red').fg);
});
test('cleanNumber / shortName', () => {
  assert.equal(cleanNumber(7), '7'); assert.equal(cleanNumber('#12'), '12'); assert.equal(cleanNumber('123'), '12'); assert.equal(cleanNumber(null), '');
  assert.equal(shortName('Patrick Mahomes II'), 'MAHOMES'); assert.equal(shortName('Odell Beckham Jr.'), 'BECKHAM'); assert.equal(shortName(''), ''); assert.equal(shortName('Christian McCaffrey', 8), 'MCCAFFRE');
});
test('decal specs: back and front numbers face outward on the right bones; the referee has none', () => {
  for (const k of ['football', 'hockey', 'baseball', 'goalie', 'goalie_hd']) { const d = DECAL_SPECS[k]; assert.equal(d.back.bone, 'spine'); assert.ok(d.back.pos[0] < 0 && d.front.pos[0] > 0 && d.back.yaw === -90 && d.front.yaw === 90, k); }
  assert.equal(DECAL_SPECS.ref.back, null);
});
