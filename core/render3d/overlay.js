// Mounts the 3D stage over a game's 2D canvas when the visual mode is "3d". The 2D renderer keeps running underneath (invisible, still receiving clicks)
// so selection, labels and the simulation loop are untouched; later stages replace the stand-in scene with the real match renderer.
import { getVisualMode } from '../render/avatars.js';
import { readQuality, supportsWebGL2 } from './quality.js';

export function mount3dOverlay({ canvas, sport = 'game', createRenderer = null, onFallback = () => {} } = {}) {
  const wrap = canvas?.parentElement; if (!wrap) return () => {};
  let stage = null, canvas3d = null, ro = null, token = 0, disposed = false, renderer = null;
  const note = msg => { const n = document.createElement('div'); n.textContent = msg; n.style.cssText = 'position:absolute;left:10px;top:10px;z-index:9;background:#7a1f1f;color:#fff;padding:6px 10px;border-radius:6px;font:12px system-ui'; wrap.appendChild(n); setTimeout(() => n.remove(), 5000); };
  const size = () => { const r = wrap.getBoundingClientRect(); return [Math.max(1, Math.round(canvas.clientWidth || r.width)), Math.max(1, Math.round(canvas.clientHeight || r.height))]; };
  async function enter() {
    if (stage || canvas3d) return; const my = ++token;
    if (!supportsWebGL2()) { note('3D indisponível neste aparelho (WebGL2). Voltando ao 2D.'); onFallback(); return; }
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    canvas3d = document.createElement('canvas'); canvas3d.className = 'asu-3d-canvas'; canvas3d.dataset.sport = sport;
    canvas3d.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
    canvas.after(canvas3d); canvas.style.opacity = '0';
    try {
      const { createStage } = await import('./stage.js'); const s = await createStage(canvas3d, { quality: readQuality() });
      if (my !== token || disposed) { s.dispose(); canvas3d?.remove(); canvas3d = null; return; }   // mode changed while the engine was loading
      stage = s; const [w, h] = size(); stage.resize(w, h);
      if (createRenderer) { renderer = await createRenderer(stage, canvas3d); if (my !== token || disposed) { renderer.dispose?.(); renderer = null; stage.dispose(); stage = null; canvas3d?.remove(); canvas3d = null; return; } }
      ro = new ResizeObserver(() => { const [a, b] = size(); stage?.resize(a, b); }); ro.observe(wrap);
      window.__asu3dRenderer = renderer;   // test hook
      window.__asu3d = { sport, version: stage.pc.version, device: stage.app.graphicsDevice.deviceType, quality: stage.quality.level, mounts: (window.__asu3d?.mounts || 0) + 1 };
    } catch (e) { console.error('3D mode failed:', e); leave(); note('Não foi possível iniciar o 3D. Voltando ao 2D.'); onFallback(); }
  }
  function leave() {
    token++; ro?.disconnect(); ro = null; renderer?.dispose?.(); renderer = null; stage?.dispose(); stage = null; canvas3d?.remove(); canvas3d = null; canvas.style.opacity = '';
    if (window.__asu3d) window.__asu3d = { ...window.__asu3d, active: false };
  }
  const sync = () => (getVisualMode() === '3d' ? enter() : leave());
  const onMode = () => sync();
  window.addEventListener('asu-visual-mode', onMode); sync();
  const api = () => { disposed = true; window.removeEventListener('asu-visual-mode', onMode); leave(); };
  // The game loop calls these every frame / on clicks; they do nothing while the 3D mode is off.
  api.render = (sim, alpha, opts) => { if (renderer) renderer.render(sim, alpha, opts); };
  api.pick = (px, py) => (renderer?.pick ? renderer.pick(px, py) : null);
  api.beginReplay = sim => renderer?.beginReplay?.(sim); api.endReplay = sim => renderer?.endReplay?.(sim);
  Object.defineProperty(api, 'active', { get: () => !!renderer });
  return api;
}
