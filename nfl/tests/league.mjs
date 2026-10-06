// League-wide calibration harness: every team on offense (vs a rotating opponent), so one matchup's ratings
// cannot bias the calibration. Usage: node tests/league.mjs [playsPerTeam=80] [playType=mix|pass|deep|run]
import { readFileSync } from 'node:fs';
import { runBatch, summarize } from './harness.mjs';

export function leagueBatch(perTeam = 80, type = 'mix') {
  const teams = JSON.parse(readFileSync(new URL('../data/teams.json', import.meta.url), 'utf8')).map(t => t.abbr);
  const all = [];
  for (const off of teams) all.push(...runBatch(perTeam, type, off, teams[(teams.indexOf(off) + 7) % teams.length]));
  return all;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [n = 80, type = 'mix'] = process.argv.slice(2);
  const t0 = Date.now();
  const plays = leagueBatch(Number(n), type);
  console.log(summarize(plays));
  console.log(`(${plays.length} plays in ${Date.now() - t0} ms)`);
}
