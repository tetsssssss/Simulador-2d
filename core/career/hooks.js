// Lifecycle glue for career 3.0: careerCore calls these at fixed points (creation, new season, end of preseason, after each slate,
// offseason stages, daily ticks). Every hook is a no-op until c.x.ready, so v2 saves keep working until they are opened.
import { teamPlayers, teamOf, myTeam, news, rngFor, OFF_STAGES } from './careerCore.js';
import { ensureV3, enforceLegality, assignCurves, rebuildIntl, cutToFA, myTeamAbbr } from './x.js';
import { initCoach, trackObjectives, jobSecurity, midSeasonFiring, seasonEndCoach, aiCoachChurn, fillVacancies, refreshOffers, fireUser } from './coach.js';
import { staffSeasonEnd, refreshStaffMarket, staffFx, bustStaffFx } from './staff.js';
import { trainingDay, injuryMultFromTraining, teamFamiliarityBonus } from './training.js';
import { reconcileUser, tacticsRatingBonus, weeklyGameplan } from './tactics.js';
import { financeDay, financeGate, financeSeasonEnd, facilitiesDay, scoutingDay, pruneKnowledge } from './gm.js';
import { prunePicks } from './picks.js';
import { aiTradeRound, refreshBlocks, tradeWindowOpen, deadlineDay } from './tradeAI.js';
import { scanEvents, jobOfferEvents, firedEvent, autoResolveEvents } from './events.js';
import { collectNews, pushNews, seasonFinanceNews } from './news.js';
import { playerGameUpdate, playerTrainingDay, afterProgression, progressionMods, rookieCamp, intlSignMe } from './playerCareer.js';
import { clamp, round1, xr, dayOfSlate } from './kit.js';

export const OFF_DAYS = { AWARDS: 3, PROGRESSION: 2, RESIGN: 21, DRAFT: 3, FREE_AGENCY: 45, CAMP: 30 };
const ready = c => !!c.x?.ready;

export function onCreate(spec, c) {
  ensureV3(spec, c);
  initCoach(spec, c);
  c.x.cal.day = -7; c.x.cal.offDay = 0;
  refreshBlocks(spec, c);
  if (c.role === 'COACH') reconcileUser(spec, c);
  return c;
}
// Opening a save (v2 or v3): finishes migration lazily.
export function onAttach(spec, c) {
  if (!c.players || !c.teams?.length || !c.schedule) return;
  if (!c.x?.ready) { ensureV3(spec, c); initCoach(spec, c); if (c.phase === 'PRESEASON') c.x.cal.day = Math.min(c.x.cal.day, 0) || -7; refreshBlocks(spec, c); }
}
export function onNewSeason(spec, c) {
  if (!ready(c)) return;
  const x = c.x;
  x.cal.day = -7; x.cal.offDay = 0; x.cal.poDay = null; x.newsCur.slate = 0; x.seasonStats = {}; x.gameBoost = 0;
  assignCurves(c);
  spec.v3.yearStep?.(spec, c);
  prunePicks(c, c.season - 1); pruneKnowledge(c);
  for (const p of Object.values(c.players)) { if (p.fm != null && p.t !== c.userTeam && !p.mine) delete p.fm; if (p.askExt) delete p.askExt; }
  if (spec.sport === 'mlb') rebuildIntl(spec, c);
  bustStaffFx(c);
  if (c.role === 'COACH' && x.tac) reconcileUser(spec, c);
  if (c.role !== 'PLAYER' && x.coach) trackObjectives(spec, c);
  refreshBlocks(spec, c);
}
export function onPreseasonEnd(spec, c) {
  if (!ready(c)) return [];
  const x = c.x, fixed = enforceLegality(spec, c, { includeUser: true });
  for (const f of fixed) news(c, `Ajuste automático de elenco/teto no ${f.team}: ${f.issues.map(i => i.text).join('; ')}.`, 'team');
  x.cal.day = 0;
  if (c.role === 'COACH') reconcileUser(spec, c);
  return fixed;
}
// Rating bonus added to the user's team rating in quick sims (tactics fit + synergy + staff + familiarity + one-game boosts).
export function ratingBonus(spec, c, abbr) {
  if (!ready(c) || abbr !== c.userTeam) return 0;
  return tacticsRatingBonus(spec, c, abbr) + (c.x.gameBoost || 0);
}
export function injuryMultFor(spec, c, abbr) {
  if (!ready(c)) return 1;
  const fx = staffFx(spec, c, abbr);
  return fx.injuryMult * (abbr === c.userTeam && c.role !== 'PLAYER' ? injuryMultFromTraining(c) : 1);
}

