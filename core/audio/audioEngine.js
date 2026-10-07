// AudioEngine — one per sport document (singleton via getAudio()). Everything is synthesized with WebAudio (no files,
// no external services). Categories with separate volumes: AMBIENCE, CROWD, GAME_EFFECT, UI, COMMENTARY (+ master).
// Settings live in localStorage `asu_audio` and are shared by the shell and the three sports (storage events keep
// open documents in sync). The AudioContext is created lazily and only resumes after a user gesture (autoplay rules).
// Sounds are generic building blocks (whistle, horn, crack, thud, cheer…); which sound plays for which event is a
// sport rule and lives in each sport's atmosphere module.
export const CATEGORIES = ['AMBIENCE', 'CROWD', 'GAME_EFFECT', 'UI', 'COMMENTARY'];
export const CATEGORY_LABELS = { master: 'Geral', AMBIENCE: 'Ambiência', CROWD: 'Torcida', GAME_EFFECT: 'Efeitos de jogo', UI: 'Interface', COMMENTARY: 'Narração (voz)' };
export const DEFAULT_AUDIO = { master: 0.7, muted: false, AMBIENCE: 0.5, CROWD: 0.7, GAME_EFFECT: 0.8, UI: 0.4, COMMENTARY: 0.9 };
const KEY = 'asu_audio';

export function loadAudioSettings() {
  try { return { ...DEFAULT_AUDIO, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return { ...DEFAULT_AUDIO }; }
}
export function saveAudioSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }
const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(+v) ? +v : 0));

// Sound recipes: (engine, opts) → void. Each uses the category bus passed by play().
const RECIPES = {
  whistle(a, bus, o) { const t = a.now(); const osc = a.osc('sine', 2900 * (o.pitch || 1), bus, t, 0.32 * (o.len || 1), 0.22); const lfo = a.ctx.createOscillator(); const lg = a.ctx.createGain(); lfo.frequency.value = 38; lg.gain.value = 120; lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(t + 0.4 * (o.len || 1)); },
  horn(a, bus, o) { const t = a.now(), len = o.len || 2.6; for (const f of [116, 146, 174]) a.osc('sawtooth', f, bus, t, len, 0.09, 0.08, 0.6, 900); },
  organ(a, bus, o) { const t = a.now(); const notes = o.notes || [392, 523, 659, 784, 659, 784]; notes.forEach((f, i) => { a.osc('square', f, bus, t + i * 0.16, 0.15, 0.05, 0.005, 0.05, 2200); a.osc('sine', f * 2, bus, t + i * 0.16, 0.15, 0.03); }); },
  crack(a, bus, o) { const t = a.now(), p = o.power ?? 0.8; a.noise(bus, t, 0.09, 0.5 * p, { type: 'bandpass', f: 2600, q: 1.2 }); a.osc('triangle', 1250, bus, t, 0.05, 0.25 * p); },
  pop(a, bus, o) { const t = a.now(); a.noise(bus, t, 0.06, 0.45 * (o.power ?? 1), { type: 'lowpass', f: 900, q: 0.7 }); a.osc('sine', 160, bus, t, 0.07, 0.3); },
  thud(a, bus, o) { const t = a.now(), p = o.power ?? 0.8; a.osc('sine', 70, bus, t, 0.18, 0.55 * p, 0.003, 0.15); a.noise(bus, t, 0.12, 0.35 * p, { type: 'lowpass', f: 500, q: 0.8 }); },
  boards(a, bus, o) { const t = a.now(), p = o.power ?? 0.8; a.noise(bus, t, 0.35, 0.5 * p, { type: 'lowpass', f: 350, q: 2 }); a.osc('sine', 55, bus, t, 0.3, 0.4 * p); },
  click(a, bus, o) { const t = a.now(); a.noise(bus, t, 0.025, 0.4 * (o.power ?? 1), { type: 'highpass', f: 3000, q: 0.7 }); },
  stick(a, bus, o) { const t = a.now(); a.noise(bus, t, 0.04, 0.3 * (o.power ?? 1), { type: 'bandpass', f: 1800, q: 3 }); a.osc('triangle', 820, bus, t, 0.03, 0.12); },
  cheer(a, bus, o) { const t = a.now(), p = o.power ?? 1, len = 1.6 + 2.2 * p; a.noise(bus, t, len, 0.55 * p, { type: 'bandpass', f: 1100, q: 0.6, sweep: 1500 }, 0.25, len * 0.6); },
  groan(a, bus, o) { const t = a.now(), p = o.power ?? 0.8; a.noise(bus, t, 1.6, 0.4 * p, { type: 'bandpass', f: 520, q: 1.4, sweep: -260 }, 0.2, 1.1); },
  oohs(a, bus, o) { const t = a.now(), p = o.power ?? 0.7; a.noise(bus, t, 1.1, 0.35 * p, { type: 'bandpass', f: 700, q: 2.2, sweep: 350 }, 0.15, 0.7); },
  ui(a, bus, o) { const t = a.now(); a.osc('sine', o.freq || 880, bus, t, 0.06, 0.12); },
  buzzer(a, bus, o) { const t = a.now(); a.osc('square', 220, bus, t, o.len || 1.2, 0.08, 0.01, 0.1, 1200); a.osc('square', 223, bus, t, o.len || 1.2, 0.06, 0.01, 0.1, 1200); },
};

