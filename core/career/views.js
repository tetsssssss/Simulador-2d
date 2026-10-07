// Screen data providers: pure functions that turn the save into view-models for the UI (no DOM, JSON-serialisable).
// getXView(save, ...) accepts the career object or the store envelope ({ career }). The spec is read from the attached runtime
// spec (attachSpec) or passed as the last argument. See core/career/API.md for the shapes.
import { teamPlayers, teamOf, myTeam, payroll, capSpace, freeAgents, draftPool, avgMorale, nextUserGame, dateLabel, OFF_LABEL, OFF_STAGES, meStage, contractAsk, marketValue } from './careerCore.js';
import { sortTeams, winPct } from './league.js';
import { staffFx, staffPayroll } from './staff.js';
import { FOCI, GROUP_MODES, injuryMultFromTraining } from './training.js';
import { getTactics, tacticsReport, weeklyGameplan, engineConfig, canEditTactics } from './tactics.js';
import { fogged, scoutsOf, scoutTargets, scoutKnowledge, FACILITY_INFO, facilityCost } from './gm.js';
import { jobSecurity, squadRelationship, trackObjectives, jobMarket } from './coach.js';
import { teamPicks, nextDraftYear, pickProjection } from './picks.js';
import { getTradeBlock, getBlockOffers, tradeWindowOpen, deadlineDay, teamContext, assetValue } from './tradeAI.js';
import { getFeed } from './news.js';
import { getEvents } from './events.js';
import { nextGameInfo, calendarDate, pendingGameDay } from './calendar.js';
import { prelSnapshot } from './prel.js';
import { pathwayView, projectCurve, APPEARANCE_RANGES } from './playerCareer.js';
import { CURVES } from './curves.js';
import { round1, dayOfSlate, dateOfDay, fmtDate, difficultyOf } from './kit.js';

export function unwrap(save, spec) {
  const c = save?.career && save.saveVersion != null ? save.career : save;
  const sp = spec || c?._spec;
  if (!c?.x?.ready || !sp) throw new Error('Carreira não inicializada: chame attachSpec(c, spec) antes de montar views.');
  return { c, spec: sp };
}
const rec = st => (st ? `${st.w}-${st.l}${st.otl ? '-' + st.otl : st.t ? '-' + st.t : ''}` : '');
const teamName = (c, a) => teamOf(c, a)?.name || a;
function playerRow(spec, c, p, { fog = false } = {}) {
  const f = fog ? fogged(spec, c, p) : null, mine = p.t === myTeam(c);
  return { id: p.id, n: p.n, pos: p.pos, group: spec.posGroup(p.pos), age: p.age, num: p.num || '', team: p.t, st: p.st, lvl: p.lvl || null, role: p.role || null, rot: p.rot ?? null,
    ovr: f ? f.ovr : p.ovr, pot: f ? f.pot : p.pot, ovrRange: f && !f.exact ? f.ovrRange : null, potRange: f && !f.exact ? f.potRange : null, know: f ? f.know : 100,
    inj: p.inj ? { type: p.inj.type, games: p.inj.games } : null, sal: p.c?.sal ?? null, yrs: p.c?.yrs ?? null, contractKind: spec.v3.contractKind ? spec.v3.contractKind(spec, p) : (p.c?.kind || null),
    form: mine ? (p.fm ?? 0) : null, conf: mine ? Math.round(p.conf ?? 55) : null, xp: mine ? Math.round(p.xp || 0) : null, curve: mine ? (CURVES[p.cv]?.label || null) : null,
    rel: mine && p.rel ? { trust: Math.round(p.rel.tr), respect: Math.round(p.rel.rs), morale: Math.round(p.rel.mo), satisfaction: Math.round(p.rel.sat) } : null,
    on40: p.on40 ?? null, opt: p.opt ?? null, svc: p.svc ?? null, svcDays: p.svcD ?? null, expiring: !!p.expiring, rfa: !!p.rfa, drafted: p.drafted || null, fict: !!p.fict, mine: !!p.mine, noReSign: !!p.noReSign };
}

