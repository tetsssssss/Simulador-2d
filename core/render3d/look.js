// Lighting looks for the 3D stage (day / dusk / night). Pure data + one apply function.
export const LOOKS = {
  day:   { sky: [0.46, 0.64, 0.86], ambient: [0.38, 0.42, 0.5], sun: { color: [1, 0.96, 0.88], intensity: 1.5, euler: [52, 28, 0] }, flood: 0,   fog: { color: [0.62, 0.74, 0.9], density: 0.0012 }, exposure: 1.0 },
  dusk:  { sky: [0.93, 0.55, 0.36], ambient: [0.34, 0.3, 0.38], sun: { color: [1, 0.62, 0.35], intensity: 1.1, euler: [14, 62, 0] }, flood: 0.6, fog: { color: [0.85, 0.52, 0.4], density: 0.0022 }, exposure: 1.05 },
  night: { sky: [0.03, 0.05, 0.1], ambient: [0.3, 0.34, 0.48], sun: { color: [0.92, 0.94, 1], intensity: 0.85, euler: [72, 24, 0] }, flood: 1,   fog: { color: [0.04, 0.06, 0.12], density: 0.0018 }, exposure: 1.15 },
};
export const LOOK_NAMES = Object.keys(LOOKS);
export const lookFor = name => LOOKS[name] || LOOKS.day;
// "auto" picks by game clock: Q1-Q2 day, Q3 dusk, Q4/OT night (pure, testable).
export function lookByQuarter(q) { return q >= 4 ? 'night' : q === 3 ? 'dusk' : 'day'; }

export function applyLook(stage, name, floods = [], fogMul = 1) {
  const L = lookFor(name), { pc, app, camera, sun } = stage, C = a => new pc.Color(a[0], a[1], a[2]);
  camera.camera.clearColor = C(L.sky); app.scene.ambientLight = C(L.ambient);
  sun.light.color = C(L.sun.color); sun.light.intensity = L.sun.intensity; sun.setEulerAngles(...L.sun.euler);
  app.scene.fog.type = pc.FOG_EXP2; app.scene.fog.color = C(L.fog.color); app.scene.fog.density = L.fog.density * fogMul;
  camera.camera.toneMapping = pc.TONEMAP_ACES2; app.scene.exposure = L.exposure;
  for (const f of floods) f.enabled = L.flood > 0, f.light && (f.light.intensity = 22 * L.flood);
  return L;
}
