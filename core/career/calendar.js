// CareerCalendar API: advance the save by day / week / until the user's next game. Uncontrolled games are simulated; the day tick
// runs training, finance, scouting, injuries, events and news. The user's own game is never played by accident:
// the advance STOPS before it (stopped: 'USER_GAME') and the UI plays it (playUserGame, or the 2D match + extResult) or calls
// advance(..., { includeUserGame: true }).
import { playSlate, playPlayoffGameDay, advanceOffseason, runDraft, myTeam, nextUserGame, teamOf, dateLabel, OFF_STAGES, OFF_LABEL } from './careerCore.js';
import { dailyTick, OFF_DAYS, autoResolveEvents } from './hooks.js';
import { dayOfSlate, dateOfDay, fmtDate } from './kit.js';
import { deadlineDay } from './tradeAI.js';
import { acceptOffer, refreshOffers } from './coach.js';

export const CalMode = { NEXT_DAY: 'NEXT_DAY', NEXT_WEEK: 'NEXT_WEEK', NEXT_GAME: 'NEXT_GAME' };
const hasUserGame = (spec, c) => !!nextUserGame(c);
export const pendingGameDay = (spec, c) => (c.phase === 'REGULAR' && c.slate < c.slates && c.x.cal.day >= dayOfSlate(spec, c.slate)) || (c.phase === 'PLAYOFFS' && c.x.cal.poDay != null && c.x.cal.day >= c.x.cal.poDay);
export function calendarDate(spec, c) { const d = c.phase === 'OFFSEASON' ? null : dateOfDay(spec, c.season, c.x.cal.day); return d ? fmtDate(d) : `Offseason ${c.season} · ${OFF_LABEL[c.off] || ''}`; }

async function playPending(spec, c, userGame, results) {
  const day = c.x.cal.day;
  if (c.phase === 'REGULAR') {
    const slate = c.slate, r = await playSlate(spec, c);
    results.push({ day, kind: 'SLATE', slate, userGame, games: r.length, user: r.filter(x => x.mine).map(x => ({ h: x.g.h, a: x.g.a, r: x.g.r, ot: !!x.g.ot })) });
  } else if (c.phase === 'PLAYOFFS') {
    const r = await playPlayoffGameDay(spec, c);
    results.push({ day, kind: 'PLAYOFF', userGame, games: r.length, user: r.filter(x => x.mine).map(x => ({ h: x.h, a: x.a, r: [x.hs, x.as] })) });
    if (c.phase === 'PLAYOFFS') c.x.cal.poDay = c.x.cal.day + Math.max(1, Math.round(spec.calendar.slateDays));
  }
}
// mode: NEXT_DAY | NEXT_WEEK | NEXT_GAME. opts: { includeUserGame, auto, stopOnEvents=true, maxDays=500 }
export async function advance(spec, c, mode = CalMode.NEXT_DAY, opts = {}) {
  if (!c.x?.ready) throw new Error('save sem estado v3 (use attachSpec antes)');
  const x = c.x, auto = !!opts.auto, includeUser = !!opts.includeUserGame || auto, stopOnEvents = opts.stopOnEvents !== false && !auto, maxDays = opts.maxDays ?? 500;
  const target = mode === CalMode.NEXT_DAY ? 1 : mode === CalMode.NEXT_WEEK ? 7 : Infinity;
  const res = { mode, days: 0, played: [], stopped: null, events: [], newsAdded: 0, startDay: x.cal.day };
  const feed0 = x.feed.length, seq0 = x.nseq || 0;
  x.cal.managed = true;
  try {
    let guard = 0;
    while (guard++ < 5000) {
      if (c.fired) { if (auto) { refreshOffers(spec, c); const o = c.x.market.offers[0]; if (o) acceptOffer(spec, c, o.team); else { res.stopped = 'FIRED'; break; } } else { res.stopped = 'FIRED'; break; } }
      if (auto && x.events.pending.length) autoResolveEvents(spec, c);
      // 1) a game day is pending: play it unless it is the user's
      if (pendingGameDay(spec, c)) {
        const ug = hasUserGame(spec, c) && myTeam(c);
        if (ug && !includeUser && c.settings.controlUserGames !== false) { res.stopped = 'USER_GAME'; break; }
        await playPending(spec, c, !!ug, res.played);
        if (mode === CalMode.NEXT_GAME && ug) { res.stopped = 'PLAYED'; break; }
        continue;
      }
      if (res.days >= target) break;
      if (res.days >= maxDays) { res.stopped = 'MAX_DAYS'; break; }
      // 2) otherwise one day passes
      if (c.phase === 'PRESEASON') {
        if (x.cal.day < -1) { x.cal.day++; res.days++; tick(spec, c, res, stopOnEvents); }
        else { x.cal.day = 0; await playSlate(spec, c); res.days++; tick(spec, c, res, stopOnEvents); }   // preseason → regular
      } else if (c.phase === 'REGULAR' || c.phase === 'PLAYOFFS') {
        if (c.phase === 'PLAYOFFS' && x.cal.poDay == null) x.cal.poDay = x.cal.day + 1;
        x.cal.day++; res.days++; tick(spec, c, res, stopOnEvents, { gameDay: pendingGameDay(spec, c) });
      } else if (c.phase === 'OFFSEASON') {
        if (x.cal.offDay >= (OFF_DAYS[c.off] || 7)) {
          if (c.off === 'DRAFT' && !c.draft?.done) { const slot = runDraft(spec, c, { auto }); if (slot) { res.stopped = 'DRAFT_PICK'; res.pick = slot; break; } }
          advanceOffseason(spec, c);
          if (c.phase !== 'OFFSEASON') { x.cal.poDay = null; res.newSeason = true; }
          continue;
        }
        x.cal.day++; x.cal.offDay++; res.days++; tick(spec, c, res, stopOnEvents);
      }
      if (res.stopped) break;
    }
  } finally { x.cal.managed = false; }
  res.newsAdded = (x.nseq || 0) - seq0; void feed0;
  Object.assign(res, { day: x.cal.day, date: calendarDate(spec, c), phase: c.phase, off: c.off, season: c.season, slate: c.slate });
  if (!res.stopped && res.events.length) res.stopped = 'EVENT';
  return res;
}
function tick(spec, c, res, stopOnEvents, o = {}) {
  const out = dailyTick(spec, c, o);
  if (out?.events.length) { res.events.push(...out.events); }
}
// Plays the user's pending game right now (when advance() stopped with USER_GAME). Uses c.extResult when the 2D match provided one.
export async function playUserGame(spec, c) {
  if (!pendingGameDay(spec, c)) return { ok: false, text: 'Não há jogo do usuário pendente hoje.' };
  const out = []; c.x.cal.managed = true;
  try { await playPending(spec, c, true, out); } finally { c.x.cal.managed = false; }
  return { ok: true, played: out };
}
export function nextGameInfo(spec, c) {
  const g = nextUserGame(c); if (!g) return null;
  const day = c.phase === 'REGULAR' ? dayOfSlate(spec, c.slate) : (c.x.cal.poDay ?? c.x.cal.day);
  const me = myTeam(c), opp = g.h === me ? g.a : g.h;
  return { ...g, opp, oppName: teamOf(c, opp)?.name, home: g.h === me, day, date: fmtDate(dateOfDay(spec, c.season, day)), daysAway: day - c.x.cal.day, today: day <= c.x.cal.day };
}
export { OFF_DAYS, deadlineDay };
