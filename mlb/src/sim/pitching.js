// Pitching model: pitch types, arsenal derived from a pitcher's ratings, pitch selection (count / situation / platoon /
// sequence) and pitch physics (velocity, spin rpm + axis, horizontal/vertical break in inches, release and path).
// Pure functions: randomness only through the `rng`/`gauss` the engine passes in (seeded), so games stay deterministic.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const jit = (key, amp) => ((hash(key) % 2001) / 1000 - 1) * amp;

// theta = spin-axis tilt from pure backspin (0 = 12:00 → pure rise, +90 = arm-side sidespin, 180 = topspin, <0 = glove side).
// M = break magnitude in inches at the reference rpm; dv = mph below the four-seamer; use = base usage.
export const PITCH_DEFS = {
  FF: { code: 'FF', name: 'Four-Seam', pt: 'Fastball', dv: 0, rpm: 2300, theta: 22, M: 18, use: 0.36, fam: 'fb' },
  FT: { code: 'FT', name: 'Two-Seam', pt: 'Two-seam', dv: -2, rpm: 2180, theta: 48, M: 17, use: 0.09, fam: 'fb' },
  SI: { code: 'SI', name: 'Sinker', pt: 'Sinker', dv: -3, rpm: 2100, theta: 64, M: 16, use: 0.1, fam: 'fb' },
  FC: { code: 'FC', name: 'Cutter', pt: 'Cutter', dv: -5.5, rpm: 2400, theta: -44, M: 10.5, use: 0.08, fam: 'fb' },
  SL: { code: 'SL', name: 'Slider', pt: 'Slider', dv: -9, rpm: 2450, theta: -78, M: 13.5, use: 0.17, fam: 'br' },
  CU: { code: 'CU', name: 'Curveball', pt: 'Curva', dv: -14, rpm: 2650, theta: -150, M: 17, use: 0.09, fam: 'br' },
  CH: { code: 'CH', name: 'Changeup', pt: 'Changeup', dv: -9.5, rpm: 1750, theta: 68, M: 15, use: 0.12, fam: 'off' },
  FS: { code: 'FS', name: 'Splitter', pt: 'Splitter', dv: -8.5, rpm: 1450, theta: 105, M: 12, use: 0.05, fam: 'off' },
};
export const PITCH_CODES = Object.keys(PITCH_DEFS);

// Quality (0..1) of each pitch for this pitcher, from his ratings.
function gradeOf(type, R) {
  switch (type) {
    case 'FF': return R.fb * 0.6 + R.velo * 0.4;
    case 'FT': return R.fb * 0.5 + R.movement * 0.3 + R.velo * 0.2;
    case 'SI': return R.fb * 0.4 + R.movement * 0.4 + R.control * 0.2;
    case 'FC': return R.brk * 0.5 + R.fb * 0.5;
    case 'SL': return R.brk * 0.7 + R.movement * 0.3;
    case 'CU': return R.brk * 0.65 + R.movement * 0.2 + R.control * 0.15;
    case 'CH': return R.off * 0.7 + R.control * 0.15 + R.movement * 0.15;
    default: return R.off * 0.6 + R.movement * 0.25 + R.velo * 0.15; // FS
  }
}

// Arsenal: every pitcher owns a primary fastball; other pitches only if the grade clears the bar (3..6 pitches).
// A per-pitcher/per-type seeded jitter makes two pitchers with similar ratings throw different mixes.
export function buildArsenal(R, key) {
  const g = Object.fromEntries(PITCH_CODES.map(t => [t, clamp(gradeOf(t, R) + jit(`${key}|${t}`, 0.14) + (t === 'FF' ? 0.05 : 0), 0.05, 1)]));
  const fbs = ['FF', 'FT', 'SI'].sort((a, b) => g[b] - g[a]);
  const chosen = [fbs[0]];
  const rest = PITCH_CODES.filter(t => t !== fbs[0]).sort((a, b) => g[b] - g[a]);
  const bar = 0.69 - 0.05 * (R.stamina - 0.6); // starters (stamina) carry a bigger repertoire
  for (const t of rest) if (g[t] >= bar && chosen.length < 6) chosen.push(t);
  for (const t of rest) if (chosen.length < 3 && !chosen.includes(t)) chosen.push(t);
  return chosen.map(t => ({ type: t, grade: g[t] }));
}

