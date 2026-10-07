// BaseballSimulationEngine — MLB only (independent from the NFL/NHL engines). Fixed step 30 Hz, feet & seconds.
// Pipeline of every pitch: PITCH (type, velocity, spin rpm + axis, break in inches, location, control miss) → BATTER READ
// (recognition → perceived location) → DECISION (TAKE · CONTACT · NORMAL_SWING · POWER_SWING · PROTECT, or BUNT) → CONTACT
// (exit velocity, launch angle, spray, spin from bat speed / timing / pitch quality) → BALL FLIGHT (gravity + drag + Magnus
// lift, bounces, wall, fair/foul, HR) →
// Fielding (each fielder's reaction + route speed vs the trajectory: catch in the air, field the grounder, dive, or
// retrieve) → Throw (transfer + arm strength + distance, relays, double plays) → Baserunning (force / tag-up /
// extra-base decisions by speed and IQ, races against the throw) → Result (outs, runs, hits, errors, stats).
// The play is resolved from that physics at contact and then animated on the same timeline; events are emitted
// when they happen on screen (commentary, sounds, crowd and the box score read state.events).
import { createRng } from '../../../core/rng/rng.js';
import { BASES, fenceDist, DEF_SPOTS, BATTER_SPOT } from '../field/geometry.js';
import { fixedRatings, teamBy } from '../mlbData.js';
import { simRatings } from './ratings.js';
import { PITCH_DEFS, buildArsenal, pickPitch, pitchPhysics, stuffOf, pitchPath } from './pitching.js';
import { computeAdaptive } from './adaptive.js';

