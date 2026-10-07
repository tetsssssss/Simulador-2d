// NHL career rules (sport-specific): 32 teams, 82 games, points standings, 16-team playoffs (best of 7), hard cap,
// ELC / RFA / UFA, AHL assignments, 7-round draft, Junior (CHL) → Draft → AHL → NHL for the player career.
// Real games of the user's team run on the HockeySimulationEngine (career OVR scales the engine ratings).
import { D, fromSnapshot, loadSnapshot, makeAttrs, overall, playerName, nameOf } from '../nhlData.js';
import { nhlColor } from '../teamColors.js';
import { buildLineup } from '../game/lineup.js';
import { createHockeyEngine } from '../sim/hockeyEngine.js';
import { simRatings } from '../sim/ratings.js';
import { clamp, poisson, avg, topBy, assignByQuota, expectedByQuota, needsByQuota, estimatedAge, rankLabel } from '../../../core/career/specKit.js';
import { NHL_V3 } from './nhlRules.js';
import { engineConfig } from '../../../core/career/tactics.js';

const GROUP = pos => (pos === 'G' ? 'G' : pos === 'D' ? 'D' : 'F');
const QUOTA = { F: [6, 6], D: [4, 2], G: [1, 1] };
const POS = { C: 'C', L: 'LW', R: 'RW', D: 'D', G: 'G' };
const raw = new Map(); // career id → raw roster object (engine input)
const ovrScale = new Map();

function toCareer(p) {
  const id = `nhl-${p.id}`, a = makeAttrs(p), ovr = overall(p, a), s = p.stats || {};
  const usage = clamp(((s.toi || 10) - 8) / 14, 0, 1);
  raw.set(id, p);
  // usage-weighted rating: real deployment (TOI) separates regulars from depth players in a 24-man roster
  const o = clamp(Math.round(ovr * 0.75 + (55 + usage * 33) * 0.25), 40, 97);
  ovrScale.set(id, { base: ovr });
  return { id, src: p.id, n: playerName(p), pos: POS[p.positionCode] || 'C', num: p.sweaterNumber ?? '', t: p.teamAbbr, st: 'ACT', age: estimatedAge(p.id, usage), ageEst: true,
    ovr: o, pot: clamp(o + (o < 70 ? 6 : 2), o, 97), hand: p.shootsCatches || '' };
}