// Pitch selection: base usage x quality x count x platoon x base-out situation x sequencing.
export function pickPitch(arsenal, c, r01) {
  const W = arsenal.map(a => {
    const d = PITCH_DEFS[a.type];
    let w = d.use * Math.pow(Math.max(0.2, a.grade) / 0.7, 1.6) * (a === arsenal[0] ? 1.6 : 1);
    const ahead = c.strikes > c.balls, behind = c.balls > c.strikes, fb = d.fam === 'fb', swingMiss = a.type === 'SL' || a.type === 'CU' || a.type === 'FS' || a.type === 'CH';
    if (c.balls === 3) w *= fb ? (c.strikes === 0 ? 2.4 : 1.9) : 0.4;
    else if (c.strikes === 2) w *= swingMiss ? 1.55 : a.type === 'FF' ? 0.8 : 1;
    else if (ahead) w *= fb ? 0.82 : 1.3;
    else if (behind) w *= fb ? 1.45 : 0.7;
    if (c.strikes === 0 && c.balls === 0) w *= fb ? 1.15 : 0.9;
    const same = c.sameHand; // pitcher and batter on the same side
    if (same === true) w *= a.type === 'SL' || a.type === 'FC' || a.type === 'CU' ? 1.35 : d.fam === 'off' ? 0.6 : 1;
    else if (same === false) w *= d.fam === 'off' ? 1.5 : a.type === 'SL' ? 0.75 : a.type === 'FT' || a.type === 'SI' ? 1.15 : 1;
    if (c.runners?.includes(1) && c.outs < 2) w *= a.type === 'SI' || a.type === 'FT' ? 1.35 : 1; // look for the double play
    if (c.runners?.includes(3) && c.outs < 2) w *= a.type === 'FS' || a.type === 'CU' ? 0.75 : fb ? 1.1 : 1; // keep it out of the dirt
    if (c.runners?.length === 3) w *= fb ? 1.2 : 0.85;
    if (c.last && c.last[c.last.length - 1] === a.type) w *= c.last[c.last.length - 2] === a.type ? 0.35 : 0.8;
    if (c.last?.length && PITCH_DEFS[c.last[c.last.length - 1]].fam === 'fb' && d.fam !== 'fb') w *= 1.1;
    return w;
  });
  let tot = 0; for (const w of W) tot += w;
  let r = r01() * tot; for (let i = 0; i < W.length; i++) { r -= W[i]; if (r <= 0) return arsenal[i]; }
  return arsenal[0];
}

// Clock-face label of a spin axis (0° = 12:00).
export const clockLabel = deg => { const m = Math.round(((deg % 360 + 360) % 360) / 360 * 720) % 720; const h = Math.floor(m / 60) || 12; return `${h}:${String(m % 60).padStart(2, '0')}`; };

// Physics of one pitch. adj = { velo, move } adaptive offsets (mph / inches fraction). Returns release + break numbers.
// Break convention: hb > 0 = toward the pitcher's ARM side, vb > 0 = induced rise (inches, vs. a spinless ball).
export function pitchPhysics(type, grade, R, throws, gauss, adj = {}) {
  const d = PITCH_DEFS[type];
  const mph = 86 + 12 * R.velo + d.dv + (adj.velo || 0) + gauss() * 0.8;
  const rpm = Math.round(d.rpm * (0.9 + 0.2 * (0.5 * R.movement + 0.5 * grade)) + gauss() * 70);
  const theta = d.theta + gauss() * 4.5;
  const eff = clamp(0.88 + gauss() * 0.04 + (type === 'FF' ? 0.04 : 0), 0.6, 0.99); // share of spin that creates break
  const mag = d.M * (rpm / d.rpm) * (0.75 + 0.5 * R.movement) * (mph / (86 + 12 * R.velo + d.dv)) * eff * (1 + (adj.move || 0));
  const th = theta * Math.PI / 180;
  const hb = mag * Math.sin(th), vb = mag * Math.cos(th);
  const axis = ((throws === 'L' ? -theta : theta) % 360 + 360) % 360; // lefties mirror the axis
  return { mph, rpm, axis: Math.round(axis), clock: clockLabel(axis), hb: +hb.toFixed(1), vb: +vb.toFixed(1), eff: +eff.toFixed(2) };
}

// Quality of a pitch as a hitter sees it (0..1) from its numbers.
export function stuffOf({ grade, mph, hb, vb, rpm }, fatigueDelta = 0, formDelta = 0) {
  const moveN = clamp(Math.hypot(hb, vb) / 22, 0, 1), veloN = clamp((mph - 80) / 20, 0, 1), spinN = clamp(rpm / 3000, 0, 1);
  return clamp(0.04 + 0.62 * grade + 0.14 * moveN + 0.12 * veloN + 0.06 * spinN + 0.0015 * fatigueDelta + 0.0015 * formDelta, 0.05, 1);
}

// Ball path from release to plate. k in 0..1. The ball leaves along the line to the "no-break" point and the break
// accumulates late (k^2.6), landing exactly on (x, z). Coordinates in feet (plate frame): y from 54.5 to 0.5.
export function pitchPath(rel, plate, hb, vb, throws, k) {
  const armDir = throws === 'L' ? 1 : -1; // arm side: RHP → toward the third-base side (−x), LHP → +x
  const bx = plate.x - armDir * hb / 12, bz = plate.z - vb / 12 - 0.0; // where the pitch would arrive without the break
  const x0 = rel.x, z0 = rel.z;
  const late = Math.pow(k, 2.6);
  return { x: x0 + (bx - x0) * k + (plate.x - bx) * late, y: 54.5 * (1 - k) + 0.5, z: z0 + (bz - z0) * k + (plate.z - bz) * late };
}
