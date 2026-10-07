// People systems shared by the careers (sport numbers come from the spec):
// CareerDevelopment (age curve, potential, training focus, playing time), CareerInjuries (per-game risk, durations),
// CareerContracts (market value, asks, negotiation, payroll / cap), trade value (age, potential, contract surplus,
// positional need, team mode — not only OVR), CareerRelationships (trust, respect, morale, role satisfaction),
// draft classes (fictional prospects, clearly labelled) and retirements.
import { createRng, hashSeed } from '../rng/rng.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const round1 = v => Math.round(v * 10) / 10;

// ---------- development ----------
export function ageFactor(spec, age) {
  const { growthEnd, peakEnd, decline } = spec.ageCurve; // e.g. NHL 24 / 30 / 1.6 per year
  if (age <= growthEnd) return 1;
  if (age <= peakEnd) return 0.2;
  return -decline * (1 + (age - peakEnd) * 0.15);
}
// Season-end progression. focus/pt (0..1 playing time) and work ethic shift the outcome; potential caps the ceiling.
export function progressSeason(spec, p, rng, { pt = 0.5, focus = 0 } = {}) {
  const f = ageFactor(spec, p.age);
  const room = Math.max(0, p.pot - p.ovr);
  let d;
  if (f > 0.5) d = room * (0.18 + 0.12 * pt + 0.05 * focus) + rng.normal(0, 1.6);
  else if (f > 0) d = Math.min(room, 1.2) * (0.5 + pt * 0.5) + rng.normal(0, 1.1);
  else d = f + rng.normal(0, 1.0);
  const before = p.ovr;
  p.ovr = clamp(Math.round(p.ovr + d), 30, 99);
  if (p.ovr > p.pot) p.pot = p.ovr;
  if (f <= 0) p.pot = Math.max(p.ovr, p.pot - 1);
  p.dv = p.ovr - before;
  return p.dv;
}
// Small in-season growth for young players with a training focus (called per slate).
export function trainTick(spec, p, rng, intensity = 1) {
  if (p.age > spec.ageCurve.growthEnd || p.ovr >= p.pot) return 0;
  if (rng.next() < 0.012 * intensity * (1 + (p.pot - p.ovr) / 20)) { p.ovr++; p.dv = (p.dv || 0) + 1; return 1; }
  return 0;
}

// ---------- injuries ----------
export function rollInjuries(spec, players, rng, settings = {}) {
  const out = [];
  const rate = spec.injuries.perPlayerGame * (settings.injuryRate ?? 1);
  for (const p of players) {
    if (p.inj || p.st !== 'ACT') continue;
    if (rng.next() < rate * (p.age > 31 ? 1.25 : 1)) {
      const [type, lo, hi] = rng.pick(spec.injuries.table);
      p.inj = { type, games: rng.int(lo, hi) };
      out.push(p);
    }
  }
  return out;
}
export function healTick(players) { for (const p of players) if (p.inj) { p.inj.games--; if (p.inj.games <= 0) p.inj = null; } }

