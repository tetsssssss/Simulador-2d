// GM / "dirigente" systems: finance (budget, cash, luxury tax), facilities (levels with cost and effects), scouting with fog of war
// (ratings revealed progressively with uncertainty), contract wrappers that respect cap and roster rules, and sport actions.
import { teamPlayers, teamOf, news, signFreeAgent as coreSign, extendContract as coreExtend, releasePlayer as coreRelease, contractAsk, negotiate, freeAgents } from './careerCore.js';
import { payroll } from './people.js';
import { FACILITIES, teamPayroll } from './x.js';
import { staffPayroll, staffFx } from './staff.js';
import { clamp, round1, hash01, difficultyOf } from './kit.js';

// ---------- finance ----------
const SEASON_DAYS = 300;
export function financeGate(spec, c) {
  const x = c.x, abbr = c.userTeam; if (!abbr || c.role === 'PLAYER') return;
  const meta = x.meta[abbr], ref = spec.cap?.limit || 200, fan = (x.prel?.fans ?? 50) / 100, stadium = 1 + (meta.fac.stadium - 2) * 0.06;
  const gate = (ref * 0.62 * meta.mkt * stadium * (0.7 + 0.6 * fan)) / Math.max(8, spec.calendar.games / 2);
  x.fin.rev = Math.round((x.fin.rev + gate) * 100) / 100; x.fin.cash = Math.round((x.fin.cash + gate) * 100) / 100;
}
export function financeDay(spec, c) {
  const x = c.x, abbr = c.userTeam; if (!abbr || c.role === 'PLAYER') return;
  const meta = x.meta[abbr], ref = spec.cap?.limit || 200;
  const tv = (ref * 1.05 * meta.mkt) / SEASON_DAYS;
  const pay = teamPayroll(c, abbr) / SEASON_DAYS, staff = staffPayroll(c) / SEASON_DAYS, fac = (ref * 0.018 * (1 + (meta.fac.training + meta.fac.medical + meta.fac.scouting + meta.fac.youth + meta.fac.stadium) / 12)) / SEASON_DAYS;
  const rev = tv, exp = pay + staff + fac;
  x.fin.rev = Math.round((x.fin.rev + rev) * 100) / 100; x.fin.exp = Math.round((x.fin.exp + exp) * 100) / 100;
  x.fin.cash = Math.round((x.fin.cash + rev - exp) * 100) / 100;
}
export function financeSeasonEnd(spec, c) {
  const x = c.x, abbr = c.userTeam; if (!abbr || c.role === 'PLAYER') return null;
  const pay = teamPayroll(c, abbr), over = spec.cap?.kind === 'tax' ? Math.max(0, pay - spec.cap.limit) : 0, tax = round1(over * 0.2);
  const po = c.playoffs?.seeds && Object.values(c.playoffs.seeds).some(s => s.includes(abbr)) ? (spec.cap?.limit || 200) * 0.03 : 0;
  x.fin.cash = round1(x.fin.cash - tax + po);
  const sum = { s: c.season, rev: round1(x.fin.rev + po), exp: round1(x.fin.exp + tax), tax, profit: round1(x.fin.rev + po - x.fin.exp - tax), payroll: pay, cash: x.fin.cash };
  x.fin.last = sum; x.fin.rev = 0; x.fin.exp = 0; x.fin.tax = tax;
  const meta = x.meta[abbr], ref = spec.cap?.limit || 200;
  x.fin.budget.payroll = round1(clamp(Math.max(pay * 1.04, ref * (spec.cap?.kind === 'hard' ? 0.9 : 0.4) * (0.9 + 0.2 * meta.mkt)), 0, spec.cap?.kind === 'hard' ? spec.cap.limit : ref * 0.9));
  return sum;
}

