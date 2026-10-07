// MLB career rules (sport-specific): 30 teams, 162 games (3-game series), AL/NL, 12-team playoffs (WC bo3 with byes,
// DS bo5, CS bo7, WS bo7), no cap but CBT (luxury tax) threshold, 26-man active + 40-man, minors A/AA/AAA with
// option years, service time, pre-arbitration / arbitration (3–5 years) / free agency (6+), 10-round draft (real: 20),
// High school / College → Draft → A → AA → AAA → MLB for the player career.
// Rosters: MLB StatsAPI when reachable; otherwise the labelled DEMO roster + fictional organisation depth.
import { D, teamBy, roster, positionalOvr, isPitcher, pos as posOf } from '../mlbData.js';
import { mlbColor } from '../teamColors.js';
import { buildLineup, demoRoster, playerRecord } from '../game/lineup.js';
import { createBaseballEngine } from '../sim/baseballEngine.js';
import { simRatings } from '../sim/ratings.js';
import { fixedRatings } from '../mlbData.js';
import { createRng } from '../../../core/rng/rng.js';
import { fictionalName, marketValue } from '../../../core/career/people.js';
import { clamp, poisson, avg, topBy, assignByQuota, expectedByQuota, needsByQuota, estimatedAge, rankLabel } from '../../../core/career/specKit.js';
import { MLB_V3 } from './mlbRules.js';
import { engineConfig } from '../../../core/career/tactics.js';

const G = p => (['SP', 'RP', 'P'].includes(p) ? (p === 'RP' ? 'RP' : 'SP') : p === 'C' ? 'C' : ['1B', '2B', '3B', 'SS', 'IF'].includes(p) ? 'IF' : ['LF', 'CF', 'RF', 'OF'].includes(p) ? 'OF' : 'DH');
const QUOTA = { SP: [5, 0], RP: [3, 5], C: [1, 1], IF: [4, 2], OF: [3, 1], DH: [1, 0] };
const entries = new Map(); // career id → StatsAPI-like roster entry (engine input)
const LV = ['A', 'AA', 'AAA'];

async function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

