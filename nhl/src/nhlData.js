// NHL data layer. Reuses the existing base (js/data.js → window.NHL_DATA: 32 teams, logos, arenas, Stanley Cup
// history, rivalries, 35 skater + 35 goalie attributes) and the NHL Web API adapters/ratings from the Alpha 0.1
// js/app.js — logic ported unchanged so ratings stay identical.
export const D = window.NHL_DATA;
const API = 'https://api-web.nhle.com/v1';
const cache = { rosters: {}, prospects: {} };

export const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (seed, min, max) => min + (hash(seed) % (max - min + 1));
export const nameOf = o => (typeof o === 'string' ? o : (o?.default || o?.fr || ''));
export const teamBy = a => D.teams.find(t => t.abbr === a);
export const age = b => { if (!b) return null; const d = new Date(b + 'T00:00:00Z'), n = new Date(); let x = n.getUTCFullYear() - d.getUTCFullYear(); if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) x--; return x; };
export const overall = (p, attrs) => Math.round(attrs.reduce((a, b) => a + b.value, 0) / attrs.length);

export function makeAttrs(p) {
  const goalie = p.positionCode === 'G';
  const names = goalie ? D.attrsGoalie : D.attrsSkater;
  const pos = p.positionCode || 'C', a = age(p.birthDate) || 24;
  return names.map(n => {
    let v = rnd(`${p.id}-${n}`, 46, 91);
    if (!goalie) {
      if (['Velocidade', 'Aceleração', 'Agilidade'].includes(n) && a < 25) v += 3;
      if (['Defensive Awareness', 'Shot Block', 'Positioning', 'Gap Control'].includes(n) && pos === 'D') v += 7;
      if (n === 'Faceoffs' && pos === 'C') v += 8;
      if (['Wrist Power', 'Wrist Accuracy', 'Offensive Awareness'].includes(n) && (pos === 'L' || pos === 'R' || pos === 'C')) v += 3;
    } else {
      if (['Reflexos', 'Lateral Movement', 'Agility'].includes(n) && a < 27) v += 3;
      if (['Positioning', 'Composure', 'Consistency'].includes(n) && a > 29) v += 4;
    }
    return { name: n, value: Math.max(0, Math.min(99, v)) };
  });
}

export function logo(a) { return teamBy(a)?.logo || `https://assets.nhle.com/logos/nhl/svg/${a}_dark.svg`; }
export function placeholder(name) { return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="100%" height="100%" fill="#173148"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="52" font-family="Arial">${(name || '?').split(' ').map(x => x[0]).join('').slice(0, 2)}</text></svg>`)}`; }
export function playerName(p) { return `${nameOf(p.firstName)} ${nameOf(p.lastName)}`.trim(); }
export const POS_LABEL = { C: 'C', L: 'LW', R: 'RW', D: 'D', G: 'G' };

// Rosters: NHL Web API first (current roster + headshots); if it is unreachable (offline / browser CORS), the local
// snapshot (data/roster_snapshot.json, 2023-24, real NHL ids) is converted to the same API shape so every screen and
// the 2D engine keep working. `p.source` tells which one was used.
let snapshot = null;
export async function loadSnapshot() {
  if (!snapshot) snapshot = fetch(new URL('../data/roster_snapshot.json', import.meta.url)).then(r => { if (!r.ok) throw new Error(`snapshot HTTP ${r.status}`); return r.json(); });
  return snapshot;
}
export function fromSnapshot(sp) {
  const parts = sp.name.split(' ');
  return {
    id: sp.id, firstName: { default: parts[0] }, lastName: { default: parts.slice(1).join(' ') || parts[0] }, positionCode: sp.pos,
    sweaterNumber: sp.num, shootsCatches: sp.shoots || '', teamAbbr: sp.team, source: 'snapshot', photoSeason: '20232024', stats: sp,
  };
}
export async function getRoster(abbr) {
  if (cache.rosters[abbr]) return cache.rosters[abbr];
  try {
    let r = await fetch(`${API}/roster/${abbr}/current`);
    if (!r.ok) r = await fetch(`${API}/roster/${abbr}/20262027`);
    if (!r.ok) throw new Error(`Roster ${abbr}: HTTP ${r.status}`);
    const j = await r.json();
    const all = [...(j.forwards || []), ...(j.defensemen || []), ...(j.goalies || [])].map(p => ({ ...p, teamAbbr: abbr, source: 'api' }));
    if (!all.length) throw new Error(`Roster ${abbr}: vazio`);
    cache.rosters[abbr] = all; return all;
  } catch (e) {
    const snap = await loadSnapshot();
    const all = snap.players.filter(p => p.team === abbr).map(fromSnapshot);
    if (!all.length) throw e;
    cache.rosters[abbr] = all; return all;
  }
}
export const rosterSource = abbr => cache.rosters[abbr]?.[0]?.source || null;
export async function getProspects(abbr) {
  if (cache.prospects[abbr]) return cache.prospects[abbr];
  const r = await fetch(`${API}/prospects/${abbr}`); if (!r.ok) throw new Error(`Prospects ${abbr}: HTTP ${r.status}`);
  const j = await r.json();
  const arr = Array.isArray(j) ? j : (j.prospects || j.players || [...(j.forwards || []), ...(j.defensemen || []), ...(j.goalies || [])]);
  cache.prospects[abbr] = arr.map(p => ({ ...p, teamAbbr: abbr })); return cache.prospects[abbr];
}
export function cachedRosterCount() { return Object.keys(cache.rosters).length; }
