// Tactics = data in the save (c.x.tac) + a validated setter + the config object handed to the engines.
// Sport rules (options, validation, fit, engine fields) live in spec.v3; this module is the generic layer.
import { teamOf } from './careerCore.js';
import { noteTacticsChanged, teamFamiliarityBonus } from './training.js';
import { staffFx } from './staff.js';
import { round1 } from './kit.js';

export function getTactics(spec, c, abbr = c.userTeam) {
  const x = c.x;
  if (abbr === c.userTeam && c.role === 'COACH') { x.tac ||= spec.v3.tacticsDefault(spec, c, abbr); return x.tac; }
  return spec.v3.tacticsDefault(spec, c, abbr); // AI / GM-role teams are managed automatically
}
export const canEditTactics = c => c.role === 'COACH';
// patch: partial tactics (see tacticsSchema in the sport rules). Invalid input is rejected without touching the save.
export function setTactics(spec, c, patch = {}) {
  if (!canEditTactics(c)) return { ok: false, text: 'Somente o técnico define as táticas.', errors: [] };
  const cur = getTactics(spec, c), r = spec.v3.validateTactics(spec, c, c.userTeam, cur, patch);
  if (!r.ok) return { ok: false, text: r.errors[0], errors: r.errors };
  const changed = JSON.stringify(r.tac) !== JSON.stringify(cur);
  c.x.tac = r.tac;
  if (changed) noteTacticsChanged(c, 1);
  syncLegacy(spec, c);
  applyDepthRoles(spec, c);
  return { ok: true, text: 'Táticas atualizadas.', tac: r.tac, changed };
}
export function autoTactics(spec, c) { if (!canEditTactics(c)) return null; c.x.tac = spec.v3.tacticsDefault(spec, c, c.userTeam); syncLegacy(spec, c); applyDepthRoles(spec, c); return c.x.tac; }
// Called every day for the user's team: replaces injured starters automatically and reports the swaps.
export function reconcileUser(spec, c) {
  if (!canEditTactics(c) || !c.x.tac) return [];
  const ch = spec.v3.reconcileTactics(spec, c, c.userTeam, c.x.tac);
  return ch;
}
function syncLegacy(spec, c) { if (spec.v3.legacyTactics) Object.assign(c.tactics, spec.v3.legacyTactics(c.x.tac)); }
// Starters named by the user keep the 'S' role through the old userRole mechanism (so assignRoles respects them).
function applyDepthRoles(spec, c) {
  const tac = c.x.tac, S = new Set();
  const add = id => id && S.add(id);
  if (tac.depth) for (const [g, ids] of Object.entries(tac.depth)) ids.slice(0, ({ QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, DB: 4, K: 1, P: 1 })[g] || 0).forEach(add);
  if (tac.lines) { tac.lines.F.flat().forEach(add); tac.lines.D.flat().forEach(add); add(tac.lines.G.starter); }
  if (tac.lineup) { tac.lineup.vsR.forEach(s => add(s.id)); tac.rotation.forEach(add); }
  for (const p of Object.values(c.players)) if (p.t === c.userTeam && S.has(p.id)) { p.userRole = 'S'; p.role = 'S'; } else if (p.t === c.userTeam && p.userRole === 'S' && p.st === 'ACT') { p.userRole = null; }
}
// Rating delta of the user's tactics (fit of the lineup + scheme synergy + coordinators + familiarity). AI teams: 0.
export function tacticsRatingBonus(spec, c, abbr) {
  if (abbr !== c.userTeam || c.role !== 'COACH' || !c.x?.tac) return 0;
  const fit = spec.v3.tacticalFit(spec, c, abbr, c.x.tac), fx = staffFx(spec, c, abbr);
  return round1((fit.delta + fit.synergy + (fx.offense + fx.defense) * 0.35 + teamFamiliarityBonus(c)) * 100) / 100;
}
export function tacticsReport(spec, c) {
  if (!c.x.tac) return null;
  const fit = spec.v3.tacticalFit(spec, c, c.userTeam, c.x.tac), fx = staffFx(spec, c, c.userTeam);
  return { fit: fit.score, lineupDelta: fit.delta, synergy: fit.synergy, coordinators: round1((fx.offense + fx.defense) * 0.35 * 100) / 100, familiarity: c.x.training.fam, bonus: tacticsRatingBonus(spec, c, c.userTeam) };
}
// The object the engines receive for a team (`bridge`/spec game config): user = their saved tactics, AI = auto.
export function engineConfig(spec, c, abbr) {
  const tac = abbr === c.userTeam && c.role === 'COACH' && c.x.tac ? c.x.tac : spec.v3.tacticsDefault(spec, c, abbr);
  const cfg = spec.v3.engineConfig(spec, c, abbr, tac);
  cfg.user = abbr === c.userTeam; cfg.version = 3; cfg.teamName = teamOf(c, abbr)?.name || abbr;
  return cfg;
}
export function weeklyGameplan(spec, c) {
  const next = c.userTeam && c.phase === 'REGULAR' ? c.schedule.find(g => g.s === c.slate && (g.h === c.userTeam || g.a === c.userTeam)) : null;
  if (!next) return null;
  const opp = next.h === c.userTeam ? next.a : next.h, gp = spec.v3.weeklyGameplan(spec, c, c.userTeam, opp);
  if (c.x.tac) { c.x.tac.gameplan ? Object.assign(c.x.tac.gameplan, { week: c.slate, opp }) : null; }
  return { ...gp, slate: c.slate, home: next.h === c.userTeam };
}
