// Shared test fixtures: real 2026 roster snapshot -> real lineups (no generic players).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCSV, normalizePlayer } from '../src/dataService.js';
import { buildLineups } from '../src/nflEngine.js';

const here = fileURLToPath(new URL('.', import.meta.url));
let cached = null;
export function roster() {
  if (!cached) cached = parseCSV(readFileSync(here + '../data/roster_2026.csv', 'utf8')).map(normalizePlayer).filter(p => p.full_name && p.team);
  return cached;
}
export function lineups(off = 'SEA', def = 'NE') { return buildLineups(roster(), off, def); }
export function whoMap(ls, offTeam, defTeam) {
  const m = {};
  for (const p of ls.offense) m[p.gsis_id || p.full_name] = { name: p.full_name, team: offTeam, pos: p.position };
  for (const p of ls.defense) m[p.gsis_id || p.full_name] = { name: p.full_name, team: defTeam, pos: p.position };
  return m;
}
