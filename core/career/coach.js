// Coach / GM career: contract, reputation, board objectives (tracked and evaluated at season end), board and squad relationship,
// firing logic (board trust + results + objectives), job offers (reputation driven) and a market of vacant / other jobs.
import { createRng, hashSeed } from '../rng/rng.js';
import { fictionalName } from './people.js';
import { teamPlayers, teamOf, news, avgMorale, rngFor } from './careerCore.js';
import { sortTeams, winPct } from './league.js';
import { clamp, round1, xr, hash01, difficultyOf } from './kit.js';

const EXPECT = { contender: 0.6, middle: 0.5, rebuild: 0.38 };
export function contractSalary(spec, rep, prestige = 50) { return round1(spec.salary.max * (0.12 + (rep / 100) * 0.2 + (prestige / 100) * 0.08)); }
export function initCoach(spec, c) {
  const x = c.x; if (c.role === 'PLAYER' || !c.userTeam || x.coach) return;
  const pres = x.meta[c.userTeam]?.prestige ?? 50;
  x.coach = { name: c.name, role: c.role, contract: { team: c.userTeam, sal: contractSalary(spec, x.rep, pres), yrs: 3, since: c.season }, seasons: 0, fireWatch: 'SAFE', security: 70, history: [], bad: 0 };
  setMandate(spec, c);
}
export function setMandate(spec, c) {
  const t = teamOf(c, c.userTeam), mode = t?.mode || 'middle', x = c.x;
  x.owner.mandate = mode === 'contender' ? { key: 'title', text: 'Conquistar o título em até 3 temporadas', from: c.season, by: c.season + 2, met: false }
    : mode === 'rebuild' ? { key: 'build', text: 'Reconstruir o elenco e chegar aos playoffs em até 3 temporadas', from: c.season, by: c.season + 2, met: false }
      : { key: 'playoffs', text: 'Consolidar o time entre os playoffs em até 2 temporadas', from: c.season, by: c.season + 1, met: false };
}
// ---------- live tracking of the season objectives (c.goals) ----------
export function trackObjectives(spec, c) {
  if (c.role === 'PLAYER' || !c.userTeam) return [];
  const st = c.standings[c.userTeam], gp = st.w + st.l + st.t + (st.otl || 0), total = spec.calendar.games, out = [];
  const conf = teamOf(c, c.userTeam)?.conf;
  const confRank = sortTeams(c.teams.filter(t => t.conf === conf), c.standings, !!spec.usePoints).findIndex(t => t.abbr === c.userTeam) + 1;
  const wp = winPct(st), proj = gp ? wp : null;
  for (const g of c.goals) {
    const row = { key: g.key, text: g.text, w: g.w, status: g.status, target: g.target ?? null, value: null, pct: 0, onTrack: false };
    if (g.key === 'winpct') { row.value = round1(wp * 1000) / 1000; row.pct = clamp(wp / g.target, 0, 1.5); row.onTrack = gp < 4 || wp >= g.target - 0.02; }
    else if (g.key === 'playoffs') { row.value = confRank; row.target = spec.playoffs.perConf; row.pct = clamp(1 - (confRank - 1) / (c.teams.length / 2), 0, 1); row.onTrack = confRank <= spec.playoffs.perConf + (gp < total / 2 ? 2 : 0); }
    else if (g.key === 'round') { row.value = c.playoffs ? 1 : 0; row.pct = c.playoffs ? 0.5 : proj ? clamp(wp, 0, 1) * 0.5 : 0; row.onTrack = wp >= 0.55 || gp < 4; }
    else if (g.key === 'youth') { row.value = teamPlayers(c, c.userTeam).filter(p => p.age <= 24 && (p.dv || 0) >= 3).length; row.pct = clamp(row.value / g.target, 0, 1); row.onTrack = c.phase !== 'OFFSEASON' || row.value >= g.target; }
    else if (g.key === 'payroll') { row.value = c.x.fin ? round1(c.x.fin.budget.payroll - teamPayrollQuick(c)) : null; row.pct = row.value >= 0 ? 1 : 0; row.onTrack = row.value >= 0; row.target = c.x.fin.budget.payroll; }
    else if (g.key === 'morale') { row.value = Math.round(avgMorale(c, c.userTeam)); row.pct = clamp(row.value / g.target, 0, 1.2); row.onTrack = row.value >= g.target - 3; }
    else { row.pct = g.status === 'done' ? 1 : 0; row.onTrack = g.status !== 'failed'; }
    g.value = row.value; g.pct = round1(row.pct * 100) / 100; g.onTrack = row.onTrack;
    out.push(row);
  }
  return out;
}
const teamPayrollQuick = c => { let s = 0; for (const p of Object.values(c.players)) if (p.t === c.userTeam && p.c && p.st !== 'RET' && p.st !== 'PROSPECT') s += p.c.sal || 0; return s; };