export const NHL_SPEC = {
  v3: NHL_V3,
  sport: 'nhl', label: 'NHL', confLabel: 'Conferência', starOvr: 80, usePoints: true, homeAdvantage: 1.5, aiTradeRate: 0.025,
  calendar: { games: 82, crossesYear: true, startMonth: 10, startDay: 8, slateDays: 2.2, firstSeason: 2026 },
  scoring: { kind: 'poisson', mean: 3.05, k: 0.018, ties: false, otLoss: true, otAdds: 1 },
  playoffs: { perConf: 8, byes: 0, bestOf: [7, 7, 7, 7], names: ['1ª rodada', '2ª rodada', 'Final de conferência', 'Stanley Cup Final'] },
  ageCurve: { growthEnd: 24, peakEnd: 30, decline: 1.6, retireMin: 34 },
  injuries: { perPlayerGame: 0.0055, irGames: 7, table: [['Lower-body', 1, 6], ['Upper-body', 1, 8], ['Concussão', 3, 15], ['Joelho', 8, 30], ['Ombro', 5, 25], ['Mão', 4, 12]] },
  salary: { min: 0.78, max: 16, floorOvr: 58, curve: 1.7 }, positionPremium: { G: 0.85, D: 0.95 },
  cap: { limit: 95.5, kind: 'hard', label: 'Salary cap (referência 2025-26)' },
  roster: { max: 23, min: 20 }, minorsLabel: 'para a AHL', trade: { surplusWeight: 1.2 }, waivers: true,
  draft: { rounds: 7, positions: ['C', 'C', 'LW', 'RW', 'D', 'D', 'G'], potMean: 66, potSd: 8, gapMean: 15, gapSd: 5, ageMin: 18, ageMax: 19, undraftedKeep: 70,
    rookieContract: s => ({ sal: s.round === 1 ? 0.95 : 0.85, yrs: 3, kind: 'ELC' }), initialStatus: p => { if (p.ovr >= 64) return 'ACT'; p.lvl = p.age <= 19 ? (p.id.length % 3 === 0 ? 'EUROPE' : 'JUNIOR') : 'AHL'; return 'MIN'; } },
  tactics: [
    { key: 'forecheck', label: 'Forecheck', options: ['passivo', 'equilibrado', 'agressivo'], default: 'equilibrado' },
    { key: 'pace', label: 'Ritmo', options: ['controlado', 'normal', 'rápido'], default: 'normal' },
    { key: 'lines', label: 'Distribuição das linhas', options: ['equilibradas', 'top-heavy'], default: 'equilibradas' },
  ],
  tacticEffect(t, list) {
    const fwd = list.filter(p => GROUP(p.pos) === 'F'), top6 = avg(topBy(fwd, 6)), depth = avg(topBy(fwd, 12).slice(6));
    let e = 0;
    if (t.forecheck === 'agressivo') e += avg(list, p => p.age) < 27 ? 0.8 : -0.4;
    if (t.forecheck === 'passivo') e += avg(topBy(list.filter(p => p.pos === 'G'), 1)) > 82 ? 0.5 : -0.3;
    if (t.lines === 'top-heavy') e += top6 - depth > 8 ? 0.9 : -0.3;
    if (t.pace === 'rápido') e += avg(list, p => p.age) < 27 ? 0.4 : -0.4;
    return e;
  },
  posGroup: GROUP, positions: ['C', 'LW', 'RW', 'D', 'G'],
  teamRating(list) {
    const F = topBy(list.filter(p => GROUP(p.pos) === 'F'), 12), Dm = topBy(list.filter(p => p.pos === 'D'), 6), G = topBy(list.filter(p => p.pos === 'G'), 1);
    return 0.45 * avg(F, p => p.ovr) + 0.25 * avg(Dm, p => p.ovr) + 0.3 * (G[0]?.ovr ?? 60);
  },
  assignRoles(list, c, abbr, opts = {}) { assignByQuota(list, GROUP, QUOTA, { ...opts, trust: true }); },
  expectedRole: (p, list) => expectedByQuota(p, list, GROUP, QUOTA),
  teamNeeds: list => needsByQuota(list, GROUP, { F: 12, D: 6, G: 2 }),
  estimateService: p => Math.max(0, p.age - 20),

  loadLeague() { return (this._league ||= this._load()); },
  async _load() {
    const snap = await loadSnapshot();
    const teams = D.teams.map(t => ({ abbr: t.abbr, name: t.name, conf: t.conference, div: t.division, color: nhlColor(t.abbr) }));
    const players = snap.players.map(fromSnapshot).map(toCareer);
    return { teams, players, note: `Elencos: ${snap.source} (${snap.season}). Idades estimadas (snapshot sem data de nascimento); contratos estimados.` };
  },
  async ensureRuntime(c) { if (raw.size) return; const snap = await loadSnapshot(); for (const p of snap.players.map(fromSnapshot)) raw.set(`nhl-${p.id}`, p); },

  // ---------- real engine for the user's games ----------
  async simulateGame(c, h, a, seed) {
    await this.ensureRuntime(c);
    const build = side => {
      const abbr = side === 'home' ? h : a;
      const list = Object.values(c.players).filter(p => p.t === abbr && p.st === 'ACT' && !p.inj);
      const rows = list.map(p => rawFor(p));
      const T = D.teams.find(t => t.abbr === abbr);
      const lineup = buildLineup(rows), cfg = engineConfig(NHL_SPEC, c, abbr);
      if (abbr === c.userTeam && c.role === 'COACH' && c.x?.tac) applyUserLines(lineup, cfg, list);
      return { abbr, name: T?.name || abbr, color: nhlColor(abbr), color2: nhlColor(abbr, 1), lineup, tactics: cfg };
    };
    const home = build('home'), away = build('away');
    if (!home.lineup.ok || !away.lineup.ok) throw new Error('elenco incompleto para o motor');
    const byRaw = new Map(Object.values(c.players).filter(p => p.t === h || p.t === a).map(p => [String(rawFor(p).id), p]));
    const ratingsOf = rp => { const base = simRatings(makeAttrs(rp), rp.positionCode === 'G'), cp = byRaw.get(String(rp.id)); if (!cp) return base; const f = clamp(cp.ovr / Math.max(40, overall(rp, makeAttrs(rp))), 0.8, 1.25); return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, clamp(v * f, 0.2, 0.99)])); };
    const e = createHockeyEngine({ home, away, seed, ratingsOf });
    let n = 0; while (!e.state.over && n++ < 200) { e.simulate(120, { maxEvents: 1e9 }); await new Promise(r => setTimeout(r, 0)); }
    const S = e.state;
    const lines = nhlLinesFromState(S).map(([pid, l]) => [byRaw.get(pid)?.id, l]).filter(x => x[0]);
    return { hs: S.score.home, as: S.score.away, ot: S.period >= 4, lines, engine: true };
  },
  // 2D bridge: raw roster rows for a career game played in the Partida 2D view, and raw id → career id
  async rostersFor2D(c, h, a) { await this.ensureRuntime(c); const rows = abbr => Object.values(c.players).filter(p => p.t === abbr && p.st === 'ACT' && !p.inj).map(rawFor); return { home: rows(h), away: rows(a) }; },
  rawIdMap(c, abbrs) { return new Map(Object.values(c.players).filter(p => abbrs.includes(p.t)).map(p => [String(rawFor(p).id), p.id])); },
  // quick-result stat lines (approximate distribution of the team score)
  statLine(p, rng, { teamScore, oppScore }) {
    const roleM = p.role === 'S' ? 1 : p.role === 'R' ? 0.62 : 0.3;
    if (p.pos === 'G') return p.role === 'S' ? (() => { const sa = poisson(rng, 30); return { sa, sv: Math.max(0, sa - oppScore), ga: oppScore, w: teamScore > oppScore ? 1 : 0 }; })() : {};
    const off = (GROUP(p.pos) === 'F' ? 0.085 : 0.03) * Math.pow(p.ovr / 75, 3) * roleM;
    const g = Math.min(teamScore, poisson(rng, teamScore * off)), a = poisson(rng, teamScore * off * 1.6);
    return { g, a, pts: g + a, sog: poisson(rng, (GROUP(p.pos) === 'F' ? 2.4 : 1.4) * roleM * (p.ovr / 75)), hit: poisson(rng, 1.1 * roleM), blk: poisson(rng, (p.pos === 'D' ? 1.4 : 0.4) * roleM), pm: rng.int(-1, 1) + Math.sign(teamScore - oppScore) * (rng.next() < roleM ? 1 : 0) };
  },
  statKeys: p => (p.pos === 'G' ? [['gp', 'J'], ['w', 'V'], ['sa', 'SA'], ['sv', 'SV'], ['ga', 'GA']] : [['gp', 'J'], ['g', 'G'], ['a', 'A'], ['pts', 'PTS'], ['sog', 'SOG'], ['hit', 'HIT'], ['pm', '+/-']]),
  formatLine: l => (l.sa != null && l.g == null ? `${l.gp || 0} J · ${l.sa ? ((l.sv / l.sa) || 0).toFixed(3).replace(/^0/, '') : '—'} SV%` : `${l.gp || 0} J · ${l.g || 0} G · ${l.a || 0} A · ${(l.g || 0) + (l.a || 0)} PTS`),
  awards(c) {
    const pl = Object.values(c.players).filter(p => p.ps?.gp >= 20 && p.t !== 'FA');
    const best = (f, filter) => pl.filter(filter).sort((a, b) => f(b) - f(a))[0];
    const out = [];
    const hart = best(p => (p.ps.pts || 0) + p.ovr * 0.3, p => p.pos !== 'G'); if (hart) out.push({ award: 'Hart Trophy (MVP)', name: hart.n, team: hart.t, id: hart.id });
    const art = best(p => p.ps.pts || 0, p => p.pos !== 'G'); if (art) out.push({ award: 'Art Ross (pontos)', name: art.n, team: art.t, id: art.id });
    const vez = best(p => (p.ps.sv || 0) / Math.max(1, p.ps.sa || 1) + p.ovr / 2000, p => p.pos === 'G' && (p.ps.sa || 0) > 400); if (vez) out.push({ award: 'Vezina (goleiro)', name: vez.n, team: vez.t, id: vez.id });
    const nor = best(p => (p.ps.pts || 0) + p.ovr * 0.5, p => p.pos === 'D'); if (nor) out.push({ award: 'Norris (defensor)', name: nor.n, team: nor.t, id: nor.id });
    const cal = best(p => (p.ps.pts || 0) + p.ovr * 0.2, p => p.age <= 21 && p.pos !== 'G'); if (cal) out.push({ award: 'Calder (novato)', name: cal.n, team: cal.t, id: cal.id });
    return out;
  },
  contractYear(c) { for (const p of Object.values(c.players)) if (p.c && p.c.yrs <= 0) p.rfa = p.age < 27 && (p.svc || 0) < 7; },
  cutDown(c) { // AI teams send extra players to the AHL
    for (const t of c.teams) { const list = Object.values(c.players).filter(p => p.t === t.abbr && p.st === 'ACT').sort((a, b) => b.ovr - a.ovr); list.slice(this.roster.max).forEach(p => { p.st = 'MIN'; }); const minors = Object.values(c.players).filter(p => p.t === t.abbr && p.st === 'MIN').sort((a, b) => b.ovr - a.ovr); for (const p of minors) { if (list.length >= this.roster.max) break; if (p.ovr >= (list.at(-1)?.ovr ?? 0)) { p.st = 'ACT'; list.push(p); } } }
  },

  // ---------- player career ----------
  roadToPro: [
    { key: 'JUNIOR', label: 'Junior (CHL)', years: 3, kind: 'amateur', games: 68, autoDeclare: true },
    { key: 'COLLEGE', label: 'College (NCAA)', years: 3, kind: 'amateur', games: 38, autoDeclare: true },
    { key: 'EUROPE', label: 'Europa (liga profissional)', years: 3, kind: 'amateur', games: 50, autoDeclare: true },
    { key: 'AHL', label: 'AHL', kind: 'minors' },
    { key: 'NHL', label: 'NHL', kind: 'pro' },
  ],
  archetypes: { C: ['Playmaker', 'Sniper', 'Two-way', 'Power forward'], LW: ['Sniper', 'Power forward', 'Grinder'], RW: ['Sniper', 'Playmaker', 'Power forward'], D: ['Ofensivo', 'Defensivo', 'Two-way'], G: ['Híbrido', 'Butterfly'] },
  createPlayer({ name, pos = 'C', archetype, talent = 'alto', age = 17, num = 91 }, rng) {
    const base = { raro: 54, alto: 50, medio: 46 }[talent] ?? 50, pot = { raro: 92, alto: 86, medio: 78 }[talent] ?? 86;
    return { n: name || 'Jogador Criado', pos, arch: archetype || this.archetypes[pos]?.[0], age, ovr: base + rng.int(-2, 2), pot: pot + rng.int(-3, 3), t: 'AMATEUR', st: 'AMATEUR', num, c: null, svc: 0 };
  },
  amateurSeason(me, st, rng, focus) {
    const gp = st.games - rng.int(0, 6);
    if (me.pos === 'G') { const sa = gp * 28, sv = Math.round(sa * clamp(0.86 + (me.ovr - 45) * 0.0012, 0.86, 0.93)); return { gp, sa, sv, ga: sa - sv }; }
    const ppg = clamp(0.3 + (me.ovr - 45) * 0.045 + (me.pos === 'D' ? -0.25 : 0), 0.1, 2.2);
    const pts = Math.round(gp * ppg * (0.85 + rng.next() * 0.3)), g = Math.round(pts * (me.arch === 'Sniper' ? 0.55 : me.pos === 'D' ? 0.25 : 0.42));
    return { gp, g, a: pts - g, pts };
  },
  draftStock(me, line, c) {
    const score = me.pot * 0.65 + me.ovr * 0.35 + (line.pts ? Math.min(6, line.pts / 20) : 0);
    const pool = Object.values(c.players).filter(p => p.st === 'PROSPECT' && p.t === 'DRAFT' && !p.mine);
    const rank = pool.filter(p => p.pot * 0.65 + p.ovr * 0.35 > score).length + 1;
    return { rank, label: rankLabel(rank, c.teams.length), bonus: Math.min(6, (line.pts || 0) / 25) };
  },
  minorsPromotion(c, me) {
    if (me.st !== 'MIN') return;
    const list = Object.values(c.players).filter(p => p.t === me.t && p.st === 'ACT' && GROUP(p.pos) === GROUP(me.pos)).sort((a, b) => b.ovr - a.ovr);
    const cut = list[GROUP(me.pos) === 'F' ? 11 : GROUP(me.pos) === 'D' ? 6 : 1]?.ovr ?? 0;
    if (me.ovr >= cut) { me.st = 'ACT'; c.me.stage = 'NHL'; c.news.unshift({ s: c.season, text: `${me.n} é chamado para o elenco da NHL do ${me.t}!`, kind: 'big', d: '' }); }
  },
  minorsLine(me, rng) { return this.statLine({ ...me, role: 'S', ovr: me.ovr + 5 }, rng, { teamScore: 3, oppScore: 3 }); },
  playerGoals(me, c) {
    const st = c.me?.stage;
    if (st === 'JUNIOR') return [{ key: 'pts', target: Math.round(40 + (me.ovr - 45) * 3), text: `Somar ${Math.round(40 + (me.ovr - 45) * 3)}+ pontos no Junior`, w: 1 }, { key: 'stock', target: 32, text: 'Projeção de 1ª rodada no draft', w: 1 }];
    if (st === 'AHL') return [{ key: 'callup', text: 'Ser chamado para a NHL', w: 1 }];
    return [{ key: 'gp', target: 60, text: 'Jogar 60+ jogos', w: 1 }, { key: 'pts', target: Math.max(10, Math.round((me.ovr - 60) * 2.2)), text: `Somar ${Math.max(10, Math.round((me.ovr - 60) * 2.2))}+ pontos`, w: 1 }];
  },
  evaluatePlayerGoal(g, c) {
    const me = c.players[c.me.id], line = me.ps?.gp ? me.ps : me.hist?.at(-1) || {};
    if (g.key === 'pts') return (line.pts || 0) >= g.target; if (g.key === 'gp') return (line.gp || 0) >= g.target;
    if (g.key === 'stock') return (c.me.stock?.rank ?? 999) <= g.target; if (g.key === 'callup') return me.st === 'ACT';
    return false;
  },
};
// Engine state → per-player lines keyed by the raw roster id (used by the career sim and by the 2D view).
export function nhlLinesFromState(S) {
  const out = [];
  for (const [rid, b] of Object.entries(S.box)) {
    const rec = S.roster[rid]; if (!rec) continue;
    const won = S.score[rec.team] > S.score[rec.team === 'home' ? 'away' : 'home'];
    out.push([String(rec.pid), rec.goalie ? { sa: b.sa, sv: b.sv, ga: b.ga, w: won ? 1 : 0 } : { g: b.g, a: b.a, pts: b.g + b.a, sog: b.sog, hit: b.hit, blk: b.blk, pm: b.pm, pim: b.pim }]);
  }
  return out;
}
// The user's saved lines / pairs / goalies replace the automatic lineup handed to the engine (when complete and healthy).
function applyUserLines(lineup, cfg, list) {
  const row = new Map(list.map(p => [p.id, rawFor(p)]));
  const lines = cfg.lines.map(l => ({ C: row.get(l[0]), LW: row.get(l[1]), RW: row.get(l[2]) })), pairs = cfg.pairs.map(l => ({ LD: row.get(l[0]), RD: row.get(l[1]) }));
  const goalies = [row.get(cfg.goalie.starter), row.get(cfg.goalie.backup)].filter(Boolean);
  if (lines.every(l => l.C && l.LW && l.RW) && pairs.every(l => l.LD && l.RD) && goalies.length) { lineup.lines = lines; lineup.pairs = pairs; lineup.goalies = goalies; }
}
// raw engine row for a career player (real snapshot record, or a synthetic one for drafted / created players)
function rawFor(p) {
  if (raw.has(p.id)) { const r = raw.get(p.id); return { ...r, teamAbbr: p.t, positionCode: p.pos === 'LW' ? 'L' : p.pos === 'RW' ? 'R' : p.pos }; }
  const num = parseInt(String(p.id).replace(/\D/g, '').slice(-7) || '1', 10) + 9000000;
  const [first, ...rest] = p.n.split(' ');
  const r = { id: num, firstName: { default: first }, lastName: { default: rest.join(' ') || first }, positionCode: p.pos === 'LW' ? 'L' : p.pos === 'RW' ? 'R' : p.pos, sweaterNumber: p.num || '', teamAbbr: p.t, source: 'career', stats: { toi: p.role === 'S' ? 18 : 12, gp: 20 } };
  raw.set(p.id, r); return r;
}
export { nameOf };
