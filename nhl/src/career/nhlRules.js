// NHL career 3.0 rules: staff, tactics (forward lines, D pairs, goalie, forecheck, neutral zone, PP, PK, line matching),
// created-player attributes, cap / roster legality, waivers, ELC / RFA / UFA and the prospect pipeline (junior / AHL / Europe).
import { teamPlayers, payroll } from '../../../core/career/careerCore.js';
import { clamp, round1 } from '../../../core/career/kit.js';
import { staffFx } from '../../../core/career/staff.js';
import { ranked, mean, cleanIds, pickOption, pickRange, isHealthy } from '../../../core/career/rulesKit.js';

export const NHL_OPTS = {
  forecheck: ['1-2-2', '2-1-2', '1-3-1', '2-3 agressivo'],
  neutralZone: ['trap', 'left-wing lock', 'swarm', 'stretch'],
  ppFormation: ['umbrella', '1-3-1', 'overload'],
  pkStyle: ['box', 'diamond', 'agressivo'],
  matching: ['nenhum', 'matchup', 'shutdown', 'última troca em casa'],
  pace: ['controlado', 'normal', 'rápido'],
  goalieRest: ['auto', 'back-to-back', 'manual'],
};
const isF = p => p.pos !== 'D' && p.pos !== 'G';
const SCARCITY = { G: 1.25, D: 1.0, F: 1.0 };
const LINE_W = [0.35, 0.28, 0.22, 0.15], PAIR_W = [0.42, 0.35, 0.23];
const pipelineFor = p => (p.ovr < 50 && p.age >= 18 && (p.id.charCodeAt(p.id.length - 1) % 3 === 0) ? 'EUROPE' : p.age <= 19 ? 'JUNIOR' : 'AHL');

function autoLines(list) {
  const act = list.filter(p => p.st === 'ACT');
  const Cs = ranked(act.filter(p => p.pos === 'C')), Ls = ranked(act.filter(p => p.pos === 'LW')), Rs = ranked(act.filter(p => p.pos === 'RW')), Ds = ranked(act.filter(p => p.pos === 'D')), Gs = ranked(act.filter(p => p.pos === 'G'));
  const used = new Set(), take = (pri, ...more) => { for (const l of [pri, ...more]) { const p = l.find(x => !used.has(x.id)); if (p) { used.add(p.id); return p.id; } } return null; };
  const allF = ranked(act.filter(isF));
  const F = [0, 1, 2, 3].map(() => [take(Cs, allF), take(Ls, allF), take(Rs, allF)]);
  const D = [0, 1, 2].map(() => [take(Ds), take(Ds)]);
  return { F, D, G: { starter: Gs[0]?.id || null, backup: Gs[1]?.id || null } };
}

