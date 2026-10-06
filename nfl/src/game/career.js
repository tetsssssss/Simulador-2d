// Career (GM / Head Coach) model: schedule, standings, news, injuries, trades. Seeded RNG (no Math.random).
// The user's games are played or simulated with the real engine (match.js); other league games use a light
// strength-based result so standings exist (documented as such in CLAUDE_HANDOFF).
import { createRng, hashSeed } from '../core/rng.js';
import { buildLineups } from '../nflEngine.js';
import { makeRatings, overall } from '../ratings.js';

export const SEASON_WEEKS = 17;

export function createCareer({ team = 'SEA', name = '', teams = [], seed } = {}) {
  const c = {
    name: name || `Carreira ${team}`, team, season: 2026, week: 1, wins: 0, losses: 0, ties: 0,
    injuries: [], trades: [], news: [], schedule: [], standings: {}, seed: seed || `C${Date.now().toString(36).toUpperCase()}`,
  };
  if (teams.length) ensureSchedule(c, teams);
  c.news.unshift({ week: 1, text: `${team}: nova carreira iniciada na temporada ${c.season}.` });
  return c;
}

// Accepts legacy careers ({team, week, wins, losses, injuries, trades}) and fills what is missing.
export function normalizeCareer(raw = {}, teams = []) {
  const c = { ...createCareer({ team: raw.team || 'SEA', teams: [] }), ...raw };
  c.injuries = Array.isArray(c.injuries) ? c.injuries : [];
  c.trades = Array.isArray(c.trades) ? c.trades : [];
  c.news = Array.isArray(c.news) ? c.news : [];
  c.standings = c.standings && typeof c.standings === 'object' ? c.standings : {};
  for (const k of ['week', 'wins', 'losses', 'ties', 'season']) c[k] = Number(c[k]) || (k === 'week' ? 1 : k === 'season' ? 2026 : 0);
  if (teams.length) ensureSchedule(c, teams);
  return c;
}