// ---------- contracts ----------
// Market value (millions / year) from OVR, age and position premium; spec.salary = { min, max, star, curve }.
export function marketValue(spec, p) {
  const s = spec.salary;
  const prem = spec.positionPremium?.[p.pos] ?? 1;
  const q = clamp((p.ovr - s.floorOvr) / (99 - s.floorOvr), 0, 1);
  const ageAdj = p.age < 24 ? 0.9 : p.age > 32 ? 0.75 : 1;
  return round1(clamp(s.min + (s.max - s.min) * Math.pow(q, s.curve) * prem * ageAdj, s.min, s.max));
}
export function estimateContract(spec, p, rng) {
  const v = marketValue(spec, p);
  const yrs = p.age < 26 ? rng.int(2, 5) : p.age < 31 ? rng.int(2, 4) : rng.int(1, 2);
  return { sal: round1(v * (0.85 + rng.next() * 0.3)), yrs, kind: 'VET', est: true };
}
export function payroll(players, team) { return round1(players.filter(p => p.t === team && p.c && p.st !== 'RET' && p.st !== 'PROSPECT').reduce((a, p) => a + (p.c.sal || 0), 0)); }
export function capSpace(spec, players, team) { return spec.cap ? round1(spec.cap.limit - payroll(players, team)) : Infinity; }
// What a player asks (re-sign / free agency): market value × mood (morale, loyalty) × leverage (FA, other offers).
export function contractAsk(spec, p, { freeAgent = false } = {}) {
  const v = marketValue(spec, p), mood = p.rel ? (100 - p.rel.mo) / 400 : 0, loyal = (p.pers?.loyal ?? 50) / 500;
  const sal = round1(v * (1 + (freeAgent ? 0.08 : 0) + mood - loyal));
  const yrs = p.age < 27 ? 4 : p.age < 31 ? 3 : p.age < 34 ? 2 : 1;
  return { sal: Math.max(spec.salary.min, sal), yrs };
}
// Negotiation: accept if offer ≥ ask × tolerance; counter otherwise; repeated lowballs hurt trust.
export function negotiate(spec, p, offer, ask = contractAsk(spec, p)) {
  const ratio = offer.sal / ask.sal, yrsOk = Math.abs(offer.yrs - ask.yrs) <= 1 || (p.age >= 30 && offer.yrs > ask.yrs);
  if (ratio >= 0.97 && yrsOk) return { ok: true, text: 'Proposta aceita.' };
  if (ratio < 0.75) { if (p.rel) p.rel.tr = clamp(p.rel.tr - 4, 0, 100); return { ok: false, text: `Proposta considerada desrespeitosa. Pede ${ask.sal}M × ${ask.yrs}.`, counter: ask }; }
  const counter = { sal: round1((offer.sal + ask.sal) / 2 + (ask.sal - offer.sal) * 0.2), yrs: ask.yrs };
  return { ok: false, text: `Contraproposta: ${counter.sal}M × ${counter.yrs} anos.`, counter };
}

// ---------- trade value (not only OVR) ----------
export function tradeValue(spec, p, team = {}) {
  const ageCurve = p.age <= 24 ? 1.15 : p.age <= 28 ? 1 : p.age <= 31 ? 0.82 : 0.6;
  const now = Math.pow(Math.max(0, p.ovr - 45) / 50, 2.2) * 100;
  const future = Math.pow(Math.max(0, p.pot - 45) / 50, 2.2) * 100;
  const rebuild = team.mode === 'rebuild', contend = team.mode === 'contender';
  let v = (contend ? 0.75 * now + 0.25 * future : rebuild ? 0.35 * now + 0.65 * future : 0.55 * now + 0.45 * future) * (rebuild ? (p.age <= 25 ? 1.2 : 0.75) : ageCurve);
  if (p.c && !p.c.rookie) { const surplus = (marketValue(spec, p) - p.c.sal) * Math.min(p.c.yrs, 3); v += surplus * spec.trade.surplusWeight; }
  if (team.need?.[spec.posGroup(p.pos)]) v *= 1.15;
  if (p.inj) v *= p.inj.games > 20 ? 0.6 : 0.9;
  return Math.max(0, round1(v));
}
// AI decision: value received vs given, with a margin from difficulty; checks cap/roster through spec.validateTrade.
export function evaluateTrade(spec, ctx, { give, get, aiTeam, difficulty = 1 }) {
  const team = ctx.teamInfo(aiTeam);
  const recv = give.reduce((a, p) => a + tradeValue(spec, p, team), 0), send = get.reduce((a, p) => a + tradeValue(spec, p, team), 0);
  const need = send * (1.05 + 0.1 * difficulty) + 2;
  const legal = spec.validateTrade ? spec.validateTrade(ctx, { give, get, aiTeam }) : null;
  if (legal) return { ok: false, recv, send, text: legal };
  if (recv >= need) return { ok: true, recv, send, text: `${aiTeam} aceita a troca.` };
  const gap = need - recv;
  return { ok: false, recv, send, text: `${aiTeam} recusa: ${gap > send * 0.5 ? 'valor muito abaixo' : 'falta um pouco de valor'} (${round1(recv)} por ${round1(send)}).` };
}