// ---------- dashboard ----------
export function getDashboardView(save, spec0) {
  const { c, spec } = unwrap(save, spec0), x = c.x, me = myTeam(c), st = me ? c.standings[me] : null;
  const alerts = [];
  if (c.fired) alerts.push({ level: 'bad', kind: 'FIRED', text: 'Você foi demitido: veja as propostas de emprego.' });
  for (const e of x.events.pending) alerts.push({ level: 'event', kind: 'EVENT', eventId: e.id, text: e.title });
  if (c.role !== 'PLAYER' && me) { const lg = spec.v3.legality(spec, c, me); for (const i of lg.issues) alerts.push({ level: 'warn', kind: i.code, text: i.text }); const js = jobSecurity(spec, c); if (js && js.level !== 'SAFE') alerts.push({ level: js.level === 'HOT' ? 'bad' : 'warn', kind: 'FIRING_WATCH', text: js.label }); }
  if (c.phase === 'REGULAR' && tradeWindowOpen(spec, c) && x.cal.day >= deadlineDay(spec, c) - 10) alerts.push({ level: 'info', kind: 'DEADLINE', text: `Prazo das trocas em ${deadlineDay(spec, c) - x.cal.day} dia(s).` });
  const conf = me ? teamOf(c, me)?.conf : null, rank = me ? sortTeams(c.teams.filter(t => t.conf === conf), c.standings, !!spec.usePoints).findIndex(t => t.abbr === me) + 1 : null;
  return {
    header: { name: c.name, sport: c.sport, role: c.role, season: c.season, phase: c.phase, off: c.off, offLabel: c.off ? OFF_LABEL[c.off] : null, day: x.cal.day, date: calendarDate(spec, c), team: me, teamName: me ? teamName(c, me) : null, record: rec(st), confRank: rank, difficulty: difficultyOf(c).label, rep: x.rep, fired: !!c.fired, mode: me ? teamOf(c, me)?.mode : null },
    nextGame: nextGameInfo(spec, c), gameToday: pendingGameDay(spec, c),
    alerts, objectives: c.role !== 'PLAYER' && me ? trackObjectives(spec, c) : c.goals.map(g => ({ key: g.key, text: g.text, status: g.status })),
    security: c.role !== 'PLAYER' && me ? jobSecurity(spec, c) : null,
    relationships: c.role === 'PLAYER' ? prelSnapshot(c) : { board: Math.round(c.board.confidence), squad: squadRelationship(c), fans: Math.round(x.prel.fans) },
    finance: c.role !== 'PLAYER' ? { cash: x.fin.cash, budget: x.fin.budget, last: x.fin.last } : null,
    training: c.role !== 'PLAYER' ? { focus: x.training.plan.focus, intensity: x.training.plan.intensity, load: Math.round(x.training.load), familiarity: Math.round(x.training.fam) } : null,
    tactics: c.role === 'COACH' ? tacticsReport(spec, c) : null,
    news: getFeed(c, { n: 6, minImp: 3 }), standings: me ? divisionTable(spec, c, me) : [], injuries: me ? teamPlayers(c, me).filter(p => p.inj).map(p => ({ id: p.id, n: p.n, pos: p.pos, type: p.inj.type, games: p.inj.games })) : [],
  };
}
function divisionTable(spec, c, me) {
  const div = teamOf(c, me)?.div;
  return sortTeams(c.teams.filter(t => t.div === div), c.standings, !!spec.usePoints).map(t => ({ abbr: t.abbr, name: t.name, record: rec(c.standings[t.abbr]), pf: c.standings[t.abbr].pf, pa: c.standings[t.abbr].pa, streak: c.standings[t.abbr].streak, me: t.abbr === me }));
}

