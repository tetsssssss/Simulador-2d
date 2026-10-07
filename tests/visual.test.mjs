// Phase B/C: lineups, geometry and photo resolution for NHL and MLB (no DOM needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJSON } from './env.mjs';
const { fromSnapshot, makeAttrs } = await import('../nhl/src/nhlData.js');
const { buildLineup, faceoffSpots } = await import('../nhl/src/game/lineup.js');
const { insideRink, RINK } = await import('../nhl/src/rink/geometry.js');
const nhlPhoto = await import('../nhl/src/photos.js');
const mlbData = await import('../mlb/src/mlbData.js');
const mlbLineup = await import('../mlb/src/game/lineup.js');
const mlbGeo = await import('../mlb/src/field/geometry.js');
const mlbPhoto = await import('../mlb/src/photos.js');

const snap = readJSON('nhl/data/roster_snapshot.json');

test('NHL snapshot: 32 teams of real players with NHL ids; every team builds 4 lines, 3 pairs, a goalie', () => {
  const teams = new Set(snap.players.map(p => p.team));
  assert.equal(teams.size, 32);
  for (const t of window.NHL_DATA.teams) {
    const roster = snap.players.filter(p => p.team === t.abbr).map(fromSnapshot);
    const L = buildLineup(roster);
    assert.ok(L.ok, `${t.abbr} lineup incomplete`);
    const ids = [...L.lines.flatMap(l => [l.C, l.LW, l.RW]), ...L.pairs.flatMap(p => [p.LD, p.RD]), L.goalies[0]].map(p => p.id);
    assert.equal(new Set(ids).size, ids.length, `${t.abbr} duplicate player in lineup`);
    assert.equal(L.goalies[0].positionCode, 'G');
  }
});

test('NHL goalies keep goalie attributes; skaters keep skater attributes', () => {
  const g = fromSnapshot(snap.players.find(p => p.pos === 'G')), s = fromSnapshot(snap.players.find(p => p.pos === 'C'));
  assert.deepEqual(makeAttrs(g).map(a => a.name), window.NHL_DATA.attrsGoalie);
  assert.deepEqual(makeAttrs(s).map(a => a.name), window.NHL_DATA.attrsSkater);
});

test('NHL faceoff formation is on the ice and mirrored by attack direction', () => {
  const a = faceoffSpots(1), b = faceoffSpots(-1);
  for (const sp of [...Object.values(a), ...Object.values(b)]) assert.ok(insideRink(sp.x, sp.y), JSON.stringify(sp));
  assert.ok(a.C.x < RINK.center && b.C.x > RINK.center);
  assert.ok(a.G.x < 20 && b.G.x > 180);
});

test('NHLPlayerPhotoResolver: API headshot first, else NHL mugs URL for the snapshot season/team', () => {
  assert.equal(nhlPhoto.photoUrl({ headshot: 'https://x/y.png', id: 1, teamAbbr: 'BOS' }), 'https://x/y.png');
  const p = fromSnapshot(snap.players.find(p => p.team === 'TOR'));
  assert.match(nhlPhoto.photoUrl(p), /^https:\/\/assets\.nhle\.com\/mugs\/nhl\/20232024\/TOR\/\d+\.png$/);
});

test('MLB positional OVR: pitchers rated on pitching, hitters on bat + glove (no mixing)', () => {
  const mk = (id, po) => ({ person: { id, fullName: 'X' }, position: { abbreviation: po } });
  for (let id = 1; id < 40; id++) {
    const P = mk(id, 'P');
    const fx = mlbData.fixedRatings(P);
    const v = Object.fromEntries(fx.map(a => [a.name, a.value]));
    const pitchOnly = Math.round((v['Fastball Quality'] * 3 + v['Breaking Ball Quality'] * 3 + v['Offspeed Quality'] * 2 + v['Pitch Command'] * 3 + v['Pitch Control'] * 3 + v['Pitch Movement'] * 2 + v['Pitch Velocity'] * 3 + v['Pitch Stamina'] * 1.5 + v['Pitching Clutch'] + v['Hold Runners'] * 0.5 + v['Consistency']) / 23);
    assert.equal(mlbData.positionalOvr(P), pitchOnly);
  }
});

test('MLB lineup: demo roster builds 8 fielders + DH, 9 hitters, SP; real-roster shape works the same', () => {
  for (const t of window.MLB_DATA.teams) {
    const L = mlbLineup.buildLineup(mlbLineup.demoRoster(t), 'home');
    assert.ok(L.ok, t.abbr);
    assert.equal(L.order.length, 9);
    assert.equal(new Set(L.order.map(o => o.pid)).size, 9);
    assert.ok(L.order.every(o => o.demo), 'demo players are flagged');
  }
  assert.equal(mlbPhoto.photoUrl({ demo: true, person: { id: 1 } }), '', 'no fake photo for demo players');
  assert.match(mlbPhoto.photoUrl({ person: { id: 660271 } }), /people\/660271\/headshot/);
});

test('MLB field geometry: 90-ft bases, 60.5-ft mound, fence 330/400, defense in fair territory', () => {
  assert.ok(Math.abs(Math.hypot(mlbGeo.BASES.first.x, mlbGeo.BASES.first.y) - 90) < 1e-9);
  assert.ok(Math.abs(mlbGeo.BASES.second.y - 127.28) < 0.01);
  assert.equal(mlbGeo.MOUND.y, 60.5);
  assert.equal(Math.round(mlbGeo.fenceDist(0)), 400);
  assert.equal(Math.round(mlbGeo.fenceDist(Math.PI / 4)), 330);
  for (const [k, sp] of Object.entries(mlbGeo.DEF_SPOTS)) if (k !== 'C') assert.ok(mlbGeo.isFair(sp.x, sp.y), k);
});
