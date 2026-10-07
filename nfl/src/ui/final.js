// NFL end-of-game data for core/ui/finalOverlay.js — derived from the game record (scoring log, box score).
export function nflFinalData(g, { teamBy, colors, mode }) {
  const labels = ['1', '2', '3', '4'], per = { home: [0, 0, 0, 0], away: [0, 0, 0, 0] };
  let ot = false;
  for (const s of g.scoring || []) {
    const pts = /^TD/.test(s.text) ? 7 : /^Safety/i.test(s.text) ? 2 : 3, k = s.team === g.home ? 'home' : 'away', q = Math.min(5, s.q || 1);
    if (q > 4) { ot = true; if (!labels.includes('OT')) { labels.push('OT'); per.home.push(0); per.away.push(0); } per[k][4] += pts; } else per[k][q - 1] += pts;
  }
  const T = g.box?.teams || {}, tm = a => T[a] || { plays: 0, yards: 0, passYds: 0, rushYds: 0, firstDowns: 0, turnovers: 0, sacksAllowed: 0 };
  const A = tm(g.away), H = tm(g.home), P = Object.values(g.box?.players || {});
  const best = (f, v) => P.filter(p => f(p)).sort((a, b) => v(b) - v(a))[0];
  const qb = best(p => p.pass?.att > 0, p => p.pass.yds), rb = best(p => p.rush?.att > 0, p => p.rush.yds), wr = best(p => p.rec?.rec > 0, p => p.rec.yds), df = best(p => p.def && (p.def.tkl || p.def.sacks || p.def.int), p => p.def.tkl + p.def.sacks * 3 + p.def.int * 4);
  const stars = [
    qb && { name: qb.name, team: qb.team, line: `${qb.pass.cmp}/${qb.pass.att} · ${qb.pass.yds} jds · ${qb.pass.td} TD · ${qb.pass.int} INT`, v: qb.pass.yds + qb.pass.td * 25 },
    rb && { name: rb.name, team: rb.team, line: `${rb.rush.att} corridas · ${rb.rush.yds} jds · ${rb.rush.td} TD`, v: rb.rush.yds * 1.2 + rb.rush.td * 25 },
    wr && { name: wr.name, team: wr.team, line: `${wr.rec.rec} recepções · ${wr.rec.yds} jds · ${wr.rec.td} TD`, v: wr.rec.yds * 1.1 + wr.rec.td * 25 },
    df && { name: df.name, team: df.team, line: `${df.def.tkl} tackles · ${df.def.sacks} sacks · ${df.def.int} INT`, v: df.def.tkl * 5 + df.def.sacks * 20 + df.def.int * 30 },
  ].filter(Boolean).sort((a, b) => b.v - a.v).slice(0, 3);
  const side = a => ({ abbr: a, name: teamBy(a)?.name || a, color: colors(a), score: a === g.home ? g.homeScore : g.awayScore });
  return {
    sport: 'nfl', ot: ot ? 'OT' : '', home: side(g.home), away: side(g.away), periods: { labels, home: per.home, away: per.away },
    stats: [{ label: 'Jardas totais', away: A.yards, home: H.yards }, { label: 'Jardas aéreas', away: A.passYds, home: H.passYds }, { label: 'Jardas corridas', away: A.rushYds, home: H.rushYds }, { label: 'Primeiras descidas', away: A.firstDowns, home: H.firstDowns }, { label: 'Turnovers', away: A.turnovers, home: H.turnovers }],
    stars, note: mode || '',
  };
}
