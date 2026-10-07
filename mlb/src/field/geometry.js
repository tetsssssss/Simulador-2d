// MLB field geometry in feet. Home plate at (0,0); +y toward center field; +x toward the first-base side.
// Foul lines run at ±45°. Fence: 330 ft down the lines, 400 ft to center (smooth profile).
export const BASE = 90, MOUND = { x: 0, y: 60.5, r: 9 };
const d45 = BASE / Math.SQRT2;
export const BASES = { home: { x: 0, y: 0 }, first: { x: d45, y: d45 }, second: { x: 0, y: 2 * d45 }, third: { x: -d45, y: d45 } };
export const FENCE = { line: 330, center: 400 };
// Fence distance at angle a (radians from the CF line; |a| ≤ 45°).
export function fenceDist(a) { const c = Math.cos(a * 2); return FENCE.line + (FENCE.center - FENCE.line) * c * c; }
export function fencePoint(a, inset = 0) { const d = fenceDist(a) - inset; return { x: Math.sin(a) * d, y: Math.cos(a) * d }; }
export const isFair = (x, y) => y >= Math.abs(x) - 0.01;
export const angleOf = (x, y) => Math.atan2(x, y); // 0 = CF, +45° = RF line, -45° = LF line
// Defensive alignment (standard depth). Catcher behind the plate.
export const DEF_SPOTS = {
  P: { x: 0, y: 60.5 }, C: { x: 0, y: -4.5 }, '1B': { x: 58, y: 98 }, '2B': { x: 34, y: 145 }, SS: { x: -34, y: 145 },
  '3B': { x: -58, y: 98 }, LF: { x: -152, y: 262 }, CF: { x: 0, y: 318 }, RF: { x: 152, y: 262 },
};
export const BATTER_SPOT = hand => ({ x: hand === 'L' ? 3.2 : -3.2, y: 0.2 });
