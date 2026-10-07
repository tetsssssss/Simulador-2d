// MLB atmosphere rules (crowd = home fans): full count, bases loaded, late close innings raise the baseline;
// home runs (organ + roar), walk-offs, strikeouts by the home pitcher. Bat crack scales with exit velocity.
import { seatsAlongOutline, createCrowd } from '../../../core/render/crowd.js';
import { parkOutline } from '../field/fieldRenderer.js';
const FX = 'GAME_EFFECT', CR = 'CROWD', MU = 'MUSIC';
const spray = e => Math.max(-0.9, Math.min(0.9, (e.spray || 0) / 45)); // batted-ball direction → stereo pan
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
      case 'PITCH': return { sounds: [['whoosh', { category: FX, len: 0.28, power: Math.min(0.9, (e.mph || 90) / 105), down: true, gain: 0.7 }]] };
      case 'BALL': case 'PITCH_CAUGHT': return { sounds: [['pop', { category: FX, power: 0.7 }]] };
      case 'STRIKE': return { bump: c.fieldSide === 'home' && c.strikes === 2 ? 8 : 0, sounds: [[e.kind === 'foul' ? 'crack' : 'pop', { category: FX, power: e.kind === 'foul' ? 0.4 : 0.85 }]] };
      case 'FOUL': return { sounds: [['crack', { category: FX, power: 0.4, pan: Math.random() < 0.5 ? -0.8 : 0.8 }], ['gasp', { category: CR, power: 0.3, delay: 0.1 }]] };
      case 'CONTACT': { const p = Math.max(0.3, Math.min(1, (e.ev || 85) / 110)), big = e.kind === 'fly' && e.ev >= 98; return { bump: big ? 25 : 6, sounds: [['crack', { category: FX, power: p, pan: spray(e) }], ...(big ? [['oohs', { category: CR, power: 0.7, delay: 0.2 }]] : [])] }; }
      case 'HOME_RUN': return homeBat ? { bump: c.walkoff ? 100 : 80, sounds: [['cheer', { category: CR, power: 1 }], ['organ', { category: MU, notes: [523, 659, 784, 1046, 784, 1046] }], ['fanfare', { category: MU, delay: 0.9, notes: [392, 523, 659, 784], step: 0.17 }], ['applause', { category: CR, delay: 1.3, len: 4, power: 0.9 }]] } : { bump: 2, sounds: [['groan', { category: CR, power: 0.8 }]] };
      case 'HIT': return { bump: homeBat ? 22 + 8 * (e.bases || 1) : 2, sounds: homeBat ? [['cheer', { category: CR, power: 0.45 + 0.15 * (e.bases || 1) }], ['organCharge', { category: MU, delay: 0.5, gain: 0.8 }]] : [['applause', { category: CR, len: 1.5, power: 0.25, far: 0.6 }]] };
      case 'RUN_SCORES': return homeBat ? { bump: 20, sounds: [['cheer', { category: CR, power: 0.6 }]] } : {};
      case 'STOLEN_BASE': return { bump: homeBat ? 14 : 2, sounds: [['whoosh', { category: FX, len: 0.4, power: 0.8 }], ['padSave', { category: FX, power: 0.4, delay: 0.3 }], ...(homeBat ? [['cheer', { category: CR, power: 0.4, delay: 0.3 }]] : [])] };
      case 'STRIKEOUT': return c.fieldSide === 'home' ? { bump: 25, sounds: [['pop', { category: FX, power: 1 }], ['cheer', { category: CR, power: 0.55, delay: 0.1 }], ['stomp', { category: MU, delay: 0.5, power: 0.6 }]] } : { sounds: [['pop', { category: FX, power: 1 }], ['groan', { category: CR, power: 0.4, delay: 0.1 }]] };
      case 'WALK': return { bump: homeBat ? 10 : 0, sounds: [['applause', { category: CR, len: 1.2, power: homeBat ? 0.3 : 0.1 }]] };
      case 'OUT': return { bump: e.kind === 'doublePlay' && c.fieldSide === 'home' ? 35 : (c.fieldSide === 'home' ? 6 : 0), sounds: [['catchSlap', { category: FX, power: 0.6 }], ...(e.kind === 'doublePlay' && c.fieldSide === 'home' ? [['cheer', { category: CR, power: 0.7, delay: 0.3 }]] : [])] };
      case 'ERROR': return { bump: 15, sounds: [['oohs', { category: CR, power: 0.6 }]] };
      case 'PITCHING_CHANGE': return { sounds: [['organ', { category: MU, notes: [392, 392, 494, 392], step: 0.22 }]] };
      case 'INNING_START': return e.half === 'bottom' ? { sounds: [e.inning === 7 ? ['organTakeMe', { category: MU }] : ['organ', { category: MU }]] } : {};
      case 'FINAL': return { bump: c.score.home > c.score.away ? 60 : 0, sounds: [['applause', { category: CR, len: 4, power: c.score.home > c.score.away ? 0.9 : 0.4 }], ...(c.score.home > c.score.away ? [['cheer', { category: CR, power: 1 }], ['fanfare', { category: MU, notes: [523, 659, 784, 1046], step: 0.2 }]] : [])] };
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
