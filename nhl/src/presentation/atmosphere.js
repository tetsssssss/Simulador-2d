// NHL atmosphere rules (crowd = home fans): goal horn for home goals, roars on breakaways and big saves,
// louder on home power plays and late in close games. Skates/sticks/boards/whistles as game effects.
import { seatsAroundRect, createCrowd } from '../../../core/render/crowd.js';
const FX = 'GAME_EFFECT', CR = 'CROWD';
export const NHL_ATMOSPHERE = {
  ambience: 'ice',
  baseline(c) {
    if (!c?.score) return 32;
    let b = 30;
    if (c.powerPlay === 'home') b += 14; else if (c.powerPlay === 'away') b += 6;
    if (c.period >= 3 && c.clock <= 300 && Math.abs(c.score.home - c.score.away) <= 1) b += 16;
    if (c.possession === 'home' && c.inZone) b += 6;
    return Math.min(85, b);
  },
  react(e, c) {
    const h = e.team === 'home';
    switch (e.type) {
      case 'GOAL': return h ? { bump: 80, sounds: [['horn', { category: FX, len: 3 }], ['cheer', { category: CR, power: 1 }]] } : { bump: 4, sounds: [['groan', { category: CR, power: 0.7 }]] };
      case 'SHOT': return { bump: h ? 8 : 4, sounds: [['crack', { category: FX, power: e.shotType === 'slap' ? 1 : 0.6 }]] };
      case 'SAVE': return { bump: e.big ? (h ? 6 : 28) : 4, sounds: [['pop', { category: FX, power: 0.8 }], ...(e.big ? [['oohs', { category: CR, power: 0.7 }]] : [])] };
      case 'REBOUND': return { bump: 10 };
      case 'BLOCK': return { sounds: [['thud', { category: FX, power: 0.5 }]] };
      case 'PASS': return { sounds: [['stick', { category: FX, power: 0.35 }]] };
      case 'FACEOFF': return { sounds: [['stick', { category: FX, power: 0.6 }]] };
      case 'HIT': return { bump: e.big ? 22 : 6, sounds: [['boards', { category: FX, power: e.big ? 1 : 0.6 }], ...(e.big ? [['oohs', { category: CR, power: 0.6 }]] : [])] };
      case 'BREAKAWAY': return { bump: h ? 40 : 15, sounds: [['oohs', { category: CR, power: 0.8 }]] };
      case 'PENALTY': return { bump: e.team === 'away' ? 14 : 2, sounds: [['whistle', { category: FX }], ...(e.team === 'home' ? [['groan', { category: CR, power: 0.5 }]] : [['cheer', { category: CR, power: 0.35 }]])] };
      case 'ICING': case 'OFFSIDE': return { sounds: [['whistle', { category: FX, len: 0.7 }]] };
      case 'PERIOD_END': case 'FINAL': return { sounds: [['buzzer', { category: FX }]], bump: e.type === 'FINAL' && c.score.home > c.score.away ? 50 : 0 };
      default: return {};
    }
  },
};

// Arena stands (world feet) beyond the glass, benches and penalty boxes.
export function nhlStands({ home, away, homeColor, awayColor, rinkL = 200, rinkW = 85 }) {
  const seats = seatsAroundRect({ x0: -8, y0: -12, x1: rinkL + 8, y1: rinkW + 12, rows: 9, rowGap: 3, spacing: 3 });
  return createCrowd({ seats, home: homeColor, away: awayColor, seed: `${away}@${home}`, unit: 3, rowGap: 1 });
}
