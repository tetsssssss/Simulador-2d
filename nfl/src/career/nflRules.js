// NFL career 3.0 rules: staff, tactics (depth chart, formations, playbook, personnel, schemes, special teams, weekly game plan),
// attributes for created players, cap / roster legality, franchise tag, practice squad. Plain data in, plain data out.
import { teamPlayers, payroll } from '../../../core/career/careerCore.js';
import { clamp, round1 } from '../../../core/career/kit.js';
import { staffFx } from '../../../core/career/staff.js';
import { ranked, mean, cleanIds, pickOption, pickRange, isHealthy } from '../../../core/career/rulesKit.js';

const GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'];
const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, DB: 4, K: 1, P: 1 };
const DEPTH_LEN = { QB: 3, RB: 4, WR: 6, TE: 3, OL: 8, DL: 7, LB: 5, DB: 8, K: 1, P: 1 };
export const NFL_OPTS = {
  offFormation: ['Singleback', 'I-Form', 'Shotgun', 'Pistol', 'Empty'],
  offPersonnel: ['10', '11', '12', '21', '22'],
  offScheme: ['West Coast', 'Air Raid', 'Ground & Pound', 'Spread RPO', 'Play Action'],
  defFormation: ['4-3', '3-4', 'Nickel', 'Dime', '46'],
  defPersonnel: ['base', 'nickel', 'dime'],
  defScheme: ['Cover 3', 'Man Press', 'Zone Blitz', 'Tampa 2', 'Hybrid 3-4'],
  tempo: ['lento', 'normal', 'no-huddle'],
  focus: ['equilibrado', 'atacar o passe', 'atacar a corrida', 'proteger a vantagem', 'pressionar o QB'],
  fourth: ['conservador', 'normal', 'agressivo'],
};
const g = (spec, p) => spec.posGroup(p.pos);
const SCARCITY = { QB: 1.45, OL: 1.0, DL: 1.15, WR: 1.05, DB: 1.0, LB: 0.85, TE: 0.9, RB: 0.7, K: 0.3, P: 0.25 };

function autoDepth(spec, list) {
  const out = {};
  for (const grp of GROUPS) out[grp] = ranked(list.filter(p => g(spec, p) === grp && p.st !== 'IR'), p => !p.inj || true).slice(0, DEPTH_LEN[grp]).map(p => p.id);
  return out;
}
function bestStarters(spec, list) {
  const res = {};
  for (const grp of GROUPS) res[grp] = ranked(list.filter(p => g(spec, p) === grp && isHealthy(p))).slice(0, STARTERS[grp]);
  return res;
}

