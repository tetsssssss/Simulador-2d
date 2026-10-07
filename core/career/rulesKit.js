// Helpers shared by the sport rule modules (nfl|nhl|mlb)Rules.js. Generic math over player lists; no sport numbers.
import { clamp } from './kit.js';

export const isHealthy = p => !!p && !p.inj && (p.st === 'ACT');
export const score = (p, trust = true) => p.ovr + (trust && p.rel ? (p.rel.tr - 50) / 25 : 0) - (p.inj ? 100 : 0);
export const ranked = (list, f = p => true) => list.filter(f).sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1));
export const mean = (a, f = x => x) => (a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0);
// Validates a list of player ids: all exist in `byId`, no duplicates. Returns { ids, errors }.
export function cleanIds(ids, byId, label, errors) {
  const seen = new Set(), out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (id == null) { out.push(null); continue; }
    if (!byId[id]) { errors.push(`${label}: jogador ${id} não pertence ao time`); continue; }
    if (seen.has(id)) { errors.push(`${label}: jogador repetido (${byId[id].n})`); continue; }
    seen.add(id); out.push(id);
  }
  return out;
}
export const pickOption = (v, options, def, label, errors) => { if (v == null) return def; if (options.includes(v)) return v; errors.push(`${label}: opção inválida "${v}" (use ${options.join(' | ')})`); return def; };
export const pickRange = (v, lo, hi, def, label, errors) => { if (v == null) return def; const n = +v; if (!Number.isFinite(n) || n < lo || n > hi) { errors.push(`${label}: valor fora de ${lo}..${hi}`); return def; } return n; };

// ---- created-player attributes ----
// set = { key: { label, w } } with weights summing to 1. ovr (amateur scale) = weighted mean - 6.
export const ovrFromAttrs = (attrs, set) => clamp(Math.round(Object.entries(set).reduce((s, [k, d]) => s + (attrs[k] ?? 50) * d.w, 0) - 6), 30, 99);
export const AMATEUR_ATTR = { min: 30, max: 90, perAttr: 50, talentBonus: { raro: 70, alto: 45, medio: 25 } };
export function attrBudget(set, talent = 'alto') { return Object.keys(set).length * AMATEUR_ATTR.perAttr + (AMATEUR_ATTR.talentBonus[talent] ?? 45); }
// Spreads a budget across attributes proportionally to weights (+ optional emphasis keys).
export function autoAttrs(set, budget, emphasis = []) {
  const keys = Object.keys(set), w = Object.fromEntries(keys.map(k => [k, set[k].w * (emphasis.includes(k) ? 1.35 : 1)])), tot = keys.reduce((s, k) => s + w[k], 0);
  const out = {}; let left = budget;
  for (const k of keys) { out[k] = clamp(Math.round(AMATEUR_ATTR.min + (budget - keys.length * AMATEUR_ATTR.min) * w[k] / tot), AMATEUR_ATTR.min, AMATEUR_ATTR.max); left -= out[k]; }
  for (let i = 0; left !== 0 && i < 200; i++) { const k = keys[i % keys.length]; const d = Math.sign(left); if (out[k] + d >= AMATEUR_ATTR.min && out[k] + d <= AMATEUR_ATTR.max) { out[k] += d; left -= d; } }
  return out;
}
// Moves attributes with ovr: delta ovr is spread by weight so attrs and ovr stay coherent.
export function shiftAttrs(attrs, set, delta) {
  if (!attrs || !delta) return;
  for (const [k, d] of Object.entries(set)) attrs[k] = clamp(Math.round((attrs[k] ?? 50) + delta * (0.6 + d.w * 4)), 25, 99);
}
