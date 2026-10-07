// Staff: coordinators / assistants / scouts / medical. Ratings (0-100) change training, development, injuries, tactics, scouting.
// Roles come from the sport rules (spec.v3.staffRoles). The user's staff is real (hire / fire); AI teams use meta[abbr].staffQ.
import { createRng, hashSeed } from '../rng/rng.js';
import { fictionalName } from './people.js';
import { clamp, round1, hash01 } from './kit.js';

const TRAITS = ['Desenvolvedor de jovens', 'Estrategista', 'Motivador', 'Disciplinador', 'Analítico', 'Veterano respeitado'];
export const staffCost = rating => Math.round((0.25 + Math.pow(Math.max(0, rating - 35) / 60, 1.8) * 2.6) * 100) / 100; // M / year (scaled by the sport in salaryScale)
const scale = spec => spec.salary.max / 30;
export function newStaffMember(spec, role, rng, id, { lo = 38, hi = 85 } = {}) {
  const rating = clamp(Math.round(rng.normal((lo + hi) / 2, 11)), lo, hi);
  return { id, role: role.key, name: fictionalName(rng), rating, age: rng.int(34, 66), sal: round1(staffCost(rating) * scale(spec)), yrs: 0, trait: rng.pick(TRAITS), pot: clamp(rating + rng.int(-3, 8), 30, 95) };
}
export function initStaff(spec, c) {
  const x = c.x, rng = createRng(hashSeed(`${c.seed}-staff-init`));
  x.staff = { hired: [], market: [], marketSeason: null };
  if (c.role === 'PLAYER') return;
  for (const role of spec.v3.staffRoles) for (let i = 0; i < Math.min(role.slots, role.group === 'scout' ? 2 : 1); i++) {
    const m = newStaffMember(spec, role, rng, `st-0-${role.key}-${i}`, { lo: 40, hi: 66 }); m.yrs = rng.int(1, 3); x.staff.hired.push(m);
  }
  refreshStaffMarket(spec, c);
}
// New free-agent staff every offseason (deterministic per season).
export function refreshStaffMarket(spec, c) {
  const x = c.x; if (x.staff.marketSeason === c.season) return;
  const rng = createRng(hashSeed(`${c.seed}-staff-market-${c.season}`));
  x.staff.market = [];
  for (const role of spec.v3.staffRoles) for (let i = 0; i < 5; i++) x.staff.market.push(newStaffMember(spec, role, rng, `st-${c.season}-${role.key}-m${i}`));
  x.staff.marketSeason = c.season;
}
export const staffByRole = (c, key) => c.x.staff.hired.filter(m => m.role === key);
export const staffPayroll = c => round1(c.x.staff.hired.reduce((a, m) => a + m.sal, 0));
export function hireStaff(spec, c, candidateId, { yrs = 2, replaceId } = {}) {
  const x = c.x; if (c.role === 'PLAYER') return { ok: false, text: 'Jogadores não contratam comissão técnica.' };
  const cand = x.staff.market.find(m => m.id === candidateId); if (!cand) return { ok: false, text: 'Candidato indisponível.' };
  const role = spec.v3.staffRoles.find(r => r.key === cand.role), cur = staffByRole(c, cand.role);
  if (cur.length >= role.slots) { if (!replaceId) return { ok: false, text: `Vagas de ${role.label} cheias (${role.slots}). Informe quem substituir ou demita alguém.` }; const r = fireStaff(spec, c, replaceId); if (!r.ok) return r; }
  const budget = x.fin.budget.staff, spent = staffPayroll(c);
  if (spent + cand.sal > budget + 0.001) return { ok: false, text: `Orçamento de comissão estourado (${round1(spent + cand.sal)}M > ${budget}M).` };
  x.staff.market = x.staff.market.filter(m => m !== cand);
  x.staff.hired.push({ ...cand, yrs: clamp(Math.round(yrs), 1, 5), since: c.season });
  bustStaffFx(c);
  c.history.transactions.push({ s: c.season, kind: 'STAFF', text: `${c.userTeam} contrata ${cand.name} (${role.label}, ${cand.rating})`, teams: [c.userTeam], players: [] });
  return { ok: true, text: `${cand.name} contratado como ${role.label}.`, member: cand };
}
export function fireStaff(spec, c, id) {
  const x = c.x, m = x.staff.hired.find(s => s.id === id); if (!m) return { ok: false, text: 'Membro não encontrado.' };
  const sev = round1(m.sal * Math.max(0, m.yrs - 1) * 0.5);
  x.fin.cash = round1(x.fin.cash - sev);
  x.staff.hired = x.staff.hired.filter(s => s !== m); bustStaffFx(c);
  c.history.transactions.push({ s: c.season, kind: 'STAFF', text: `${c.userTeam} dispensa ${m.name} (${m.role})${sev ? ` — multa ${sev}M` : ''}`, teams: [c.userTeam], players: [] });
  return { ok: true, text: `${m.name} dispensado${sev ? ` (multa ${sev}M)` : ''}.`, severance: sev };
}
// Contract years tick at the end of each season; expiring staff leave (the user can re-hire from the market).
export function staffSeasonEnd(spec, c) {
  const x = c.x, left = [];
  for (const m of x.staff.hired) { m.yrs--; m.age++; m.rating = clamp(m.rating + (m.age < 45 ? 1 : m.age > 62 ? -1 : 0), 30, 95); }
  x.staff.hired = x.staff.hired.filter(m => { if (m.yrs <= 0) { left.push(m); return false; } return true; });
  for (const m of left) x.staff.market.push({ ...m, yrs: 0 });
  bustStaffFx(c);
  return left;
}

