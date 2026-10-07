// MLB end-of-game data for core/ui/finalOverlay.js — derived from the engine state (linescore, box, hits/errors).
export function mlbFinalData(S) {
  const n = Math.max(9, S.linescore.home.length, S.linescore.away.length), labels = [], per = { home: [], away: [] };
  for (let i = 0; i < n; i++) {
    labels.push(String(i + 1));
    per.away.push(S.linescore.away[i] ?? 0);
    const h = S.linescore.home[i];
    per.home.push(h ?? (i >= S.linescore.home.length && S.score.home > S.score.away && !S.walkoff ? 'X' : 0));
  }
  labels.push('H', 'E'); per.home.push(S.hits.home, S.errors.home); per.away.push(S.hits.away, S.errors.away);
  const sum = (side, f) => Object.entries(S.box).reduce((t, [id, b]) => t + (S.roster[id]?.team === side ? (b[f] || 0) : 0), 0);
  const nm = r => r.name || r.last || `#${r.num ?? ''}`;
  const rows = Object.entries(S.box).map(([id, b]) => ({ b, r: S.roster[id] })).filter(x => x.r);
  const won = x => S.score[x.r.team] > S.score[x.r.team === 'home' ? 'away' : 'home'];
  const val = x => x.b.pc ? (won(x) ? 3 : 0) + x.b.outs / 3 * 1.2 + x.b.ka * 0.5 - x.b.ra * 1.5 - x.b.ha * 0.3 : x.b.h * 1.2 + x.b.hr * 3 + x.b.rbi * 1.5 + x.b.r * 0.8 + x.b.sb * 0.8 - (x.b.ab - x.b.h) * 0.2;
  const stars = rows.sort((a, b) => val(b) - val(a)).slice(0, 3).map(x => ({ name: nm(x.r), team: S[x.r.team].abbr, line: x.b.pc ? `${(x.b.outs / 3).toFixed(1)} IP · ${x.b.ha} H · ${x.b.ra} R · ${x.b.ka} K` : `${x.b.h}-${x.b.ab}${x.b.hr ? ` · ${x.b.hr} HR` : ''} · ${x.b.rbi} RBI${x.b.r ? ` · ${x.b.r} R` : ''}` }));
  return {
    sport: 'mlb', ot: S.inning > 9 ? `F/${S.inning}` : '', note: S.walkoff ? 'Walk-off!' : '',
    home: { abbr: S.home.abbr, name: S.home.name, color: S.home.brand || S.home.color, score: S.score.home }, away: { abbr: S.away.abbr, name: S.away.name, color: S.away.brand || S.away.color, score: S.score.away },
    periods: { labels, home: per.home, away: per.away },
    stats: [{ label: 'Rebatidas', away: S.hits.away, home: S.hits.home }, { label: 'Home runs', away: sum('away', 'hr'), home: sum('home', 'hr') }, { label: 'Strikeouts (rebatedores)', away: sum('away', 'k'), home: sum('home', 'k') }, { label: 'Walks', away: sum('away', 'bb'), home: sum('home', 'bb') }, { label: 'Bases roubadas', away: sum('away', 'sb'), home: sum('home', 'sb') }],
    stars,
  };
}
