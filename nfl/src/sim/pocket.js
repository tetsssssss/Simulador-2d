// Pocket model: the pocket is not a flag, it is measured every tick from where the offensive line and the
// defenders physically are. Depth = how far the contact line sits in front of the QB; width = the span of the
// five linemen; collapse (0..1) = how much of the designed depth is gone; the leak says where it is breaking
// (EDGE left/right vs INTERIOR) and how many rushers are winning their fight or are free.
import { clamp, dist, norm, sub } from './geometry.js';

const OL = ['LT', 'LG', 'C', 'RG', 'RT'];

export function pocketInfo(sim) {
  const q = sim.qb;
  const ol = OL.map(k => sim.off[k]);
  const ys = ol.map(o => o.pos.y);
  const width = Math.max(...ys) - Math.min(...ys);
  const lineX = ol.reduce((s, o) => s + o.pos.x, 0) / ol.length;
  const designed = Math.max(3.5, sim.losX - (sim.qbState?.dropPoint?.x ?? sim.losX - 7) + 0.4);
  // Rushers that matter: free, or winning (lev > 0) / stalemated against their blocker, near enough to the QB.
  let minDist = 99, nearest = null, winning = 0, free = 0, depthSum = 0, depthN = 0;
  let dx = 0, dy = 0;
  for (const d of sim.defense) {
    if (d.down || d.assignment?.type === 'MAN' && !d.engagedWith && dist(d.pos, q.pos) > 6) continue;
    const dq = dist(d.pos, q.pos);
    if (dq > 9) continue;
    const eng = d.eng;
    const isRusher = d.assignment?.type === 'RUSH' || (eng && eng.mode === 'PASS');
    if (!isRusher) continue;
    if (eng && eng.lev < -0.3) continue; // clearly held up
    if (eng) { if (eng.lev > 0.2) winning++; } else free++;
    depthSum += Math.max(0, d.pos.x - q.pos.x); depthN++;
    const weight = eng ? clamp(0.5 + eng.lev, 0.2, 1.2) : 1;
    const u = norm(sub(q.pos, d.pos)); dx += u.x * weight; dy += u.y * weight;
    if (dq < minDist) { minDist = dq; nearest = d; }
  }
  const depth = depthN ? depthSum / depthN : designed + 3;
  const room = nearest ? minDist : 9;
  const collapse = clamp(1 - Math.min(depth, room + 0.8) / (designed + 2.2), 0, 1) * (depthN ? 1 : 0);
  let leak = null, sector = null;
  if (nearest && collapse > 0.18) {
    const lat = nearest.pos.y - q.pos.y;
    sector = Math.abs(lat) < 1.9 ? 'M' : lat < 0 ? 'L' : 'R';
    leak = sector === 'M' ? 'INTERIOR' : 'EDGE';
  }
  return { t: +sim.t.toFixed(2), depth: +depth.toFixed(2), width: +width.toFixed(1), lineX: +lineX.toFixed(1), designed: +designed.toFixed(1), minDist: +minDist.toFixed(2), collapse: +collapse.toFixed(2), leak, sector, nearest, winning, free, dir: norm({ x: dx, y: dy }) };
}
