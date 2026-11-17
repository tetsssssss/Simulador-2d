// NFL animation batch 2b — Gestos (20 clips): 10 player gestures + 10 referee signals (group 'ref').
// Referee signals are poses only: the renderer has no referee entity yet (they are ready for a future OFFICIAL/PENALTY event).
import { defineClip as C } from '../pose.js';
const G = 'gesture', R = 'ref';
const UP = { aF: 3.0, fF: 3.1, aB: -3.0, fB: -3.1 };          // both arms straight up
const T = { aF: 1.57, fF: 1.57, aB: -1.57, fB: -1.57 };         // arms spread horizontally
const DOWN = { aF: 0.15, fF: 0.45, aB: -0.12, fB: 0.2 };

// rest → (raise) → hold → rest, the shape of almost every signal
const sig = (id, name, hold, o = {}) => C({ id, name, source: 'extra', group: o.group || R, dur: o.dur || 1.4, keys: [[0, { ...DOWN }], [0.25, { ...hold }], [0.75, { ...hold, ...(o.hold2 || {}) }], [1, { ...DOWN }]] });

export const GESTURE_CLIPS = [
  C({ id: 'gs_fist_pump', name: 'Fist Pump', source: 'extra', group: G, dur: 1.0, keys: [[0, { ...DOWN }], [0.2, { aF: 2.6, fF: 2.2, lean: -0.1 }], [0.4, { aF: 3.0, fF: 3.0, lean: 0.1, air: 0.15 }], [0.6, { aF: 2.6, fF: 2.2, lean: -0.1, air: 0 }], [0.8, { aF: 3.0, fF: 3.0, lean: 0.1, air: 0.15 }], [1, { ...DOWN, lean: 0, air: 0 }]] }),
  C({ id: 'gs_arms_up', name: 'Touchdown Arms Up', source: 'extra', group: G, dur: 1.6, loop: true, keys: [[0, { ...UP, air: 0 }], [0.25, { ...UP, aF: 2.7, aB: -2.7, air: 0.5 }], [0.5, { ...UP, air: 0 }], [0.75, { ...UP, aF: 2.7, aB: -2.7, air: 0.5 }], [1, { ...UP, air: 0 }]] }),
  C({ id: 'gs_first_down', name: 'First-Down Point', source: 'extra', group: G, dur: 1.0, keys: [[0, { ...DOWN }], [0.3, { aF: 1.5, fF: 1.55, lean: 0.1 }], [0.6, { aF: 1.5, fF: 1.55, lean: 0.1, lF: 0.4 }], [1, { ...DOWN, lean: 0, lF: 0 }]] }),
  C({ id: 'gs_point_sky', name: 'Point to the Sky', source: 'extra', group: G, dur: 1.5, keys: [[0, { ...DOWN }], [0.3, { aF: 2.9, fF: 3.0, aB: 0.2, fB: 0.6, lean: -0.15 }], [0.8, { aF: 2.9, fF: 3.0, aB: 0.2, fB: 0.6, lean: -0.15 }], [1, { ...DOWN, lean: 0 }]] }),
  C({ id: 'gs_wave_crowd', name: 'Wave to the Crowd', source: 'extra', group: G, dur: 1.4, keys: [[0, { ...DOWN }], [0.2, { aF: 2.7, fF: 2.2 }], [0.4, { aF: 2.7, fF: 3.3 }], [0.6, { aF: 2.7, fF: 2.2 }], [0.8, { aF: 2.7, fF: 3.3 }], [1, { ...DOWN }]] }),
  C({ id: 'gs_pre_snap_motion', name: 'Pre-Snap Motion Wave', source: 'extra', group: G, dur: 0.8, keys: [[0, { ...DOWN, crouch: 0.2 }], [0.3, { aF: 1.5, fF: 2.2, crouch: 0.2 }], [0.6, { aF: 1.5, fF: 1.1, crouch: 0.2 }], [1, { ...DOWN, crouch: 0.2 }]] }),
  C({ id: 'gs_audible_point', name: 'QB Audible Point', source: 'extra', group: G, dur: 1.2, keys: [[0, { ...DOWN, crouch: 0.2 }], [0.25, { aF: 1.7, fF: 1.75, aB: 0.6, fB: 1.0, crouch: 0.25, lean: 0.1 }], [0.5, { aF: 1.3, fF: 1.35, aB: 0.6, fB: 1.0, lean: 0.1 }], [0.75, { aF: 2.2, fF: 2.3, aB: 0.6, fB: 1.0 }], [1, { ...DOWN, crouch: 0.2, lean: 0 }]] }),
  C({ id: 'gs_sideline_signal', name: 'Sideline Hand Signal', source: 'extra', group: G, dur: 1.5, keys: [[0, { ...DOWN }], [0.2, { aF: 2.4, fF: 2.5, aB: 1.0, fB: 1.4 }], [0.4, { aF: 2.4, fF: 2.5, aB: 1.4, fB: 1.4 }], [0.6, { aF: 1.2, fF: 1.3, aB: 2.4, fB: 2.5 }], [0.8, { aF: 1.2, fF: 1.3, aB: 1.0, fB: 1.2 }], [1, { ...DOWN }]] }),
  C({ id: 'gs_beckon', name: 'Come-On Beckon', source: 'extra', group: G, dur: 1.0, keys: [[0, { ...DOWN }], [0.25, { aF: 1.5, fF: 1.0 }], [0.5, { aF: 1.5, fF: 2.2 }], [0.75, { aF: 1.5, fF: 1.0 }], [1, { ...DOWN }]] }),
  C({ id: 'gs_shrug', name: 'Shrug (hands out)', source: 'extra', group: G, dur: 1.2, keys: [[0, { ...DOWN }], [0.3, { aF: 1.1, fF: 1.9, aB: -0.5, fB: -1.1, air: 0.08, lean: -0.05 }], [0.7, { aF: 1.1, fF: 1.9, aB: -0.5, fB: -1.1, air: 0.08, lean: -0.05 }], [1, { ...DOWN, air: 0, lean: 0 }]] }),

  sig('rf_touchdown', 'Ref: Touchdown / Field Goal Good', UP),
  C({ id: 'rf_first_down', name: 'Ref: First Down', source: 'extra', group: R, dur: 1.2, keys: [[0, { ...DOWN }], [0.3, { aF: 1.57, fF: 1.57, aB: 0.2, fB: 0.5 }], [0.55, { aF: 1.57, fF: 1.57, aB: 0.2, fB: 0.5, lean: 0.12 }], [0.75, { aF: 1.57, fF: 1.57, aB: 0.2, fB: 0.5, lean: 0 }], [1, { ...DOWN }]] }),
  C({ id: 'rf_incomplete', name: 'Ref: Incomplete Pass', source: 'extra', group: R, dur: 1.3, keys: [[0, { ...DOWN }], [0.25, { aF: 1.2, fF: 1.2, aB: -1.2, fB: -1.2 }], [0.5, { aF: -0.2, fF: -0.2, aB: 0.2, fB: 0.2 }], [0.75, { aF: 1.2, fF: 1.2, aB: -1.2, fB: -1.2 }], [1, { ...DOWN }]] }),
  C({ id: 'rf_timeout', name: 'Ref: Timeout', source: 'extra', group: R, dur: 1.4, keys: [[0, { ...DOWN }], [0.25, { aF: 3.0, fF: 3.1, aB: 1.57, fB: 1.57 }], [0.75, { aF: 3.0, fF: 3.1, aB: 1.57, fB: 1.57 }], [1, { ...DOWN }]] }),
  C({ id: 'rf_safety', name: 'Ref: Safety', source: 'extra', group: R, dur: 1.4, keys: [[0, { ...DOWN }], [0.25, { aF: 3.0, fF: 3.4, aB: -3.0, fB: -3.4 }], [0.75, { aF: 3.0, fF: 3.4, aB: -3.0, fB: -3.4 }], [1, { ...DOWN }]] }),
  C({ id: 'rf_no_good', name: 'Ref: No Good (wave off)', source: 'extra', group: R, dur: 1.3, keys: [[0, { ...DOWN }], [0.2, { ...T }], [0.4, { aF: 1.57, fF: 2.2, aB: -1.57, fB: -2.2 }], [0.6, { ...T }], [0.8, { aF: 1.57, fF: 2.2, aB: -1.57, fB: -2.2 }], [1, { ...DOWN }]] }),
  C({ id: 'rf_touchback', name: 'Ref: Touchback', source: 'extra', group: R, dur: 1.2, keys: [[0, { ...DOWN }], [0.3, { aF: 3.0, fF: 3.1, aB: 0.2, fB: 0.5 }], [0.75, { aF: 3.0, fF: 3.1, aB: 0.2, fB: 0.5 }], [1, { ...DOWN }]] }),
  C({ id: 'rf_clock_stop', name: 'Ref: Stop the Clock', source: 'extra', group: R, dur: 1.4, loop: false, keys: [[0, { ...DOWN }], [0.2, { aF: 2.7, fF: 2.2 }], [0.4, { aF: 3.0, fF: 3.3 }], [0.6, { aF: 2.7, fF: 2.2 }], [0.8, { aF: 3.0, fF: 3.3 }], [1, { ...DOWN }]] }),
  sig('rf_dead_ball', 'Ref: Dead Ball', { aF: 2.9, fF: 3.0, aB: 0.2, fB: 0.5 }, { dur: 1.0 }),
  C({ id: 'rf_flag_throw', name: 'Ref: Throw the Flag', source: 'extra', group: R, dur: 0.9, ev: { release: 0.5 }, keys: [[0, { ...DOWN }], [0.3, { aF: -2.4, fF: -3.0, ball: 'F', lean: -0.2 }], [0.5, { aF: 2.0, fF: 1.9, ball: '', lean: 0.3 }], [0.75, { aF: 1.0, fF: 1.0, lean: 0.2 }], [1, { ...DOWN, lean: 0 }]] }),
];