export const MLB_SPEC = {
  v3: MLB_V3,
  sport: 'mlb', label: 'MLB', confLabel: 'Liga', starOvr: 80, usePoints: false, homeAdvantage: 1.0, aiTradeRate: 0.012,
  calendar: { games: 162, seriesLength: 3, crossesYear: false, startMonth: 3, startDay: 26, slateDays: 1.13, firstSeason: 2026 },
  scoring: { kind: 'poisson', mean: 4.5, k: 0.02, ties: false, otLoss: false, otAdds: 1 },
  playoffs: { perConf: 6, byes: 2, bestOf: [3, 5, 7, 7], names: ['Wild Card', 'Division Series', 'Championship Series', 'World Series'] },
  ageCurve: { growthEnd: 26, peakEnd: 31, decline: 1.5, retireMin: 35 },
  injuries: { perPlayerGame: 0.0016, irGames: 10, table: [['Isquiotibial (IL-10)', 10, 25], ['Oblíquo', 15, 35], ['Cotovelo (UCL)', 60, 150], ['Ombro', 20, 60], ['Mão/Pulso', 10, 30], ['Costas', 10, 20]] },
  salary: { min: 0.76, max: 42, floorOvr: 62, curve: 2.2 }, positionPremium: { SP: 1.1, RP: 0.45, C: 0.85, DH: 0.9 },
  cap: { limit: 244, kind: 'tax', label: 'CBT / imposto de luxo (referência 2026)' },
  roster: { max: 26, min: 26, forty: 40 }, minorsLabel: 'para as ligas menores', trade: { surplusWeight: 0.8 }, waivers: true,
  draft: { rounds: 10, positions: ['SP', 'SP', 'RP', 'C', 'SS', '2B', '3B', '1B', 'CF', 'LF', 'RF'], potMean: 64, potSd: 9, gapMean: 18, gapSd: 6, ageMin: 18, ageMax: 22, undraftedKeep: 72,
    rookieContract: s => ({ sal: 0.76, yrs: 6, kind: 'PRE_ARB', bonus: +(Math.max(0.2, 9 - s.overall * 0.12)).toFixed(2) }),
    initialStatus: (p) => { p.lvl = p.ovr >= 60 ? 'AA' : p.ovr >= 50 ? 'A' : 'R'; p.opt = 3; p.on40 = false; return 'MIN'; } },
  tactics: [
    { key: 'hook', label: 'Troca de arremessador', options: ['paciente', 'normal', 'rápida'], default: 'normal' },
    { key: 'run', label: 'Corrida de bases / roubo', options: ['conservador', 'normal', 'agressivo'], default: 'normal' },
    { key: 'lineup', label: 'Ordem de rebatedores', options: ['tradicional', 'analítica'], default: 'analítica' },
  ],
  tacticEffect(t, list) {
    const pen = avg(topBy(list.filter(p => p.pos === 'RP'), 6)), speed = avg(list, p => p.spd || 50);
    let e = 0; if (t.hook === 'rápida') e += pen >= 72 ? 0.6 : -0.4; if (t.hook === 'paciente') e += avg(topBy(list.filter(p => p.pos === 'SP'), 5)) >= 76 ? 0.4 : -0.3;
    if (t.run === 'agressivo') e += speed > 60 ? 0.3 : -0.2; if (t.lineup === 'analítica') e += 0.2;
    return e;
  },
  posGroup: G, positions: ['SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
  teamRating(list) {
    const act = list.filter(p => p.st === 'ACT'), sp = topBy(act.filter(p => p.pos === 'SP'), 5), rp = topBy(act.filter(p => p.pos === 'RP'), 6), bats = topBy(act.filter(p => !['SP', 'RP'].includes(p.pos)), 9);
    return 0.5 * avg(bats, p => p.ovr) + 0.33 * avg(sp, p => p.ovr) + 0.17 * avg(rp, p => p.ovr);
  },
  assignRoles(list, c, abbr, opts = {}) {
    assignByQuota(list.filter(p => p.st === 'ACT'), G, QUOTA, { ...opts, trust: true });
    const userRot = c?.x?.tac?.rotation && abbr === c.userTeam && c.role === 'COACH' ? c.x.tac.rotation : null;
    if (userRot) { userRot.forEach((id, i) => { const q = c.players[id]; if (q && q.pos === 'SP' && q.st === 'ACT') q.rot = i; }); const taken = new Set(userRot); topBy(list.filter(p => p.pos === 'SP' && p.st === 'ACT' && !taken.has(p.id)), 5).forEach((p, i) => { p.rot = userRot.length + i; }); }
    else topBy(list.filter(p => p.pos === 'SP' && p.st === 'ACT'), 5).forEach((p, i) => { p.rot = i; });
    for (const p of list) if (p.st === 'MIN') p.role = 'B';
  },
  expectedRole: (p, list) => expectedByQuota(p, list, G, QUOTA),
  teamNeeds: list => needsByQuota(list, G, { SP: 5, RP: 7, C: 2, IF: 5, OF: 4 }),
  estimateService: p => p.svc ?? Math.max(0, p.age - 24),

  loadLeague() { return (this._league ||= this._load()); },
  async _load() {
    const teams = D.teams.map(t => ({ abbr: t.abbr, name: t.name, conf: t.league, div: `${t.league} ${t.division}`, color: mlbColor(t.abbr), id: t.id }));
    let real = true;
    const lists = [];
    try { await withTimeout(roster(D.teams[0]), 3000); lists.push(...await withTimeout(Promise.all(D.teams.map(t => roster(t))), 12000)); if (lists.some(l => l.length < 20)) throw new Error('incompleto'); }
    catch { real = false; lists.length = 0; for (const t of D.teams) lists.push(demoRoster(t)); }
    const players = [];
    D.teams.forEach((t, ti) => {
      const rng = createRng(`mlb-org-${t.abbr}`);
      const add = (e, st) => {
        const per = e.person || e, po = posOf(e), id = `mlb-${per.id}`;
        entries.set(id, e);
        const ovr = clamp(positionalOvr(e), 35, 97), age = per.currentAge || estimatedAge(per.id, 0.4);
        players.push({ id, src: per.id, n: per.fullName, pos: isPitcher(po) || po === 'TWP' ? 'SP' : po === 'OF' ? 'CF' : po === 'IF' ? '2B' : po, num: e.jerseyNumber || '', t: t.abbr, st, lvl: st === 'MIN' ? 'AAA' : null, on40: true, opt: 3,
          age, ageEst: !per.currentAge, ovr, pot: clamp(ovr + (age <= 25 ? 7 : 1), ovr, 99), bats: per.batSide?.code || 'R', throws: per.pitchHand?.code || 'R', demo: !!e.demo, svc: Math.max(0, age - 24) });
      };
      lists[ti].forEach(e => add(e, 'ACT'));
      // organisation depth (fictional, labelled): fill the 26-man and 40-man rosters
      const have = players.filter(p => p.t === t.abbr);
      const need = { SP: 6, RP: 9, C: 3, IF: 7, OF: 6 };
      for (const [g, n] of Object.entries(need)) {
        const cnt = have.filter(p => G(p.pos) === g).length;
        for (let k = cnt; k < n + (g === 'RP' ? 4 : 2); k++) {
          const pos = g === 'SP' ? 'SP' : g === 'RP' ? 'RP' : g === 'C' ? 'C' : g === 'IF' ? rng.pick(['1B', '2B', '3B', 'SS']) : rng.pick(['LF', 'CF', 'RF']);
          const pid = 990000 + ti * 200 + players.length;
          const e = { fict: true, jerseyNumber: String(rng.int(1, 99)), position: { abbreviation: pos === 'SP' || pos === 'RP' ? 'P' : pos }, person: { id: pid, fullName: fictionalName(rng), batSide: { code: rng.next() < 0.3 ? 'L' : 'R' }, pitchHand: { code: rng.next() < 0.28 ? 'L' : 'R' } } };
          add(e, k < n ? 'ACT' : 'MIN');
          const p = players.at(-1); p.pos = pos; p.fict = true; p.ovr = clamp(rng.int(52, 68) - (k >= n ? 6 : 0), 40, 80); p.pot = clamp(p.ovr + rng.int(0, 12), p.ovr, 90); if (p.st === 'MIN') p.lvl = rng.pick(LV);
        }
      }
      // pitchers: best five starters, the rest relievers
      const pit = players.filter(p => p.t === t.abbr && (p.pos === 'SP' || p.pos === 'RP') && !p.fict).sort((a, b) => b.ovr - a.ovr);
      pit.forEach((p, i) => { p.pos = i < 5 ? 'SP' : 'RP'; });
    });
    return { teams, players, note: real ? 'Elencos: MLB StatsAPI. Contratos estimados.' : 'MLB StatsAPI indisponível: elencos DEMO (sem nomes reais) + profundidade de organização fictícia. Contratos estimados.' };
  },
  async ensureRuntime(c) { if (entries.size) return; await this.loadLeague(); },
  async simulateGame(c, h, a, seed) {
    await this.ensureRuntime(c);
    const build = (abbr, side) => {
      const list = Object.values(c.players).filter(p => p.t === abbr && p.st === 'ACT' && !p.inj);
      const sps = list.filter(p => p.pos === 'SP').sort((x, y) => (x.rot ?? 9) - (y.rot ?? 9));
      const today = sps.length ? sps[c.slate % Math.min(5, sps.length)] : null;
      const use = list.filter(p => p.pos !== 'SP' || p === today);
      const L = buildLineup(use.map(entryFor), '');
      const fix = r => r && ({ ...r, id: `${side}-${r.pid}`, team: side });
      const T = teamBy(abbr);
      const cfg = engineConfig(MLB_SPEC, c, abbr);
      let order = L.order.map(fix);
      if (abbr === c.userTeam && c.role === 'COACH' && c.x?.tac) { // saved batting order (vs the opposing starter's hand is a future refinement)
        const want = cfg.battingOrderVsR.map(id => String(entryFor(c.players[id] || {}).person?.id)), byPid = new Map(order.map(r => [String(r.pid), r]));
        if (want.every(pid => byPid.has(pid))) order = want.map(pid => byPid.get(pid));
      }
      return { abbr, name: T?.name || abbr, color: mlbColor(abbr), color2: mlbColor(abbr, 1), tactics: cfg, lineup: { ...L, order, field: Object.fromEntries(Object.entries(L.field).map(([k, v]) => [k, fix(v)])), sp: fix(L.sp), bullpen: L.bullpen.map(fix) } };
    };
    const home = build(h, 'home'), away = build(a, 'away');
    if (!home.lineup.ok || !away.lineup.ok) throw new Error('lineup incompleto');
    const byPid = new Map(Object.values(c.players).filter(p => p.t === h || p.t === a).map(p => [String(entryFor(p).person.id), p]));
    const ratingsOf = e => { const base = simRatings(fixedRatings(e)), cp = byPid.get(String((e.person || e).id)); if (!cp) return base; const f = clamp(cp.ovr / Math.max(40, positionalOvr(e)), 0.8, 1.25); return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, clamp(v * f, 0.2, 0.99)])); };
    const e = createBaseballEngine({ home, away, seed, ratingsOf });
    let n = 0; while (!e.state.over && n++ < 400) { e.simulate(120, { maxEvents: 1e9 }); if (n % 4 === 0) await new Promise(r => setTimeout(r, 0)); }
    const S = e.state;
    const lines = mlbLinesFromState(S).map(([pid, l]) => [byPid.get(pid)?.id, l]).filter(x => x[0]);
    return { hs: S.score.home, as: S.score.away, ot: S.inning > 9, lines, engine: true };
  },
  // 2D bridge: today's career lineup (StatsAPI-like entries) and raw id → career id
  async rostersFor2D(c, h, a) {
    await this.ensureRuntime(c);
    const rows = abbr => { const list = Object.values(c.players).filter(p => p.t === abbr && p.st === 'ACT' && !p.inj); const sps = list.filter(p => p.pos === 'SP').sort((x, y) => (x.rot ?? 9) - (y.rot ?? 9)); const today = sps[c.slate % Math.max(1, Math.min(5, sps.length))]; return list.filter(p => p.pos !== 'SP' || p === today).map(entryFor); };
    return { home: rows(h), away: rows(a) };
  },
  rawIdMap(c, abbrs) { return new Map(Object.values(c.players).filter(p => abbrs.includes(p.t)).map(p => [String(entryFor(p).person.id), p.id])); },
  statLine(p, rng, { teamScore, oppScore, c }) {
    if (p.st !== 'ACT') return {};
    if (p.pos === 'SP') { if ((c.slate % 5) !== (p.rot ?? -1)) return {}; const outs = clamp(Math.round(rng.normal(16 + (p.ovr - 70) * 0.3, 3)), 3, 27), ra = Math.min(oppScore, poisson(rng, oppScore * 0.6)); return { outs, ha: poisson(rng, outs / 3 * 0.95), ra, ka: poisson(rng, outs / 3 * (0.7 + (p.ovr - 60) * 0.02)), bba: poisson(rng, outs / 3 * 0.35), w: teamScore > oppScore && outs >= 15 ? 1 : 0, l: teamScore < oppScore && outs >= 15 ? 1 : 0, gs: 1 }; }
    if (p.pos === 'RP') return rng.next() < (p.role === 'S' ? 0.45 : 0.3) ? { outs: 3, ha: poisson(rng, 0.9), ra: poisson(rng, 0.4), ka: poisson(rng, 1.1), bba: poisson(rng, 0.35) } : {};
    if (p.role === 'B' && rng.next() < 0.75) return {};
    const ab = rng.int(3, 5), ba = clamp(0.2 + (p.ovr - 55) * 0.0032, 0.17, 0.33); let h = 0; for (let i = 0; i < ab; i++) if (rng.next() < ba) h++;
    const hr = Math.min(h, poisson(rng, ab * clamp(0.012 + (p.ovr - 60) * 0.0013, 0.005, 0.07)));
    return { ab, h, hr, d2: Math.min(h - hr, poisson(rng, h * 0.2)), rbi: poisson(rng, teamScore * 0.12 + hr), r: poisson(rng, teamScore * 0.11), bb: poisson(rng, 0.35), k: poisson(rng, ab * 0.22) };
  },
  statKeys: p => (['SP', 'RP'].includes(p.pos) ? [['gp', 'J'], ['w', 'V'], ['l', 'D'], ['outs', 'IP'], ['ka', 'K'], ['ra', 'R']] : [['gp', 'J'], ['ab', 'AB'], ['h', 'H'], ['hr', 'HR'], ['rbi', 'RBI'], ['bb', 'BB']]),
  formatLine(l) { if (l.outs != null && l.ab == null) return `${l.gp || 0} J · ${Math.floor((l.outs || 0) / 3)}.${(l.outs || 0) % 3} IP · ${l.ka || 0} K · ERA ${l.outs ? ((l.ra || 0) * 27 / l.outs).toFixed(2) : '—'}`; return `${l.gp || 0} J · ${l.ab ? ((l.h || 0) / l.ab).toFixed(3).replace(/^0/, '') : '.000'} AVG · ${l.hr || 0} HR · ${l.rbi || 0} RBI`; },
  awards(c) {
    const pl = Object.values(c.players).filter(p => p.ps?.gp >= 30 && p.t !== 'FA'), out = [];
    for (const lg of ['AL', 'NL']) {
      const inL = p => c.teams.find(t => t.abbr === p.t)?.conf === lg;
      const mvp = pl.filter(p => inL(p) && p.ps.ab).sort((a, b) => ((b.ps.h || 0) / Math.max(1, b.ps.ab) * 1000 + (b.ps.hr || 0) * 6 + (b.ps.rbi || 0)) - ((a.ps.h || 0) / Math.max(1, a.ps.ab) * 1000 + (a.ps.hr || 0) * 6 + (a.ps.rbi || 0)))[0];
      if (mvp) out.push({ award: `MVP ${lg}`, name: mvp.n, team: mvp.t, id: mvp.id });
      const cy = pl.filter(p => inL(p) && p.pos === 'SP' && (p.ps.outs || 0) > 300).sort((a, b) => ((a.ps.ra || 0) / a.ps.outs) - ((b.ps.ra || 0) / b.ps.outs))[0];
      if (cy) out.push({ award: `Cy Young ${lg}`, name: cy.n, team: cy.t, id: cy.id });
    }
    return out;
  },
  // arbitration (3–5 years of service), pre-arb minimum, option years reset, 40-man awareness
  contractYear(c) {
    for (const p of Object.values(c.players)) {
      if (!p.c || p.st === 'PROSPECT') continue;
      if (p.c.kind === 'PRE_ARB' && (p.svc || 0) >= 3) { p.c.kind = 'ARB'; p.c.yrs = Math.max(p.c.yrs, 1); }
      if (p.c.kind === 'ARB') { const yr = clamp((p.svc || 3) - 2, 1, 3); p.c.sal = +Math.max(p.c.sal, (0.25 + 0.2 * yr) * marketValue(this, p)).toFixed(2); p.arb = true; if ((p.svc || 0) >= 6) { p.c.yrs = 0; p.arb = false; } }
      p.optUsed = false;
    }
  },
  cutDown(c) {
    for (const t of c.teams) {
      const org = Object.values(c.players).filter(p => p.t === t.abbr && (p.st === 'ACT' || p.st === 'MIN'));
      const pit = topBy(org.filter(p => ['SP', 'RP'].includes(p.pos)), 13), bat = topBy(org.filter(p => !['SP', 'RP'].includes(p.pos)), 13), keep = new Set([...pit, ...bat]);
      for (const p of org) { if (keep.has(p)) { p.st = 'ACT'; p.lvl = null; } else { p.st = 'MIN'; p.lvl ||= p.ovr >= 62 ? 'AAA' : p.ovr >= 55 ? 'AA' : 'A'; } }
    }
  },
  roadToPro: [
    { key: 'AMATEUR', label: 'High School / College', years: 3, kind: 'amateur', games: 45 },
    { key: 'A', label: 'Minors A', kind: 'minors' }, { key: 'AA', label: 'Minors AA', kind: 'minors' }, { key: 'AAA', label: 'Minors AAA', kind: 'minors' },
    { key: 'MLB', label: 'MLB', kind: 'pro' },
  ],
  archetypes: { SP: ['Power', 'Finesse', 'Groundball'], RP: ['Closer', 'Setup'], C: ['Defensivo', 'Rebatedor'], SS: ['Contato', 'Power', 'Velocidade'], CF: ['Velocidade', 'Power'], '1B': ['Power'], '2B': ['Contato'], '3B': ['Power', 'Defensivo'], LF: ['Power'], RF: ['Braço', 'Power'] },
  createPlayer({ name, pos = 'SS', archetype, talent = 'alto', age = 18, num = 7 }, rng) {
    const base = { raro: 50, alto: 46, medio: 42 }[talent] ?? 46, pot = { raro: 92, alto: 85, medio: 77 }[talent] ?? 85;
    return { n: name || 'Jogador Criado', pos, arch: archetype || this.archetypes[pos]?.[0], age, ovr: base + rng.int(-2, 2), pot: pot + rng.int(-3, 3), t: 'AMATEUR', st: 'AMATEUR', num, c: null, svc: 0, bats: 'R', throws: 'R' };
  },
  amateurSeason(me, st, rng) {
    if (['SP', 'RP'].includes(me.pos)) { const outs = Math.round(st.games / 4 * 18), ra = Math.max(0, Math.round(outs / 27 * clamp(5.5 - (me.ovr - 40) * 0.08, 1.2, 6))); return { gp: Math.round(st.games / 4), outs, ra, ka: Math.round(outs / 3 * clamp(0.7 + (me.ovr - 40) * 0.02, 0.6, 1.6)) }; }
    const ab = st.games * 4, ba = clamp(0.24 + (me.ovr - 40) * 0.005, 0.2, 0.42), h = Math.round(ab * ba * (0.9 + rng.next() * 0.2));
    return { gp: st.games, ab, h, hr: Math.round(ab * clamp(0.01 + (me.ovr - 40) * 0.0015, 0.005, 0.08)), rbi: Math.round(h * 0.5) };
  },
  draftStock(me, line, c) {
    const score = me.pot * 0.65 + me.ovr * 0.35;
    const rank = Object.values(c.players).filter(p => p.st === 'PROSPECT' && p.t === 'DRAFT' && !p.mine && p.pot * 0.65 + p.ovr * 0.35 > score).length + 1;
    return { rank, label: rankLabel(rank, c.teams.length), bonus: 2 };
  },
  minorsPromotion(c, me) {
    if (me.st !== 'MIN') return;
    const lv = LV.indexOf(me.lvl || 'A');
    const act = Object.values(c.players).filter(p => p.t === me.t && p.st === 'ACT' && (['SP', 'RP'].includes(p.pos) === ['SP', 'RP'].includes(me.pos))).sort((a, b) => b.ovr - a.ovr);
    const cut = act[12]?.ovr ?? 0;
    if (lv === 2 && me.ovr >= cut) { me.st = 'ACT'; me.lvl = null; me.on40 = true; c.me.stage = 'MLB'; c.news.unshift({ s: c.season, text: `${me.n} é chamado para a MLB pelo ${me.t}! Estreia nas grandes ligas.`, kind: 'big', d: '' }); return; }
    const need = [55, 61][lv];
    if (lv < 2 && me.ovr >= need) { me.lvl = LV[lv + 1]; c.me.stage = me.lvl; c.news.unshift({ s: c.season, text: `${me.n} é promovido para ${me.lvl}.`, kind: 'good', d: '' }); }
  },
  minorsLine(me, rng) { return this.statLine({ ...me, st: 'ACT', role: 'S', ovr: me.ovr + 6, rot: 0 }, rng, { teamScore: 4, oppScore: 4, c: { slate: 0 } }); },
  playerGoals(me, c) {
    const st = c.me?.stage;
    if (st === 'AMATEUR') return [{ key: 'stock', target: 30, text: 'Projeção de 1ª rodada', w: 1 }];
    if (['A', 'AA', 'AAA'].includes(st)) return [{ key: 'promo', text: 'Subir de nível nas ligas menores', w: 1 }];
    return [{ key: 'gp', target: 120, text: 'Jogar 120+ jogos (ou 25 inícios como SP)', w: 1 }];
  },
  evaluatePlayerGoal(g, c) { const me = c.players[c.me.id]; if (g.key === 'stock') return (c.me.stock?.rank ?? 999) <= g.target; if (g.key === 'promo') return me.st === 'ACT' || (me.lvl && me.lvl !== 'A'); if (g.key === 'gp') return (me.ps?.gp || 0) >= (me.pos === 'SP' ? 25 : 120); return false; },
};
export function mlbLinesFromState(S) {
  const out = [];
  for (const [rid, b] of Object.entries(S.box)) {
    const rec = S.roster[rid]; if (!rec) continue;
    const won = S.score[rec.team] > S.score[rec.team === 'home' ? 'away' : 'home'];
    out.push([String(rec.pid), b.pc ? { outs: b.outs, ha: b.ha, ra: b.ra, ka: b.ka, bba: b.bba, w: won && b.outs >= 15 ? 1 : 0, l: !won && b.outs >= 15 ? 1 : 0, gs: b.outs >= 9 ? 1 : 0 } : { ab: b.ab, h: b.h, hr: b.hr, rbi: b.rbi, bb: b.bb, k: b.k, r: b.r, d2: b.d2, d3: b.d3 }]);
  }
  return out;
}
function entryFor(p) {
  if (entries.has(p.id)) { const e = entries.get(p.id); return { ...e, position: { abbreviation: ['SP', 'RP'].includes(p.pos) ? 'P' : p.pos } }; }
  const pid = 9800000 + (parseInt(String(p.id).replace(/\D/g, '').slice(-5) || '1', 10));
  const e = { fict: true, jerseyNumber: String(p.num || ''), position: { abbreviation: ['SP', 'RP'].includes(p.pos) ? 'P' : p.pos }, person: { id: pid, fullName: p.n, batSide: { code: p.bats || 'R' }, pitchHand: { code: p.throws || 'R' } } };
  entries.set(p.id, e); return e;
}
export { playerRecord };