// ---------- after a slate / playoff day ----------
const BIG = [['passYds', 350, 'jardas de passe'], ['rushYds', 150, 'jardas corridas'], ['recYds', 150, 'jardas recebidas'], ['sacks', 3, 'sacks'], ['hr', 3, 'home runs'], ['g', 3, 'gols (hat-trick)']];
function bigLabel(line) {
  for (const [k, t, l] of BIG) if ((line[k] || 0) >= t) return `${line[k]} ${l}`;
  if ((line.pts || 0) >= 5) return `${line.pts} pontos`; if ((line.h || 0) >= 4) return `${line.h} rebatidas`; if ((line.ka || 0) >= 10 && (line.outs || 0) >= 18) return `${line.ka} strikeouts`;
  if (line.sa >= 25 && line.ga === 0) return 'shutout'; return null;
}
export function onAfterGames(spec, c, results) {
  if (!ready(c)) return;
  const x = c.x, mine = myTeam(c);
  if (c.phase !== 'PLAYOFFS') enforceLegality(spec, c, { includeUser: false }); // IR returns, expirations: AI clubs stay compliant
  if (!mine) return;
  const my = results.find(r => r.mine); x.pendingCtx ||= { bigGames: [] };
  if (!my) return;
  const g = my.g, home = g.h === mine, ms = home ? g.r[0] : g.r[1], os = home ? g.r[1] : g.r[0], won = ms > os;
  if (c.role !== 'PLAYER' && home) financeGate(spec, c);
  x.gameBoost = 0;
  const lines = my.res.lines || (my.res.box ? spec.boxToLines(my.res.box, c) : []);
  const byId = new Map(lines);
  const roster = c.role === 'PLAYER' ? [c.players[c.me.id]] : teamPlayers(c, mine);
  for (const p of roster) {
    if (!p) continue;
    const line = byId.get(p.id), played = !!(line && Object.keys(line).length);
    if (c.role === 'PLAYER' && p.mine) { const perf = playerGameUpdate(spec, c, { line, played, won, h: g.h, a: g.a }); void perf; }
    else if (played && p.st === 'ACT') {
      const gp = p.ps?.gp || 1, avg = spec.v3.prodOf(p) / gp, prod = spec.v3.prodOf({ ...p, ps: line }), exp = Math.max(3, avg);
      const perf = clamp((prod - exp) / (exp + 3), -1, 1);
      p.fm = clamp(Math.round(((p.fm || 0) * 0.85 + perf * 3) * 10) / 10, -10, 10);
      p.conf = clamp(((p.conf ?? 55) + perf * 2 + (won ? 0.5 : -0.5)), 0, 100);
    }
    if (played) { const lb = bigLabel(line); if (lb && (c.role !== 'PLAYER' || p.mine)) x.pendingCtx.bigGames.push({ id: p.id, label: lb }); }
  }
  if (c.role !== 'PLAYER') { x.prel.fans = clamp(x.prel.fans + (won ? 0.5 : -0.5), 0, 100); x.meta[mine].fans = clamp((x.meta[mine].fans || 50) + (won ? 0.4 : -0.4), 0, 100); }
  else x.meta[c.players[c.me.id].t] && (x.meta[c.players[c.me.id].t].fans = clamp((x.meta[c.players[c.me.id].t].fans || 50) + (won ? 0.4 : -0.4), 0, 100));
}

