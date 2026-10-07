// New career flow (data API): sport → role (COACH / GM / PLAYER) → team or created player → difficulty → start.
// The UI renders the steps from these functions and finally calls startCareer(draft).
import { createCareer } from './careerCore.js';
import { DIFFICULTY } from './kit.js';
import { getCreatePlayerOptions, validatePlayerInput } from './playerCareer.js';

export const SPEC_LOADERS = {
  nfl: () => import('../../nfl/src/career/nflSpec.js').then(m => m.NFL_SPEC),
  nhl: () => import('../../nhl/src/career/nhlSpec.js').then(m => m.NHL_SPEC),
  mlb: () => import('../../mlb/src/career/mlbSpec.js').then(m => m.MLB_SPEC),
};
export const loadSpec = sport => { const f = SPEC_LOADERS[sport]; if (!f) throw new Error(`Esporte desconhecido: ${sport}`); return f(); };
export const FLOW_STEPS = ['SPORT', 'ROLE', 'TEAM_OR_PLAYER', 'DIFFICULTY', 'START'];
export const getSports = () => [{ key: 'nfl', label: 'NFL', desc: 'Futebol americano · 17 jogos · teto salarial rígido' }, { key: 'nhl', label: 'NHL', desc: 'Hóquei · 82 jogos · teto rígido, ELC/RFA/UFA' }, { key: 'mlb', label: 'MLB', desc: 'Beisebol · 162 jogos · 26/40-man, ligas menores' }];
export const getRoles = () => [
  { key: 'COACH', label: 'Técnico', desc: 'Comissão técnica, treino, táticas, relação com diretoria e elenco; pode ser demitido e receber propostas.', needs: 'team' },
  { key: 'GM', label: 'Dirigente', desc: 'Orçamento, contratos, trocas, draft, scouting com fog of war, instalações e expectativas do dono.', needs: 'team' },
  { key: 'PLAYER', label: 'Jogador', desc: 'Crie seu atleta, escolha o caminho até a liga, evolua e negocie contratos.', needs: 'player' },
];
export const getDifficulties = () => Object.entries(DIFFICULTY).map(([k, d]) => ({ value: +k, key: d.key, label: d.label, boardPatience: d.boardPatience, injury: d.injury, scoutNoise: d.scoutNoise, startRep: d.repStart }));
export async function getTeams(sport) {
  const spec = await loadSpec(sport), L = await spec.loadLeague();
  const byTeam = {}; for (const p of L.players) (byTeam[p.t] ||= []).push(p);
  const rating = t => Math.round(spec.teamRating((byTeam[t] || []).filter(p => p.st === 'ACT')) * 10) / 10;
  const list = L.teams.map(t => ({ abbr: t.abbr, name: t.name, conf: t.conf, div: t.div, color: t.color, rating: rating(t.abbr) }));
  const sorted = [...list].sort((a, b) => b.rating - a.rating);
  return list.map(t => ({ ...t, rank: sorted.findIndex(x => x.abbr === t.abbr) + 1, outlook: sorted.findIndex(x => x.abbr === t.abbr) < list.length / 3 ? 'contender' : sorted.findIndex(x => x.abbr === t.abbr) >= (2 * list.length) / 3 ? 'rebuild' : 'middle' }));
}
export async function getPlayerOptions(sport) { return getCreatePlayerOptions(await loadSpec(sport)); }
// draft = { sport, role, team?, player?, difficulty (0..3), name?, seed?, settings? }
export async function validateFlow(draft = {}) {
  const errors = [];
  if (!getSports().some(s => s.key === draft.sport)) errors.push('Esporte inválido');
  if (!getRoles().some(r => r.key === draft.role)) errors.push('Função inválida');
  if (errors.length) return { ok: false, errors };
  const spec = await loadSpec(draft.sport);
  if (draft.role === 'PLAYER') { const v = validatePlayerInput(spec, draft.player || {}); if (!v.ok) errors.push(...v.errors); }
  else { const L = await spec.loadLeague(); if (!L.teams.some(t => t.abbr === draft.team)) errors.push('Escolha um time válido'); }
  if (draft.difficulty != null && !(draft.difficulty in DIFFICULTY)) errors.push('Dificuldade inválida');
  return { ok: !errors.length, errors };
}
// Creates the career (returns { career, spec }). Pass a store to save it right away.
export async function startCareer(draft, { store } = {}) {
  const v = await validateFlow(draft); if (!v.ok) throw new Error(v.errors[0]);
  const spec = await loadSpec(draft.sport);
  const career = await createCareer(spec, { role: draft.role, team: draft.team, name: draft.name, seed: draft.seed, player: draft.player, settings: { difficulty: draft.difficulty ?? 1, engineGames: draft.engineGames ?? false, controlUserGames: true, ...draft.settings } });
  if (store) store.save(career);
  return { career, spec };
}
