// Growth curves (career archetypes): age-based multipliers on progression / decline. Pure data + math.
// A curve shifts the sport's ageCurve (growthEnd / peakEnd) and scales growth and decline. Used by people.progressSeason.
//   PRODIGY  - grows fast and tops out early
//   EARLY    - plateaus early and declines a bit earlier
//   NORMAL   - the sport's reference curve
//   LATE     - slow start, keeps growing years longer
//   LONG     - normal growth, a very long prime, slow decline
//   RAPID    - normal growth, early and steep decline
export const CURVES = {
  PRODIGY: { key: 'PRODIGY', label: 'Prodígio', w: 0.05, dGrow: -2, dPeak: -1, growEarly: 1.4, growLate: 0.9, decl: 1.0 },
  EARLY: { key: 'EARLY', label: 'Early Peak', w: 0.12, dGrow: -2, dPeak: -3, growEarly: 1.2, growLate: 0.8, decl: 1.2 },
  NORMAL: { key: 'NORMAL', label: 'Normal', w: 0.5, dGrow: 0, dPeak: 0, growEarly: 1, growLate: 1, decl: 1 },
  LATE: { key: 'LATE', label: 'Late Bloomer', w: 0.13, dGrow: 3, dPeak: 3, growEarly: 0.72, growLate: 1.35, decl: 1.0 },
  LONG: { key: 'LONG', label: 'Long Prime', w: 0.12, dGrow: 0, dPeak: 4, growEarly: 1, growLate: 1, decl: 0.65 },
  RAPID: { key: 'RAPID', label: 'Rapid Decline', w: 0.08, dGrow: -1, dPeak: -4, growEarly: 1, growLate: 1, decl: 1.6 },
};
export const CURVE_KEYS = Object.keys(CURVES);

// Effective age curve + multipliers for a player of `age` on curve `key` in `spec` (spec.ageCurve = growthEnd / peakEnd / decline).
export function curveMods(spec, key, age) {
  const c = CURVES[key] || CURVES.NORMAL, a = spec.ageCurve;
  const growthEnd = a.growthEnd + c.dGrow, peakEnd = Math.max(growthEnd + 1, a.peakEnd + c.dPeak);
  const grow = age <= a.growthEnd ? c.growEarly : c.growLate;
  return { ageCurve: { ...a, growthEnd, peakEnd }, grow, decl: c.decl };
}
// Deterministic curve pick (weights above) from a uniform number 0..1.
export function pickCurve(u) { let acc = 0; for (const k of CURVE_KEYS) { acc += CURVES[k].w; if (u < acc) return k; } return 'NORMAL'; }
