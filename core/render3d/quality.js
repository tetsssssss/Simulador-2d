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
// "Full HD": at 'high' the drawing buffer is at least FULL_HD_WIDTH px wide whatever the size of the on-screen view (supersampled, then scaled down by the browser = clean edges); capped at 3x.
export const FULL_HD_WIDTH = 1920;
export const readFullHd = () => { try { return localStorage.getItem('asu_3d_fullhd') !== '0'; } catch { return true; } };   // menu checkbox "Full HD"; default on
export const pixelRatioFor = (q, cssWidth, fullHd = readFullHd()) => (fullHd && q.level === 'high' && cssWidth > 0 ? Math.min(3, Math.max(q.pixelRatio, FULL_HD_WIDTH / cssWidth)) : q.pixelRatio);
export const QUALITY_MODES = ['auto', ...QUALITY_LEVELS];
// Default = 'high' (everything at full quality, own-HD athletes, Full HD buffer). 'auto' (menu choice) starts at medium and lets autoQuality.js move between levels; any other value is a fixed level.
export const DEFAULT_QUALITY_MODE = 'high';
export const readQualityMode = () => { try { const v = localStorage.getItem('asu_3d_quality'); return QUALITY_MODES.includes(v) ? v : DEFAULT_QUALITY_MODE; } catch { return DEFAULT_QUALITY_MODE; } };
export const readQuality = () => { try { const v = localStorage.getItem('asu_3d_quality'); return QUALITY_LEVELS.includes(v) ? v : DEFAULT_QUALITY; } catch { return DEFAULT_QUALITY; } };
export const supportsWebGL2 = (doc = typeof document !== 'undefined' ? document : null) => { try { return !!doc?.createElement('canvas').getContext('webgl2'); } catch { return false; } };

// Frame-rate cap of the 3D mode (user choice 30..100). The 3D view is only drawn when the cap interval has passed (the GPU is idle on skipped frames);
// a display slower than the cap (e.g. 60 Hz screen with cap 100) simply runs at its refresh rate.
export const FPS_CAPS = [30, 45, 60, 75, 90, 100];
export const DEFAULT_FPS_CAP = 60;
export const readFpsCap = () => { try { const v = +localStorage.getItem('asu_3d_fps'); return FPS_CAPS.includes(v) ? v : DEFAULT_FPS_CAP; } catch { return DEFAULT_FPS_CAP; } };
// now/last in ms. A 10 % tolerance stops a 60 fps cap on a 60 Hz display from skipping every other frame because of timer jitter.
export const shouldDraw = (now, last, cap = DEFAULT_FPS_CAP) => !last || now - last >= (1000 / cap) * 0.9;
// Thresholds of the auto quality scale with the cap: a 30 fps cap has 33 ms frames on purpose.
export const autoThresholds = (cap = DEFAULT_FPS_CAP) => ({ slowMs: Math.max(28, 1250 / cap), fastMs: Math.min(15, 800 / cap) });
