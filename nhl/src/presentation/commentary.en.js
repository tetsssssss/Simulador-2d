// NHL commentary pack (en-US). Same events/ctx as the pt-BR pack; priority/tone/streak rules are inherited from it.
import { NHL_COMMENTARY as PT } from './commentary.js';
const L = (c, id) => c.last?.(id) || c.name?.(id) || 'the player';
const N = (c, id) => c.name?.(id) || L(c, id);
const T = (c, side) => c.team?.(side) || side;
const lead = (c, side) => (c.score ? c.score[side] - c.score[side === 'home' ? 'away' : 'home'] : 0);
const lateGame = c => c.period >= 3 && c.clock <= 300;
const periodName = n => ['first', 'second', 'third'][n - 1] || 'overtime';

export const NHL_COMMENTARY_EN = {
  ...PT, $lang: 'en-US',
  $color(e, c, h) {
    const home = c.tot?.('home', 'sog') ?? 0, away = c.tot?.('away', 'sog') ?? 0, hh = c.tot?.('home', 'hit') ?? 0, ha = c.tot?.('away', 'hit') ?? 0;
    const id = e.by || e.shooter || e.goalie, b = id && c.box?.[id], gb = e.goalie && c.box?.[e.goalie];
    const opts = [
      () => home + away >= 10 && Math.abs(home - away) >= 4 ? `${T(c, home > away ? 'home' : 'away')} is dominating the shot count, ${Math.max(home, away)} to ${Math.min(home, away)}.` : null,
      () => b && b.g + b.a >= 2 ? `${L(c, id)} already has ${b.g + b.a} points tonight: ${b.g} goal${b.g === 1 ? '' : 's'} and ${b.a} assist${b.a === 1 ? '' : 's'}.` : null,
      () => gb && gb.sa >= 10 ? `${L(c, e.goalie)} has stopped ${gb.sv} of ${gb.sa}, a ${(100 * gb.sv / gb.sa).toFixed(1)} percent save rate.` : null,
      () => hh + ha >= 12 && Math.abs(hh - ha) >= 4 ? `${T(c, hh > ha ? 'home' : 'away')} is setting the physical tone, ${Math.max(hh, ha)} hits to ${Math.min(hh, ha)}.` : null,
      () => c.period >= 3 && c.score && Math.abs(c.score.home - c.score.away) <= 1 ? 'Tight game in the third: one mistake could decide it.' : null,
      () => c.powerPlay ? 'With the man advantage, puck movement is the key to opening up the defense.' : null,
    ].map(f => f()).filter(Boolean);
    return opts.length ? h.pick(opts) : null;
  },
  $story(e, c, h) {
    if (e.type === 'GOAL') { const n = h.bump(`g:${e.by}`); return n === 2 ? `Second goal of the night for ${L(c, e.by)}!` : n === 3 ? 'HAT TRICK!' : n > 3 ? `Goal number ${n} for him tonight!` : null; }
    if (e.type === 'SAVE') { const n = h.bump(`sv:${e.goalie}`); return n > 0 && n % 10 === 0 ? `${L(c, e.goalie)} reaches ${n} saves.` : null; }
    if (e.type === 'PENALTY') { const n = h.bump(`pen:${e.on}`); return n === 2 ? `Second penalty on ${L(c, e.on)} tonight.` : null; }
    return null;
  },
  FACEOFF: [
    (e, c) => `${L(c, e.winner)} wins the faceoff for ${T(c, e.team)}.`,
    (e, c) => `Faceoff won by ${L(c, e.winner)} over ${L(c, e.loser)}.`,
    (e, c) => e.zone === 'center' ? `Puck dropped at center, ${L(c, e.winner)} gets the better of it.` : null,
    (e, c) => e.zone === 'offensive' ? `Offensive-zone faceoff, ${L(c, e.winner)} draws it back!` : null,
  ],
  PASS: [
    (e, c) => e.kind === 'saucer' ? `Saucer pass from ${L(c, e.from)} over the sticks to ${L(c, e.to)}!` : null,
    (e, c) => e.kind === 'bank' ? `${L(c, e.from)} banks it off the boards looking for ${L(c, e.to)}.` : null,
    (e, c) => e.kind === 'drop' ? `Drop pass from ${L(c, e.from)} to ${L(c, e.to)}.` : null,
    (e, c) => e.stretch ? `Long stretch pass from ${L(c, e.from)} looking for ${L(c, e.to)}!` : null,
    (e, c) => `${L(c, e.from)} passes to ${L(c, e.to)}.`,
    (e, c) => `${L(c, e.from)} finds ${L(c, e.to)}.`,
    (e, c) => e.cross ? `Cross-ice feed from ${L(c, e.from)} to ${L(c, e.to)}!` : null,
  ],
  RECEPTION: [
    (e, c) => e.kind === 'saucer' ? `${L(c, e.by)} receives the saucer with class.` : null,
    (e, c) => e.kind === 'bank' ? `${L(c, e.by)} picks up the bank pass off the boards.` : null,
    (e, c) => e.kind === 'stretch' ? `${L(c, e.by)} corrals the long pass and takes off!` : null,
    (e, c) => e.kind === 'drop' ? `${L(c, e.by)} takes over on the drop pass.` : null,
    (e, c, h) => e.intended && h.chance(0.06) ? `${L(c, e.by)} receives from ${L(c, e.from)}.` : null,
  ],
  TURNOVER: [
    (e, c) => e.cause === 'loose' ? `Puck lost! ${L(c, e.by)} recovers for ${T(c, e.team)}.` : null,
    (e, c) => e.cause === 'loose' ? `Turnover: ${T(c, e.team)} comes away with the puck.` : null,
    (e, c) => e.cause === 'interception' ? `A bad pass costs possession: ${L(c, e.by)} picks it up.` : null,
    (e, c) => e.cause === 'takeaway' ? `Change of possession, ${L(c, e.by)} takes it from ${L(c, e.from)}.` : null,
  ],
  INTERCEPTION: [(e, c) => `${L(c, e.by)} intercepts the pass!`, (e, c) => `Passing lane cut off by ${L(c, e.by)}.`],
  TAKEAWAY: [(e, c) => `${L(c, e.by)} steals the puck from ${L(c, e.from)}!`, (e, c) => `Takeaway by ${L(c, e.by)}.`],
  ZONE_ENTRY: [
    (e, c) => e.carried ? `${L(c, e.by)} carries it into the zone.` : null,
    (e, c) => !e.carried ? `${T(c, e.team)} dumps the puck into the zone.` : null,
    (e, c) => e.carried ? `${L(c, e.by)} crosses the blue line at speed!` : null,
  ],
  BREAKAWAY: [(e, c) => `${N(c, e.by)} is in alone! Breakaway!`, (e, c) => `Nobody catches ${L(c, e.by)}, one-on-one with the goalie!`],
  HIT: [
    (e, c) => e.big ? `WHAT A HIT by ${N(c, e.by)} on ${L(c, e.on)}!` : null,
    (e, c) => `${L(c, e.by)} hammers ${L(c, e.on)} into the boards.`,
    (e, c) => `Body check by ${L(c, e.by)}.`,
  ],
  SHOT: [
    (e, c) => e.shotType === 'slap' ? `Slap shot from ${L(c, e.by)} at the point!` : null,
    (e, c) => e.shotType === 'wrist' ? `${L(c, e.by)} fires a wrist shot!` : null,
    (e, c) => e.shotType === 'backhand' ? `Backhand from ${L(c, e.by)}!` : null,
    (e, c) => e.shotType === 'snap' ? `Snap shot from ${L(c, e.by)}, quick release!` : null,
    (e, c) => e.shotType === 'one-timer' ? `One-timer from ${L(c, e.by)}!` : null,
    (e, c) => e.slot ? `${L(c, e.by)} shoots from the slot!` : null,
    (e, c) => `${L(c, e.by)} shoots!`,
  ],
  SAVE: [
    (e, c) => e.big ? `HUGE SAVE by ${N(c, e.goalie)}!` : null,
    (e, c) => e.save === 'GLOVE' ? `${L(c, e.goalie)} snags it with the glove!` : null,
    (e, c) => e.save === 'BLOCKER' ? `${L(c, e.goalie)} deflects it with the blocker.` : null,
    (e, c) => e.save === 'PAD_SAVE' ? `${L(c, e.goalie)} kicks it away with the pad.` : null,
    (e, c) => e.save === 'BUTTERFLY' ? `${L(c, e.goalie)} drops into the butterfly and stops it.` : null,
    (e, c) => e.save === 'SLIDE' ? `${L(c, e.goalie)} slides across and makes the save!` : null,
    (e, c) => `${L(c, e.goalie)} makes the save.`,
    (e, c) => e.rebound ? `${L(c, e.goalie)} saves it, but gives up a rebound!` : `${L(c, e.goalie)} freezes the puck.`,
    (e, c) => `Save by ${L(c, e.goalie)} on ${L(c, e.shooter)}'s shot.`,
  ],
  REBOUND: [(e, c) => `Rebound! ${L(c, e.by)} gets there first!`, () => 'Loose puck in front of the net!'],
  BLOCK: [(e, c) => `${L(c, e.by)} blocks the shot!`, (e, c) => `Shot stopped by ${L(c, e.by)}.`],
  MISS: [(e, c) => `${L(c, e.by)} misses the target.`, (e, c) => `${L(c, e.by)}'s shot sails wide.`],
  PENALTY: [
    (e, c) => `Penalty: ${N(c, e.on)}, ${e.minutes} minutes for ${e.infraction}.`,
    (e, c) => `${L(c, e.on)} heads to the penalty box. ${e.infraction}.`,
  ],
  POWER_PLAY: [(e, c) => `Power play for ${T(c, e.team)}!`, (e, c) => `${T(c, e.team)} has the man advantage.`],
  GOALIE_PULLED: [(e, c) => `${T(c, e.team)} pulls the goalie! Extra attacker on.`, (e, c) => `Empty net for ${T(c, e.team)}: six skaters.`],
  GOALIE_RETURNS: [(e, c) => `${T(c, e.team)} goalie is back in the crease.`],
  POWER_PLAY_END: [() => 'Power play over. Teams back to full strength.'],
  GOAL: [
    (e, c) => e.strength === 'PP' ? `POWER-PLAY GOAL! ${N(c, e.by)}!` : null,
    (e, c) => e.strength === 'EN' ? `EMPTY-NET GOAL! ${N(c, e.by)} seals it for ${T(c, e.team)}!` : null,
    (e, c) => e.strength === 'SH' ? `SHORT-HANDED GOAL! ${N(c, e.by)}!` : null,
    (e, c) => lead(c, e.team) === 0 ? `GOOOAL! ${N(c, e.by)} ties it for ${T(c, e.team)}!` : null,
    (e, c) => lead(c, e.team) === 1 && lateGame(c) ? `GOAL late! ${N(c, e.by)} puts ${T(c, e.team)} in front!` : null,
    (e, c) => `GOOOAL! ${N(c, e.by)} scores for ${T(c, e.team)}${e.assists?.length ? `, assisted by ${e.assists.map(a => L(c, a)).join(' and ')}` : ''}!`,
    (e, c) => `${L(c, e.by)} finds the net! Goal for ${T(c, e.team)}!`,
  ],
  ICING: [(e, c) => `Icing. Faceoff in ${T(c, e.team)}'s zone.`],
  OFFSIDE: [() => 'Offside. Play stopped.'],
  LINE_CHANGE: [(e, c) => e.team ? `${T(c, e.team)} changes lines.` : null],
  PERIOD_START: [(e, c) => `The ${periodName(e.period)} period begins. ${c.team('away')} ${c.score.away}, ${c.team('home')} ${c.score.home}.`],
  PERIOD_END: [(e) => `End of the ${periodName(e.period)} period.`],
  FINAL: [(e, c) => c.score.home === c.score.away ? 'Final, tied.' : `FINAL! ${T(c, c.score.home > c.score.away ? 'home' : 'away')} wins ${Math.max(c.score.home, c.score.away)}-${Math.min(c.score.home, c.score.away)}.`],
};
