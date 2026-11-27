// 3D stage on the PlayCanvas Engine (MIT, vendored in vendor/playcanvas): application, sky, ground, sun with shadows, camera.
// Loaded lazily (the 2.9 MB engine is only fetched when the "3D (PlayCanvas)" visual mode is chosen). Everything created here is released by dispose().
import { qualitySettings, DEFAULT_QUALITY, pixelRatioFor, readBloom } from './quality.js';

let enginePromise = null;
export const loadEngine = () => (enginePromise ||= import('../../vendor/playcanvas/playcanvas.min.mjs'));

// canvas: the <canvas> to draw on (owned by the caller). Returns { pc, app, root, camera, sun, resize(w,h), setQuality(level), dispose() }.
export async function createStage(canvas, { quality = DEFAULT_QUALITY } = {}) {
  const pc = await loadEngine();
  let q = qualitySettings(quality, globalThis.devicePixelRatio);
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { antialias: q.antialias, alpha: false, powerPreference: 'high-performance' } });
  app.graphicsDevice.maxPixelRatio = q.pixelRatio;
  app.scene.ambientLight = new pc.Color(0.38, 0.42, 0.5);
  const root = new pc.Entity('stage'); app.root.addChild(root);

  const camera = new pc.Entity('camera'); camera.addComponent('camera', { clearColor: new pc.Color(0.46, 0.64, 0.86), fov: 38, nearClip: 0.5, farClip: 600 });
  camera.setPosition(0, 38, 62); camera.lookAt(0, 0, 0); root.addChild(camera);

  const sun = new pc.Entity('sun');
  sun.addComponent('light', { type: 'directional', color: new pc.Color(1, 0.96, 0.88), intensity: 1.5, castShadows: q.shadow.on, shadowResolution: q.shadow.resolution, shadowDistance: q.shadow.distance, shadowBias: 0.25, normalOffsetBias: 0.08 });
  sun.setEulerAngles(52, 28, 0); root.addChild(sun);

  const grass = new pc.StandardMaterial(); grass.diffuse = new pc.Color(0.1, 0.38, 0.14); grass.gloss = 0.1; grass.metalness = 0; grass.useMetalness = true; grass.update();
  const ground = new pc.Entity('ground'); ground.addComponent('render', { type: 'plane', material: grass, castShadows: false, receiveShadows: true }); ground.setLocalScale(160, 1, 80); root.addChild(ground);

  // Stand-in markers (replaced by the real field in Etapa 3): they cast shadows, so shadow bias / acne can be checked by eye.
  const white = new pc.StandardMaterial(); white.diffuse = new pc.Color(0.92, 0.92, 0.95); white.update();
  for (const x of [-30, 0, 30]) { const m = new pc.Entity('marker'); m.addComponent('render', { type: 'box', material: white, castShadows: true, receiveShadows: true }); m.setLocalScale(1.2, 6, 1.2); m.setPosition(x, 3, 0); root.addChild(m); }
  camera.setPosition(0, 30, 52); camera.lookAt(0, 1, 0);
  let size = null;
  // The engine's resizeCanvas multiplies by min(maxPixelRatio, devicePixelRatio) so it can never SUPERsample on a 1x screen; for Full HD we set the buffer resolution ourselves (css size stays the same).
  const applySize = () => { const dev = app.graphicsDevice, ratio = pixelRatioFor(q, size[0]); dev.maxPixelRatio = ratio; dev.resizeCanvas(size[0], size[1]); const W = Math.round(size[0] * ratio), H = Math.round(size[1] * ratio); if (dev.canvas.width !== W || dev.canvas.height !== H) dev.setResolution(W, H); };
  // Post-processing (quality high + Bloom on): the engine's CameraFrame renders the scene in HDR, blooms the bright parts (floodlights, video board, lit
  // ice / lamps) and tone-maps in the compose pass (so applyLook must not tone-map the camera again). Anything else: plain forward rendering.
  let frame = null;
  const applyFx = () => {
    const want = q.level === 'high' && readBloom() && typeof pc.CameraFrame === 'function';
    if (want && !frame) { try { frame = new pc.CameraFrame(app, camera.camera); frame.rendering.toneMapping = pc.TONEMAP_ACES2; frame.bloom.intensity = 0.03; frame.bloom.blurLevel = 14; camera.camera.toneMapping = pc.TONEMAP_NONE; frame.update(); } catch (e) { console.warn('bloom unavailable:', e.message); frame = null; } }
    else if (!want && frame) { frame.destroy(); frame = null; camera.camera.toneMapping = pc.TONEMAP_ACES2; }
    else if (frame) frame.update();
  };
  applyFx();
  app.start();
  const api = {
    pc, app, root, camera, sun, ground,
    get quality() { return q; },
    // The graphics device sizes the drawing buffer as css size x maxPixelRatio (the application-level resizeCanvas depends on the fill mode and was a no-op here).
    resize(w, h) { if (w > 0 && h > 0) { size = [w, h]; applySize(); } },
    setQuality(level) {
      q = qualitySettings(level, globalThis.devicePixelRatio);
      sun.light.castShadows = q.shadow.on; sun.light.shadowResolution = q.shadow.resolution; sun.light.shadowDistance = q.shadow.distance; if (size) applySize(); applyFx();
    },
    get bloom() { return !!frame; }, frameActive: () => !!frame,
    dispose() {
      if (api.disposed) return; api.disposed = true;
      try { app.destroy(); } catch { /* already gone */ }
      try { canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* context already released */ }
    },
  };
  return api;
}