export const DT = 1 / 30;
const MPH = 1.4667, G = 32.17, KD = 0.0019, KL = 0.0005, FENCE_H = 10, DEG = Math.PI / 180;
const BP = [BASES.home, BASES.first, BASES.second, BASES.third, BASES.home];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const other = s => (s === 'home' ? 'away' : 'home');
const INF = ['P', 'C', '1B', '2B', '3B', 'SS'];
export function basePos(s) { s = clamp(s, 0, 4); const i = Math.min(3, Math.floor(s)), f = s - i, a = BP[i], b = BP[i + 1]; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
// Calibration of the contact model (timing / squared-up / exit velocity / launch / spray) and steal appetite.
export const CT = { tsd0: 34, tsd1: 14, v0: 0.2, v1: 0.3, v2: 0.15, tau: 26, vtau: 0.5, bs0: 59.6, bs1: 20, e0: 0.565, ep: 0.8, esd: 4, aa0: 10, aa1: 14, lav: 55, lasd: 17, sprT: 22, sp0: 20, sp1: 95 };
export const TUNE = { stealK: 0.05, b3in: 0.8, b3out: 0.45, stealBias: 0.26, stealSd: 0.24, cOff: -0.05, oBase: 0.4, oBy: 0.28, oTwo: 0.12 };

// Ball flight from contact: a physical entity integrated every DT — gravity, quadratic drag against the AIR (wind
// optional), Magnus lift from backspin (`spin` rpm; negative = topspin dives) and sidespin (`side` rpm; curves the ball
// toward/away from the lines), ground bounces with friction, wall carom. Fair/foul is decided by where the ball first
// lands (or crosses the fence). Samples every DT until it stops, leaves the park or is foul.
export function flight({ ev, la, spray, spin, side = 0, wind = null }) {
  const a = spray * DEG, sp = spin ?? (la > 8 ? 2400 : 0);
  let v = ev * MPH, vh0 = v * Math.cos(la * DEG);
  let vx = Math.sin(a) * vh0, vy = Math.cos(a) * vh0, vz = v * Math.sin(la * DEG), x = 0, y = 1.5, z = 3, t = 0, landed = null, hr = false, wall = false, foul = false, apex = z;
  const wx = wind?.x || 0, wy = wind?.y || 0, wz = wind?.z || 0;
  const pts = [{ t: 0, x, y, z }];
  while (t < 12) {
    if (z > 0 || vz > 0) {
      const rx = vx - wx, ry = vy - wy, rz = vz - wz, s = Math.hypot(rx, ry, rz) || 1e-6;
      const lift = KL * (sp / 2400) * s * s, sl = KL * (side / 2400) * s * s, vh = Math.hypot(rx, ry) || 1e-6;
      // lift acts perpendicular to the relative velocity (in the vertical plane); sidespin perpendicular in the horizontal plane
      const lx = (-rz / s) * (rx / vh), ly = (-rz / s) * (ry / vh), lz = vh / s;
      vx += (-KD * s * rx + lift * lx + sl * (ry / vh)) * DT; vy += (-KD * s * ry + lift * ly - sl * (rx / vh)) * DT; vz += (-G - KD * s * rz + lift * lz) * DT;
    } else { const vh = Math.hypot(vx, vy), nh = Math.max(0, vh - (4 + 0.06 * vh) * DT); if (vh > 0) { vx *= nh / vh; vy *= nh / vh; } vz = 0; }
    x += vx * DT; y += vy * DT; z += vz * DT; t += DT; if (z > apex) apex = z;
    if (z <= 0 && vz < 0) {
      z = 0;
      if (!landed) { landed = { t, x, y }; foul = y < Math.abs(x) - 0.01; }
      if (vz < -6) { const hv = Math.hypot(vx, vy); const k = (la < 12 ? 0.9 : 0.72); vz = -vz * 0.32; vx *= k; vy *= k; void hv; } else vz = 0;
    }
    const d = Math.hypot(x, y);
    if (!wall && y > 0 && d >= fenceDist(Math.atan2(x, y))) {
      if (Math.abs(x) > y) { foul = true; if (!landed) landed = { t, x, y, wall: true }; pts.push({ t, x, y, z }); break; } // foul pole side of the line
      if (z > FENCE_H && !landed) { hr = true; pts.push({ t, x, y, z }); for (let k = 0; k < 20; k++) { x += vx * DT; y += vy * DT; z = Math.max(0, z + vz * DT); vz -= G * DT; t += DT; pts.push({ t, x, y, z }); } break; }
      wall = true; // carom: reflect (and absorb) the radial speed
      const rxn = x / d, ryn = y / d, vr = vx * rxn + vy * ryn;
      if (vr > 0) { vx -= 1.3 * vr * rxn; vy -= 1.3 * vr * ryn; }
      if (!landed) landed = { t, x, y, wall: true };
    }
    pts.push({ t, x, y, z });
    if (landed && Math.hypot(vx, vy) < 1 && z <= 0) break;
    if (foul && landed) break;
  }
  const dmax = Math.max(...pts.map(p => Math.hypot(p.x, p.y)));
  return { pts, landed, hr, foul, dist: hr ? dmax : landed ? Math.hypot(landed.x, landed.y) : dmax, hang: landed ? landed.t : t, wall, apex };
}

// Optional context for the adaptive attributes: history[pid] = last box lines (newest last), rest[pid] = days of rest,
// consecutive[pid] = games in a row; wind = { x, y, z } ft/s.
export function createBaseballEngine({ home, away, seed = 'mlb', ratingsOf = null, innings = 9, speed = 1, history = {}, rest = {}, consecutive = {}, wind = null }) {
  const seedStr = String(seed), rng = createRng(seedStr);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rng.next(); while (!v) v = rng.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const rate = ratingsOf || (p => simRatings(fixedRatings(p)));
  const roster = {};
  const mk = r => { if (!r) return null; if (roster[r.id]) return roster[r.id]; const rec = { ...r, R: rate(r.p), x: 0, y: 0, px: 0, py: 0, facing: null, tx: 0, ty: 0, spd: 0, seq: [], errs: 0 }; roster[rec.id] = rec; return rec; };
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
    throwTarget: null, events: [], box: {}, roster, over: false, phase: 'PRE', lastPitch: null, pitchLog: [], speed, stage: 'PRE', mu: {}, steal: null, pitchTrail: null,
    stats: { pitchTypes: {}, decisions: {}, runnerDecisions: {}, steals: { att: 0, sb: 0, cs: 0 }, bunts: 0, contacts: 0, foulContacts: 0, fouls: 0 },
  };
  let acc = 0, phaseT = 2.0, play = null, pitchAnim = null, nextPA = true;
  const bat = () => (S.half === 'top' ? 'away' : 'home'), fld = () => other(bat());
  const box = id => (S.box[id] ||= { ab: 0, h: 0, d2: 0, d3: 0, hr: 0, r: 0, rbi: 0, bb: 0, k: 0, outs: 0, ha: 0, ra: 0, bba: 0, ka: 0, pc: 0, hra: 0, sb: 0, cs: 0, sh: 0, a: 0, e: 0 });
  const emit = (type, data = {}) => { const e = { type, t: +S.t.toFixed(2), inning: S.inning, half: S.half, ...data }; S.events.push(e); track(type, e); return e; };
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
    S.batter = b; S.balls = 0; S.strikes = 0; S.steal = null; pitcher().lastPitches = [];
    emit('AT_BAT', { batter: b.id, pitcher: pitcher().id, team: bat() });
  }
  const batsAgainst = (b, p) => (b.bats === 'S' ? (p.throws === 'L' ? 'R' : 'L') : b.bats);
  function maybeChangePitcher() {
    const t = T[fld()], p = t.pitcher, lim = 82 + 32 * p.R.stamina;
    if (!t.bullpen.length || !(box(p.id).pc > lim || (box(p.id).ra >= 6 && box(p.id).pc > 45))) return;
    const ix = Math.max(0, t.bullpen.findIndex(r => adaptOf(r).map['Bullpen Readiness'] >= 55)), next = t.bullpen.splice(ix, 1)[0]; next.pos = 'P'; t.pitcher = next; // the most rested reliever of the next in line
    setDefense(); Object.assign(next, { x: DEF_SPOTS.P.x, y: DEF_SPOTS.P.y, px: DEF_SPOTS.P.x, py: DEF_SPOTS.P.y });
    emit('PITCHING_CHANGE', { pitcher: next.id, team: fld() });
  }

  // ---------- adaptive context: the pure function in ./adaptive.js fed with real game state ----------
  const parkName = teamBy(home.abbr)?.stadium || '';
  const fixedOf = r => (r._fx ||= Object.fromEntries(fixedRatings(r.p).map(a => [a.name, a.value])));
  function adaptOf(r) {
    const own = r.team, oth = other(own), isP = r.pos === 'P', b = box(r.id), hist = history[r.pid] || [], batting = own === bat();
    const bases = S.runners.map(x => x.base).filter(x => x >= 1 && x <= 3);
    const diff = S.score[own] - S.score[oth], foe = batting ? pitcher() : S.batter;
    const key = [S.inning, S.half, S.outs, S.balls, S.strikes, bases.join(''), diff, isP ? b.pc : b.ab + b.bb, r.seq.length, foe?.id, r.errs, S.phase === 'PLAY' ? 1 : 0].join('|');
    if (r._ak === key) return r._a;
    const ls = S.linescore, last2 = side => ls[side].slice(-2).reduce((a, v) => a + (v || 0), 0);
    const C = T[fld()].field.C, P = pitcher();
    const ctx = {
      day: seedStr, recent: [...hist.slice(-9), b], seq: r.seq, errors: r.errs,
      fatigue: isP ? { pitches: b.pc, outs: b.outs, daysRest: rest[r.pid] ?? 4, recentPitches: hist.slice(-3).reduce((a, g) => a + (g.pc || 0), 0) }
        : { pa: b.ab + b.bb, consecutive: consecutive[r.pid] || 0, daysRest: rest[r.pid] ?? 4 },
      game: { inning: S.inning, half: S.half, outs: S.outs, balls: batting ? S.balls : undefined, strikes: batting ? S.strikes : undefined, scoreDiff: diff, runners: bases, momentum: (last2(own) - last2(oth)) / 2 },
      park: { stadium: parkName, home: own === 'home' },
      matchup: foe ? (isP ? S.mu[`${foe.id}|${r.id}`] : batting ? S.mu[`${r.id}|${foe.id}`] : null) : null,
      opp: isP ? { hand: foe ? batsAgainst(foe, r) : null, hold: r.R.hold * 100, catcherArm: (C?.R.arm ?? 0.6) * 100 }
        : batting ? { hand: foe?.throws, velo: foe ? 86 + 12 * foe.R.velo : 92, hold: P ? P.R.hold * 100 : undefined, catcherArm: (C?.R.arm ?? 0.6) * 100 } : {},
    };
    r._ak = key;
    return (r._a = computeAdaptive({ id: r.pid, pos: r.pos, bats: r.bats, throws: r.throws, age: r.p?.person?.currentAge, fixed: fixedOf(r) }, ctx));
  }
  // rolling results per player (confidence) and in-game batter-vs-pitcher history (matchup)
  function track(type, e) {
    const push = (id, res) => { const r = roster[id]; if (r) { r.seq.push(res); if (r.seq.length > 8) r.seq.shift(); } };
    const mu = (bId, pId, f) => { const m = (S.mu[`${bId}|${pId}`] ||= { pa: 0, ab: 0, h: 0, k: 0, bb: 0, hr: 0 }); f(m); m.pa++; };
    const pid = pitcher().id;
    switch (type) {
      case 'STRIKEOUT': push(e.batter, 'K'); push(e.pitcher, 'K'); mu(e.batter, e.pitcher, m => { m.ab++; m.k++; }); break;
      case 'WALK': push(e.batter, 'BB'); push(e.pitcher, 'BB'); mu(e.batter, e.pitcher, m => { m.bb++; }); break;
      case 'HIT_BY_PITCH': push(e.batter, 'BB'); push(e.pitcher, 'HBP'); mu(e.batter, e.pitcher, m => { m.bb++; }); break;
      case 'HIT': push(e.by, e.bases > 1 ? 'XBH' : 'H'); push(pid, e.bases > 1 ? 'XBH' : 'H'); mu(e.by, pid, m => { m.ab++; m.h++; }); break;
      case 'HOME_RUN': push(e.by, 'HR'); push(pid, 'HR'); mu(e.by, pid, m => { m.ab++; m.h++; m.hr++; }); break;
      case 'OUT': if (e.batter && e.kind !== 'fieldersChoice' && e.kind !== 'caughtStealing') { push(e.batter, e.ev >= 98 ? 'HARD_OUT' : 'OUT'); push(pid, 'OUT'); mu(e.batter, pid, m => { m.ab++; }); } break;
      case 'ERROR': { const b = S.batter || null; void b; break; }
    }
  }
  const stage = name => { S.stage = name; const pl = S.lastPitch?.pipeline; if (pl && !pl.includes(name)) pl.push(name); };
  const dec = (r, decision, extra = {}) => { S.stats.runnerDecisions[decision] = (S.stats.runnerDecisions[decision] || 0) + 1; emit('RUNNER_DECISION', { runner: r.id, decision, team: r.team, base: r.base, ...extra }); };

  // ---------- the pitch ----------
  const FAM_CMD = { fb: 'Fastball Command Today', br: 'Breaking Command Today', off: 'Offspeed Command Today' };
  const SWING = { NORMAL_SWING: { bs: 1, aa: 0, c: 0, ev: 0 }, POWER_SWING: { bs: 1.045, aa: 3.5, c: -0.07, ev: 1.5 }, CONTACT: { bs: 0.955, aa: -1.5, c: 0.05, ev: -1.5 }, PROTECT: { bs: 0.93, aa: -2.5, c: 0.06, ev: -2.5 }, BUNT: { bs: 0, aa: 0, c: 0, ev: 0 } };

  // Batter AI: BATTER READ (recognition → perceived location) then DECISION (TAKE · CONTACT · NORMAL_SWING · POWER_SWING · PROTECT, or BUNT).
  function batterDecision(pi) {
    const b = S.batter, R = b.R, p = pitcher(), ad = adaptOf(b), d = ad.delta, LI = ad.leverage;
    const vsL = p.throws === 'L', contact = vsL ? R.contactL : R.contactR, power = vsL ? R.powerL : R.powerR;
    const hand = batsAgainst(b, p), plat = b.bats === 'S' ? 0.03 : hand !== p.throws ? 0.04 : -0.035; // opposite-handed hitters see the ball better
    stage('BATTER_READ');
    const decept = clamp(Math.abs(pi.def.dv) / 14, 0, 1) * 0.1 + clamp(Math.hypot(pi.hb, pi.vb) / 22, 0, 1) * 0.08;
    const seen = S.mu[`${b.id}|${p.id}`]?.pa || 0;
    const rec = clamp(0.30 + 0.55 * R.eye + plat + 0.0035 * d['Pitch Recognition Today'] + 0.012 * Math.min(seen, 3) - decept, 0.08, 0.97);
    const noise = (1 - rec) * 0.5, px = pi.x + gauss() * noise, pz = pi.z + gauss() * noise;
    const pIn = Math.abs(px) <= 0.83 && pz >= 1.5 && pz <= 3.5;
    const outBy = pIn ? 0 : Math.max(Math.abs(px) - 0.83, pz < 1.5 ? 1.5 - pz : pz - 3.5);
    const eyeEff = R.eye + (rec - 0.57) * 0.5, two = S.strikes === 2;
    stage('DECISION');
    const bases = S.runners.map(r => r.base);
    // sacrifice bunt: rare, weak hitters, runner on 1st/2nd, nobody on 3rd, 0 outs, close game, before two strikes
    const ownDiff = S.score[bat()] - S.score[fld()];
    if (S.outs === 0 && S.strikes < 2 && (bases.includes(1) || bases.includes(2)) && !bases.includes(3) && Math.abs(ownDiff) <= 1 && S.inning <= 9
      && (contact + power) / 2 < 0.62 && R.bunt > 0.45 && rng.next() < 0.3 * (0.5 + R.bunt)) return { decision: 'BUNT', swing: true, rec, px, pz, pIn, outBy };
    const inP = 0.6 + 0.14 * R.timing - 0.06 * pi.stuff + (two ? 0.22 : 0), outP = clamp(TUNE.oBase - 0.3 * eyeEff + 0.14 * pi.stuff + (two ? TUNE.oTwo : 0) - outBy * TUNE.oBy, 0.03, 0.65);
    let sp = pIn ? inP : outP;
    sp += 0.0035 * d.Aggressiveness - (pIn ? 0 : 0.003 * d['Plate Patience Today']) + (pIn && bases.includes(3) && S.outs < 2 ? 0.05 : 0);
    if (S.balls === 3 && S.strikes < 2) sp *= pIn ? TUNE.b3in : TUNE.b3out; else if (S.balls > S.strikes && pIn) sp *= 1.08;
    const swing = rng.next() < clamp(sp, 0.02, 0.97);
    if (!swing) return { decision: 'TAKE', swing: false, rec, px, pz, pIn, outBy };
    if (two) return { decision: 'PROTECT', swing: true, rec, px, pz, pIn, outBy };
    const mid = pIn && Math.abs(px) < 0.5 && pz > 1.9 && pz < 3.1;
    const wP = clamp(0.12 + 0.7 * (power - 0.55) + (S.balls > S.strikes ? 0.14 : 0) + (mid ? 0.08 : 0) + 0.002 * d.Form - (LI > 2 ? 0.05 : 0), 0.03, 0.55);
    const wC = clamp(0.2 + 0.3 * (contact - 0.65) + (bases.includes(3) && S.outs < 2 ? 0.3 : 0) + (S.strikes > S.balls ? 0.14 : 0) + (LI > 2 ? 0.06 : 0), 0.05, 0.7);
    let r = rng.next() * (wP + wC + 0.65);
    const decision = (r -= wP) < 0 ? 'POWER_SWING' : (r -= wC) < 0 ? 'CONTACT' : 'NORMAL_SWING';
    return { decision, swing: true, rec, px, pz, pIn, outBy };
  }

  // ---------- baserunning: steal attempts ----------
  function stealCandidate() {
    const r1 = S.runners.find(r => r.base === 1), r2 = S.runners.find(r => r.base === 2), r3 = S.runners.find(r => r.base === 3);
    let r = null, to = 0;
    if (r1 && !r2) { r = r1; to = 2; } else if (r2 && !r3 && !r1) { r = r2; to = 3; } else return null;
    const p = pitcher(), C = T[fld()].field.C, bt = S.batter; if (!C || !bt) return null;
    const dr = adaptOf(r).delta, spdMix = 0.6 * r.R.speed + 0.4 * r.R.steal;
    const lead = 8 + 5 * r.R.steal, dist2 = to === 2 ? 127.3 : 90;
    const Trun = 0.34 - 0.15 * r.R.steal - 0.004 * dr['Steal Readiness'] + (90 - lead) / (21.5 + 8 * spdMix) + (to === 3 ? -0.2 : 0);
    const deliv = 1.22 + 0.22 * (1 - p.R.hold) + (p.throws === 'L' && to === 2 ? 0.08 : 0);
    const Tball = deliv + 0.45 + transfer(C) + 0.22 + dist2 / throwSpeed(C) + 0.12;
    const margin = Tball - Trun, pSucc = 1 / (1 + Math.exp(-margin / 0.16));
    const want = clamp((pSucc - 0.62) / 0.3, 0, 1);
    const ownDiff = S.score[bat()] - S.score[fld()];
    let sit = S.outs === 2 ? 1.15 : S.outs === 0 ? 0.9 : 1;
    if (ownDiff >= 4 || (S.inning >= 7 && ownDiff <= -4)) sit = 0;
    else if (S.inning >= 7 && ownDiff < 0) sit *= 1.3;
    if (bt.R.power > 0.8 && S.outs < 2) sit *= 0.5;
    if (S.balls === 3) sit *= 0.4;
    if (to === 3) sit *= 0.2;
    const appetite = 0.25 + 1.6 * clamp(r.R.steal - 0.4, 0, 0.6);
    return { r, to, margin, deliv, Tball, prob: TUNE.stealK * Math.pow(want, 1.2) * appetite * sit };
  }

  function throwPitch() {
    const p = pitcher(), b = S.batter, R = p.R, ap = adaptOf(p), dp = ap.delta;
    p.ars ||= buildArsenal(R, p.pid);
    p.lastPitches ||= [];
    const sameHand = b.bats === 'S' ? false : batsAgainst(b, p) === p.throws;
    const choice = pickPitch(p.ars, { balls: S.balls, strikes: S.strikes, outs: S.outs, runners: S.runners.map(r => r.base), sameHand, last: p.lastPitches }, () => rng.next());
    const type = choice.type, def = PITCH_DEFS[type];
    const ph = pitchPhysics(type, choice.grade, R, p.throws, gauss, { velo: dp['Velocity Today'] * 0.05, move: dp['Pitch Arsenal Feel'] * 0.003 });
    const cmd = dp[FAM_CMD[def.fam]];
    // location: aim in the zone more when behind, on the edges when ahead; each pitch has its own habit (breaking balls low, fastballs up)
    const zoneAim = clamp(0.47 + 0.08 * (S.balls - S.strikes) + 0.1 * R.command + 0.0015 * cmd, 0.3, 0.9);
    const inIntent = rng.next() < zoneAim, armDir = p.throws === 'L' ? 1 : -1;
    let ax = inIntent ? (rng.next() * 2 - 1) * 0.55 : (rng.next() < 0.5 ? -1 : 1) * (0.95 + rng.next() * 0.5);
    let az = inIntent ? 1.8 + rng.next() * 1.4 : (rng.next() < 0.6 ? 1.15 + rng.next() * 0.3 : 3.6 + rng.next() * 0.4);
    az += type === 'FF' ? 0.1 : (type === 'CU' || type === 'CH' || type === 'FS' || type === 'SI') ? -0.1 : 0;
    ax += (type === 'SL' || type === 'FC') ? -armDir * 0.12 : 0;
    const sig = (0.42 - 0.26 * R.control) * clamp(1 - 0.006 * cmd, 0.7, 1.45);
    const x = ax + gauss() * sig, z = az + gauss() * sig, miss = Math.hypot(x - ax, z - az);
    const inZone = Math.abs(x) <= 0.83 && z >= 1.5 && z <= 3.5;
    const stuff = stuffOf({ grade: choice.grade, mph: ph.mph, hb: ph.hb, vb: ph.vb, rpm: ph.rpm }, dp.Fatigue - 90, dp.Form);
    const flightT = 55 / (ph.mph * MPH) * 1.04;
    box(p.id).pc++; T[fld()].pitches++; p.lastPitches.push(type); if (p.lastPitches.length > 3) p.lastPitches.shift();
    S.stats.pitchTypes[type] = (S.stats.pitchTypes[type] || 0) + 1;
    const pi = { def, type, mph: ph.mph, x, z, inZone, hb: ph.hb, vb: ph.vb, stuff };
    S.lastPitch = { type, name: def.name, mph: +ph.mph.toFixed(1), x: +x.toFixed(2), z: +z.toFixed(2), inZone, rpm: ph.rpm, axis: ph.axis, clock: ph.clock, hb: ph.hb, vb: ph.vb, miss: +(miss * 12).toFixed(1), pipeline: [] };
    stage('PITCH');
    const bd = batterDecision(pi);
    S.lastPitch.decision = bd.decision; S.lastPitch.read = +bd.rec.toFixed(2);
    S.stats.decisions[bd.decision] = (S.stats.decisions[bd.decision] || 0) + 1;
    // steal attempt is decided before the delivery (runner breaks with the pitcher's motion)
    S.steal = null; const sc = stealCandidate();
    if (sc && rng.next() < sc.prob) S.steal = sc;
    const rel = { x: armDir * 1.3, z: 5.9 };
    emit('PITCH', { pitcher: p.id, batter: b.id, pitchType: type, name: def.name, mph: +ph.mph.toFixed(1), zone: inZone, team: fld(), rpm: ph.rpm, axis: ph.axis, clock: ph.clock, hb: ph.hb, vb: ph.vb,
      x: S.lastPitch.x, z: S.lastPitch.z, miss: S.lastPitch.miss, stuff: +stuff.toFixed(2), decision: bd.decision, read: S.lastPitch.read, steal: !!S.steal, count: `${S.balls}-${S.strikes}` });
    pitchAnim = { t0: S.t, T: flightT, type, mph: ph.mph, x, z, inZone, stuff, bd, hb: ph.hb, vb: ph.vb, rel, throws: p.throws, pi, rpm: ph.rpm };
    S.pitchTrail = { pts: [], type };
    S.phase = 'PITCH'; S.ball.holder = null; S.ball.hidden = false;
    b.swing = null;
  }

  // Comfort (home/road), pressure, RISP, late-inning poise and momentum nudge the quality of contact (a few mph at most).
  function clutchEV(b, d, LI) {
    const comfort = b.team === 'home' ? d['Home Comfort'] : d['Road Comfort'];
    return 0.03 * comfort + (LI > 1.5 ? 0.04 * d['Pressure Response'] : 0) + (S.runners.some(r => r.base >= 2) ? 0.04 * d['RISP Confidence'] : 0) + (S.inning >= 7 ? 0.03 * d['Late-Inning Poise'] : 0) + 0.02 * d.Momentum;
  }
  function pitchArrives() {
    const { x, z, inZone, stuff, bd, pi } = pitchAnim, b = S.batter, p = pitcher(), R = b.R, ad = adaptOf(b), d = ad.delta;
    const vsL = p.throws === 'L', contact = vsL ? R.contactL : R.contactR, power = vsL ? R.powerL : R.powerR;
    const outBy = inZone ? 0 : Math.max(Math.abs(x) - 0.83, z < 1.5 ? 1.5 - z : z - 3.5);
    if (!inZone && Math.abs(x) > 1.55 && z > 1 && z < 4 && rng.next() < 0.06) { S.pitchLog.push('HBP'); return endPA('HBP'); }
    if (!bd.swing) {
      const frame = !inZone && outBy < 0.18 && rng.next() < 0.22 * (T[fld()].field.C?.R.framing ?? 0.6);
      if (inZone || frame) return strike('called');
      return ballCalled();
    }
    b.swing = { t: S.t, decision: bd.decision };
    const sw = SWING[bd.decision], bunt = bd.decision === 'BUNT';
    // ---- CONTACT: does the bat meet the ball? (recognition, timing and pitch quality decide)
    const cP = bunt ? clamp(0.62 + 0.35 * R.bunt - 0.22 * stuff - (inZone ? 0 : 0.25 + outBy * 0.3), 0.15, 0.95)
      : clamp(0.84 + TUNE.cOff + 0.17 * contact - 0.26 * stuff - (inZone ? 0 : 0.2 + outBy * 0.2) + sw.c + (bd.rec - 0.57) * 0.12 + 0.0012 * d['Timing Today'] + 0.001 * d.Form + 0.0008 * d.Sharpness + (inZone ? 0.0006 * d['Hot Zone Feel'] : -0.0007 * d['Cold Zone Vulnerability']), 0.38, 0.97);
    if (rng.next() >= cP) return strike('swinging');
    // timing error (ms, + = late), vertical bat-ball offset (ft, + = ball below the bat's sweet spot) and the resulting squared-up factor
    const offspeed = clamp((pitchAnim.pi.def.dv === 0 ? 0 : -pitchAnim.pi.def.dv) / 14, 0, 1);
    const tsd = (CT.tsd0 - CT.tsd1 * R.timing) * clamp(1 - 0.004 * d['Timing Today'], 0.7, 1.35) * (1 + 0.5 * (1 - bd.rec)) * (1 + 0.3 * offspeed) * (bd.decision === 'POWER_SWING' ? 1.12 : bd.decision === 'CONTACT' || bd.decision === 'PROTECT' ? 0.85 : 1);
    const te = gauss() * tsd;
    const vsd = (CT.v0 + CT.v1 * stuff - CT.v2 * contact + (inZone ? 0 : 0.14 + outBy * 0.25)) * (bd.decision === 'POWER_SWING' ? 1.08 : bd.decision === 'CONTACT' || bd.decision === 'PROTECT' ? 0.88 : 1);
    const ve = gauss() * vsd + (2.5 - z) * 0.12;
    const sq = Math.exp(-0.5 * ((te / CT.tau) ** 2 + (ve / CT.vtau) ** 2));
    const pull = batsAgainst(b, p) === 'R' ? -1 : 1;
    let ev, la, spray, kind;
    if (bunt) {
      ev = clamp(20 + 7 * sq + gauss() * 3, 12, 38); la = clamp(-14 + ve * 40 + gauss() * 6, -30, 35); spray = clamp(gauss() * 20, -55, 55); kind = 'bunt';
    } else {
      const bs = (CT.bs0 + CT.bs1 * (0.55 * R.batSpeed + 0.45 * power)) * sw.bs;               // bat speed, mph
      ev = clamp((0.2 * pitchAnim.mph + 1.2 * bs) * (CT.e0 + (1 - CT.e0) * Math.pow(sq, CT.ep)) + sw.ev + 0.06 * d.Form + 0.04 * d['Timing Today'] + clutchEV(b, d, ad.leverage) + gauss() * CT.esd, 38, 121);
      const aa = CT.aa0 + CT.aa1 * (power - 0.5) + sw.aa;                                      // attack angle
      la = clamp(aa + (2.5 - z) * 4 + ve * CT.lav + (pi.vb - 8) * 0.35 + gauss() * CT.lasd, -45, 82);
      spray = clamp(pull * (6 + 10 * power) - pull * (te / 22) * CT.sprT + gauss() * (CT.sp0 + CT.sp1 * (1 - sq)), -120, 120);
      kind = la < 10 ? 'ground' : la < 25 ? 'line' : la < 50 ? 'fly' : 'pop';
    }
    const spin = Math.round(clamp(52 * la + gauss() * 450 + (bunt ? 0 : 150 * ve), -1900, 4600)), side = Math.round(-pull * 28 * te + gauss() * 320);
    stage('CONTACT');
    const fl = flight({ ev, la, spray, spin, side, wind });
    S.stats.contacts++; if (fl.foul) S.stats.foulContacts++;
    emit('CONTACT', { batter: b.id, pitcher: p.id, ev: Math.round(ev), la: Math.round(la), spray: Math.round(spray), kind, spin, side, bs: bunt ? 0 : Math.round(ev / 1.25), timing: Math.round(te), sq: +sq.toFixed(2), swing: bd.decision, pitchType: pitchAnim.type, foul: fl.foul, apex: Math.round(fl.apex), dist: Math.round(fl.dist) });
    startPlay({ ev, la, spray, kind, spin, side }, fl);
  }

  function strike(kind) {
    S.strikes++;
    if (S.strikes >= 3) { S.pitchLog.push('K'); return endPA('K', { looking: kind === 'called' }); }
    emit('STRIKE', { kind, batter: S.batter.id, pitchType: pitchAnim?.type }); afterPitch();
  }
  function ballCalled() { S.balls++; if (S.balls >= 4) return endPA('BB'); emit('BALL', { batter: S.batter.id, pitchType: pitchAnim?.type }); afterPitch(); }
  function foul() {
    S.stats.fouls++;
    if (S.steal) { dec(S.steal.r, 'RETURN', { reason: 'foul' }); S.steal = null; } // the runner who broke returns to the bag
    if (S.strikes < 2) { S.strikes++; emit('STRIKE', { kind: 'foul', batter: S.batter.id }); } else emit('FOUL', { batter: S.batter.id });
    afterPitch();
  }
  function afterPitch() {
    S.ball.holder = T[fld()].field.C?.id || null;
    if (S.steal) { const st = S.steal; S.steal = null; return beginSteal(st); }
    S.phase = 'PRE'; phaseT = 1.1;
  }
  // The runner who broke with the pitch: race between his run and catcher transfer + throw + tag.
  function beginSteal(st) {
    const r = st.r, C = T[fld()].field.C, to = st.to, flightT = pitchAnim.T, dist2 = to === 2 ? 127.3 : 90;
    const actual = st.margin - TUNE.stealBias + gauss() * TUNE.stealSd, safe = actual > 0;
    const tb = Math.max(0.9, st.Tball - st.deliv - flightT), tr = Math.max(0.8, safe ? tb - actual : tb - actual);
    const cover = S.fielders.find(f => f.pos === (to === 2 ? (b0Side() === 'R' ? 'SS' : '2B') : '3B')) || coverAt(to);
    const errT = !safe ? false : false;
    const from = r.base + 0.15, spd = ((to - from) * 90) / tr;
    const q = basePos(to), plan = { fl: { pts: [] }, fieldT: 0, fielder: C, events: [], fielderMoves: [{ f: cover, x: q.x - 2, y: q.y - 2 }], runnerMoves: [{ rec: r, from, to, t0: 0, spd, out: safe ? null : tb }],
      throws: [{ from: C, to, t0: Math.max(0.2, tb - dist2 / throwSpeed(C) - 0.1), t1: tb }], end: Math.max(tr, tb) + 1, steal: true, decisions: [{ r, decision: 'STEAL', extra: { to } }] };
    void errT;
    S.stats.steals.att++;
    if (safe) plan.events.push({ t: tr, type: 'STOLEN_BASE', data: { runner: r.id, base: to, team: bat(), catcher: C.id }, apply: () => { S.stats.steals.sb++; box(r.id).sb++; } });
    else plan.events.push({ t: tb, type: 'OUT', data: { kind: 'caughtStealing', runner: r.id, fielder: cover.id, catcher: C.id, team: fld(), assist: true }, apply: () => { S.stats.steals.cs++; S.outs++; box(pitcher().id).outs++; box(r.id).cs++; } });
    stage('THROW'); beginPlay(plan);
  }
  const b0Side = () => (S.batter ? batsAgainst(S.batter, pitcher()) : 'R');

  // ---------- plate appearance endings without a ball in play ----------
  function endPA(kind, extra = {}) {
    const b = S.batter, p = pitcher(); S.steal = null;
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
    const react = (ground ? 0.28 : 0.15) + 0.35 * (1 - f.R.reaction) - 0.0010 * (f._focus || 0), run = 20 + 9 * f.R.speed;
    const d = Math.max(0, dist(f, p) - (ground ? 1.5 + 2 * f.R.range : 3 + 2.5 * f.R.range));
    return react + (d > 0 ? 0.22 : 0) + d / (run * (ground ? 1 : 0.84)); // routes to balls in the air are never perfectly straight
  }
  const throwSpeed = f => 92 + 48 * f.R.arm;
  const transfer = f => 0.38 + 0.45 * (1 - f.R.transfer);
  function startPlay(contact, pre) {
    const fl = pre || flight(contact), b = S.batter, fieldT = T[fld()];
    stage('BALL_FLIGHT');
    for (const f of S.fielders) { const dl = adaptOf(f).delta; f._focus = dl['Fielding Focus']; f._throw = dl['Throwing Rhythm']; }
    const goer = S.steal?.r || null; if (goer) goer.going = true; S.steal = null; // runner on the move when the ball is put in play
    const plan = { fl, events: [], fielderMoves: [], runnerMoves: [], throws: [], end: 0, holderAt: [], decisions: [] };
    const sched = (t, type, data, apply) => plan.events.push({ t, type, data, apply });
    S.ball.landing = fl.landed && !fl.hr ? { x: fl.landed.x, y: fl.landed.y } : null;
    for (const r of [...S.runners, b]) { const dl = adaptOf(r).delta; r._bri = dl['Baserunning Instinct Today']; r._rec = dl['Recovery State']; }
    const rs = r => (23 + 7 * r.R.speed) * (1 + 0.0006 * (r._rec || 0));
    // runners on base + the batter-runner
    const runners = S.runners.map(r => ({ r, from: r.base, start: S.outs === 2 || r.going ? 0 : 0.1, going: r.going })), br = { r: b, from: 0, start: 0.55 + 0.15 * (1 - b.R.speed) };
    const lead = x => (x.from === 0 ? 0 : x.from === 2 ? 22 : x.from === 1 ? 14 : 12) + (x.from && S.outs === 2 ? 10 : 0) + (x.going ? 8 : 0);
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
    const err = !best.retrieve && rng.next() < (best.air ? 0.012 : 0.025) * (1.4 - F.R.hands) * (best.dive ? 3 : 1) * clamp(1 - 0.012 * (F._focus || 0), 0.6, 1.5);
    if (fl.foul && !(best.air && !err)) return foulPlay(fl, F, goer); // a foul that nobody catches: the ball flies, lands, the count moves
    if (goer && !fl.foul) dec(goer, 'STEAL', { to: goer.base + 1, inPlay: true });
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
        const tagable = (x.from === 3 && depth > 165) || (x.from === 2 && depth > 250 && Q.x > -60);
        if (!tagable) { plan.decisions.push({ r: x.r, decision: 'RETURN', extra: { reason: 'caught' } }); plan.runnerMoves.push({ rec: x.r, from: x.from, to: x.from + 0.15, t0: x.start, spd: 8, back: tF + 0.3 }); continue; }
        const tr = tF + 0.1 + (x.from === 3 ? 82 : 88) / rs(x.r), tt = tF + transfer(F) + dist(Q, basePos(x.from + 1)) / throwSpeed(F) + gauss() * 0.15;
        const send = tr + (0.5 - 0.4 * x.r.R.runIQ) - 0.0025 * (x.r._bri || 0) < tt + 0.75;
        if (!send) { plan.decisions.push({ r: x.r, decision: 'HOLD', extra: { reason: 'tag-up too risky' } }); plan.runnerMoves.push({ rec: x.r, from: x.from, to: x.from, t0: 0, spd: 8 }); continue; }
        plan.decisions.push({ r: x.r, decision: 'TAG_UP', extra: { to: x.from + 1 } });
        const safe = tr < tt;
        plan.throws.push({ from: F, to: x.from + 1, t0: tF + transfer(F), t1: tt });
        plan.runnerMoves.push({ rec: x.r, from: x.from, to: x.from + 1, t0: tF + 0.1, spd: rs(x.r), out: safe ? null : tt });
        if (safe) { if (x.from === 3) sched(tr, 'RUN_SCORES_INT', { r: x.r }, () => runScores(x.r, b)); }
        else { outs++; sched(tt, 'OUT', { kind: 'doublePlay', fielder: F.id, runner: x.r.id, team: fld(), assist: true, tag: true }, () => { S.outs++; box(pitcherRec.id).outs++; box(F.id).a++; }); }
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
          if (outs < 3 && t3 < tb1 && rng.next() < 0.3 + 0.4 * pivot.R.transfer) { outsList.push({ x: br, t: t3, base: 1 }); outs++; dp = true; plan.throws.push({ from: pivot, to: 1, t0: t2 + 0.42, t1: t3 }); }
          tLast = Math.max(tLast, t3);
        }
      }
      if (firstThrowTarget === 1) {
        const self1 = F.pos === '1B' && dist(Q, basePos(1)) < 25;
        const t1 = self1 ? tFielded + dist(Q, basePos(1)) / (20 + 9 * F.R.speed) : tFielded + transfer(F) + dist(Q, basePos(1)) / throwSpeed(F) + gauss() * 0.1;
        if (!self1) plan.throws.push({ from: F, to: 1, t0: tFielded + transfer(F), t1 });
        const throwErr = !self1 && rng.next() < 0.012 * (1.3 - F.R.armAcc) * clamp(1 - 0.012 * (F._throw || 0), 0.6, 1.5);
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
        plan.decisions.push({ r: x.r, decision: to > x.from ? 'ADVANCE' : 'HOLD', extra: { to, forced } });
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
      const sac = contact.kind === 'bunt' && batterOut && !dp && moves.some(m => !m.out && m.to > m.x.from);
      if (contact.kind === 'bunt') S.stats.bunts++;
      for (const o of outsList) sched(o.t, 'OUT', { kind: dp ? 'doublePlay' : o.x === br ? 'groundout' : 'fieldersChoice', fielder: F.id, batter: b.id, runner: o.x.r.id, team: fld(), sac: sac && o.x === br, bunt: contact.kind === 'bunt', ev: Math.round(contact.ev) }, () => { S.outs++; box(pitcherRec.id).outs++; if (F.pos !== '1B') box(F.id).a++; });
      if (dp) plan.events = plan.events.filter((e, i, arr) => !(e.type === 'OUT' && arr.findIndex(z => z.type === 'OUT') !== i)); // one DP call
      if (dp) sched(tLast, 'OUT_SILENT', {}, () => { S.outs++; box(pitcherRec.id).outs++; });
      if (!batterOut && !plan.throwError && !outsList.length) sched(tb1, 'HIT', { by: b.id, bases: 1, team: bat(), fielder: F.id, infield: true }, () => { S.hits[bat()]++; box(b.id).h++; box(pitcherRec.id).ha++; });
      if (plan.throwError) sched(tb1, 'ERROR', { fielder: F.id, team: fld(), kind: 'throw' }, () => { S.errors[fld()]++; F.errs++; box(F.id).e++; });
      if (sac) box(b.id).sh++; else box(b.id).ab++;
      plan.end = tLast + 1.3;
      plan.final = { batterBase: batterOut ? null : brTo };
      return beginPlay(plan);
    }
    // ===== CASE C: base hit (or error) — race between runners and throws =====
    const tGot = tF + (err ? 0.8 : 0), from = F;
    const throwT = k => { const d = dist(Q, basePos(k)); return tGot + transfer(from) + 0.2 + d / (throwSpeed(from) * (d > 150 ? 0.78 : 1)) + (d > 220 ? 0.35 : 0); };
    const margin = x => 0.15 - 0.3 * x.r.R.runIQ - 0.0025 * (x.r._bri || 0);
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
      // the throw can sail: no out, the runner takes the next base and the thrower is charged with an error
      if (outRunner && rng.next() < 0.022 * (1.3 - from.R.armAcc) * clamp(1 - 0.012 * (from._throw || 0), 0.6, 1.5) * (dist(Q, basePos(tight.to)) > 200 ? 1.6 : 1)) {
        outRunner = null; plan.sailed = true; sched(tt, 'ERROR', { fielder: from.id, team: fld(), kind: 'throw' }, () => { S.errors[fld()]++; from.errs++; box(from.id).e++; });
        if (tight.x !== br && targets.get(tight.x) < 4) targets.set(tight.x, targets.get(tight.x) + 1);
      }
      tLast = Math.max(tLast, tt, ta);
    } else plan.throws.push({ from, to: 2, t0: tGot + transfer(from), t1: tGot + transfer(from) + dist(Q, basePos(2)) / throwSpeed(from) });
    const hitBases = err ? 0 : outRunner?.x === br ? Math.max(1, bTo - 1) : bTo;
    if (err) sched(tF + 0.2, 'ERROR', { fielder: F.id, team: fld(), kind: 'fielding' }, () => { S.errors[fld()]++; F.errs++; box(F.id).e++; });
    else sched(arrive(br, Math.max(1, hitBases)) - 0.05, 'HIT', { by: b.id, bases: hitBases, team: bat(), fielder: F.id }, () => {
      S.hits[bat()]++; const bb = box(b.id); bb.h++; if (hitBases === 2) bb.d2++; if (hitBases === 3) bb.d3++; box(pitcherRec.id).ha++;
    });
    box(b.id).ab++;
    const outsAfter = outs0 + (outRunner ? 1 : 0);
    for (const [x, to] of targets) {
      const isOut = outRunner?.x === x;
      plan.decisions.push({ r: x.r, decision: 'ADVANCE', extra: { to, hit: true } });
      plan.runnerMoves.push({ rec: x.r, from: x.from, to, t0: x.start, spd: rs(x.r), out: isOut ? outRunner.t : null });
      if (to >= 4 && !isOut) { const ta = arrive(x, 4); if (!(outsAfter >= 3 && outRunner && outRunner.t < ta)) sched(ta, 'RUN_SCORES_INT', { r: x.r, rbi: !err }, () => runScores(x.r, b, !err)); tLast = Math.max(tLast, ta); }
    }
    plan.runnerMoves.push({ rec: b, from: 0, to: bTo, t0: br.start, spd: rs(b), out: outRunner?.x === br ? outRunner.t : null });
    if (outRunner) sched(outRunner.t, 'OUT', { kind: 'thrownOut', fielder: from.id, runner: outRunner.x.r.id, team: fld(), assist: ['LF', 'CF', 'RF'].includes(from.pos), base: tight.to }, () => { S.outs++; box(pitcherRec.id).outs++; box(from.id).a++; });
    tLast = Math.max(tLast, arrive(br, bTo));
    plan.end = tLast + 1.3;
    plan.final = { batterBase: outRunner?.x === br ? null : bTo };
    return beginPlay(plan);
  }

  function beginPlay(plan) {
    plan.t0 = S.t; plan.events.sort((a, b) => a.t - b.t); plan.ei = 0;
    for (const m of plan.fielderMoves) { m.f.tx = m.x; m.f.ty = m.y; m.f.spd = 20 + 9 * m.f.R.speed; m.f.delay = 0.12 + 0.38 * (1 - m.f.R.reaction); }
    if (!plan.steal && !plan.foul) { S.runners = [...S.runners.filter(r => r !== S.batter), S.batter]; } // batter becomes a runner
    for (const mv of plan.runnerMoves) { mv.rec.move = mv; mv.rec.prog = mv.from; mv.rec.isOut = false; }
    if (!plan.steal && !plan.foul) S.batter = null;
    for (const d of plan.decisions || []) { if (d.r.base != null) dec(d.r, d.decision, d.extra); }
    play = plan; S.phase = 'PLAY';
  }
  // A foul ball nobody catches: it flies and lands (animated), then the count moves.
  function foulPlay(fl, F, goer) {
    if (goer) { goer.going = false; dec(goer, 'RETURN', { reason: 'foul' }); }
    const q = fl.landed ? { x: fl.landed.x, y: fl.landed.y } : { x: 0, y: 0 };
    S.ball.landing = fl.landed ? q : null;
    const near = [...S.fielders].sort((a, c) => dist(a, q) - dist(c, q))[0];
    const plan = { fl, events: [], fielderMoves: near ? [{ f: near, x: q.x, y: q.y }] : [], runnerMoves: [], throws: [], end: Math.min(fl.hang, 7) + 0.7, holderAt: [], decisions: [], foul: true, fielder: near || F, fieldT: null };
    beginPlay(plan);
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
    if (!p.foul) {
      if (p.ballHiddenAt != null && tau >= p.ballHiddenAt) stage('BASERUNNING'); // home-run trot
      else if (p.fieldT == null || tau < p.fieldT) stage('BALL_FLIGHT');
      else if (th) { stage('FIELDING'); stage('THROW'); }
      else { stage('FIELDING'); if (lastTh || (!p.throws.length && tau > p.fieldT + 0.6)) stage('BASERUNNING'); }
    }
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
    stage('RESULT');
    // flush any remaining events
    while (p.ei < p.events.length) { const e = p.events[p.ei++]; e.apply?.(); if (e.type === 'RUN_SCORES_INT') { const i = S.runners.indexOf(e.data.r); if (i >= 0) S.runners.splice(i, 1); } else if (e.type !== 'OUT_SILENT') emit(e.type, e.data); }
    if (p.foul) { S.ball.landing = null; S.throwTarget = null; S.stage = 'PRE'; return foul(); }
    // settle runners on their final bases
    for (const r of S.runners) r.going = false;
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
    if (p.steal) { // the plate appearance goes on (or the half ends on a caught stealing)
      if (S.outs >= 3) return endHalf();
      S.phase = 'PRE'; phaseT = 0.9; resetPositions(false); return;
    }
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
      const a = pitchAnim, k = clamp((S.t - a.t0) / a.T, 0, 1);
      b.px = b.x; b.py = b.y; b.pz = b.z;
      const q = pitchPath(a.rel, { x: a.x, z: a.z }, a.hb, a.vb, a.throws, k);
      Object.assign(b, { x: q.x, y: q.y, z: q.z, holder: null });
      if (S.pitchTrail && S.pitchTrail.pts.length < 400) S.pitchTrail.pts.push({ x: q.x, y: q.y, z: q.z });
      if (S.steal) { const r = S.steal.r; r.px = r.x; r.py = r.y; const w = basePos(r.base + 0.15 * k); r.x = w.x; r.y = w.y; r.facing = null; } // runner breaks with the pitch
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
    adaptive: r => adaptOf(r), // 30 adaptive attributes of a player in the CURRENT game context (pure function + real state)
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
