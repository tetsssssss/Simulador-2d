// Career 3.0 shared helpers (no sport rules, no imports from other career modules → safe to import from anywhere).
import { createRng, hashSeed } from '../rng/rng.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const round1 = v => Math.round(v * 10) / 10;
export const round2 = v => Math.round(v * 100) / 100;
export const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
export const uniq = a => [...new Set(a)];
// Seeded RNG for an action tag at the current calendar position (same save + same tag + same day → same numbers).
export const xr = (c, tag) => createRng(hashSeed(`${c.seed}|x|${tag}|${c.season}|${c.phase}|${c.slate}|${c.off || ''}|${c.x?.cal?.day ?? 0}|${c.x?.cal?.offDay ?? 0}`));
// Deterministic 0..1 from any string (stable per player / team / tag; never changes with the calendar).
export const hash01 = s => (hashSeed(String(s)) % 100000) / 100000;
// Calendar day (days since the season's first date) of a slate.
export const dayOfSlate = (spec, s) => Math.floor(s * spec.calendar.slateDays);
export function dateOfDay(spec, season, day) {
  const k = spec.calendar;
  return new Date(Date.UTC(season, k.startMonth - 1, k.startDay) + day * 864e5);
}
export const fmtDate = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
// pt-BR picks one of several template strings deterministically.
export const pickT = (list, key) => list[hashSeed(String(key)) % list.length];
export const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
export const ROLE_KEYS = ['COACH', 'GM', 'PLAYER'];

export const DIFFICULTY = {
  0: { key: 'ROOKIE', label: 'Fácil', boardPatience: 1.4, aiTradeMargin: 0.0, injury: 0.85, repStart: 45, cash: 1.25, scoutNoise: 0.7, offers: 1.25 },
  1: { key: 'PRO', label: 'Normal', boardPatience: 1.0, aiTradeMargin: 0.1, injury: 1.0, repStart: 35, cash: 1.0, scoutNoise: 1.0, offers: 1.0 },
  2: { key: 'ALLSTAR', label: 'Difícil', boardPatience: 0.8, aiTradeMargin: 0.2, injury: 1.1, repStart: 30, cash: 0.9, scoutNoise: 1.2, offers: 0.85 },
  3: { key: 'LEGEND', label: 'Lendário', boardPatience: 0.6, aiTradeMargin: 0.3, injury: 1.2, repStart: 25, cash: 0.8, scoutNoise: 1.4, offers: 0.7 },
};
export const difficultyOf = c => DIFFICULTY[clamp(Math.round(c.settings?.difficulty ?? 1), 0, 3)];
