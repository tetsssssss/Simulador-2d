// NHL end-of-game data for core/ui/finalOverlay.js — everything derived from the engine state (events, box, shots).
export function nhlFinalData(S) {
  const sides = ['away', 'home'], labels = [], per = { home: [], away: [] };
  const maxP = Math.max(3, S.period);
  for (let p = 1; p <= maxP; p++) { labels.push(p <= 3 ? String(p) : p === 4 ? 'OT' : 'SO'); for (const k of sides) per[k].push(S.events.filter(e => e.type === 'GOAL' && e.period === p && e.team === k).length); }
  const sum = (k, f) => Object.entries(S.box).reduce((t, [id, b]) => t + (S.roster[id]?.team === k ? (b[f] || 0) : 0), 0);
  const stat = (label, f) => ({ label, away: sum('away', f), home: sum('home', f) });
  const players = Object.entries(S.box).map(([id, b]) => ({ id, b, r: S.roster[id] })).filter(x => x.r);
  const nm = r => r.name || r.last || `#${r.num ?? ''}`;
  const score = x => x.r.goalie ? (x.b.sa >= 15 ? x.b.sv * 0.18 - x.b.ga * 0.6 : 0) + (S.score[x.r.team] > S.score[x.r.team === 'home' ? 'away' : 'home'] ? 1 : 0) : x.b.g * 3 + x.b.a * 1.8 + x.b.sog * 0.15 + x.b.blk * 0.2 + x.b.hit * 0.05;
  const stars = players.sort((a, b) => score(b) - score(a)).slice(0, 3).map(x => ({ name: nm(x.r), team: S[x.r.team].abbr, line: x.r.goalie ? `${x.b.sv} defesas em ${x.b.sa} chutes (${x.b.sa ? (x.b.sv / x.b.sa).toFixed(3).slice(1) : '—'})` : `${x.b.g} G · ${x.b.a} A · ${x.b.sog} chutes` }));
  const so = S.period >= 5, ot = S.period === 4;
  return {
    sport: 'nhl', ot: so ? 'SO' : ot ? 'OT' : '',
    home: { abbr: S.home.abbr, name: S.home.name, color: S.home.brand || S.home.color, score: S.score.home }, away: { abbr: S.away.abbr, name: S.away.name, color: S.away.brand || S.away.color, score: S.score.away },
    periods: { labels, home: per.home, away: per.away },
    stats: [{ label: 'Chutes no gol', away: S.shots.away, home: S.shots.home }, stat('Hits', 'hit'), stat('Bloqueios', 'blk'), stat('Faceoffs ganhos', 'fow'), stat('Minutos de penalidade', 'pim')],
    stars,
  };
}