// ---------- facilities ----------
export const FACILITY_INFO = {
  training: { label: 'Centro de treinamento', effect: 'Mais XP de treino e desenvolvimento (+3,5% por nível acima de 2)' },
  medical: { label: 'Departamento médico', effect: 'Menos lesões e recuperação mais rápida' },
  scouting: { label: 'Rede de scouting', effect: 'Revela jogadores mais rápido e com menos incerteza' },
  youth: { label: 'Academia de base', effect: 'Melhora o potencial dos prospectos e a classe do draft do clube' },
  stadium: { label: 'Estádio / arena', effect: 'Aumenta a receita de bilheteria' },
};
export const facilityCost = (spec, level) => round1(spec.salary.max * 0.4 * Math.pow(level, 1.5));
export function upgradeFacility(spec, c, key) {
  const x = c.x, abbr = c.userTeam; if (!abbr || c.role === 'PLAYER') return { ok: false, text: 'Sem clube para investir.' };
  if (!FACILITIES.includes(key)) return { ok: false, text: 'Instalação inválida.' };
  if (c.role !== 'GM') return { ok: false, text: 'Somente o dirigente decide investimentos em instalações.' };
  const meta = x.meta[abbr], cur = meta.fac[key];
  if (cur >= 5) return { ok: false, text: 'Nível máximo.' };
  if (x.fac.upgrades.some(u => u.key === key)) return { ok: false, text: 'Obra em andamento.' };
  const cost = facilityCost(spec, cur + 1), spentYear = x.fac.upgrades.reduce((a, u) => a + u.cost, 0);
  if (x.fin.cash < cost) return { ok: false, text: `Caixa insuficiente (${cost}M necessários, ${x.fin.cash}M em caixa).` };
  if (spentYear + cost > x.fin.budget.facilities * 3) return { ok: false, text: 'Acima do orçamento de instalações aprovado pelo dono.' };
  x.fin.cash = round1(x.fin.cash - cost);
  x.fac.upgrades.push({ key, to: cur + 1, cost, daysLeft: 45 * (cur + 1), start: x.cal.day });
  return { ok: true, text: `${FACILITY_INFO[key].label}: obra para o nível ${cur + 1} iniciada (${cost}M, ${45 * (cur + 1)} dias).`, cost };
}
export function facilitiesDay(spec, c) {
  const x = c.x, abbr = c.userTeam; if (!abbr) return [];
  const done = [];
  for (const u of x.fac.upgrades) { u.daysLeft--; if (u.daysLeft <= 0) { x.meta[abbr].fac[u.key] = u.to; done.push(u); } }
  if (done.length) x.fac.upgrades = x.fac.upgrades.filter(u => u.daysLeft > 0);
  return done;
}

// ---------- scouting & fog of war ----------
// know[id] = 0..100. The visible estimate is true ± err·u, with u in [-1,1] fixed per player (so it never flickers).
const MAX_ERR = { ovr: 14, pot: 18 };
export const scoutKnowledge = (c, p) => (p.t === c.userTeam || p.mine || p.t === 'RET' ? 100 : Math.min(100, (c.x.scout.know[p.id] || 0) + (p.st === 'ACT' || p.st === 'IR' ? 22 : 0)));
export function fogged(spec, c, p) {
  const know = scoutKnowledge(c, p), diff = difficultyOf(c);
  const f = (1 - know / 100) * diff.scoutNoise;
  const u1 = hash01(`${p.id}|fo`) * 2 - 1, u2 = hash01(`${p.id}|fp`) * 2 - 1;
  const eo = Math.round(MAX_ERR.ovr * f), ep = Math.round(MAX_ERR.pot * f);
  return { know: Math.round(know), exact: know >= 95, ovr: clamp(Math.round(p.ovr + u1 * eo), 30, 99), pot: clamp(Math.round(p.pot + u2 * ep), 30, 99), ovrErr: eo, potErr: ep, ovrRange: [clamp(p.ovr - eo, 30, 99), clamp(p.ovr + eo, 30, 99)], potRange: [clamp(p.pot - ep, 30, 99), clamp(p.pot + ep, 30, 99)] };
}
const SCOUT_GROUPS = ['scout'];
export function scoutsOf(spec, c) { const roles = spec.v3.staffRoles.filter(r => SCOUT_GROUPS.includes(r.group)).map(r => r.key); return c.x.staff.hired.filter(m => roles.includes(m.role)); }
export function scoutTargets(spec, c) {
  const t = [{ key: 'draft', label: 'Classe do draft' }, { key: 'fa', label: 'Agentes livres' }];
  if (spec.sport === 'mlb') t.push({ key: 'intl', label: 'Prospectos internacionais' });
  for (const team of c.teams) if (team.abbr !== c.userTeam) t.push({ key: `team:${team.abbr}`, label: `Elenco de ${team.abbr}` });
  return t;
}
export function assignScout(spec, c, scoutId, target) {
  if (!scoutsOf(spec, c).some(s => s.id === scoutId)) return { ok: false, text: 'Scout não encontrado.' };
  if (!scoutTargets(spec, c).some(t => t.key === target) && target !== null) return { ok: false, text: 'Alvo inválido.' };
  if (target == null) delete c.x.scout.assign[scoutId]; else c.x.scout.assign[scoutId] = target;
  c.x.scout.auto = false; return { ok: true, text: 'Scout reatribuído.' };
}
function poolFor(spec, c, key) {
  const all = Object.values(c.players);
  if (key === 'draft') return all.filter(p => p.st === 'PROSPECT' && p.t === 'DRAFT' && !p.mine).sort((a, b) => b.pot - a.pot);
  if (key === 'intl') return all.filter(p => p.t === 'INTL').sort((a, b) => b.pot - a.pot);
  if (key === 'fa') return all.filter(p => p.t === 'FA' && p.st === 'FA').sort((a, b) => b.ovr - a.ovr);
  if (key.startsWith('team:')) return all.filter(p => p.t === key.slice(5) && p.st !== 'RET').sort((a, b) => b.ovr - a.ovr);
  return [];
}
// One day of scouting: each scout deepens knowledge of up to 6 players of their target (best prospects first).
export function scoutingDay(spec, c) {
  const x = c.x; if (c.role === 'PLAYER' || !c.userTeam) return 0;
  const fac = x.meta[c.userTeam].fac.scouting, scouts = scoutsOf(spec, c); let n = 0;
  for (const s of scouts) {
    let target = x.scout.assign[s.id];
    if (!target) { target = s.role.includes('INTL') ? 'intl' : s.role.includes('PRO') ? 'fa' : 'draft'; if (spec.sport !== 'mlb' && target === 'intl') target = 'draft'; }
    const pool = poolFor(spec, c, target);
    const rate = (0.4 + s.rating / 100 * 1.6) * (1 + (fac - 2) * 0.12);
    let k = 0;
    for (const p of pool) {
      const cur = x.scout.know[p.id] || 0; if (cur >= 100) continue;
      x.scout.know[p.id] = Math.min(100, Math.round((cur + rate) * 10) / 10); n++;
      if (++k >= 6) break;
    }
  }
  return n;
}
export function pruneKnowledge(c) { const k = c.x.scout.know; for (const id of Object.keys(k)) if (!c.players[id]) delete k[id]; }