// ---------- relationships & job security ----------
export function squadRelationship(c) {
  const l = teamPlayers(c, c.userTeam).filter(p => p.rel);
  if (!l.length) return { trust: 60, morale: 60, satisfaction: 60, unhappy: [] };
  const avg = k => round1(l.reduce((a, p) => a + p.rel[k], 0) / l.length);
  return { trust: avg('tr'), respect: avg('rs'), morale: avg('mo'), satisfaction: avg('sat'), unhappy: l.filter(p => p.rel.sat < 35 || p.rel.mo < 35).sort((a, b) => a.rel.sat - b.rel.sat).slice(0, 5).map(p => p.id) };
}
export function jobSecurity(spec, c) {
  if (c.role === 'PLAYER' || !c.userTeam) return null;
  const x = c.x, trust = c.board.confidence, obj = trackObjectives(spec, c), squad = squadRelationship(c);
  const onTrack = obj.length ? obj.filter(o => o.onTrack).length / obj.length : 1;
  const score = clamp(trust * 0.58 + onTrack * 100 * 0.2 + squad.trust * 0.1 + x.rep * 0.12, 0, 100);
  const level = score >= 55 ? 'SAFE' : score >= 38 ? 'WARM' : 'HOT';
  x.coach.security = Math.round(score); x.coach.fireWatch = level;
  return { score: Math.round(score), level, label: { SAFE: 'Emprego seguro', WARM: 'Diretoria preocupada', HOT: 'Cadeira quente' }[level], trust: Math.round(trust), onTrack: Math.round(onTrack * 100), squad: Math.round(squad.trust), rep: x.rep };
}
// Mid-season check (called weekly). Returns the reason when the board pulls the plug.
export function midSeasonFiring(spec, c) {
  if (c.role === 'PLAYER' || c.fired || !c.userTeam) return null;
  const st = c.standings[c.userTeam], gp = st.w + st.l + st.t + (st.otl || 0);
  if (gp < spec.calendar.games * 0.45) return null;
  if (c.board.confidence < 9 * difficultyOf(c).boardPatience && winPct(st) < 0.3) return `Confiança da diretoria em ${Math.round(c.board.confidence)} e campanha de ${st.w}-${st.l}.`;
  return null;
}
// Season-end firing rule: board trust + results + objectives.
export function shouldFire(spec, c, score) {
  const x = c.x, st = c.standings[c.userTeam], wp = winPct(st), exp = EXPECT[teamOf(c, c.userTeam)?.mode || 'middle'];
  const trust = c.board.confidence, patience = difficultyOf(c).boardPatience, failed = c.goals.filter(g => g.status === 'failed').length;
  const first = x.coach.seasons < 1;
  const th = 18 / patience * (first ? 0.6 : 1);
  if (trust < th) return `Confiança da diretoria esgotada (${Math.round(trust)}).`;
  if (wp < exp - 0.22 && trust < 42 / patience) return `Temporada desastrosa (${st.w}-${st.l}) e diretoria sem paciência.`;
  if (failed >= 2 && score < -0.35 && trust < 32 / patience && x.coach.bad >= 1) return 'Metas da diretoria fracassadas por duas temporadas seguidas.';
  if (x.coach.contract.yrs <= 1 && trust < 38 / patience && failed >= 2) return 'Contrato não renovado: objetivos não cumpridos.';
  return null;
}
// ---------- season end ----------
export function seasonEndCoach(spec, c, score) {
  const x = c.x; if (c.role === 'PLAYER' || !c.userTeam || !x.coach) return { fired: false };
  const st = c.standings[c.userTeam], wp = winPct(st), mode = teamOf(c, c.userTeam)?.mode || 'middle', exp = EXPECT[mode];
  const made = c.playoffs?.seeds && Object.values(c.playoffs.seeds).some(s => s.includes(c.userTeam)), champ = c.playoffs?.champion === c.userTeam;
  const dRep = (wp - exp) * 38 + (made ? 3 : -1) + (champ ? 9 : 0) + score * 3;
  x.rep = clamp(Math.round(x.rep + dRep), 0, 100);
  if (score < 0) x.coach.bad++; else x.coach.bad = 0;
  const mand = x.owner.mandate;
  if (mand && !mand.met) {
    const reached = mand.key === 'title' ? champ : mand.key === 'playoffs' ? made : made && (c.history.seasons.at(-1)?.s ?? 0) >= mand.from;
    if (reached) { mand.met = true; c.board.confidence = clamp(c.board.confidence + 8, 0, 100); news(c, `Meta de longo prazo cumprida: ${mand.text}.`, 'good'); }
    else if (c.season >= mand.by) { c.board.confidence = clamp(c.board.confidence - 6, 0, 100); mand.by = c.season + 2; mand.missed = (mand.missed || 0) + 1; }
  }
  const reason = shouldFire(spec, c, score);
  x.coach.seasons++; x.coach.contract.yrs = Math.max(0, x.coach.contract.yrs - 1);
  x.coach.history.push({ s: c.season, team: c.userTeam, w: st.w, l: st.l, rep: x.rep, trust: Math.round(c.board.confidence), made: !!made, champ: !!champ });
  let fired = false;
  if (reason) { fired = true; fireUser(spec, c, reason); }
  else if (x.coach.contract.yrs <= 0) renewContract(spec, c);
  return { fired, reason, rep: x.rep };
}
function renewContract(spec, c) {
  const x = c.x, pres = x.meta[c.userTeam]?.prestige ?? 50;
  if (c.board.confidence >= 45) { x.coach.contract = { team: c.userTeam, sal: contractSalary(spec, x.rep, pres), yrs: 3, since: c.season + 1 }; news(c, `Contrato renovado por 3 anos (${x.coach.contract.sal}M/ano).`, 'good'); }
  else { x.coach.contract.yrs = 1; news(c, 'A diretoria só estende seu contrato por mais 1 ano.', 'info'); }
}
export function fireUser(spec, c, reason) {
  const x = c.x; c.fired = true; x.coach.firedReason = reason; x.rep = clamp(x.rep - 8, 0, 100);
  x.coach.history.push({ s: c.season, team: c.userTeam, fired: true, reason });
  news(c, `A diretoria decidiu pela sua demissão. ${reason}`, 'bad');
  c.history.transactions.push({ s: c.season, kind: 'FIRED', text: `${c.userTeam} demite ${c.role === 'GM' ? 'o dirigente' : 'o técnico'}: ${reason}`, teams: [c.userTeam], players: [] });
  // the club needs a replacement
  const m = x.meta[c.userTeam]; m.coach = { ...m.coach, name: fictionalName(createRng(hashSeed(`${c.seed}|${c.season}|${c.userTeam}|rep`))), trust: 60, since: c.season + 1 };
}
// ---------- AI clubs: coach churn → vacancies ----------
export function aiCoachChurn(spec, c) {
  const x = c.x, rng = xr(c, 'coach-churn'), vac = [];
  const order = sortTeams(c.teams, c.standings, !!spec.usePoints).map(t => t.abbr);
  for (const t of c.teams) {
    if (t.abbr === c.userTeam) continue;
    const m = x.meta[t.abbr], st = c.standings[t.abbr], wp = winPct(st), exp = EXPECT[t.mode || 'middle'];
    m.coach.trust = clamp(m.coach.trust + (wp - exp) * 90 + (m.coach.rating - 55) * 0.1, 0, 100);
    m.coach.rep = clamp(Math.round(m.coach.rep + (wp - exp) * 30), 0, 100); m.coach.yrs = Math.max(0, m.coach.yrs - 1);
    if (m.coach.trust < 28 && rng.next() < 0.85 || (m.coach.yrs <= 0 && rng.next() < 0.3)) {
      x.market.jobs.push({ team: t.abbr, role: 'COACH', vacant: true, since: c.season, prev: m.coach.name, prestige: m.prestige, minRep: clamp(Math.round(m.prestige * 0.8 - 8), 5, 85), pay: contractSalary(spec, m.prestige, m.prestige) });
      vac.push(t.abbr);
      c.history.transactions.push({ s: c.season, kind: 'FIRED', text: `${t.abbr} demite o técnico ${m.coach.name}`, teams: [t.abbr], players: [] });
      if (t.abbr !== c.userTeam && (m.prestige >= 60 || rng.next() < 0.3)) news(c, `${t.abbr} demite o técnico ${m.coach.name}.`, 'info');
    }
    // prestige follows the table
    const r = order.indexOf(t.abbr); m.prestige = clamp(Math.round(m.prestige * 0.8 + (100 - (r / c.teams.length) * 100) * 0.2), 5, 99);
  }
  x.market.jobs = x.market.jobs.filter(j => !j.filled);
  return vac;
}
// Fills the vacancies nobody took (end of free agency).
export function fillVacancies(spec, c) {
  const x = c.x, rng = xr(c, 'fill-vac');
  for (const j of x.market.jobs) {
    if (j.filled || j.team === c.userTeam) continue;
    const m = x.meta[j.team]; m.coach = { name: fictionalName(rng), rating: clamp(Math.round(rng.normal(45 + m.prestige * 0.25, 9)), 30, 90), rep: clamp(Math.round(rng.normal(35 + m.prestige * 0.3, 10)), 5, 90), trust: 62, since: c.season + 1, yrs: rng.int(2, 4) };
    j.filled = true;
  }
  x.market.jobs = x.market.jobs.filter(j => !j.filled);
}
// Offers the user receives (reputation driven). Fired users always get a few; employed users with high reputation get poached offers.
export function refreshOffers(spec, c) {
  const x = c.x; if (c.role === 'PLAYER' || !c.userTeam) return [];
  const rng = xr(c, 'offers'), diff = difficultyOf(c), cur = x.meta[c.userTeam].prestige, offers = [];
  const jobs = x.market.jobs.filter(j => !j.filled && j.team !== c.userTeam);
  for (const j of jobs) { const need = j.minRep / diff.offers; if (x.rep >= need && rng.next() < 0.7) offers.push({ team: j.team, name: teamOf(c, j.team)?.name || j.team, role: c.role, kind: 'VACANT', sal: j.pay, yrs: 3, prestige: j.prestige, why: `Vaga aberta (exige reputação ${Math.round(need)}).` }); }
  if (!c.fired && x.rep >= 62) {
    const better = c.teams.filter(t => t.abbr !== c.userTeam && x.meta[t.abbr].prestige >= cur + 6 && x.meta[t.abbr].prestige <= 60 + x.rep * 0.4).sort((a, b) => x.meta[b.abbr].prestige - x.meta[a.abbr].prestige);
    for (const t of better.slice(0, 2)) if (rng.next() < 0.45 * diff.offers) offers.push({ team: t.abbr, name: t.name, role: c.role, kind: 'POACH', sal: contractSalary(spec, x.rep, x.meta[t.abbr].prestige), yrs: 4, prestige: x.meta[t.abbr].prestige, why: `${t.name} quer você pelo trabalho recente (reputação ${x.rep}).` });
  }
  if (c.fired && offers.length < 3) { // the weakest clubs always take a fired coach
    const weak = sortTeams(c.teams, c.standings, !!spec.usePoints).reverse().filter(t => t.abbr !== c.userTeam && !offers.some(o => o.team === t.abbr)).slice(0, 3 - offers.length);
    for (const t of weak) offers.push({ team: t.abbr, name: t.name, role: c.role, kind: 'REBUILD', sal: contractSalary(spec, Math.max(10, x.rep - 15), x.meta[t.abbr].prestige), yrs: 2, prestige: x.meta[t.abbr].prestige, why: 'Projeto de reconstrução, sem cobrança imediata.' });
  }
  x.market.offers = offers.slice(0, 5);
  return x.market.offers;
}
export function jobMarket(spec, c) {
  const x = c.x;
  return {
    rep: x.rep, fired: c.fired, offers: x.market.offers,
    vacancies: x.market.jobs.filter(j => !j.filled).map(j => ({ ...j, name: teamOf(c, j.team)?.name || j.team, canApply: x.rep >= j.minRep / difficultyOf(c).offers })),
    teams: c.teams.map(t => ({ abbr: t.abbr, name: t.name, prestige: x.meta[t.abbr].prestige, coach: x.meta[t.abbr].coach.name, coachRating: x.meta[t.abbr].coach.rating, trust: Math.round(x.meta[t.abbr].coach.trust), vacant: x.market.jobs.some(j => j.team === t.abbr && !j.filled) })),
  };
}
export function applyForJob(spec, c, abbr) {
  const x = c.x, j = x.market.jobs.find(v => v.team === abbr && !v.filled); if (!j) return { ok: false, text: 'Não há vaga aberta nesse clube.' };
  const need = j.minRep / difficultyOf(c).offers;
  if (x.rep < need) return { ok: false, text: `Reputação insuficiente (${x.rep} < ${Math.round(need)}).` };
  const p = clamp(0.35 + (x.rep - need) / 60, 0.2, 0.95), rng = xr(c, `apply-${abbr}`);
  if (rng.next() > p) return { ok: false, text: `${abbr} escolheu outro candidato.` };
  return { ok: true, text: `${abbr} aceita você como ${c.role === 'GM' ? 'dirigente' : 'técnico'}.`, offer: { team: abbr, name: teamOf(c, abbr)?.name, sal: j.pay, yrs: 3 } };
}
export function acceptOffer(spec, c, abbr) {
  const x = c.x, offer = x.market.offers.find(o => o.team === abbr), job = x.market.jobs.find(v => v.team === abbr && !v.filled);
  if (!offer && !job) return { ok: false, text: 'Oferta inexistente.' };
  const sal = offer?.sal ?? job.pay, yrs = offer?.yrs ?? 3;
  return takeJob(spec, c, abbr, { sal, yrs });
}
export function takeJob(spec, c, abbr, terms = {}) {
  const x = c.x, old = c.userTeam;
  if (!x.meta[abbr]) return { ok: false, text: 'Clube inexistente.' };
  if (old) { const m = x.meta[old]; if (!x.market.jobs.some(j => j.team === old)) x.market.jobs.push({ team: old, role: c.role, vacant: true, since: c.season, prev: x.coach?.name, prestige: m.prestige, minRep: clamp(Math.round(m.prestige * 0.8 - 8), 5, 85), pay: contractSalary(spec, m.prestige, m.prestige) }); }
  x.market.jobs = x.market.jobs.filter(j => j.team !== abbr);
  c.userTeam = abbr; c.fired = false; c.board = { confidence: 55, patience: 2 };
  for (const p of teamPlayers(c, old || '__')) { p.rel = null; p.userRole = null; }
  const rng = rngFor(c, `job-${abbr}`); for (const p of teamPlayers(c, abbr)) p.rel ||= { tr: 50 + rng.int(-8, 8), rs: 50 + rng.int(-8, 8), mo: 60 + rng.int(-10, 10), sat: 60 };
  x.coach = { ...(x.coach || {}), name: x.coach?.name || c.name, role: c.role, contract: { team: abbr, sal: terms.sal ?? contractSalary(spec, x.rep, x.meta[abbr].prestige), yrs: terms.yrs ?? 3, since: c.season }, seasons: 0, bad: 0, fireWatch: 'SAFE', security: 70, firedReason: null };
  x.market.offers = [];
  x.fin.cash = round1(x.fin.cash * 0.2 + (spec.cap?.limit || 200) * 0.18); // new club, new books
  if (c.role === 'COACH') { x.tac = spec.v3.tacticsDefault(spec, c, abbr); }
  setMandate(spec, c);
  if (c.role === 'COACH') for (const m of x.staff.hired) m.yrs = Math.max(m.yrs, 1);
  c.history.transactions.push({ s: c.season, kind: 'JOB', text: `${c.name} assume o ${teamOf(c, abbr)?.name}`, teams: [abbr], players: [] });
  return { ok: true, text: `Novo emprego: ${teamOf(c, abbr)?.name}.` };
}
// Contract negotiation with the board: higher reputation = better terms; low trust = short deals.
export function negotiateContract(spec, c, { sal, yrs }) {
  const x = c.x, base = contractSalary(spec, x.rep, x.meta[c.userTeam].prestige), trust = c.board.confidence;
  if (trust < 35) return { ok: false, text: 'A diretoria não quer conversar sobre extensão agora.' };
  if (sal > base * (1 + (trust - 50) / 200 + 0.08)) return { ok: false, text: `A diretoria oferece no máximo ${round1(base * 1.08)}M.`, counter: { sal: round1(base * 1.05), yrs: 3 } };
  x.coach.contract = { team: c.userTeam, sal: round1(sal), yrs: clamp(Math.round(yrs), 1, 5), since: c.season };
  return { ok: true, text: `Contrato: ${round1(sal)}M por ${x.coach.contract.yrs} anos.` };
}
