// NHL atmosphere rules (crowd = home fans): goal horn for home goals, roars on breakaways and big saves,
// louder on home power plays and late in close games. Skates/sticks/boards/whistles as game effects.
import { seatsAroundRect, createCrowd } from '../../../core/render/crowd.js';
const FX = 'GAME_EFFECT', CR = 'CROWD', MU = 'MUSIC';
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
      case 'GOAL': return h ? { bump: 80, sounds: [['goalHorn', { category: FX, len: 3 }], ['cheer', { category: CR, power: 1 }], ['stomp', { category: MU, delay: 1.2, power: 1 }], ['organCharge', { category: MU, delay: 2.2 }], ['applause', { category: CR, delay: 1.5, len: 3, power: 0.8 }]] } : { bump: 4, sounds: [['groan', { category: CR, power: 0.7 }], ['padSave', { category: FX, power: 0.5 }], ['applause', { category: CR, delay: 0.6, len: 2, power: 0.2, far: 0.6, pan: -0.8 }]] };
      case 'SHOT': { const t = e.shotType; const slap = t === 'slap' || t === 'one-timer'; return { bump: h ? 8 : 4, sounds: [[slap ? 'slapShot' : 'wristShot', { category: FX, power: t === 'slap' ? 1 : t === 'one-timer' ? 0.85 : t === 'backhand' ? 0.45 : 0.65 }]] }; }
      case 'SAVE': { const glove = e.save === 'GLOVE'; return { bump: e.big ? (h ? 6 : 28) : 4, sounds: [[glove ? 'pop' : 'padSave', { category: FX, power: 0.8 }], ...(e.big ? [['oohs', { category: CR, power: 0.7, delay: 0.1 }], ['applause', { category: CR, len: 1.5, power: 0.5, delay: 0.3 }]] : [])] }; }
      case 'REBOUND': return { bump: 10, sounds: [['stick', { category: FX, power: 0.8 }]] };
      case 'BLOCK': return { sounds: [['thud', { category: FX, power: 0.6 }]] };
      case 'MISS': return { sounds: [[Math.random() < 0.3 ? 'puckPost' : 'glassBang', { category: FX, power: 0.6 }], ['oohs', { category: CR, power: 0.35, delay: 0.1 }]] };
      case 'PASS': return { sounds: [['stick', { category: FX, power: e.kind === 'saucer' || e.kind === 'stretch' ? 0.5 : e.kind === 'bank' ? 0.7 : 0.35 }], ...(e.kind === 'bank' ? [['boards', { category: FX, power: 0.3, delay: 0.12 }]] : [])] };
      case 'RECEPTION': return { sounds: [['stick', { category: FX, power: 0.2 }]] };
      case 'TURNOVER': return {};
      case 'FACEOFF': return { sounds: [['stick', { category: FX, power: 0.6 }], ['skate', { category: FX, len: 0.25, power: 0.4, delay: 0.05 }]] };
      case 'HIT': return { bump: e.big ? 22 : 6, sounds: [['boards', { category: FX, power: e.big ? 1 : 0.6 }], ...(e.big ? [['glassBang', { category: FX, power: 0.5, delay: 0.05 }], ['oohs', { category: CR, power: 0.6 }]] : [])] };
      case 'BREAKAWAY': return { bump: h ? 40 : 15, sounds: [['gasp', { category: CR, power: 0.8 }], ['skate', { category: FX, len: 0.8, power: 0.7 }]] };
      case 'PENALTY': return { bump: e.team === 'away' ? 14 : 2, sounds: [['whistle', { category: FX }], ...(e.team === 'home' ? [['groan', { category: CR, power: 0.5 }]] : [['cheer', { category: CR, power: 0.35 }], ['stomp', { category: MU, delay: 0.8, power: 0.6 }]])] };
      case 'POWER_PLAY': return h ? { bump: 14, sounds: [['chant', { category: CR, n: 4, power: 0.6, delay: 0.5 }]] } : {};
      case 'ICING': case 'OFFSIDE': return { sounds: [['whistle', { category: FX, len: 0.7 }]] };
      case 'PERIOD_START': return { sounds: [['whistle', { category: FX, len: 0.5 }]] };
      case 'PERIOD_END': case 'FINAL': return { sounds: [['buzzer', { category: FX }], ...(e.type === 'FINAL' ? [['applause', { category: CR, len: 4, power: c.score.home > c.score.away ? 0.9 : 0.4 }]] : [])], bump: e.type === 'FINAL' && c.score.home > c.score.away ? 50 : 0 };
      default: return {};
    }
  },
};

// Arena stands (world feet) beyond the glass, benches and penalty boxes.
export function nhlStands({ home, away, homeColor, awayColor, rinkL = 200, rinkW = 85 }) {
  const seats = seatsAroundRect({ x0: -8, y0: -12, x1: rinkL + 8, y1: rinkW + 12, rows: 9, rowGap: 3, spacing: 3 });
  return createCrowd({ seats, home: homeColor, away: awayColor, seed: `${away}@${home}`, unit: 3, rowGap: 1 });
}