// ---------- calendar ----------
export function getCalendarView(save, { upcoming = 8, past = 6 } = {}, spec0) {
  const { c, spec } = unwrap(save, spec0), x = c.x, me = myTeam(c);
  const games = me ? c.schedule.filter(g => g.h === me || g.a === me).sort((a, b) => a.s - b.s) : [];
  const row = g => ({ slate: g.s, day: dayOfSlate(spec, g.s), date: fmtDate(dateOfDay(spec, c.season, dayOfSlate(spec, g.s))), opp: g.h === me ? g.a : g.h, oppName: teamName(c, g.h === me ? g.a : g.h), home: g.h === me, result: g.r ? { us: g.h === me ? g.r[0] : g.r[1], them: g.h === me ? g.r[1] : g.r[0], ot: !!g.ot, won: (g.h === me ? g.r[0] > g.r[1] : g.r[1] > g.r[0]) } : null });
  const done = games.filter(g => g.r), todo = games.filter(g => !g.r);
  const dl = deadlineDay(spec, c);
  return {
    season: c.season, phase: c.phase, off: c.off, day: x.cal.day, date: calendarDate(spec, c), slate: c.slate, slates: c.slates, nextGame: nextGameInfo(spec, c), gameToday: pendingGameDay(spec, c),
    upcoming: todo.slice(0, upcoming).map(row), recent: done.slice(-past).reverse().map(row),
    deadline: { day: dl, date: fmtDate(dateOfDay(spec, c.season, dl)), open: tradeWindowOpen(spec, c), daysLeft: dl - x.cal.day },
    stages: ['PRESEASON', 'REGULAR', 'PLAYOFFS', ...OFF_STAGES].map(k => ({ key: k, label: { PRESEASON: 'Pré-temporada', REGULAR: 'Temporada regular', PLAYOFFS: 'Playoffs' }[k] || OFF_LABEL[k], current: c.phase === k || (c.phase === 'OFFSEASON' && c.off === k) })),
    playoffs: c.playoffs ? { round: c.playoffs.round, names: spec.playoffs.names, champion: c.playoffs.champion } : null, modes: ['NEXT_DAY', 'NEXT_WEEK', 'NEXT_GAME'],
  };
}

// ---------- team / roster ----------
export function getTeamView(save, abbr, spec0) {
  const { c, spec } = unwrap(save, spec0); abbr ||= myTeam(c);
  const t = teamOf(c, abbr), m = c.x.meta[abbr], list = teamPlayers(c, abbr), st = c.standings[abbr];
  const fx = staffFx(spec, c, abbr);
  return { abbr, name: t.name, conf: t.conf, div: t.div, color: t.color, mode: t.mode, rank: t.rank, record: rec(st), pf: st.pf, pa: st.pa, streak: st.streak, rating: round1(spec.teamRating(list.filter(p => p.st === 'ACT' && !p.inj), c)),
    prestige: m.prestige, market: m.mkt, fans: Math.round(m.fans || 50), facilities: m.fac, coach: { name: abbr === c.userTeam && c.role === 'COACH' ? c.name : m.coach.name, rating: m.coach.rating, rep: m.coach.rep, user: abbr === c.userTeam && c.role === 'COACH' },
    gm: { name: abbr === c.userTeam && c.role === 'GM' ? c.name : m.gm.name, rating: m.gm.rating, user: abbr === c.userTeam && c.role === 'GM' }, payroll: payroll(Object.values(c.players), abbr), cap: spec.cap?.limit ?? null, capKind: spec.cap?.kind ?? null, staffEffects: fx,
    picks: teamPicks(spec, c, abbr, { years: 2 }).length, top: list.filter(p => p.st !== 'MIN').sort((a, b) => b.ovr - a.ovr).slice(0, 5).map(p => playerRow(spec, c, p, { fog: abbr !== c.userTeam })), vacancy: c.x.market.jobs.some(j => j.team === abbr && !j.filled) };
}
export function getRosterView(save, abbr, spec0) {
  const { c, spec } = unwrap(save, spec0); abbr ||= myTeam(c);
  const own = abbr === myTeam(c), list = teamPlayers(c, abbr).sort((a, b) => spec.positions.indexOf(spec.posGroup(a.pos)) - spec.positions.indexOf(spec.posGroup(b.pos)) || (a.st === 'MIN') - (b.st === 'MIN') || b.ovr - a.ovr);
  const groups = {}; for (const p of list) (groups[spec.posGroup(p.pos)] ||= []).push(playerRow(spec, c, p, { fog: !own }));
  return { team: abbr, own, groups: Object.entries(groups).map(([group, players]) => ({ group, players })), counts: { total: list.length, active: list.filter(p => p.st === 'ACT').length, minors: list.filter(p => p.st === 'MIN').length, injured: list.filter(p => p.inj).length, ir: list.filter(p => p.st === 'IR').length, on40: list.filter(p => p.on40).length }, legality: spec.v3.legality(spec, c, abbr), minors: spec.sport === 'mlb' ? farmLevels(spec, c, abbr) : null };
}
function farmLevels(spec, c, abbr) {
  const out = { R: [], A: [], AA: [], AAA: [] }; for (const p of teamPlayers(c, abbr)) if (p.st === 'MIN') (out[p.lvl || 'A'] ||= []).push({ id: p.id, n: p.n, pos: p.pos, age: p.age, ovr: p.ovr, pot: p.pot, on40: !!p.on40, opt: p.opt, fict: !!p.fict });
  for (const k in out) out[k].sort((a, b) => b.ovr - a.ovr); return out;
}