export const NHL_V3 = {
  sport: 'nhl',
  staffRoles: [
    { key: 'ASST_OFF', label: 'Assistente (ataque / power play)', group: 'offense', slots: 1 },
    { key: 'ASST_DEF', label: 'Assistente (defesa / penalty kill)', group: 'defense', slots: 1 },
    { key: 'GOALIE_COACH', label: 'Treinador de goleiros', group: 'dev', slots: 1, pos: ['G'] },
    { key: 'SKILLS', label: 'Treinador de habilidades', group: 'dev', slots: 1 },
    { key: 'SC', label: 'Preparador físico', group: 'med', slots: 1 },
    { key: 'MED', label: 'Chefe médico', group: 'med', slots: 1 },
    { key: 'SCOUT_CHL', label: 'Scout de Junior (CHL)', group: 'scout', slots: 2 },
    { key: 'SCOUT_EUR', label: 'Scout da Europa', group: 'scout', slots: 2 },
    { key: 'SCOUT_PRO', label: 'Scout profissional', group: 'scout', slots: 1 },
  ],
  scarcity: SCARCITY,
  milestones: [{ key: 'g30', stat: 'g', thr: 30, label: '30 gols' }, { key: 'pts80', stat: 'pts', thr: 80, label: '80 pontos' }, { key: 'pts50', stat: 'pts', thr: 50, label: '50 pontos' }],
  prodOf: p => { const s = p.ps || {}; return p.pos === 'G' ? ((s.sv || 0) / Math.max(1, s.sa || 1) - 0.89) * 600 : (s.pts || 0) * 0.8 + (s.g || 0) * 0.4; },
  attrSets: {
    F: { shooting: { label: 'Finalização', w: 0.2 }, passing: { label: 'Passe', w: 0.16 }, stickhandling: { label: 'Controle de disco', w: 0.14 }, skating: { label: 'Patinação', w: 0.16 }, offensiveIQ: { label: 'QI ofensivo', w: 0.14 }, defensiveIQ: { label: 'QI defensivo', w: 0.08 }, physical: { label: 'Físico', w: 0.07 }, faceoff: { label: 'Faceoff', w: 0.05 } },
    D: { defensiveIQ: { label: 'QI defensivo', w: 0.22 }, skating: { label: 'Patinação', w: 0.16 }, physical: { label: 'Físico', w: 0.16 }, passing: { label: 'Passe', w: 0.14 }, stickChecking: { label: 'Stick check', w: 0.14 }, shooting: { label: 'Chute', w: 0.1 }, offensiveIQ: { label: 'QI ofensivo', w: 0.08 } },
    G: { reflexes: { label: 'Reflexos', w: 0.26 }, positioning: { label: 'Posicionamento', w: 0.24 }, reboundControl: { label: 'Controle de rebote', w: 0.16 }, glove: { label: 'Luva', w: 0.1 }, composure: { label: 'Frieza', w: 0.14 }, puckHandling: { label: 'Jogo com o taco', w: 0.05 }, stamina: { label: 'Fôlego', w: 0.05 } },
  },
  attrGroup: (spec, pos) => (pos === 'G' ? 'G' : pos === 'D' ? 'D' : 'F'),
  heightRange: { min: 165, max: 205, unit: 'cm' }, weightRange: { min: 65, max: 125, unit: 'kg' },
  pathways: [
    { key: 'JUNIOR', label: 'Junior (CHL)', stage: 'JUNIOR', next: 'Draft → Desenvolvimento (Junior/AHL) → NHL' },
    { key: 'COLLEGE', label: 'College (NCAA)', stage: 'COLLEGE', next: 'Draft → Desenvolvimento → NHL' },
    { key: 'EUROPE', label: 'Europa (ligas profissionais)', stage: 'EUROPE', next: 'Draft → Desenvolvimento → NHL' },
  ],

  tacticsSchema: { forecheck: NHL_OPTS.forecheck, neutralZone: NHL_OPTS.neutralZone, powerPlay: { formation: NHL_OPTS.ppFormation }, penaltyKill: { style: NHL_OPTS.pkStyle }, lineMatching: { mode: NHL_OPTS.matching, topLineShare: [0.3, 0.45] }, pace: NHL_OPTS.pace, goalieRest: NHL_OPTS.goalieRest },
  tacticsDefault(spec, c, abbr) {
    const lines = autoLines(teamPlayers(c, abbr));
    return {
      lines, forecheck: '1-2-2', neutralZone: 'trap', pace: 'normal', goalieRest: 'auto',
      powerPlay: { formation: 'umbrella', units: [[...lines.F[0], ...lines.D[0]], [...lines.F[1], ...lines.D[1]]] },
      penaltyKill: { style: 'box', units: [[lines.F[2][0], lines.F[2][1], ...lines.D[2]], [lines.F[3][0], lines.F[3][1], ...lines.D[1]]] },
      lineMatching: { mode: 'nenhum', topLineShare: 0.35 },
    };
  },
  validateTactics(spec, c, abbr, tac, patch = {}) {
    const errors = [], list = teamPlayers(c, abbr).filter(p => p.st !== 'MIN'), byId = Object.fromEntries(list.map(p => [p.id, p])), o = NHL_OPTS;
    const m = { ...tac, ...patch, lines: { ...tac.lines, ...patch.lines }, powerPlay: { ...tac.powerPlay, ...patch.powerPlay }, penaltyKill: { ...tac.penaltyKill, ...patch.penaltyKill }, lineMatching: { ...tac.lineMatching, ...patch.lineMatching } };
    const seen = new Set(), out = {};
    const slot = (id, test, label) => { if (id == null) return null; const p = byId[id]; if (!p) { errors.push(`${label}: jogador ${id} não está no elenco`); return null; } if (!test(p)) { errors.push(`${label}: ${p.n} (${p.pos}) não pode jogar aqui`); return null; } if (seen.has(id)) { errors.push(`${label}: ${p.n} repetido`); return null; } seen.add(id); return id; };
    out.lines = { F: [], D: [], G: {} };
    for (let i = 0; i < 4; i++) out.lines.F.push([0, 1, 2].map(j => slot(m.lines.F?.[i]?.[j], isF, `Linha ${i + 1}`)));
    for (let i = 0; i < 3; i++) out.lines.D.push([0, 1].map(j => slot(m.lines.D?.[i]?.[j], p => p.pos === 'D', `Par ${i + 1}`)));
    out.lines.G = { starter: slot(m.lines.G?.starter, p => p.pos === 'G', 'Goleiro titular'), backup: slot(m.lines.G?.backup, p => p.pos === 'G', 'Goleiro reserva') };
    out.forecheck = pickOption(m.forecheck, o.forecheck, '1-2-2', 'Forecheck', errors); out.neutralZone = pickOption(m.neutralZone, o.neutralZone, 'trap', 'Zona neutra', errors);
    out.pace = pickOption(m.pace, o.pace, 'normal', 'Ritmo', errors); out.goalieRest = pickOption(m.goalieRest, o.goalieRest, 'auto', 'Descanso do goleiro', errors);
    const units = (arr, n, label) => (Array.isArray(arr) ? arr : []).slice(0, 2).map((u, i) => cleanIds(u, byId, `${label} ${i + 1}`, errors).filter(Boolean).slice(0, n));
    out.powerPlay = { formation: pickOption(m.powerPlay.formation, o.ppFormation, 'umbrella', 'Power play', errors), units: units(m.powerPlay.units, 5, 'PP') };
    out.penaltyKill = { style: pickOption(m.penaltyKill.style, o.pkStyle, 'box', 'Penalty kill', errors), units: units(m.penaltyKill.units, 4, 'PK') };
    out.lineMatching = { mode: pickOption(m.lineMatching.mode, o.matching, 'nenhum', 'Line matching', errors), topLineShare: pickRange(m.lineMatching.topLineShare, 0.3, 0.45, 0.35, 'Tempo da 1ª linha', errors) };
    return { ok: errors.length === 0, errors, tac: out };
  },
  reconcileTactics(spec, c, abbr, tac) {
    const list = teamPlayers(c, abbr).filter(p => p.st === 'ACT'), byId = Object.fromEntries(list.map(p => [p.id, p])), changes = [];
    const auto = autoLines(list), used = new Set();
    const ok = id => id && byId[id] && isHealthy(byId[id]) && !used.has(id);
    const fix = (cur, pool, label) => { if (ok(cur)) { used.add(cur); return cur; } const r = pool.find(id => ok(id)) || ranked(list.filter(p => isHealthy(p) && !used.has(p.id) && (label === 'G' ? p.pos === 'G' : label === 'D' ? p.pos === 'D' : isF(p)))).map(p => p.id)[0] || null; if (cur && r !== cur) changes.push({ out: cur, in: r, slot: label }); if (r) used.add(r); return r; };
    const poolF = auto.F.flat(), poolD = auto.D.flat();
    tac.lines.F = tac.lines.F.map(l => l.map(id => fix(id, poolF, 'F')));
    tac.lines.D = tac.lines.D.map(l => l.map(id => fix(id, poolD, 'D')));
    const g = tac.lines.G; const gs = ranked(list.filter(p => p.pos === 'G' && isHealthy(p))).map(p => p.id);
    g.starter = ok(g.starter) ? g.starter : (gs[0] || null); if (g.backup === g.starter || !ok(g.backup)) g.backup = gs.find(id => id !== g.starter) || null;
    const clean = u => u.filter(id => byId[id] && isHealthy(byId[id]));
    tac.powerPlay.units = tac.powerPlay.units.map(clean); tac.penaltyKill.units = tac.penaltyKill.units.map(clean);
    if (!tac.powerPlay.units[0]?.length) tac.powerPlay.units = [[...tac.lines.F[0], ...tac.lines.D[0]].filter(Boolean), [...tac.lines.F[1], ...tac.lines.D[1]].filter(Boolean)];
    if (!tac.penaltyKill.units[0]?.length) tac.penaltyKill.units = [[tac.lines.F[2][0], tac.lines.F[2][1], ...tac.lines.D[2]].filter(Boolean), [tac.lines.F[3][0], tac.lines.F[3][1], ...tac.lines.D[1]].filter(Boolean)];
    return changes;
  },
  tacticalFit(spec, c, abbr, tac) {
    const list = teamPlayers(c, abbr, { active: true }), byId = Object.fromEntries(list.map(p => [p.id, p]));
    const bestF = ranked(list.filter(isF)), bestD = ranked(list.filter(p => p.pos === 'D')), bestG = ranked(list.filter(p => p.pos === 'G'));
    let d = 0;
    tac.lines.F.forEach((l, i) => { const ch = mean(l.map(id => byId[id]).filter(Boolean), p => p.ovr) || 45, bt = mean(bestF.slice(i * 3, i * 3 + 3), p => p.ovr) || ch; d += (ch - bt) * LINE_W[i] * 0.5; });
    tac.lines.D.forEach((l, i) => { const ch = mean(l.map(id => byId[id]).filter(Boolean), p => p.ovr) || 45, bt = mean(bestD.slice(i * 2, i * 2 + 2), p => p.ovr) || ch; d += (ch - bt) * PAIR_W[i] * 0.3; });
    const gs = byId[tac.lines.G.starter]; d += ((gs?.ovr ?? 40) - (bestG[0]?.ovr ?? 40)) * 0.3;
    const young = mean(list, p => p.age) < 27, top6 = mean(bestF.slice(0, 6), p => p.ovr), depth = mean(bestF.slice(6, 12), p => p.ovr), gOvr = bestG[0]?.ovr ?? 60;
    let syn = 0;
    if (tac.forecheck === '2-3 agressivo' || tac.forecheck === '2-1-2') syn += young ? 0.5 : -0.4; if (tac.neutralZone === 'trap') syn += gOvr >= 80 ? 0.4 : 0.1;
    if (tac.neutralZone === 'stretch') syn += top6 - depth > 8 ? 0.4 : -0.2; if (tac.pace === 'rápido') syn += young ? 0.3 : -0.3;
    if (tac.lineMatching.mode === 'shutdown') syn += mean(bestD.slice(0, 2), p => p.ovr) >= 76 ? 0.3 : -0.1;
    if (tac.lineMatching.mode !== 'nenhum') syn -= 0.05;
    return { delta: round1(d), synergy: round1(syn), score: clamp(1 + d / 10, 0, 1) };
  },
  engineConfig(spec, c, abbr, tac) {
    return { sport: 'nhl', team: abbr, lines: tac.lines.F, pairs: tac.lines.D, goalie: tac.lines.G, forecheck: tac.forecheck, neutralZone: tac.neutralZone, pace: tac.pace, goalieRest: tac.goalieRest, powerPlay: tac.powerPlay, penaltyKill: tac.penaltyKill, lineMatching: tac.lineMatching, staff: staffFx(spec, c, abbr) };
  },
  legacyTactics(tac) { return { forecheck: tac.forecheck === '2-3 agressivo' || tac.forecheck === '2-1-2' ? 'agressivo' : tac.forecheck === '1-3-1' ? 'passivo' : 'equilibrado', pace: tac.pace === 'rápido' ? 'rápido' : tac.pace === 'controlado' ? 'controlado' : 'normal', lines: tac.lineMatching.topLineShare >= 0.4 ? 'top-heavy' : 'equilibradas' }; },
  weeklyGameplan(spec, c, abbr, opp) {
    const mine = teamPlayers(c, abbr, { active: true }), theirs = teamPlayers(c, opp, { active: true });
    const gm = ranked(theirs.filter(p => p.pos === 'G'))[0]?.ovr ?? 70, off = mean(ranked(mine.filter(isF)).slice(0, 6), p => p.ovr), def = mean(ranked(theirs.filter(p => p.pos === 'D')).slice(0, 4), p => p.ovr);
    return { opp, focus: gm < 74 ? 'volume de chutes' : def < 72 ? 'forecheck agressivo' : 'jogo controlado', note: `Contra ${opp}: ${gm < 74 ? 'o goleiro rival é vulnerável, chute mais' : def < 72 ? 'defesa lenta, pressione no forecheck' : 'evite erros e use o power play'}.`, offOvr: round1(off) };
  },

  legality(spec, c, abbr) {
    const list = Object.values(c.players).filter(p => p.t === abbr), act = list.filter(p => p.st === 'ACT');
    const pay = payroll(Object.values(c.players), abbr), issues = [];
    if (pay > spec.cap.limit + 0.01) issues.push({ code: 'CAP', text: `Folha ${round1(pay)}M acima do teto ${spec.cap.limit}M` });
    if (act.length > spec.roster.max) issues.push({ code: 'ROSTER_MAX', text: `Elenco ${act.length} > ${spec.roster.max}` });
    if (act.length < spec.roster.min) issues.push({ code: 'ROSTER_MIN', text: `Elenco ${act.length} < ${spec.roster.min}` });
    if (act.filter(p => p.pos === 'G').length < 2) issues.push({ code: 'GOALIES', text: 'Menos de 2 goleiros no elenco' });
    return { ok: !issues.length, issues, stats: { payroll: round1(pay), cap: spec.cap.limit, capSpace: round1(spec.cap.limit - pay), active: act.length, ahl: list.filter(p => p.st === 'MIN').length, goalies: act.filter(p => p.pos === 'G').length } };
  },
  normalizeTeam(spec, c, abbr, { cutToFA }) {
    const all = Object.values(c.players);
    const pay = payroll(all, abbr);
    if (pay > spec.cap.limit * 0.97) { const f = (spec.cap.limit * 0.955) / pay; for (const p of all.filter(q => q.t === abbr && q.c)) p.c.sal = Math.max(spec.salary.min, round1(p.c.sal * f * 100) / 100); }
    fixActive(spec, c, abbr);
    for (const p of all.filter(q => q.t === abbr && q.st === 'MIN' && !q.lvl)) p.lvl = pipelineFor(p);
  },
  enforceTeam(spec, c, abbr, { cutToFA }) {
    const all = Object.values(c.players);
    let guard = 0;
    while (payroll(all, abbr) > spec.cap.limit && guard++ < 30) {
      const cand = all.filter(p => p.t === abbr && p.c && p.st !== 'PROSPECT').sort((a, b) => ((a.ovr - 58) / Math.max(0.5, a.c.sal)) - ((b.ovr - 58) / Math.max(0.5, b.c.sal)))[0];
      if (!cand) break; cutToFA(cand);
    }
    fixActive(spec, c, abbr);
  },
  validateTrade(spec, c, { aiTeam, userTeam, give, get }) {
    const all = Object.values(c.players);
    const chk = (team, out, inn) => { const before = payroll(all, team), after = before - out.reduce((a, p) => a + (p.c?.sal || 0), 0) + inn.reduce((a, p) => a + (p.c?.sal || 0), 0); return after <= spec.cap.limit || after <= before ? null : `${team} estouraria o teto salarial (${round1(after)}M > ${spec.cap.limit}M)`; };
    return chk(userTeam, give, get) || chk(aiTeam, get, give);
  },
  // contracts that do not tick while the draftee develops in junior / Europe (entry-level slide)
  skipContractTick: p => p.st === 'MIN' && (p.lvl === 'JUNIOR' || p.lvl === 'EUROPE') && p.c?.kind === 'ELC',
  yearStep(spec, c) { // prospect pipeline progression at the start of a season
    for (const p of Object.values(c.players)) {
      if (p.st !== 'MIN' || !p.lvl) continue;
      if (p.lvl === 'JUNIOR' && p.age >= 20) p.lvl = 'AHL';
      else if (p.lvl === 'EUROPE' && p.age >= 21) p.lvl = 'AHL';
    }
  },
  contractKind(spec, p) { const k = p.c?.kind; if (k === 'ELC') return 'ELC'; if (p.rfa) return 'RFA'; if ((p.c?.yrs ?? 9) <= 1) return p.age >= 27 || (p.svc || 0) >= 7 ? 'UFA (próximo)' : 'RFA (próximo)'; return k || 'VET'; },
  actions: {
    needsWaivers(spec, p) { return p.st === 'ACT' && p.c?.kind !== 'ELC' && p.age >= 23 && (p.svc || 0) >= 2; },
    sendToAHL(spec, c, id) {
      const p = c.players[id]; if (!p || p.t !== c.userTeam || p.st !== 'ACT') return { ok: false, text: 'Jogador não está no elenco principal.' };
      if (NHL_V3.actions.needsWaivers(spec, p)) return { ok: false, text: `${p.n} precisa passar por waivers; use placeOnWaivers.`, needsWaivers: true };
      p.st = 'MIN'; p.lvl = 'AHL'; return { ok: true, text: `${p.n} foi para a AHL.` };
    },
    placeOnWaivers(spec, c, id) {
      const p = c.players[id]; if (!p || p.t !== c.userTeam || p.st !== 'ACT') return { ok: false, text: 'Jogador não está no elenco principal.' };
      const order = [...c.teams].sort((a, b) => (c.standings[a.abbr].w - c.standings[b.abbr].w)).map(t => t.abbr).filter(a => a !== c.userTeam);
      const claim = p.ovr >= spec.starOvr - 14 && order.find(a => payroll(Object.values(c.players), a) + (p.c?.sal || 0) <= spec.cap.limit && teamPlayers(c, a).filter(q => q.st === 'ACT').length < spec.roster.max && (c.x.cal.day + a.charCodeAt(0)) % 3 !== 0);
      if (claim) { const from = p.t; p.t = claim; p.st = 'ACT'; p.rel = null; return { ok: true, claimed: claim, text: `${claim} reivindica ${p.n} nos waivers.` }; }
      p.st = 'MIN'; p.lvl = 'AHL'; return { ok: true, claimed: null, text: `${p.n} passou pelos waivers e foi para a AHL.` };
    },
    callUp(spec, c, id) {
      const p = c.players[id]; if (!p || p.t !== c.userTeam || p.st !== 'MIN') return { ok: false, text: 'Jogador não está na AHL.' };
      if (!['AHL'].includes(p.lvl || 'AHL')) return { ok: false, text: `${p.n} ainda está em ${p.lvl}; só jogadores da AHL podem ser chamados.` };
      if (teamPlayers(c, c.userTeam).filter(q => q.st === 'ACT').length >= spec.roster.max) return { ok: false, text: `Elenco cheio (${spec.roster.max}).` };
      p.st = 'ACT'; p.lvl = null; return { ok: true, text: `${p.n} chamado para a NHL.` };
    },
    assignProspect(spec, c, id, level) {
      const p = c.players[id]; if (!p || p.t !== c.userTeam || p.st !== 'MIN') return { ok: false, text: 'Prospecto inválido.' };
      if (!['JUNIOR', 'AHL', 'EUROPE'].includes(level)) return { ok: false, text: 'Nível inválido.' };
      if (level === 'JUNIOR' && p.age > 20) return { ok: false, text: 'Idade máxima do Junior: 20.' };
      p.lvl = level; return { ok: true, text: `${p.n} → ${level}.` };
    },
    // RFA: the user's team tenders a qualifying offer (110% of the old salary, 1 year) to keep the rights.
    qualifyRFA(spec, c, id) {
      const p = c.players[id]; if (!p || p.t !== c.userTeam || !p.expiring) return { ok: false, text: 'Jogador não está com contrato vencendo.' };
      if (!(p.age < 27 && (p.svc || 0) < 7)) return { ok: false, text: `${p.n} é UFA (sem direitos de oferta qualificada).` };
      const sal = round1(Math.max(spec.salary.min, (p.c?.sal || spec.salary.min) * 1.1));
      if (payroll(Object.values(c.players), c.userTeam) + sal > spec.cap.limit) return { ok: false, text: 'Sem espaço no teto.' };
      p.c = { sal, yrs: 1, kind: 'RFA' }; p.expiring = false; return { ok: true, text: `Oferta qualificada de ${sal}M enviada a ${p.n}.` };
    },
  },
};
// Brings the active roster to the legal range: extras to the AHL (best 23 stay), shortages filled from the AHL, goalies ≥ 2.
function fixActive(spec, c, abbr) {
  const org = () => Object.values(c.players).filter(p => p.t === abbr);
  let act = org().filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr);
  const need = ['G'];
  for (const p of act.slice(spec.roster.max)) { p.st = 'MIN'; p.lvl = p.lvl || 'AHL'; }
  act = org().filter(p => p.st === 'ACT');
  if (act.filter(p => p.pos === 'G').length < 2) { const g = org().filter(p => p.st === 'MIN' && p.pos === 'G').sort((a, b) => b.ovr - a.ovr)[0]; if (g) { if (act.length >= spec.roster.max) { const out = act.filter(p => p.pos !== 'G').sort((a, b) => a.ovr - b.ovr)[0]; if (out) { out.st = 'MIN'; out.lvl = out.lvl || 'AHL'; } } g.st = 'ACT'; g.lvl = null; } }
  act = org().filter(p => p.st === 'ACT');
  const pool = org().filter(p => p.st === 'MIN' && (p.lvl || 'AHL') === 'AHL').sort((a, b) => b.ovr - a.ovr);
  while (act.length < spec.roster.min && pool.length) { const p = pool.shift(); p.st = 'ACT'; p.lvl = null; act.push(p); }
}
