import test from 'node:test';
import assert from 'node:assert/strict';
import { qualitySettings, QUALITY_LEVELS, DEFAULT_QUALITY, pixelRatioFor, FULL_HD_WIDTH } from '../core/render3d/quality.js';
import { VISUAL_MODES, isAvatarMode } from '../core/render/avatars.js';
test('quality levels: shadows off only on low, pixel ratio capped per level, bad input falls back to the default level', () => {
  assert.deepEqual(QUALITY_LEVELS, ['low', 'medium', 'high']); assert.equal(DEFAULT_QUALITY, 'medium');
  assert.equal(qualitySettings('low', 3).shadow.on, false); assert.equal(qualitySettings('low', 3).pixelRatio, 1);
  assert.equal(qualitySettings('medium', 3).pixelRatio, 1.5); assert.equal(qualitySettings('high', 3).pixelRatio, 2); assert.equal(qualitySettings('high', 1).pixelRatio, 1);
  assert.ok(qualitySettings('high').shadow.resolution > qualitySettings('medium').shadow.resolution);
  for (const bad of [NaN, 0, -2, undefined, 'x']) assert.ok(qualitySettings('medium', bad).pixelRatio >= 1);
  assert.equal(qualitySettings('ultra').level, 'medium');
});
test('the "3d" visual mode is selectable and still counts as an athlete mode for the hidden 2D layer', () => {
  assert.ok(VISUAL_MODES.some(([k, l]) => k === '3d' && /3D/.test(l))); assert.ok(isAvatarMode('3d'));
});

test('Full HD: high quality renders at least 1920 px wide (capped 3x); lower levels keep their own pixel ratio', () => {
  const hi = qualitySettings('high', 1); assert.equal(FULL_HD_WIDTH, 1920);
  assert.ok(Math.abs(pixelRatioFor(hi, 960) - 2) < 1e-9); assert.ok(Math.abs(pixelRatioFor(hi, 1920) - 1) < 1e-9); assert.equal(pixelRatioFor(hi, 400), 3); assert.equal(pixelRatioFor(hi, 3000), 1);
  assert.equal(pixelRatioFor(hi, 0), hi.pixelRatio); const md = qualitySettings('medium', 1); assert.equal(pixelRatioFor(md, 600), md.pixelRatio);
  const hd2 = qualitySettings('high', 2); assert.equal(pixelRatioFor(hd2, 1500), 2);
});
