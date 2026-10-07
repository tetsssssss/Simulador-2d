// MLB career 3.0 rules: staff, tactics (lineups vs R/L, batting order, rotation, bullpen, defensive alignment, pitching changes,
// bunts, steals, pinch hitters), created-player attributes, 26-man / 40-man legality, minor leagues (R/A/AA/AAA), options,
// service time, DFA / waivers, arbitration (spec.contractYear) and the international signing period.
import { teamPlayers, payroll } from '../../../core/career/careerCore.js';
import { createRng, hashSeed } from '../../../core/rng/rng.js';
import { fictionalName, persona } from '../../../core/career/people.js';
import { clamp, round1, xr } from '../../../core/career/kit.js';
import { staffFx } from '../../../core/career/staff.js';
import { ranked, mean, cleanIds, pickOption, pickRange, isHealthy } from '../../../core/career/rulesKit.js';

export const MLB_OPTS = {
  shift: ['nenhum', 'padrão', 'agressivo'], infield: ['normal', 'avançado', 'recuado'], outfield: ['normal', 'profundo', 'raso'],
  hook: ['paciente', 'normal', 'rápido'], bunt: ['nunca', 'situacional', 'frequente'], steal: ['raro', 'normal', 'agressivo'], pinchHit: ['raro', 'platoon', 'agressivo'],
};
const FIELD = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'], POS9 = [...FIELD, 'DH'];
const isP = p => p.pos === 'SP' || p.pos === 'RP';
const CAN = { C: ['C'], '1B': ['1B', '3B', 'DH'], '2B': ['2B', 'SS', '3B'], '3B': ['3B', 'SS', '2B', '1B'], SS: ['SS', '2B', '3B'], LF: ['LF', 'CF', 'RF'], CF: ['CF', 'LF', 'RF'], RF: ['RF', 'LF', 'CF'] };
export const LEVELS = ['R', 'A', 'AA', 'AAA'];
const levelFor = p => (p.ovr >= 62 ? 'AAA' : p.ovr >= 56 ? 'AA' : p.ovr >= 49 ? 'A' : 'R');

function autoLineup(list) {
  const hit = ranked(list.filter(p => !isP(p) && p.st === 'ACT')), used = new Set(), slots = [];
  for (const pos of FIELD) {
    const pick = hit.find(p => !used.has(p.id) && p.pos === pos) || hit.find(p => !used.has(p.id) && (CAN[pos] || []).includes(p.pos)) || hit.find(p => !used.has(p.id));
    if (pick) { used.add(pick.id); slots.push({ id: pick.id, pos }); }
  }
  const dh = hit.find(p => !used.has(p.id)); if (dh) { used.add(dh.id); slots.push({ id: dh.id, pos: 'DH' }); }
  return slots.sort((a, b) => hit.findIndex(p => p.id === a.id) - hit.findIndex(p => p.id === b.id));
}
const SCARCITY = { SP: 1.3, RP: 0.6, C: 1.2, IF: 1.0, OF: 0.95, DH: 0.8 };