// ---------- staff / training / tactics ----------
export function getStaffView(save, spec0) {
  const { c, spec } = unwrap(save, spec0), x = c.x, roles = spec.v3.staffRoles;
  const label = k => roles.find(r => r.key === k)?.label || k;
  return {
    editable: c.role === 'COACH' || c.role === 'GM', budget: { total: x.fin.budget.staff, spent: staffPayroll(c) },
    roles: roles.map(r => ({ ...r, hired: x.staff.hired.filter(m => m.role === r.key).map(m => ({ ...m, label: label(m.role) })), open: r.slots - x.staff.hired.filter(m => m.role === r.key).length })),
    market: x.staff.market.map(m => ({ ...m, label: label(m.role) })).sort((a, b) => b.rating - a.rating), effects: c.userTeam ? staffFx(spec, c, c.userTeam) : null,
    headCoach: c.role === 'GM' && c.userTeam ? { ...x.meta[c.userTeam].coach } : null,
  };
}
export function getTrainingView(save, spec0) {
  const { c, spec } = unwrap(save, spec0), x = c.x;
  if (c.role === 'PLAYER') { const me = c.players[c.me.id], set = spec.v3.attrSets[spec.v3.attrGroup(spec, me.pos)]; return { role: 'PLAYER', training: c.me.training, attrs: Object.entries(set).map(([k, d]) => ({ key: k, label: d.label, value: me.attrs?.[k] ?? null })), xp: Math.round(me.xp || 0), form: me.fm || 0, confidence: Math.round(me.conf ?? 55), ovr: me.ovr, pot: me.pot }; }
  const gp = {}; for (const p of teamPlayers(c, c.userTeam)) (gp[spec.posGroup(p.pos)] ||= []).push(p);
  return { role: c.role, plan: x.training.plan, foci: Object.entries(FOCI).map(([key, f]) => ({ key, label: f.label })), groupModes: Object.keys(GROUP_MODES), groups: Object.keys(gp), load: Math.round(x.training.load), familiarity: Math.round(x.training.fam), injuryMult: injuryMultFromTraining(c), gains: x.training.gains.slice(0, 12),
    developing: teamPlayers(c, c.userTeam).filter(p => p.pot > p.ovr).sort((a, b) => (b.pot - b.ovr) - (a.pot - a.ovr)).slice(0, 12).map(p => ({ id: p.id, n: p.n, pos: p.pos, age: p.age, ovr: p.ovr, pot: p.pot, xp: Math.round(p.xp || 0), curve: CURVES[p.cv]?.label })) };
}
export function getTacticsView(save, spec0) {
  const { c, spec } = unwrap(save, spec0), me = c.userTeam;
  if (!me) return { editable: false };
  const tac = getTactics(spec, c), byId = Object.fromEntries(teamPlayers(c, me).map(p => [p.id, { id: p.id, n: p.n, pos: p.pos, ovr: p.ovr, inj: !!p.inj, st: p.st }]));
  return { editable: canEditTactics(c), tac, schema: spec.v3.tacticsSchema, report: tacticsReport(spec, c), gameplan: c.role === 'COACH' ? weeklyGameplan(spec, c) : null, players: byId, engineConfig: engineConfig(spec, c, me) };
}

