// MLB commentary pack (en-US). Same events/ctx as the pt-BR pack; priority/tone/streak rules are inherited from it.
// Like the pt-BR pack, each type ends with unconditional fallback variants so repeated events never go silent.
import { MLB_COMMENTARY as PT } from './commentary.js';
const L = (c, id) => c.last?.(id) || c.name?.(id) || 'the player';
const N = (c, id) => c.name?.(id) || L(c, id);
const T = (c, side) => c.team?.(side) || side;
const loaded = c => (c.runners || []).length === 3;
const risp = c => (c.runners || []).some(b => b >= 2);
const PITCH = { FF: 'fastball', FT: 'two-seam', SI: 'sinker', FC: 'cutter', SL: 'slider', CU: 'curveball', CH: 'changeup', FS: 'splitter', SP: 'splitter', SW: 'sweeper' };
const runs = n => `${n} run${n === 1 ? '' : 's'}`;
const ordn = n => `${n}${[, 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10] || 'th'}`;
const half = e => (e.half === 'top' ? 'Top' : 'Bottom');

const MAIN = {
  AT_BAT: [
    (e, c) => loaded(c) ? `Bases loaded for ${N(c, e.batter)}!` : null,
    (e, c) => risp(c) && c.outs === 2 ? `Two outs, runner in scoring position. ${L(c, e.batter)} at the plate.` : null,
    (e, c) => `${N(c, e.batter)} steps in.`,
    (e, c) => `At the plate, ${L(c, e.batter)}. ${c.outs} out${c.outs === 1 ? '' : 's'}.`,
  ],
  PITCH: [
    (e, c) => c.balls === 3 && c.strikes === 2 ? `Full count. ${L(c, e.pitcher)} gets set…` : null,
    (e, c) => e.mph >= 98 ? `${Math.round(e.mph)} mph! ${PITCH[e.pitchType] || 'Fastball'} from ${L(c, e.pitcher)}.` : null,
    (e, c) => e.decision === 'BUNT' ? `${L(c, e.batter)} squares to bunt!` : null,
    (e, c) => e.hb != null && Math.abs(e.vb) >= 14 && e.pitchType === 'CU' ? `Curveball from ${L(c, e.pitcher)} with ${Math.abs(Math.round(e.vb))} inches of drop, ${Math.round(e.mph)} mph.` : null,
    (e, c) => `${PITCH[e.pitchType] || 'Pitch'} from ${L(c, e.pitcher)}, ${Math.round(e.mph)} mph${e.rpm ? ` and ${e.rpm} rpm` : ''}.`,
    (e, c) => `${L(c, e.pitcher)} delivers.`,
  ],
  BALL: [(e, c) => `Ball${c.balls ? `, ${c.balls}-${c.strikes}` : ''}.`, (e, c) => `Outside the zone. ${c.balls}-${c.strikes}.`],
  STRIKE: [
    (e, c) => e.kind === 'called' ? `Called strike! ${c.balls}-${c.strikes}.` : null,
    (e, c) => e.kind === 'swinging' ? `Swing and a miss! ${c.balls}-${c.strikes}.` : null,
    (e, c) => e.kind === 'foul' ? `Foul, ${c.balls}-${c.strikes}.` : null,
  ],
  FOUL: [(e, c) => `Foul back. Still ${c.balls}-${c.strikes}.`, () => 'Fouled off, count stays.'],
  CONTACT: [
    (e, c) => e.ev >= 105 ? `Hard contact! ${Math.round(e.ev)} mph off the bat!` : null,
    (e, c) => e.kind === 'bunt' ? `${L(c, e.batter)} deadens it, bunt!` : null,
    (e, c) => e.foul && e.kind === 'pop' ? 'Pop-up behind the plate, foul.' : null,
    (e, c) => e.kind === 'ground' ? `Ground ball${e.spray < -15 ? ' to the left side' : e.spray > 15 ? ' to the right side' : ' up the middle'}.` : null,
    (e, c) => e.kind === 'fly' ? `Fly ball${e.spray < -15 ? ' to left field' : e.spray > 15 ? ' to right field' : ' to center'}…` : null,
    (e, c) => e.kind === 'line' ? `Line drive from ${L(c, e.batter)}!` : null,
    (e, c) => e.kind === 'pop' ? 'Pop-up, that one goes way up.' : null,
  ],
  HIT: [
    (e, c) => e.bases === 1 ? `Single by ${L(c, e.by)}!` : null,
    (e, c) => e.bases === 1 ? `${L(c, e.by)} drops it between the fielders. Base hit!` : null,
    (e, c) => e.bases === 2 ? `DOUBLE! ${N(c, e.by)} slides into second!` : null,
    (e, c) => e.bases === 3 ? `TRIPLE! ${N(c, e.by)} races to third!` : null,
  ],
  HOME_RUN: [
    (e, c) => e.runs === 4 ? `GRAND SLAM! ${N(c, e.by)}!!!` : null,
    (e, c) => c.walkoff ? `WALK-OFF HOME RUN! ${N(c, e.by)} ends it!` : null,
    (e, c) => `HOME RUN! ${N(c, e.by)}! ${e.dist ? `${Math.round(e.dist)} feet. ` : ''}${runs(e.runs)} for ${T(c, e.team)}!`,
    (e, c) => `Back, back… gone! ${L(c, e.by)} sends it out!`,
  ],
  STRIKEOUT: [
    (e, c) => e.looking ? `Strikeout! ${L(c, e.batter)} watches strike three go by.` : null,
    (e, c) => !e.looking ? `${L(c, e.pitcher)} gets ${L(c, e.batter)} swinging! Strikeout!` : null,
    (e, c, h) => h.streak(`k:${e.pitcher}`) >= 3 ? `Another K for ${L(c, e.pitcher)}! That's ${h.streak(`k:${e.pitcher}`) + 1} on the night.` : null,
  ],
  WALK: [(e, c) => loaded(c) ? 'Walk with the bases loaded! Run forced in.' : `Base on balls for ${L(c, e.batter)}.`, (e, c) => `Ball four. ${L(c, e.batter)} trots to first.`],
  HIT_BY_PITCH: [(e, c) => `${L(c, e.batter)} is hit by the pitch. Takes first base.`],
  OUT: [
    (e, c) => e.sac ? `Sacrifice! ${L(c, e.batter)} moves the runner over with the bunt.` : null,
    (e, c) => e.kind === 'thrownOut' && e.assist ? `OUTFIELD ASSIST! ${L(c, e.fielder)} throws a strike and gets the runner!` : null,
    (e, c) => e.kind === 'thrownOut' ? `Runner thrown out by ${L(c, e.fielder)}.` : null,
    (e, c) => e.kind === 'groundout' ? `Grounder to ${L(c, e.fielder)}, out at first.` : null,
    (e, c) => e.kind === 'flyout' ? `${L(c, e.fielder)} settles under it… and makes the catch. Out.` : null,
    (e, c) => e.kind === 'lineout' ? `Line drive right into ${L(c, e.fielder)}'s glove!` : null,
    (e, c) => e.kind === 'popout' ? `Easy pop-up for ${L(c, e.fielder)}.` : null,
    (e, c) => e.kind === 'doublePlay' ? `DOUBLE PLAY! ${T(c, e.team)} escapes the jam!` : null,
    (e, c) => e.kind === 'fieldersChoice' ? 'Fielder’s choice, out at the lead base.' : null,
    (e, c) => e.kind === 'caughtStealing' ? 'Caught stealing!' : null,
    (e, c) => e.kind === 'pickoff' ? `Pickoff! Out number ${c.outs}.` : null,
    (e, c) => `Out ${c.outs}.`,
  ],
  RUN_SCORES: [(e, c) => `${L(c, e.runner)} crosses the plate! ${T(c, e.team)} ${c.score[e.team]}.`, (e, c) => `Run scored by ${L(c, e.runner)}.`],
  ERROR: [(e, c) => e.kind === 'throw' ? `Bad throw by ${L(c, e.fielder)}! Error, the runner advances.` : null, (e, c) => `Error on ${L(c, e.fielder)}!`, (e, c) => `${L(c, e.fielder)} misplays it. Error.`],
  PICKOFF_ATTEMPT: [
    (e, c) => e.result === 'OUT' ? `PICKOFF! ${L(c, e.pitcher)} catches ${L(c, e.runner)} off the bag!` : `${L(c, e.pitcher)} tries the pickoff. ${L(c, e.runner)} dives back in time.`,
    (e, c) => e.result === 'OUT' ? `${L(c, e.runner)} loses focus and gets picked off!` : e.attempt > 1 ? `Second pickoff attempt from ${L(c, e.pitcher)}.` : `${L(c, e.pitcher)} looks over and tries to hold ${L(c, e.runner)}.`,
  ],
  STOLEN_BASE: [(e, c) => `${L(c, e.runner)} steals ${e.base === 3 ? 'third' : 'second'}!`, (e, c) => `Stolen base! ${L(c, e.runner)} beats the throw.`],
  RUNNER_DECISION: [
    (e, c) => e.decision === 'STEAL' ? `${L(c, e.runner)} breaks for the next base!` : null,
    (e, c) => e.decision === 'TAG_UP' ? `${L(c, e.runner)} waits for the catch and tags up.` : null,
    (e, c) => e.decision === 'RETURN' ? `${L(c, e.runner)} heads back to the bag.` : null,
    (e, c) => e.decision === 'HOLD' ? `${L(c, e.runner)} holds at the base.` : null,
    (e, c) => `${L(c, e.runner)} takes a chance and goes.`,
  ],
  INNING_START: [(e, c) => `${half(e)} of the ${ordn(e.inning)}. ${T(c, 'away')} ${c.score.away}, ${T(c, 'home')} ${c.score.home}.`],
  INNING_END: [(e) => e.lob ? `End of the half. ${e.lob} runner${e.lob > 1 ? 's' : ''} left on base.` : 'Three outs. Teams switch sides.'],
  PITCHING_CHANGE: [(e, c) => `Pitching change: ${N(c, e.pitcher)} comes in.`],
  FINAL: [(e, c) => `FINAL! ${T(c, c.score.home > c.score.away ? 'home' : 'away')} wins ${Math.max(c.score.home, c.score.away)}-${Math.min(c.score.home, c.score.away)}.`],
};
const FALLBACK = {
  AT_BAT: [(e, c) => `${L(c, e.batter)} settles into the box.`, (e, c) => `Next up: ${L(c, e.batter)}.`, (e, c) => `${L(c, e.pitcher)} faces ${L(c, e.batter)}.`],
  PITCH: [(e, c) => `${L(c, e.pitcher)} throws.`, (e, c) => `Here comes the pitch from ${L(c, e.pitcher)}.`, (e) => `${Math.round(e.mph || 90)} mph toward the plate.`],
  BALL: [(e, c) => `Ball ${c.balls}-${c.strikes}.`, () => 'The pitch is well off.', (e, c) => `${L(c, e.batter)} lets it go.`],
  STRIKE: [(e, c) => `Strike. ${c.balls}-${c.strikes}.`, (e, c) => `Another strike, ${c.balls}-${c.strikes}.`, (e, c) => `Strike on ${L(c, e.batter)}.`],
  FOUL: [() => 'Foul, count stays.', () => 'The ball tails outside the line.', (e, c) => `Foul by ${L(c, e.batter)}.`],
  CONTACT: [(e, c) => `Contact by ${L(c, e.batter)}.`, (e) => `Off the bat at ${Math.round(e.ev || 85)} mph.`, (e, c) => `${L(c, e.batter)} connects.`],
  HIT: [(e, c) => `Base hit by ${L(c, e.by)}.`, (e, c) => `${L(c, e.by)} finds a gap.`, (e, c) => `Hit for ${T(c, e.team)}.`],
  HOME_RUN: [(e, c) => `Home run by ${L(c, e.by)}!`, (e, c) => `Over the fence! ${N(c, e.by)}!`, (e, c) => `${T(c, e.team)} scores on a homer.`],
  STRIKEOUT: [(e, c) => `Strikeout for ${L(c, e.batter)}.`, (e, c) => `${L(c, e.pitcher)} finishes the at-bat with a K.`, () => 'Strike three. Out.'],
  WALK: [(e, c) => `Walk. ${L(c, e.batter)} to first.`, (e, c) => `${L(c, e.pitcher)} loses the zone and gives up the base.`, () => 'Base on balls.'],
  HIT_BY_PITCH: [(e, c) => `Hit by pitch on ${L(c, e.batter)}.`, (e, c) => `${L(c, e.batter)} takes one and earns the base.`, () => 'Hit, goes to first.'],
  OUT: [() => 'Out.', (e, c) => `That's an out for ${T(c, e.team)}.`, (e, c) => `Another out. ${c.outs ?? ''}`.trim()],
  RUN_SCORES: [() => 'Run scores.', (e, c) => `${T(c, e.team)} plates one.`, (e, c) => `${L(c, e.runner)} touches home.`],
  ERROR: [() => 'Defensive error.', () => 'The defense falters.', (e, c) => `Error charged to ${T(c, e.team)}.`],
  PICKOFF_ATTEMPT: [(e) => e.result === 'OUT' ? 'Pickoff! The runner is caught.' : 'Pickoff attempt. The runner gets back.'],
  STOLEN_BASE: [() => 'Stolen base.', (e, c) => `${L(c, e.runner)} advances on the run.`, () => 'The catcher can’t stop it.'],
  RUNNER_DECISION: [(e, c) => `${L(c, e.runner)} decides: ${e.decision}.`, (e, c) => `Baserunning call by ${L(c, e.runner)}.`, (e, c) => `${L(c, e.runner)} reads the play.`],
  INNING_START: [(e) => `The ${ordn(e.inning)} inning begins.`, (e) => `${half(e)} of inning ${e.inning}.`, () => 'New half-inning.'],
  INNING_END: [() => 'Three outs.', () => 'Switching sides.', () => 'End of the half-inning.'],
  PITCHING_CHANGE: [(e, c) => `Bullpen move: ${N(c, e.pitcher)}.`, (e, c) => `${L(c, e.pitcher)} takes the mound.`, () => 'New pitcher on the field.'],
  FINAL: [() => 'Game over.', (e, c) => `Final: ${c.score.away}-${c.score.home}.`, () => 'That’s the ballgame.'],
};
export const MLB_COMMENTARY_EN = { ...PT, $lang: 'en-US' };
for (const t of Object.keys(FALLBACK)) MLB_COMMENTARY_EN[t] = [...(MAIN[t] || []), ...FALLBACK[t]];
