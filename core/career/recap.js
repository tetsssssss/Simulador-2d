// Post-game recap ("Pós-jogo"): what the user's games of the last advance changed. Built from FACTS of the save only
// (scores in the advance result, standings, board / squad / fans / reputation / cash / injuries before and after), never invented.
// Persisted as c.x.recap (plain JSON, optional: old saves simply have none). Pure apart from writing c.x.recap.
import { myTeam, teamPlayers, teamOf } from './careerCore.js';
import { sortTeams } from './league.js';
import { squadRelationship } from './coach.js';
import { calendarDate } from './calendar.js';

const r1 = v => Math.round(v * 10) / 10;
const recStr = st => (st ? `${st.w}-${st.l}${st.otl ? '-' + st.otl : st.t ? '-' + st.t : ''}` : '');

// Snapshot taken BEFORE an advance / game. Cheap; safe to call in any phase (returns null without a team).
export function recapSnapshot(spec, c) {
  const me = myTeam(c); if (!me) return null;
  const st = c.standings?.[me], conf = teamOf(c, me)?.conf;
  const rank = st ? sortTeams(c.teams.filter(t => t.conf === conf), c.standings, !!spec.usePoints).findIndex(t => t.abbr === me) + 1 : null;
  const sq = c.role !== 'PLAYER' ? squadRelationship(c) : null, pl = c.role === 'PLAYER' ? c.players[c.me?.id] : null;
  return {
    team: me, record: recStr(st), w: st?.w ?? 0, l: st?.l ?? 0, rank,
    board: c.board ? r1(c.board.confidence) : null, morale: sq ? sq.morale : null, fans: c.x?.prel ? r1(c.x.prel.fans) : null,
    rep: c.x?.rep ?? null, cash: c.role !== 'PLAYER' ? c.x?.fin?.cash ?? null : null,
    ovr: pl?.ovr ?? null, form: pl?.fm ?? null,
    inj: teamPlayers(c, me).filter(p => p.inj).map(p => p.id),
  };
}

// After the advance: res.played = [{ day, kind, user: [{ h, a, r: [hs, as], ot }] }]. Writes and returns c.x.recap (or null if the
// user's team played nothing, in which case the previous recap is kept).
export function recordRecap(spec, c, before, played, source = 'sim') {
  const me = myTeam(c); if (!before || !me || before.team !== me) return null;
  const games = (played || []).flatMap(p => (p.user || []).map(u => {
    const home = u.h === me, hs = u.r?.[0], as = u.r?.[1]; if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
    const us = home ? hs : as, them = home ? as : hs, opp = home ? u.a : u.h;
    return { opp, oppName: teamOf(c, opp)?.name || opp, home, us, them, won: us > them, ot: !!u.ot, kind: p.kind || 'SLATE', day: p.day };
  })).filter(Boolean);
  if (!games.length) return null;
  const after = recapSnapshot(spec, c), d = k => (before[k] != null && after[k] != null ? r1(after[k] - before[k]) : null);
  const newInj = teamPlayers(c, me).filter(p => p.inj && !before.inj.includes(p.id)).map(p => ({ id: p.id, n: p.n, pos: p.pos, type: p.inj.type, games: p.inj.games }));
  const recap = {
    v: 1, source, season: c.season, phase: c.phase, date: calendarDate(spec, c), games,
    wins: games.filter(g => g.won).length, losses: games.filter(g => !g.won).length,
    record: { before: before.record, after: after.record }, rank: { before: before.rank, after: after.rank },
    delta: { board: d('board'), morale: d('morale'), fans: d('fans'), rep: d('rep'), cash: d('cash'), ovr: d('ovr'), form: d('form') },
    injuries: newInj,
  };
  c.x.recap = recap; return recap;
}
export const getRecap = c => c?.x?.recap || null;