// ---------- contracts / transactions ----------
export function getContractsView(save, spec0) {
  const { c, spec } = unwrap(save, spec0), me = c.userTeam || myTeam(c), all = Object.values(c.players);
  if (!me) return { team: null, rows: [] };
  const rows = teamPlayers(c, me).filter(p => p.c).sort((a, b) => b.c.sal - a.c.sal).map(p => ({ ...playerRow(spec, c, p), market: marketValue(spec, p), ask: contractAsk(spec, p), surplus: round1((marketValue(spec, p) - p.c.sal) * Math.min(4, p.c.yrs)) }));
  const pay = payroll(all, me);
  return { team: me, payroll: pay, cap: spec.cap?.limit ?? null, capKind: spec.cap?.kind ?? null, capSpace: spec.cap ? round1(spec.cap.limit - pay) : null, budget: c.x.fin.budget.payroll, overBudget: pay > c.x.fin.budget.payroll,
    luxuryTax: spec.cap?.kind === 'tax' ? round1(Math.max(0, pay - spec.cap.limit) * 0.2) : 0, rows, expiring: rows.filter(r => r.expiring || (r.yrs ?? 9) <= 1), legality: spec.v3.legality(spec, c, me),
    freeAgents: freeAgents(c).sort((a, b) => b.ovr - a.ovr).slice(0, 60).map(p => ({ ...playerRow(spec, c, p, { fog: true }), ask: contractAsk(spec, p, { freeAgent: true }) })), sportActions: Object.keys(spec.v3.actions || {}) };
}
export function getTransactionsView(save, { n = 40, team } = {}, spec0) {
  const { c, spec } = unwrap(save, spec0), me = c.userTeam, tx = c.history.transactions.filter(t => !t.silent).slice(-n).reverse().filter(t => !team || (t.teams || []).includes(team));
  return { recent: tx, window: { open: tradeWindowOpen(spec, c), deadlineDay: deadlineDay(spec, c), day: c.x.cal.day },
    block: { league: me ? getTradeBlock(spec, c) : [], user: c.x.block.user.map(id => c.players[id]).filter(Boolean).map(p => playerRow(spec, c, p)), offers: me ? getBlockOffers(spec, c) : [] },
    picks: me ? { mine: teamPicks(spec, c, me, { years: 3 }).map(k => ({ ...k, projectedOverall: Math.round(pickProjection(spec, c, k)) + 1 })), draftYear: nextDraftYear(c) } : null };
}

// ---------- scouting / draft ----------
export function getScoutingView(save, spec0) {
  const { c, spec } = unwrap(save, spec0), x = c.x;
  const prospects = draftPool(c).sort((a, b) => b.pot - a.pot).slice(0, 60).map(p => playerRow(spec, c, p, { fog: true }));
  const intl = spec.sport === 'mlb' ? Object.values(c.players).filter(p => p.t === 'INTL').sort((a, b) => b.pot - a.pot).slice(0, 40).map(p => ({ ...playerRow(spec, c, p, { fog: true }), ask: p.ask, country: p.country })) : null;
  return { editable: c.role !== 'PLAYER', scouts: scoutsOf(spec, c).map(s => ({ ...s, target: x.scout.assign[s.id] || 'auto' })), targets: scoutTargets(spec, c), auto: x.scout.auto, facility: x.meta[c.userTeam]?.fac.scouting ?? null,
    prospects, intl, intlBudget: spec.sport === 'mlb' ? { pool: x.gm.intlPool, spent: x.gm.intlSpent, open: !!x.intl?.open } : null, known: Object.values(x.scout.know).filter(v => v >= 95).length };
}
export function getDraftView(save, spec0) {
  const { c, spec } = unwrap(save, spec0), d = c.draft, me = c.userTeam;
  const pool = draftPool(c).sort((a, b) => (b.pot * 0.65 + b.ovr * 0.35) - (a.pot * 0.65 + a.ovr * 0.35));
  return { active: !!d && !d.done, done: !!d?.done, year: d?.year ?? nextDraftYear(c), cursor: d?.cursor ?? 0, onTheClock: d && !d.done ? d.picks[d.cursor] : null, userTurn: !!(d && !d.done && me && d.picks[d.cursor]?.team === me),
    userPicks: d ? d.picks.filter(p => p.team === me).map(p => ({ ...p, player: p.playerId ? c.players[p.playerId]?.n : null })) : [], rounds: spec.draft.rounds,
    board: pool.slice(0, 80).map((p, i) => ({ ...playerRow(spec, c, p, { fog: true }), rank: i + 1, stock: undefined })),
    results: d ? d.picks.filter(p => p.playerId).slice(-30).map(p => ({ overall: p.overall, round: p.round, team: p.team, orig: p.orig, player: c.players[p.playerId]?.n, pos: c.players[p.playerId]?.pos })) : [],
    myProspect: c.role === 'PLAYER' ? c.me.stock : null };
}

