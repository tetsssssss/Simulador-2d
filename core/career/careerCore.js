// CareerCore — orchestrates a career for any sport through its spec (sport rules live in nfl|nhl|mlb/src/career).
// Roles: COACH (técnico: lineups, tactics, relationships), GM (dirigente: contracts, cap/payroll, trades, draft, FA,
// waivers), PLAYER (jogador: created athlete, Road to Pro, training, contracts, relationships).
// Systems: CareerCalendar (phases, slates, dates), CareerNews, CareerGoals (board + personal), CareerHistory,
// CareerRelationships, CareerDevelopment, CareerInjuries, CareerContracts (+ trades, draft, free agency, waivers).
// Everything random is seeded from the career seed + a tag + the calendar position → reproducible and resumable.
import { createRng, hashSeed } from '../rng/rng.js';
import { CAREER_SAVE_VERSION } from './saveStore.js';
import { buildSchedule, emptyStandings, recordResult, quickResult, sortTeams, seedPlayoffs, nextPlayoffRound, applySeriesGame, roundOver, winPct } from './league.js';
import * as H from './hooks.js';
import * as TA from './tradeAI.js';
import * as CO from './coach.js';
import { applyPickOwners } from './picks.js';
import { applyPlayerProfile, intlSignMe } from './playerCareer.js';
import { ensureV3 } from './x.js';
import { difficultyOf } from './kit.js';
import { progressSeason, trainTick, rollInjuries, healTick, estimateContract, contractAsk, negotiate, payroll, capSpace, marketValue, evaluateTrade, tradeValue, newRelation, relationTick, talk, draftClass, retires, persona, round1 } from './people.js';

