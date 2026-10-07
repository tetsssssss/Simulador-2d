// Helpers for sport career specs (generic math only; the quotas and numbers are passed by each sport).
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function poisson(rng, mean) { const L = Math.exp(-Math.max(0, mean)); let k = 0, p = 1; do { k++; p *= rng.next(); } while (p > L); return k - 1; }
// default accessor: numbers as-is, player objects by .ovr (nfl/src/career/nflSpec.js calls avg(topBy(...)) without an accessor → was NaN)
export const avg = (a, f = x => (x != null && typeof x === 'object' ? x.ovr : x)) => (a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0);
export function topBy(list, n, f = p => p.ovr) { return [...list].sort((a, b) => f(b) - f(a)).slice(0, n); }
// quotas: { group: [starters, rotation] } — e.g. NHL { F: [6, 6], D: [4, 2], G: [1, 1] }
export function assignByQuota(list, groupOf, quotas, { keepUser = false, trust = false } = {}) {
  const by = {};
  for (const p of list) (by[groupOf(p.pos)] ||= []).push(p);
  for (const [g, arr] of Object.entries(by)) {
    const [s, r] = quotas[g] || [0, 0];
    const score = p => p.ovr + (trust && p.rel ? (p.rel.tr - 50) / 25 : 0) - (p.inj ? 100 : 0) - (p.st === 'MIN' ? 200 : 0);
    const sorted = [...arr].sort((a, b) => score(b) - score(a));
    sorted.forEach((p, i) => { const auto = i < s ? 'S' : i < s + r ? 'R' : 'B'; p.role = keepUser && p.userRole && !p.inj ? p.userRole : auto; });
  }
}
export function expectedByQuota(p, list, groupOf, quotas) {
  const g = groupOf(p.pos), [s, r] = quotas[g] || [0, 0];
  const rank = list.filter(q => groupOf(q.pos) === g && q.ovr > p.ovr).length;
  return rank < s ? 'S' : rank < s + r ? 'R' : 'B';
}
export function needsByQuota(list, groupOf, minimums) {
  const n = {}; for (const p of list) if (p.st === 'ACT' || p.st === 'IR') n[groupOf(p.pos)] = (n[groupOf(p.pos)] || 0) + 1;
  return Object.fromEntries(Object.entries(minimums).map(([g, m]) => [g, (n[g] || 0) < m]));
}
// Deterministic estimated age when the data source has no birth date (labelled as estimated in the UI).
export function estimatedAge(seedNum, usage = 0.5) { const h = (seedNum * 2654435761) >>> 0; return 21 + (h % 11) + Math.round(usage * 3); }
export function rankLabel(rank, teams) { const r = Math.ceil(rank / teams); return rank <= 10 ? '1ª rodada (top 10)' : r === 1 ? '1ª rodada' : `${r}ª rodada`; }