// ---------- daily tick ----------
export function dailyTick(spec, c, { gameDay = false } = {}) {
  if (!ready(c)) return null;
  const x = c.x, out = { events: [], changes: [] }, mine = myTeam(c), day = x.cal.day;
  if (c.role === 'PLAYER') playerTrainingDay(spec, c, { gameDay });
  else if (c.userTeam) {
    trainingDay(spec, c, { gameDay }); financeDay(spec, c);
    const done = facilitiesDay(spec, c); for (const u of done) pushNews(c, { kind: 'COACH', imp: 3, h: 'Obra concluída', b: `${u.key}: nível ${u.to} entregue.`, teams: [c.userTeam], key: `fac:${c.season}:${u.key}:${u.to}` });
    scoutingDay(spec, c);
    if (c.role === 'COACH') { out.changes = reconcileUser(spec, c); for (const ch of out.changes) { const o = c.players[ch.out], n = ch.in && c.players[ch.in]; if (o) pushNews(c, { kind: 'INJURY', imp: 2, h: 'Mudança na escalação', b: `${o.n} está fora; ${n ? n.n : 'ninguém'} assume a vaga.`, teams: [c.userTeam], players: [ch.out], key: `swap:${ch.out}:${day}` }); } }
    const fx = staffFx(spec, c, c.userTeam);
    if (fx.healBonus > 0 && day % 7 === 0) { const rng = xr(c, 'heal'); for (const p of teamPlayers(c, c.userTeam)) if (p.inj && p.inj.games > 1 && rng.next() < fx.healBonus * 2) p.inj.games--; }
    if (day % 7 === 0 && c.phase !== 'OFFSEASON') { trackObjectives(spec, c); jobSecurity(spec, c); }
  }
  if (spec.sport === 'mlb' && (c.phase === 'REGULAR' || c.phase === 'PLAYOFFS') && spec.v3.dayStep) spec.v3.dayStep(spec, c);
  // AI front offices
  if (day % 7 === 0 && c.phase !== 'PLAYOFFS') {
    refreshBlocks(spec, c);
    const rng = xr(c, 'ai-trades'), dl = deadlineDay(spec, c), nearDeadline = c.phase === 'REGULAR' && day >= dl - 14 && day <= dl;
    if (tradeWindowOpen(spec, c) && (nearDeadline || rng.next() < spec.aiTradeRate * 2.2)) aiTradeRound(spec, c, rng, { deadline: nearDeadline });
  }
  // events / news
  const ctx = x.pendingCtx || {}; x.pendingCtx = { bigGames: [] };
  x.evCur ||= { awards: c.history.awards.length };
  const awards = c.history.awards.slice(x.evCur.awards); x.evCur.awards = c.history.awards.length;
  out.events = scanEvents(spec, c, { ...ctx, awards });
  if (c.phase === 'REGULAR' && day % 7 === 0 && c.role !== 'PLAYER') { const why = midSeasonFiring(spec, c); if (why && !c.fired) { fireUser(spec, c, why); const e = firedEvent(spec, c, why); if (e) out.events.push(e); refreshOffers(spec, c); out.events.push(...jobOfferEvents(spec, c)); } }
  collectNews(spec, c);
  return out;
}

// Called by playSlate before the games of a slate: catches the day counter up (Hub-style advance that skips the day API).
export function syncToSlateDay(spec, c) {
  if (!ready(c)) return;
  const target = dayOfSlate(spec, c.slate), x = c.x;
  let guard = 0;
  while (x.cal.day < target && guard++ < 20) { x.cal.day++; dailyTick(spec, c); }
  if (x.cal.day < target) x.cal.day = target;
}

