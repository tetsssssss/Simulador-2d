// Draft picks as tradable assets. Ownership is stored as exceptions only: c.x.picks.trades = [{ y, r, o, t }]
// (year, round, original team, current owner). A pick without an entry belongs to its original team.
import { sortTeams } from './league.js';
import { clamp } from './kit.js';

export const pickKey = (y, r, o) => `${y}-${r}-${o}`;
// First draft that has not happened yet: this season's draft until it is done, then next year's.
export function nextDraftYear(c) { return c.phase === 'OFFSEASON' && (c.draft?.done || ['CAMP'].includes(c.off)) ? c.season + 1 : c.season; }
export function pickOwner(c, y, r, o) { const t = c.x.picks.trades.find(e => e.y === y && e.r === r && e.o === o); return t ? t.t : o; }
export function teamPicks(spec, c, abbr, { years = 3 } = {}) {
  const y0 = nextDraftYear(c), out = [];
  for (let y = y0; y < y0 + years; y++) for (let r = 1; r <= spec.draft.rounds; r++) for (const t of c.teams) if (pickOwner(c, y, r, t.abbr) === abbr) out.push({ y, r, o: t.abbr, t: abbr, key: pickKey(y, r, t.abbr) });
  return out.sort((a, b) => a.y - b.y || a.r - b.r);
}
export function findPick(c, key) { const [y, r, o] = key.split('-'); return { y: +y, r: +r, o }; }
// Projected overall slot of a pick (0 = first). Current year uses the standings, later years regress to the middle.
export function pickProjection(spec, c, pick) {
  const n = c.teams.length, y0 = nextDraftYear(c);
  const order = sortTeams(c.teams, c.standings, !!spec.usePoints).reverse().map(t => t.abbr);
  const played = Object.values(c.standings).reduce((a, s) => a + s.w + s.l + s.t + (s.otl || 0), 0) / n / Math.max(1, spec.calendar.games);
  const conf = pick.y === y0 ? clamp(played * 1.2, 0, 0.9) : 0.15; // how much the standings say about the slot
  const pos = order.indexOf(pick.o); const slot = (pos < 0 ? n / 2 : pos) * conf + (n / 2) * (1 - conf);
  return (pick.r - 1) * n + slot;
}
export function tradePick(c, pick, toTeam) {
  const trades = c.x.picks.trades, i = trades.findIndex(e => e.y === pick.y && e.r === pick.r && e.o === pick.o);
  if (toTeam === pick.o) { if (i >= 0) trades.splice(i, 1); return; }
  if (i >= 0) trades[i].t = toTeam; else trades.push({ y: pick.y, r: pick.r, o: pick.o, t: toTeam });
}
// Prunes ownership records of drafts that already happened.
export function prunePicks(c, uptoYear) { c.x.picks.trades = c.x.picks.trades.filter(e => e.y > uptoYear); }
// Draft order with traded picks applied.
export function applyPickOwners(c, picks, year) {
  for (const s of picks) { s.orig = s.team; s.team = pickOwner(c, year, s.round, s.team); }
  return picks;
}
export const pickLabel = (c, p) => `${p.y} · ${p.r}ª rodada (${p.o})${p.o !== p.t ? ` via ${p.o}` : ''}`;
