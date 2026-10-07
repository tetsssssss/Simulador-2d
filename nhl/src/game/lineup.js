// NHL lineups (NHL-specific): 4 forward lines (LW-C-RW), 3 defense pairs (LD-RD), 2 goalies.
// Snapshot rosters carry real 2023-24 usage (TOI) → lines follow real deployment; API rosters fall back to OVR.
import { makeAttrs, overall, playerName, nameOf } from '../nhlData.js';
import { RINK, MIDY } from '../rink/geometry.js';

const usage = p => (p.stats?.toi ?? 0) * Math.min(1, (p.stats?.gp ?? 0) / 20) + overall(p, makeAttrs(p)) / 1000;

export function buildLineup(roster) {
  const by = code => roster.filter(p => p.positionCode === code).sort((a, b) => usage(b) - usage(a));
  const C = by('C'), L = by('L'), R = by('R'), D = by('D'), G = by('G');
  const pool = [...C, ...L, ...R];
  const used = new Set();
  const take = (list) => { const p = list.find(x => !used.has(x.id)) || pool.find(x => !used.has(x.id)); if (p) used.add(p.id); return p; };
  const lines = [];
  for (let i = 0; i < 4; i++) lines.push({ C: take(C), LW: take(L), RW: take(R) });
  const pairs = [];
  for (let i = 0; i < 3; i++) pairs.push({ LD: take(D), RD: take(D) });
  const goalies = G.slice(0, 2);
  const ok = lines.every(l => l.C && l.LW && l.RW) && pairs.every(p => p.LD && p.RD) && goalies.length >= 1;
  return { lines, pairs, goalies, ok };
}

export const POS_SHORT = { C: 'C', LW: 'LW', RW: 'RW', LD: 'LD', RD: 'RD', G: 'G' };

// Faceoff formation for one team. dir = +1 if the team attacks toward x = 200. (fx, fy) = faceoff dot.
export function faceoffSpots(dir, fx = RINK.center, fy = MIDY) {
  const b = -dir; // "back" toward own net
  const clampY = y => Math.max(4, Math.min(RINK.W - 4, y));
  return {
    C: { x: fx + b * 1.2, y: fy },
    LW: { x: fx + b * 2.5, y: clampY(fy - dir * 15) },
    RW: { x: fx + b * 2.5, y: clampY(fy + dir * 15) },
    LD: { x: Math.max(RINK.goalLine + 8, Math.min(RINK.L - RINK.goalLine - 8, fx + b * 28)), y: clampY(fy - dir * 10) },
    RD: { x: Math.max(RINK.goalLine + 8, Math.min(RINK.L - RINK.goalLine - 8, fx + b * 28)), y: clampY(fy + dir * 10) },
    G: { x: dir > 0 ? RINK.goalLine + 3.2 : RINK.L - RINK.goalLine - 3.2, y: MIDY },
  };
}

// Display record for an athlete on the ice (shared by renderer + engine).
export function skaterRecord(p, slot, team) {
  const last = nameOf(p.lastName) || playerName(p);
  return { id: `${team}-${p.id}`, pid: p.id, p, team, slot, pos: slot, posLabel: slot, num: p.sweaterNumber ?? '', name: playerName(p), last, goalie: slot === 'G', x: 0, y: 0, facing: 0 };
}
