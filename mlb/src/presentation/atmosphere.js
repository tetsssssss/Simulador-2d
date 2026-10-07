// MLB atmosphere rules (crowd = home fans): full count, bases loaded, late close innings raise the baseline;
// home runs (organ + roar), walk-offs, strikeouts by the home pitcher. Bat crack scales with exit velocity.
import { seatsAlongOutline, createCrowd } from '../../../core/render/crowd.js';
import { parkOutline } from '../field/fieldRenderer.js';
const FX = 'GAME_EFFECT', CR = 'CROWD';
export const MLB_ATMOSPHERE = {
  ambience: 'ballpark',
  baseline(c) {
    if (!c?.score) return 25;
    let b = 22;
    if (c.balls === 3 && c.strikes === 2) b += 15;
    if ((c.runners || []).length === 3) b += 15; else if ((c.runners || []).some(r => r >= 2)) b += 6;
    if (c.outs === 2 && (c.runners || []).length) b += 6;
    if (c.inning >= 8 && Math.abs(c.score.home - c.score.away) <= 2) b += 12;
    if (c.strikes === 2 && c.fieldSide === 'home') b += 6;
    return Math.min(85, b);
  },
  react(e, c) {
    const homeBat = c.batSide === 'home';
    switch (e.type) {
      case 'BALL': case 'PITCH_CAUGHT': return { sounds: [['pop', { category: FX, power: 0.7 }]] };
      case 'STRIKE': return { bump: c.fieldSide === 'home' && c.strikes === 2 ? 8 : 0, sounds: [[e.kind === 'foul' ? 'crack' : 'pop', { category: FX, power: e.kind === 'foul' ? 0.4 : 0.8 }]] };
      case 'FOUL': return { sounds: [['crack', { category: FX, power: 0.4 }]] };
      case 'CONTACT': { const p = Math.max(0.3, Math.min(1, (e.ev || 85) / 110)); return { bump: e.kind === 'fly' && e.ev >= 98 ? 25 : 6, sounds: [['crack', { category: FX, power: p }], ...(e.kind === 'fly' && e.ev >= 98 ? [['oohs', { category: CR, power: 0.7 }]] : [])] }; }
      case 'HOME_RUN': return homeBat ? { bump: c.walkoff ? 100 : 80, sounds: [['cheer', { category: CR, power: 1 }], ['organ', { category: FX, notes: [523, 659, 784, 1046, 784, 1046] }]] } : { bump: 2, sounds: [['groan', { category: CR, power: 0.8 }]] };
      case 'HIT': return { bump: homeBat ? 22 + 8 * (e.bases || 1) : 2, sounds: homeBat ? [['cheer', { category: CR, power: 0.45 + 0.15 * (e.bases || 1) }]] : [] };
      case 'RUN_SCORES': return homeBat ? { bump: 20, sounds: [['cheer', { category: CR, power: 0.6 }]] } : {};
      case 'STRIKEOUT': return c.fieldSide === 'home' ? { bump: 25, sounds: [['pop', { category: FX, power: 1 }], ['cheer', { category: CR, power: 0.55 }]] } : { sounds: [['pop', { category: FX, power: 1 }], ['groan', { category: CR, power: 0.4 }]] };
      case 'WALK': return { bump: homeBat ? 10 : 0 };
      case 'OUT': return { bump: e.kind === 'doublePlay' && c.fieldSide === 'home' ? 35 : (c.fieldSide === 'home' ? 6 : 0), sounds: [['pop', { category: FX, power: 0.6 }], ...(e.kind === 'doublePlay' && c.fieldSide === 'home' ? [['cheer', { category: CR, power: 0.7 }]] : [])] };
      case 'ERROR': return { bump: 15, sounds: [['oohs', { category: CR, power: 0.6 }]] };
      case 'INNING_START': return e.half === 'bottom' ? { sounds: [['organ', { category: FX }]] } : {};
      case 'FINAL': return { bump: c.score.home > c.score.away ? 60 : 0, sounds: c.score.home > c.score.away ? [['cheer', { category: CR, power: 1 }], ['organ', { category: FX }]] : [] };
      default: return {};
    }
  },
};

// Ballpark stands (world feet) outward from the park outline: behind home, along the lines and beyond the wall.
export function mlbStands({ home, away, homeColor, awayColor }) {
  const pts = parkOutline(); pts.push(pts[0]);
  const outward = p => { const dx = p.x, dy = p.y - 150, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d }; };
  const seats = seatsAlongOutline(pts, { rows: 10, rowGap: 4.2, spacing: 4.2, start: 6, outward });
  return createCrowd({ seats, home: homeColor, away: awayColor, seed: `${away}@${home}`, unit: 4.2, rowGap: 1 });
}
