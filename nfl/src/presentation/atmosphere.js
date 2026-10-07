// NFL atmosphere rules (crowd = home fans). Loud on third/fourth down when the home team defends, red zone,
// late close games; bursts on touchdowns, turnovers, sacks, deep shots.
import { seatsAroundRect, createCrowd } from '../../../core/render/crowd.js';
const FX = 'GAME_EFFECT', CR = 'CROWD';
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
      case 'TOUCHDOWN': { const h = home(e.side === 'def' ? 'def' : 'off'); return { bump: h ? 70 : 8, sounds: [[h ? 'cheer' : 'groan', { category: CR, power: h ? 1 : 0.8 }]] }; }
      case 'SAFETY': return { bump: home('def') ? 50 : 6, sounds: [['whistle', { category: FX }], [home('def') ? 'cheer' : 'groan', { category: CR, power: 0.8 }]] };
      case 'INTERCEPTION': return { bump: home('def') ? 55 : 6, sounds: [[home('def') ? 'cheer' : 'groan', { category: CR, power: 0.9 }]] };
      case 'FUMBLE': return { bump: 20, sounds: [['oohs', { category: CR, power: 0.7 }]] };
      case 'FUMBLE_RECOVERY': return e.lost ? { bump: home('def') ? 50 : 6, sounds: [[home('def') ? 'cheer' : 'groan', { category: CR, power: 0.9 }]] } : {};
      case 'SACK': return { bump: home('def') ? 32 : 4, sounds: [['thud', { category: FX, power: 1 }], [home('def') ? 'cheer' : 'oohs', { category: CR, power: 0.6 }]] };
      case 'TACKLE': return { sounds: [['thud', { category: FX, power: 0.6 }]] };
      case 'BROKEN_TACKLE': return { bump: 10, sounds: [['thud', { category: FX, power: 0.4 }], ['oohs', { category: CR, power: 0.4 }]] };
      case 'PASS_ATTEMPT': return e.airYards >= 25 && !e.throwAway ? { bump: 18, sounds: [['oohs', { category: CR, power: 0.5 }]] } : {};
      case 'PASS_COMPLETE': return { sounds: [['pop', { category: FX, power: 0.5 }]] };
      case 'FIRST_DOWN': return home('off') ? { bump: 14, sounds: [['cheer', { category: CR, power: 0.35 }]] } : {};
      case 'TURNOVER_ON_DOWNS': return { bump: home('def') ? 45 : 5, sounds: [[home('def') ? 'cheer' : 'groan', { category: CR, power: 0.8 }]] };
      case 'WHISTLE': return { sounds: [['whistle', { category: FX, len: 0.8 }]] };
      case 'QUARTER_START': return { sounds: [['horn', { category: FX, len: 1.2 }]] };
      case 'FINAL': { const h = c.homeScore > c.awayScore; return { bump: h ? 60 : 0, sounds: [['horn', { category: FX, len: 2 }], ...(h ? [['cheer', { category: CR, power: 1 }]] : [])] }; }
      default: return {};
    }
  },
};

// Stadium stands around the field (world yards): behind the team areas and both end zones.
export function nflStands({ home, away, homeColor, awayColor, fieldW = 53.333 }) {
  const seats = seatsAroundRect({ x0: -6, y0: -8.8, x1: 126, y1: fieldW + 8.8, rows: 12, rowGap: 1.15, spacing: 1.15 });
  return createCrowd({ seats, home: homeColor, away: awayColor, seed: `${away}@${home}`, unit: 1.15, rowGap: 1 });
}
