// NFL game as a stream of protocol messages: one call to next() = one simulation tick (30 Hz) or a play boundary. Uses the SAME engine and game rules as
// the web game (nfl/src/sim/playSim.js + nfl/src/game/match.js), so a 3D client sees exactly the plays the web game would produce for the same seed.
import { newGameState, makeLineupCache, cpuOffenseCall, cpuDefenseCall, snap, applyPlay, logText, offAbbr, defAbbr, clockStr } from '../../nfl/src/game/match.js';
import { step } from '../../nfl/src/sim/playSim.js';
import { actionsFor, locomotionClipId } from '../../nfl/src/ui/animationMap.js';
import * as P from './protocol.mjs';

export function createNflSession({ roster, home = 'SEA', away = 'NE', seed = 'unreal', quarterMin = 15, tuning } = {}) {
  const g = newGameState({ home, away, seed, quarterMin }), cache = makeLineupCache(() => roster);
  let sim = null, ls = null, evIdx = 0, started = false, finished = false;
  const clipOf = e => {
    const sp = Math.hypot(e.vel?.x || 0, e.vel?.y || 0), back = sp > 0.5 && ((e.vel.x * Math.cos(e.facing) + e.vel.y * Math.sin(e.facing)) / sp) < -0.35;
    return e.down ? 'ag_pile_bottom' : locomotionClipId({ speed: sp, backwards: back, carrying: sim?.carrier === e });
  };
  return {
    get state() { return g; },
    get done() { return finished; },
    // -> array of messages (possibly empty once the game is over)
    next() {
      if (finished) return [];
      if (!started) { started = true; return [P.hello('nfl', 30)]; }
      if (!sim) {
        ls = cache.get(offAbbr(g), defAbbr(g));
        const call = { ...cpuOffenseCall(g), defCall: cpuDefenseCall(g) };
        sim = snap(g, ls, call, tuning); evIdx = 0;
        return [P.playStart(sim, g, ls.who)];
      }
      step(sim);
      const fresh = sim.events.slice(evIdx).map(ev => ({ ...ev, clips: actionsFor(ev, sim) })); evIdx = sim.events.length;
      const out = [P.tick(sim, fresh, clipOf)];
      if (sim.phase === 'DEAD') {
        const r = sim.result, res = applyPlay(g, sim, ls.who);
        out.push({ type: 'play_end', result: { outcome: r.outcome, yards: r.yards, spotX: r.spotX, touchdown: r.touchdown, turnover: r.turnover, safety: r.safety, penalty: r.penalty || null },
          text: logText(res.sum), notes: res.notes, score: { home: g.homeScore, away: g.awayScore }, quarter: g.quarter, clock: clockStr(g.clock), down: g.down, distance: g.distance, ballOn: g.ballOn, offense: offAbbr(g) });
        sim = null;
        if (g.over) { finished = true; out.push({ type: 'game_over', score: { home: g.homeScore, away: g.awayScore } }); }
      }
      return out;
    },
  };
}