export const NFL_V3 = {
  sport: 'nfl',
  staffRoles: [
    { key: 'OC', label: 'Coordenador ofensivo', group: 'offense', slots: 1 },
    { key: 'DC', label: 'Coordenador defensivo', group: 'defense', slots: 1 },
    { key: 'STC', label: 'Coordenador de times especiais', group: 'special', slots: 1 },
    { key: 'QBC', label: 'Treinador de QBs', group: 'dev', slots: 1, pos: ['QB'] },
    { key: 'OLC', label: 'Treinador de linha ofensiva', group: 'dev', slots: 1, pos: ['OL'] },
    { key: 'DLC', label: 'Treinador de linha defensiva', group: 'dev', slots: 1, pos: ['DL'] },
    { key: 'DBC', label: 'Treinador de defensive backs', group: 'dev', slots: 1, pos: ['DB'] },
    { key: 'SC', label: 'Preparador físico', group: 'med', slots: 1 },
    { key: 'MED', label: 'Chefe médico', group: 'med', slots: 1 },
    { key: 'SCOUT_COL', label: 'Scout universitário', group: 'scout', slots: 3 },
    { key: 'SCOUT_PRO', label: 'Scout profissional', group: 'scout', slots: 1 },
  ],
  scarcity: SCARCITY,
  milestones: [
    { key: 'pass4000', stat: 'passYds', thr: 4000, label: '4.000 jardas de passe' }, { key: 'rush1000', stat: 'rushYds', thr: 1000, label: '1.000 jardas corridas' },
    { key: 'rec1000', stat: 'recYds', thr: 1000, label: '1.000 jardas recebidas' }, { key: 'sack10', stat: 'sacks', thr: 10, label: '10 sacks' },
  ],
  prodOf: p => { const s = p.ps || {}; return (s.passYds || 0) / 40 + (s.passTd || 0) * 4 + (s.rushYds || 0) / 12 + (s.recYds || 0) / 14 + ((s.rushTd || 0) + (s.recTd || 0)) * 6 + (s.sacks || 0) * 8 + (s.defInt || 0) * 8 + (s.tkl || 0) / 5; },

  // ---------- created player ----------
  attrSets: {
    QB: { accuracy: { label: 'Precisão', w: 0.26 }, armStrength: { label: 'Força de braço', w: 0.18 }, awareness: { label: 'Visão de jogo', w: 0.2 }, poise: { label: 'Calma sob pressão', w: 0.12 }, mobility: { label: 'Mobilidade', w: 0.1 }, release: { label: 'Liberação', w: 0.08 }, leadership: { label: 'Liderança', w: 0.06 } },
    RB: { speed: { label: 'Velocidade', w: 0.2 }, elusiveness: { label: 'Elusividade', w: 0.2 }, power: { label: 'Potência', w: 0.15 }, vision: { label: 'Visão', w: 0.15 }, hands: { label: 'Mãos', w: 0.1 }, ballSecurity: { label: 'Segurança da bola', w: 0.1 }, stamina: { label: 'Fôlego', w: 0.1 } },
    WR: { speed: { label: 'Velocidade', w: 0.2 }, hands: { label: 'Mãos', w: 0.22 }, routeRunning: { label: 'Rotas', w: 0.22 }, release: { label: 'Saída da linha', w: 0.1 }, agility: { label: 'Agilidade', w: 0.1 }, jumping: { label: 'Salto', w: 0.08 }, blocking: { label: 'Bloqueio', w: 0.08 } },
    TE: { hands: { label: 'Mãos', w: 0.2 }, routeRunning: { label: 'Rotas', w: 0.15 }, blocking: { label: 'Bloqueio', w: 0.2 }, strength: { label: 'Força', w: 0.15 }, speed: { label: 'Velocidade', w: 0.12 }, awareness: { label: 'Visão', w: 0.1 }, stamina: { label: 'Fôlego', w: 0.08 } },
    OL: { passBlock: { label: 'Bloqueio de passe', w: 0.26 }, runBlock: { label: 'Bloqueio de corrida', w: 0.24 }, strength: { label: 'Força', w: 0.18 }, footwork: { label: 'Jogo de pés', w: 0.14 }, awareness: { label: 'Visão', w: 0.1 }, stamina: { label: 'Fôlego', w: 0.08 } },
    DL: { passRush: { label: 'Pass rush', w: 0.26 }, runStop: { label: 'Contenção', w: 0.2 }, strength: { label: 'Força', w: 0.16 }, burst: { label: 'Explosão', w: 0.16 }, motor: { label: 'Motor', w: 0.12 }, awareness: { label: 'Visão', w: 0.1 } },
    LB: { tackling: { label: 'Tackle', w: 0.22 }, coverage: { label: 'Cobertura', w: 0.16 }, runStop: { label: 'Contenção', w: 0.2 }, speed: { label: 'Velocidade', w: 0.14 }, awareness: { label: 'Visão', w: 0.16 }, blitz: { label: 'Blitz', w: 0.12 } },
    DB: { coverage: { label: 'Cobertura', w: 0.28 }, speed: { label: 'Velocidade', w: 0.2 }, ballSkills: { label: 'Bola no ar', w: 0.16 }, tackling: { label: 'Tackle', w: 0.12 }, agility: { label: 'Agilidade', w: 0.12 }, awareness: { label: 'Visão', w: 0.12 } },
    K: { kickPower: { label: 'Potência do chute', w: 0.4 }, kickAccuracy: { label: 'Precisão do chute', w: 0.45 }, composure: { label: 'Frieza', w: 0.15 } },
  },
  attrGroup: (spec, pos) => { const x = spec.posGroup(pos); return x === 'P' ? 'K' : x === 'LS' ? 'OL' : x; },
  heightRange: { min: 165, max: 205, unit: 'cm' }, weightRange: { min: 60, max: 180, unit: 'kg' },
  pathways: [{ key: 'COLLEGE', label: 'College (NCAA)', stage: 'COLLEGE', next: 'Draft → Rookie Camp → Depth Chart → NFL' }],

  // ---------- tactics ----------
  tacticsSchema: {
    offense: { formation: NFL_OPTS.offFormation, personnel: NFL_OPTS.offPersonnel, scheme: NFL_OPTS.offScheme, tempo: NFL_OPTS.tempo },
    defense: { formation: NFL_OPTS.defFormation, personnel: NFL_OPTS.defPersonnel, scheme: NFL_OPTS.defScheme },
    playbook: { passShare: [0.3, 0.7], deepRate: [0, 1], rpoRate: [0, 1], screenRate: [0, 1] },
    gameplan: { focus: NFL_OPTS.focus, fourthDown: NFL_OPTS.fourth, twoPoint: 'boolean', blitzRate: [0, 1] },
    specialTeams: { fakeRate: [0, 0.3], onsideRisk: [0, 1] },
  },
  tacticsDefault(spec, c, abbr) {
    const list = teamPlayers(c, abbr), depth = autoDepth(spec, list);
    return {
      depth,
      offense: { formation: 'Shotgun', personnel: '11', scheme: 'West Coast', tempo: 'normal' },
      defense: { formation: '4-3', personnel: 'base', scheme: 'Cover 3' },
      playbook: { passShare: 0.55, deepRate: 0.3, rpoRate: 0.15, screenRate: 0.12 },
      gameplan: { focus: 'equilibrado', fourthDown: 'normal', twoPoint: false, blitzRate: 0.3, week: 0, opp: null },
      specialTeams: { kicker: depth.K[0] || null, punter: depth.P[0] || null, returner: (depth.WR[3] || depth.RB[1] || depth.DB[3] || null), fakeRate: 0.02, onsideRisk: 0.1 },
    };
  },
  // patch is merged over `tac`; returns { ok, errors, tac } (tac only contains valid values).
  validateTactics(spec, c, abbr, tac, patch = {}) {
    const errors = [], list = teamPlayers(c, abbr), byId = Object.fromEntries(list.map(p => [p.id, p]));
    const m = { ...tac, ...patch, offense: { ...tac.offense, ...patch.offense }, defense: { ...tac.defense, ...patch.defense }, playbook: { ...tac.playbook, ...patch.playbook }, gameplan: { ...tac.gameplan, ...patch.gameplan }, specialTeams: { ...tac.specialTeams, ...patch.specialTeams }, depth: { ...tac.depth, ...patch.depth } };
    const o = NFL_OPTS, out = { depth: {} };
    out.offense = { formation: pickOption(m.offense.formation, o.offFormation, 'Shotgun', 'Formação ofensiva', errors), personnel: pickOption(m.offense.personnel, o.offPersonnel, '11', 'Personnel ofensivo', errors), scheme: pickOption(m.offense.scheme, o.offScheme, 'West Coast', 'Esquema ofensivo', errors), tempo: pickOption(m.offense.tempo, o.tempo, 'normal', 'Ritmo', errors) };
    out.defense = { formation: pickOption(m.defense.formation, o.defFormation, '4-3', 'Formação defensiva', errors), personnel: pickOption(m.defense.personnel, o.defPersonnel, 'base', 'Personnel defensivo', errors), scheme: pickOption(m.defense.scheme, o.defScheme, 'Cover 3', 'Esquema defensivo', errors) };
    out.playbook = { passShare: pickRange(m.playbook.passShare, 0.3, 0.7, 0.55, 'Passe %', errors), deepRate: pickRange(m.playbook.deepRate, 0, 1, 0.3, 'Bola longa', errors), rpoRate: pickRange(m.playbook.rpoRate, 0, 1, 0.15, 'RPO', errors), screenRate: pickRange(m.playbook.screenRate, 0, 1, 0.12, 'Screen', errors) };
    out.gameplan = { focus: pickOption(m.gameplan.focus, o.focus, 'equilibrado', 'Foco do plano', errors), fourthDown: pickOption(m.gameplan.fourthDown, o.fourth, 'normal', '4ª descida', errors), twoPoint: !!m.gameplan.twoPoint, blitzRate: pickRange(m.gameplan.blitzRate, 0, 1, 0.3, 'Blitz', errors), week: m.gameplan.week || 0, opp: m.gameplan.opp ?? null };
    for (const grp of GROUPS) {
      const ids = cleanIds(m.depth[grp], byId, `Depth ${grp}`, errors).filter(Boolean);
      for (const id of ids) if (g(spec, byId[id]) !== grp) errors.push(`Depth ${grp}: ${byId[id].n} é ${byId[id].pos}`);
      out.depth[grp] = ids.filter(id => g(spec, byId[id]) === grp).slice(0, DEPTH_LEN[grp]);
    }
    const st = m.specialTeams;
    const own = id => (id && byId[id] ? id : null);
    out.specialTeams = { kicker: own(st.kicker) || out.depth.K[0] || null, punter: own(st.punter) || out.depth.P[0] || null, returner: own(st.returner), fakeRate: pickRange(st.fakeRate, 0, 0.3, 0.02, 'Fake', errors), onsideRisk: pickRange(st.onsideRisk, 0, 1, 0.1, 'Onside', errors) };
    return { ok: errors.length === 0, errors, tac: out };
  },
  // Replaces injured / missing starters by the best healthy player of the group (keeps the user's order otherwise).
  reconcileTactics(spec, c, abbr, tac) {
    const list = teamPlayers(c, abbr), byId = Object.fromEntries(list.map(p => [p.id, p])), changes = [];
    for (const grp of GROUPS) {
      const need = STARTERS[grp], cur = (tac.depth[grp] || []).filter(id => byId[id]);
      const ok = cur.filter(id => isHealthy(byId[id]));
      const bench = ranked(list.filter(p => g(spec, p) === grp && isHealthy(p) && !ok.includes(p.id))).map(p => p.id);
      const starters = cur.slice(0, need);
      for (const id of starters) if (!isHealthy(byId[id])) changes.push({ group: grp, out: id, in: bench[0] || null });
      const fixed = [...ok.slice(0, need), ...bench].slice(0, need);
      tac.depth[grp] = [...fixed, ...cur.filter(id => !fixed.includes(id)), ...bench.filter(id => !fixed.includes(id) && !cur.includes(id))].slice(0, DEPTH_LEN[grp]);
    }
    return changes;
  },
  // How well the chosen starters / scheme match the roster (0..1) and the rating delta it causes (points of team rating).
  tacticalFit(spec, c, abbr, tac) {
    const list = teamPlayers(c, abbr, { active: true }), byId = Object.fromEntries(list.map(p => [p.id, p])), best = bestStarters(spec, list);
    let d = 0, w = 0;
    const W = { QB: 3, OL: 1.5, DL: 1.5, WR: 1.2, DB: 1.2, LB: 0.9, RB: 0.7, TE: 0.6, K: 0.2, P: 0.1 };
    for (const grp of GROUPS) {
      const chosen = (tac.depth[grp] || []).slice(0, STARTERS[grp]).map(id => byId[id]).filter(Boolean);
      const bm = mean(best[grp], p => p.ovr), cm = chosen.length ? mean(chosen, p => p.ovr) : bm - 10;
      d += (cm - bm) * W[grp]; w += W[grp];
    }
    const delta = (d / Math.max(1, w)) * 0.5; // <= 0
    const wr = mean(best.WR, p => p.ovr), ol = mean(best.OL, p => p.ovr), rb = mean(best.RB, p => p.ovr), qb = best.QB[0]?.ovr ?? 60, dl = mean(best.DL, p => p.ovr), db = mean(best.DB, p => p.ovr);
    let syn = 0;
    const o = tac.offense.scheme, df = tac.defense.scheme;
    if (o === 'Air Raid') syn += wr >= 76 && qb >= 76 ? 0.5 : -0.3; if (o === 'Ground & Pound') syn += ol >= 74 && rb >= 74 ? 0.5 : -0.3;
    if (o === 'Spread RPO') syn += qb >= 74 ? 0.3 : -0.2; if (o === 'West Coast') syn += 0.1; if (o === 'Play Action') syn += rb >= 72 ? 0.3 : -0.1;
    if (df === 'Man Press') syn += db >= 76 ? 0.5 : -0.4; if (df === 'Zone Blitz') syn += dl >= 76 ? 0.5 : -0.3; if (df === 'Tampa 2' || df === 'Cover 3') syn += 0.1;
    return { delta: round1(delta), synergy: round1(syn), score: clamp(1 + delta / 10, 0, 1) };
  },
  // Fields the 2D / quick-sim engines should read for the user's team (documented in core/career/API.md).
  engineConfig(spec, c, abbr, tac) {
    const bonus = staffFx(spec, c, abbr);
    return { sport: 'nfl', team: abbr, depth: tac.depth, offense: { ...tac.offense, passShare: tac.playbook.passShare, deepRate: tac.playbook.deepRate, rpoRate: tac.playbook.rpoRate, screenRate: tac.playbook.screenRate },
      defense: { ...tac.defense, blitzRate: tac.gameplan.blitzRate }, specialTeams: tac.specialTeams, gameplan: { focus: tac.gameplan.focus, fourthDown: tac.gameplan.fourthDown, twoPoint: tac.gameplan.twoPoint }, staff: bonus };
  },
  // legacy c.tactics keys (balance / fourth / blitz) kept in sync so the old Hub and tacticEffect keep working
  legacyTactics(tac) { return { balance: tac.playbook.passShare >= 0.6 ? 'passe' : tac.playbook.passShare <= 0.45 ? 'corrida' : 'equilibrado', fourth: tac.gameplan.fourthDown, blitz: tac.gameplan.blitzRate >= 0.5 ? 'frequente' : tac.gameplan.blitzRate <= 0.15 ? 'raro' : 'normal' }; },
  weeklyGameplan(spec, c, abbr, opp) {
    const mine = teamPlayers(c, abbr, { active: true }), theirs = teamPlayers(c, opp, { active: true });
    const strength = (list, grp) => mean(ranked(list.filter(p => g(spec, p) === grp)).slice(0, STARTERS[grp]), p => p.ovr);
    const passGap = strength(mine, 'QB') + strength(mine, 'WR') - 2 * strength(theirs, 'DB'), runGap = strength(mine, 'OL') + strength(mine, 'RB') - strength(theirs, 'DL') - strength(theirs, 'LB');
    const rushGap = strength(mine, 'DL') - strength(theirs, 'OL');
    const focus = passGap > runGap + 4 ? 'atacar o passe' : runGap > passGap + 4 ? 'atacar a corrida' : rushGap > 6 ? 'pressionar o QB' : 'equilibrado';
    return { opp, focus, passGap: round1(passGap), runGap: round1(runGap), rushGap: round1(rushGap), note: `Plano sugerido contra ${opp}: ${focus}.` };
  },

  // ---------- legality ----------
  legality(spec, c, abbr) {
    const list = Object.values(c.players).filter(p => p.t === abbr), act = list.filter(p => p.st === 'ACT'), ps = list.filter(p => p.st === 'MIN');
    const pay = payroll(Object.values(c.players), abbr), issues = [];
    if (pay > spec.cap.limit + 0.01) issues.push({ code: 'CAP', text: `Folha ${round1(pay)}M acima do teto ${spec.cap.limit}M` });
    if (act.length > spec.roster.max) issues.push({ code: 'ROSTER_MAX', text: `Elenco ativo ${act.length} > ${spec.roster.max}` });
    if (act.length < spec.roster.min) issues.push({ code: 'ROSTER_MIN', text: `Elenco ativo ${act.length} < ${spec.roster.min}` });
    if (ps.length > 16) issues.push({ code: 'PS_MAX', text: `Practice squad ${ps.length} > 16` });
    return { ok: !issues.length, issues, stats: { payroll: round1(pay), cap: spec.cap.limit, capSpace: round1(spec.cap.limit - pay), active: act.length, practiceSquad: ps.length, ir: list.filter(p => p.st === 'IR').length } };
  },
  normalizeTeam(spec, c, abbr, { cutToFA }) {
    const all = Object.values(c.players), list = all.filter(p => p.t === abbr);
    const pay = payroll(all, abbr);
    if (pay > spec.cap.limit * 0.97) { const f = (spec.cap.limit * 0.955) / pay; for (const p of list) if (p.c) p.c.sal = Math.max(spec.salary.min, round1(p.c.sal * f * 100) / 100); }
    let act = list.filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr);
    for (const p of act.slice(spec.roster.max)) p.st = 'MIN';
    const ps = list.filter(p => p.st === 'MIN').sort((a, b) => b.ovr - a.ovr);
    for (const p of ps.slice(16)) cutToFA(p);
  },
  // Compliance for AI teams (and user teams at the start of the regular season): release the least valuable contracts.
  enforceTeam(spec, c, abbr, { cutToFA }) {
    const all = Object.values(c.players);
    const lst = () => all.filter(p => p.t === abbr);
    let guard = 0;
    while (payroll(all, abbr) > spec.cap.limit && guard++ < 60) {
      const cand = lst().filter(p => p.c && p.st !== 'PROSPECT').sort((a, b) => ((a.ovr - 55) / Math.max(0.5, a.c.sal)) - ((b.ovr - 55) / Math.max(0.5, b.c.sal)))[0];
      if (!cand) break; cutToFA(cand);
    }
    const act = lst().filter(p => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr);
    for (const p of act.slice(spec.roster.max)) p.st = 'MIN';
    const ps = lst().filter(p => p.st === 'MIN').sort((a, b) => b.ovr - a.ovr);
    for (const p of ps.slice(16)) cutToFA(p);
    // minimum active roster: promote the practice squad, then sign the best free agents at the minimum salary
    let n = lst().filter(p => p.st === 'ACT').length;
    for (const p of lst().filter(q => q.st === 'MIN').sort((a, b) => b.ovr - a.ovr)) { if (n >= spec.roster.min) break; p.st = 'ACT'; n++; }
    if (n < spec.roster.min) for (const p of all.filter(q => q.t === 'FA' && q.st === 'FA').sort((a, b) => b.ovr - a.ovr)) { if (n >= spec.roster.min) break; if (payroll(all, abbr) + spec.salary.min > spec.cap.limit) break; p.t = abbr; p.st = 'ACT'; p.c = { sal: spec.salary.min, yrs: 1, kind: 'VET' }; n++; }
  },
  validateTrade(spec, c, { aiTeam, userTeam, give, get }) {
    // cap: each side must end under the cap (or reduce its payroll)
    const all = Object.values(c.players);
    const chk = (team, out, inn) => { const before = payroll(all, team), after = before - out.reduce((a, p) => a + (p.c?.sal || 0), 0) + inn.reduce((a, p) => a + (p.c?.sal || 0), 0); return after <= spec.cap.limit || after <= before ? null : `${team} estouraria o teto salarial (${round1(after)}M > ${spec.cap.limit}M)`; };
    return chk(userTeam, give, get) || chk(aiTeam, get, give);
  },

  // ---------- sport-specific actions (documented in API.md) ----------
  actions: {
    // Franchise tag: one per offseason, 1-year contract at the average of the top-5 market values of the position group.
    franchiseTag(spec, c, id) {
      const p = c.players[id], x = c.x;
      if (!p || p.t !== c.userTeam) return { ok: false, text: 'Jogador não está no seu time.' };
      if (c.phase !== 'OFFSEASON' || !['RESIGN', 'AWARDS', 'PROGRESSION'].includes(c.off)) return { ok: false, text: 'A tag só pode ser usada antes da free agency.' };
      if (x.gm.tagUsed === c.season) return { ok: false, text: 'Você já usou a franchise tag nesta temporada.' };
      if (!(p.expiring || (p.c && p.c.yrs <= 1))) return { ok: false, text: 'O contrato não está vencendo.' };
      const grp = g(spec, p), top = Object.values(c.players).filter(q => g(spec, q) === grp && q.c && q.st === 'ACT').sort((a, b) => b.c.sal - a.c.sal).slice(0, 5);
      const sal = round1(Math.max(p.c?.sal || 0, mean(top, q => q.c.sal)));
      const all = Object.values(c.players), before = p.c.sal;
      if (payroll(all, c.userTeam) - before + sal > spec.cap.limit) return { ok: false, text: `Sem espaço no teto para a tag (${sal}M).` };
      p.c = { sal, yrs: 1, kind: 'TAG' }; p.expiring = false; x.gm.tagUsed = c.season;
      if (p.rel) p.rel.tr = clamp(p.rel.tr - 4, 0, 100);
      return { ok: true, text: `${p.n} recebe a franchise tag: ${sal}M por 1 ano.`, sal };
    },
    signPracticeSquad(spec, c, id) {
      const p = c.players[id], ps = teamPlayers(c, c.userTeam).filter(q => q.st === 'MIN');
      if (!p || p.t !== 'FA') return { ok: false, text: 'Jogador indisponível.' };
      if (ps.length >= 16) return { ok: false, text: 'Practice squad cheio (16).' };
      p.t = c.userTeam; p.st = 'MIN'; p.c = { sal: spec.salary.min, yrs: 1, kind: 'PS' };
      return { ok: true, text: `${p.n} assinado para o practice squad.` };
    },
    promotePracticeSquad(spec, c, id) {
      const p = c.players[id];
      if (!p || p.t !== c.userTeam || p.st !== 'MIN') return { ok: false, text: 'Jogador não está no practice squad.' };
      if (teamPlayers(c, c.userTeam).filter(q => q.st === 'ACT').length >= spec.roster.max) return { ok: false, text: `Elenco ativo cheio (${spec.roster.max}).` };
      if (payroll(Object.values(c.players), c.userTeam) + Math.max(0, 0.9 - (p.c?.sal || 0)) > spec.cap.limit) return { ok: false, text: 'Sem espaço no teto.' };
      p.st = 'ACT'; if (p.c) p.c.kind = p.c.kind === 'PS' ? 'VET' : p.c.kind;
      return { ok: true, text: `${p.n} promovido ao elenco ativo.` };
    },
    demoteToPracticeSquad(spec, c, id) {
      const p = c.players[id];
      if (!p || p.t !== c.userTeam || p.st !== 'ACT') return { ok: false, text: 'Jogador não está no elenco ativo.' };
      if (teamPlayers(c, c.userTeam).filter(q => q.st === 'MIN').length >= 16) return { ok: false, text: 'Practice squad cheio (16).' };
      if (p.c && p.c.sal > 1.5 && p.c.yrs > 1) return { ok: false, text: 'Contratos garantidos não vão ao practice squad; dispense ou negocie.' };
      p.st = 'MIN'; return { ok: true, text: `${p.n} foi para o practice squad.` };
    },
  },
};
