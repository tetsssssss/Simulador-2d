// Player-card context for the adaptive attributes. Builds a REAL context (season line -> rolling window of recent games,
// day-by-day schedule: home/road, opponent, rest, load; or the live 2D game when one is running) and feeds the pure
// computeAdaptive(). No dice: everything is derived from stats and a seeded hash of (player, day).
import { D, hash, pos, isPitcher, fixedRatings, teamBy } from './mlbData.js';
import { computeAdaptive } from './sim/adaptive.js';

const u = (...k) => (hash(k.join('|')) % 10000) / 10000;           // seeded 0..1
const num = x => { const n = parseFloat(x); return Number.isFinite(n) ? n : 0; };

export function teamOfPlayer(p) {
  const nm = p.currentTeam?.name, ab = p.teamAbbr;
  return (ab && teamBy(ab)) || D.teams.find(t => t.name === nm) || null;
}

// Rolling window of the last `n` games built from the 2025 season line (per-game rates + seeded game-to-game variance).
export function seasonRecent(p, day = 0, n = 8) {
  const id = p.person?.id ?? p.id, s = p.stats2025, out = [], pit = isPitcher(pos(p)) || pos(p) === 'TWP';
  for (let g = 0; g < n; g++) {
    const r1 = u(id, day, g, 'a'), r2 = u(id, day, g, 'b'), r3 = u(id, day, g, 'c');
    if (pit) {
      const l = s?.pit; if (!l) { out.push({ outs: 15, ra: 2, ka: 5, bba: 2, ha: 5, pc: 85 }); continue; }
      const gp = Math.max(1, l.gp), ip = num(l.ip), outsPG = Math.max(3, Math.round(ip * 3 / gp)), era = num(l.era);
      const ra = Math.max(0, Math.round(era * outsPG / 27 + (r1 - 0.5) * 3));
      out.push({ outs: outsPG, ra, ka: Math.max(0, Math.round(num(l.so) / gp + (r2 - 0.5) * 2)), bba: Math.max(0, Math.round(num(l.bb) / gp + (r3 - 0.5) * 1.6)), ha: Math.max(0, Math.round(outsPG / 3 * num(l.whip) - num(l.bb) / gp)), pc: outsPG * 5.6 });
    } else {
      const l = s?.hit; if (!l) { out.push({ ab: 4, h: 1, hr: 0, bb: 0, k: 1, d2: 0, d3: 0 }); continue; }
      const gp = Math.max(1, l.gp), abPG = Math.max(2, Math.min(5, l.ab / gp)), ab = Math.max(1, Math.round(abPG + (r1 - 0.5)));
      const avg = num(l.h) / Math.max(1, l.ab), h = Math.max(0, Math.min(ab, Math.round(avg * ab + (r2 - 0.5) * 2.2)));
      out.push({ ab, h, hr: r3 < (l.hr / Math.max(1, l.ab)) * ab ? 1 : 0, bb: r2 < (l.bb || 0) / Math.max(1, l.ab + (l.bb || 0)) ? 1 : 0, k: Math.max(0, Math.min(ab - h, Math.round(l.so / Math.max(1, l.ab) * ab + (r3 - 0.5) * 1.6))), d2: 0, d3: 0 });
    }
  }
  return out;
}

// What the "day" looks like: schedule slot (home/road, opponent), opposing hand, rest, load, and a game situation.
export function defaultScenario(p, day = 0) {
  const id = p.person?.id ?? p.id, pit = isPitcher(pos(p)) || pos(p) === 'TWP', my = teamOfPlayer(p);
  const others = D.teams.filter(t => t !== my), opp = others[Math.floor(u(id, day, 'opp') * others.length)] || D.teams[0];
  const r = u(id, day, 'sit'), bases = [[], [1], [2], [1, 3], [1, 2, 3], [2, 3]][Math.floor(u(id, day, 'bs') * 6)];
  return {
    home: u(id, day, 'home') < 0.5, opp: opp?.abbr, hand: u(id, day, 'hand') < 0.3 ? 'L' : 'R',
    inning: 1 + Math.floor(r * 9), scoreDiff: Math.floor(u(id, day, 'sd') * 7) - 3, bases, outs: Math.floor(u(id, day, 'outs') * 3),
    load: pit ? Math.floor(u(id, day, 'load') * 100) : Math.floor(u(id, day, 'pa') * 5), rest: 2 + Math.floor(u(id, day, 'rest') * 4), consecutive: Math.floor(u(id, day, 'cons') * 16),
  };
}

export function buildContext(p, day, sc) {
  const pit = isPitcher(pos(p)) || pos(p) === 'TWP', my = teamOfPlayer(p), opp = teamBy(sc.opp);
  const stadium = sc.home ? my?.stadium : opp?.stadium;
  const seq = seasonRecent(p, day, 4).map(g => (pit ? (g.ra >= 4 ? 'XBH' : g.ka >= 6 ? 'K' : 'OUT') : (g.h >= 2 ? 'XBH' : g.h === 1 ? 'H' : g.k >= 2 ? 'K' : 'OUT')));
  return {
    day: `d${day}`, recent: seasonRecent(p, day, 8), seq,
    fatigue: pit ? { pitches: sc.load, daysRest: sc.rest, recentPitches: Math.round(u(p.id ?? 0, day, 'rp') * 140) } : { pa: sc.load, consecutive: sc.consecutive, daysRest: 4 },
    game: { inning: sc.inning, half: sc.home ? 'bottom' : 'top', outs: sc.outs, scoreDiff: sc.scoreDiff, runners: sc.bases, balls: 0, strikes: 0, momentum: sc.scoreDiff / 2 },
    park: { stadium, home: sc.home }, opp: { hand: sc.hand, velo: 92, hold: 60, catcherArm: 60 },
    matchup: { pa: 0, ab: 0, h: 0 },
  };
}

// Live 2D game, when one is running: the same pure function fed with the engine's own box/situation.
export function liveContext(p) {
  const view = globalThis.__mlbMatch, eng = view?.engine, S = eng?.state; if (!eng || view.disposed || !S) return null;
  const id = String(p.person?.id ?? p.id), rec = Object.values(S.roster).find(r => String(r.pid) === id); if (!rec) return null;
  return { rec, a: eng.adaptive?.(rec) };
}

export function adaptiveFor(p, day, sc) {
  const per = p.person || p, fx = Object.fromEntries(fixedRatings(p).map(a => [a.name, a.value]));
  const player = { id: per.id ?? p.id, pos: pos(p), bats: per.batSide?.code || 'R', throws: per.pitchHand?.code || 'R', age: per.currentAge, fixed: fx };
  return computeAdaptive(player, buildContext(p, day, sc));
}
