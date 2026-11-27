// Skating loops for the hockey kit (driven by stride phase like the running gaits). Poses reuse the shared joint model; hockey
// skaters lean forward with bent knees, push sideways-and-back with each leg (foot offset), arms low and balanced.
import { defineClip as C } from '../pose.js';
const G = 'skate';
const stick = { aF: 0.85, fF: 1.25, aB: 0.55, fB: 1.0 };            // hands low on the stick
export const SKATE_CLIPS = [
  C({ id: 'hk_glide', name: 'Skate Glide', source: 'extra', group: G, dur: 1.2, loop: true, keys: [[0, { ...stick, crouch: 0.55, lean: 0.28, lF: 0.8, lB: -0.7, kB: 0.1 }], [0.5, { ...stick, crouch: 0.5, lean: 0.26, lF: 0.75, lB: -0.8, kB: 0.15, air: 0.02 }], [1, { ...stick, crouch: 0.55, lean: 0.28, lF: 0.8, lB: -0.7, kB: 0.1 }]] }),
  C({ id: 'hk_skate', name: 'Skate Stride', source: 'extra', group: G, dur: 0.7, loop: true, keys: [[0, { ...stick, crouch: 0.6, lean: 0.4, lF: 1.7, kF: 0, lB: -1.9, kB: 0.5, aF: 0.6, aB: 0.9 }], [0.25, { crouch: 0.7, lean: 0.38, lF: 0.9, lB: -0.4, kB: 0.9 }], [0.5, { ...stick, crouch: 0.6, lean: 0.4, lF: -1.9, kF: 0.5, lB: 1.7, kB: 0, aF: 0.9, aB: 0.6 }], [0.75, { crouch: 0.7, lean: 0.38, lF: -0.4, kF: 0.9, lB: 0.9, kB: 0 }], [1, { ...stick, crouch: 0.6, lean: 0.4, lF: 1.7, kF: 0, lB: -1.9, kB: 0.5, aF: 0.6, aB: 0.9 }]] }),
  C({ id: 'hk_skate_back', name: 'Backward Skate', source: 'extra', group: G, dur: 0.9, loop: true, keys: [[0, { ...stick, crouch: 0.7, lean: -0.08, lF: -1.0, lB: 0.9, kB: 0.4 }], [0.5, { crouch: 0.75, lean: -0.1, lF: 0.9, kF: 0.4, lB: -1.0, kB: 0 }], [1, { ...stick, crouch: 0.7, lean: -0.08, lF: -1.0, lB: 0.9, kB: 0.4, kF: 0 }]] }),
  C({ id: 'hk_crossover', name: 'Crossover', source: 'extra', group: G, dur: 0.8, loop: true, keys: [[0, { ...stick, crouch: 0.7, lean: 0.35, lF: 1.2, lB: -1.5, kB: 0.6, aF: 0.4, aB: 1.1 }], [0.5, { ...stick, crouch: 0.75, lean: 0.4, lF: -1.4, kF: 0.6, lB: 1.2, kB: 0, aF: 1.1, aB: 0.4 }], [1, { ...stick, crouch: 0.7, lean: 0.35, lF: 1.2, kF: 0, lB: -1.5, kB: 0.6, aF: 0.4, aB: 1.1 }]] }),
];
