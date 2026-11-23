// 3D stage on the PlayCanvas Engine (MIT, vendored in vendor/playcanvas): application, sky, ground, sun with shadows, camera.
// Loaded lazily (the 2.9 MB engine is only fetched when the "3D (PlayCanvas)" visual mode is chosen). Everything created here is released by dispose().
import { qualitySettings, DEFAULT_QUALITY } from './quality.js';

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
  app.start();
  const api = {
    pc, app, root, camera, sun, ground,
    get quality() { return q; },
    resize(w, h) { if (w > 0 && h > 0) app.resizeCanvas(w, h); },
    setQuality(level) {
      q = qualitySettings(level, globalThis.devicePixelRatio); app.graphicsDevice.maxPixelRatio = q.pixelRatio;
      sun.light.castShadows = q.shadow.on; sun.light.shadowResolution = q.shadow.resolution; sun.light.shadowDistance = q.shadow.distance; app.resizeCanvas();
    },
    dispose() {
      if (api.disposed) return; api.disposed = true;
      try { app.destroy(); } catch { /* already gone */ }
      try { canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* context already released */ }
    },
  };
  return api;
}