// ---------- relationships ----------
export function newRelation(rng) { return { tr: 50 + rng.int(-8, 8), rs: 50 + rng.int(-8, 8), mo: 60 + rng.int(-10, 10), sat: 60 }; }
// expectedRole: what the player believes he deserves (S starter / R rotation / B bench); role: what he gets.
export function relationTick(p, { expected, role, teamWon, promise }) {
  const r = p.rel; if (!r) return;
  const rank = { S: 2, R: 1, B: 0 };
  const gap = rank[role] - rank[expected];
  r.sat = clamp(r.sat + (gap >= 0 ? 0.8 : gap === -1 ? -1.2 : -2.4), 0, 100);
  r.mo = clamp(r.mo + (teamWon ? 0.7 : -0.6) + (r.sat - 50) / 120, 0, 100);
  if (promise && promise.until <= 0) { r.tr = clamp(r.tr + (rank[role] >= rank[promise.role] ? 6 : -10), 0, 100); p.promise = null; }
}
export function talk(p, kind, rng, coachRep = 50) {
  const r = p.rel; if (!r) return { text: '' };
  const ego = p.pers?.ego ?? 50, roll = rng.next() * 100;
  switch (kind) {
    case 'praise': r.mo = clamp(r.mo + 4, 0, 100); r.tr = clamp(r.tr + 2, 0, 100); return { text: `${p.n} gostou do elogio.` };
    case 'criticize': if (roll > ego) { r.mo = clamp(r.mo + 2, 0, 100); r.rs = clamp(r.rs + 3, 0, 100); return { text: `${p.n} aceitou a crítica e promete reagir.` }; } r.mo = clamp(r.mo - 6, 0, 100); r.tr = clamp(r.tr - 5, 0, 100); return { text: `${p.n} não reagiu bem à crítica.` };
    case 'promise': p.promise = { role: 'S', until: 10 }; r.tr = clamp(r.tr + 3, 0, 100); r.sat = clamp(r.sat + 5, 0, 100); return { text: `Você prometeu mais espaço para ${p.n} (10 jogos).` };
    case 'motivate': if (roll < 40 + coachRep / 2) { r.mo = clamp(r.mo + 6, 0, 100); return { text: `${p.n} saiu motivado da conversa.` }; } return { text: `${p.n} ouviu, mas segue desconfiado.` };
    default: return { text: '' };
  }
}

// ---------- names for fictional prospects (seeded; never presented as real people) ----------
const SYL_F = ['Ja', 'Ma', 'Lu', 'Ca', 'De', 'Ri', 'Tre', 'Ni', 'Jo', 'Ky', 'Bra', 'Da', 'El', 'Ro', 'Ty', 'Ma', 'Ze', 'Ad', 'Is', 'No'];
const SYL_F2 = ['son', 'lin', 'ron', 'den', 'vin', 'ler', 'ric', 'yan', 'mar', 'co', 'lo', 'el', 'ah', 'ton', 'dre', 'ius', 'en', 'is'];
const SYL_L = ['Har', 'Bel', 'Cor', 'Dun', 'Fen', 'Gal', 'Hol', 'Kes', 'Lan', 'Mor', 'Nor', 'Pell', 'Quin', 'Ros', 'Sted', 'Tor', 'Var', 'Wel', 'Yor', 'Ash'];
const SYL_L2 = ['ley', 'ford', 'man', 'son', 'ridge', 'well', 'ton', 'by', 'wick', 'ham', 'stone', 'field', 'er', 'ard', 'ock', 'ins'];
export function fictionalName(rng) { return `${rng.pick(SYL_F)}${rng.pick(SYL_F2)} ${rng.pick(SYL_L)}${rng.pick(SYL_L2)}`; }

// ---------- draft class ----------
export function draftClass(spec, { year, seed, size }) {
  const rng = createRng(hashSeed(`${seed}-draft-${year}`));
  const out = [];
  for (let i = 0; i < size; i++) {
    const pos = rng.pick(spec.draft.positions);
    const pot = clamp(Math.round(rng.normal(spec.draft.potMean, spec.draft.potSd)), 45, 97);
    const ovr = clamp(Math.round(pot - Math.abs(rng.normal(spec.draft.gapMean, spec.draft.gapSd))), 35, pot);
    out.push({ id: `${spec.sport}-dp-${year}-${i}`, n: fictionalName(rng), pos, age: rng.int(spec.draft.ageMin, spec.draft.ageMax), ovr, pot, t: 'DRAFT', st: 'PROSPECT', syn: true, fict: true, num: '', pers: persona(rng), scout: rng.int(4, 12) });
  }
  return out.sort((a, b) => (b.pot * 0.65 + b.ovr * 0.35) - (a.pot * 0.65 + a.ovr * 0.35));
}
export function persona(rng) { return { ego: rng.int(15, 90), loyal: rng.int(15, 90), amb: rng.int(15, 90), work: rng.int(25, 95) }; }

// ---------- retirement ----------
export function retires(spec, p, rng) {
  if (p.age < spec.ageCurve.retireMin) return false;
  const pr = clamp((p.age - spec.ageCurve.retireMin) * 0.12 + (70 - p.ovr) * 0.02, 0.02, 0.95);
  return rng.next() < pr;
}
