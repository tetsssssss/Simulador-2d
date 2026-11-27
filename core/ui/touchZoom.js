// Two-finger pinch on a game canvas = one step along a "zoom ladder" (closest -> widest camera). Pure tracker + a Pointer Events binder.
//   step -1 = zoom in (fingers apart), +1 = zoom out (fingers together). After a step the baseline resets, so a long pinch walks several steps.
export function createPinchTracker(threshold = 0.28) {
  let base = 0;
  return {
    reset() { base = 0; },
    // pts: [{x,y},{x,y}] (current positions of exactly two touches). Returns -1 | 0 | +1.
    update(pts) {
      if (!pts || pts.length !== 2) { base = 0; return 0; }
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); if (!(d > 1)) return 0;
      if (!base) { base = d; return 0; }
      const r = d / base;
      if (r > 1 + threshold) { base = d; return -1; }
      if (r < 1 / (1 + threshold)) { base = d; return 1; }
      return 0;
    },
  };
}
// Move along `ladder` (array, closest first) from `current` by `step` (-1 in / +1 out), clamped to the ends. Unknown current = the middle.
export function ladderStep(ladder, current, step) {
  let i = ladder.indexOf(current); if (i < 0) i = Math.floor(ladder.length / 2);
  return ladder[Math.max(0, Math.min(ladder.length - 1, i + step))];
}
export function attachPinchZoom(canvas, onStep) {
  if (!canvas || typeof canvas.addEventListener !== 'function') return () => {};
  const pts = new Map(), tr = createPinchTracker();
  canvas.style.touchAction = 'pan-x pan-y';          // we handle two-finger pinch ourselves; one finger still scrolls the page
  const down = e => { if (e.pointerType === 'touch') pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size !== 2) tr.reset(); };
  const move = e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const s = tr.update([...pts.values()]); if (s) onStep(s); } };
  const up = e => { pts.delete(e.pointerId); tr.reset(); };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  return () => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); };
}
