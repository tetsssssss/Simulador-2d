// NFL atmosphere rules (crowd = home fans). Loud on third/fourth down when the home team defends, red zone,
// late close games; bursts on touchdowns, turnovers, sacks, deep shots.
import { seatsAroundRect, createCrowd } from '../../../core/render/crowd.js';
const FX = 'GAME_EFFECT', CR = 'CROWD', MU = 'MUSIC';
const pick = a => a[Math.floor(Math.random() * a.length)];
export const NFL_ATMOSPHERE = {
  ambience: 'stadium',
  baseline(c) {
    if (!c || c.down == null) return 30;
    const homeDef = c.def === c.home, close = Math.abs((c.homeScore ?? 0) - (c.awayScore ?? 0)) <= 8;
    let b = 28;
    if (c.down === 3) b += homeDef ? 22 : 8;
    if (c.down === 4) b += homeDef ? 30 : 14;
    if (c.redZone) b += 10;
    if (c.quarter >= 4 && c.clock <= 300 && close) b += 15;
    return Math.min(85, b);
  },
  react(e, c) {
    const home = side => (side === 'off' ? c.off : c.def) === c.home; // event benefits the home team?
    switch (e.type) {
      case 'SNAP': return { sounds: [['snapCadence', { category: FX, n: 2, gain: 0.7 }], ...(c.down >= 3 && home('def') && Math.random() < 0.18 ? [['chant', { category: CR, n: 3, power: 0.7 }]] : [])] };
      case 'HANDOFF': return { sounds: [['catchSlap', { category: FX, power: 0.35 }]] };
      case 'SCRAMBLE': return {};
      case 'TOUCHDOWN': { const h = home(e.side === 'def' ? 'def' : 'off'); return h ? { bump: 70, sounds: [['cheer', { category: CR, power: 1 }], ['fanfare', { category: MU, notes: [523, 659, 784, 1046, 1046], step: 0.17 }], ['stomp', { category: MU, delay: 1.1, power: 0.9 }], ['applause', { category: CR, delay: 1.2, len: 3, power: 0.8 }]] } : { bump: 8, sounds: [['groan', { category: CR, power: 0.8 }], ['applause', { category: CR, delay: 0.8, len: 2, power: 0.25, far: 0.5, pan: 0.8 }]] }; }
      case 'SAFETY': return { bump: home('def') ? 50 : 6, sounds: [['whistle', { category: FX }], [home('def') ? 'cheer' : 'groan', { category: CR, power: 0.8 }]] };
      case 'INTERCEPTION': return { bump: home('def') ? 55 : 6, sounds: [['gasp', { category: CR }], [home('def') ? 'cheer' : 'groan', { category: CR, power: 0.9, delay: 0.3 }], ...(home('def') ? [['fanfare', { category: MU, notes: [392, 523, 659], step: 0.14 }]] : [])] };
      case 'FUMBLE': return { bump: 20, sounds: [['padsCrunch', { category: FX, power: 0.8 }], ['oohs', { category: CR, power: 0.7 }]] };
      case 'FUMBLE_RECOVERY': return e.lost ? { bump: home('def') ? 50 : 6, sounds: [[home('def') ? 'cheer' : 'groan', { category: CR, power: 0.9 }]] } : {};
      case 'SACK': return { bump: home('def') ? 32 : 4, sounds: [['padsCrunch', { category: FX, power: 1 }], [home('def') ? 'cheer' : 'oohs', { category: CR, power: 0.6, delay: 0.1 }]] };
      case 'TACKLE': return { sounds: [['padsCrunch', { category: FX, power: Math.min(0.9, 0.35 + 0.05 * (e.yards ?? 3)) }]] };
      case 'BROKEN_TACKLE': return { bump: 10, sounds: [['thud', { category: FX, power: 0.5 }], ['oohs', { category: CR, power: 0.4 }]] };
      case 'PASS_ATTEMPT': return { bump: e.airYards >= 25 && !e.throwAway ? 18 : 0, sounds: [['whoosh', { category: FX, len: 0.4, power: 0.6, down: false }], ...(e.airYards >= 25 && !e.throwAway ? [['oohs', { category: CR, power: 0.5, delay: 0.2 }]] : [])] };
      case 'PASS_COMPLETE': return { sounds: [['catchSlap', { category: FX, power: 0.75 }]] };
      case 'INCOMPLETE': return { sounds: [['thud', { category: FX, power: 0.3 }], ['groan', { category: CR, power: home('off') ? 0.3 : 0.08 }]] };
      case 'FIRST_DOWN': return home('off') ? { bump: 14, sounds: [['chains', { category: FX }], ['cheer', { category: CR, power: 0.35 }]] } : { sounds: [['chains', { category: FX }]] };
      case 'TURNOVER_ON_DOWNS': return { bump: home('def') ? 45 : 5, sounds: [[home('def') ? 'cheer' : 'groan', { category: CR, power: 0.8 }]] };
      case 'FIELD_GOAL': { const good = e.good ?? e.made ?? true, h = e.team ? e.team === c.home : home('off'); return { bump: good && h ? 35 : 6, sounds: [['kick', { category: FX }], ...(good ? [[h ? 'cheer' : 'groan', { category: CR, power: 0.6, delay: 0.9 }]] : [['groan', { category: CR, power: 0.6, delay: 0.9 }]])] }; }
      case 'PUNT': return { sounds: [['kick', { category: FX, power: 0.8 }]] };
      case 'KICKOFF': return { bump: 12, sounds: [['whistle', { category: FX, len: 0.8 }], ['kick', { category: FX, delay: 0.5 }]] };
      case 'OUT_OF_BOUNDS': return { sounds: [['whistle', { category: FX, len: 0.6, pitch: 1.03 }]] };
      case 'WHISTLE': return { sounds: [['whistle', { category: FX, len: 0.8 }]] };
      case 'QUARTER_START': return { sounds: [['horn', { category: FX, len: 1.2 }]] };
      case 'FINAL': { const h = c.homeScore > c.awayScore; return { bump: h ? 60 : 0, sounds: [['horn', { category: FX, len: 2 }], ['applause', { category: CR, len: 4, power: h ? 0.9 : 0.4 }], ...(h ? [['cheer', { category: CR, power: 1 }], ['fanfare', { category: MU, notes: [523, 659, 784, 1046], step: 0.2 }]] : [])] }; }
      default: return {};
    }
  },
};

// Stadium stands around the field (world yards): behind the team areas and both end zones.
export function nflStands({ home, away, homeColor, awayColor, fieldW = 53.333 }) {
  const seats = seatsAroundRect({ x0: -6, y0: -8.8, x1: 126, y1: fieldW + 8.8, rows: 12, rowGap: 1.15, spacing: 1.15 });
  return createCrowd({ seats, home: homeColor, away: awayColor, seed: `${away}@${home}`, unit: 1.15, rowGap: 1 });
}