// Effects used by development / injuries / tactics / scouting. group averages in 0..100.
const CACHE = new WeakMap();
export const bustStaffFx = c => CACHE.delete(c);
export function groupRating(c, abbr, group) {
  const spec = c._spec, x = c.x, user = abbr === c.userTeam && c.role !== 'PLAYER';
  if (user) {
    const l = x.staff.hired.filter(m => spec.v3.staffRoles.find(r => r.key === m.role)?.group === group);
    return l.length ? l.reduce((a, m) => a + m.rating, 0) / l.length : 35;
  }
  const q = x.meta[abbr]?.staffQ ?? 50;
  return clamp(q + (hash01(`${abbr}|${group}`) - 0.5) * 24, 25, 90);
}
export function staffFx(spec, c, abbr = c.userTeam) {
  const x = c.x; let m = CACHE.get(c); if (!m || m.day !== x.cal.day) { m = { day: x.cal.day, fx: {} }; CACHE.set(c, m); }
  if (m.fx[abbr]) return m.fx[abbr];
  const meta = x.meta[abbr], fac = meta?.fac || {};
  const q = g => groupRating(c, abbr, g);
  const headCoach = abbr === c.userTeam && c.role === 'COACH' ? 38 + x.rep * 0.45 : (meta?.coach?.rating ?? 50);
  const dev = 1 + (q('dev') - 50) / 50 * 0.18 + ((fac.training ?? 2) - 2) * 0.035 + (headCoach - 50) / 50 * 0.05;
  const med = (q('med') - 50) / 50 * 0.6 + ((fac.medical ?? 2) - 2) * 0.12;
  const r2 = v => Math.round(v * 100) / 100;
  return (m.fx[abbr] = { dev: r2(dev), med: r2(med), injuryMult: r2(1 - 0.3 * med), healBonus: r2(Math.max(0, med) * 0.25), offense: r2((q('offense') - 50) / 50), defense: r2((q('defense') - 50) / 50), special: r2((q('special') - 50) / 50), scout: Math.round(q('scout')), head: Math.round(headCoach) });
}
