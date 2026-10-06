// Bridges the 50 existing ratings (1-200, ratings.js) to the physical/skill profile used by the simulation.
// Every value here has a consumer in src/sim/*; see docs/ATTRIBUTE_AUDIT in CLAUDE_HANDOFF.md.
import { makeRatings } from '../ratings.js';

const DEFAULT_WEIGHT = { QB: 220, RB: 212, WR: 198, TE: 250, OL: 312, DL: 290, LB: 240, DB: 198, K: 195, P: 210, LS: 240 };
const DEFAULT_HEIGHT = { QB: 75, RB: 70, WR: 73, TE: 77, OL: 77, DL: 76, LB: 74, DB: 72, K: 72, P: 74, LS: 74 };

// Detailed position: nflverse keeps the group in `position` (DB/OL/DL/LB) and the real slot in depth_chart_position.
export function detailedPosition(p) {
  const d = String(p.depth_chart_position || '').toUpperCase();
  return d || String(p.position || 'ATH').toUpperCase();
}

export function positionGroup(p) {
  const pos = String(p.position || '').toUpperCase();
  if (['C', 'G', 'T', 'OT', 'OG', 'OL'].includes(pos)) return 'OL';
  if (['DE', 'DT', 'NT', 'DL'].includes(pos)) return 'DL';
  if (['LB', 'ILB', 'OLB', 'MLB', 'EDGE'].includes(pos)) return 'LB';
  if (['CB', 'DB', 'S', 'FS', 'SS'].includes(pos)) return 'DB';
  if (pos === 'FB') return 'RB';
  return pos || 'DB';
}

const n = x => (x || 100) / 200; // 0..1

// influence (GameplaySettings): { ratingKey: k } scales how far a rating sits from the league midpoint
// (r' = 0.5 + (r - 0.5) * k). k = 1 leaves the profile untouched; k > 1 widens talent gaps, k < 1 compresses them.
export function buildProfile(player, overrides = {}, influence = null) {
  const raw = { ...makeRatings(player), ...(overrides.ratings || {}) };
  const r = {};
  for (const k in raw) r[k] = n(raw[k]);
  if (influence) for (const k in influence) if (influence[k] !== 1 && r[k] !== undefined) r[k] = Math.max(0.005, Math.min(1, 0.5 + (r[k] - 0.5) * influence[k]));
  const group = positionGroup(player);
  const weight = Number(player.weight) || DEFAULT_WEIGHT[group] || 220;
  const height = Number(player.height) || DEFAULT_HEIGHT[group] || 74;
  const massPenalty = (weight - 200) / 100;
  // Top speed ~6.3 yd/s (heavy OL) .. ~10.3 yd/s (elite DB/WR).
  const maxSpeed = Math.max(5.6, 5.0 + 5.4 * r.speed - 0.85 * massPenalty);
  // Linear acceleration (yd/s^2); explosiveness helps the first steps.
  const accel = Math.max(3.5, 4.2 + 5.2 * r.acceleration + 1.2 * r.explosiveness - 1.1 * massPenalty);
  // Lateral (turning) acceleration: agility + change of direction.
  const turn = Math.max(4, 5 + 7 * (0.5 * r.agility + 0.5 * r.changeOfDirection) - 1.2 * massPenalty);
  return {
    r, raw, group, weight, height,
    mass: weight / 220,
    maxSpeed, accel, turn,
    brake: accel * 1.35,
    reach: 0.75 + (height - 70) * 0.03 + r.jumping * 0.35, // catch / tackle radius (yd)
  };
}
