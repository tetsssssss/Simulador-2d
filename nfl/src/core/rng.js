// Seeded RNG for all gameplay randomness. Same seed + same initial state => same play.
// mulberry32 core; string seeds are hashed with FNV-1a (same hash family used by ratings.js).

export function hashSeed(s) {
  s = String(s);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function createRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  let spare = null;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    seed,
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: p => next() < p,
    pick: arr => arr[Math.floor(next() * arr.length)],
    // weighted([[value, weight], ...])
    weighted(entries) {
      let total = 0;
      for (const [, w] of entries) total += Math.max(0, w);
      let roll = next() * total;
      for (const [v, w] of entries) { roll -= Math.max(0, w); if (roll <= 0) return v; }
      return entries[entries.length - 1][0];
    },
    // Standard normal via Box-Muller (cached pair).
    normal(mean = 0, sd = 1) {
      if (spare !== null) { const s = spare; spare = null; return mean + sd * s; }
      let u = 0, v = 0;
      while (u === 0) u = next();
      v = next();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mean + sd * mag * Math.cos(2 * Math.PI * v);
    },
    fork: label => createRng(hashSeed(`${seed}|${label}`)),
  };
  return rng;
}
