// Generic smooth 2D camera (world units → CSS pixels). Sport-agnostic: each sport defines its own presets
// (which point to follow, how many world units to show). Smoothing is time-based (frame-rate independent).
export function createCamera({ worldMinX = 0, worldMinY = 0, worldMaxX = 100, worldMaxY = 100, margin = 6 } = {}) {
  const cam = { x: (worldMinX + worldMaxX) / 2, y: (worldMinY + worldMaxY) / 2, scale: 1, tx: 0, ty: 0, tview: 100, view: 100, W: 1, H: 1, init: false, flipY: false };
  cam.tx = cam.x; cam.ty = cam.y;

  function fitScale(viewUnits, aspectHint = null) {
    // viewUnits = world units that must fit horizontally; if aspectHint given, also fit that many units vertically.
    const sx = cam.W / viewUnits;
    return aspectHint ? Math.min(sx, cam.H / aspectHint) : sx;
  }
  const api = {
    get x() { return cam.x; }, get y() { return cam.y; }, get scale() { return cam.scale; },
    setViewport(W, H) { cam.W = W; cam.H = H; },
    // Target: center (x,y), showing `viewW` units across (and at least `viewH` units tall when given).
    target(x, y, viewW, viewH = null) { cam.tx = x; cam.ty = y; cam.tview = viewW; cam.tviewH = viewH; },
    snap() { cam.x = cam.tx; cam.y = cam.ty; cam.view = cam.tview; cam.viewH = cam.tviewH; cam.init = true; },
    update(dt, rate = 4.5) {
      if (!cam.init) api.snap();
      const k = 1 - Math.exp(-Math.max(0, dt) * rate);
      cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k;
      cam.view += (cam.tview - cam.view) * k;
      cam.viewH = cam.tviewH == null ? null : (cam.viewH == null ? cam.tviewH : cam.viewH + (cam.tviewH - cam.viewH) * k);
      cam.scale = fitScale(cam.view, cam.viewH);
      // Keep the world on screen when it is smaller than the view; otherwise clamp to the world + margin.
      const halfW = cam.W / cam.scale / 2, halfH = cam.H / cam.scale / 2;
      const cx = (worldMinX + worldMaxX) / 2, cy = (worldMinY + worldMaxY) / 2;
      cam.x = (worldMaxX - worldMinX + 2 * margin <= 2 * halfW) ? cx : Math.min(worldMaxX + margin - halfW, Math.max(worldMinX - margin + halfW, cam.x));
      cam.y = (worldMaxY - worldMinY + 2 * margin <= 2 * halfH) ? cy : Math.min(worldMaxY + margin - halfH, Math.max(worldMinY - margin + halfH, cam.y));
    },
    sx: x => (x - cam.x) * cam.scale + cam.W / 2,
    sy: y => (cam.flipY ? -(y - cam.y) : (y - cam.y)) * cam.scale + cam.H / 2,
    set flipY(v) { cam.flipY = v; },
    // screen → world (for clicks)
    wx: px => (px - cam.W / 2) / cam.scale + cam.x,
    wy: py => (cam.flipY ? -1 : 1) * (py - cam.H / 2) / cam.scale + cam.y,
  };
  return api;
}
