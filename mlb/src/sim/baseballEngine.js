// BaseballSimulationEngine — MLB only (independent from the NFL/NHL engines). Fixed step 30 Hz, feet & seconds.
// Pipeline of every pitch: Pitch (type, velocity, location) → Batter decision (take / swing) → Contact (exit velocity,
// launch angle, spray, spin → kind) → Ball flight (gravity + drag + backspin lift, bounces, wall, fair/foul, HR) →
// Fielding (each fielder's reaction + route speed vs the trajectory: catch in the air, field the grounder, dive, or
// retrieve) → Throw (transfer + arm strength + distance, relays, double plays) → Baserunning (force / tag-up /
// extra-base decisions by speed and IQ, races against the throw) → Result (outs, runs, hits, errors, stats).
// The play is resolved from that physics at contact and then animated on the same timeline; events are emitted
// when they happen on screen (commentary, sounds, crowd and the box score read state.events).
import { createRng } from '../../../core/rng/rng.js';
import { BASES, fenceDist, DEF_SPOTS, BATTER_SPOT } from '../field/geometry.js';
import { fixedRatings } from '../mlbData.js';
import { simRatings } from './ratings.js';

export const DT = 1 / 30;
const MPH = 1.4667, G = 32.17, KD = 0.0019, KL = 0.0005, FENCE_H = 10, DEG = Math.PI / 180;
const BP = [BASES.home, BASES.first, BASES.second, BASES.third, BASES.home];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const other = s => (s === 'home' ? 'away' : 'home');
const INF = ['P', 'C', '1B', '2B', '3B', 'SS'];
export function basePos(s) { s = clamp(s, 0, 4); const i = Math.min(3, Math.floor(s)), f = s - i, a = BP[i], b = BP[i + 1]; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
const PITCHES = { FF: { d: 0, w: 0.48 }, SI: { d: -1, w: 0.08 }, SL: { d: -8, w: 0.2 }, CU: { d: -13, w: 0.1 }, CH: { d: -8.5, w: 0.14 } };

// Ball flight from contact: samples every DT until it stops, leaves the park or is foul.
export function flight({ ev, la, spray }) {
  const a = spray * DEG, ux = Math.sin(a), uy = Math.cos(a);
  let v = ev * MPH, vh = v * Math.cos(la * DEG), vz = v * Math.sin(la * DEG), x = 0, y = 1.5, z = 3, t = 0, landed = null, hr = false, wall = false;
  const pts = [{ t: 0, x, y, z }];
  const foul = Math.abs(spray) > 45;
  while (t < 12) {
    if (z > 0 || vz > 0) {
      const s = Math.hypot(vh, vz);
      vh += -KD * s * vh * DT; vz += (-G - KD * s * vz + (la > 8 ? KL * vh * vh : 0)) * DT;
    } else { vh = Math.max(0, vh - (4 + 0.06 * vh) * DT); vz = 0; }
    x += ux * vh * DT; y += uy * vh * DT; z += vz * DT; t += DT;
    if (z <= 0 && vz < 0) { z = 0; if (!landed) landed = { t, x, y }; if (vz < -6) { vz = -vz * 0.32; vh *= la < 12 ? 0.9 : 0.72; } else vz = 0; }
    const d = Math.hypot(x, y);
    if (!foul && !wall && d >= fenceDist(Math.atan2(x, y))) {
      if (z > FENCE_H && !landed) { hr = true; pts.push({ t, x, y, z }); for (let k = 0; k < 20; k++) { x += ux * vh * DT; y += uy * vh * DT; z = Math.max(0, z + vz * DT); vz -= G * DT; t += DT; pts.push({ t, x, y, z }); } break; }
      wall = true; vh = -vh * 0.3; if (!landed) landed = { t, x, y, wall: true };
    }
    pts.push({ t, x, y, z });
    if (landed && vh < 1 && z <= 0) break;
    if (foul && landed) break;
  }
  const dmax = Math.max(...pts.map(p => Math.hypot(p.x, p.y)));
  return { pts, landed, hr, foul, dist: hr ? dmax : landed ? Math.hypot(landed.x, landed.y) : dmax, hang: landed ? landed.t : t, wall };
}

export function createBaseballEngine({ home, away, seed = 'mlb', ratingsOf = null, innings = 9, speed = 1 }) {
  const rng = createRng(String(seed));
  const gauss = () => { let u = 0, v = 0; while (!u) u = rng.next(); while (!v) v = rng.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const rate = ratingsOf || (p => simRatings(fixedRatings(p)));
  const roster = {};
  const mk = r => { if (!r) return null; if (roster[r.id]) return roster[r.id]; const rec = { ...r, R: rate(r.p), x: 0, y: 0, px: 0, py: 0, facing: null, tx: 0, ty: 0, spd: 0 }; roster[rec.id] = rec; return rec; };
  const T = {};
  for (const side of ['home', 'away']) {
    const L = (side === 'home' ? home : away).lineup;
    const field = Object.fromEntries(Object.entries(L.field).map(([k, r]) => [k, mk({ ...r, pos: k })]));
    const order = L.order.map(r => { const f = Object.values(field).find(x => x.pid === r.pid); return f || mk(r); });
    T[side] = { field, order, pitcher: mk(L.sp), bullpen: L.bullpen.map(mk), idx: 0, pitches: 0, runsAllowed: 0 };
  }
  const S = {
    t: 0, home, away, inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0, score: { home: 0, away: 0 }, hits: { home: 0, away: 0 }, errors: { home: 0, away: 0 },
    linescore: { home: [], away: [] }, runners: [], batter: null, fielders: [], ball: { x: 0, y: 60.5, z: 6, px: 0, py: 60.5, pz: 6, holder: null, hidden: true, landing: null },
    throwTarget: null, events: [], box: {}, roster, over: false, phase: 'PRE', lastPitch: null, pitchLog: [], speed,
  };
  let acc = 0, phaseT = 2.0, play = null, pitchAnim = null, nextPA = true;
  const bat = () => (S.half === 'top' ? 'away' : 'home'), fld = () => other(bat());
  const box = id => (S.box[id] ||= { ab: 0, h: 0, d2: 0, d3: 0, hr: 0, r: 0, rbi: 0, bb: 0, k: 0, outs: 0, ha: 0, ra: 0, bba: 0, ka: 0, pc: 0, hra: 0 });
  const emit = (type, data = {}) => { const e = { type, t: +S.t.toFixed(2), inning: S.inning, half: S.half, ...data }; S.events.push(e); return e; };
  const pitcher = () => T[fld()].pitcher;

  // ---------- personnel ----------
  function setDefense() {
    const t = T[fld()];
    S.fielders = [...Object.values(t.field), t.pitcher].map(f => { const sp = DEF_SPOTS[f === t.pitcher ? 'P' : f.pos]; f.home = sp; return f; });
    for (const f of S.fielders) if (f === t.pitcher) f.pos = 'P';
  }
  function resetPositions(snap = false) {
    for (const f of S.fielders) { f.tx = f.home.x; f.ty = f.home.y; f.spd = 16; if (snap) { f.x = f.px = f.tx; f.y = f.py = f.ty; } }
    for (const r of S.runners) { const p = basePos(r.base); r.tx = p.x + (r.base === 1 ? 6 : r.base === 2 ? (r.base ? 4 : 0) : 0); r.ty = p.y; r.spd = 12; if (snap) { r.x = r.px = p.x; r.y = r.py = p.y; } }
    S.ball.holder = pitcher().id; S.ball.hidden = false; S.ball.landing = null; S.throwTarget = null;
  }
  function newBatter() {
    const t = T[bat()], b = t.order[t.idx % 9];
    const sp = BATTER_SPOT(batsAgainst(b, pitcher()));
    Object.assign(b, { x: sp.x, y: sp.y, px: sp.x, py: sp.y, tx: sp.x, ty: sp.y, spd: 0, base: 0 });
    S.batter = b; S.balls = 0; S.strikes = 0;
    emit('AT_BAT', { batter: b.id, pitcher: pitcher().id, team: bat() });
  }
  const batsAgainst = (b, p) => (b.bats === 'S' ? (p.throws === 'L' ? 'R' : 'L') : b.bats);
  function maybeChangePitcher() {
    const t = T[fld()], p = t.pitcher, lim = 82 + 32 * p.R.stamina;
    if (!t.bullpen.length || !(box(p.id).pc > lim || (box(p.id).ra >= 6 && box(p.id).pc > 45))) return;
    const next = t.bullpen.shift(); next.pos = 'P'; t.pitcher = next;
    setDefense(); Object.assign(next, { x: DEF_SPOTS.P.x, y: DEF_SPOTS.P.y, px: DEF_SPOTS.P.x, py: DEF_SPOTS.P.y });
    emit('PITCHING_CHANGE', { pitcher: next.id, team: fld() });
  }

  // ---------- the pitch ----------
  function throwPitch() {
    const p = pitcher(), b = S.batter, R = p.R;
    // pitch type by count
    const ahead = S.strikes > S.balls, behind = S.balls > S.strikes;
    let tot = 0; const w = Object.entries(PITCHES).map(([k, v]) => { const ww = v.w * (k === 'FF' || k === 'SI' ? (behind ? 1.5 : ahead ? 0.75 : 1) : (ahead ? 1.4 : behind ? 0.7 : 1)) * (k === 'SL' || k === 'CU' ? 0.6 + R.brk : k === 'CH' ? 0.6 + R.off : 1); tot += ww; return [k, ww]; });
    let r = rng.next() * tot, type = 'FF'; for (const [k, ww] of w) { if ((r -= ww) <= 0) { type = k; break; } }
    const mph = 86 + 12 * R.velo + PITCHES[type].d + gauss() * 0.8;
    const stuff = clamp((type === 'FF' ? (R.fb + R.velo) / 2 : type === 'SI' ? (R.fb + R.movement) / 2 : type === 'CH' ? R.off : R.brk) * 0.8 + R.movement * 0.2 + (box(p.id).pc > 90 ? -0.06 : 0), 0, 1);
    // location: aim in the zone more when behind, on the edges when ahead
    const zoneAim = clamp(0.47 + 0.08 * (S.balls - S.strikes) + 0.1 * R.command, 0.3, 0.9);
    const inIntent = rng.next() < zoneAim;
    const ax = inIntent ? (rng.next() * 2 - 1) * 0.55 : (rng.next() < 0.5 ? -1 : 1) * (0.95 + rng.next() * 0.5);
    const az = inIntent ? 1.8 + rng.next() * 1.4 : (rng.next() < 0.6 ? 1.15 + rng.next() * 0.3 : 3.6 + rng.next() * 0.4);
    const sig = 0.42 - 0.26 * R.control;
    const x = ax + gauss() * sig, z = az + gauss() * sig;
    const inZone = Math.abs(x) <= 0.83 && z >= 1.5 && z <= 3.5;
    const flightT = 55 / (mph * MPH);
    box(p.id).pc++; T[fld()].pitches++;
    S.lastPitch = { type, mph: +mph.toFixed(1), x: +x.toFixed(2), z: +z.toFixed(2), inZone };
    emit('PITCH', { pitcher: p.id, batter: b.id, pitchType: type, mph: +mph.toFixed(1), zone: inZone, team: fld() });
    pitchAnim = { t0: S.t, T: flightT, type, mph, x, z, inZone, stuff };
    S.phase = 'PITCH';
    S.ball.holder = null; S.ball.hidden = false;
  }
  function pitchArrives() {
    const { x, z, inZone, stuff } = pitchAnim, b = S.batter, p = pitcher(), R = b.R;
    const vsL = p.throws === 'L', contact = vsL ? R.contactL : R.contactR, power = vsL ? R.powerL : R.powerR;
    const outBy = inZone ? 0 : Math.max(Math.abs(x) - 0.83, z < 1.5 ? 1.5 - z : z - 3.5);
    if (!inZone && Math.abs(x) > 1.55 && z > 1 && z < 4 && rng.next() < 0.06) { S.pitchLog.push('HBP'); return endPA('HBP'); }
    const two = S.strikes === 2;
    const swingP = inZone ? 0.6 + 0.14 * R.timing - 0.06 * stuff + (two ? 0.22 : 0) : clamp(0.36 - 0.3 * R.eye + 0.14 * stuff + (two ? 0.1 : 0) - outBy * 0.4, 0.03, 0.6);
    if (rng.next() >= swingP) {
      const frame = !inZone && outBy < 0.18 && rng.next() < 0.22 * (T[fld()].field.C?.R.framing ?? 0.6);
      if (inZone || frame) return strike('called');
      return ballCalled();
    }
    const cP = clamp(0.84 + 0.17 * contact - 0.26 * stuff - (inZone ? 0 : 0.2 + outBy * 0.2), 0.38, 0.97);
    if (rng.next() >= cP) return strike('swinging');
    if (rng.next() < 0.43 + (inZone ? 0 : 0.08)) return foul();
    // batted ball: exit velocity / launch angle / spray / spin
    const q = 0.5 * contact + 0.5 * R.timing - 0.35 * stuff + gauss() * 0.22 - (inZone ? 0 : 0.15);
    const ev = clamp(78 + 12 * power + 4 * R.batSpeed + 8 * q + gauss() * 9, 40, 119);
    const la = clamp(10 + 9 * (power - 0.5) + gauss() * 24 + (z - 2.5) * -5, -40, 78);
    const pull = batsAgainst(b, p) === 'R' ? -1 : 1;
    const spray = clamp(pull * (6 + 10 * power) + gauss() * 21, -62, 62);
    const kind = la < 10 ? 'ground' : la < 25 ? 'line' : la < 50 ? 'fly' : 'pop';
    const spin = Math.round(kind === 'ground' ? 600 + rng.next() * 900 : 1800 + la * 30 + rng.next() * 500);
    if (Math.abs(spray) > 45) { emit('CONTACT', { batter: b.id, ev: Math.round(ev), la: Math.round(la), spray: Math.round(spray), kind, spin, foul: true }); return foul(); }
    emit('CONTACT', { batter: b.id, ev: Math.round(ev), la: Math.round(la), spray: Math.round(spray), kind, spin });
    startPlay({ ev, la, spray, kind });
  }
  function strike(kind) {
    S.strikes++;
    if (S.strikes >= 3) { S.pitchLog.push('K'); return endPA('K', { looking: kind === 'called' }); }
    emit('STRIKE', { kind, batter: S.batter.id }); afterPitch();
  }
  function ballCalled() { S.balls++; if (S.balls >= 4) return endPA('BB'); emit('BALL', { batter: S.batter.id }); afterPitch(); }
  function foul() { if (S.strikes < 2) { S.strikes++; emit('STRIKE', { kind: 'foul', batter: S.batter.id }); } else emit('FOUL', { batter: S.batter.id }); afterPitch(); }
  function afterPitch() { S.phase = 'PRE'; phaseT = 1.1; S.ball.holder = T[fld()].field.C?.id || null; }

  // ---------- plate appearance endings without a ball in play ----------
  function endPA(kind, extra = {}) {
    const b = S.batter, p = pitcher();
    if (kind === 'K') { box(b.id).ab++; box(b.id).k++; box(p.id).ka++; box(p.id).outs++; S.outs++; emit('STRIKEOUT', { batter: b.id, pitcher: p.id, team: fld(), ...extra }); }
    else {
      box(b.id).bb += kind === 'BB' ? 1 : 0; box(p.id).bba += kind === 'BB' ? 1 : 0;
      emit(kind === 'BB' ? 'WALK' : 'HIT_BY_PITCH', { batter: b.id, pitcher: p.id, team: bat() });
      // forced advances only
      const occ = new Set(S.runners.map(r => r.base));
      const forced = [];
      for (let base = 1; base <= 3 && occ.has(base); base++) forced.push(base);
      const scoreRunners = [];
      for (const r of [...S.runners].sort((a, c) => c.base - a.base)) if (forced.includes(r.base)) { r.base++; if (r.base === 4) scoreRunners.push(r); }
      for (const r of scoreRunners) { S.runners.splice(S.runners.indexOf(r), 1); runScores(r, b); }
      b.base = 1; S.runners.push(b);
    }
    S.batter = null; finishPA();
  }
  function runScores(r, batter, rbi = true) {
    S.score[bat()]++; box(r.id).r++; if (rbi && batter) box(batter.id).rbi++; box(pitcher().id).ra++; T[fld()].runsAllowed++;
    const li = S.inning - 1; S.linescore[bat()][li] = (S.linescore[bat()][li] || 0) + 1;
    emit('RUN_SCORES', { runner: r.id, team: bat() });
  }
  function finishPA() {
    T[bat()].idx++;
    if (walkoff()) return;
    if (S.outs >= 3) return endHalf();
    S.phase = 'PRE'; phaseT = 1.8; nextPA = true;
    resetPositions(false);
  }
  const walkoff = () => { if (S.half === 'bottom' && S.inning >= innings && S.score.home > S.score.away) { finish(true); return true; } return false; };

  // ---------- ball in play: resolve from physics, then animate ----------
  function reach(f, p, ground = false) { // seconds for fielder f to get to point p (react + accelerate + run, minus the glove reach)
    const react = (ground ? 0.28 : 0.15) + 0.35 * (1 - f.R.reaction), run = 20 + 9 * f.R.speed;
    const d = Math.max(0, dist(f, p) - (ground ? 1.5 + 2 * f.R.range : 3 + 2.5 * f.R.range));
    return react + (d > 0 ? 0.22 : 0) + d / (run * (ground ? 1 : 0.84)); // routes to balls in the air are never perfectly straight
  }
  const throwSpeed = f => 92 + 48 * f.R.arm;
  const transfer = f => 0.38 + 0.45 * (1 - f.R.transfer);
  function startPlay(contact) {
    const fl = flight(contact), b = S.batter, fieldT = T[fld()];
    const plan = { fl, events: [], fielderMoves: [], runnerMoves: [], throws: [], end: 0, holderAt: [] };
    const sched = (t, type, data, apply) => plan.events.push({ t, type, data, apply });
    S.ball.landing = fl.landed && !fl.hr ? { x: fl.landed.x, y: fl.landed.y } : null;
    const rs = r => 23 + 7 * r.R.speed;
    // runners on base + the batter-runner
    const runners = S.runners.map(r => ({ r, from: r.base, start: S.outs === 2 ? 0 : 0.15 })), br = { r: b, from: 0, start: 0.55 + 0.15 * (1 - b.R.speed) };
    const lead = x => (x.from === 0 ? 0 : x.from === 2 ? 18 : x.from === 1 ? 12 : 10) + (x.from && S.outs === 2 ? 10 : 0);
    const arrive = (x, k) => x.start + (90 * (k - x.from) - lead(x)) / rs(x.r) + 0.2 * Math.max(0, k - x.from - 1);
    // --- home run
    if (fl.hr) {
      const runs = runners.length + 1, tEnd = fl.pts[fl.pts.length - 1].t;
      sched(fl.hang * 0.9, 'HOME_RUN', { by: b.id, runs, dist: Math.round(fl.dist), team: bat() }, () => { S.hits[bat()]++; box(b.id).ab++; box(b.id).h++; box(b.id).hr++; box(pitcher().id).ha++; box(pitcher().id).hra++; });
      // home-run trot (shortened for pace): everyone circles the bases
      let last = 0;
      [...runners, br].forEach(x => { const t0 = fl.hang * 0.6, ta = t0 + (4 - x.from) * 90 / 34; last = Math.max(last, ta); plan.runnerMoves.push({ rec: x.r, from: x.from, to: 4, t0, spd: 34 }); sched(ta, 'RUN_SCORES_INT', { r: x.r }, () => runScores(x.r, b)); });
      plan.end = Math.max(tEnd, last) + 1;
      plan.ballHiddenAt = tEnd;
      for (const f of S.fielders) plan.fielderMoves.push({ f, x: f.x, y: f.y });
      return beginPlay(plan);
    }
    // --- who gets to the ball first (fielders' routes vs the trajectory)
    let best = null;
    for (const f of S.fielders) {
      if (f.pos === 'C' && dist(fl.pts[Math.min(fl.pts.length - 1, 30)], BASES.home) > 40) continue;
      for (let i = 4; i < fl.pts.length; i += 2) {
        const pt = fl.pts[i]; if (pt.z > (contact.la < 25 ? 7.5 : 9)) continue;
        const air = contact.la >= 10 && (!fl.landed || pt.t < fl.landed.t);
        const m = pt.t - reach(f, pt, !air);
        // a grounder reached at the last instant is a dive/backhand that does not always stay in the glove
        if (m >= 0 && ((air && (contact.la >= 25 || m > 0.25 || rng.next() < 0.3 + m * 2)) || (!air && (m > 0.3 || rng.next() < 0.35 + m * 2)))) { if (!best || pt.t < best.t) best = { f, i, t: pt.t, pt, air, m }; break; }
      }
    }
    // diving / sliding attempt at the landing spot if nobody arrived in time
    let dive = null;
    if (fl.landed && (!best || !best.air)) {
      for (const f of S.fielders) {
        if (INF.includes(f.pos) && Math.hypot(fl.landed.x, fl.landed.y) > 170) continue;
        const m = fl.landed.t - reach(f, fl.landed);
        if (m > -0.4 && (!dive || m > dive.m)) dive = { f, m };
      }
    }
    if (dive && (!best || !best.air) && contact.kind !== 'ground' && rng.next() < clamp(0.62 + dive.m * 1.4 + 0.25 * (dive.f.R.range - 0.6), 0.03, 0.9)) {
      const i = fl.pts.findIndex(p => p.t >= fl.landed.t - DT * 2);
      best = { f: dive.f, i, t: fl.pts[i].t, pt: fl.pts[i], air: true, m: 0, dive: true };
    }
    if (!best) { // nobody intercepts: the nearest fielder retrieves where the ball stops
      const endPt = fl.pts[fl.pts.length - 1];
      let f0 = null, bt = Infinity; for (const f of S.fielders) { const t = reach(f, endPt); if (t < bt) { bt = t; f0 = f; } }
      const i = fl.pts.length - 1; best = { f: f0, i, t: Math.max(bt, endPt.t), pt: endPt, air: false, retrieve: true };
    }
    const F = best.f, Q = { x: best.pt.x, y: best.pt.y }, tF = best.t;
    plan.fielder = F; plan.fieldT = tF; plan.fieldIdx = best.i; plan.Q = Q;
    plan.fielderMoves.push({ f: F, x: Q.x, y: Q.y, t: tF });
    // coverage: 1B → first, SS/2B → second, 3B → third, C → home; outfielders back up the play
    const cover = { '1B': 1, '2B': 2, SS: 2, '3B': 3, C: 4 };
    for (const f of S.fielders) if (f !== F) {
      let base = cover[f.pos];
      if (f.pos === '2B' && F.pos !== 'SS' && Q.x < 0) base = 2; else if (f.pos === 'SS' && (F.pos === '2B' || Q.x >= 0)) base = 2; else if (f.pos === '2B' && F.pos === '1B') base = 1;
      if (f.pos === 'P') { const p = F.pos === '1B' ? basePos(1) : { x: f.x, y: f.y + 6 }; plan.fielderMoves.push({ f, x: p.x, y: p.y }); continue; }
      if (base) { const p = basePos(base); plan.fielderMoves.push({ f, x: p.x, y: p.y }); }
      else plan.fielderMoves.push({ f, x: (f.x + Q.x) / 2, y: (f.y + Q.y) / 2 }); // back up
    }
    const err = !best.retrieve && rng.next() < (best.air ? 0.012 : 0.025) * (1.4 - F.R.hands) * (best.dive ? 3 : 1);
    const depth = Math.hypot(Q.x, Q.y);
    const outsNow = S.outs;
    const pitcherRec = pitcher();
    // ===== CASE A: caught in the air =====
    if (best.air && !err) {
      const kind = contact.la > 50 && depth < 200 ? 'popout' : contact.la < 22 ? 'lineout' : 'flyout';
      sched(tF, 'OUT', { kind, fielder: F.id, batter: b.id, team: fld(), dive: !!best.dive, depth: Math.round(depth), pos: F.pos, tF: +tF.toFixed(2), la: Math.round(contact.la), ev: Math.round(contact.ev) }, () => { S.outs++; box(b.id).ab++; box(pitcherRec.id).outs++; });
      plan.runnerMoves.push({ rec: b, from: 0, to: 0.6, t0: br.start, spd: rs(b), out: tF });
      let outs = outsNow + 1, tLast = tF;
      for (const x of runners.sort((a, c) => c.from - a.from)) {
        if (outs >= 3) { plan.runnerMoves.push({ rec: x.r, from: x.from, to: x.from + 0.5, t0: 0, spd: rs(x.r) }); continue; }
        const tagable = (x.from === 3 && depth > 190) || (x.from === 2 && depth > 270 && Q.x > -60);
        if (!tagable) { plan.runnerMoves.push({ rec: x.r, from: x.from, to: x.from + 0.15, t0: x.start, spd: 8, back: tF + 0.3 }); continue; }
        const tr = tF + 0.1 + 90 / rs(x.r), tt = tF + transfer(F) + dist(Q, basePos(x.from + 1)) / throwSpeed(F) + gauss() * 0.15;
        const send = tr + (0.5 - 0.4 * x.r.R.runIQ) < tt + 0.35;
        if (!send) { plan.runnerMoves.push({ rec: x.r, from: x.from, to: x.from, t0: 0, spd: 8 }); continue; }
        const safe = tr < tt;
        plan.throws.push({ from: F, to: x.from + 1, t0: tF + transfer(F), t1: tt });
        plan.runnerMoves.push({ rec: x.r, from: x.from, to: x.from + 1, t0: tF + 0.1, spd: rs(x.r), out: safe ? null : tt });
        if (safe) { if (x.from === 3) sched(tr, 'RUN_SCORES_INT', { r: x.r }, () => runScores(x.r, b)); }
        else { outs++; sched(tt, 'OUT', { kind: 'doublePlay', fielder: F.id, runner: x.r.id, team: fld() }, () => { S.outs++; box(pitcherRec.id).outs++; }); }
        tLast = Math.max(tLast, tr, tt);
      }
      plan.end = tLast + 1.4;
      plan.final = { batterBase: 0 };
      return beginPlay(plan);
    }
    // ===== CASE B: infield grounder fielded cleanly → force plays =====
    const infield = INF.includes(F.pos) && depth < 165 && !best.retrieve;
    if (!best.air && infield && !err) {
      const tFielded = tF;
      const occ = new Set(runners.map(x => x.from));
      const forcedFrom = []; for (let k = 1; k <= 3 && occ.has(k); k++) forcedFrom.push(k);
      const tb1 = arrive(br, 1) + gauss() * 0.1;
      let outs = outsNow, tLast = tFielded;
      const outsList = [];
      // double play chance: runner on first, fewer than two outs, ball fielded quickly
      const r1 = runners.find(x => x.from === 1);
      let firstThrowTarget = 1, dp = false;
      if (r1 && outs < 2 && tFielded < 2.2) {
        const t2 = tFielded + transfer(F) + dist(Q, basePos(2)) / throwSpeed(F) + gauss() * 0.1, tr2 = arrive(r1, 2);
        if (t2 < tr2) {
          firstThrowTarget = 2; outsList.push({ x: r1, t: t2, base: 2 }); outs++;
          plan.throws.push({ from: F, to: 2, t0: tFielded + transfer(F), t1: t2 });
          const pivot = S.fielders.find(f => (f.pos === 'SS' || f.pos === '2B') && f !== F) || F;
          const t3 = t2 + 0.42 + dist(basePos(2), basePos(1)) / throwSpeed(pivot) + gauss() * 0.12;
          if (outs < 3 && t3 < tb1) { outsList.push({ x: br, t: t3, base: 1 }); outs++; dp = true; plan.throws.push({ from: pivot, to: 1, t0: t2 + 0.42, t1: t3 }); }
          tLast = Math.max(tLast, t3);
        }
      }
      if (firstThrowTarget === 1) {
        const self1 = F.pos === '1B' && dist(Q, basePos(1)) < 25;
        const t1 = self1 ? tFielded + dist(Q, basePos(1)) / (20 + 9 * F.R.speed) : tFielded + transfer(F) + dist(Q, basePos(1)) / throwSpeed(F) + gauss() * 0.1;
        if (!self1) plan.throws.push({ from: F, to: 1, t0: tFielded + transfer(F), t1 });
        const throwErr = !self1 && rng.next() < 0.012 * (1.3 - F.R.armAcc);
        if (throwErr) { plan.throwError = true; }
        else if (t1 < tb1) { outsList.push({ x: br, t: t1, base: 1 }); outs++; }
        tLast = Math.max(tLast, t1, tb1);
      }
      const batterOut = outsList.some(o => o.x === br);
      // runners: forced runners advance one base; others advance on a slow roller / right side or with two outs
      const moves = [];
      for (const x of runners.sort((a, c) => c.from - a.from)) {
        const outHere = outsList.find(o => o.x === x);
        if (outHere) { moves.push({ x, to: x.from + 1, out: outHere.t }); continue; }
        const forced = forcedFrom.includes(x.from);
        const adv = forced || outsNow === 2 || (x.from === 2 && (Q.x > 0 || tFielded > 1.6)) || (x.from === 3 && tFielded > 1.75 && rng.next() < 0.6);
        let to = adv ? x.from + 1 : x.from;
        if (plan.throwError && to < 4) to++;
        moves.push({ x, to });
      }
      // a ground-out third out by force (or on the batter at first) wipes the runs
      const thirdOutForce = outs >= 3;
      for (const mv of moves) {
        plan.runnerMoves.push({ rec: mv.x.r, from: mv.x.from, to: mv.to, t0: mv.x.start, spd: rs(mv.x.r), out: mv.out ?? null });
        if (mv.to >= 4 && !mv.out && !thirdOutForce) sched(arrive(mv.x, 4), 'RUN_SCORES_INT', { r: mv.x.r, rbi: !dp && !plan.throwError }, () => runScores(mv.x.r, b, !dp && !plan.throwError));
      }
      const brTo = batterOut ? 1 : plan.throwError ? 2 : 1;
      plan.runnerMoves.push({ rec: b, from: 0, to: brTo, t0: br.start, spd: rs(b), out: batterOut ? outsList.find(o => o.x === br).t : null });
      for (const o of outsList) sched(o.t, 'OUT', { kind: dp ? 'doublePlay' : o.x === br ? 'groundout' : 'fieldersChoice', fielder: F.id, batter: b.id, runner: o.x.r.id, team: fld() }, () => { S.outs++; box(pitcherRec.id).outs++; });
      if (dp) plan.events = plan.events.filter((e, i, arr) => !(e.type === 'OUT' && arr.findIndex(z => z.type === 'OUT') !== i)); // one DP call
      if (dp) sched(tLast, 'OUT_SILENT', {}, () => { S.outs++; box(pitcherRec.id).outs++; });
      if (!batterOut && !plan.throwError) sched(tb1, 'HIT', { by: b.id, bases: 1, team: bat(), fielder: F.id, infield: true }, () => { S.hits[bat()]++; box(b.id).h++; box(pitcherRec.id).ha++; });
      if (plan.throwError) sched(tb1, 'ERROR', { fielder: F.id, team: fld() }, () => { S.errors[fld()]++; });
      box(b.id).ab++;
      plan.end = tLast + 1.3;
      plan.final = { batterBase: batterOut ? null : brTo };
      return beginPlay(plan);
    }
    // ===== CASE C: base hit (or error) — race between runners and throws =====
    const tGot = tF + (err ? 0.8 : 0), from = F;
    const throwT = k => { const d = dist(Q, basePos(k)); return tGot + transfer(from) + 0.2 + d / (throwSpeed(from) * (d > 150 ? 0.78 : 1)) + (d > 220 ? 0.35 : 0); };
    const margin = x => 0.3 - 0.3 * x.r.R.runIQ;
    let bTo = 1;
    for (let k = 2; k <= 3; k++) if (arrive(br, k) + margin(br) < throwT(k)) bTo = k; else break;
    if (err) bTo = Math.max(bTo, 2);
    const targets = new Map(); let ahead = 5;
    for (const x of runners.sort((a, c) => c.from - a.from)) {
      let to = x.from + 1;
      for (let k = x.from + 2; k <= 4; k++) if (arrive(x, k) + margin(x) < throwT(k)) to = k; else break;
      to = Math.min(to, ahead === 5 ? 4 : Math.max(x.from + 1, ahead - 1));
      if (to < 4) ahead = to; targets.set(x, to);
    }
    // forces from behind: each runner must vacate for the one behind
    const ordered = [...runners].sort((a, c) => a.from - c.from); let need = bTo;
    for (const x of ordered) { if (x.from <= need) targets.set(x, Math.max(targets.get(x), Math.min(4, need + 1))); need = targets.get(x); }
    // the defense throws at the tightest race
    let tight = null;
    for (const [x, to] of [...targets, [br, bTo]]) { const mg = throwT(to) - arrive(x, to); if (to >= 2 && (!tight || mg < tight.mg)) tight = { x, to, mg }; }
    const outs0 = S.outs; let outRunner = null, tLast = tGot;
    if (tight && tight.mg < 0.6) {
      const ta = arrive(tight.x, tight.to) + gauss() * 0.22, tt = throwT(tight.to) + gauss() * 0.16;
      plan.throws.push({ from, to: tight.to, t0: tGot + transfer(from), t1: tt });
      if (tt < ta && outs0 < 3) outRunner = { x: tight.x, t: tt };
      tLast = Math.max(tLast, tt, ta);
    } else plan.throws.push({ from, to: 2, t0: tGot + transfer(from), t1: tGot + transfer(from) + dist(Q, basePos(2)) / throwSpeed(from) });
    const hitBases = err ? 0 : outRunner?.x === br ? Math.max(1, bTo - 1) : bTo;
    if (err) sched(tF + 0.2, 'ERROR', { fielder: F.id, team: fld() }, () => { S.errors[fld()]++; });
    else sched(arrive(br, Math.max(1, hitBases)) - 0.05, 'HIT', { by: b.id, bases: hitBases, team: bat(), fielder: F.id }, () => {
      S.hits[bat()]++; const bb = box(b.id); bb.h++; if (hitBases === 2) bb.d2++; if (hitBases === 3) bb.d3++; box(pitcherRec.id).ha++;
    });
    box(b.id).ab++;
    const outsAfter = outs0 + (outRunner ? 1 : 0);
    for (const [x, to] of targets) {
      const isOut = outRunner?.x === x;
      plan.runnerMoves.push({ rec: x.r, from: x.from, to, t0: x.start, spd: rs(x.r), out: isOut ? outRunner.t : null });
      if (to >= 4 && !isOut) { const ta = arrive(x, 4); if (!(outsAfter >= 3 && outRunner && outRunner.t < ta)) sched(ta, 'RUN_SCORES_INT', { r: x.r, rbi: !err }, () => runScores(x.r, b, !err)); tLast = Math.max(tLast, ta); }
    }
    plan.runnerMoves.push({ rec: b, from: 0, to: bTo, t0: br.start, spd: rs(b), out: outRunner?.x === br ? outRunner.t : null });
    if (outRunner) sched(outRunner.t, 'OUT', { kind: 'thrownOut', fielder: from.id, runner: outRunner.x.r.id, team: fld() }, () => { S.outs++; box(pitcherRec.id).outs++; });
    tLast = Math.max(tLast, arrive(br, bTo));
    plan.end = tLast + 1.3;
    plan.final = { batterBase: outRunner?.x === br ? null : bTo };
    return beginPlay(plan);
  }

  function beginPlay(plan) {
    plan.t0 = S.t; plan.events.sort((a, b) => a.t - b.t); plan.ei = 0;
    for (const m of plan.fielderMoves) { m.f.tx = m.x; m.f.ty = m.y; m.f.spd = 20 + 9 * m.f.R.speed; m.f.delay = 0.12 + 0.38 * (1 - m.f.R.reaction); }
    // batter becomes a runner
    S.runners = [...S.runners.filter(r => r !== S.batter), S.batter];
    for (const mv of plan.runnerMoves) { mv.rec.move = mv; mv.rec.prog = mv.from; mv.rec.isOut = false; }
    S.batter = null;
    play = plan; S.phase = 'PLAY';
  }

  function animatePlay() {
    const p = play, tau = S.t - p.t0;
    // events due
    while (p.ei < p.events.length && p.events[p.ei].t <= tau) {
      const e = p.events[p.ei++];
      e.apply?.();
      if (e.type === 'RUN_SCORES_INT' || e.type === 'OUT_SILENT') { if (e.type === 'RUN_SCORES_INT') { const i = S.runners.indexOf(e.data.r); if (i >= 0) S.runners.splice(i, 1); } continue; }
      emit(e.type, e.data);
    }
    // ball
    const b = S.ball, fl = p.fl;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    const th = p.throws.find(t => tau >= t.t0 && tau < t.t1);
    const lastTh = [...p.throws].reverse().find(t => tau >= t.t1);
    if (p.ballHiddenAt != null && tau >= p.ballHiddenAt) { b.hidden = true; b.holder = null; }
    else if (p.fieldT == null || tau < p.fieldT) { const pt = fl.pts[Math.min(fl.pts.length - 1, Math.floor(tau / DT))]; Object.assign(b, { x: pt.x, y: pt.y, z: pt.z, holder: null, hidden: false }); }
    else if (th) { const k = (tau - th.t0) / (th.t1 - th.t0), A = { x: th.from.x, y: th.from.y }, B = basePos(th.to); Object.assign(b, { x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, z: 5 + Math.sin(Math.PI * k) * Math.min(25, dist(A, B) / 10), holder: null }); S.throwTarget = coverAt(th.to)?.id || null; }
    else { const h = lastTh ? coverAt(lastTh.to) || p.fielder : p.fielder; Object.assign(b, { x: h.x, y: h.y, z: 4, holder: h.id }); }
    // fielders run their routes (after their reaction delay)
    for (const f of S.fielders) moveTo(f, tau > (f.delay || 0) ? f.spd || 16 : 0);
    // runners along the base paths
    for (const r of S.runners) {
      const mv = r.move; if (!mv) continue;
      r.px = r.x; r.py = r.y;
      if (mv.back != null && tau > mv.back) { r.prog = Math.max(mv.from, r.prog - 10 / 90 * DT * 3); }
      else if (tau > mv.t0) r.prog = Math.min(mv.to, r.prog + (mv.spd / 90) * DT * (Math.abs(r.prog - Math.round(r.prog)) < 0.05 && r.prog > mv.from ? 0.85 : 1));
      const q = basePos(r.prog); r.x = q.x; r.y = q.y; r.facing = null;
      if (mv.out != null && tau >= mv.out && !r.isOut) { r.isOut = true; }
    }
    S.runners = S.runners.filter(r => !(r.isOut && tau > (r.move?.out ?? 0) + 0.5));
    if (tau >= p.end) endPlay();
  }
  function coverAt(base) { const pt = basePos(base); let best = null, bd = Infinity; for (const f of S.fielders) { const d = dist(f, pt); if (d < bd) { bd = d; best = f; } } return best; }
  function endPlay() {
    const p = play; play = null;
    // flush any remaining events
    while (p.ei < p.events.length) { const e = p.events[p.ei++]; e.apply?.(); if (e.type === 'RUN_SCORES_INT') { const i = S.runners.indexOf(e.data.r); if (i >= 0) S.runners.splice(i, 1); } else if (e.type !== 'OUT_SILENT') emit(e.type, e.data); }
    // settle runners on their final bases
    const keep = [];
    for (const r of S.runners) {
      const mv = r.move; r.move = null;
      if (!mv || r.isOut || mv.out != null) { r.isOut = false; continue; }
      const base = Math.round(mv.back != null ? mv.from : mv.to);
      if (base >= 1 && base <= 3) { r.base = base; keep.push(r); }
    }
    // never two runners on one base
    const used = new Set(); S.runners = keep.sort((a, b) => b.base - a.base).filter(r => { while (used.has(r.base) && r.base > 1) r.base--; if (used.has(r.base)) return false; used.add(r.base); return true; });
    S.ball.landing = null; S.throwTarget = null;
    finishPA();
  }

  function moveTo(e, spd) {
    e.px = e.x; e.py = e.y;
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
    if (d < 0.05 || !spd) return;
    const s = Math.min(d, spd * DT); e.x += dx / d * s; e.y += dy / d * s; e.facing = Math.atan2(dy, dx);
  }

  // ---------- innings ----------
  function endHalf() {
    emit('INNING_END', { lob: S.runners.length, team: bat() });
    for (const r of S.runners) r.base = 0;
    S.runners = []; S.outs = 0; S.balls = 0; S.strikes = 0; S.batter = null;
    S.linescore[bat()][S.inning - 1] ||= 0;
    if (S.half === 'top') {
      if (S.inning >= innings && S.score.home > S.score.away) return finish(false);
      S.half = 'bottom';
    } else {
      if (S.inning >= innings && S.score.home !== S.score.away) return finish(false);
      S.half = 'top'; S.inning++;
    }
    setDefense(); resetPositions(true);
    S.phase = 'INNING_BREAK'; phaseT = 3.0; nextPA = true;
    emit('INNING_START', { half: S.half, inning: S.inning });
    if (S.inning > innings) { // extra innings: automatic runner on second
      const t = T[bat()], r = t.order[(t.idx + 8) % 9]; r.base = 2; const q = basePos(2); Object.assign(r, { x: q.x, y: q.y, px: q.x, py: q.y }); S.runners.push(r);
    }
  }
  function finish(walk) {
    S.over = true; S.phase = 'FINAL'; S.walkoff = !!walk;
    emit('FINAL', { score: { ...S.score }, walkoff: !!walk });
  }

  // ---------- step ----------
  function step() {
    S.t += DT;
    if (S.over) return;
    const b = S.ball;
    if (S.phase === 'PRE' || S.phase === 'INNING_BREAK') {
      phaseT -= DT;
      for (const f of S.fielders) moveTo(f, 14);
      for (const r of S.runners) { r.px = r.x; r.py = r.y; }
      const h = pitcher(); b.px = b.x; b.py = b.y; b.pz = b.z; Object.assign(b, { x: h.x, y: h.y, z: 5, holder: h.id, hidden: false });
      if (phaseT <= 0) {
        if (nextPA) { nextPA = false; maybeChangePitcher(); newBatter(); phaseT = 1.0; return; }
        throwPitch();
      }
      return;
    }
    if (S.phase === 'PITCH') {
      const a = pitchAnim, k = (S.t - a.t0) / a.T;
      b.px = b.x; b.py = b.y; b.pz = b.z;
      const brk = a.type === 'CU' ? 1.2 : a.type === 'SL' ? 0.8 : a.type === 'CH' || a.type === 'SI' ? 0.4 : 0.1;
      b.x = a.x * k + Math.sin(k * Math.PI) * brk * 0.2; b.y = 54.5 * (1 - k) + 0.5; b.z = 6 * (1 - k) + a.z * k - brk * k * k * 0.6; b.holder = null;
      if (k >= 1) pitchArrives();
      return;
    }
    if (S.phase === 'PLAY') animatePlay();
  }

  setDefense(); resetPositions(true);
  emit('INNING_START', { half: 'top', inning: 1 });

  return {
    state: S,
    get speed() { return S.speed; },
    setSpeed(v) { S.speed = clamp(+v || 1, 0.25, 32); },
    advance(dt) {
      if (S.over) return 1;
      acc += Math.min(0.25, dt) * S.speed;
      let n = 0; while (acc >= DT && n++ < 2000) { step(); acc -= DT; }
      return clamp(acc / DT, 0, 1);
    },
    step,
    simulate(seconds = Infinity, { maxEvents = 4000 } = {}) {
      const steps = Math.min(4e6, seconds / DT);
      for (let i = 0; i < steps && !S.over; i++) { step(); if (S.events.length > maxEvents) S.events.splice(0, S.events.length - maxEvents); }
      return S;
    },
    // Camera: follow the ball in play on broadcast; otherwise the renderer's default framing.
    cameraTarget(mode) {
      if (mode !== 'BROADCAST' || S.phase !== 'PLAY' || S.ball.hidden) return undefined;
      const b = S.ball; if (b.y < 120 && Math.abs(b.x) < 90) return undefined;
      return [b.x * 0.65, Math.max(76, b.y * 0.7), 300, 230];
    },
    dispose() { S.events.length = 0; },
  };
}
