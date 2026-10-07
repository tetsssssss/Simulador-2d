// MLB data layer. Reuses the existing base (js/data.js → window.MLB_DATA: 30 teams, logos, 2026 stadiums,
// rivalries, World Series history, 40 fixed + 30 adaptive attribute names) and the MLB StatsAPI adapters /
// ratings from the Alpha 0.1 js/app.js — logic ported unchanged, so ratings are identical.
// (OVR positional split and context-driven adaptive attributes are scheduled for later sessions.)
export const D = window.MLB_DATA;
const API = 'https://statsapi.mlb.com/api/v1';
const cache = { rosters: {}, people: {}, drafts: {}, prospects: null };

export const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (s, a, b) => a + (hash(String(s)) % (b - a + 1));
export const teamBy = a => D.teams.find(t => t.abbr === a);
export const teamById = id => D.teams.find(t => t.id === Number(id));
export const photo = id => `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_90/v1/people/${id}/headshot/67/current`;
export const fallback = name => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="100%" height="100%" fill="#17364a"/><text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="48" font-family="Arial">${String(name || '?').split(' ').map(x => x[0]).join('').slice(0, 2)}</text></svg>`)}`;
export const pos = p => p?.position?.abbreviation || p?.primaryPosition?.abbreviation || '—';
export const avg = a => Math.round(a.reduce((s, x) => s + x.value, 0) / a.length);

export function fixedRatings(p) {
  const po = pos(p), id = p.person?.id || p.id || p.personId || hash(p.fullName || 'player');
  return D.fixedAttrs.map(n => {
    let v = rnd(`${id}|${n}`, 38, 92);
    const pitch = po === 'P' || po === 'TWP';
    if (pitch && ['Fastball Quality', 'Breaking Ball Quality', 'Offspeed Quality', 'Pitch Command', 'Pitch Control', 'Pitch Movement', 'Pitch Velocity', 'Pitch Stamina', 'Hold Runners', 'Pickoff', 'Pitching Clutch'].includes(n)) v += 7;
    if (!pitch && ['Contact vs R', 'Contact vs L', 'Power vs R', 'Power vs L', 'Plate Vision', 'Plate Discipline', 'Bat Speed', 'Timing'].includes(n)) v += 5;
    if (['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].includes(po) && ['Fielding', 'Range', 'Hands', 'Reaction', 'Arm Accuracy'].includes(n)) v += 4;
    if (po === 'C' && ['Catcher Blocking', 'Catcher Framing', 'Pitch Calling'].includes(n)) v += 12;
    if (['CF', 'SS', '2B'].includes(po) && ['Running Speed', 'Acceleration', 'Range'].includes(n)) v += 5;
    return { name: n, value: Math.max(0, Math.min(99, v)) };
  });
}
// Alpha behavior preserved: seeded by (player, day) — not yet driven by game context (PLACEHOLDER, see handoff).
export function adaptiveRatings(p, seed = 'day0') {
  const id = p.person?.id || p.id || p.personId || hash(p.fullName || 'player');
  return D.adaptiveAttrs.map(n => ({ name: n, value: rnd(`${id}|${seed}|${n}`, 25, 98) }));
}

async function fetchJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
export async function roster(team) {
  if (cache.rosters[team.id]) return cache.rosters[team.id];
  const j = await fetchJSON(`${API}/teams/${team.id}/roster?rosterType=active&season=2026&hydrate=person`);
  cache.rosters[team.id] = (j.roster || []).map(x => ({ ...x, teamAbbr: team.abbr, teamId: team.id })); return cache.rosters[team.id];
}
export async function person(id) {
  if (cache.people[id]) return cache.people[id];
  const j = await fetchJSON(`${API}/people/${id}`); cache.people[id] = j.people?.[0] || {}; return cache.people[id];
}
export async function draft(year) {
  if (cache.drafts[year]) return cache.drafts[year];
  const j = await fetchJSON(`${API}/draft/${year}`); const rounds = j.drafts?.rounds || [];
  cache.drafts[year] = rounds.flatMap(r => (r.picks || []).map(p => ({ ...p, round: r.round }))); return cache.drafts[year];
}
export async function prospects() {
  if (cache.prospects) return cache.prospects;
  let j; try { j = await fetchJSON(`${API}/draft/prospects?limit=250`); } catch { j = await fetchJSON(`${API}/draft/2026?limit=250`); }
  cache.prospects = j.prospects || j.drafts?.rounds?.flatMap(r => r.picks || []) || []; return cache.prospects;
}
export const cachedRosterCount = () => Object.keys(cache.rosters).length;