// 17 games: 6 division games (home & away) + 11 other opponents, seeded by the career seed.
export function ensureSchedule(c, teams) {
  if (!Array.isArray(c.schedule) || c.schedule.length !== SEASON_WEEKS) {
    const me = teams.find(t => t.abbr === c.team) || teams[0];
    const rng = createRng(hashSeed(`${c.seed}-sched-${c.team}-${c.season}`));
    const div = teams.filter(t => t !== me && t.conference === me.conference && t.division === me.division).map(t => t.abbr);
    const others = teams.filter(t => t !== me && !div.includes(t.abbr)).map(t => t.abbr);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const opps = [...div, ...div, ...others.slice(0, SEASON_WEEKS - div.length * 2)];
    for (let i = opps.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [opps[i], opps[j]] = [opps[j], opps[i]]; }
    const seen = {};
    c.schedule = opps.map((opp, i) => { seen[opp] = (seen[opp] || 0) + 1; return { week: i + 1, opp, home: div.includes(opp) ? seen[opp] === 1 : rng.chance(0.5), result: null }; });
    // Legacy migration: weeks already played before schedules existed are marked as such.
    for (const g of c.schedule) if (g.week < c.week) g.result = { legacy: true };
  }
  for (const t of teams) c.standings[t.abbr] ||= { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  const me = c.standings[c.team];
  if (me && me.w + me.l + me.t < c.wins + c.losses + c.ties) { me.w = c.wins; me.l = c.losses; me.t = c.ties; }
  return c;
}

export function nextGame(c) { return c.schedule.find(g => !g.result) || null; }
export function lastGame(c) { return [...c.schedule].reverse().find(g => g.result && !g.result.legacy) || null; }

// Team strength = mean OVR of the 22 engine starters (cached per roster size).
const strengthCache = new Map();
export function teamStrength(roster, abbr) {
  const key = `${abbr}|${roster.length}`;
  if (!strengthCache.has(key)) {
    const ls = buildLineups(roster, abbr, abbr);
    const all = [...ls.offense, ...ls.defense];
    strengthCache.set(key, all.length ? all.reduce((s, p) => s + overall(p, makeRatings(p)), 0) / all.length : 100);
  }
  return strengthCache.get(key);
}

function record(st, abbr, pf, pa) {
  const s = st[abbr] ||= { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  s.pf += pf; s.pa += pa;
  if (pf > pa) s.w++; else if (pf < pa) s.l++; else s.t++;
}

// Finish the current week: userGame = { homeScore, awayScore, home, away } from the engine (played or simulated).
export function completeWeek(c, teams, roster, userGame, settings = {}) {
  const g = nextGame(c);
  if (!g) return null;
  const us = userGame.home === c.team ? userGame.homeScore : userGame.awayScore;
  const them = userGame.home === c.team ? userGame.awayScore : userGame.homeScore;
  g.result = { us, them, w: us > them ? 'W' : us < them ? 'L' : 'T' };
  if (g.result.w === 'W') c.wins++; else if (g.result.w === 'L') c.losses++; else c.ties++;
  record(c.standings, c.team, us, them); record(c.standings, g.opp, them, us);
  if (userGame.box) recordGameStats(c, userGame.box);
  c.news.unshift({ week: g.week, text: `Semana ${g.week}: ${c.team} ${us} x ${them} ${g.opp} (${g.result.w}). Record ${c.wins}-${c.losses}${c.ties ? '-' + c.ties : ''}.` });
  // Rest of the league (light strength model, seeded).
  const rng = createRng(hashSeed(`${c.seed}-league-${c.season}-${g.week}`));
  const pool = teams.map(t => t.abbr).filter(a => a !== c.team && a !== g.opp);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (let i = 0; i + 1 < pool.length; i += 2) {
    const a = pool[i], b = pool[i + 1], diff = (teamStrength(roster, a) - teamStrength(roster, b)) * 0.5;
    const pa = Math.max(0, Math.round(rng.normal(21 + diff, 9))), pb = Math.max(0, Math.round(rng.normal(21 - diff, 9)));
    record(c.standings, a, pa, pb); record(c.standings, b, pb, pa);
  }
  // Injuries (career layer, Injury Frequency slider).
  const injRate = 0.28 * (settings.injury ?? 1);
  c.injuries = c.injuries.map(i => ({ ...i, weeks: i.weeks - 1 })).filter(i => i.weeks > 0);
  if (rng.chance(injRate)) generateInjury(c, roster, rng);
  c.week++;
  if (c.week > SEASON_WEEKS) c.news.unshift({ week: g.week, text: `Fim da temporada regular ${c.season}: ${c.wins}-${c.losses}${c.ties ? '-' + c.ties : ''}.` });
  c.news = c.news.slice(0, 40);
  return g;
}

export function generateInjury(c, roster, rng = createRng(hashSeed(`${c.seed}-inj-${c.week}-${c.injuries.length}`))) {
  const out = new Set(c.injuries.map(i => i.name));
  const pool = roster.filter(p => p.team === c.team && p.status === 'ACT' && !out.has(p.full_name));
  if (!pool.length) return null;
  const p = rng.pick(pool), types = [['Hamstring', 2, 5], ['Ankle', 1, 4], ['Shoulder', 2, 6], ['Knee', 3, 8], ['Concussion', 1, 3], ['Back', 1, 5]];
  const x = rng.pick(types), weeks = rng.int(x[1], x[2]);
  const inj = { name: p.full_name, id: p.gsis_id || p.full_name, position: p.position, type: x[0], weeks, week: c.week };
  c.injuries.unshift(inj);
  c.news.unshift({ week: c.week, text: `Lesão: ${p.full_name} (${p.position}) — ${x[0]}, ${weeks} sem.` });
  return inj;
}

// Division table sorted by win% then point differential.
export function divisionTable(c, teams, abbr = c.team) {
  const me = teams.find(t => t.abbr === abbr);
  if (!me) return [];
  return teams.filter(t => t.conference === me.conference && t.division === me.division)
    .map(t => ({ t, s: c.standings[t.abbr] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 } }))
    .sort((a, b) => pct(b.s) - pct(a.s) || (b.s.pf - b.s.pa) - (a.s.pf - a.s.pa));
}
export const pct = s => (s.w + s.l + s.t ? (s.w + 0.5 * s.t) / (s.w + s.l + s.t) : 0);
export function leagueRank(c, teams, abbr = c.team) {
  const list = teams.map(t => ({ a: t.abbr, s: c.standings[t.abbr] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 } }))
    .sort((x, y) => pct(y.s) - pct(x.s) || (y.s.pf - y.s.pa) - (x.s.pf - x.s.pa));
  return list.findIndex(x => x.a === abbr) + 1;
}

// Season stats from the engine box score of the user's games (players of both teams; team totals for c.team).
export function recordGameStats(c, box) {
  c.seasonStats ||= {}; c.teamStats ||= { games: 0 };
  for (const p of Object.values(box.players)) {
    const cur = c.seasonStats[p.id] ||= { name: p.name, team: p.team, pos: p.pos, gp: 0 };
    cur.gp++;
    for (const grp of ['pass', 'rush', 'rec', 'def']) {
      const dst = cur[grp] ||= {};
      for (const k in p[grp]) dst[k] = k === 'long' ? Math.max(dst[k] || 0, p[grp][k]) : (dst[k] || 0) + p[grp][k];
    }
  }
  const t = box.teams[c.team];
  if (t) { c.teamStats.games++; for (const k in t) c.teamStats[k] = (c.teamStats[k] || 0) + t[k]; }
}
