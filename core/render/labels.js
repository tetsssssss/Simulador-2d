// Label declutter (presentation only). Sprites in a pile used to print their name plates on top of each other, which
// made the NFL line of scrimmage and the NHL crease unreadable. A LabelLayer collects the plates during the sprite
// pass and places them afterwards, highest priority first, trying a few spots around each body (below, above, right,
// left, farther below). A plate that finds no free spot is dropped unless it is "must show" (ball carrier, target,
// selected, QB, goalie...), in which case it takes the least overlapped spot. Bodies are obstacles for every plate
// except their own. Pure placement logic (`placeLabels`) has no canvas dependency so it is unit-tested in Node.

const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// items: [{ id, cx, below, above, w, h, prio, must, body }]   (cx = x center; below/above = top-y of the plate in each spot)
// bodies: [{ id, x, y, w, h }]
// Returns Map(id -> { x, y, w, h, spot } | null).
export function placeLabels(items, bodies = [], bounds = null) {
  const placed = [], out = new Map();
  const order = [...items].sort((a, b) => (b.prio - a.prio) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const it of order) {
    const { cx, w, h } = it;
    const spots = [
      ['below', cx - w / 2, it.below], ['above', cx - w / 2, it.above],
      ['right', cx + it.side, (it.below + it.above) / 2], ['left', cx - it.side - w, (it.below + it.above) / 2],
      ['below2', cx - w / 2, it.below + h + 2], ['above2', cx - w / 2, it.above - h - 2],
    ];
    let best = null, bestCost = Infinity;
    for (const [spot, x, y] of spots) {
      const r = { x, y, w, h, spot };
      if (bounds && (r.x < bounds.x || r.y < bounds.y || r.x + w > bounds.x + bounds.w || r.y + h > bounds.y + bounds.h)) continue;
      let cost = 0;
      for (const p of placed) if (hit(r, p, 1)) cost += area(r, p) + 40;
      for (const b of bodies) if (b.id !== it.id && hit(r, b)) cost += area(r, b) * 0.6 + 6;
      if (cost === 0) { best = r; bestCost = 0; break; }
      if (cost < bestCost) { best = r; bestCost = cost; }
    }
    if (best && (bestCost === 0 || it.must)) { placed.push(best); out.set(it.id, best); } else out.set(it.id, null);
  }
  return out;
}

export function createLabelLayer() {
  let items = [], bodies = [], n = 0;
  return {
    // Called by drawSprite. `draw(ctx, rect)` paints the plate at rect (x,y = top-left in the transform active at add time).
    add(o) { items.push({ ...o, id: o.id ?? ('l' + n++) }); },
    body(o) { bodies.push(o); },
    clear() { items = []; bodies = []; n = 0; },
    flush(ctx, bounds = null) {
      if (!items.length) { bodies = []; return new Map(); }
      const map = placeLabels(items, bodies, bounds);
      for (const it of items) {
        const r = map.get(it.id); if (!r) continue;
        ctx.save(); if (it.tf) ctx.setTransform(it.tf); it.draw(ctx, r); ctx.restore();
      }
      const stats = { shown: [...map.values()].filter(Boolean).length, hidden: [...map.values()].filter(v => !v).length };
      this.last = stats; items = []; bodies = []; n = 0; return map;
    },
    last: { shown: 0, hidden: 0 },
  };
}
