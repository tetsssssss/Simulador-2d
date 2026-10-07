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
    const mk = (p, slot) => { const r = skaterRecord(p, slot, side); Object.assign(r, { vx: 0, vy: 0, px: 0, py: 0, energy: 1, R: rate(p), stun: 0, cd: 0, role: '', tx: 0, ty: 0, want: 0 }); roster[r.id] = r; return r; };
    T[side] = {
      side, dir: side === 'home' ? 1 : -1,
      lines: L.lines.map(l => ({ C: mk(l.C, 'C'), LW: mk(l.LW, 'LW'), RW: mk(l.RW, 'RW') })),
      pairs: L.pairs.map(pr => ({ LD: mk(pr.LD, 'LD'), RD: mk(pr.RD, 'RD') })),
      goalie: mk(L.goalies[0], 'G'),
      line: 0, pair: 0, fShift: 0, dShift: 0, box: [], entered: false, breakaway: false,
    };
  }
  const state = {
    t: 0, players: [], puck: { x: CENTER, y: MIDY, z: 0, vx: 0, vy: 0, px: CENTER, py: MIDY, owner: null, lastTouch: null },
    home, away, attack: { home: 1, away: -1 }, possession: null, pass: null,
    period: 1, clock: periodLength, score: { home: 0, away: 0 }, shots: { home: 0, away: 0 }, strength: '', powerPlay: null,
    phase: 'FACEOFF', events: [], roster, box: {}, over: false, elapsed: 0, speed,
  };
  const S = state, P = state.puck;
  let acc = 0, phaseT = 1.4, faceoffDot = { x: CENTER, y: MIDY }, touches = [], lastShot = null, aiTick = 0;
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
    list = list.map(r => (inBox.has(r.id) ? substitute(side, r, inBox) : r));
    return [...list, t.goalie];
  }
  function substitute(side, r, inBox) {
    const t = T[side], used = new Set([...S.players.map(p => p.id)]);
    const pool = r.slot === 'LD' || r.slot === 'RD' ? t.pairs.flatMap(p => [p.LD, p.RD]) : t.lines.flatMap(l => [l.C, l.LW, l.RW]);
    return pool.find(x => !inBox.has(x.id) && !used.has(x.id) && x.id !== r.id) || r;
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
    Object.assign(P, { x: dot.x, y: dot.y, px: dot.x, py: dot.y, vx: 0, vy: 0, z: 0, owner: null, release: null, tried: new Set(), noPick: null });
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
      if (S.possession !== p.team) { T[p.team].entered = uOf(p.team, P.x) > BLUE_U; T[p.team].breakaway = false; }
      S.possession = p.team; P.owner = p.id; P.tried = new Set(); S.pass = null; p.gotAt = S.t; p.cd = Math.max(p.cd, S.t + 0.25);
    }
  }
  function release(p, vx, vy, kind) {
    P.owner = null; P.vx = vx; P.vy = vy; P.tried = new Set(); P.noPick = { id: p.id, until: S.t + 0.35 };
    P.release = { team: p.team, u: uOf(p.team, P.x), kind, id: p.id };
  }
  function tryPickups() {
    if (P.owner || P.z > 1.6) return;
    const ps = Math.hypot(P.vx, P.vy);
    let best = null;
    for (const p of S.players) {
      if (p.goalie || p.stun > 0 || (P.noPick && P.noPick.id === p.id && S.t < P.noPick.until)) continue;
      const d = Math.hypot(p.x - P.x, p.y - P.y);
      if (d > 2.6 || P.tried.has(p.id)) continue;
      P.tried.add(p.id);
      const rel = Math.hypot(P.vx - p.vx, P.vy - p.vy);
      const intended = S.pass && S.pass.targetId === p.id;
      const own = P.lastTouch && P.lastTouch.team === p.team;
      let pc = clamp(1.25 - rel / 110 + 0.35 * (p.R.handling - 0.6), 0.1, 0.98);
      if (!intended && ps > 25) pc *= own ? 0.7 : 0.08 + 0.22 * p.R.stick * (0.6 + 0.6 * p.R.defIQ);
      if (rng.next() < pc && (!best || d < best.d)) best = { p, d };
      else if (intended) { P.vx *= 0.3; P.vy *= 0.3; S.pass = null; }
    }
    if (!best) return;
    const p = best.p, wasPass = S.pass, lt = P.lastTouch;
    const afterSave = lastShot && lastShot.saved && S.t - lastShot.t < 2.5 && p.team === lastShot.team;
    touch(p, true);
    if (wasPass && wasPass.team !== p.team) { emit('INTERCEPTION', { by: p.id, team: p.team, from: wasPass.from }); box(p.id).tk++; }
    else if (afterSave) emit('REBOUND', { by: p.id, team: p.team });
    else if (lt && lt.team !== p.team && Math.hypot(P.vx, P.vy) < 30 && !wasPass) { /* loose puck recovery */ }
  }

  // ---------- puck physics ----------
  function puckStep() {
    P.px = P.x; P.py = P.y;
    const o = P.owner ? roster[P.owner] : null;
    if (o) {
      P.x = o.x + Math.cos(o.facing) * 2.2; P.y = o.y + Math.sin(o.facing) * 2.2; P.vx = o.vx; P.vy = o.vy; P.z = 0;
      const c = clampInside(P.x, P.y, 0.6); P.x = c.x; P.y = c.y;
      return;
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
      if (vn > 0) { P.vx -= 1.55 * vn * nx; P.vy -= 1.55 * vn * ny; }
      P.x = c.x; P.y = c.y;
    }
  }
  function checkIcingOrMiss(side) {
    // side = which net's goal line (-1 left, +1 right). Attacking team for that net:
    const att = T.home.dir === side ? 'home' : 'away';
    if (lastShot && !lastShot.resolved && lastShot.team === att) { lastShot.resolved = true; emit('MISS', { by: lastShot.by, team: att }); return; }
    const r = P.release;
    if (r && r.team === att && r.u < 0 && (r.kind === 'clear' || r.kind === 'dump' || (r.kind === 'pass' && r.u < -BLUE_U)) && skaters(att).length >= skaters(other(att)).length) {
      emit('ICING', { team: att, kind: r.kind, u: Math.round(r.u) });
      stoppage(dotNear(goalX(-T[att].dir), P.y), 1.4); // faceoff in the icing team's defensive zone
    }
  }

  // ---------- shots & goalies ----------
  function shoot(p, oneTimer = false) {
    const net = netOf(p.team), d = Math.hypot(net.x - p.x, net.y - p.y);
    const slap = !oneTimer && d > 38 && (p.slot === 'LD' || p.slot === 'RD' || p.R.slapP > 0.78) && rng.next() < 0.6;
    const back = !slap && d < 18 && rng.next() < 0.18;
    const shotType = oneTimer ? 'one-timer' : slap ? 'slap' : back ? 'backhand' : 'wrist';
    const power = slap ? p.R.slapP : p.R.wristP, accu = slap ? p.R.slapA : oneTimer ? (p.R.oneTimer + p.R.wristA) / 2 : p.R.wristA;
    const spd = (slap ? 95 + 45 * power : back ? 55 + 20 * power : 70 + 32 * power) * (0.9 + 0.2 * p.energy);
    const missP = clamp(0.36 - 0.28 * accu + d / 420, 0.08, 0.5);
    const miss = rng.next() < missP;
    const aimY = MIDY + (miss ? (rng.next() < 0.5 ? -1 : 1) * (POSTS + 0.6 + rng.next() * 4) : (rng.next() * 2 - 1) * (POSTS - 0.5));
    const ang = Math.atan2(aimY - p.y, net.x - p.x);
    release(p, Math.cos(ang) * spd, Math.sin(ang) * spd, 'shot');
    P.z = 0.3; P.vz = slap ? 6 : 3;
    const slot = d < 26 && Math.abs(p.y - MIDY) < 12;
    lastShot = { by: p.id, team: p.team, t: S.t, d, miss, oneTimer, power, accu, x0: p.x, y0: p.y, rebound: !!(lastShot && lastShot.saved && S.t - lastShot.t < 2.5), breakaway: T[p.team].breakaway, resolved: false, saved: false, shotType };
    emit('SHOT', { by: p.id, team: p.team, shotType, slot, dist: Math.round(d) });
    p.cd = S.t + 0.6;
    // blocks: a defender in the shooting lane, between the shooter and the net
    for (const q of skaters(other(p.team))) {
      const along = ((q.x - p.x) * Math.cos(ang) + (q.y - p.y) * Math.sin(ang)), lat = Math.abs(-(q.x - p.x) * Math.sin(ang) + (q.y - p.y) * Math.cos(ang));
      if (along > 3 && along < d - 4 && lat < 2.4 && rng.next() < 0.22 + 0.45 * q.R.block) {
        lastShot.resolved = true; box(q.id).blk++;
        emit('BLOCK', { by: q.id, shooter: p.id, team: q.team });
        P.x = q.x + Math.cos(ang) * 1.5; P.y = q.y + Math.sin(ang) * 1.5; const ka = ang + Math.PI + (rng.next() - 0.5) * 2.2, ks = 10 + rng.next() * 18;
        P.vx = Math.cos(ka) * ks; P.vy = Math.sin(ka) * ks; P.z = 0; P.vz = 0; P.tried = new Set(); P.noPick = { id: q.id, until: S.t + 0.25 };
        return;
      }
    }
  }
  function screened(side) { const net = netOf(side); return S.players.some(q => !q.goalie && Math.hypot(q.x - net.x, q.y - net.y) < 9 && Math.abs(q.y - MIDY) < 6); }
  function goalieResolve(force = false) {
    const s = lastShot; if (!s || s.resolved || s.miss) return;
    const defSide = other(s.team), g = T[defSide].goalie, net = netOf(s.team);
    if (!force && Math.hypot(P.x - g.x, P.y - g.y) > 3.5 && Math.hypot(P.x - net.x, P.y - net.y) > 4.5) return;
    s.resolved = true;
    let pg = s.d < 10 ? 0.16 : s.d < 20 ? 0.1 : s.d < 35 ? 0.05 : s.d < 55 ? 0.024 : 0.01;
    pg *= 0.65 + 0.35 * (s.accu + s.power);
    pg *= 1.5 - 0.95 * (0.55 * g.R.reflex + 0.3 * g.R.positioning + 0.15 * g.R.lateral);
    const lateral = Math.abs(s.y0 - g.y);
    if (s.rebound) pg *= 1.7; if (s.oneTimer) pg *= 1.25 + lateral / 60; if (s.breakaway) pg *= 1.45 - 0.4 * g.R.breakaway;
    if (screened(s.team)) pg *= 1.25 + 0.15 * (1 - g.R.screen);
    if (Math.abs(s.y0 - MIDY) > 30 && s.d < 25) pg *= 0.45; // bad angle
    pg = clamp(pg, 0.004, 0.6);
    S.shots[s.team]++; box(s.by).sog++; box(g.id).sa++;
    if (rng.next() < pg) { scoreGoal(s.team, s.by); return; }
    box(g.id).sv++;
    s.saved = true; s.t = S.t;
    const rebound = rng.next() < 0.8 - 0.3 * g.R.rebound;
    emit('SAVE', { goalie: g.id, shooter: s.by, team: s.team, big: pg > 0.17, rebound });
    if (rebound) {
      // most saves are steered to the corners; poor rebound control leaves it in the slot
      const toSlot = rng.next() < 0.45 - 0.35 * g.R.rebound;
      const dirOut = T[s.team].dir > 0 ? Math.PI : 0, ka = dirOut + (toSlot ? (rng.next() - 0.5) * 1.0 : (rng.next() < 0.5 ? -1 : 1) * (1.0 + rng.next() * 0.9)), ks = toSlot ? 12 + rng.next() * 16 : 22 + rng.next() * 22;
      Object.assign(P, { x: net.x - T[s.team].dir * 3.5, y: MIDY + (rng.next() - 0.5) * 4, vx: Math.cos(ka) * ks, vy: Math.sin(ka) * ks, z: 0, vz: 0, owner: null, tried: new Set(), noPick: null });
      S.pass = null;
    } else stoppage(dotNear(net.x, P.y), 1.8);
  }
  function looseGoal(side) {
    if (S.phase !== 'PLAY') return;
    const att = T.home.dir === side ? 'home' : 'away';
    const g = T[other(att)].goalie;
    if (Math.hypot(g.x - goalX(side), g.y - MIDY) < 5 && rng.next() < 0.93) { // goalie at home smothers the loose puck
      emit('SAVE', { goalie: g.id, shooter: null, team: att, big: false, rebound: false, cover: true });
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
      if (rng.next() < want * 0.075) { shoot(c, S.t - (c.gotAt || 0) < 0.35 && touches.length > 1); return; }
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
    if (best && best.val > carryVal && rng.next() < 0.12 + 0.4 * pressure) { pass(c, best); return; }
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
  function pass(c, b) {
    const dx = b.lead.x - c.x, dy = b.lead.y - c.y, d = Math.hypot(dx, dy);
    const spd = clamp(38 + d * 0.45 + 22 * c.R.pass, 40, 92);
    const err = (rng.next() - 0.5) * (0.16 - 0.13 * c.R.pass) * (1 + b.risk);
    const a = Math.atan2(dy, dx) + err;
    release(c, Math.cos(a) * spd, Math.sin(a) * spd, 'pass');
    S.pass = { targetId: b.m.id, from: c.id, team: c.team, t: S.t };
    const u0 = uOf(c.team, c.x), u1 = uOf(c.team, b.lead.x);
    emit('PASS', { from: c.id, to: b.m.id, team: c.team, stretch: d > 60 && u1 - u0 > 40, cross: Math.abs(dy) > 28 && u0 > BLUE_U });
    c.cd = S.t + 0.45;
  }

  function setTarget(p, x, y, urgency = 0.8) { const c = clampInside(x, y, 2); p.tx = c.x; p.ty = c.y; p.want = urgency; }
  function offenseRoles(side, carrier) {
    const sk = skaters(side).filter(p => p !== carrier), dir = T[side].dir;
    const pu = uOf(side, P.x), py = P.y;
    const spots = [];
    if (pu > BLUE_U - 3) {
      spots.push({ u: GOAL_U - 8, y: MIDY + (rng.next() - 0.5) * 3, tag: 'net-front', want: ['LW', 'RW', 'C'] });
      spots.push({ u: GOAL_U - 26, y: MIDY + (py < MIDY ? 9 : -9), tag: 'slot', want: ['C', 'RW', 'LW'] });
      spots.push({ u: clamp(pu - 6, BLUE_U + 8, GOAL_U - 6), y: py < MIDY ? Math.min(py + 14, MIDY - 4) : Math.max(py - 14, MIDY + 4), tag: 'half-wall', want: ['RW', 'LW', 'C'] });
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
    f1.role = 'pressure'; setTarget(f1, gx + (target.vx || 0) * 0.25, gy + (target.vy || 0) * 0.25, 1);
    // others: mark the most dangerous attackers goal-side, D men first; leftover protects the slot
    const marks = att.filter(a => a.id !== P.owner).sort((a, b) => threatOf(b) - threatOf(a));
    const rest = sk.filter(p => p !== f1).sort((a, b) => (a.slot.endsWith('D') ? 0 : 1) - (b.slot.endsWith('D') ? 0 : 1));
    for (const p of rest) {
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
    // cover a slow loose puck in the crease
    if (!P.owner && S.phase === 'PLAY' && Math.hypot(P.x - g.x, P.y - g.y) < 2.4 && Math.hypot(P.vx, P.vy) < 9 && (!lastShot || lastShot.resolved) && !S.players.some(q => q.team !== side && !q.goalie && Math.hypot(q.x - P.x, q.y - P.y) < 5) && rng.next() < 0.25) {
      emit('SAVE', { goalie: g.id, shooter: null, team: other(side), big: false, rebound: false, cover: true });
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
          box(d.id).tk++; emit('TAKEAWAY', { by: d.id, from: c.id, team: d.team });
          release(c, (d.x - c.x) * 2, (d.y - c.y) * 2, 'loose'); P.noPick = { id: c.id, until: S.t + 0.4 };
          return;
        }
        if (maybePenalty(d, 0.006)) return;
      }
    }
  }

  // ---------- movement ----------
  function move(p) {
    p.px = p.x; p.py = p.y;
    if (p.stun > 0) p.stun -= DT;
    const top = (p.goalie ? 12 + 10 * p.R.lateral : 22 + 11 * p.R.speed) * (0.78 + 0.22 * p.energy) * (p.stun > 0 ? 0.4 : 1) * (P.owner === p.id ? 0.93 : 1);
    const acc = p.goalie ? 30 : 13 + 13 * p.R.accel;
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    const want = Math.min(top * (p.want || 0.8), d * 2.6);
    const dvx = (d > 0.01 ? dx / d * want : 0) - p.vx, dvy = (d > 0.01 ? dy / d * want : 0) - p.vy;
    const dv = Math.hypot(dvx, dvy), lim = acc * DT;
    const k = dv > lim ? lim / dv : 1;
    p.vx += dvx * k; p.vy += dvy * k;
    p.x += p.vx * DT; p.y += p.vy * DT;
    const c = clampInside(p.x, p.y, 1.6); if (c.x !== p.x || c.y !== p.y) { p.x = c.x; p.y = c.y; p.vx *= 0.5; p.vy *= 0.5; }
    const sp = Math.hypot(p.vx, p.vy);
    if (P.owner === p.id && sp > 1) p.facing = Math.atan2(p.vy, p.vx);
    else if (sp > 4) p.facing = Math.atan2(p.vy, p.vx);
    else p.facing = Math.atan2(P.y - p.y, P.x - p.x);
    if (!p.goalie) {
      const f = sp / Math.max(1, top);
      p.energy = clamp(p.energy - (0.004 + 0.014 * f * f) * DT * (1.4 - 0.6 * p.R.stamina), 0.2, 1);
    }
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
