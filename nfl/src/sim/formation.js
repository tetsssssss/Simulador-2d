// FormationEngine + AssignmentSystem: personnel slots, alignment, play calls and explicit per-player assignments.
import { FIELD_W, MID_Y, clamp } from './geometry.js';
import { detailedPosition } from './attributes.js';

export const OFF_SLOTS = ['QB', 'RB', 'X', 'Z', 'SLOT', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'];
export const DEF_SLOTS = ['LDE', 'LDT', 'RDT', 'RDE', 'WILL', 'MIKE', 'SAM', 'CBL', 'CBR', 'FS', 'SS'];

// Route geometry: points are [downfield, inward] yards from the receiver's alignment.
// cont: keep running along the last segment; settle: stop at the last point and work to space.
// timing: yards into the route when the ball is on time (vertical routes have no break: their stem is the timing).
export const ROUTES = {
  GO: { pts: [[1.5, 0], [45, 0]], cont: true, timing: 18 },
  FADE: { pts: [[1.5, -0.8], [45, -3.5]], cont: true, timing: 18 },
  SEAM: { pts: [[2, 0.6], [45, 1.5]], cont: true, timing: 15 },
  SLANT: { pts: [[3, 0], [8, 5]], cont: true },
  QUICK_OUT: { pts: [[5, 0], [5, -10]], cont: true },
  OUT: { pts: [[9, 0], [9.5, -14]], cont: true },
  DIG: { pts: [[12, 0], [12.5, 16]], cont: true },
  POST: { pts: [[11, 0], [30, 8]], cont: true },
  CORNER: { pts: [[10, 0], [24, -9]], cont: true },
  CURL: { pts: [[12, 0], [10.5, 1.2]], settle: true },
  HITCH: { pts: [[6, 0], [5, 0.3]], settle: true },
  COMEBACK: { pts: [[15, 0], [12.5, -2.5]], settle: true },
  DRAG: { pts: [[1.5, 1], [4.5, 18], [5, 32]], cont: true },
  STICK: { pts: [[6, 0], [6, 1.5]], settle: true },
  FLAT: { pts: [[1.5, -2.5], [3.5, -9], [4, -16]], cont: true },
  WHEEL: { pts: [[1, -4], [3, -9], [25, -10]], cont: true, timing: 18 },
  CHECK: { pts: [[2.5, 0.5], [4.5, 3]], settle: true, check: true },
  STALK: { pts: [[3, 0], [4, 0]], settle: true, block: true },
};

export const PLAYBOOK = {
  pass: {
    DRIVE: { X: 'DIG', SLOT: 'DRAG', TE: 'STICK', Z: 'CURL', RB: 'CHECK', reads: ['SLOT', 'X', 'Z', 'TE', 'RB'] },
    SLANT_FLAT: { X: 'SLANT', SLOT: 'QUICK_OUT', TE: 'SEAM', Z: 'SLANT', RB: 'CHECK', reads: ['X', 'SLOT', 'Z', 'TE', 'RB'] },
    CURL_FLAT: { X: 'CURL', SLOT: 'FLAT', TE: 'STICK', Z: 'CURL', RB: 'CHECK', reads: ['X', 'SLOT', 'Z', 'TE', 'RB'] },
    STICK: { X: 'GO', SLOT: 'STICK', TE: 'FLAT', Z: 'HITCH', RB: 'CHECK', reads: ['SLOT', 'TE', 'Z', 'RB'] },
  },
  deep: {
    FOUR_VERTS: { X: 'GO', SLOT: 'SEAM', TE: 'SEAM', Z: 'GO', RB: 'CHECK', reads: ['SLOT', 'TE', 'X', 'Z', 'RB'] },
    DAGGER: { X: 'DIG', SLOT: 'SEAM', TE: 'STICK', Z: 'POST', RB: 'CHECK', reads: ['SLOT', 'X', 'Z', 'TE', 'RB'] },
    SMASH: { X: 'HITCH', SLOT: 'CORNER', TE: 'OUT', Z: 'COMEBACK', RB: 'CHECK', reads: ['SLOT', 'X', 'Z', 'TE', 'RB'] },
    POST_WHEEL: { X: 'POST', SLOT: 'DRAG', TE: 'CORNER', Z: 'GO', RB: 'WHEEL', reads: ['X', 'TE', 'RB', 'SLOT', 'Z'] },
  },
  // Run concepts. scheme drives the blocking rules (runBlocking.js); aim = designed lane (yards from the ball, play side);
  // pull = backside linemen that pull (role: LEAD through the hole, KICK out the end man, TRAP the play-side DT);
  // mesh = lateral offset of the mesh point (counter: RB's first step goes backside); doubleHold = how long a double
  // team stays on the down lineman before reading the linebacker.
  run: {
    INSIDE_ZONE_R: { scheme: 'ZONE', side: 1, aim: 2.5, doubleHold: 0.45 },
    INSIDE_ZONE_L: { scheme: 'ZONE', side: -1, aim: 2.5, doubleHold: 0.45 },
    OUTSIDE_ZONE_R: { scheme: 'ZONE', side: 1, aim: 8, reach: true, doubleHold: 0.35 },
    OUTSIDE_ZONE_L: { scheme: 'ZONE', side: -1, aim: 8, reach: true, doubleHold: 0.35 },
    DUO_R: { scheme: 'DUO', side: 1, aim: 1.6, doubleHold: 0.75 },
    DUO_L: { scheme: 'DUO', side: -1, aim: 1.6, doubleHold: 0.75 },
    POWER_R: { scheme: 'GAP', side: 1, aim: 3.9, pull: { G: 'LEAD' }, doubleHold: 0.6 },
    POWER_L: { scheme: 'GAP', side: -1, aim: 3.9, pull: { G: 'KICK' }, doubleHold: 0.6 },
    COUNTER_R: { scheme: 'GAP', side: 1, aim: 3.9, pull: { G: 'KICK', T: 'LEAD' }, mesh: -0.9, doubleHold: 0.6 },
    COUNTER_L: { scheme: 'GAP', side: -1, aim: 3.9, pull: { G: 'KICK', T: 'LEAD' }, mesh: -0.9, doubleHold: 0.6 },
    TRAP_R: { scheme: 'TRAP', side: 1, aim: 1.4, pull: { G: 'TRAP' }, doubleHold: 0.5 },
    TRAP_L: { scheme: 'TRAP', side: -1, aim: 1.4, pull: { G: 'TRAP' }, doubleHold: 0.5 },
  },
};

// Defensive calls. man: coverage slot -> offensive slot. zones: coverage slot -> zone name. rush: slots that rush.
export const DEF_CALLS = {
  COVER_1: {
    label: 'Cover 1 (man, FS deep)', man: { CBL: 'X', CBR: 'Z', SS: 'SLOT', SAM: 'TE', MIKE: 'RB' },
    zones: { FS: 'DEEP_MIDDLE', WILL: 'ROBBER' }, rush: ['LDE', 'LDT', 'RDT', 'RDE'], press: true,
  },
  COVER_1_BLITZ: {
    label: 'Cover 1 Blitz (Will)', man: { CBL: 'X', CBR: 'Z', SS: 'SLOT', SAM: 'TE', MIKE: 'RB' },
    zones: { FS: 'DEEP_MIDDLE' }, rush: ['LDE', 'LDT', 'RDT', 'RDE', 'WILL'], press: true,
  },
  COVER_2: {
    label: 'Cover 2 (zone)', man: {},
    zones: { CBL: 'FLAT_L', CBR: 'FLAT_R', FS: 'DEEP_HALF_L', SS: 'DEEP_HALF_R', WILL: 'HOOK_L', MIKE: 'MIDDLE_HOOK', SAM: 'HOOK_R' },
    rush: ['LDE', 'LDT', 'RDT', 'RDE'], press: false,
  },
  COVER_3: {
    label: 'Cover 3 (zone)', man: {},
    zones: { CBL: 'DEEP_THIRD_L', CBR: 'DEEP_THIRD_R', FS: 'DEEP_MIDDLE', SS: 'CURL_FLAT_L', WILL: 'HOOK_L', MIKE: 'HOOK_R', SAM: 'CURL_FLAT_R' },
    rush: ['LDE', 'LDT', 'RDT', 'RDE'], press: false,
  },
};

// Zone landmarks: depth beyond LOS and lateral center; region = lateral extent + max depth.
export function zoneDef(name, los) {
  const Z = {
    DEEP_MIDDLE: { x: 15, y: MID_Y, y0: MID_Y - 11, y1: MID_Y + 11, deep: true },
    DEEP_THIRD_L: { x: 14, y: 9, y0: 0, y1: 18.5, deep: true },
    DEEP_THIRD_R: { x: 14, y: FIELD_W - 9, y0: FIELD_W - 18.5, y1: FIELD_W, deep: true },
    DEEP_HALF_L: { x: 14, y: 13.3, y0: 0, y1: MID_Y + 1, deep: true },
    DEEP_HALF_R: { x: 14, y: FIELD_W - 13.3, y0: MID_Y - 1, y1: FIELD_W, deep: true },
    FLAT_L: { x: 4.5, y: 6, y0: 0, y1: 15 },
    FLAT_R: { x: 4.5, y: FIELD_W - 6, y0: FIELD_W - 15, y1: FIELD_W },
    CURL_FLAT_L: { x: 7, y: 11, y0: 0, y1: 20 },
    CURL_FLAT_R: { x: 7, y: FIELD_W - 11, y0: FIELD_W - 20, y1: FIELD_W },
    HOOK_L: { x: 7.5, y: MID_Y - 5, y0: MID_Y - 13, y1: MID_Y + 1 },
    HOOK_R: { x: 7.5, y: MID_Y + 5, y0: MID_Y - 1, y1: MID_Y + 13 },
    MIDDLE_HOOK: { x: 9, y: MID_Y, y0: MID_Y - 6, y1: MID_Y + 6 },
    ROBBER: { x: 8, y: MID_Y, y0: MID_Y - 8, y1: MID_Y + 8 },
  }[name];
  return { name, ...Z, x: los + Z.x, maxDepth: los + (Z.deep ? 60 : 14), deep: !!Z.deep };
}

// Sort the 11 starters of each side into named slots using detailed positions.
export function assignSlots(lineups, ratingOf) {
  const take = (pool, pred) => { const i = pool.findIndex(pred); return i >= 0 ? pool.splice(i, 1)[0] : pool.shift(); };
  const off = [...lineups.offense], def = [...lineups.defense];
  const dp = p => detailedPosition(p);
  const o = {};
  o.QB = take(off, p => p.position === 'QB');
  o.RB = take(off, p => ['RB', 'FB'].includes(p.position));
  const wrs = off.filter(p => p.position === 'WR').sort((a, b) => ratingOf(b) - ratingOf(a));
  for (const s of ['X', 'Z', 'SLOT']) { const w = wrs.shift(); o[s] = w ? off.splice(off.indexOf(w), 1)[0] : undefined; }
  o.TE = take(off, p => p.position === 'TE');
  o.LT = take(off, p => dp(p) === 'T'); o.RT = take(off, p => dp(p) === 'T');
  o.C = take(off, p => dp(p) === 'C');
  o.LG = take(off, p => dp(p) === 'G'); o.RG = take(off, p => dp(p) === 'G');
  for (const s of ['X', 'Z', 'SLOT', 'TE']) if (!o[s]) o[s] = off.shift();
  const d = {};
  d.LDE = take(def, p => ['DE', 'OLB'].includes(dp(p)) && p.position === 'DL');
  d.RDE = take(def, p => ['DE'].includes(dp(p)) && p.position === 'DL');
  d.LDT = take(def, p => ['DT', 'NT'].includes(dp(p)));
  d.RDT = take(def, p => ['DT', 'NT'].includes(dp(p)));
  d.MIKE = take(def, p => ['MLB', 'ILB'].includes(dp(p)));
  d.WILL = take(def, p => p.position === 'LB');
  d.SAM = take(def, p => p.position === 'LB');
  d.CBL = take(def, p => dp(p) === 'CB'); d.CBR = take(def, p => dp(p) === 'CB');
  d.FS = take(def, p => dp(p) === 'FS' || dp(p) === 'S'); d.SS = take(def, p => ['SS', 'FS', 'S'].includes(dp(p)));
  return { off: o, def: d };
}

// Pre-snap alignment for every slot. Offense attacks +x; LOS at losX; ball at y=by.
export function alignment(losX, by, defCall) {
  const cy = y => clamp(y, 2.5, FIELD_W - 2.5);
  const o = {
    QB: [losX - 5, by], RB: [losX - 5.2, by + 1.6],
    X: [losX - 1, cy(by - 19)], SLOT: [losX - 1.6, cy(by - 11)], Z: [losX - 1, cy(by + 19)], TE: [losX - 1.2, by + 4.6],
    LT: [losX - 1.0, by - 3.1], LG: [losX - 0.8, by - 1.55], C: [losX - 0.6, by], RG: [losX - 0.8, by + 1.55], RT: [losX - 1.0, by + 3.1],
  };
  const press = DEF_CALLS[defCall]?.press;
  const cover3 = defCall === 'COVER_3', cover2 = defCall === 'COVER_2';
  const d = {
    LDE: [losX + 1, by - 4.3], LDT: [losX + 0.9, by - 1.0], RDT: [losX + 0.9, by + 1.3], RDE: [losX + 1, by + 6.0],
    WILL: [losX + 4.5, by - 4.5], MIKE: [losX + 4.8, by + 0.5], SAM: [losX + 4.5, by + 5.0],
    CBL: [losX + (press ? 1.3 : cover2 ? 4 : 7), o.X[1] + (press ? 0.8 : cover3 ? -1 : 0)],
    CBR: [losX + (press ? 1.3 : cover2 ? 4 : 7), o.Z[1] - (press ? 0.8 : cover3 ? -1 : 0)],
    FS: cover2 ? [losX + 12, by - 9] : [losX + 13, by],
    SS: cover2 ? [losX + 12, by + 9] : [losX + 6, o.SLOT[1] + 1.5],
  };
  return { o, d };
}