// ---------- news / history / profile ----------
export function getNewsView(save, filter = {}, spec0) {
  const { c } = unwrap(save, spec0);
  return { items: getFeed(c, { n: 40, ...filter }), events: { open: getEvents(c, { status: 'open' }), recent: getEvents(c, { status: 'resolved' }).slice(0, 10) }, kinds: ['RESULT', 'INJURY', 'TRADE', 'SIGNING', 'CONTRACT', 'MILESTONE', 'STANDINGS', 'RUMOR', 'FIRING_WATCH', 'AWARD', 'DRAFT', 'COACH', 'EVENT'] };
}
export function getHistoryView(save, spec0) {
  const { c } = unwrap(save, spec0);
  return { seasons: c.history.seasons, awards: c.history.awards.slice(-40), titles: c.history.titles, coach: c.x.coach?.history || [], transactions: c.history.transactions.filter(t => !t.silent).length, repTrail: (c.x.coach?.history || []).map(h => ({ s: h.s, rep: h.rep })), players: c.role === 'PLAYER' ? c.players[c.me.id].hist || [] : null };
}
export function getProfileView(save, spec0) {
  const { c, spec } = unwrap(save, spec0), x = c.x;
  if (c.role === 'PLAYER') {
    const me = c.players[c.me.id], set = spec.v3.attrSets[spec.v3.attrGroup(spec, me.pos)];
    return { role: 'PLAYER', player: { id: me.id, name: me.n, pos: me.pos, archetype: me.arch, age: me.age, height: me.height, weight: me.weight, ovr: me.ovr, pot: me.pot, team: me.t, status: me.st, jersey: me.num, appearance: me.appearance || null, photoUrl: me.photoUrl || null, curve: { key: me.cv, label: CURVES[me.cv]?.label }, xp: Math.round(me.xp || 0), form: me.fm || 0, confidence: Math.round(me.conf ?? 55), role: me.role || null, contract: me.c, drafted: me.drafted || null },
      attrs: Object.entries(set).map(([k, d]) => ({ key: k, label: d.label, value: me.attrs?.[k] ?? null, weight: d.w })), relationships: prelSnapshot(c), pathway: pathwayView(spec, c), stage: meStage(spec, c)?.label, goals: c.goals, stock: c.me.stock, hist: me.hist || [], log: c.me.log.slice(0, 10), projection: projectCurve(spec, { ovr: me.ovr, pot: me.pot, age: me.age, curve: me.cv, seed: c.seed }), curves: Object.values(CURVES).map(k => ({ key: k.key, label: k.label })), appearanceRanges: APPEARANCE_RANGES };
  }
  return { role: c.role, name: c.name, rep: x.rep, contract: x.coach?.contract, security: jobSecurity(spec, c), board: { confidence: Math.round(c.board.confidence), mandate: x.owner.mandate }, squad: squadRelationship(c), fans: Math.round(x.prel.fans), history: x.coach?.history || [], market: jobMarket(spec, c), offers: x.market.offers, seasons: x.coach?.seasons || 0, firedReason: x.coach?.firedReason || null };
}
export { teamContext, assetValue };
