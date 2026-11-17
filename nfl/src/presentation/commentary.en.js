// NFL commentary pack (en-US). Same events/ctx as the pt-BR pack; priority/tone/streak rules are inherited from it.
import { NFL_COMMENTARY as PT } from './commentary.js';
const yd = n => `${Math.abs(n)} yard${Math.abs(n) === 1 ? '' : 's'}`;
const ord = n => ({ 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }[n] || `${n}th`);
const ordq = n => ({ 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' }[n] || `${n}th`);
const N = (ctx, id) => ctx.name?.(id) || 'the player';
const L = (ctx, id) => ctx.last?.(id) || N(ctx, id);
const margin = ctx => (ctx.score ? ctx.score.off - ctx.score.def : 0);
const late = ctx => ctx.quarter >= 4 && ctx.clock <= 300;

export const NFL_COMMENTARY_EN = {
  ...PT, $lang: 'en-US',
  $color(e, c, h) {
    const run = h.streak('n:run'), pass = h.streak('n:pass'), tot = run + pass, m = margin(c);
    const opts = [
      () => tot >= 8 ? `${c.off} has gone ${Math.round(100 * pass / tot)} percent through the air and ${Math.round(100 * run / tot)} percent on the ground.` : null,
      () => c.down === 3 && c.distance >= 8 ? `Third and long: ${c.def} can drop into coverage and send pressure.` : null,
      () => c.down === 4 ? 'Fourth down changes the feel of this game: the coach has to choose between going for it and kicking.' : null,
      () => c.redZone ? 'In the red zone the field shrinks and the defense squeezes the space.' : null,
      () => c.quarter >= 4 && c.clock <= 300 ? `${Math.max(1, Math.round(c.clock / 60))} minute${Math.round(c.clock / 60) > 1 ? 's' : ''} left: every possession counts.` : null,
      () => m >= 14 ? `${c.off} leads by ${m} and is controlling the tempo.` : m <= -14 ? `${c.off} has to rally: down ${-m}.` : null,
    ].map(f => f()).filter(Boolean);
    return opts.length ? h.pick(opts) : null;
  },
  $story(e, c, h) {
    if (e.type === 'TOUCHDOWN' && e.by) { const n = h.bump(`td:${e.by}`); return n === 2 ? `Second touchdown of the day for ${L(c, e.by)}!` : n > 2 ? `Touchdown number ${n} for him today!` : null; }
    if (e.type === 'PASS_COMPLETE') { const n = h.bump(`rc:${e.receiver}`); return n === 5 || n === 8 ? `${L(c, e.receiver)} already has ${n} catches.` : null; }
    if (e.type === 'SACK' && e.by) { const n = h.bump(`sk:${e.by}`); return n === 2 ? `Second sack for ${L(c, e.by)}.` : null; }
    return null;
  },
  SNAP: [
    (e, c) => c.down === 3 ? `${ord(3)} and ${c.distance}. Big moment for ${c.off}.` : null,
    (e, c) => c.down === 4 ? `Fourth down! ${c.off} is going for it.` : null,
    (e, c) => c.redZone ? `${c.off} in the red zone, ${c.distance} to go for the first down.` : null,
    (e, c) => late(c) && margin(c) < 0 ? `The clock is working against ${c.off}, down ${-margin(c)}.` : null,
    (e, c) => `${ord(c.down)} and ${c.distance}, ball on the ${c.spot}. Snap!`,
    (e, c) => `${L(c, c.qbId)} takes the snap.`,
    (e, c) => `${c.off} lines up, ${ord(c.down)} down.`,
  ],
  HANDOFF: [
    (e, c) => `Handoff to ${L(c, e.to)}.`,
    (e, c) => `${L(c, e.to)} takes it and looks for a hole.`,
    (e, c) => `Run play with ${L(c, e.to)}.`,
  ],
  SCRAMBLE: [
    (e, c) => `${L(c, e.id)} breaks out of the pocket!`,
    (e, c) => `Heavy pressure, ${L(c, e.id)} escapes and improvises.`,
    (e, c) => `${L(c, e.id)} flees the pressure and looks for an open man.`,
  ],
  PASS_ATTEMPT: [
    (e, c) => e.throwAway ? `${L(c, e.passer)} throws it away to avoid the sack.` : null,
    (e, c) => !e.throwAway && e.airYards >= 25 ? `${L(c, e.passer)} goes deep looking for ${L(c, e.target)}!` : null,
    (e, c) => !e.throwAway && e.airYards >= 25 ? `Bomb from ${L(c, e.passer)} to ${L(c, e.target)}…` : null,
    (e, c) => !e.throwAway && e.hurried ? `${L(c, e.passer)} throws under pressure to ${L(c, e.target)}.` : null,
    (e, c) => !e.throwAway && e.airYards < 25 ? `${L(c, e.passer)} looks for ${L(c, e.target)}.` : null,
    (e, c) => !e.throwAway && e.airYards < 8 ? `Short pass to ${L(c, e.target)}.` : null,
    (e, c) => !e.throwAway ? `${L(c, e.passer)} lets it go to ${L(c, e.target)}.` : null,
  ],
  PASS_COMPLETE: [
    (e, c, h) => h.streak(`rec:${e.receiver}`) >= 2 ? `${L(c, e.receiver)} again! He's become the favorite target.` : null,
    (e, c) => e.contested ? `Contested catch and ${L(c, e.receiver)} hangs on!` : null,
    (e, c) => `Complete to ${L(c, e.receiver)}!`,
    (e, c) => `${L(c, e.receiver)} makes the catch.`,
    (e, c) => `${L(c, e.receiver)} pulls it in.`,
  ],
  INCOMPLETE: [
    (e, c) => e.reason === 'DROP' ? `It slips through ${L(c, e.by)}'s hands!` : null,
    (e, c) => e.reason === 'DROP' ? `${L(c, e.by)} drops it. That one had to be caught.` : null,
    (e, c) => e.reason === 'BREAKUP' ? `${L(c, e.by)} arrives just in time and breaks it up!` : null,
    (e, c) => e.reason === 'BREAKUP' ? `Great defense by ${L(c, e.by)}, pass broken up.` : null,
    (e, c) => e.reason === 'DEFLECTED' ? `Ball tipped${e.by ? ` by ${L(c, e.by)}` : ''}! Incomplete.` : null,
    (e, c) => e.reason === 'OVERTHROWN' ? 'Sailed over the target. Incomplete.' : null,
    (e, c) => e.reason === 'THROWAWAY' ? null : (e.reason === 'OUT_OF_BOUNDS' ? 'Caught out of bounds. Incomplete.' : null),
    (e, c, h) => h.streak('inc') >= 2 ? `Another incompletion. ${c.off} can't connect.` : null,
    (e, c) => !['DROP', 'BREAKUP', 'DEFLECTED', 'THROWAWAY'].includes(e.reason) ? 'Incomplete.' : null,
  ],
  INTERCEPTION: [
    (e, c) => `INTERCEPTED! ${N(c, e.by)} steals it!`,
    (e, c) => `What a read by ${L(c, e.by)}! Interception!`,
    (e, c) => late(c) ? `INTERCEPTION at the worst possible time! ${L(c, e.by)}!` : null,
  ],
  SACK: [
    (e, c) => e.by ? `SACK! ${N(c, e.by)} takes down ${L(c, e.qb)}!` : `${L(c, e.qb)} is dropped behind the line. Sack!`,
    (e, c, h) => h.streak('sack') >= 2 ? `Another sack! ${c.def}'s line is dominating this game.` : null,
    (e, c) => e.by ? `${L(c, e.by)} beats the block and gets to ${L(c, e.qb)}. Sack!` : null,
  ],
  BROKEN_TACKLE: [
    (e, c) => e.sackEscape ? `${L(c, e.carrier)} escapes the sack!` : null,
    (e, c) => !e.sackEscape ? `${L(c, e.carrier)} breaks ${L(c, e.by)}'s tackle!` : null,
    (e, c) => !e.sackEscape ? `He got away! ${L(c, e.carrier)} stays on his feet.` : null,
  ],
  TACKLE: [
    (e, c) => { const g = Math.round(e.x - c.losX); return g >= 15 ? `${L(c, e.by)} finally brings down ${L(c, e.carrier)} after a gain of ${yd(g)}.` : null; },
    (e, c) => { const g = Math.round(e.x - c.losX); return g <= 0 ? `${L(c, e.by)} gets ${L(c, e.carrier)} ${g < 0 ? `for a loss of ${yd(g)}` : 'for no gain'}!` : null; },
    (e, c) => { const g = Math.round(e.x - c.losX); return g > 0 && g < 15 ? `Tackle by ${L(c, e.by)}. Gain of ${yd(g)}.` : null; },
    (e, c) => { const g = Math.round(e.x - c.losX); return g > 0 && g < 15 ? `${L(c, e.carrier)} picks up ${yd(g)} before ${L(c, e.by)} stops him.` : null; },
  ],
  OUT_OF_BOUNDS: [
    (e, c) => `${L(c, e.carrier)} steps out of bounds.`,
    () => 'Out of bounds, clock stopped.',
  ],
  FUMBLE: [
    () => 'FUMBLE! The ball is loose!',
    (e, c) => e.forcedBy ? `${L(c, e.forcedBy)} rips it from ${L(c, e.carrier)}! Fumble!` : null,
  ],
  FUMBLE_RECOVERY: [
    (e, c) => e.lost ? `${N(c, e.by)} recovers for ${c.def}! Turnover!` : `${L(c, e.by)} recovers it for ${c.off}. Phew!`,
  ],
  TOUCHDOWN: [
    (e, c) => e.side === 'def' ? `DEFENSIVE TOUCHDOWN! ${N(c, e.by)} takes it all the way to the end zone!` : null,
    (e, c) => e.side !== 'def' && margin(c) < 0 && margin(c) >= -7 ? `TOUCHDOWN! ${N(c, e.by)}! ${c.off} closes the gap!` : null,
    (e, c) => e.side !== 'def' && margin(c) === 0 ? `TOUCHDOWN! ${N(c, e.by)} puts ${c.off} in front!` : null,
    (e, c) => e.side !== 'def' && late(c) ? `TOUCHDOWN late in the game! ${N(c, e.by)}!` : null,
    (e, c) => e.side !== 'def' ? `TOUCHDOWN ${c.off}! ${N(c, e.by)} in the end zone!` : null,
    (e, c) => e.side !== 'def' ? `${L(c, e.by)} crosses the goal line! Touchdown!` : null,
  ],
  SAFETY: [(e, c) => `SAFETY! ${c.def} scores 2 points!`],
  FIRST_DOWN: [
    (e, c) => c.prevDown === 3 ? `Third-down conversion! ${c.off} keeps the ball.` : null,
    (e, c) => c.prevDown === 4 ? `Converted on fourth down! Right call by ${c.off}.` : null,
    () => 'First down!',
    (e, c) => `The chains move. First down, ${c.off}.`,
  ],
  TURNOVER_ON_DOWNS: [(e, c) => `Stopped on fourth down! The ball goes to ${c.def}.`, (e, c) => `${c.def}'s defense holds. Turnover on downs!`],
  QUARTER_START: [(e, c) => `The ${ordq(e.quarter)} quarter begins. ${c.home} ${c.homeScore}, ${c.away} ${c.awayScore}.`],
  FINAL: [
    (e, c) => c.homeScore === c.awayScore ? `Final: tied at ${c.homeScore}.` : `FINAL! ${c.homeScore > c.awayScore ? c.home : c.away} wins ${Math.max(c.homeScore, c.awayScore)}-${Math.min(c.homeScore, c.awayScore)}.`,
  ],
  FIELD_GOAL: [(e) => `Field goal ${e.good ? 'is good' : 'no good'}.`],
  PUNT: [(e, c) => `${c.off} sends out the punt team.`],
  KICKOFF: [() => 'Kickoff.'],
};
