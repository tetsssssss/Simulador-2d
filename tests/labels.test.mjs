// Label declutter: plates of stacked bodies must not overlap, must-show plates always survive, determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeLabels } from '../core/render/labels.js';

const mk = (id, cx, y0, prio = 1, must = false) => ({ id, cx, below: y0 + 10, above: y0 - 40, w: 60, h: 14, side: 18, prio, must });
const body = (id, cx, y0) => ({ id, x: cx - 10, y: y0 - 30, w: 20, h: 40 });
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('plates of 10 stacked bodies never overlap each other', () => {
  const items = [], bodies = [];
  for (let i = 0; i < 10; i++) { const cx = 100 + (i % 5) * 7, y0 = 200 + Math.floor(i / 5) * 6; items.push(mk('p' + i, cx, y0)); bodies.push(body('p' + i, cx, y0)); }
  const out = placeLabels(items, bodies), shown = [...out.values()].filter(Boolean);
  assert.ok(shown.length >= 2, 'at least a couple of plates are readable');
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) assert.ok(!overlap(shown[i], shown[j]), `plates ${i}/${j} overlap`);
});

test('must-show plates (carrier / QB / goalie) are never dropped, even in a pile', () => {
  const items = [], bodies = [];
  for (let i = 0; i < 12; i++) { items.push(mk('p' + i, 100 + i, 200, i === 7 ? 3 : 1, i === 7)); bodies.push(body('p' + i, 100 + i, 200)); }
  const out = placeLabels(items, bodies);
  assert.ok(out.get('p7'), 'carrier keeps its plate');
});

test('an isolated body keeps its default spot (below the feet)', () => {
  const out = placeLabels([mk('a', 300, 300)], [body('a', 300, 300)]);
  assert.equal(out.get('a').spot, 'below');
});

test('placement is deterministic (same input → same output)', () => {
  const items = [], bodies = [];
  for (let i = 0; i < 8; i++) { items.push(mk('p' + i, 100 + i * 5, 200)); bodies.push(body('p' + i, 100 + i * 5, 200)); }
  const a = JSON.stringify([...placeLabels(items, bodies)]), b = JSON.stringify([...placeLabels(items.slice().reverse(), bodies)]);
  assert.equal(a, b);
});

test('bounds: plates are kept inside the canvas', () => {
  const out = placeLabels([mk('a', 20, 100)], [body('a', 20, 100)], { x: 0, y: 0, w: 400, h: 300 });
  const r = out.get('a'); assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 400 && r.y + r.h <= 300);
});
