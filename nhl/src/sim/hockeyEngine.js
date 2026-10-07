// HockeySimulationEngine — NHL only (no shared engine with NFL/MLB). Fixed step 30 Hz, feet & seconds, seeded RNG.
// Players have position / velocity / acceleration / facing / energy / role (assignment). The Puck has position,
// velocity, height, owner and last touch. Team AI: carrier decisions (carry / pass / shoot / dump / clear), offensive
// support (net front, slot, half-wall, points, wide lanes on the breakout), defense (pressure on the carrier, slot
// protection, passing-lane coverage, backcheck), goalie (angle/depth, lateral movement, saves, rebounds, freeze).
// Rules: faceoffs, line changes, icing, minor penalties + power play, periods, 3-on-3 OT, shootout decision.
// Every relevant moment becomes an event in state.events (commentary, sounds, crowd and stats read them).
import { createRng } from '../../../core/rng/rng.js';
import { RINK, MIDY, goalX, insideRink } from '../rink/geometry.js';
import { faceoffSpots, skaterRecord } from '../game/lineup.js';
import { makeAttrs } from '../nhlData.js';
import { simRatings } from './ratings.js';

export const DT = 1 / 30;
const POSTS = 3, CENTER = RINK.center, BLUE_U = RINK.center - RINK.blueLine, GOAL_U = RINK.center - RINK.goalLine;
// Stable event vocabulary (state.events[].type). PASS carries `kind`, SHOT `shotType`, SAVE `save` (goalie state).
export const EVENT_TYPES = ['FACEOFF', 'PASS', 'RECEPTION', 'INTERCEPTION', 'TURNOVER', 'TAKEAWAY', 'ZONE_ENTRY', 'BREAKAWAY', 'HIT', 'SHOT', 'BLOCK', 'MISS', 'SAVE', 'REBOUND', 'GOAL', 'PENALTY', 'POWER_PLAY', 'POWER_PLAY_END', 'ICING', 'PERIOD_START', 'PERIOD_END', 'SHOOTOUT', 'FINAL'];
export const PASS_KINDS = ['short', 'cross', 'saucer', 'stretch', 'drop', 'bank'];
export const SHOT_TYPES = ['wrist', 'snap', 'slap', 'backhand', 'one-timer'];
export const GOALIE_STATES = ['READY', 'BUTTERFLY', 'SLIDE', 'GLOVE', 'BLOCKER', 'PAD_SAVE', 'RECOVER'];
const WIND = { wrist: 0.32, snap: 0.18, slap: 0.55, backhand: 0.38, 'one-timer': 0.1 }; // release time (s)
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const INFRACTIONS = ['tripping', 'hooking', 'slashing', 'holding', 'interference', 'roughing', 'high-sticking'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const other = side => (side === 'home' ? 'away' : 'home');

// Closest point inside the rounded-rectangle boards (pad ft from the boards).
function clampInside(x, y, pad) {
  const { L, W, cornerR: r } = RINK;
  x = clamp(x, pad, L - pad); y = clamp(y, pad, W - pad);
  const cx = x < r ? r : x > L - r ? L - r : x, cy = y < r ? r : y > W - r ? W - r : y;
  const d = Math.hypot(x - cx, y - cy), lim = r - pad;
  if (d > lim && d > 0) { x = cx + (x - cx) / d * lim; y = cy + (y - cy) / d * lim; }
  return { x, y };
}

export function createHockeyEngine({ home, away, seed = 'nhl', periodLength = 1200, otLength = 300, ratingsOf = null, speed = 1 }) {
  const rng = createRng(String(seed));
  const rate = ratingsOf || (p => simRatings(makeAttrs(p), p.positionCode === 'G'));
  const teams = { home, away };
  const roster = {}; // id → record (dressed players, on ice or bench)
  const T = {};
  for (const side of ['home', 'away']) {
    const L = teams[side].lineup;
    const mk = (p, slot) => { const r = skaterRecord(p, slot, side); Object.assign(r, { vx: 0, vy: 0, ax: 0, ay: 0, px: 0, py: 0, energy: 1, R: rate(p), stun: 0, cd: 0, role: '', tx: 0, ty: 0, want: 0, dirv: 0, turnRate: 4, skate: 'idle', back: false, cross: false, crossT: 0, crossDir: 0, wind: null, state: p.positionCode === 'G' ? 'READY' : '', stateUntil: 0, saveSide: 0 }); roster[r.id] = r; return r; };
    T[side] = {
      side, dir: side === 'home' ? 1 : -1,
      lines: L.lines.map(l => ({ C: mk(l.C, 'C'), LW: mk(l.LW, 'LW'), RW: mk(l.RW, 'RW') })),
      pairs: L.pairs.map(pr => ({ LD: mk(pr.LD, 'LD'), RD: mk(pr.RD, 'RD') })),
      goalie: mk(L.goalies[0], 'G'),
      line: 0, pair: 0, fShift: 0, dShift: 0, box: [], entered: false, breakaway: false,
    };
  }
  const state = {
    t: 0, players: [], puck: { x: CENTER, y: MIDY, z: 0, vz: 0, vx: 0, vy: 0, px: CENTER, py: MIDY, dir: 0, spin: 0, bounces: 0, owner: null, lastTouch: null },
    home, away, attack: { home: 1, away: -1 }, possession: null, pass: null,
    period: 1, clock: periodLength, score: { home: 0, away: 0 }, shots: { home: 0, away: 0 }, strength: '', powerPlay: null,
    phase: 'FACEOFF', events: [], roster, box: {}, over: false, elapsed: 0, speed,
  };
  const S = state, P = state.puck;
  let holdT = 0, possSince = 0, acc = 0, phaseT = 1.4, faceoffDot = { x: CENTER, y: MIDY }, touches = [], lastShot = null, aiTick = 0;
  const box = id => (S.box[id] ||= { g: 0, a: 0, sog: 0, hit: 0, blk: 0, fow: 0, fot: 0, pim: 0, toi: 0, sa: 0, sv: 0, ga: 0, pm: 0, tk: 0 });
  const emit = (type, data = {}) => { const e = { type, t: +S.t.toFixed(2), period: S.period, clock: Math.max(0, Math.round(S.clock)), ...data }; S.events.push(e); return e; };

  // ---------- geometry in a team's frame: u > 0 toward the net it attacks ----------
  const uOf = (side, x) => (x - CENTER) * T[side].dir;
  const xOf = (side, u) => CENTER + u * T[side].dir;
  const netOf = side => ({ x: goalX(T[side].dir), y: MIDY });          // net this team attacks
  const ownNet = side => ({ x: goalX(-T[side].dir), y: MIDY });
  let skCache = null; // invalidated whenever the on-ice personnel changes
  const skaters = side => (skCache ||= { home: S.players.filter(p => p.team === 'home' && !p.goalie), away: S.players.filter(p => p.team === 'away' && !p.goalie) })[side];
  const allowed = side => S.period >= 4 ? 3 : Math.max(3, 5 - T[side].box.length);

  // ---------- on-ice personnel ----------
  function assemble(side, keepIds = null) {
    const t = T[side], L = t.lines[t.line], Pr = t.pairs[t.pair], n = allowed(side);
    let list = n >= 5 ? [L.C, L.LW, L.RW, Pr.LD, Pr.RD] : n === 4 ? [L.C, L.LW, Pr.LD, Pr.RD] : [L.C, L.LW, Pr.LD];
    if (S.period >= 4) list = [L.C, L.RW, Pr.LD];
    const inBox = new Set(t.box.map(b => b.rec.id));
    const taken = new Set(list.filter(r => !inBox.has(r.id)).map(r => r.id)); // never put the same skater on the ice twice
    list = list.map(r => { if (!inBox.has(r.id)) return r; const x = substitute(side, r, inBox, taken); taken.add(x.id); return x; });
    return [...list, t.goalie];
  }
  function substitute(side, r, inBox, taken = new Set()) {
    const t = T[side], used = new Set([...S.players.map(p => p.id)]);
    const pool = r.slot === 'LD' || r.slot === 'RD' ? t.pairs.flatMap(p => [p.LD, p.RD]) : t.lines.flatMap(l => [l.C, l.LW, l.RW]);
    return pool.find(x => !inBox.has(x.id) && !used.has(x.id) && !taken.has(x.id) && x.id !== r.id) || pool.find(x => !inBox.has(x.id) && !taken.has(x.id) && x.id !== r.id) || r;
  }
  function setOnIce(entering = false) {
    const prev = new Map(S.players.map(p => [p.id, p]));
    const next = [...assemble('home'), ...assemble('away')];
    for (const p of next) {
      p.onBench = false;
      if (entering && !prev.has(p.id)) { // new skaters jump over the boards at the bench door
        const benchX = p.team === 'home' ? 75 : 125;
        p.x = benchX + (rng.next() - 0.5) * 10; p.y = RINK.W - 3; p.vx = 0; p.vy = 0; p.px = p.x; p.py = p.y;
      }
    }
    for (const p of prev.values()) if (!next.includes(p)) p.onBench = true;
    S.players = next; skCache = null;
    updateStrength();
  }
  function updateStrength() {
    const h = skaters('home').length, a = skaters('away').length;
    S.powerPlay = h > a ? 'home' : a > h ? 'away' : null;
    S.strength = h === a ? (h === 3 ? '3 on 3' : '') : `${S.powerPlay === 'home' ? home.abbr : away.abbr} PP ${Math.max(h, a)}v${Math.min(h, a)}`;
  }
  function changeLines(side, force = false) {
    const t = T[side];
    if (force || t.fShift > 40) { t.line = (t.line + 1) % (S.period >= 4 ? 3 : 4); t.fShift = 0; }
    if (force || t.dShift > 50) { t.pair = (t.pair + 1) % 3; t.dShift = 0; }
  }

  // ---------- faceoffs / stoppages ----------
  function setFaceoff(dot) {
    faceoffDot = dot; S.phase = 'FACEOFF'; phaseT = 1.2;
    for (const side of ['home', 'away']) changeLines(side, false);
    setOnIce(false);
    for (const side of ['home', 'away']) {
      const spots = faceoffSpots(T[side].dir, dot.x, dot.y);
      const sk = skaters(side), order = ['C', 'LW', 'RW', 'LD', 'RD'];
      sk.forEach((p, i) => { const sp = spots[p.slot] && !sk.slice(0, i).some(q => q.slot === p.slot) ? spots[p.slot] : spots[order[i]]; Object.assign(p, { x: sp.x, y: sp.y, px: sp.x, py: sp.y, vx: 0, vy: 0, facing: T[side].dir > 0 ? 0 : Math.PI }); });
      const g = T[side].goalie, gs = spots.G; Object.assign(g, { x: gs.x, y: gs.y, px: gs.x, py: gs.y, vx: 0, vy: 0, facing: T[side].dir > 0 ? 0 : Math.PI });
    }
    for (const p of Object.values(roster)) { p.wind = null; if (p.goalie) setGoalie(p, 'READY', 0); }
    Object.assign(P, { x: dot.x, y: dot.y, px: dot.x, py: dot.y, vx: 0, vy: 0, z: 0, vz: 0, spin: 0, owner: null, release: null, tried: new Set(), noPick: null });
    S.pass = null; lastShot = null; touches = [];
  }
  function dotNear(x, y) {
    const ex = x < CENTER ? RINK.goalLine + RINK.dotFromGoal : RINK.L - RINK.goalLine - RINK.dotFromGoal;
    return { x: ex, y: y < MIDY ? MIDY - RINK.dotY : MIDY + RINK.dotY };
  }
  function stoppage(dot, wait = 1.6) { S.phase = 'STOPPAGE'; phaseT = wait; S.pendingDot = dot; P.owner = null; S.pass = null; P.vx *= 0.2; P.vy *= 0.2; }
  function resolveFaceoff() {
    const cH = skaters('home').find(p => p.slot === 'C') || skaters('home')[0], cA = skaters('away').find(p => p.slot === 'C') || skaters('away')[0];
    if (!cH || !cA) return;
    const pH = clamp(0.5 + 0.45 * (cH.R.faceoff - cA.R.faceoff), 0.2, 0.8);
    const [w, l] = rng.next() < pH ? [cH, cA] : [cA, cH];
    box(w.id).fow++; box(w.id).fot++; box(l.id).fot++;
    const u = uOf(w.team, faceoffDot.x);
    emit('FACEOFF', { winner: w.id, loser: l.id, team: w.team, zone: Math.abs(u) < 5 ? 'center' : u > 0 ? 'offensive' : 'defensive' });
    // puck drawn back toward the winner's defense
    const ang = (T[w.team].dir > 0 ? Math.PI : 0) + (rng.next() - 0.5) * 1.2;
    Object.assign(P, { owner: null, vx: Math.cos(ang) * 16, vy: Math.sin(ang) * 16, tried: new Set(), noPick: { id: l.id, until: S.t + 0.3 } });
    touch(w, false);
    S.phase = 'PLAY';
  }

  // ---------- puck control ----------
  function touch(p, controlled = true) {
    const prevTeam = P.lastTouch?.team;
    P.lastTouch = { id: p.id, team: p.team, t: S.t };
    if (prevTeam && prevTeam !== p.team) touches = [];
    if (!touches.length || touches[touches.length - 1].id !== p.id) touches.push({ id: p.id, team: p.team, t: S.t });
    if (touches.length > 6) touches.shift();
    P.release = null;
    if (controlled) {
      if (S.possession !== p.team) { holdT = S.t - possSince; possSince = S.t; T[p.team].entered = uOf(p.team, P.x) > BLUE_U; T[p.team].breakaway = false; }
      S.possession = p.team; P.owner = p.id; P.tried = new Set(); S.pass = null; p.gotAt = S.t; p.cd = Math.max(p.cd, S.t + 0.25);
    }
  }
  function release(p, vx, vy, kind) {
    P.owner = null; P.vx = vx; P.vy = vy; P.tried = new Set(); P.noPick = { id: p.id, until: S.t + 0.35 };
    P.release = { team: p.team, u: uOf(p.team, P.x), kind, id: p.id };
  }
  // interception / reception model per pass kind
  const ICEPT = { short: 1, cross: 1.25, stretch: 0.9, saucer: 0.5, drop: 0.55, bank: 1.1 };
  const RECV = { short: 0, cross: -0.04, stretch: -0.1, saucer: -0.1, drop: 0.12, bank: -0.06 };
  let lastTakeawayT = -9;
  function tryPickups() {
    if (P.owner || P.z > 1.2) return;
    const ps = Math.hypot(P.vx, P.vy);
    let best = null;
    const kind = S.pass?.kind || 'short';
    for (const p of S.players) {
      if (p.goalie || p.stun > 0 || (P.noPick && P.noPick.id === p.id && S.t < P.noPick.until)) continue;
      const d = Math.hypot(p.x - P.x, p.y - P.y);
      if (d > 2.6 || P.tried.has(p.id)) continue;
      P.tried.add(p.id);
      const rel = Math.hypot(P.vx - p.vx, P.vy - p.vy);
      const intended = S.pass && S.pass.targetId === p.id;
      const own = P.lastTouch && P.lastTouch.team === p.team;
      let pc = clamp(1.25 - rel / 110 + 0.35 * (p.R.handling - 0.6) + (intended ? RECV[kind] : 0), 0.1, 0.98);
      if (!intended && ps > 25) pc *= own ? 0.7 : (0.08 + 0.22 * p.R.stick * (0.6 + 0.6 * p.R.defIQ)) * (ICEPT[kind] || 1);
      if (rng.next() < pc && (!best || d < best.d)) best = { p, d };
      else if (intended) { P.vx *= 0.3; P.vy *= 0.3; S.pass = null; }
    }
    if (!best) return;
    const p = best.p, wasPass = S.pass, lt = P.lastTouch, prevPoss = S.possession;
    const afterSave = lastShot && lastShot.saved && S.t - lastShot.t < 2.5 && p.team === lastShot.team;
    touch(p, true);
    if (wasPass && wasPass.team !== p.team) {
      emit('INTERCEPTION', { by: p.id, team: p.team, from: wasPass.from, kind: wasPass.kind }); box(p.id).tk++;
      emit('TURNOVER', { by: p.id, team: p.team, from: wasPass.from, cause: 'interception' });
    } else if (wasPass && wasPass.team === p.team) {
      emit('RECEPTION', { by: p.id, from: wasPass.from, team: p.team, kind: wasPass.kind, intended: wasPass.targetId === p.id });
    } else if (afterSave) emit('REBOUND', { by: p.id, team: p.team });
    else if (lt && lt.team !== p.team && prevPoss === lt.team && holdT > 2.5 && S.t - lastTakeawayT > 1.5) {
      emit('TURNOVER', { by: p.id, team: p.team, from: lt.id, cause: 'loose' }); // loose puck recovered after the other team lost it
    }
  }

  // ---------- puck physics ----------
  function puckStep() {
    P.px = P.x; P.py = P.y;
    const o = P.owner ? roster[P.owner] : null;
    if (o) {
      P.x = o.x + Math.cos(o.facing) * 2.2; P.y = o.y + Math.sin(o.facing) * 2.2; P.vx = o.vx; P.vy = o.vy; P.z = 0;
      const c = clampInside(P.x, P.y, 0.6); P.x = c.x; P.y = c.y; P.spin = 0;
      if (Math.hypot(P.vx, P.vy) > 0.5) P.dir = Math.atan2(P.vy, P.vx);
      return;
    }
    P.spin *= Math.exp(-1.1 * DT);
    if (S.pass && P.z < 0.5) { // a pass that slips past its target loses speed (stick contact, rough ice) instead of sailing the length of the rink
      const tg = roster[S.pass.targetId];
      if (tg && (P.x - tg.x) * P.vx + (P.y - tg.y) * P.vy > 0 && Math.hypot(P.x - tg.x, P.y - tg.y) > 28) { const k = Math.exp(-0.9 * DT); P.vx *= k; P.vy *= k; }
    }
    const sp = Math.hypot(P.vx, P.vy);
    if (sp > 0) { const ns = Math.max(0, sp * Math.exp(-0.22 * DT) - 2.5 * DT); P.vx *= ns / sp; P.vy *= ns / sp; }
    if (P.z > 0 || P.vz) { P.vz = (P.vz || 0) - 32 * DT; P.z = Math.max(0, P.z + P.vz * DT); if (P.z === 0) P.vz = 0; }
    const ox = P.x;
    P.x += P.vx * DT; P.y += P.vy * DT;
    // goal line crossing (both nets)
    for (const side of [-1, 1]) {
      const gx = goalX(side);
      if ((ox - gx) * (P.x - gx) <= 0 && ox !== P.x) {
        const inPosts = Math.abs(P.y - MIDY) < POSTS && P.z < 4;
        const fromFront = side < 0 ? P.vx < 0 : P.vx > 0;
        if (inPosts && fromFront) {
          if (lastShot && !lastShot.resolved && !lastShot.miss) { goalieResolve(true); return; }
          looseGoal(side); return;
        }
        if (!inPosts && S.phase === 'PLAY') checkIcingOrMiss(side);
      }
      // net frame: bounce off the back/sides of the cage
      const nx0 = side < 0 ? gx - RINK.netD : gx, nx1 = side < 0 ? gx : gx + RINK.netD;
      if (P.x > nx0 && P.x < nx1 && Math.abs(P.y - MIDY) < POSTS + 0.3) { P.x = ox; P.vx = -P.vx * 0.4; P.vy *= 0.6; }
    }
    if (!insideRink(P.x, P.y, 0.6)) {
      const c = clampInside(P.x, P.y, 0.6);
      let nx = P.x - c.x, ny = P.y - c.y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const vn = P.vx * nx + P.vy * ny;
      if (vn > 0) { P.vx -= 1.55 * vn * nx; P.vy -= 1.55 * vn * ny; P.spin *= -0.5; P.bounces++; P.z = Math.max(P.z, 0.2); }
      P.x = c.x; P.y = c.y;
    }
    // the puck can never leave the rink or turn into NaN: recover to the last known good position
    if (!Number.isFinite(P.x + P.y + P.vx + P.vy + P.z)) { P.x = P.px; P.y = P.py; P.vx = 0; P.vy = 0; P.z = 0; P.vz = 0; }
    if (Math.hypot(P.vx, P.vy) > 0.5) P.dir = Math.atan2(P.vy, P.vx);
  }
  function checkIcingOrMiss(side) {
    // side = which net's goal line (-1 left, +1 right). Attacking team for that net:
    const att = T.home.dir === side ? 'home' : 'away';
    if (lastShot && !lastShot.resolved && lastShot.team === att) { lastShot.resolved = true; emit('MISS', { by: lastShot.by, team: att }); return; }
    const r = P.release;
    // hybrid icing: waved off when an attacking-team skater beats every defender to the puck
    const nearest = (list) => list.reduce((m, q) => Math.min(m, Math.hypot(q.x - P.x, q.y - P.y)), 99);
    const racerWins = nearest(skaters(att)) + 3 < nearest(skaters(other(att)));
    if (r && r.team === att && r.u < 0 && !racerWins && (r.kind === 'clear' || r.kind === 'dump' || (r.kind === 'pass' && r.u < -BLUE_U)) && skaters(att).length >= skaters(other(att)).length) {
      emit('ICING', { team: att, kind: r.kind, u: Math.round(r.u) });
      stoppage(dotNear(goalX(-T[att].dir), P.y), 1.4); // faceoff in the icing team's defensive zone
    }
  }

  // ---------- shots & goalies ----------
  // A shot has a release time (wind-up): the carrier slows down, can lose the puck, and the shot only leaves the stick at
  // `until`. Types: wrist · snap · slap · backhand · one-timer — each with its own speed, accuracy, block and height profile.
  function shoot(p, oneTimer = false) {
    const net = netOf(p.team), d = Math.hypot(net.x - p.x, net.y - p.y);
    const slap = !oneTimer && d > 38 && (p.slot === 'LD' || p.slot === 'RD' || p.R.slapP > 0.78) && rng.next() < 0.6;
    const back = !oneTimer && !slap && d < 18 && rng.next() < 0.18;
    const snap = !oneTimer && !slap && !back && d > 14 && d < 42 && rng.next() < 0.4;
    const type = oneTimer ? 'one-timer' : slap ? 'slap' : back ? 'backhand' : snap ? 'snap' : 'wrist';
    const wind = WIND[type] * (1.3 - 0.35 * (p.R.wristA + p.R.offIQ) / 2);
    p.wind = { type, until: S.t + wind, oneTimer };
    p.cd = S.t + wind + 0.6;
  }
  function windups() {
    for (const p of S.players) {
      const w = p.wind; if (!w) continue;
      if (S.phase !== 'PLAY' || P.owner !== p.id || p.stun > 0) { p.wind = null; continue; }
      if (S.t >= w.until) { p.wind = null; fire(p, w.type, w.oneTimer); if (S.phase !== 'PLAY') return; }
    }
  }
  function fire(p, type, oneTimer) {
    const net = netOf(p.team), d = Math.hypot(net.x - p.x, net.y - p.y), defSide = other(p.team);
    const power = type === 'slap' ? p.R.slapP : p.R.wristP, accu = type === 'slap' ? p.R.slapA : oneTimer ? (p.R.oneTimer + p.R.wristA) / 2 : p.R.wristA;
    const spd = ({ slap: 95 + 45 * power, backhand: 55 + 20 * power, snap: 76 + 30 * power, 'one-timer': 84 + 36 * power }[type] || 70 + 32 * power) * (0.9 + 0.2 * p.energy);
    // traffic: defenders close to the shooter or in front of the net, wide angle, and the shot type itself change the miss odds
    const angle = Math.abs(Math.atan2(p.y - MIDY, Math.abs(net.x - p.x)));
    let traffic = 0; for (const q of skaters(defSide)) { const dq = Math.hypot(q.x - p.x, q.y - p.y); if (dq < 7) traffic++; }
    const missP = clamp(0.36 - 0.28 * accu + d / 420 + 0.025 * traffic + (angle > 1.0 ? 0.06 : 0) + ({ slap: 0.04, backhand: 0.04, 'one-timer': 0.02, snap: -0.01 }[type] || 0), 0.08, 0.55);
    const miss = rng.next() < missP;
    const aimY = MIDY + (miss ? (rng.next() < 0.5 ? -1 : 1) * (POSTS + 0.6 + rng.next() * 4) : (rng.next() * 2 - 1) * (POSTS - 0.5));
    const ang = Math.atan2(aimY - p.y, net.x - p.x);
    // height at the goal line: ice-level, chest-high or top shelf (drives the goalie's save type and the 3D-ish puck lift)
    const hp = { wrist: [0.32, 0.4], snap: [0.3, 0.4], slap: [0.4, 0.35], backhand: [0.15, 0.35], 'one-timer': [0.5, 0.3] }[type] || [0.33, 0.4];
    const hr = rng.next(), height = hr < hp[0] ? 'low' : hr < hp[0] + hp[1] ? 'mid' : 'high';
    const hT = { low: 0.4, mid: 1.6, high: 3.0 }[height] + (rng.next() - 0.5) * 0.5, Tf = Math.max(0.12, d / spd);
    release(p, Math.cos(ang) * spd, Math.sin(ang) * spd, 'shot');
    P.z = 0.3; P.vz = clamp((hT - 0.3 + 16 * Tf * Tf) / Tf, 0, 26);
    P.spin = ({ slap: 46, snap: 34, wrist: 26, backhand: 20, 'one-timer': 40 }[type] || 26) * (p.R.wristA > 0.5 ? 1 : 0.8);
    const slot = d < 26 && Math.abs(p.y - MIDY) < 12;
    lastShot = { by: p.id, team: p.team, t: S.t, d, miss, oneTimer, power, accu, x0: p.x, y0: p.y, ypred: aimY, height, rebound: !!(lastShot && lastShot.saved && S.t - lastShot.t < 2.5), breakaway: T[p.team].breakaway, resolved: false, saved: false, shotType: type, traffic };
    emit('SHOT', { by: p.id, team: p.team, shotType: type, height, slot, dist: Math.round(d), traffic });
    S.lastShotInfo = { by: p.id, team: p.team, t: S.t, type, height };
    p.cd = S.t + 0.6;
    if (!miss) goalieReact(defSide, lastShot);
    // blocks: a defender in the shooting lane, between the shooter and the net (slow releases are easier to block)
    const blockAdj = { slap: 0.08, backhand: 0.02, 'one-timer': -0.08, snap: -0.06 }[type] || 0;
    for (const q of skaters(defSide)) {
      const along = ((q.x - p.x) * Math.cos(ang) + (q.y - p.y) * Math.sin(ang)), lat = Math.abs(-(q.x - p.x) * Math.sin(ang) + (q.y - p.y) * Math.cos(ang));
      if (along > 3 && along < d - 4 && lat < 2.4 && rng.next() < 0.16 + 0.42 * q.R.block + blockAdj) {
        lastShot.resolved = true; box(q.id).blk++;
        emit('BLOCK', { by: q.id, shooter: p.id, team: q.team });
        P.x = q.x + Math.cos(ang) * 1.5; P.y = q.y + Math.sin(ang) * 1.5; const ka = ang + Math.PI + (rng.next() - 0.5) * 2.2, ks = 10 + rng.next() * 18;
        P.vx = Math.cos(ka) * ks; P.vy = Math.sin(ka) * ks; P.z = 0; P.vz = 0; P.spin = 8; P.tried = new Set(); P.noPick = { id: q.id, until: S.t + 0.25 };
        setGoalie(T[defSide].goalie, 'READY', 0);
        return;
      }
    }
  }
  function screened(side) { const net = netOf(side); return S.players.some(q => !q.goalie && Math.hypot(q.x - net.x, q.y - net.y) < 9 && Math.abs(q.y - MIDY) < 6); }

  // ----- goalie state machine: READY · BUTTERFLY · SLIDE · GLOVE · BLOCKER · PAD_SAVE · RECOVER -----
  function setGoalie(g, st, dur) { g.state = st; g.stateUntil = dur ? S.t + dur : 0; }
  // Picks the save type from the shot's height and side as soon as it is released.
  function goalieReact(defSide, shot) {
    const g = T[defSide].goalie, defDir = -T[shot.team].dir; // direction the goalie faces (out of its own net)
    const e = shot.ypred - g.y, ae = Math.abs(e), glove = e * defDir < 0;   // glove hand = -y side when facing +x
    let st;
    if (g.state === 'RECOVER') st = ae > 2 ? 'SLIDE' : 'BUTTERFLY';          // scrambling: only a desperation save
    else if (ae > 5.2) st = 'SLIDE';
    else if (shot.height === 'high') st = glove ? 'GLOVE' : 'BLOCKER';
    else if (shot.height === 'mid') st = ae < 1.2 ? 'BUTTERFLY' : (rng.next() < 0.55 ? (glove ? 'GLOVE' : 'BLOCKER') : 'PAD_SAVE');
    else st = ae < 2.4 ? 'BUTTERFLY' : 'PAD_SAVE';
    g.saveSide = Math.sign(e) || 1; shot.save = st;
    setGoalie(g, st, 0.7);
  }
  // Rebound control by save type: gloves smother, blocker/pads deflect to the corners, butterfly leaves it in front.
  const REB = { GLOVE: 0.38, BLOCKER: 0.78, PAD_SAVE: 0.78, BUTTERFLY: 0.72, SLIDE: 0.66, READY: 0.7, RECOVER: 0.75, };
  const SAVE_FIT = { GLOVE: 0.9, BLOCKER: 1.0, PAD_SAVE: 1.0, BUTTERFLY: 0.98, SLIDE: 1.12, READY: 1.0, RECOVER: 1.4 };
  function goalieResolve(force = false) {
    const s = lastShot; if (!s || s.resolved || s.miss) return;
    const defSide = other(s.team), g = T[defSide].goalie, net = netOf(s.team);
    if (!force && Math.hypot(P.x - g.x, P.y - g.y) > 3.5 && Math.hypot(P.x - net.x, P.y - net.y) > 4.5) return;
    s.resolved = true;
    const st = s.save || (force ? 'BUTTERFLY' : 'READY');
    let pg = s.d < 10 ? 0.16 : s.d < 20 ? 0.1 : s.d < 35 ? 0.05 : s.d < 55 ? 0.024 : 0.01;
    pg *= 0.65 + 0.35 * (s.accu + s.power);
    pg *= 1.5 - 0.95 * (0.55 * g.R.reflex + 0.3 * g.R.positioning + 0.15 * g.R.lateral);
    const lateral = Math.abs(s.y0 - g.y);
    if (s.rebound) pg *= 1.7; if (s.oneTimer) pg *= 1.25 + lateral / 60; if (s.breakaway) pg *= 1.45 - 0.4 * g.R.breakaway;
    if (screened(s.team)) pg *= 1.25 + 0.15 * (1 - g.R.screen);
    if (Math.abs(s.y0 - MIDY) > 30 && s.d < 25) pg *= 0.45; // bad angle
    pg *= 1.42 * (SAVE_FIT[st] || 1) * (s.height === 'high' ? 1.12 : s.height === 'low' ? 0.94 : 1);
    pg = clamp(pg, 0.004, 0.6);
    S.shots[s.team]++; box(s.by).sog++; box(g.id).sa++;
    if (rng.next() < pg) { scoreGoal(s.team, s.by); return; }
    box(g.id).sv++;
    s.saved = true; s.t = S.t;
    const rebound = rng.next() < (REB[st] ?? 0.7) + 0.1 - 0.4 * g.R.rebound + 0.05;
    emit('SAVE', { goalie: g.id, shooter: s.by, team: s.team, big: pg > 0.17, rebound, save: st, height: s.height });
    if (rebound) {
      // glove/blocker/pad saves are steered to a side; butterfly and poor rebound control leave it in the slot
      const toSlot = st === 'BUTTERFLY' ? rng.next() < 0.6 - 0.35 * g.R.rebound : rng.next() < 0.4 - 0.35 * g.R.rebound;
      const dirOut = T[s.team].dir > 0 ? Math.PI : 0, side = st === 'BLOCKER' || st === 'PAD_SAVE' || st === 'GLOVE' ? g.saveSide : (rng.next() < 0.5 ? -1 : 1);
      const ka = dirOut + (toSlot ? (rng.next() - 0.5) * 1.0 : side * (1.0 + rng.next() * 0.9)), ks = toSlot ? 12 + rng.next() * 16 : 22 + rng.next() * 22;
      Object.assign(P, { x: net.x - T[s.team].dir * 3.5, y: MIDY + (rng.next() - 0.5) * 4, vx: Math.cos(ka) * ks, vy: Math.sin(ka) * ks, z: 0, vz: 0, spin: 14, owner: null, tried: new Set(), noPick: null });
      S.pass = null; setGoalie(g, 'RECOVER', 0.8);
    } else { setGoalie(g, st, 1.2); stoppage(dotNear(net.x, P.y), 1.8); }
  }
  // Per-step goalie bookkeeping: expire timed states, drop into the butterfly on close threats, slide on lateral moves.
  function goalieFSM() {
    for (const side of ['home', 'away']) {
      const g = T[side].goalie;
      if (S.phase !== 'PLAY') { if (S.phase === 'FACEOFF') setGoalie(g, 'READY', 0); continue; }
      if (g.stateUntil && S.t >= g.stateUntil) { setGoalie(g, 'READY', 0); }
      if (g.state === 'READY' || g.state === 'BUTTERFLY' || g.state === 'SLIDE') {
        const net = ownNet(side), car = P.owner ? roster[P.owner] : null;
        const threat = car && car.team !== side && Math.hypot(car.x - net.x, car.y - net.y) < 17 && Math.abs(car.y - MIDY) < 14;
        const lat = Math.abs(g.vy);
        g.state = threat ? 'BUTTERFLY' : lat > 8 ? 'SLIDE' : 'READY';
      }
    }
  }
  function looseGoal(side) {
    if (S.phase !== 'PLAY') return;
    const att = T.home.dir === side ? 'home' : 'away';
    const g = T[other(att)].goalie;
    if (Math.hypot(g.x - goalX(side), g.y - MIDY) < 5 && rng.next() < 0.93) { // goalie at home smothers the loose puck
      emit('SAVE', { goalie: g.id, shooter: null, team: att, big: false, rebound: false, cover: true, save: 'BUTTERFLY' });
      stoppage(dotNear(goalX(side), P.y), 1.6); return;
    }
    const scorer = [...touches].reverse().find(t => t.team === att)?.id || P.lastTouch?.id;
    if (lastShot && !lastShot.resolved) { lastShot.resolved = true; S.shots[att]++; if (lastShot.by) box(lastShot.by).sog++; box(T[other(att)].goalie.id).sa++; }
    scoreGoal(att, scorer);
  }
  function scoreGoal(team, scorerId) {
    S.score[team]++;
    const g = T[other(team)].goalie; box(g.id).ga++;
    const tm = touches.filter(t => t.team === team && t.id !== scorerId).reverse();
    const assists = [...new Set(tm.map(t => t.id))].slice(0, 2);
    if (scorerId) box(scorerId).g++;
    for (const a of assists) box(a).a++;
    for (const p of S.players) if (!p.goalie) box(p.id).pm += p.team === team ? 1 : -1;
    const strength = skaters(team).length > skaters(other(team)).length ? 'PP' : skaters(team).length < skaters(other(team)).length ? 'SH' : 'EV';
    emit('GOAL', { by: scorerId, assists, team, strength, src: lastShot && lastShot.t > S.t - 3 ? (lastShot.rebound ? 'rebound' : lastShot.breakaway ? 'breakaway' : lastShot.shotType + ':' + Math.round(lastShot.d)) : 'loose' });
    const net = netOf(team); Object.assign(P, { x: net.x + T[team].dir * 1.5, y: MIDY, vx: 0, vy: 0, z: 0, owner: null });
    if (strength === 'PP') { const t = T[other(team)]; t.box.sort((a, b) => a.until - b.until); const out = t.box.shift(); if (out) { emit('POWER_PLAY_END', { team }); } }
    S.phase = 'GOAL'; phaseT = 3.2; S.pendingDot = { x: CENTER, y: MIDY }; S.pass = null;
    if (S.period >= 4) { S.phase = 'FINAL_PENDING'; phaseT = 3.2; }
  }

  // ---------- penalties ----------
  function maybePenalty(offender, base) {
    if (rng.next() > base * (1.5 - offender.R.discipline)) return false;
    const minutes = 2, t = T[offender.team];
    t.box.push({ rec: offender, until: S.elapsed + minutes * 60 });
    box(offender.id).pim += minutes;
    emit('PENALTY', { on: offender.id, team: offender.team, minutes, infraction: INFRACTIONS[Math.floor(rng.next() * INFRACTIONS.length)] });
    emit('POWER_PLAY', { team: other(offender.team) });
    stoppage(dotNear(goalX(-T[offender.team].dir), P.y), 2.0); // faceoff in the offending team's zone
    return true;
  }

  // ---------- AI ----------
  function threatOf(att) { const n = ownNet(other(att.team)); return -Math.hypot(att.x - n.x, att.y - n.y); }
  function laneRisk(a, b, opp) {
    let risk = 0;
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    for (const q of opp) {
      const t = clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / L2, 0, 1);
      const d = Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y);
      if (t > 0.08 && d < 6) risk += (6 - d) / 6 * (0.5 + 0.6 * q.R.stick);
    }
    return risk;
  }
  function carrierDecide(c) {
    const side = c.team, opp = skaters(other(side)), mates = skaters(side).filter(p => p !== c);
    const u = uOf(side, c.x), net = netOf(side), dNet = Math.hypot(net.x - c.x, net.y - c.y);
    let nearest = Infinity; for (const q of opp) nearest = Math.min(nearest, Math.hypot(q.x - c.x, q.y - c.y));
    const pressure = clamp(1 - (nearest - 3) / 14, 0, 1);
    // breakaway: no skater of the other team between the carrier and the net
    const towardNet = ((net.x - c.x) * c.vx + (net.y - c.y) * c.vy) / Math.max(1, dNet);
    if (u > -5 && u < GOAL_U - 14 && towardNet > 14 && nearest > 14 && !T[side].breakaway && opp.every(q => uOf(side, q.x) < u - 6)) { T[side].breakaway = true; emit('BREAKAWAY', { by: c.id, team: side }); }
    // shooting
    if (u > BLUE_U - 2 && S.t > c.cd) {
      const angle = Math.abs(Math.atan2(c.y - MIDY, Math.abs(net.x - c.x)));
      const q = (dNet < 15 ? 1 : dNet < 30 ? 0.75 : dNet < 50 ? 0.4 : 0.15) * (angle > 1.15 ? 0.25 : 1) * (0.7 + 0.5 * c.R.offIQ);
      const want = q * (0.30 + 0.35 * pressure) + (T[side].breakaway && dNet < 22 ? 0.6 : 0);
      if (rng.next() < want * 0.07) { shoot(c, S.t - (c.gotAt || 0) < 0.35 && touches.length > 1); return; }
    }
    // passing
    let best = null;
    for (const m of mates) {
      const tt = Math.hypot(m.x - c.x, m.y - c.y) / (55 + 20 * c.R.pass), lead = { x: m.x + m.vx * tt, y: m.y + m.vy * tt }, mu = uOf(side, lead.x);
      let open = Infinity; for (const q of opp) open = Math.min(open, Math.hypot(q.x - lead.x, q.y - lead.y));
      const risk = laneRisk(c, lead, opp), dd = Math.hypot(lead.x - c.x, lead.y - c.y);
      if (dd < 10 || dd > 95) continue;
      const mNet = Math.hypot(net.x - lead.x, net.y - lead.y);
      let val = (mu - u) * 0.05 + Math.min(open, 20) * 0.06 - risk * 2.2 - dd * 0.004 + (mu > BLUE_U && mNet < 30 ? 0.9 - mNet / 40 : 0) + (S.powerPlay === side ? 0.15 : 0);
      if (u < -BLUE_U && mu > u) val += 0.3; // breakout
      val *= 0.8 + 0.4 * c.R.vision;
      if (!best || val > best.val) best = { m, lead, val, dd, risk };
    }
    const carryVal = (1 - pressure) * 0.65 + (u < BLUE_U ? 0.15 : 0) - (dNet < 25 ? 0.2 : 0);
    if (best && best.val > carryVal && rng.next() < 0.12 + 0.4 * pressure) { pass(c, best, passKind(c, best, u, uOf(side, best.lead.x), pressure, opp)); return; }
    // drop pass: leave the puck for a trailing teammate when a forechecker closes in
    if (pressure > 0.3 && rng.next() < 0.035) {
      let dm = null;
      for (const m of mates) {
        const dd = Math.hypot(m.x - c.x, m.y - c.y); if (dd < 5 || dd > 24 || uOf(side, m.x) > u - 1.5) continue;
        let open = Infinity; for (const q of opp) open = Math.min(open, Math.hypot(q.x - m.x, q.y - m.y));
        if (open > 6 && (!dm || open > dm.open)) dm = { m, lead: { x: m.x, y: m.y }, dd, open, risk: 0 };
      }
      if (dm) { pass(c, dm, 'drop'); return; }
    }
    // dump-in at the red line when the blue line is stacked; clear under heavy pressure in own zone
    const stacked = opp.filter(q => { const qu = uOf(side, q.x); return qu > u && qu < BLUE_U + 8 && Math.abs(q.y - c.y) < 22; }).length;
    if (u > 2 && u < BLUE_U - 4 && stacked >= 2 && pressure > 0.4 && rng.next() < 0.5) {
      const tgt = { x: xOf(side, GOAL_U - 2), y: c.y < MIDY ? 6 : RINK.W - 6 }, a = Math.atan2(tgt.y - c.y, tgt.x - c.x);
      release(c, Math.cos(a) * 62, Math.sin(a) * 62, 'dump'); P.dump = side; return;
    }
    if (u < -BLUE_U && pressure > 0.8 && rng.next() < 0.2) {
      const a = Math.atan2((c.y < MIDY ? 3 : RINK.W - 3) - c.y, T[side].dir * 40);
      release(c, Math.cos(a) * 46, Math.sin(a) * 46, 'clear'); return;
    }
  }
  // Bank pass geometry: aim at the point of the long boards from which the (restitution 0.55) rebound reaches the target.
  function bankPoint(c, lead) {
    const E = 0.55, wy = c.y < MIDY ? 0.6 : RINK.W - 0.6, d0 = Math.abs(c.y - wy), d1 = Math.abs(lead.y - wy);
    if (d0 < 1 || d1 < 1 || (c.y < MIDY) !== (lead.y < MIDY)) return null; // both on the same side of the boards
    const hx = c.x + (lead.x - c.x) * d0 / (d0 + d1 / E);
    if (hx < RINK.cornerR + 2 || hx > RINK.L - RINK.cornerR - 2) return null;
    return { x: hx, y: wy };
  }
  function passKind(c, b, u, mu, pressure, opp) {
    const dy = Math.abs(b.lead.y - c.y);
    if (b.dd > 58 && mu - u > 38 && u < BLUE_U) return 'stretch';
    const nearWall = Math.min(c.y, RINK.W - c.y) < 15;
    if (nearWall && b.dd > 18 && b.dd < 75 && (b.risk > 0.12 || u < -BLUE_U + 10) && rng.next() < 0.3) {
      const bp = bankPoint(c, b.lead);
      if (bp && laneRisk(c, bp, opp) < 0.25) { b.bank = bp; return 'bank'; }
    }
    if (b.risk > 0.12 && b.dd > 20 && b.dd < 62 && rng.next() < 0.55) return 'saucer';
    if (dy > 26 && b.dd > 28) return 'cross';
    return 'short';
  }
  function pass(c, b, kind = 'short') {
    const dx0 = b.lead.x - c.x, dy0 = b.lead.y - c.y, d = Math.hypot(dx0, dy0);
    let tx = b.lead.x, ty = b.lead.y, spd, accM = 1, vz = 0;
    switch (kind) {
      case 'cross': spd = clamp(46 + d * 0.5 + 22 * c.R.pass, 50, 96); accM = 1.35; break;
      case 'stretch': spd = clamp(64 + d * 0.3 + 18 * c.R.pass, 72, 104); accM = 1.8; break;
      case 'drop': spd = clamp(d * 1.2 + 8, 14, 30); accM = 0.45; break;
      case 'saucer': { spd = clamp(36 + d * 0.3 + 12 * c.R.pass, 40, 62); accM = 1.5; const T = d / (spd * 0.88); vz = 16 * T; break; }
      case 'bank': { spd = clamp(52 + d * 0.5 + 20 * c.R.pass, 56, 98); accM = 1.1; tx = b.bank.x; ty = b.bank.y; break; }
      default: spd = clamp(38 + d * 0.45 + 22 * c.R.pass, 40, 92);
    }
    const err = (rng.next() - 0.5) * (0.16 - 0.13 * c.R.pass) * (1 + b.risk) * accM;
    const a = Math.atan2(ty - c.y, tx - c.x) + err;
    release(c, Math.cos(a) * spd, Math.sin(a) * spd, kind === 'drop' ? 'drop' : 'pass');
    if (vz) { P.z = 0.3; P.vz = vz; }
    P.spin = kind === 'saucer' ? 38 : 10 + 6 * c.R.pass;
    S.pass = { targetId: b.m.id, from: c.id, team: c.team, t: S.t, kind };
    emit('PASS', { from: c.id, to: b.m.id, team: c.team, kind, stretch: kind === 'stretch', cross: kind === 'cross', air: kind === 'saucer', dist: Math.round(d) });
    c.cd = S.t + (kind === 'drop' ? 0.3 : 0.45);
  }

  function setTarget(p, x, y, urgency = 0.8) { const c = clampInside(x, y, 2); p.tx = c.x; p.ty = c.y; p.want = urgency; }
  function offenseRoles(side, carrier) {
    const sk = skaters(side).filter(p => p !== carrier), dir = T[side].dir;
    const pu = uOf(side, P.x), py = P.y;
    const spots = [];
    if (pu > BLUE_U - 3) {
      // C = support centre (low slot); strong-side winger works the half-wall, weak-side winger hits the back-door scoring lane
      const strong = (py < MIDY) === (dir > 0) ? 'LW' : 'RW', weak = strong === 'LW' ? 'RW' : 'LW', side = py < MIDY ? -1 : 1;
      spots.push({ u: GOAL_U - 24, y: MIDY + (py < MIDY ? 8 : -8), tag: 'slot', want: ['C', weak, strong] });
      spots.push({ u: clamp(pu - 6, BLUE_U + 8, GOAL_U - 6), y: py < MIDY ? Math.min(py + 14, MIDY - 4) : Math.max(py - 14, MIDY + 4), tag: 'half-wall', want: [strong, weak, 'C'] });
      spots.push({ u: GOAL_U - 7, y: MIDY - side * (3 + rng.next() * 2.5), tag: 'lane', want: [weak, strong, 'C'] });
      spots.push({ u: BLUE_U + 2, y: MIDY - dir * 15, tag: 'point', want: ['LD'] });
      spots.push({ u: BLUE_U + 2, y: MIDY + dir * 15, tag: 'point', want: ['RD'] });
    } else {
      const lim = BLUE_U - 2; // stay onside until the puck enters
      spots.push({ u: Math.min(pu + 22, lim), y: MIDY - dir * 30, tag: 'wide', want: ['LW'] });
      spots.push({ u: Math.min(pu + 22, lim), y: MIDY + dir * 30, tag: 'wide', want: ['RW'] });
      spots.push({ u: Math.min(pu + 10, lim), y: MIDY + (py < MIDY ? 8 : -8), tag: 'support', want: ['C'] });
      spots.push({ u: pu - 16, y: MIDY - dir * 12, tag: 'trail', want: ['LD'] });
      spots.push({ u: pu - 18, y: MIDY + dir * 12, tag: 'trail', want: ['RD'] });
    }
    const free = [...sk];
    for (const sp of spots) {
      if (!free.length) break;
      let pick = free.find(p => sp.want[0] === p.slot) || free.find(p => sp.want.includes(p.slot)) || free.reduce((a, b) => (Math.hypot(xOf(side, sp.u) - a.x, sp.y - a.y) < Math.hypot(xOf(side, sp.u) - b.x, sp.y - b.y) ? a : b));
      free.splice(free.indexOf(pick), 1);
      pick.role = sp.tag; setTarget(pick, xOf(side, sp.u), sp.y, sp.tag === 'net-front' || sp.tag === 'wide' ? 0.95 : 0.8);
    }
    if (carrier) {
      // carry toward the net, drifting away from the nearest defender
      const opp = skaters(other(side)); let rx = 0, ry = 0;
      for (const q of opp) { const d = Math.hypot(q.x - carrier.x, q.y - carrier.y); if (d < 14 && d > 0.1) { rx += (carrier.x - q.x) / d * (14 - d); ry += (carrier.y - q.y) / d * (14 - d); } }
      const cu = uOf(side, carrier.x), goalU = cu > BLUE_U ? GOAL_U - 14 : cu + 25;
      const ty = cu > BLUE_U ? MIDY + (carrier.y - MIDY) * 0.6 : carrier.y + (MIDY - carrier.y) * 0.15;
      carrier.role = 'carrier'; setTarget(carrier, xOf(side, goalU) + rx * 0.6, ty + ry * 0.9, 1);
    }
  }
  function defenseRoles(side, carrierOrPuck) {
    const sk = skaters(side), att = skaters(other(side)), own = ownNet(side);
    if (!sk.length) return;
    // F1: closest skater pressures the puck (goal-side approach)
    const target = carrierOrPuck;
    let f1 = sk.reduce((a, b) => (Math.hypot(a.x - target.x, a.y - target.y) < Math.hypot(b.x - target.x, b.y - target.y) ? a : b));
    const gx = target.x + (own.x - target.x) * 0.12, gy = target.y + (own.y - target.y) * 0.12;
    const puckU = uOf(side, target.x), tSpd = Math.hypot(target.vx || 0, target.vy || 0);
    const closing = ((own.x - target.x) * (target.vx || 0) + (own.y - target.y) * (target.vy || 0)) > 0;
    if (f1.slot.endsWith('D') && closing && tSpd > 9 && puckU < 30 && Math.hypot(target.x - f1.x, target.y - f1.y) > 9) {
      // gap control: stay between the carrier and the net, backing up at the carrier's pace; better D keep the gap tighter
      const dn = Math.hypot(own.x - target.x, own.y - target.y) || 1, gapD = clamp(8 + 12 * (1 - f1.R.gap) + tSpd * 0.22, 7, 22);
      f1.role = 'gap'; setTarget(f1, target.x + (own.x - target.x) / dn * gapD, target.y + (own.y - target.y) / dn * gapD, 0.9);
    } else { f1.role = 'pressure'; setTarget(f1, gx + (target.vx || 0) * 0.25, gy + (target.vy || 0) * 0.25, 1); }
    // others: mark the most dangerous attackers goal-side, D men first; leftover protects the slot
    const marks = att.filter(a => a.id !== P.owner).sort((a, b) => threatOf(b) - threatOf(a));
    const rest = sk.filter(p => p !== f1).sort((a, b) => (a.slot.endsWith('D') ? 0 : 1) - (b.slot.endsWith('D') ? 0 : 1));
    let checkers = 0;
    for (const p of rest) {
      if (puckU > BLUE_U - 4 && P.owner) { // forecheck: first winger pressures the second lane, the other cuts the boards; D hold the blue line
        if ((p.slot === 'LW' || p.slot === 'RW') && checkers < 2) { checkers++; p.role = 'forecheck'; setTarget(p, target.x + (own.x - target.x) * 0.05 - T[side].dir * 3, target.y + (checkers === 1 ? -1 : 1) * 12 * Math.sign(target.y - MIDY || 1), 0.95); continue; }
        if (p.slot.endsWith('D')) { p.role = 'gap'; setTarget(p, xOf(side, BLUE_U + 1), MIDY + (target.y - MIDY) * (p.slot === 'LD' ? 0.5 : 0.35) + (p.slot === 'LD' ? -1 : 1) * 10 * T[side].dir, 0.8); continue; }
      }
      if (p.slot === 'C' && puckU < -8) { p.role = 'low-slot'; setTarget(p, own.x + T[side].dir * 16, MIDY + (target.y - MIDY) * 0.3, 0.85); continue; }
      const a = marks.shift();
      if (!a) { p.role = 'slot'; setTarget(p, own.x + T[side].dir * 14, MIDY, 0.8); continue; }
      // goal-side position, shaded into the passing lane from the puck
      const k = 0.3 + 0.2 * p.R.defIQ;
      let x = a.x + (own.x - a.x) * 0.22, y = a.y + (own.y - a.y) * 0.22;
      x = x * (1 - k * 0.4) + (target.x * 0.5 + a.x * 0.5) * k * 0.4; y = y * (1 - k * 0.4) + (target.y * 0.5 + a.y * 0.5) * k * 0.4;
      const behind = uOf(side, a.x) < uOf(side, p.x) - 8; // attacker got behind me → backcheck hard
      p.role = behind ? 'backcheck' : 'mark'; setTarget(p, x, y, behind ? 1 : 0.75);
    }
  }
  function loosePuckRoles() {
    for (const side of ['home', 'away']) {
      const sk = skaters(side); if (!sk.length) continue;
      const eta = p => Math.hypot(p.x - P.x, p.y - P.y) / (20 + 12 * p.R.speed);
      const sorted = [...sk].sort((a, b) => eta(a) - eta(b));
      const chaser = sorted[0];
      const lead = Math.min(1, eta(chaser));
      if (!(S.pass && S.pass.team === side)) { chaser.role = 'chase'; setTarget(chaser, P.x + P.vx * lead * 0.8, P.y + P.vy * lead * 0.8, 1); }
      else { const r = roster[S.pass.targetId]; if (r && r.team === side) { r.role = 'receive'; setTarget(r, P.x + P.vx * 0.4, P.y + P.vy * 0.4, 1); } }
      // the rest keep a sensible shape relative to who is more likely to win the puck
      const mine = S.possession === side;
      const others = sorted.slice(1).filter(p => p.role !== 'receive');
      if (mine) offenseRoles(side, null); else defenseRoles(side, { x: P.x, y: P.y, vx: P.vx, vy: P.vy });
      if (!(S.pass && S.pass.team === side)) { chaser.role = 'chase'; setTarget(chaser, P.x + P.vx * lead * 0.8, P.y + P.vy * lead * 0.8, 1); }
      void others;
    }
  }
  function goalieMove(side) {
    const g = T[side].goalie, net = ownNet(side), dir = T[side].dir;
    const a = clamp(Math.atan2(P.y - net.y, (P.x - net.x) * dir), -1.35, 1.35);
    const dPuck = Math.hypot(P.x - net.x, P.y - net.y), depth = clamp(dPuck * 0.08, 1.5, 4.5) * (0.8 + 0.4 * g.R.positioning);
    g.tx = net.x + Math.cos(a) * depth * dir; g.ty = net.y + Math.sin(a) * depth; g.want = 1;
    if (lastShot && !lastShot.resolved && !lastShot.miss && lastShot.team !== side && g.stateUntil > S.t && g.state !== 'READY') { g.ty = clamp(lastShot.ypred, MIDY - 5.5, MIDY + 5.5); g.tx = net.x + dir * 1.2; }
    else if (g.state === 'RECOVER') { g.tx = net.x + dir * 1.8; g.ty = MIDY + (P.y - MIDY) * 0.25; }
    else if (g.state === 'BUTTERFLY') g.tx = net.x + dir * Math.min(depth, 1.8);
    // cover a slow loose puck in the crease
    if (!P.owner && S.phase === 'PLAY' && Math.hypot(P.x - g.x, P.y - g.y) < 2.4 && Math.hypot(P.vx, P.vy) < 9 && (!lastShot || lastShot.resolved) && !S.players.some(q => q.team !== side && !q.goalie && Math.hypot(q.x - P.x, q.y - P.y) < 5) && rng.next() < 0.25) {
      emit('SAVE', { goalie: g.id, shooter: null, team: other(side), big: false, rebound: false, cover: true, save: 'BUTTERFLY' });
      stoppage(dotNear(net.x, P.y), 1.6);
    }
  }
  function physical() {
    const c = P.owner ? roster[P.owner] : null; if (!c) return;
    for (const d of skaters(other(c.team))) {
      if (S.t < d.cd || d.stun > 0) continue;
      const dd = Math.hypot(d.x - c.x, d.y - c.y);
      if (dd < 3.6) {
        const rel = Math.hypot(d.vx - c.vx, d.vy - c.vy);
        if (rel > 7 && rng.next() < 0.06 + 0.24 * d.R.body) {
          d.cd = S.t + 1.6; const big = rel > 17 || d.R.body > 0.85;
          box(d.id).hit++; emit('HIT', { by: d.id, on: c.id, team: d.team, big });
          if (maybePenalty(d, 0.035)) return;
          c.stun = big ? 0.8 : 0.45; c.vx *= 0.3; c.vy *= 0.3;
          if (rng.next() < (big ? 0.75 : 0.5) - 0.3 * c.R.balance) { release(c, (rng.next() - 0.5) * 16, (rng.next() - 0.5) * 16, 'loose'); P.noPick = { id: c.id, until: S.t + 0.5 }; }
          return;
        }
      }
      if (dd < 5.8) {
        d.cd = S.t + 1.1;
        const pr = clamp(0.03 + 0.12 * (d.R.stick - c.R.handling * 0.8 - c.R.deke * 0.2 + 0.2), 0.015, 0.12);
        if (rng.next() < pr) {
          box(d.id).tk++; emit('TAKEAWAY', { by: d.id, from: c.id, team: d.team }); emit('TURNOVER', { by: d.id, team: d.team, from: c.id, cause: 'takeaway' }); lastTakeawayT = S.t;
          release(c, (d.x - c.x) * 2, (d.y - c.y) * 2, 'loose'); P.noPick = { id: c.id, until: S.t + 0.4 };
          return;
        }
        if (maybePenalty(d, 0.006)) return;
      }
    }
  }

  // ---------- movement ----------
  // Skating model: the body has a heading (`facing`) that turns at a limited rate (slower when fast). Thrust acts along the
  // heading (accelerate / coast / brake, slower backwards); sideways velocity is only killed by edge grip. Skate states:
  // idle · accel · coast · brake · turn · backward · crossover · stunned (read by the renderer).
  function move(p) {
    p.px = p.x; p.py = p.y;
    if (p.stun > 0) p.stun -= DT;
    if (p.goalie) return moveGoalie(p);
    const R = p.R, carrier = P.owner === p.id;
    const top = (22 + 11 * R.speed) * (0.78 + 0.22 * p.energy) * (p.stun > 0 ? 0.4 : 1) * (carrier ? 0.93 : 1) * (p.wind ? 0.55 : 1);
    const acc = 13 + 13 * R.accel;
    const sp0 = Math.hypot(p.vx, p.vy);
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    // backward skating: defenders retreating / holding the gap keep their eyes on the play
    const toPuck = Math.atan2(P.y - p.y, P.x - p.x);
    const defending = S.possession !== p.team || !P.owner;
    let back = false, desired = p.facing;
    if (d > 1.2) {
      const wang = Math.atan2(dy, dx);
      back = defending && (p.role === 'gap' || p.role === 'mark' || p.role === 'slot' || p.role === 'low-slot' || p.role === 'retreat') && Math.abs(angDiff(wang, toPuck)) > 1.9 && Math.hypot(P.x - p.x, P.y - p.y) < 70;
      desired = back ? toPuck : wang;
    } else desired = sp0 > 4 ? Math.atan2(p.vy, p.vx) : toPuck;
    // turn (rate limited by agility and speed)
    p.turnRate = Math.min(11, (4.5 + 7 * R.agility) / (1 + sp0 / 22));
    const dTurn = angDiff(desired, p.facing), maxT = p.turnRate * DT, turned = clamp(dTurn, -maxT, maxT);
    p.facing += turned;
    if (p.facing > Math.PI) p.facing -= 2 * Math.PI; else if (p.facing < -Math.PI) p.facing += 2 * Math.PI;
    // desired velocity (speed cap lower when skating backward)
    const cap = (back ? 0.62 : 1) * top;
    const want = Math.min(cap * (p.want || 0.8), d * 2.6);
    const wx = d > 0.01 ? dx / d * want : 0, wy = d > 0.01 ? dy / d * want : 0;
    // body-frame decomposition
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
    const vf = p.vx * fx + p.vy * fy, vl = -p.vx * fy + p.vy * fx;
    const wf = wx * fx + wy * fy, wl = -wx * fy + wy * fx;
    const ef = wf - vf, el = wl - vl;
    const accF = ef > 0 ? (vf < 0 || back ? acc * 0.6 : acc) : acc * (wf < vf - 6 ? 1.7 : 1.0), grip = acc * (1.0 + 0.8 * R.agility);
    const kf = Math.abs(ef) > accF * DT ? accF * DT / Math.abs(ef) : 1, kl = Math.abs(el) > grip * DT ? grip * DT / Math.abs(el) : 1;
    const nvf = vf + ef * kf, nvl = vl + el * kl;
    const ovx = p.vx, ovy = p.vy;
    p.vx = nvf * fx - nvl * fy; p.vy = nvf * fy + nvl * fx;
    p.ax = (p.vx - ovx) / DT; p.ay = (p.vy - ovy) / DT;
    p.x += p.vx * DT; p.y += p.vy * DT;
    const c = clampInside(p.x, p.y, 1.6); if (c.x !== p.x || c.y !== p.y) { p.x = c.x; p.y = c.y; p.vx *= 0.5; p.vy *= 0.5; }
    const sp = Math.hypot(p.vx, p.vy);
    p.dirv = sp > 0.5 ? Math.atan2(p.vy, p.vx) : p.dirv;
    p.back = back && sp > 1.5;
    // crossovers: a short stride animation while carving a turn at speed
    if (Math.abs(dTurn) > 0.3 && sp > 9 && !back) { p.crossT = 0.4; p.crossDir = Math.sign(dTurn); } else if (p.crossT > 0) p.crossT -= DT;
    p.cross = p.crossT > 0;
    const accelerating = ef > 1.5 && accF > 0, braking = ef < -4 && wf < vf - 6;
    p.skate = p.stun > 0 ? 'stunned' : p.back ? 'backward' : sp < 1.2 && want < 2 ? 'idle' : p.cross ? 'crossover' : braking ? 'brake' : Math.abs(dTurn) > 0.2 && sp > 5 ? 'turn' : accelerating ? 'accel' : 'coast';
    const f = sp / Math.max(1, top);
    const rest = p.skate === 'coast' || p.skate === 'idle';
    p.energy = clamp(p.energy - (0.004 + 0.014 * f * f - (rest ? 0.006 : 0)) * DT * (1.4 - 0.6 * R.stamina), 0.2, 1);
  }
  // Goalies: lateral shuffle / butterfly slide inside the crease area; always face the puck.
  function moveGoalie(p) {
    const R = p.R, st = p.state;
    const boost = st === 'SLIDE' ? 1.9 : st === 'RECOVER' ? 1.25 : 1;
    const top = (12 + 10 * R.lateral) * boost * (st === 'BUTTERFLY' || st === 'PAD_SAVE' ? 0.35 : 1), acc = 30 * boost;
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    const want = Math.min(top * (p.want || 0.8), d * 2.6);
    const dvx = (d > 0.01 ? dx / d * want : 0) - p.vx, dvy = (d > 0.01 ? dy / d * want : 0) - p.vy;
    const dv = Math.hypot(dvx, dvy), lim = acc * DT, k = dv > lim ? lim / dv : 1;
    p.vx += dvx * k; p.vy += dvy * k; p.x += p.vx * DT; p.y += p.vy * DT;
    const c = clampInside(p.x, p.y, 1.6); if (c.x !== p.x || c.y !== p.y) { p.x = c.x; p.y = c.y; p.vx *= 0.5; p.vy *= 0.5; }
    const tgt = Math.atan2(P.y - p.y, P.x - p.x); p.facing += clamp(angDiff(tgt, p.facing), -9 * DT, 9 * DT);
    p.skate = Math.hypot(p.vx, p.vy) > 2 ? 'shuffle' : 'idle';
  }
  function separate() {
    const L = S.players;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 2.6) { const push = (2.6 - d) / 2, nx = dx / d, ny = dy / d; if (!a.goalie) { a.x -= nx * push; a.y -= ny * push; } if (!b.goalie) { b.x += nx * push; b.y += ny * push; } }
    }
  }

  // ---------- bookkeeping ----------
  function zoneEntryCheck() {
    for (const side of ['home', 'away']) {
      const inZone = uOf(side, P.x) > BLUE_U;
      if (S.possession === side && inZone && !T[side].entered) {
        T[side].entered = true;
        if (P.owner && roster[P.owner].team === side) emit('ZONE_ENTRY', { by: P.owner, team: side, carried: true });
        else if (P.dump === side) { emit('ZONE_ENTRY', { by: P.release?.id || P.lastTouch?.id, team: side, carried: false }); P.dump = null; }
      }
      if (uOf(side, P.x) < BLUE_U - 6 && T[side].entered) T[side].entered = false;
    }
  }
  let bookTick = 0;
  const rosterList = Object.values(roster);
  function shiftsAndPenalties() {
    const slow = ++bookTick % 15 === 0, bdt = DT * 15; // TOI / bench recovery every 0.5 s
    for (const side of ['home', 'away']) {
      const t = T[side]; t.fShift += DT; t.dShift += DT;
      if (slow) { for (const p of skaters(side)) box(p.id).toi += bdt; box(t.goalie.id).toi += bdt; }
      if (t.box.length && t.box.some(b => b.until <= S.elapsed)) {
        t.box = t.box.filter(b => b.until > S.elapsed);
        emit('POWER_PLAY_END', { team: other(side) }); setOnIce(true);
      }
      // change on the fly when tired and the puck is not in our defensive zone
      const pu = uOf(side, P.x);
      if ((t.fShift > 52 || t.dShift > 64) && pu > -BLUE_U + 5 && (S.possession === side || pu > 0)) { changeLines(side, false); setOnIce(true); }
    }
    if (slow) for (const r of rosterList) if (r.onBench) r.energy = Math.min(1, r.energy + 0.02 * bdt);
  }
  function endOfPeriod() {
    emit('PERIOD_END', { period: S.period });
    const tied = S.score.home === S.score.away;
    if (S.period >= 3 && (!tied || S.period >= 4)) {
      if (tied) { // shootout decided by shooters vs goalies
        const sh = side => { const shooters = T[side].lines.slice(0, 3).map(l => l.C); return shooters.reduce((a, p) => a + (rng.next() < 0.26 + 0.18 * (p.R.wristA + p.R.deke) / 2 - 0.12 * T[other(side)].goalie.R.breakaway ? 1 : 0), 0); };
        let h = 0, a = 0, guard = 0; do { h = sh('home'); a = sh('away'); } while (h === a && ++guard < 20);
        const w = h >= a ? 'home' : 'away'; S.score[w]++; S.shootout = { home: h, away: a, winner: w };
        emit('SHOOTOUT', { winner: w, home: h, away: a });
      }
      finish(); return;
    }
    S.phase = 'INTERMISSION'; phaseT = 2.5;
  }
  function finish() { S.phase = 'FINAL'; S.over = true; S.clock = 0; emit('FINAL', { score: { ...S.score } }); }
  function startPeriod() {
    S.period++;
    S.clock = S.period >= 4 ? otLength : periodLength;
    T.home.dir *= -1; T.away.dir *= -1; S.attack = { home: T.home.dir, away: T.away.dir };
    for (const side of ['home', 'away']) { T[side].line = 0; T[side].pair = 0; T[side].fShift = 0; T[side].dShift = 0; }
    emit('PERIOD_START', { period: S.period });
    setFaceoff({ x: CENTER, y: MIDY });
  }

  // ---------- one fixed step ----------
  function step() {
    S.t += DT;
    if (S.over) return;
    if (S.phase === 'FACEOFF') {
      phaseT -= DT;
      for (const p of S.players) { p.tx = p.x; p.ty = p.y; p.vx = 0; p.vy = 0; p.px = p.x; p.py = p.y; }
      if (phaseT <= 0) resolveFaceoff();
      return;
    }
    if (S.phase === 'STOPPAGE' || S.phase === 'GOAL' || S.phase === 'INTERMISSION' || S.phase === 'FINAL_PENDING') {
      phaseT -= DT;
      for (const p of S.players) { p.want = 0.35; if (S.phase === 'GOAL') { const n = netOf(S.possession || 'home'); if (p.team === S.possession && !p.goalie) { p.tx = n.x - T[p.team].dir * 18; p.ty = MIDY + (p.y - MIDY) * 0.3; } } move(p); }
      puckStep();
      if (phaseT <= 0) {
        if (S.phase === 'FINAL_PENDING') { finish(); return; }
        if (S.phase === 'INTERMISSION') { startPeriod(); return; }
        setFaceoff(S.pendingDot || { x: CENTER, y: MIDY });
      }
      return;
    }
    // PLAY
    S.clock -= DT; S.elapsed += DT;
    if (++aiTick % 3 === 0) {
      const c = P.owner ? roster[P.owner] : null;
      if (c) {
        offenseRoles(c.team, c);
        defenseRoles(other(c.team), c);
        if (S.t > c.cd && c.stun <= 0) carrierDecide(c);
      } else loosePuckRoles();
      goalieMove('home'); goalieMove('away');
      if (S.phase !== 'PLAY') return;
    }
    for (const p of S.players) move(p);
    separate();
    puckStep();
    if (S.phase !== 'PLAY') return;
    windups();
    if (S.phase !== 'PLAY') return;
    goalieFSM();
    goalieResolve();
    if (S.phase !== 'PLAY') return;
    tryPickups();
    physical();
    if (S.phase !== 'PLAY') return;
    zoneEntryCheck();
    shiftsAndPenalties();
    if (S.pass && S.t - S.pass.t > 2.5) S.pass = null;
    if (S.clock <= 0) { S.clock = 0; endOfPeriod(); }
  }

  setOnIce(false);
  emit('PERIOD_START', { period: 1 });
  setFaceoff({ x: CENTER, y: MIDY });

  return {
    state,
    get speed() { return S.speed; },
    setSpeed(v) { S.speed = clamp(+v || 1, 0.25, 32); },
    // Advance by real seconds (scaled by speed); returns interpolation alpha for the renderer.
    advance(dt) {
      if (S.over) return 1;
      acc += Math.min(0.25, dt) * S.speed;
      let n = 0;
      while (acc >= DT && n++ < 2000) { step(); acc -= DT; }
      return clamp(acc / DT, 0, 1);
    },
    step,
    // Headless simulation (Sim to end / tests). Keeps events (capped) and returns the final state.
    simulate(seconds = Infinity, { maxEvents = 4000 } = {}) {
      const steps = Math.min(4e6, seconds / DT);
      for (let i = 0; i < steps && !S.over; i++) { step(); if (S.events.length > maxEvents) S.events.splice(0, S.events.length - maxEvents); }
      return S;
    },
    cameraTarget: null,
    dispose() { S.events.length = 0; },
  };
}
