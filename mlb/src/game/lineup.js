// MLB lineups (MLB-specific): 8 fielders + DH, 9-man batting order, starting pitcher + bullpen.
// Real rosters come from the StatsAPI. Without connection a clearly labelled DEMO roster (no invented names) is used
// so the 2D field stays usable offline.
import { pos, positionalOvr, fixedRatings, isPitcher } from '../mlbData.js';

const FIELD_POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const hitVal = p => { const v = Object.fromEntries(fixedRatings(p).map(a => [a.name, a.value])); return (v['Contact vs R'] + v['Power vs R'] + v['Plate Vision'] + v['Bat Speed']) / 4; };
const speedVal = p => { const v = Object.fromEntries(fixedRatings(p).map(a => [a.name, a.value])); return v['Running Speed']; };

export function playerRecord(entry, team) {
  const per = entry.person || entry;
  const name = per.fullName || entry.fullName || 'Jogador';
  return {
    id: `${team}-${per.id}`, pid: per.id, p: { ...entry, id: per.id, person: per, demo: entry.demo }, team, name, last: entry.demo ? name.replace(/^\S+ Demo /, 'Demo ').replace(/ (\d+)$/, '$1') : name.split(' ').slice(-1)[0],
    num: entry.jerseyNumber || per.primaryNumber || '', pos: pos(entry) === 'TWP' ? 'P' : pos(entry),
    bats: per.batSide?.code || 'R', throws: per.pitchHand?.code || 'R', demo: !!entry.demo,
  };
}

export function buildLineup(roster, team) {
  const all = roster.map(e => ({ e, po: pos(e), ovr: positionalOvr(e) }));
  const used = new Set();
  const pick = test => { const c = all.filter(x => !used.has(x.e) && test(x)).sort((a, b) => b.ovr - a.ovr)[0]; if (c) used.add(c.e); return c?.e; };
  const pitchers = all.filter(x => isPitcher(x.po) || x.po === 'TWP').sort((a, b) => b.ovr - a.ovr).map(x => x.e);
  const sp = pitchers[0];
  if (sp) used.add(sp);
  const field = {};
  for (const fp of FIELD_POS) field[fp] = pick(x => x.po === fp) || pick(x => (['LF', 'CF', 'RF'].includes(fp) && x.po === 'OF') || (['1B', '2B', '3B', 'SS'].includes(fp) && x.po === 'IF')) || pick(x => !isPitcher(x.po));
  const dh = pick(x => !isPitcher(x.po));
  const hitters = [...FIELD_POS.map(fp => ({ e: field[fp], fp })), { e: dh, fp: 'DH' }].filter(h => h.e);
  // Batting order: speed/contact at the top, best bats 2-4, then descending.
  const byHit = [...hitters].sort((a, b) => hitVal(b.e) - hitVal(a.e));
  const leadoff = [...byHit.slice(0, 5)].sort((a, b) => speedVal(b.e) - speedVal(a.e))[0];
  const rest = byHit.filter(h => h !== leadoff);
  const order = [leadoff, ...rest].map(h => ({ ...playerRecord(h.e, team), pos: h.fp }));
  return {
    team, order, field: Object.fromEntries(Object.entries(field).filter(([, e]) => e).map(([k, e]) => [k, { ...playerRecord(e, team), pos: k }])),
    sp: sp ? { ...playerRecord(sp, team), pos: 'P' } : null, bullpen: pitchers.slice(1).map(e => ({ ...playerRecord(e, team), pos: 'P' })),
    ok: !!sp && Object.keys(field).every(k => field[k]) && order.length === 9,
  };
}

// Offline DEMO roster (explicitly labelled; no real names are invented).
export function demoRoster(team) {
  const spots = [['P', 6], ['C', 2], ['1B', 1], ['2B', 1], ['3B', 1], ['SS', 1], ['LF', 1], ['CF', 1], ['RF', 1], ['OF', 1], ['IF', 1]];
  const out = []; let n = 1;
  for (const [po, k] of spots) for (let i = 0; i < k; i++) {
    const id = 900000 + team.id * 50 + n;
    out.push({ demo: true, jerseyNumber: String(n * 3 % 99 || 1), position: { abbreviation: po }, person: { id, fullName: `${team.abbr} Demo ${po}${k > 1 ? ' ' + (i + 1) : ''}`, batSide: { code: n % 3 === 0 ? 'L' : 'R' }, pitchHand: { code: n % 4 === 0 ? 'L' : 'R' } } });
    n++;
  }
  return out;
}