export const ROLES = { COACH: 'Técnico', GM: 'Dirigente', PLAYER: 'Jogador' };
export const OFF_STAGES = ['AWARDS', 'PROGRESSION', 'RESIGN', 'DRAFT', 'FREE_AGENCY', 'CAMP'];
export const OFF_LABEL = { AWARDS: 'Prêmios & avaliação', PROGRESSION: 'Evolução & aposentadorias', RESIGN: 'Renovações', DRAFT: 'Draft', FREE_AGENCY: 'Free agency', CAMP: 'Training camp' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rngFor = (c, tag) => createRng(hashSeed(`${c.seed}|${tag}|${c.season}|${c.phase}|${c.slate}|${c.off || ''}`));

// ---------- helpers ----------
// The spec is attached as a non-enumerable property: available at runtime, never written into the save.
export function attachSpec(c, spec) { Object.defineProperty(c, '_spec', { value: spec, enumerable: false, configurable: true, writable: true }); if (spec.v3 && c.schedule?.length && !c.x?.ready) H.onAttach(spec, c); return c; }
// transaction log entry with team / player references (used by the news engine and the transactions screen)
export function tx(c, kind, text, teams = [], players = [], extra = {}) { c.history.transactions.push({ s: c.season, kind, text, teams, players, d: c.x?.cal?.day, ...extra }); }
export const P = (c, id) => c.players[id];
export const teamPlayers = (c, abbr, { active = false } = {}) => Object.values(c.players).filter(p => p.t === abbr && (p.st === 'ACT' || (!active && (p.st === 'IR' || p.st === 'MIN'))) && (!active || !p.inj));
export const teamOf = (c, abbr) => c.teams.find(t => t.abbr === abbr);
export const myTeam = c => { if (c.role !== 'PLAYER') return c.userTeam; const t = c.players[c.me?.id]?.t; return t && !['AMATEUR', 'DRAFT', 'FA', 'RET'].includes(t) ? t : null; };
export function news(c, text, kind = 'info', extra = {}) { c.news.unshift({ s: c.season, ph: c.phase, sl: c.slate, d: dateLabel(c), text, kind, ...extra }); if (c.news.length > 160) c.news.length = 160; }
export function dateLabel(c, spec = c._spec) {
  if (!spec) return `${c.season}`;
  if (c.phase === 'REGULAR' || c.phase === 'PRESEASON') { const d = new Date(Date.UTC(c.season, spec.calendar.startMonth - 1, spec.calendar.startDay) + (c.slate * spec.calendar.slateDays) * 864e5); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  if (c.phase === 'PLAYOFFS') return `Playoffs ${c.season}${c.season !== c.seasonEnd ? '-' + String(c.seasonEnd).slice(2) : ''}`;
  return `Offseason ${c.season} · ${OFF_LABEL[c.off] || ''}`;
}
export function teamRating(spec, c, abbr) {
  const list = teamPlayers(c, abbr, { active: true });
  const base = spec.teamRating(list, c);
  const t = teamOf(c, abbr);
  const morale = abbr === myTeam(c) ? (list.reduce((a, p) => a + (p.rel?.mo ?? 60), 0) / Math.max(1, list.length) - 60) * 0.05 : 0;
  const tactic = abbr === c.userTeam && c.role !== 'PLAYER' && spec.tacticEffect ? spec.tacticEffect(c.tactics, list) : 0;
  return base + morale + tactic + (t?.boost || 0) + H.ratingBonus(spec, c, abbr);
}

// ---------- creation ----------
export async function createCareer(spec, { role, name, team, seed, player, settings = {} }) {
  seed = seed || `${spec.sport}-${Date.now().toString(36)}`;
  const league = await spec.loadLeague();
  const rng = createRng(hashSeed(`${seed}-create`));
  const c = {
    id: `${spec.sport}-${role.toLowerCase()}-${seed}`.toLowerCase().replace(/[^a-z0-9-]/g, ''), saveVersion: CAREER_SAVE_VERSION,
    sport: spec.sport, role, name: name || `${ROLES[role]} · ${team || player?.name || spec.label}`, seed, createdAt: new Date().toISOString(),
    season: spec.calendar.firstSeason, seasonEnd: spec.calendar.firstSeason + (spec.calendar.crossesYear ? 1 : 0), phase: 'PRESEASON', slate: 0, off: null,
    userTeam: role === 'PLAYER' ? null : team, teams: league.teams.map(t => ({ ...t })), players: {}, standings: emptyStandings(league.teams),
    schedule: [], slates: 0, playoffs: null, news: [], goals: [], board: { confidence: 60, patience: 2 },
    history: { seasons: [], transactions: [], awards: [], titles: 0 }, draft: null, me: null,
    tactics: Object.fromEntries((spec.tactics || []).map(t => [t.key, t.default])), training: { intensity: 1 },
    settings: { engineGames: true, autosave: true, difficulty: 1, injuryRate: 1, ...settings }, dataNote: league.note || '', fired: false,
  };
  for (const p of league.players) {
    const q = structuredClone(p); // the league source is memoized by the spec: never share nested objects between careers
    q.pers ||= persona(rng);
    if (!q.c) q.c = estimateContract(spec, q, rng);
    q.svc ??= spec.estimateService ? spec.estimateService(q) : Math.max(0, q.age - spec.draft.ageMax);
    c.players[q.id] = q;
  }
  spec.afterLoad?.(c, rng);
  for (const p of teamPlayers(c, myTeam(c) || '__')) p.rel = newRelation(rng);
  newSeason(spec, c, { first: true });
  if (spec.v3) ensureV3(spec, c);
  if (role === 'PLAYER') createMyPlayer(spec, c, player, rng);
  else { for (const p of teamPlayers(c, c.userTeam)) p.rel ||= newRelation(rng); news(c, `${ROLES[role]} do ${teamOf(c, team)?.name}: começa a carreira (temporada ${c.season}).`, 'big'); }
  if (spec.v3) H.onCreate(spec, c);
  return c;
}

function teamModes(spec, c) {
  const ranked = [...c.teams].sort((a, b) => teamRating(spec, c, b.abbr) - teamRating(spec, c, a.abbr));
  const n = ranked.length;
  ranked.forEach((t, i) => { t.mode = i < n / 3 ? 'contender' : i >= (2 * n) / 3 ? 'rebuild' : 'middle'; t.rank = i + 1; });
}

export function newSeason(spec, c, { first = false } = {}) {
  attachSpec(c, spec);
  if (!first) { c.season++; c.seasonEnd = c.season + (spec.calendar.crossesYear ? 1 : 0); }
  c.phase = 'PRESEASON'; c.slate = 0; c.off = null; c.playoffs = null;
  c.standings = emptyStandings(c.teams);
  const sch = buildSchedule(c.teams, { games: spec.calendar.games, seriesLength: spec.calendar.seriesLength || 1, seed: `${c.seed}-${c.season}` });
  c.schedule = sch.schedule; c.slates = sch.slates;
  for (const p of Object.values(c.players)) { if (p.ps && Object.keys(p.ps).length) { p.hist ||= []; p.hist.push({ s: c.season - 1, t: p.t, ...p.ps }); if (p.hist.length > (p.mine || p.t === c.userTeam ? 15 : 5)) p.hist.shift(); } delete p.ps; delete p.dv; if (p.mps) { p.hist ||= []; p.hist.push({ s: c.season - 1, t: `${p.t} (${p.lvl || 'minors'})`, ...p.mps }); delete p.mps; } }
  teamModes(spec, c);
  for (const t of c.teams) spec.assignRoles(teamPlayers(c, t.abbr), c, t.abbr);
  // draft class for next draft (scouted during the season)
  const size = spec.draft.rounds * c.teams.length + 12;
  for (const p of Object.values(c.players)) if (p.st === 'PROSPECT' && p.t === 'DRAFT' && !p.mine) delete c.players[p.id];
  for (const p of draftClass(spec, { year: c.season, seed: c.seed, size })) c.players[p.id] = p;
  setGoals(spec, c);
  H.onNewSeason(spec, c);
}

// ---------- goals / board ----------
export function setGoals(spec, c) {
  c.goals = [];
  if (c.role === 'PLAYER') {
    const me = c.players[c.me?.id]; if (!me) return;
    for (const g of spec.playerGoals(me, c)) c.goals.push({ ...g, status: 'open' });
    return;
  }
  const t = teamOf(c, c.userTeam), mode = t?.mode || 'middle';
  const goals = mode === 'contender' ? [{ key: 'playoffs', text: 'Classificar para os playoffs', w: 2 }, { key: 'round', target: 2, text: 'Chegar à semifinal de conferência / liga', w: 1.5 }, { key: 'winpct', target: 0.6, text: 'Aproveitamento ≥ 60%', w: 1 }]
    : mode === 'rebuild' ? [{ key: 'winpct', target: 0.38, text: 'Aproveitamento ≥ 38%', w: 1 }, { key: 'youth', target: 3, text: 'Desenvolver 3 jovens (≤ 24 anos) com +3 OVR', w: 1.5 }, { key: 'payroll', text: 'Folha dentro do orçamento', w: 1 }]
      : [{ key: 'playoffs', text: 'Disputar os playoffs', w: 1.5 }, { key: 'winpct', target: 0.5, text: 'Aproveitamento ≥ 50%', w: 1 }];
  if (c.role === 'COACH') goals.push({ key: 'morale', target: 55, text: 'Moral média do elenco ≥ 55', w: 1 });
  if (c.role === 'GM') goals.push({ key: 'payroll', text: 'Folha salarial dentro do teto/orçamento', w: 1 });
  c.goals = goals.map(g => ({ ...g, status: 'open', scope: 'season' }));
}
export function evaluateGoals(spec, c) {
  const st = c.standings[c.userTeam], made = c.playoffs?.seeds && Object.values(c.playoffs.seeds).some(s => s.includes(c.userTeam));
  const reached = c.playoffs ? Math.max(0, ...c.playoffs.rounds.map((r, i) => (r.series.some(s => (s.a === c.userTeam || s.b === c.userTeam) && !s.bye) ? i + 1 : 0))) : 0;
  let score = 0, wsum = 0;
  for (const g of c.goals) {
    let ok = false;
    if (g.key === 'playoffs') ok = !!made;
    else if (g.key === 'round') ok = reached >= g.target;
    else if (g.key === 'winpct') ok = winPct(st) >= g.target;
    else if (g.key === 'youth') ok = teamPlayers(c, c.userTeam).filter(p => p.age <= 24 && (p.dv || 0) >= 3).length >= g.target;
    else if (g.key === 'payroll') ok = !spec.cap || capSpace(spec, Object.values(c.players), c.userTeam) >= 0;
    else if (g.key === 'morale') ok = avgMorale(c, c.userTeam) >= g.target;
    else if (spec.evaluatePlayerGoal) ok = spec.evaluatePlayerGoal(g, c);
    g.status = ok ? 'done' : 'failed'; score += ok ? g.w : -g.w * 0.8; wsum += g.w;
  }
  return wsum ? score / wsum : 0;
}
export const avgMorale = (c, abbr) => { const l = teamPlayers(c, abbr).filter(p => p.rel); return l.length ? l.reduce((a, p) => a + p.rel.mo, 0) / l.length : 60; };

// ---------- the player (Road to Pro) ----------
function createMyPlayer(spec, c, input, rng) {
  const p = spec.createPlayer(input, rng);
  p.id = `${spec.sport}-me-${c.seed}`.toLowerCase(); p.mine = true; p.syn = true; p.pers = { ego: 50, loyal: 60, amb: 80, work: 80, ...p.pers };
  p.rel = { tr: 55, rs: 50, mo: 70, sat: 60 };
  c.players[p.id] = p;
  const stage = spec.roadToPro[0];
  c.me = { id: p.id, stage: stage.key, stageYear: 1, focus: 'balanced', log: [], stock: null, agent: 60 };
  if (spec.v3) applyPlayerProfile(spec, c, p, { pos: p.pos, ...input });
  news(c, `${p.n} (${p.pos}, ${p.age} anos) começa a Road to Pro: ${stage.label}.`, 'big');
  setGoals(spec, c);
}
export const meStage = (spec, c) => spec.roadToPro.find(s => s.key === c.me?.stage);
// Amateur / minor league season for my player (outside the pro league tables).
function amateurSeason(spec, c) {
  const me = c.players[c.me.id], st = meStage(spec, c), rng = rngFor(c, 'amateur');
  const line = spec.amateurSeason(me, st, rng, c.me.focus);
  me.hist ||= []; me.hist.push({ s: c.season, t: st.label, ...line });
  c.me.log.unshift(`${c.season}: ${st.label} — ${spec.formatLine(line)}`);
  c.me.stock = spec.draftStock(me, line, c);
  news(c, `${me.n} termina a temporada em ${st.label}: ${spec.formatLine(line)}. Projeção de draft: ${c.me.stock.label}.`, 'player');
}

// ---------- the regular season ----------
export async function playSlate(spec, c, { onProgress } = {}) {
  if (c.phase === 'PRESEASON') {
    H.onPreseasonEnd(spec, c);
    // roster limit: extra players of the user's team go to the minors (AHL / AAA / practice squad) automatically
    const mine0 = c.userTeam && teamPlayers(c, c.userTeam).filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr);
    if (mine0 && mine0.length > spec.roster.max) { const cut = mine0.slice(spec.roster.max); for (const p of cut) p.st = 'MIN'; news(c, `Elenco ajustado ao limite (${spec.roster.max}): ${cut.map(p => p.n).join(', ')} ${spec.minorsLabel || 'para as ligas menores'}.`, 'team'); spec.assignRoles(teamPlayers(c, c.userTeam), c, c.userTeam, { keepUser: true }); }
    c.phase = 'REGULAR'; news(c, `Começa a temporada regular ${c.season}${spec.calendar.crossesYear ? '-' + String(c.seasonEnd).slice(2) : ''}.`, 'big'); return []; }
  if (c.phase !== 'REGULAR') return [];
  H.syncToSlateDay(spec, c);
  const games = c.schedule.filter(g => g.s === c.slate);
  const rng = rngFor(c, 'slate');
  const mine = myTeam(c), results = [];
  for (const g of games) {
    const involve = g.h === mine || g.a === mine;
    const res = await playGame(spec, c, g.h, g.a, rng, { engine: involve && c.settings.engineGames, onProgress });
    g.r = [res.hs, res.as]; if (res.ot) g.ot = true; g.engine = !!res.engine;
    recordResult(c.standings, g);
    results.push({ g, res, mine: involve });
  }
  afterGames(spec, c, results, rng);
  H.onAfterGames(spec, c, results);
  c.slate++;
  if (c.slate >= c.slates) startPlayoffs(spec, c);
  return results;
}

// Key of the user's next game (regular season slate or playoff game) — ties a 2D match result to the right game.
export function gameKey(c) {
  if (c.phase === 'PLAYOFFS') { const r = c.playoffs.rounds[c.playoffs.round]; return `${c.season}|PO|${c.playoffs.round}|${r.series.reduce((a, s) => a + s.games.length, 0)}`; }
  return `${c.season}|${c.phase}|${c.slate}`;
}
// The user's next game (for "Jogar no 2D"): { h, a, key } or null.
export function nextUserGame(c) {
  const mine = myTeam(c); if (!mine) return null;
  if (c.phase === 'REGULAR') { const g = c.schedule.find(x => x.s === c.slate && (x.h === mine || x.a === mine)); return g ? { h: g.h, a: g.a, key: gameKey(c) } : null; }
  if (c.phase === 'PLAYOFFS') { const s = c.playoffs.rounds[c.playoffs.round].series.find(x => !x.winner && (x.a === mine || x.b === mine)); if (!s) return null; const aHome = [0, 1, 4, 6].includes(s.games.length) || s.bestOf === 1; return { h: aHome ? s.a : s.b, a: aHome ? s.b : s.a, key: gameKey(c) }; }
  return null;
}
async function playGame(spec, c, h, a, rng, { engine, onProgress } = {}) {
  let res = null;
  const ext = c.extResult;
  if (ext && ext.h === h && ext.a === a && ext.key === gameKey(c)) { res = { hs: ext.hs, as: ext.as, ot: !!ext.ot, lines: ext.lines || [], engine: true, from2d: true }; delete c.extResult; }
  if (!res && engine && spec.simulateGame) { try { res = await spec.simulateGame(c, h, a, `${c.seed}-${c.season}-${c.phase}-${c.slate}-${h}${a}`, { onProgress }); res.engine = true; } catch (e) { console.warn('engine sim failed, quick result', e); res = null; } }
  if (!res) {
    const r = quickResult(spec, teamRating(spec, c, h), teamRating(spec, c, a), rng);
    res = { ...r, box: null };
    if (spec.statLine) res.lines = [...teamPlayers(c, h, { active: true }), ...teamPlayers(c, a, { active: true })].map(p => [p.id, spec.statLine(p, rng, { teamScore: p.t === h ? r.hs : r.as, oppScore: p.t === h ? r.as : r.hs, c })]);
  }
  // season stats (engine box or stat lines)
  const lines = res.lines || (res.box ? spec.boxToLines(res.box, c) : []);
  for (const [id, line] of lines) { const p = c.players[id]; if (!p || !line || !Object.keys(line).length) continue; p.ps ||= {}; p.ps.gp = (p.ps.gp || 0) + 1; for (const k in line) p.ps[k] = (p.ps[k] || 0) + line[k]; }
  return res;
}

function afterGames(spec, c, results, rng) {
  const mine = myTeam(c);
  // injuries & healing
  const teamsPlayed = new Set(results.flatMap(r => [r.g.h, r.g.a]));
  const all = [...teamsPlayed].flatMap(t => teamPlayers(c, t));
  healTick(all.filter(p => p.inj));
  for (const p of all) if (p.st === 'IR' && !p.inj) p.st = 'ACT';
  const userSide = all.filter(p => p.t === mine), otherSide = all.filter(p => p.t !== mine);
  const newInj = [...rollInjuries(spec, otherSide, rng, c.settings), ...rollInjuries(spec, userSide, rng, { ...c.settings, injuryRate: (c.settings.injuryRate ?? 1) * H.injuryMultFor(spec, c, mine) * (c.x?.ready ? difficultyOf(c).injury : 1) })];
  for (const p of newInj) {
    if (p.inj.games >= spec.injuries.irGames) p.st = 'IR';
    H.onInjury(spec, c, p);
    if (p.t === mine || p.ovr >= spec.starOvr) news(c, `Lesão: ${p.n} (${p.t}, ${p.pos}) — ${p.inj.type}, ${p.inj.games} jogos.`, p.t === mine ? 'bad' : 'info');
  }
  // relationships, training, board
  const my = results.find(r => r.mine);
  if (my && mine) {
    const won = (my.g.h === mine ? my.g.r[0] > my.g.r[1] : my.g.r[1] > my.g.r[0]);
    const list = teamPlayers(c, mine);
    spec.assignRoles(list, c, mine, { keepUser: c.role === 'COACH' });
    for (const p of list) {
      if (p.promise) p.promise.until--;
      relationTick(p, { expected: spec.expectedRole(p, list), role: p.role || 'B', teamWon: won, promise: p.promise });
      trainTick(spec, p, rng, c.training.intensity);
    }
    if (c.role !== 'PLAYER') {
      const exp = { contender: 0.6, middle: 0.5, rebuild: 0.38 }[teamOf(c, mine)?.mode || 'middle'];
      c.board.confidence = clamp(c.board.confidence + (won ? 0.7 : -0.7) * (won ? 1 - exp : exp) * 2.2, 0, 100);
      const st = c.standings[mine], gp = st.w + st.l + st.t + (st.otl || 0);
      if (gp % 10 === 0) news(c, `${teamOf(c, mine)?.name}: ${st.w}-${st.l}${st.otl ? '-' + st.otl : st.t ? '-' + st.t : ''} após ${gp} jogos (${st.streak}).`, 'team');
    } else spec.playerTick?.(c, my, rng);
  }
  if (c.role === 'PLAYER' && c.me) {
    const me = c.players[c.me.id];
    if (me && me.st === 'MIN' && me.t !== 'FA' && spec.minorsLine) { const l = spec.minorsLine(me, rng); me.mps ||= {}; me.mps.gp = (me.mps.gp || 0) + 1; for (const k in l) me.mps[k] = (me.mps[k] || 0) + l[k]; }
    if (me && c.slate % 25 === 24) { spec.minorsPromotion?.(c, me); syncStage(spec, c); }
  }
  // AI front offices: occasional trades between AI teams
  if (!c.x?.ready && rng.next() < spec.aiTradeRate) aiTrade(spec, c, rng);
}

// ---------- playoffs ----------
function startPlayoffs(spec, c) {
  c.phase = 'PLAYOFFS';
  c.playoffs = seedPlayoffs(c.teams, c.standings, spec.playoffs, !!spec.usePoints);
  nextPlayoffRound(c.playoffs);
  const mine = myTeam(c), inn = Object.values(c.playoffs.seeds).some(s => s.includes(mine));
  news(c, `Fim da temporada regular. ${mine ? (inn ? `${mine} está nos playoffs!` : `${mine} fica fora dos playoffs.`) : ''}`, 'big');
}
export async function playPlayoffGameDay(spec, c, { onProgress } = {}) {
  if (c.phase !== 'PLAYOFFS') return [];
  const po = c.playoffs, rnd = po.rounds[po.round], rng = rngFor(c, `po-${po.round}-${rnd.series.reduce((a, s) => a + s.games.length, 0)}`), mine = myTeam(c);
  const out = [], hookRes = [];
  if (c.x?.ready && !c.x.cal.managed) H.tickPlayoffDay(spec, c);
  for (const s of rnd.series) {
    if (s.winner) continue;
    const n = s.games.length, aHome = [0, 1, 4, 6].includes(n) || s.bestOf === 1;
    const h = aHome ? s.a : s.b, a = aHome ? s.b : s.a;
    const res = await playGame(spec, c, h, a, rng, { engine: (h === mine || a === mine) && c.settings.engineGames, onProgress });
    let hs = res.hs, as = res.as; if (hs === as) { if (rng.next() < 0.5) hs++; else as++; }
    applySeriesGame(s, hs > as ? h : a, `${a} ${as} @ ${h} ${hs}`);
    out.push({ s, h, a, hs, as, mine: h === mine || a === mine });
    if (h === mine || a === mine) hookRes.push({ g: { h, a, r: [hs, as] }, res, mine: true });
    if (s.winner && (s.a === mine || s.b === mine)) news(c, s.winner === mine ? `${mine} vence a série contra ${s.winner === s.a ? s.b : s.a} (${Math.max(s.wa, s.wb)}-${Math.min(s.wa, s.wb)})!` : `${mine} é eliminado por ${s.winner}.`, s.winner === mine ? 'good' : 'bad');
  }
  H.onAfterGames(spec, c, hookRes);
  if (roundOver(po)) {
    if (po.round === po.format.bestOf.length - 1) {
      po.champion = rnd.series[0].winner;
      news(c, `🏆 ${teamOf(c, po.champion)?.name} é campeão ${c.season}!`, 'big');
      if (po.champion === mine) c.history.titles++;
      startOffseason(spec, c);
    } else nextPlayoffRound(po);
  }
  return out;
}

// ---------- offseason ----------
function startOffseason(spec, c) { c.phase = 'OFFSEASON'; c.off = 'AWARDS'; c.slate = 0; offseasonStage(spec, c); }
export function advanceOffseason(spec, c) {
  if (c.phase !== 'OFFSEASON') return;
  const i = OFF_STAGES.indexOf(c.off);
  if (c.off === 'DRAFT' && !c.draft?.done) runDraft(spec, c, { auto: true });
  if (i === OFF_STAGES.length - 1) { newSeason(spec, c); news(c, `Training camp encerrado. Nova temporada ${c.season}.`, 'big'); if (c.role === 'PLAYER') roadToProNewSeason(spec, c); return; }
  c.off = OFF_STAGES[i + 1];
  offseasonStage(spec, c);
}
function offseasonStage(spec, c) {
  const rng = rngFor(c, `off-${c.off}`), mine = myTeam(c);
  if (c.off === 'AWARDS') {
    const awards = spec.awards ? spec.awards(c) : [];
    c.history.awards.push(...awards.map(a => ({ s: c.season, ...a })));
    for (const a of awards) news(c, `${a.award}: ${a.name} (${a.team}).`, 'award');
    const st = c.standings[c.userTeam || mine] || null;
    if (c.role !== 'PLAYER' && st) {
      const score = evaluateGoals(spec, c);
      c.board.confidence = clamp(c.board.confidence + score * 25, 0, 100);
      const v3 = c.x?.ready ? H.afterGoalsEvaluated : null;
      const finish = sortTeams(c.teams, c.standings, !!spec.usePoints).findIndex(t => t.abbr === c.userTeam) + 1;
      c.history.seasons.push({ s: c.season, team: c.userTeam, w: st.w, l: st.l, t: st.t, otl: st.otl, finish, champion: c.playoffs?.champion, goals: c.goals.map(g => ({ text: g.text, status: g.status })), confidence: Math.round(c.board.confidence) });
      const r3 = v3 ? v3(spec, c, score) : null;
      if (r3 ? r3.fired : c.board.confidence < 18) { if (!r3) { c.fired = true; news(c, `A diretoria decidiu pela sua demissão (confiança ${Math.round(c.board.confidence)}).`, 'bad'); } }
      else news(c, `Avaliação da diretoria: confiança ${Math.round(c.board.confidence)}/100.`, score >= 0 ? 'good' : 'bad');
    }
    if (c.role === 'PLAYER' && meStage(spec, c)?.kind === 'amateur') amateurAdvance(spec, c);
    if (c.role === 'PLAYER') { evaluateGoals(spec, c); const me = c.players[c.me.id]; c.history.seasons.push({ s: c.season, team: me.t, stage: c.me.stage, ovr: me.ovr, line: me.ps && Object.keys(me.ps).length ? spec.formatLine(me.ps) : (me.hist?.at(-1) ? spec.formatLine(me.hist.at(-1)) : '') }); }
  }
  if (c.off === 'PROGRESSION') {
    const logs = [];
    for (const p of Object.values(c.players)) {
      if (p.st === 'RET') continue;
      p.age++;
      const pt = p.mine && !p.ps?.gp ? 0.85 : p.ps?.gp ? clamp(p.ps.gp / spec.calendar.games, 0, 1) * (p.role === 'S' ? 1 : p.role === 'R' ? 0.7 : 0.4) : (p.st === 'PROSPECT' ? 0.5 : 0.2);
      const focus = p.mine ? 1 : p.t === mine && c.training.intensity > 1 ? 0.5 : 0;
      const d = progressSeason(spec, p, rng, { pt, focus, mods: H.progressMods(spec, c, p) });
      H.afterProgress(spec, c, p, d, rng);
      if (p.t === mine && Math.abs(d) >= 3) logs.push(`${p.n} ${d > 0 ? '+' : ''}${d} (${p.ovr})`);
      if (!p.mine && p.st !== 'PROSPECT' && retires(spec, p, rng)) { p.st = 'RET'; p.t = 'RET'; if (p.ovr >= spec.starOvr) news(c, `${p.n} anuncia a aposentadoria aos ${p.age} anos.`, 'info'); }
    }
    for (const p of Object.values(c.players)) if (p.st === 'RET' && !p.mine) delete c.players[p.id];
    if (logs.length) news(c, `Evolução no elenco: ${logs.slice(0, 8).join(', ')}.`, 'team');
  }
  if (c.off === 'RESIGN') {
    for (const p of Object.values(c.players)) {
      if (!p.c || p.st === 'PROSPECT') continue;
      if (!H.skipContractTick(spec, p)) p.c.yrs--;
      p.svc = (p.svc || 0) + (c.x?.ready ? (p.t !== 'FA' && p.st !== 'MIN' ? H.serviceTick(spec, p) : 0) : (p.t !== 'FA' && p.st !== 'MIN' ? 1 : 0));
    }
    spec.contractYear?.(c, rng); // arbitration / RFA / options (sport rules)
    const expiring = Object.values(c.players).filter(p => p.c && p.c.yrs <= 0 && p.t !== 'FA');
    for (const p of expiring) {
      if (p.t === c.userTeam && c.role === 'GM') { p.expiring = true; continue; } // the user decides in this stage
      if (p.mine) { p.expiring = true; continue; }
      const keep = rng.next() < (p.ovr >= 75 ? 0.7 : p.ovr >= 65 ? 0.45 : 0.2) * (p.age > 33 ? 0.5 : 1);
      const ask0 = contractAsk(spec, p), room = spec.cap?.kind === 'hard' ? capSpace(spec, Object.values(c.players), p.t) + (p.c?.sal || 0) : Infinity;
      if (keep && ask0.sal <= room) { const ask = ask0; p.c = { sal: ask.sal, yrs: ask.yrs, kind: 'VET' }; }
      else toFreeAgency(c, p);
    }
    const mineExp = expiring.filter(p => p.expiring && (p.t === c.userTeam || p.mine));
    if (mineExp.length) news(c, `Contratos vencendo: ${mineExp.map(p => p.n).join(', ')}. Renove ou deixe sair antes da free agency.`, 'team');
  }
  if (c.off === 'DRAFT') { c.draft = buildDraftOrder(spec, c); if (c.role === 'PLAYER' && c.me.stock) placeMeInDraft(spec, c); }
  if (c.off === 'FREE_AGENCY') {
    for (const p of Object.values(c.players)) if (p.expiring) { p.expiring = false; if (p.c.yrs <= 0) toFreeAgency(c, p); }
    aiFreeAgency(spec, c, rng);
  }
  if (c.off === 'CAMP') {
    for (const t of c.teams) spec.assignRoles(teamPlayers(c, t.abbr), c, t.abbr);
    spec.cutDown?.(c, rng);
  }
  H.onOffseasonStage(spec, c);
}
function toFreeAgency(c, p) { const from = p.t; p.t = 'FA'; p.st = 'FA'; p.role = null; p.c = { sal: 0, yrs: 0, kind: 'FA' }; if (from !== 'FA') c.history.transactions.push({ s: c.season, kind: 'FA', text: `${p.n} (${from}) vai para a free agency`, teams: [from], players: [p.id] }); }

// ---------- draft ----------
export function buildDraftOrder(spec, c) {
  const order = sortTeams(c.teams, c.standings, !!spec.usePoints).reverse().map(t => t.abbr);
  if (c.playoffs?.champion) { const i = order.indexOf(c.playoffs.champion); order.splice(i, 1); order.push(c.playoffs.champion); }
  const picks = [];
  for (let r = 0; r < spec.draft.rounds; r++) order.forEach((t, i) => picks.push({ round: r + 1, pick: i + 1, overall: picks.length + 1, team: t, playerId: null }));
  if (c.x?.ready) applyPickOwners(c, picks, c.season);
  return { year: c.season, picks, cursor: 0, done: false };
}
export const draftPool = c => Object.values(c.players).filter(p => p.st === 'PROSPECT' && p.t === 'DRAFT');
function aiPickFor(spec, c, team) {
  const pool = draftPool(c), t = teamOf(c, team);
  const need = spec.teamNeeds ? spec.teamNeeds(teamPlayers(c, team)) : {};
  return pool.map(p => ({ p, v: p.pot * 0.65 + p.ovr * 0.35 + (need[spec.posGroup(p.pos)] ? 3 : 0) + (t?.mode === 'contender' ? (p.ovr - p.pot) * 0.1 : 0) + (p.mine ? (c.me?.stock?.bonus || 0) : 0) })).sort((a, b) => b.v - a.v)[0]?.p;
}
export function draftPick(spec, c, playerId) {
  const d = c.draft; if (!d || d.done) return null;
  const slot = d.picks[d.cursor], p = c.players[playerId];
  if (!p || p.st !== 'PROSPECT') return null;
  slot.playerId = p.id;
  const rookie = spec.draft.rookieContract(slot);
  Object.assign(p, { t: slot.team, st: spec.draft.initialStatus ? spec.draft.initialStatus(p, slot) : 'ACT', c: { ...rookie, rookie: true }, svc: 0, drafted: { year: d.year, round: slot.round, pick: slot.pick, overall: slot.overall, team: slot.team } });
  if (slot.team === myTeam(c) || p.mine) p.rel ||= { tr: 55, rs: 50, mo: 70, sat: 60 };
  c.history.transactions.push({ s: c.season, kind: 'DRAFT', text: `${slot.overall}º: ${slot.team} escolhe ${p.n} (${p.pos})`, teams: [slot.team], players: [p.id] });
  if (p.mine) { news(c, `DRAFT! ${p.n} é escolhido por ${teamOf(c, slot.team)?.name} — ${slot.round}ª rodada, ${slot.overall}º geral.`, 'big'); syncStage(spec, c); c.me.stageYear = 1; }
  else if (slot.round === 1 && slot.pick <= 3) news(c, `Draft: ${slot.team} escolhe ${p.n} (${p.pos}) com a ${slot.overall}ª escolha.`, 'info');
  d.cursor++;
  if (d.cursor >= d.picks.length) finishDraft(spec, c);
  return slot;
}
// Runs AI picks until the user's turn (or to the end with auto).
export function runDraft(spec, c, { auto = false } = {}) {
  const d = c.draft; if (!d || d.done) return;
  while (!d.done) {
    const slot = d.picks[d.cursor];
    if (!auto && slot.team === c.userTeam && c.role === 'GM') return slot;
    const p = aiPickFor(spec, c, slot.team);
    if (!p) { finishDraft(spec, c); break; }
    draftPick(spec, c, p.id);
  }
  return null;
}
function finishDraft(spec, c) {
  const d = c.draft; d.done = true;
  for (const p of draftPool(c)) {
    if (p.mine) { p.t = 'FA'; p.st = 'FA'; p.c = { sal: spec.salary.min, yrs: 0, kind: 'UDFA' }; news(c, `${p.n} não foi draftado e entra como agente livre.`, 'bad'); syncStage(spec, c); continue; }
    if (p.pot >= spec.draft.undraftedKeep) { p.t = 'FA'; p.st = 'FA'; p.c = { sal: 0, yrs: 0, kind: 'FA' }; } else delete c.players[p.id];
  }
}
function placeMeInDraft(spec, c) {
  const me = c.players[c.me.id];
  if (!c.me.declared) return;
  me.t = 'DRAFT'; me.st = 'PROSPECT';
}

// ---------- free agency / waivers ----------
export const freeAgents = c => Object.values(c.players).filter(p => p.t === 'FA' && p.st === 'FA');
function aiFreeAgency(spec, c, rng) {
  const fas = freeAgents(c).filter(p => !p.mine).sort((a, b) => b.ovr - a.ovr);
  for (const t of c.teams) {
    if (t.abbr === c.userTeam && c.role === 'GM') continue;
    const roster = teamPlayers(c, t.abbr), need = spec.teamNeeds ? spec.teamNeeds(roster) : {};
    let slots = spec.roster.max - roster.filter(p => p.st !== 'MIN').length;
    for (const p of fas) {
      if (slots <= 0) break;
      if (p.t !== 'FA') continue;
      if (!need[spec.posGroup(p.pos)] && rng.next() > 0.25) continue;
      const ask = contractAsk(spec, p, { freeAgent: true });
      if (spec.cap && spec.cap.kind === 'hard' && capSpace(spec, Object.values(c.players), t.abbr) < ask.sal) continue;
      p.t = t.abbr; p.st = 'ACT'; p.c = { sal: ask.sal, yrs: ask.yrs, kind: 'VET' }; slots--;
      if (p.ovr >= spec.starOvr) news(c, `Free agency: ${p.n} assina com ${t.abbr} (${ask.sal}M × ${ask.yrs}).`, 'info');
      c.history.transactions.push({ s: c.season, kind: 'SIGN', text: `${t.abbr} contrata ${p.n} (${ask.sal}M × ${ask.yrs})`, teams: [t.abbr], players: [p.id] });
    }
  }
}
export function signFreeAgent(spec, c, id, offer) {
  const p = c.players[id]; if (!p || p.t !== 'FA') return { ok: false, text: 'Jogador indisponível.' };
  const roster = teamPlayers(c, c.userTeam);
  if (roster.filter(q => q.st !== 'MIN').length >= spec.roster.max) return { ok: false, text: `Elenco cheio (${spec.roster.max}). Dispense alguém antes.` };
  if (spec.cap?.kind === 'hard' && capSpace(spec, Object.values(c.players), c.userTeam) < offer.sal) return { ok: false, text: `Sem espaço no teto (${capSpace(spec, Object.values(c.players), c.userTeam)}M).` };
  const r = negotiate(spec, p, offer, contractAsk(spec, p, { freeAgent: true }));
  if (!r.ok) return r;
  p.t = c.userTeam; p.st = 'ACT'; p.c = { sal: offer.sal, yrs: offer.yrs, kind: 'VET' }; p.rel = newRelation(rngFor(c, `fa-${id}`));
  c.history.transactions.push({ s: c.season, kind: 'SIGN', text: `${c.userTeam} contrata ${p.n} (${offer.sal}M × ${offer.yrs})`, teams: [c.userTeam], players: [p.id] });
  news(c, `${teamOf(c, c.userTeam)?.name} contrata ${p.n} (${p.pos}, ${p.ovr}) — ${offer.sal}M × ${offer.yrs} anos.`, 'good');
  return { ok: true, text: r.text };
}
export function releasePlayer(spec, c, id) {
  const p = c.players[id]; if (!p || p.t !== c.userTeam) return { ok: false, text: '' };
  const dead = spec.releaseCost ? spec.releaseCost(p) : round1((p.c?.sal || 0) * Math.max(0, (p.c?.yrs || 0)) * 0.5);
  c.history.transactions.push({ s: c.season, kind: 'RELEASE', text: `${c.userTeam} dispensa ${p.n}${dead ? ` (custo ${dead}M)` : ''}`, teams: [c.userTeam], players: [p.id] });
  toFreeAgency(c, p); p.waivers = spec.waivers ? 1 : 0;
  news(c, `${p.n} foi dispensado${spec.waivers ? ' (waivers)' : ''}.`, 'team');
  if (spec.waivers) waiverClaim(spec, c, p);
  return { ok: true, text: `${p.n} dispensado.` };
}
function waiverClaim(spec, c, p) {
  const rng = rngFor(c, `waiver-${p.id}`);
  if (p.ovr < spec.starOvr - 12 || rng.next() > 0.5) return;
  const order = sortTeams(c.teams, c.standings, !!spec.usePoints).reverse().map(t => t.abbr).filter(a => a !== c.userTeam);
  const claimer = order.find(a => !spec.cap || spec.cap.kind !== 'hard' || capSpace(spec, Object.values(c.players), a) >= (p.c?.sal || 1));
  if (!claimer) return;
  p.t = claimer; p.st = 'ACT'; p.c = { sal: marketValue(spec, p), yrs: 1, kind: 'WAIVER' };
  news(c, `Waivers: ${claimer} reivindica ${p.n}.`, 'info');
}
export function extendContract(spec, c, id, offer) {
  const p = c.players[id]; if (!p) return { ok: false, text: '' };
  if (p.noReSign) return { ok: false, text: `${p.n} se recusa a renegociar (confiança baixa). Resolva o evento ou convença-o com um bônus.` };
  if (spec.cap?.kind === 'hard' && p.t === c.userTeam) { const sp = capSpace(spec, Object.values(c.players), c.userTeam) + (p.expiring ? 0 : p.c?.sal || 0); if (offer.sal > sp) return { ok: false, text: `Sem espaço no teto (${round1(sp)}M).` }; }
  const base = contractAsk(spec, p), r = negotiate(spec, p, offer, p.askBonus ? { ...base, sal: round1(base.sal * p.askBonus) } : base);
  if (r.ok) { p.c = { sal: offer.sal, yrs: offer.yrs + (p.expiring ? 0 : Math.max(0, p.c.yrs)), kind: 'VET' }; p.expiring = false; c.history.transactions.push({ s: c.season, kind: 'EXTEND', text: `${p.t} renova com ${p.n} (${offer.sal}M × ${offer.yrs})`, teams: [p.t], players: [p.id] }); news(c, `${p.n} renova: ${offer.sal}M × ${offer.yrs} anos.`, 'good'); if (p.rel) p.rel.tr = clamp(p.rel.tr + 5, 0, 100); }
  return r;
}

// ---------- trades ----------
export function teamInfo(spec, c, abbr) { const t = teamOf(c, abbr); return { mode: t?.mode, need: spec.teamNeeds ? spec.teamNeeds(teamPlayers(c, abbr)) : {} }; }
export function proposeTrade(spec, c, { give, get, aiTeam, givePicks = [], getPicks = [] }) {
  if (c.x?.ready) { // career 3.0: trade AI (value, need, window, picks, cap)
    const r = TA.propose(spec, c, { from: c.userTeam, to: aiTeam, give: { players: give, picks: givePicks }, get: { players: get, picks: getPicks } });
    return { ...r, ok: r.ok, recv: r.valueIn, send: r.valueOut, text: r.ok ? `${aiTeam} aceita a troca.` : r.text };
  }
  const G = give.map(id => c.players[id]).filter(Boolean), R = get.map(id => c.players[id]).filter(Boolean);
  const ctx = { c, teamInfo: a => teamInfo(spec, c, a), players: Object.values(c.players) };
  const r = evaluateTrade(spec, ctx, { give: G, get: R, aiTeam, difficulty: c.settings.difficulty });
  if (r.ok) {
    for (const p of G) { p.t = aiTeam; p.rel = null; p.role = null; }
    for (const p of R) { p.t = c.userTeam; p.rel = newRelation(rngFor(c, `tr-${p.id}`)); }
    const text = `Troca: ${c.userTeam} envia ${G.map(p => p.n).join(', ')} para ${aiTeam} por ${R.map(p => p.n).join(', ')}`;
    c.history.transactions.push({ s: c.season, kind: 'TRADE', text }); news(c, text + '.', 'big');
    for (const t of [c.userTeam, aiTeam]) spec.assignRoles(teamPlayers(c, t), c, t);
  }
  return r;
}
function aiTrade(spec, c, rng) {
  const ai = c.teams.filter(t => t.abbr !== c.userTeam);
  const A = rng.pick(ai), B = rng.pick(ai.filter(t => t !== A && t.mode !== A.mode));
  if (!A || !B) return;
  const pa = teamPlayers(c, A.abbr).filter(p => !p.inj && !p.mine).sort((x, y) => tradeValue(spec, y, B) - tradeValue(spec, x, B))[rng.int(2, 8)];
  const pb = pa && teamPlayers(c, B.abbr).filter(p => !p.inj && !p.mine && spec.posGroup(p.pos) === spec.posGroup(pa.pos)).sort((x, y) => Math.abs(tradeValue(spec, x, A) - tradeValue(spec, pa, B)) - Math.abs(tradeValue(spec, y, A) - tradeValue(spec, pa, B)))[0];
  if (!pa || !pb) return;
  const va = tradeValue(spec, pa, B), vb = tradeValue(spec, pb, A);
  if (Math.abs(va - vb) > Math.max(4, va * 0.15)) return;
  pa.t = B.abbr; pb.t = A.abbr;
  const text = `Troca entre ${A.abbr} e ${B.abbr}: ${pa.n} ↔ ${pb.n}`;
  c.history.transactions.push({ s: c.season, kind: 'TRADE', text, teams: [A.abbr, B.abbr], players: [pa.id, pb.id], ai: true });
  if (pa.ovr >= spec.starOvr - 4 || pb.ovr >= spec.starOvr - 4) news(c, text + '.', 'info');
}

// ---------- coach & player actions ----------
export function setRole(spec, c, id, role) { const p = c.players[id]; if (!p || p.t !== c.userTeam) return; p.role = role; p.userRole = role; }
export function talkTo(c, id, kind) { const p = c.players[id]; if (!p) return { text: '' }; return talk(p, kind, rngFor(c, `talk-${id}-${kind}-${(p.talks = (p.talks || 0) + 1)}`), c.board.confidence); }

// Pro / minors stage follows the real status (ACT = big league, MIN = minors; MLB keeps its level A/AA/AAA).
export function syncStage(spec, c) {
  const me = c.players[c.me?.id]; if (!me || (meStage(spec, c)?.kind === 'amateur' && (me.t === 'AMATEUR' || me.t === 'DRAFT'))) return;
  const pro = spec.roadToPro.find(s => s.kind === 'pro'), minors = spec.roadToPro.filter(s => s.kind === 'minors');
  if (me.st === 'ACT' || me.st === 'IR') c.me.stage = pro.key;
  else if (me.st === 'MIN' || me.st === 'FA') c.me.stage = (minors.find(s => s.key === me.lvl) || minors[0] || pro).key;
}
function roadToProNewSeason(spec, c) {
  syncStage(spec, c);
  const me = c.players[c.me.id], st = meStage(spec, c);
  if (!st) return;
  if (st.kind === 'amateur') {
    if (c.me.stageYear >= st.years || (c.me.declared && c.me.stock)) return; // waits for the draft
    c.me.stageYear++;
  } else if (st.kind === 'minors') spec.minorsPromotion?.(c, me);
  setGoals(spec, c);
}
// Called by the UI each "advance" while the player is still amateur (no pro team yet).
export function amateurAdvance(spec, c) {
  const st = meStage(spec, c);
  amateurSeason(spec, c);
  const me = c.players[c.me.id];
  const eligible = me.age >= spec.draft.ageMin;
  if (c.me.path === 'INTERNATIONAL' && spec.sport === 'mlb' && me.age >= 16 && (c.me.stageYear >= 1)) { intlSignMe(spec, c); return; }
  if (eligible && (st.autoDeclare || c.me.stageYear >= st.years || c.me.declare)) { c.me.declared = true; me.t = 'DRAFT'; me.st = 'PROSPECT'; news(c, `${me.n} se declara para o draft ${c.season}.`, 'big'); }
}
export { contractAsk, negotiate, payroll, capSpace, marketValue, tradeValue };

// ---------- player career actions ----------
export function requestPlayingTime(spec, c) {
  const me = c.players[c.me.id], rng = rngFor(c, `pt-${(c.me.asks = (c.me.asks || 0) + 1)}`);
  if (!me.rel) return { text: '' };
  const list = teamPlayers(c, me.t), exp = spec.expectedRole(me, list);
  if (me.role === 'S') return { text: 'Você já é titular.' };
  const chance = (me.rel.tr - 30) / 100 + (exp === 'S' ? 0.3 : exp === 'R' ? 0.1 : -0.2);
  if (rng.next() < chance) { me.userRole = me.role === 'B' ? 'R' : 'S'; me.role = me.userRole; me.rel.tr = clamp(me.rel.tr - 3, 0, 100); news(c, `O técnico atende ${me.n}: mais tempo de jogo (${me.role === 'S' ? 'titular' : 'rotação'}).`, 'good'); return { ok: true, text: 'O técnico vai te dar mais espaço.' }; }
  me.rel.tr = clamp(me.rel.tr - 6, 0, 100); me.rel.sat = clamp(me.rel.sat - 4, 0, 100);
  return { ok: false, text: 'O técnico não gostou do pedido. Mostre serviço nos treinos.' };
}
export function requestTrade(spec, c) {
  const me = c.players[c.me.id], rng = rngFor(c, `rt-${(c.me.trq = (c.me.trq || 0) + 1)}`);
  if (!me || me.t === 'FA' || me.t === 'AMATEUR' || me.t === 'DRAFT') return { text: 'Você não está em um time.' };
  const willing = (100 - me.rel.tr) / 100 * 0.6 + (me.role === 'B' ? 0.3 : 0);
  if (rng.next() > willing) { me.rel.tr = clamp(me.rel.tr - 8, 0, 100); return { ok: false, text: 'A diretoria recusou o pedido de troca.' }; }
  const dest = rng.pick(c.teams.filter(t => t.abbr !== me.t && spec.teamNeeds(teamPlayers(c, t.abbr))[spec.posGroup(me.pos)]) || c.teams.filter(t => t.abbr !== me.t));
  const from = me.t; me.t = dest.abbr; me.rel = { tr: 55, rs: 50, mo: 65, sat: 55 }; me.userRole = null;
  spec.assignRoles(teamPlayers(c, dest.abbr), c, dest.abbr);
  c.history.transactions.push({ s: c.season, kind: 'TRADE', text: `${me.n} é trocado de ${from} para ${dest.abbr}`, teams: [from, dest.abbr], players: [me.id] });
  news(c, `${me.n} é trocado para o ${dest.name}.`, 'big');
  return { ok: true, text: `Troca concluída: ${dest.name}.` };
}
// Contract offers for my player (expiring or free agent): own team + 2-3 interested teams.
export function playerOffers(spec, c) {
  const me = c.players[c.me.id]; if (!me) return [];
  const rng = rngFor(c, `offers-${c.season}`), ask = contractAsk(spec, me, { freeAgent: me.t === 'FA' });
  const teams = c.teams.filter(t => spec.teamNeeds(teamPlayers(c, t.abbr))[spec.posGroup(me.pos)] || t.abbr === me.t).slice(0);
  for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [teams[i], teams[j]] = [teams[j], teams[i]]; }
  const pick = [...new Set([me.t !== 'FA' ? teamOf(c, me.t) : null, ...teams].filter(Boolean))].slice(0, 4);
  return pick.map(t => ({ team: t.abbr, name: t.name, sal: round1(ask.sal * (0.85 + rng.next() * 0.3) * (t.mode === 'contender' ? 0.95 : 1.05)), yrs: Math.max(1, ask.yrs + rng.int(-1, 1)), role: spec.expectedRole(me, [...teamPlayers(c, t.abbr), me]), mode: t.mode }));
}
export function acceptOffer(spec, c, offer) {
  const me = c.players[c.me.id]; if (!me) return;
  const moved = me.t !== offer.team;
  me.t = offer.team; me.st = 'ACT'; me.c = { sal: offer.sal, yrs: offer.yrs, kind: 'VET' }; me.expiring = false;
  if (moved) me.rel = { tr: 55, rs: 50, mo: 70, sat: 60 };
  spec.assignRoles(teamPlayers(c, me.t), c, me.t); syncStage(spec, c);
  c.history.transactions.push({ s: c.season, kind: 'SIGN', text: `${me.n} assina com ${offer.team} (${offer.sal}M × ${offer.yrs})`, teams: [offer.team], players: [me.id] });
  news(c, `${me.n} assina com o ${offer.name}: ${offer.sal}M × ${offer.yrs} anos.`, 'big');
}
export function declareForDraft(spec, c) { const me = c.players[c.me.id]; if (me.age < spec.draft.ageMin) return { ok: false, text: `Idade mínima para o draft: ${spec.draft.ageMin}.` }; c.me.declare = true; return { ok: true, text: 'Você vai se declarar para o draft ao fim da temporada.' }; }
// Fired coach / GM: job offers from struggling teams.
export function jobOffers(spec, c) {
  if (c.x?.ready) { if (!c.x.market.offers.length) CO.refreshOffers(spec, c); return c.x.market.offers.map(o => ({ abbr: o.team, name: o.name, ...o })); }
  return legacyJobOffers(spec, c);
}
function legacyJobOffers(spec, c) { return sortTeams(c.teams, c.standings, !!spec.usePoints).reverse().filter(t => t.abbr !== c.userTeam).slice(0, 4).map(t => ({ abbr: t.abbr, name: t.name })); }
export function takeJob(spec, c, abbr) {
  if (c.x?.ready) return CO.takeJob(spec, c, abbr, c.x.market.offers.find(o => o.team === abbr) || {});
  const old = c.userTeam; c.userTeam = abbr; c.fired = false; c.board = { confidence: 55, patience: 2 };
  for (const p of teamPlayers(c, old)) { p.rel = null; p.userRole = null; }
  const rng = rngFor(c, `job-${abbr}`); for (const p of teamPlayers(c, abbr)) p.rel ||= newRelation(rng);
  setGoals(spec, c); news(c, `Novo emprego: ${ROLES[c.role]} do ${teamOf(c, abbr)?.name}.`, 'big');
}
