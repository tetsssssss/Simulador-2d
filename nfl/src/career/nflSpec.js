// NFL career rules (sport-specific): 32 teams, 17 games, 14-team playoffs (byes for the #1 seeds, single games),
// hard cap, 53-man roster + practice squad, rookie contracts, 7-round draft, College → Draft → NFL for the player.
// The user's games run on the real NFL engine (every snap simulated) when "motor" is on.
import { parseCSV, normalizePlayer } from '../dataService.js';
import { makeRatings, overall } from '../ratings.js';
import { simulateGame } from '../game/match.js';
import { TEAM_COLORS } from '../ui/teamColors.js';
import { clamp, poisson, avg, topBy, assignByQuota, expectedByQuota, needsByQuota, rankLabel } from '../../../core/career/specKit.js';

const G = pos => ({ QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', T: 'OL', G: 'OL', C: 'OL', OL: 'OL', OT: 'OL', OG: 'OL', DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', EDGE: 'DL', OLB: 'LB', ILB: 'LB', MLB: 'LB', LB: 'LB', CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', DB: 'DB', K: 'K', P: 'P', LS: 'LS' }[pos] || 'DB');
const QUOTA = { QB: [1, 1], RB: [1, 2], WR: [3, 2], TE: [1, 1], OL: [5, 3], DL: [4, 3], LB: [3, 2], DB: [4, 3], K: [1, 0], P: [1, 0], LS: [1, 0] };
const rows = new Map();
const scale = x => clamp(Math.round(45 + (x - 135) * 1.35), 35, 99);

async function loadRows() {
  try { const cached = JSON.parse(localStorage.getItem('asu_roster_2026') || 'null'); if (Array.isArray(cached) && cached.length > 1500) return { rows: cached, src: 'nflverse (cache local)' }; } catch { /* no cache */ }
  const res = await fetch(new URL('../../data/roster_2026.csv', import.meta.url));
  return { rows: parseCSV(await res.text()).map(normalizePlayer).filter(p => p.full_name && p.team), src: 'snapshot local nflverse 2026' };
}

export const NFL_SPEC = {
  sport: 'nfl', label: 'NFL', confLabel: 'Conferência', starOvr: 86, usePoints: false, homeAdvantage: 1.2, aiTradeRate: 0.06,
  calendar: { games: 17, crossesYear: false, startMonth: 9, startDay: 10, slateDays: 7, firstSeason: 2026 },
  scoring: { kind: 'normal', mean: 22, sd: 9.5, k: 0.55, ties: false, otLoss: false, otAdds: 3 },
  playoffs: { perConf: 7, byes: 1, bestOf: [1, 1, 1, 1], names: ['Wild Card', 'Divisional', 'Final de conferência', 'Super Bowl'] },
  ageCurve: { growthEnd: 25, peakEnd: 29, decline: 2.2, retireMin: 31 },
  injuries: { perPlayerGame: 0.011, irGames: 4, table: [['Isquiotibial', 1, 4], ['Tornozelo', 1, 4], ['Ombro', 2, 6], ['Joelho (LCM)', 3, 8], ['Concussão', 1, 3], ['Costas', 1, 5], ['LCA', 14, 17]] },
  salary: { min: 0.84, max: 45, floorOvr: 60, curve: 2.0 }, positionPremium: { QB: 1.7, DL: 1.15, WR: 1.1, OL: 1.0, DB: 0.95, TE: 0.8, LB: 0.8, RB: 0.65, K: 0.3, P: 0.25, LS: 0.2 },
  cap: { limit: 279.2, kind: 'hard', label: 'Salary cap (referência 2025)' },
  roster: { max: 53, min: 46 }, minorsLabel: 'para o practice squad', trade: { surplusWeight: 0.9 }, waivers: true,
  draft: { rounds: 7, positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'T', 'G', 'C', 'DE', 'DT', 'OLB', 'ILB', 'CB', 'CB', 'S', 'K'], potMean: 70, potSd: 8, gapMean: 12, gapSd: 5, ageMin: 21, ageMax: 23, undraftedKeep: 72,
    rookieContract: s => ({ sal: Math.max(0.84, +(11 - s.overall * 0.045).toFixed(2)), yrs: s.round === 1 ? 5 : 4, kind: 'ROOKIE' }), initialStatus: p => (p.ovr >= 58 ? 'ACT' : 'MIN') },
  tactics: [
    { key: 'balance', label: 'Equilíbrio corrida/passe', options: ['corrida', 'equilibrado', 'passe'], default: 'equilibrado' },
    { key: 'fourth', label: 'Agressividade na 4ª descida', options: ['conservador', 'normal', 'agressivo'], default: 'normal' },
    { key: 'blitz', label: 'Blitz', options: ['raro', 'normal', 'frequente'], default: 'normal' },
  ],
  tacticEffect(t, list) {
    const qb = topBy(list.filter(p => G(p.pos) === 'QB'), 1)[0]?.ovr ?? 60, rb = topBy(list.filter(p => G(p.pos) === 'RB'), 1)[0]?.ovr ?? 60, dl = avg(topBy(list.filter(p => G(p.pos) === 'DL'), 4));
    let e = 0;
    if (t.balance === 'passe') e += qb >= 82 ? 0.9 : -0.6; if (t.balance === 'corrida') e += rb >= 80 ? 0.6 : -0.4;
    if (t.fourth === 'agressivo') e += 0.3; if (t.blitz === 'frequente') e += dl >= 78 ? 0.5 : -0.4;
    return e;
  },
  posGroup: G, positions: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'],
  teamRating(list) {
    const g = k => list.filter(p => G(p.pos) === k), t = (k, n) => avg(topBy(g(k), n));
    return 0.24 * (topBy(g('QB'), 1)[0]?.ovr ?? 55) + 0.06 * t('RB', 1) + 0.12 * t('WR', 3) + 0.04 * t('TE', 1) + 0.14 * t('OL', 5) + 0.15 * t('DL', 4) + 0.08 * t('LB', 3) + 0.15 * t('DB', 4) + 0.02 * t('K', 1);
  },
  assignRoles(list, c, abbr, opts = {}) { assignByQuota(list, G, QUOTA, { ...opts, trust: true }); },
  expectedRole: (p, list) => expectedByQuota(p, list, G, QUOTA),
  teamNeeds: list => needsByQuota(list, G, { QB: 2, RB: 3, WR: 5, TE: 3, OL: 8, DL: 7, LB: 5, DB: 8, K: 1, P: 1 }),
  estimateService: p => p.svc ?? 0,

  loadLeague() { return (this._league ||= this._load()); },
  async _load() {
    const [{ rows: rs, src }, teamsJson] = await Promise.all([loadRows(), fetch(new URL('../../data/teams.json', import.meta.url)).then(r => r.json())]);
    const teams = teamsJson.map(t => ({ abbr: t.abbr, name: t.name, conf: t.conference, div: `${t.conference} ${t.division}`, color: TEAM_COLORS[t.abbr] || '#24364d' }));
    const players = [];
    for (const r of rs) {
      if (!['ACT', 'RES', 'DEV'].includes(r.status) || !teams.some(t => t.abbr === r.team)) continue;
      const id = `nfl-${r.gsis_id || r.full_name.replace(/\W/g, '')}`; rows.set(id, r);
      const ovr = scale(overall(r, makeRatings(r))), age = r.age || 25;
      players.push({ id, src: r.gsis_id, n: r.full_name, pos: r.position, num: r.jersey_number, t: r.team, st: r.status === 'DEV' ? 'MIN' : r.status === 'RES' ? 'IR' : 'ACT', inj: r.status === 'RES' ? { type: 'Reserva/lesão', games: 6 } : null, age, ovr, pot: clamp(ovr + (age <= 24 ? 8 : age <= 26 ? 3 : 0), ovr, 99), svc: Number(r.years_exp || 0), college: r.college });
    }
    return { teams, players, note: `Elencos: ${src} (${players.length} atletas com idade real). Contratos estimados (sem dados reais de salário).` };
  },
  async ensureRuntime() { if (rows.size) return; const { rows: rs } = await loadRows(); for (const r of rs) rows.set(`nfl-${r.gsis_id || r.full_name.replace(/\W/g, '')}`, r); },
  async simulateGame(c, h, a, seed) {
    await this.ensureRuntime();
    const list = Object.values(c.players).filter(p => (p.t === h || p.t === a) && p.st === 'ACT' && !p.inj);
    const roster = list.map(p => rowFor(p)), byId = new Map(list.map(p => [String(rowFor(p).gsis_id), p]));
    const g = await simulateGame({ roster, home: h, away: a, seed, quarterMin: c.settings.nflQuarter || 15 });
    const lines = [];
    for (const bp of Object.values(g.box?.players || {})) {
      const cp = byId.get(String(bp.id)); if (!cp) continue;
      const l = { passYds: bp.pass?.att ? bp.pass.yds : null, passTd: bp.pass?.td || 0, int: bp.pass?.int || 0, rushYds: bp.rush?.yds || 0, rushTd: bp.rush?.td || 0, rec: bp.rec?.rec || 0, recYds: bp.rec?.yds || 0, recTd: bp.rec?.td || 0, tkl: (bp.def?.tkl || 0) + (bp.def?.ast || 0), sacks: bp.def?.sacks || 0, defInt: bp.def?.int || 0 };
      for (const k in l) if (!l[k]) delete l[k];
      if (bp.pass?.att) { l.passYds = bp.pass.yds || 0; l.passTd = bp.pass.td || 0; l.int = bp.pass.int || 0; }
      lines.push([cp.id, l]);
    }
    return { hs: g.homeScore, as: g.awayScore, ot: false, lines, engine: true };
  },
  statLine(p, rng, { teamScore }) {
    if (p.role !== 'S') return {};
    const q = p.ovr / 75, g = G(p.pos), td = Math.max(0, Math.round(teamScore / 7));
    if (g === 'QB') { const yds = Math.round(rng.normal(215 * q, 60)); return { passYds: Math.max(0, yds), passTd: Math.min(td, poisson(rng, 1.5 * q)), int: poisson(rng, 0.8 / q) }; }
    if (g === 'RB') return { rushYds: Math.max(-5, Math.round(rng.normal(62 * q, 30))), rushTd: poisson(rng, 0.35 * q), rec: poisson(rng, 2.5), recYds: Math.round(rng.normal(18, 10)) };
    if (g === 'WR' || g === 'TE') { const rec = poisson(rng, (g === 'WR' ? 4.2 : 3.2) * q); return { rec, recYds: Math.max(0, Math.round(rec * rng.normal(12, 3))), recTd: poisson(rng, 0.3 * q) }; }
    if (g === 'DL' || g === 'LB' || g === 'DB') return { tkl: poisson(rng, (g === 'LB' ? 6 : g === 'DB' ? 4.5 : 3.5) * q), sacks: g !== 'DB' ? +(poisson(rng, (g === 'DL' ? 0.45 : 0.2) * q)) : 0, defInt: g === 'DB' ? poisson(rng, 0.09 * q) : 0 };
    return {};
  },
  statKeys: p => ({ QB: [['gp', 'J'], ['passYds', 'Jds passe'], ['passTd', 'TD'], ['int', 'INT']], RB: [['gp', 'J'], ['rushYds', 'Jds corrida'], ['rushTd', 'TD'], ['rec', 'Rec']], WR: [['gp', 'J'], ['rec', 'Rec'], ['recYds', 'Jds'], ['recTd', 'TD']], TE: [['gp', 'J'], ['rec', 'Rec'], ['recYds', 'Jds'], ['recTd', 'TD']] }[G(p.pos)] || [['gp', 'J'], ['tkl', 'Tackles'], ['sacks', 'Sacks'], ['defInt', 'INT']]),
  formatLine(l) { if (l.passYds) return `${l.gp || 0} J · ${l.passYds} jds · ${l.passTd || 0} TD · ${l.int || 0} INT`; if (l.rushYds != null) return `${l.gp || 0} J · ${l.rushYds} jds corrida · ${l.rushTd || 0} TD`; if (l.recYds != null) return `${l.gp || 0} J · ${l.rec || 0} rec · ${l.recYds} jds · ${l.recTd || 0} TD`; if (l.tkl != null) return `${l.gp || 0} J · ${l.tkl} tackles · ${l.sacks || 0} sacks`; return `${l.gp || 0} J`; },
  awards(c) {
    const pl = Object.values(c.players).filter(p => p.ps?.gp >= 8 && p.t !== 'FA'), out = [];
    const best = (f, flt) => pl.filter(flt).sort((a, b) => f(b) - f(a))[0];
    const mvp = best(p => (p.ps.passTd || 0) * 6 + (p.ps.passYds || 0) / 25 - (p.ps.int || 0) * 4 + p.ovr, p => G(p.pos) === 'QB'); if (mvp) out.push({ award: 'MVP', name: mvp.n, team: mvp.t, id: mvp.id });
    const opoy = best(p => (p.ps.rushYds || 0) + (p.ps.recYds || 0) + ((p.ps.rushTd || 0) + (p.ps.recTd || 0)) * 40, p => ['RB', 'WR', 'TE'].includes(G(p.pos))); if (opoy) out.push({ award: 'Jogador Ofensivo do Ano', name: opoy.n, team: opoy.t, id: opoy.id });
    const dpoy = best(p => (p.ps.sacks || 0) * 10 + (p.ps.defInt || 0) * 12 + (p.ps.tkl || 0), p => ['DL', 'LB', 'DB'].includes(G(p.pos))); if (dpoy) out.push({ award: 'Jogador Defensivo do Ano', name: dpoy.n, team: dpoy.t, id: dpoy.id });
    const roy = best(p => p.ovr + (p.ps.gp || 0), p => (p.svc || 0) <= 1); if (roy) out.push({ award: 'Calouro do Ano', name: roy.n, team: roy.t, id: roy.id });
    return out;
  },
  cutDown(c) {
    for (const t of c.teams) { const act = Object.values(c.players).filter(p => p.t === t.abbr && p.st === 'ACT').sort((a, b) => b.ovr - a.ovr); act.slice(this.roster.max).forEach(p => { p.st = 'MIN'; }); }
  },
  roadToPro: [
    { key: 'COLLEGE', label: 'College (NCAA)', years: 4, kind: 'amateur', games: 12 },
    { key: 'NFL', label: 'NFL', kind: 'pro' },
  ],
  archetypes: { QB: ['Pocket passer', 'Dual threat'], RB: ['Power', 'Elusivo', 'Recebedor'], WR: ['Deep threat', 'Possession', 'Slot'], TE: ['Recebedor', 'Bloqueador'], OL: ['Pass protector', 'Run blocker'], DL: ['Pass rusher', 'Run stopper'], LB: ['Cobertura', 'Pass rusher', 'Run stopper'], DB: ['Man', 'Zona', 'Ball hawk'], K: ['Potente', 'Preciso'] },
  createPlayer({ name, pos = 'QB', archetype, talent = 'alto', age = 18, num = 12 }, rng) {
    const base = { raro: 52, alto: 48, medio: 44 }[talent] ?? 48, pot = { raro: 94, alto: 88, medio: 80 }[talent] ?? 88;
    return { n: name || 'Jogador Criado', pos, arch: archetype || this.archetypes[G(pos)]?.[0], age, ovr: base + rng.int(-2, 2), pot: pot + rng.int(-3, 3), t: 'AMATEUR', st: 'AMATEUR', num, c: null, svc: 0 };
  },
  amateurSeason(me, st, rng) {
    const gp = 12, q = 0.45 + 0.5 * clamp((me.ovr - 40) / 40, 0, 1.4), g = G(me.pos);
    if (g === 'QB') return { gp, passYds: Math.round(gp * 230 * q * (0.8 + rng.next() * 0.4)), passTd: Math.round(gp * 2.1 * q), int: Math.max(2, Math.round(gp * (1.25 - 0.55 * q) * (0.8 + rng.next() * 0.4))) };
    if (g === 'RB') return { gp, rushYds: Math.round(gp * 85 * q), rushTd: Math.round(gp * 0.9 * q) };
    if (g === 'WR' || g === 'TE') { const rec = Math.round(gp * 5 * q); return { gp, rec, recYds: Math.round(rec * 13), recTd: Math.round(gp * 0.6 * q) }; }
    return { gp, tkl: Math.round(gp * 5 * q), sacks: g === 'DL' ? Math.round(gp * 0.6 * q) : 0 };
  },
  draftStock(me, line, c) {
    const score = me.pot * 0.6 + me.ovr * 0.4;
    const rank = Object.values(c.players).filter(p => p.st === 'PROSPECT' && p.t === 'DRAFT' && !p.mine && p.pot * 0.6 + p.ovr * 0.4 > score).length + 1;
    return { rank, label: rankLabel(rank, c.teams.length), bonus: 2 };
  },
  playerGoals(me, c) {
    if (c.me?.stage === 'COLLEGE') return [{ key: 'stock', target: 64, text: 'Projeção top-2 rodadas no draft', w: 1 }];
    return [{ key: 'starter', text: 'Ser titular', w: 1 }, { key: 'gp', target: 14, text: 'Jogar 14+ jogos', w: 1 }];
  },
  evaluatePlayerGoal(g, c) { const me = c.players[c.me.id]; if (g.key === 'stock') return (c.me.stock?.rank ?? 999) <= g.target; if (g.key === 'starter') return me.role === 'S'; if (g.key === 'gp') return (me.ps?.gp || 0) >= g.target; return false; },
};
function rowFor(p) {
  if (rows.has(p.id)) return { ...rows.get(p.id), team: p.t, status: 'ACT' };
  const r = { full_name: p.n, first_name: p.n.split(' ')[0], last_name: p.n.split(' ').slice(1).join(' '), position: p.pos, team: p.t, gsis_id: p.id, status: 'ACT', age: p.age, years_exp: p.svc || 0, jersey_number: p.num || '' };
  rows.set(p.id, r); return r;
}
