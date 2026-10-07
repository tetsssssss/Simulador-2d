// League infrastructure shared by the careers: schedule (slates / series), standings, quick results from team
// strength, playoff brackets. Sport-specific numbers (games, scoring model, playoff format) come from the spec.
import { createRng, hashSeed } from '../rng/rng.js';

// ---------- schedule ----------
// Every slate pairs all teams (even team counts). Division rivals are preferred; spec.seriesLength repeats pairings
// (MLB plays 3-game series). Home/away alternates so totals stay balanced.
export function buildSchedule(teams, { games, seriesLength = 1, divisionBias = 0.35, seed }) {
  const rng = createRng(hashSeed(`${seed}-schedule`));
  const abbrs = teams.map(t => t.abbr), byAbbr = Object.fromEntries(teams.map(t => [t.abbr, t]));
  const met = {}, homeCount = Object.fromEntries(abbrs.map(a => [a, 0]));
  const schedule = [];
  const rounds = Math.ceil(games / seriesLength);
  for (let r = 0; r < rounds; r++) {
    const pool = [...abbrs];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const pairs = [];
    while (pool.length > 1) {
      const a = pool.shift();
      const wantDiv = rng.next() < divisionBias;
      let idx = pool.findIndex(b => (wantDiv ? byAbbr[b].div === byAbbr[a].div : true) && (met[`${a}|${b}`] || 0) <= Math.min(...pool.map(x => met[`${a}|${x}`] || 0)) + 1);
      if (idx < 0) idx = 0;
      const b = pool.splice(idx, 1)[0];
      met[`${a}|${b}`] = (met[`${a}|${b}`] || 0) + 1; met[`${b}|${a}`] = (met[`${b}|${a}`] || 0) + 1;
      const home = homeCount[a] <= homeCount[b] ? a : b, away = home === a ? b : a;
      pairs.push([home, away]);
    }
    for (let k = 0; k < seriesLength && schedule.length / (abbrs.length / 2) < games; k++) {
      const slate = r * seriesLength + k;
      for (const [h, a] of pairs) { schedule.push({ s: slate, h, a, r: null }); homeCount[h]++; }
    }
  }
  return { schedule, slates: Math.max(...schedule.map(g => g.s)) + 1 };
}

export function emptyStandings(teams) { return Object.fromEntries(teams.map(t => [t.abbr, { w: 0, l: 0, t: 0, otl: 0, pf: 0, pa: 0, streak: '' }])); }
export function recordResult(st, g) {
  const [hs, as] = g.r, H = st[g.h], A = st[g.a];
  H.pf += hs; H.pa += as; A.pf += as; A.pa += hs;
  const win = (W, L) => { W.w++; W.streak = W.streak.startsWith('W') ? `W${+W.streak.slice(1) + 1}` : 'W1'; if (g.ot && L.otl != null) L.otl++; else L.l++; L.streak = L.streak.startsWith('L') ? `L${+L.streak.slice(1) + 1}` : 'L1'; };
  if (hs > as) win(H, A); else if (as > hs) win(A, H); else { H.t++; A.t++; H.streak = A.streak = 'T1'; }
}
export const winPct = s => { const gp = s.w + s.l + s.t + (s.otl || 0); return gp ? (s.w + 0.5 * s.t) / gp : 0; };
export const points = s => s.w * 2 + (s.otl || 0) + s.t; // NHL style
export function sortTeams(list, st, usePoints = false) {
  return [...list].sort((a, b) => {
    const A = st[a.abbr || a], B = st[b.abbr || b];
    return (usePoints ? points(B) - points(A) : 0) || winPct(B) - winPct(A) || (B.pf - B.pa) - (A.pf - A.pa);
  });
}

// ---------- quick results (team strength) ----------
// rating: 0..100 team strength from the sport spec. Score models per sport ("scoring" in the spec).
export function quickResult(spec, ratingH, ratingA, rng) {
  const diff = ratingH - ratingA + spec.homeAdvantage;
  const m = spec.scoring;
  const pois = mean => { let L = Math.exp(-Math.max(0.05, mean)), k = 0, p = 1; do { k++; p *= rng.next(); } while (p > L); return k - 1; };
  let hs, as, ot = false;
  if (m.kind === 'normal') { hs = Math.max(0, Math.round(rng.normal(m.mean + diff * m.k, m.sd))); as = Math.max(0, Math.round(rng.normal(m.mean - diff * m.k, m.sd))); if (m.snap) { hs = snapScore(hs, m.snap); as = snapScore(as, m.snap); } }
  else { hs = pois(Math.max(0.3, m.mean * (1 + diff * m.k))); as = pois(Math.max(0.3, m.mean * (1 - diff * m.k))); }
  if (hs === as && !m.ties) { ot = true; if (rng.next() < 0.5 + diff * m.k * 0.5) hs += m.otAdds ?? 1; else as += m.otAdds ?? 1; }
  return { hs, as, ot: ot && m.otLoss };
}
function snapScore(v, allowed) { let best = allowed[0]; for (const a of allowed) if (Math.abs(a - v) < Math.abs(best - v)) best = a; return v > 40 ? v : best; }

// ---------- playoffs ----------
// format: { perConf, byes, bestOf: [round1, round2, …, final] }. Seeds within conferences; the final crosses them.
export function seedPlayoffs(teams, st, format, usePoints) {
  const confs = [...new Set(teams.map(t => t.conf))];
  const seeds = {};
  for (const c of confs) seeds[c] = sortTeams(teams.filter(t => t.conf === c), st, usePoints).slice(0, format.perConf).map(t => t.abbr);
  return { format, seeds, round: 0, rounds: [], champion: null, confs };
}
export function nextPlayoffRound(po) {
  const r = po.rounds.length, fmt = po.format, last = fmt.bestOf.length - 1;
  const series = [];
  if (r === last) { // final: conference champions
    const champs = po.rounds[r - 1].series.map(s => s.winner);
    series.push({ a: champs[0], b: champs[1], wa: 0, wb: 0, bestOf: fmt.bestOf[r], winner: null, games: [] });
  } else {
    for (const c of po.confs) {
      let alive = r === 0 ? [...po.seeds[c]] : po.rounds[r - 1].series.filter(s => s.conf === c).map(s => s.winner).sort((x, y) => po.seeds[c].indexOf(x) - po.seeds[c].indexOf(y));
      if (r === 0 && fmt.byes) { const byes = alive.slice(0, fmt.byes); alive = alive.slice(fmt.byes); for (const b of byes) series.push({ conf: c, a: b, b: null, wa: 1, wb: 0, bestOf: 1, winner: b, games: [], bye: true }); }
      while (alive.length > 1) { const a = alive.shift(), b = alive.pop(); series.push({ conf: c, a, b, wa: 0, wb: 0, bestOf: fmt.bestOf[r], winner: null, games: [] }); }
    }
  }
  po.rounds.push({ series }); po.round = r;
  return po;
}
export const seriesOver = s => s.winner != null;
export function applySeriesGame(s, winnerAbbr, score) {
  if (winnerAbbr === s.a) s.wa++; else s.wb++;
  s.games.push(score);
  const need = Math.ceil(s.bestOf / 2);
  if (s.wa >= need) s.winner = s.a; else if (s.wb >= need) s.winner = s.b;
}
export function roundOver(po) { return po.rounds[po.round].series.every(seriesOver); }