function createAudioEngine() {
  let settings = loadAudioSettings();
  let ctx = null, master = null, noiseBuf = null;
  const buses = {};
  const beds = {}; // AMBIENCE / CROWD continuous layers: { src, gain, filter }
  let crowdLevel = 0; // 0..100
  let ambience = null; // current ambience recipe name
  const hasAudio = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);

  function ensure() {
    if (ctx || !hasAudio) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain(); master.connect(ctx.destination);
    for (const c of CATEGORIES) { buses[c] = ctx.createGain(); buses[c].connect(master); }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = 0.6 * w + 2.2 * b; }
    applyVolumes();
    return ctx;
  }
  function applyVolumes() {
    if (!ctx) return;
    master.gain.value = settings.muted ? 0 : clamp01(settings.master);
    for (const c of CATEGORIES) buses[c].gain.value = clamp01(settings[c]);
  }
  const helper = {
    get ctx() { return ctx; },
    now: () => ctx.currentTime + 0.005,
    osc(type, freq, bus, t, len, peak, attack = 0.005, release = 0.08, lowpass = 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.setValueAtTime(peak, t + Math.max(attack, len - release)); g.gain.linearRampToValueAtTime(0, t + len);
      let node = o.connect(g);
      if (lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; node = g.connect(f); f.connect(bus); } else g.connect(bus);
      o.start(t); o.stop(t + len + 0.02);
      return o;
    },
    noise(bus, t, len, peak, filt = {}, attack = 0.004, release = len * 0.7) {
      const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
      f.type = filt.type || 'bandpass'; f.frequency.setValueAtTime(filt.f || 1000, t); f.Q.value = filt.q || 1;
      if (filt.sweep) f.frequency.linearRampToValueAtTime(Math.max(60, (filt.f || 1000) + filt.sweep), t + len);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.setValueAtTime(peak, t + Math.max(attack, len - release)); g.gain.linearRampToValueAtTime(0, t + len);
      s.connect(f).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + len + 0.05);
    },
  };

  // Continuous layers: crowd murmur (CROWD bus, level from intensity) and sport ambience (AMBIENCE bus).
  const BEDS = {
    crowd: { bus: 'CROWD', type: 'bandpass', f: 650, q: 0.5 },
    ice: { bus: 'AMBIENCE', type: 'highpass', f: 4200, q: 0.4, level: 0.05 },
    stadium: { bus: 'AMBIENCE', type: 'lowpass', f: 380, q: 0.4, level: 0.16 },
    ballpark: { bus: 'AMBIENCE', type: 'lowpass', f: 520, q: 0.3, level: 0.1 },
  };
  function startBed(name) {
    if (!ctx || beds[name]) return;
    const r = BEDS[name]; if (!r) return;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; f.type = r.type; f.frequency.value = r.f; f.Q.value = r.q; g.gain.value = 0;
    src.connect(f).connect(g).connect(buses[r.bus]); src.start();
    beds[name] = { src, f, g, r };
    updateBeds(true);
  }
  function stopBed(name) { const b = beds[name]; if (!b) return; try { b.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); b.src.stop(ctx.currentTime + 1); } catch { /* already stopped */ } delete beds[name]; }
  function updateBeds(immediate = false) {
    if (!ctx) return;
    const tc = immediate ? 0.05 : 0.35;
    if (beds.crowd) { const k = crowdLevel / 100; beds.crowd.g.gain.setTargetAtTime(0.04 + 0.42 * k * k, ctx.currentTime, tc); beds.crowd.f.frequency.setTargetAtTime(520 + 700 * k, ctx.currentTime, tc); }
    for (const [n, b] of Object.entries(beds)) if (n !== 'crowd') b.g.gain.setTargetAtTime(b.r.level, ctx.currentTime, tc);
  }

  const onStorage = e => { if (e.key === KEY) { settings = loadAudioSettings(); applyVolumes(); } };
  const unlock = () => { ensure(); if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); if (ambience) { startBed('crowd'); startBed(ambience); } };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  const api = {
    get settings() { return { ...settings }; },
    get running() { return !!ctx && ctx.state === 'running'; },
    get crowdLevel() { return crowdLevel; },
    volume(cat) { return settings.muted ? 0 : clamp01(settings.master) * clamp01(cat === 'master' ? 1 : settings[cat] ?? 1); },
    set(partial) { settings = { ...settings, ...partial }; saveAudioSettings(settings); applyVolumes(); },
    play(name, { category = 'GAME_EFFECT', ...opts } = {}) {
      if (!ctx || ctx.state !== 'running' || settings.muted) return false;
      const r = RECIPES[name]; if (!r || !buses[category]) return false;
      try { r(helper, buses[category], opts); return true; } catch { return false; }
    },
    // Sport ambience for the mounted match ('stadium' | 'ice' | 'ballpark'); null stops all continuous layers.
    setAmbience(name) {
      if (ambience && ambience !== name) stopBed(ambience);
      ambience = name;
      if (!name) { stopBed('crowd'); return; }
      if (ctx?.state === 'running') { startBed('crowd'); startBed(name); }
    },
    setCrowd(level) { crowdLevel = Math.max(0, Math.min(100, +level || 0)); updateBeds(); },
    unlock,
    dispose() {
      for (const n of Object.keys(beds)) stopBed(n);
      if (typeof window !== 'undefined') { window.removeEventListener('storage', onStorage); window.removeEventListener('pointerdown', unlock, { capture: true }); window.removeEventListener('keydown', unlock, { capture: true }); }
      try { ctx?.close(); } catch { /* closed */ }
      ctx = null;
    },
  };
  return api;
}

// One engine per document: matches share it and only toggle ambience/crowd on mount/unmount.
export function getAudio() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  if (!g.__asuAudio) g.__asuAudio = createAudioEngine();
  return g.__asuAudio;
}
