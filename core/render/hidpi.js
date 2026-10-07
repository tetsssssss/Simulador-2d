// HiDPI canvas: separates CSS size (layout) from the internal backing-store resolution (CSS × devicePixelRatio).
// Tracks element resizes (ResizeObserver, not just window resize) and DPR changes (monitor switch / browser zoom).
// Drawing code always works in CSS pixels; begin() applies the DPR transform for the frame.
export function attachHiDPI(canvas, { onResize = null, maxDpr = 3, minW = 1, minH = 1 } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const st = { w: 0, h: 0, dpr: 1 };
  function measure() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(maxDpr, Math.max(1, window.devicePixelRatio || 1));
    const w = Math.max(minW, Math.round(r.width)), h = Math.max(minH, Math.round(r.height));
    if (w === st.w && h === st.h && dpr === st.dpr) return false;
    st.w = w; st.h = h; st.dpr = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    begin();
    if (onResize) onResize(api);
    return true;
  }
  function begin() {
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
  ro?.observe(canvas);
  let mq = null;
  function onDpr() { measure(); watchDpr(); }
  function watchDpr() {
    mq?.removeEventListener?.('change', onDpr);
    if (typeof matchMedia === 'undefined') return;
    mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener?.('change', onDpr);
  }
  watchDpr();
  measure();
  const api = {
    ctx, canvas, measure, begin,
    get w() { return st.w; }, get h() { return st.h; }, get dpr() { return st.dpr; },
    dispose() { ro?.disconnect(); mq?.removeEventListener?.('change', onDpr); },
  };
  return api;
}