export const MLB_V3 = {
  sport: 'mlb',
  staffRoles: [
    { key: 'PITCH', label: 'Treinador de arremessadores', group: 'dev', slots: 1, pos: ['SP', 'RP'] },
    { key: 'HIT', label: 'Treinador de rebatedores', group: 'offense', slots: 1 },
    { key: 'BENCH', label: 'Bench coach (tática)', group: 'defense', slots: 1 },
    { key: 'BULLPEN', label: 'Treinador do bullpen', group: 'dev', slots: 1, pos: ['RP'] },
    { key: 'BASES', label: 'Treinador de bases', group: 'special', slots: 1 },
    { key: 'DEV', label: 'Coordenador de desenvolvimento (farm)', group: 'dev', slots: 1 },
    { key: 'MED', label: 'Chefe médico / preparador', group: 'med', slots: 1 },
    { key: 'SCOUT_AMA', label: 'Scout amador (draft)', group: 'scout', slots: 3 },
    { key: 'SCOUT_INTL', label: 'Scout internacional', group: 'scout', slots: 2 },
    { key: 'SCOUT_PRO', label: 'Scout profissional', group: 'scout', slots: 1 },
  ],
  scarcity: SCARCITY,
  milestones: [{ key: 'hr20', stat: 'hr', thr: 20, label: '20 home runs' }, { key: 'hr30', stat: 'hr', thr: 30, label: '30 home runs' }, { key: 'rbi100', stat: 'rbi', thr: 100, label: '100 RBI' }, { key: 'k150', stat: 'ka', thr: 150, label: '150 strikeouts' }],
  prodOf: p => { const s = p.ps || {}; return isP(p) ? (s.outs || 0) / 6 + (s.ka || 0) / 3 - (s.ra || 0) * 2 : (s.h || 0) * 0.6 + (s.hr || 0) * 2.5 + (s.rbi || 0) * 0.8 + (s.bb || 0) * 0.3; },
  attrSets: {
    B: { contact: { label: 'Contato', w: 0.24 }, power: { label: 'Força', w: 0.2 }, eye: { label: 'Disciplina', w: 0.16 }, speed: { label: 'Velocidade', w: 0.12 }, fielding: { label: 'Defesa', w: 0.14 }, arm: { label: 'Braço', w: 0.1 }, baseIQ: { label: 'Instinto de bases', w: 0.04 } },
    P: { velocity: { label: 'Velocidade', w: 0.24 }, control: { label: 'Controle', w: 0.22 }, movement: { label: 'Movimento', w: 0.22 }, command: { label: 'Comando', w: 0.12 }, stamina: { label: 'Resistência', w: 0.1 }, composure: { label: 'Frieza', w: 0.1 } },
  },
  attrGroup: (spec, pos) => (['SP', 'RP', 'P'].includes(pos) ? 'P' : 'B'),
  heightRange: { min: 165, max: 205, unit: 'cm' }, weightRange: { min: 60, max: 140, unit: 'kg' },
  pathways: [
    { key: 'HS', label: 'High School', stage: 'AMATEUR', next: 'Draft → Ligas menores (R/A/AA/AAA) → MLB' },
    { key: 'COLLEGE', label: 'College (NCAA)', stage: 'AMATEUR', next: 'Draft → Ligas menores → MLB' },
    { key: 'INTERNATIONAL', label: 'Internacional (signing period)', stage: 'AMATEUR', next: 'Assinatura internacional → Ligas menores → MLB' },
  ],

  tacticsSchema: { defense: { shift: MLB_OPTS.shift, infield: MLB_OPTS.infield, outfield: MLB_OPTS.outfield }, pitching: { hook: MLB_OPTS.hook, pitchLimit: [75, 125] }, bunt: MLB_OPTS.bunt, steal: MLB_OPTS.steal, pinchHit: MLB_OPTS.pinchHit },
  tacticsDefault(spec, c, abbr) {
    const list = teamPlayers(c, abbr), lu = autoLineup(list), sp = ranked(list.filter(p => p.pos === 'SP' && p.st === 'ACT')).slice(0, 5), rp = ranked(list.filter(p => p.pos === 'RP' && p.st === 'ACT'));
    return {
      lineup: { vsR: lu, vsL: lu.map(s => ({ ...s })) }, rotation: sp.map(p => p.id),
      bullpen: { closer: rp[0]?.id || null, setup: rp.slice(1, 3).map(p => p.id), middle: rp.slice(3, 6).map(p => p.id), long: rp[6]?.id || null },
      defense: { shift: 'padrão', infield: 'normal', outfield: 'normal' }, pitching: { hook: 'normal', pitchLimit: 100 },
      bunt: 'situacional', steal: 'normal', pinchHit: 'platoon', intentionalWalk: false,
    };
  },
  validateTactics(spec, c, abbr, tac, patch = {}) {
    const errors = [], list = teamPlayers(c, abbr).filter(p => p.st !== 'MIN'), byId = Object.fromEntries(list.map(p => [p.id, p])), o = MLB_OPTS;
    const m = { ...tac, ...patch, lineup: { ...tac.lineup, ...patch.lineup }, bullpen: { ...tac.bullpen, ...patch.bullpen }, defense: { ...tac.defense, ...patch.defense }, pitching: { ...tac.pitching, ...patch.pitching } };
    const out = { lineup: {} };
    for (const side of ['vsR', 'vsL']) {
      const arr = Array.isArray(m.lineup[side]) ? m.lineup[side] : [], seen = new Set(), pos = new Set(), res = [];
      for (const s of arr) {
        const p = byId[s?.id];
        if (!p) { errors.push(`Lineup ${side}: jogador ${s?.id} não está no elenco ativo`); continue; }
        if (isP(p)) { errors.push(`Lineup ${side}: ${p.n} é arremessador`); continue; }
        if (seen.has(p.id)) { errors.push(`Lineup ${side}: ${p.n} repetido`); continue; }
        if (!POS9.includes(s.pos) || pos.has(s.pos)) { errors.push(`Lineup ${side}: posição ${s.pos} inválida/repetida`); continue; }
        seen.add(p.id); pos.add(s.pos); res.push({ id: p.id, pos: s.pos });
      }
      if (res.length !== 9) errors.push(`Lineup ${side}: precisa de 9 rebatedores (tem ${res.length})`);
      out.lineup[side] = res;
    }
    out.rotation = cleanIds(m.rotation, byId, 'Rotação', errors).filter(id => byId[id]?.pos === 'SP' || byId[id]?.pos === 'RP').slice(0, 5);
    if (out.rotation.length < 4) errors.push('Rotação: mínimo de 4 titulares');
    const bp = m.bullpen, one = (id, l) => { const x = cleanIds([id], byId, l, errors)[0]; return x && isP(byId[x]) ? x : null; };
    out.bullpen = { closer: one(bp.closer, 'Closer'), setup: cleanIds(bp.setup, byId, 'Setup', errors).slice(0, 3), middle: cleanIds(bp.middle, byId, 'Bullpen', errors).slice(0, 4), long: one(bp.long, 'Long man') };
    out.defense = { shift: pickOption(m.defense.shift, o.shift, 'padrão', 'Shift', errors), infield: pickOption(m.defense.infield, o.infield, 'normal', 'Infield', errors), outfield: pickOption(m.defense.outfield, o.outfield, 'normal', 'Outfield', errors) };
    out.pitching = { hook: pickOption(m.pitching.hook, o.hook, 'normal', 'Troca de arremessador', errors), pitchLimit: pickRange(m.pitching.pitchLimit, 75, 125, 100, 'Limite de arremessos', errors) };
    out.bunt = pickOption(m.bunt, o.bunt, 'situacional', 'Bunt', errors); out.steal = pickOption(m.steal, o.steal, 'normal', 'Roubo de base', errors); out.pinchHit = pickOption(m.pinchHit, o.pinchHit, 'platoon', 'Pinch hitter', errors);
    out.intentionalWalk = !!m.intentionalWalk;
    return { ok: errors.length === 0, errors, tac: out };
  },
  reconcileTactics(spec, c, abbr, tac) {
    const list = teamPlayers(c, abbr).filter(p => p.st === 'ACT'), byId = Object.fromEntries(list.map(p => [p.id, p])), changes = [];
    const bad = id => !byId[id] || !isHealthy(byId[id]);
    const auto = autoLineup(list.filter(isHealthy));
    for (const side of ['vsR', 'vsL']) {
      const cur = tac.lineup[side] || [];
      if (cur.length === 9 && !cur.some(s => bad(s.id))) continue;
      const used = new Set(cur.filter(s => !bad(s.id)).map(s => s.id)), keep = cur.filter(s => !bad(s.id));
      const bench = ranked(list.filter(p => !isP(p) && isHealthy(p) && !used.has(p.id)));
      for (const s of cur) if (bad(s.id)) { const sub = bench.find(p => p.pos === s.pos) || bench.find(p => (CAN[s.pos] || []).includes(p.pos)) || bench[0]; if (sub) { bench.splice(bench.indexOf(sub), 1); keep.push({ id: sub.id, pos: s.pos }); changes.push({ out: s.id, in: sub.id, slot: s.pos }); } }
      tac.lineup[side] = keep.length === 9 ? keep : auto;
    }
    const sp = ranked(list.filter(p => p.pos === 'SP' && isHealthy(p))).map(p => p.id);
    tac.rotation = [...tac.rotation.filter(id => !bad(id)), ...sp.filter(id => !tac.rotation.includes(id))].slice(0, 5);
    const rp = ranked(list.filter(p => isP(p) && isHealthy(p) && !tac.rotation.includes(p.id))).map(p => p.id);
    const bp = tac.bullpen; if (bad(bp.closer)) bp.closer = rp[0] || null; bp.setup = bp.setup.filter(id => !bad(id)); bp.middle = bp.middle.filter(id => !bad(id)); if (bad(bp.long)) bp.long = rp.find(id => id !== bp.closer && !bp.setup.includes(id)) || null;
    return changes;
  },
  tacticalFit(spec, c, abbr, tac) {
    const list = teamPlayers(c, abbr, { active: true }), byId = Object.fromEntries(list.map(p => [p.id, p]));
    const bats = ranked(list.filter(p => !isP(p))), sps = ranked(list.filter(p => p.pos === 'SP')), rps = ranked(list.filter(p => p.pos === 'RP'));
    const lu = (tac.lineup.vsR || []).map(s => byId[s.id]).filter(Boolean);
    let d = ((mean(lu, p => p.ovr) || 45) - mean(bats.slice(0, 9), p => p.ovr)) * 0.5;
    d += ((mean(tac.rotation.map(id => byId[id]).filter(Boolean), p => p.ovr) || 45) - mean(sps.slice(0, 5), p => p.ovr)) * 0.35;
    d += ((byId[tac.bullpen.closer]?.ovr ?? 45) - (rps[0]?.ovr ?? 45)) * 0.08;
    // order: best hitters first (small effect), defensive alignment fit
    const order = lu.map(p => p.ovr), sorted = [...order].sort((a, b) => b - a); const disorder = order.reduce((s, v, i) => s + Math.abs(v - sorted[i]), 0) / 9; d -= disorder * 0.03;
    const pen = mean(rps.slice(0, 6), p => p.ovr), spd = mean(lu, p => p.spd || 50);
    let syn = 0;
    if (tac.pitching.hook === 'rápido') syn += pen >= 72 ? 0.6 : -0.4; if (tac.pitching.hook === 'paciente') syn += mean(sps.slice(0, 5), p => p.ovr) >= 76 ? 0.4 : -0.3;
    if (tac.steal === 'agressivo') syn += spd > 60 ? 0.3 : -0.2; if (tac.bunt === 'frequente') syn -= 0.15; if (tac.defense.shift === 'agressivo') syn += 0.1;
    return { delta: round1(d), synergy: round1(syn), score: clamp(1 + d / 10, 0, 1) };
  },
  engineConfig(spec, c, abbr, tac) {
    return { sport: 'mlb', team: abbr, lineup: tac.lineup, battingOrderVsR: tac.lineup.vsR.map(s => s.id), battingOrderVsL: tac.lineup.vsL.map(s => s.id), rotation: tac.rotation, bullpen: tac.bullpen, defense: tac.defense, pitching: tac.pitching, bunt: tac.bunt, steal: tac.steal, pinchHit: tac.pinchHit, intentionalWalk: tac.intentionalWalk, staff: staffFx(spec, c, abbr) };
  },
  legacyTactics(tac) { return { hook: tac.pitching.hook === 'rápido' ? 'rápida' : tac.pitching.hook, run: tac.steal === 'agressivo' ? 'agressivo' : tac.steal === 'raro' ? 'conservador' : 'normal', lineup: 'analítica' }; },
  weeklyGameplan(spec, c, abbr, opp) {
    const sp = ranked(teamPlayers(c, opp, { active: true }).filter(p => p.pos === 'SP'))[0];
    return { opp, focus: 'série', note: `Série contra ${opp}: ${sp ? `abridor mais forte ${sp.n} (${sp.ovr})` : 'sem informações do abridor'}.` };
  },

  legality(spec, c, abbr) {
    const list = Object.values(c.players).filter(p => p.t === abbr && p.st !== 'RET'), act = list.filter(p => p.st === 'ACT'), forty = list.filter(p => p.on40);
    const pay = payroll(Object.values(c.players), abbr), issues = [];
    if (act.length !== spec.roster.max) issues.push({ code: 'ACTIVE_26', text: `Elenco ativo ${act.length} ≠ ${spec.roster.max}` });
    if (forty.length > spec.roster.forty) issues.push({ code: 'FORTY', text: `40-man ${forty.length} > ${spec.roster.forty}` });
    if (act.some(p => !p.on40)) issues.push({ code: 'ACTIVE_NOT_40', text: 'Há ativo fora do 40-man' });
    const np = act.filter(isP).length; if (np > 13 || np < 8) issues.push({ code: 'PITCHERS', text: `${np} arremessadores no elenco ativo (8..13)` });
    if (act.filter(p => p.pos === 'C').length < 2) issues.push({ code: 'CATCHERS', text: 'Menos de 2 catchers' });
    if (list.some(p => p.opt < 0)) issues.push({ code: 'OPTIONS', text: 'Opções negativas' });
    return { ok: !issues.length, issues, stats: { payroll: round1(pay), cbt: spec.cap.limit, overCBT: round1(Math.max(0, pay - spec.cap.limit)), active: act.length, forty: forty.length, minors: list.filter(p => p.st === 'MIN').length, pitchers: np, il: list.filter(p => p.st === 'IR').length } };
  },
  normalizeTeam(spec, c, abbr) { fixOrg(spec, c, abbr); },
  enforceTeam(spec, c, abbr) { fixOrg(spec, c, abbr); },
  validateTrade() { return null; }, // no hard cap: CBT is a tax, not a rule
  // service time: whole years from accumulated days (172 = one year), the remainder carries over
  serviceTick(p) { const tot = (p.svcFrac || 0) + (p.svcD || 0); const yrs = Math.floor(tot / 172); p.svcFrac = tot - yrs * 172; p.svcD = 0; return yrs; },
  yearStep(spec, c) { // option years are consumed once per season by players who were optioned
    for (const p of Object.values(c.players)) { if (p.optUsed) { p.opt = Math.max(0, (p.opt ?? 3) - 1); p.optUsed = false; } }
  },
  dayStep(spec, c) { for (const p of Object.values(c.players)) if ((p.st === 'ACT' || p.st === 'IR') && p.t !== 'FA') p.svcD = (p.svcD || 0) + 1; },
  contractKind(spec, p) { return p.c?.kind || 'VET'; },
  actions: {
    sendDown(spec, c, id) { // option to the minors
      const p = c.players[id]; if (!p || p.t !== c.userTeam || p.st !== 'ACT') return { ok: false, text: 'Jogador não está no elenco ativo.' };
      if (!p.optUsed && (p.opt ?? 3) <= 0) return { ok: false, text: `${p.n} não tem mais opções: use DFA/waivers.`, needsDfa: true };
      if (!p.optUsed) p.optUsed = true;
      p.st = 'MIN'; p.lvl = levelFor(p) === 'R' ? 'A' : levelFor(p); return { ok: true, text: `${p.n} optado para ${p.lvl}.` };
    },
    callUp(spec, c, id) {
      const p = c.players[id]; if (!p || p.t !== c.userTeam || p.st !== 'MIN') return { ok: false, text: 'Jogador não está nas ligas menores.' };
      const org = Object.values(c.players).filter(q => q.t === c.userTeam);
      if (org.filter(q => q.st === 'ACT').length >= spec.roster.max) return { ok: false, text: `Elenco ativo cheio (${spec.roster.max}).` };
      if (!p.on40 && org.filter(q => q.on40).length >= spec.roster.forty) return { ok: false, text: '40-man cheio: libere uma vaga.' };
      p.on40 = true; p.st = 'ACT'; p.lvl = null; return { ok: true, text: `${p.n} chamado para a MLB.` };
    },
    addTo40(spec, c, id) {
      const p = c.players[id]; if (!p || p.t !== c.userTeam || p.on40) return { ok: false, text: 'Jogador inválido.' };
      if (Object.values(c.players).filter(q => q.t === c.userTeam && q.on40).length >= spec.roster.forty) return { ok: false, text: '40-man cheio.' };
      p.on40 = true; return { ok: true, text: `${p.n} adicionado ao 40-man.` };
    },
    removeFrom40(spec, c, id) {
      const p = c.players[id]; if (!p || p.t !== c.userTeam || !p.on40 || p.st === 'ACT') return { ok: false, text: 'Só é possível remover do 40-man quem está nas menores.' };
      p.on40 = false; return { ok: true, text: `${p.n} removido do 40-man.` };
    },
    dfa(spec, c, id) { // designated for assignment: another club may claim him; otherwise outright to the minors (or release)
      const p = c.players[id]; if (!p || p.t !== c.userTeam || !p.on40) return { ok: false, text: 'Jogador inválido.' };
      const rng = xr(c, `dfa-${id}`), order = [...c.teams].sort((a, b) => c.standings[a.abbr].w - c.standings[b.abbr].w).map(t => t.abbr).filter(a => a !== c.userTeam);
      const claim = p.ovr >= spec.starOvr - 15 && order.find(a => Object.values(c.players).filter(q => q.t === a && q.on40).length < spec.roster.forty && rng.next() < 0.35);
      if (claim) { p.t = claim; p.rel = null; p.st = 'MIN'; p.lvl = levelFor(p) === 'R' ? 'A' : levelFor(p); return { ok: true, claimed: claim, text: `${claim} reivindica ${p.n} nos waivers.` }; }
      p.on40 = false; p.st = 'MIN'; p.lvl = levelFor(p); return { ok: true, claimed: null, text: `${p.n} passou pelos waivers e foi para ${p.lvl} fora do 40-man.` };
    },
    signInternational(spec, c, id, bonus) {
      const p = c.players[id], pool = c.x.intl; if (!p || p.t !== 'INTL') return { ok: false, text: 'Prospecto indisponível.' };
      const left = round1(c.x.gm.intlPool - c.x.gm.intlSpent);
      if (!pool.open) return { ok: false, text: 'O período de assinatura internacional está fechado.' };
      if (bonus < p.ask * 0.9) return { ok: false, text: `Bônus insuficiente (pede ${p.ask}M).` };
      if (bonus > left) return { ok: false, text: `Orçamento internacional insuficiente (${left}M).` };
      c.x.gm.intlSpent = round1(c.x.gm.intlSpent + bonus);
      Object.assign(p, { t: c.userTeam, st: 'MIN', lvl: 'R', on40: false, opt: 3, svc: 0, c: { sal: spec.salary.min, yrs: 5, kind: 'MINOR', bonus }, signed: { year: c.season, bonus } }); delete p.ask;
      p.rel = { tr: 55, rs: 50, mo: 70, sat: 60 };
      return { ok: true, text: `${p.n} assina com ${c.userTeam} (bônus ${bonus}M).` };
    },
  },
  // international class (fictional prospects, 16-17 years old) generated once per season
  intlClass(spec, c, year) {
    const rng = createRng(hashSeed(`${c.seed}-intl-${year}`)), out = [];
    for (let i = 0; i < 50; i++) {
      const pot = clamp(Math.round(rng.normal(66, 9)), 45, 95), ovr = clamp(Math.round(pot - 18 - Math.abs(rng.normal(0, 5))), 30, pot);
      const pos = rng.pick(['SP', 'SP', 'RP', 'C', 'SS', 'SS', '2B', '3B', 'CF', 'LF', 'RF', '1B']);
      out.push({ id: `mlb-intl-${year}-${i}`, n: fictionalName(rng), pos, age: rng.int(16, 17), ovr, pot, t: 'INTL', st: 'PROSPECT', syn: true, fict: true, intl: true, num: '', pers: persona(rng), scout: rng.int(4, 12), ask: round1(clamp(0.1 + Math.pow(Math.max(0, pot - 55) / 40, 2.2) * 6, 0.1, 6.5)), country: rng.pick(['República Dominicana', 'Venezuela', 'Cuba', 'Colômbia', 'México', 'Panamá', 'Japão', 'Coreia do Sul', 'Brasil']) });
    }
    return out;
  },
};
// Brings an organisation to the legal state: 26 active (13 pitchers max by quota), 40-man, levels for the minors.
function fixOrg(spec, c, abbr) {
  const org = () => Object.values(c.players).filter(p => p.t === abbr && (p.st === 'ACT' || p.st === 'MIN' || p.st === 'IR'));
  const o = org(), pit = o.filter(p => isP(p) && p.st !== 'IR').sort((a, b) => b.ovr - a.ovr), bat = o.filter(p => !isP(p) && p.st !== 'IR').sort((a, b) => b.ovr - a.ovr);
  const cs = bat.filter(p => p.pos === 'C').slice(0, 2);
  const keep = new Set([...pit.slice(0, 13), ...cs]);
  for (const p of bat) { if (keep.size >= 26) break; keep.add(p); }
  for (const p of pit.slice(13)) { if (keep.size >= 26) break; keep.add(p); }
  for (const p of o) {
    if (p.st === 'IR') continue;
    if (keep.has(p)) { p.st = 'ACT'; p.lvl = null; p.on40 = true; } else { if (p.st === 'ACT') { p.st = 'MIN'; } p.lvl = p.lvl && LEVELS.includes(p.lvl) ? p.lvl : levelFor(p); }
    if (p.opt == null) p.opt = 3;
  }
  // 40-man: all actives + IL + best minors up to 40
  const must = org().filter(p => p.st === 'ACT' || p.st === 'IR');
  for (const p of must) p.on40 = true;
  const minors = org().filter(p => p.st === 'MIN').sort((a, b) => (b.on40 - a.on40) || b.ovr - a.ovr);
  let n = must.length;
  for (const p of minors) { if (n < spec.roster.forty) { p.on40 = true; n++; } else p.on40 = false; }
}