// ---------- offseason ----------
export function afterGoalsEvaluated(spec, c, score) {
  if (!ready(c) || c.role === 'PLAYER') return null;
  const r = seasonEndCoach(spec, c, score);
  const left = staffSeasonEnd(spec, c); void left;
  const fin = financeSeasonEnd(spec, c); seasonFinanceNews(c, fin);
  aiCoachChurn(spec, c);
  refreshOffers(spec, c);
  if (r.fired) firedEvent(spec, c, r.reason); else jobOfferEvents(spec, c);
  return r;
}
export function onOffseasonStage(spec, c) {
  if (!ready(c)) return;
  const x = c.x; x.cal.offDay = 0;
  if (c.off === 'RESIGN' && c.role === 'GM') {
    for (const p of teamPlayers(c, c.userTeam)) if (p.expiring && p.rel && p.rel.tr < 35 && !p.noReSign) {
      p.noReSign = true;
      const ev = scanRefuse(c, p); void ev;
    }
  }
  if (c.off === 'FREE_AGENCY') { refreshStaffMarket(spec, c); fillVacancies(spec, c); if (spec.sport === 'mlb' && x.intl) x.intl.open = true; refreshOffers(spec, c); }
  if (c.off === 'CAMP') {
    if (spec.sport === 'mlb' && x.intl) aiInternational(spec, c);
    if (c.role === 'PLAYER') rookieCamp(spec, c);
    enforceLegality(spec, c, { includeUser: false });
    if (c.role === 'COACH') reconcileUser(spec, c);
  }
}
function scanRefuse(c, p) {
  const x = c.x, key = `REFUSE:${p.id}:${c.season}`;
  if (x.events.pending.length >= 6 || x.events.cool[key]) return null;
  x.events.cool[key] = x.cal.day + 999;
  const ev = { id: `ev${++x.events.seq}`, type: 'REFUSE_CONTRACT', key, day: x.cal.day, season: c.season, subject: p.id, team: c.userTeam, title: `${p.n} se recusa a negociar`, text: `Com a confiança em ${Math.round(p.rel.tr)}, ${p.n} (${p.pos}, ${p.ovr}) recusa conversar sobre renovação.`, facts: { tr: Math.round(p.rel.tr) }, choices: [{ key: 'persuade', label: 'Convencer com +15% no salário', hint: 'confiança volta a 50+' }, { key: 'release', label: 'Deixá-lo seguir para a free agency', hint: '' }], auto: 'release', status: 'open', chosen: null };
  x.events.pending.push(ev); return ev;
}
function aiInternational(spec, c) {
  const x = c.x, rng = xr(c, 'intl-ai'), pool = Object.values(c.players).filter(p => p.t === 'INTL').sort((a, b) => b.pot - a.pot);
  for (const t of c.teams) {
    if (t.abbr === c.userTeam && c.role === 'GM') continue;
    let budget = (spec.cap?.limit || 200) * 0.022 * (0.7 + rng.next() * 0.6), n = 0;
    for (const p of pool) {
      if (p.t !== 'INTL' || n >= 4) continue;
      if (p.ask > budget || rng.next() > 0.35) continue;
      budget -= p.ask; n++;
      Object.assign(p, { t: t.abbr, st: 'MIN', lvl: 'R', on40: false, opt: 3, svc: 0, c: { sal: spec.salary.min, yrs: 5, kind: 'MINOR', bonus: p.ask }, signed: { year: c.season, bonus: p.ask } }); delete p.ask;
      c.history.transactions.push({ s: c.season, kind: 'SIGN', text: `${t.abbr} assina o prospecto internacional ${p.n}`, teams: [t.abbr], players: [p.id], silent: true });
    }
  }
  x.intl.open = false;
}
// PROGRESSION helpers used by careerCore
export const progressMods = (spec, c, p) => (ready(c) ? progressionMods(spec, c, p) : {});
export function afterProgress(spec, c, p, d, rng) {
  if (!ready(c)) return;
  afterProgression(spec, c, p, d);
  if (p.sev) { p.ovr = Math.max(30, p.ovr - (rng.next() < 0.5 ? 1 : 2)); p.sev = false; }
}
export function onInjury(spec, c, p) {
  if (!ready(c)) return;
  if (p.inj.games >= spec.injuries.irGames * 2.5) p.sev = true;
  if (p.reinjure && p.inj) { p.inj.games = Math.round(p.inj.games * (1 + p.reinjure)); p.reinjure = 0; }
}
export function serviceTick(spec, p) { return spec.v3.serviceTick ? spec.v3.serviceTick(p) : 1; }
export function skipContractTick(spec, p) { return !!spec.v3?.skipContractTick?.(p); }
export function myOffseasonDays(c) { return OFF_DAYS[c.off] || 7; }
export { autoResolveEvents, intlSignMe };
export function tickPlayoffDay(spec, c) {
  if (!ready(c)) return;
  const step = Math.max(1, Math.round(spec.calendar.slateDays));
  for (let i = 0; i < step; i++) { c.x.cal.day++; dailyTick(spec, c, { gameDay: i === step - 1 }); }
}
