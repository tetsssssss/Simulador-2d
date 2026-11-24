// Quality levels of the 3D mode (pure data, unit-tested). Chosen by the user (menu) or, later, automatically from a first measurement.
export const QUALITY_LEVELS = ['low', 'medium', 'high'];
export const DEFAULT_QUALITY = 'medium';
// pixelRatioCap: max device-pixel-ratio rendered (HiDPI screens cost 4x pixels); shadow: { on, resolution, distance }; antialias: MSAA on the canvas.
export function qualitySettings(level = DEFAULT_QUALITY, devicePixelRatio = 1) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const table = {
    low: { pixelRatioCap: 1, shadow: { on: false, resolution: 512, distance: 60 }, antialias: false },
    medium: { pixelRatioCap: 1.5, shadow: { on: true, resolution: 1024, distance: 90 }, antialias: true },
    high: { pixelRatioCap: 2, shadow: { on: true, resolution: 2048, distance: 140 }, antialias: true },
  };
  const q = table[level] || table[DEFAULT_QUALITY];
  return { level: table[level] ? level : DEFAULT_QUALITY, ...q, pixelRatio: Math.min(dpr, q.pixelRatioCap) };
}
export const QUALITY_MODES = ['auto', ...QUALITY_LEVELS];
// 'auto' (default) starts at medium and lets autoQuality.js move between levels; any other value is a fixed level.
export const readQualityMode = () => { try { const v = localStorage.getItem('asu_3d_quality'); return QUALITY_MODES.includes(v) ? v : 'auto'; } catch { return 'auto'; } };
export const readQuality = () => { try { const v = localStorage.getItem('asu_3d_quality'); return QUALITY_LEVELS.includes(v) ? v : DEFAULT_QUALITY; } catch { return DEFAULT_QUALITY; } };
export const supportsWebGL2 = (doc = typeof document !== 'undefined' ? document : null) => { try { return !!doc?.createElement('canvas').getContext('webgl2'); } catch { return false; } };