// ---------- contracts with cap / roster rules ----------
const issuesOf = (spec, c, abbr) => spec.v3.legality(spec, c, abbr);
export function signFree(spec, c, id, offer) {
  const p = c.players[id]; if (!p) return { ok: false, text: 'Jogador indisponível.' };
  if (c.role === 'PLAYER') return { ok: false, text: 'Somente técnico/dirigente contratam.' };
  if (spec.cap?.kind === 'hard') { const sp = spec.cap.limit - payroll(Object.values(c.players), c.userTeam); if (offer.sal > sp) return { ok: false, text: `Sem espaço no teto (${round1(sp)}M).` }; }
  const r = coreSign(spec, c, id, offer);
  if (r.ok && spec.sport === 'mlb') { p.on40 = true; p.st = 'ACT'; const act = teamPlayers(c, c.userTeam).filter(q => q.st === 'ACT'); if (act.length > spec.roster.max) { p.st = 'MIN'; p.lvl = 'AAA'; } }
  if (r.ok) c.history.transactions[c.history.transactions.length - 1].players = [id];
  return r;
}
export function extend(spec, c, id, offer) {
  const p = c.players[id];
  if (p && spec.cap?.kind === 'hard' && offer.sal > (p.c?.sal || 0)) { const sp = spec.cap.limit - payroll(Object.values(c.players), c.userTeam) + (p.expiring ? 0 : p.c?.sal || 0); if (offer.sal > sp) return { ok: false, text: `Sem espaço no teto (${round1(sp)}M).` }; }
  return coreExtend(spec, c, id, offer);
}
export function contractOffer(spec, c, id, offer) { return extend(spec, c, id, offer); }
export function release(spec, c, id) { return coreRelease(spec, c, id); }
export function freeAgentList(spec, c, { limit = 80, pos } = {}) {
  return freeAgents(c).filter(p => !pos || spec.posGroup(p.pos) === pos).sort((a, b) => b.ovr - a.ovr).slice(0, limit);
}
export function sportAction(spec, c, name, ...args) {
  const fn = spec.v3.actions?.[name];
  if (!fn) return { ok: false, text: `Ação desconhecida: ${name}` };
  if (c.role === 'PLAYER') return { ok: false, text: 'Somente técnico/dirigente.' };
  return fn(spec, c, ...args);
}
export { contractAsk, negotiate, issuesOf, staffFx, teamOf, news };
