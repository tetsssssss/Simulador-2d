// Diagnostic FPS overlay (off by default) so frame-time can be measured on a REAL device (phone / PC with GPU) — headless software rendering
// is not representative. Toggle: shell audio menu "Mostrar FPS", or localStorage.asu_perf = '1'. Own rAF loop, no dependency on the sports.
export function frameStats(deltas) {
  if (!deltas.length) return { fps: 0, p50: 0, p95: 0, max: 0, over33: 0 };
  const s = [...deltas].sort((a, b) => a - b), q = p => s[Math.min(s.length - 1, Math.floor(s.length * p))], sum = deltas.reduce((a, b) => a + b, 0);
  return { fps: +(1000 * deltas.length / sum).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), over33: deltas.filter(d => d > 33.4).length };
}
const on = () => { try { return localStorage.getItem('asu_perf') === '1'; } catch { return false; } };
export function initPerfHud(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || typeof window === 'undefined' || window.__asuPerfHud) return;
  window.__asuPerfHud = true;
  let el = null, raf = 0, last = 0, win = [], longTasks = 0, timer = 0, po = null;
  const loop = t => { if (last) { win.push(t - last); if (win.length > 240) win.shift(); } last = t; raf = requestAnimationFrame(loop); };
  const start = () => {
    if (el) return;
    el = doc.createElement('div'); el.id = 'asuPerfHud';
    el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;background:rgba(0,0,0,.72);color:#9ef59e;font:11px/1.3 ui-monospace,monospace;padding:3px 7px;border-radius:6px;pointer-events:none;white-space:pre';
    doc.body.appendChild(el); win = []; last = 0; longTasks = 0; raf = requestAnimationFrame(loop);
    try { po = new PerformanceObserver(l => { longTasks += l.getEntries().length; }); po.observe({ entryTypes: ['longtask'] }); } catch { po = null; }
    timer = setInterval(() => { const s = frameStats(win), heap = performance.memory ? ` · ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : ''; window.__asuPerf = { ...s, longTasks }; el.textContent = `${s.fps} fps · p95 ${s.p95} ms · max ${s.max} ms · >33ms ${s.over33}/${win.length} · long ${longTasks}${heap}`; }, 1000);
  };
  const stop = () => { cancelAnimationFrame(raf); clearInterval(timer); po?.disconnect(); el?.remove(); el = null; };
  const sync = () => (on() ? start() : stop());
  window.addEventListener('storage', e => { if (!e.key || e.key === 'asu_perf') sync(); });
  sync();
}
