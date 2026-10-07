// AudioEngine — one per sport document (singleton via getAudio()). Everything is synthesized with WebAudio (no files,
// no external services). Categories with separate volumes: AMBIENCE, CROWD, GAME_EFFECT, MUSIC, UI, COMMENTARY (+ master).
// Settings live in localStorage `asu_audio` and are shared by the shell and the three sports (storage events keep
// open documents in sync). The AudioContext is created lazily and only resumes after a user gesture (autoplay rules).
//
// Mix chain:  recipe → [panner] → category bus → (dry) master → compressor/limiter → destination
//                                              ↘ (wet send) venue reverb (generated impulse) ↗
//   • per-sound variation (±pitch/level) so repeated events never sound machine-gunned;
//   • stereo pan (`pan` −1..1) and distance (`far` 0..1 → low-pass + quieter) per sound;
//   • venue presets (arena / stadium / ballpark) set reverb tail and wet level per category;
//   • ducking: the speech commentary lowers crowd/ambience/music while a line is spoken;
//   • continuous beds (crowd murmur+chatter+roar with random shouts, sport ambience, live skate bed).
// Sounds are generic building blocks (whistle, horn, bat crack, pad crunch, puck on boards…); which sound plays for
// which event is a sport rule and lives in each sport's atmosphere module.
export const CATEGORIES = ['AMBIENCE', 'CROWD', 'GAME_EFFECT', 'MUSIC', 'UI', 'COMMENTARY'];
export const CATEGORY_LABELS = { master: 'Geral', AMBIENCE: 'Ambiência', CROWD: 'Torcida', GAME_EFFECT: 'Efeitos de jogo', MUSIC: 'Música / órgão', UI: 'Interface', COMMENTARY: 'Narração (voz)' };
export const DEFAULT_AUDIO = { master: 0.7, muted: false, AMBIENCE: 0.5, CROWD: 0.7, GAME_EFFECT: 0.8, MUSIC: 0.6, UI: 0.4, COMMENTARY: 0.9 };
const KEY = 'asu_audio';
// Reverb: tail (s) + dry/wet send per category for each venue. Open-air ballpark is short and dry; the arena rings.
export const VENUES = {
  arena: { tail: 2.2, decay: 2.6, wet: { AMBIENCE: 0.1, CROWD: 0.28, GAME_EFFECT: 0.22, MUSIC: 0.3, UI: 0, COMMENTARY: 0 } },
  stadium: { tail: 2.8, decay: 2.2, wet: { AMBIENCE: 0.1, CROWD: 0.3, GAME_EFFECT: 0.2, MUSIC: 0.3, UI: 0, COMMENTARY: 0 } },
  ballpark: { tail: 1.4, decay: 3.2, wet: { AMBIENCE: 0.06, CROWD: 0.16, GAME_EFFECT: 0.12, MUSIC: 0.2, UI: 0, COMMENTARY: 0 } },
};

export function loadAudioSettings() {
  try { return { ...DEFAULT_AUDIO, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return { ...DEFAULT_AUDIO }; }
}
export function saveAudioSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }
const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(+v) ? +v : 0));
const R = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------------------------------------------
// Recipes: (helper a, destination node, opts) → void. `o.power` 0..1 scales loudness/brightness. Helper methods:
//   a.tone(type, freq, dest, t, len, peak, {attack, release, lp, hp, to, vib:[hz,depth]})   oscillator voice
//   a.noise(dest, t, len, peak, {type,f,q,sweep}, attack, release)                          filtered noise burst
//   a.clicks(dest, t, len, density, peak, f)                                                 random claps/impacts
//   a.formant(dest, t, len, peak, [[f,q,gain]…], {sweep, attack})                            vowel-like voice (crowd)
// ---------------------------------------------------------------------------------------------------------------
const NOTE = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784, A5: 880, C6: 1046.5 };
const RECIPES = {
  // ---------- officials / signals ----------
  whistle(a, d, o) { const t = a.now(), len = 0.32 * (o.len || 1), f = 2900 * (o.pitch || 1); for (const [k, g] of [[1, 0.2], [1.06, 0.14]]) { const v = a.tone('sine', f * k, d, t, len, g, { attack: 0.01, release: 0.06, vib: [38, f * 0.04] }); } a.noise(d, t, len, 0.05, { type: 'highpass', f: 3800, q: 0.7 }, 0.01, 0.1); },
  whistleTrill(a, d, o) { const t = a.now(); for (let i = 0; i < (o.n || 3); i++) a.tone('sine', 3000 * (o.pitch || 1), d, t + i * 0.2, 0.15, 0.2, { attack: 0.01, release: 0.04, vib: [42, 120] }); },
  horn(a, d, o) { const t = a.now(), len = o.len || 2.6; for (const f of [116, 146, 174, 233]) a.tone('sawtooth', f * R(0.995, 1.005), d, t, len, 0.07, { attack: 0.08, release: 0.6, lp: 1100 }); },
  buzzer(a, d, o) { const t = a.now(), len = o.len || 1.2; for (const f of [220, 223.5, 440]) a.tone('square', f, d, t, len, 0.06, { attack: 0.01, release: 0.1, lp: 1500 }); },
  goalHorn(a, d, o) { const t = a.now(), len = o.len || 3; for (let b = 0; b < 2; b++) { const t0 = t + b * (len * 0.5); for (const f of [98, 147, 196, 233]) a.tone('sawtooth', f * R(0.995, 1.005), d, t0, len * 0.46, 0.1, { attack: 0.03, release: 0.25, lp: 1200 }); } a.noise(d, t, len, 0.03, { type: 'bandpass', f: 400, q: 0.5 }); },
  chains(a, d) { const t = a.now(); for (let i = 0; i < 5; i++) a.tone('triangle', R(2400, 4200), d, t + i * R(0.03, 0.08), 0.12, 0.05, { attack: 0.001, release: 0.1 }); },
  // ---------- music / organ / PA ----------
  organ(a, d, o) { const t = a.now(), notes = o.notes || [392, 523, 659, 784, 659, 784], step = o.step || 0.16; notes.forEach((f, i) => { const t0 = t + i * step; a.tone('square', f, d, t0, step * 0.95, 0.045, { attack: 0.005, release: 0.05, lp: 2400, vib: [6, f * 0.004] }); a.tone('sine', f * 2, d, t0, step * 0.95, 0.03, { attack: 0.005, release: 0.05 }); a.tone('sine', f * 0.5, d, t0, step * 0.95, 0.03, { attack: 0.005, release: 0.05 }); }); },
  organCharge(a, d) { const n = [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5, NOTE.E5, NOTE.G5], dur = [0.14, 0.14, 0.14, 0.3, 0.14, 0.7]; let t = a.now(); n.forEach((f, i) => { a.tone('square', f, d, t, dur[i] * 0.95, 0.05, { attack: 0.004, release: 0.04, lp: 2600 }); a.tone('sine', f * 2, d, t, dur[i] * 0.95, 0.03); t += dur[i]; }); },
  organTakeMe(a, d) { const n = [NOTE.C5, NOTE.C5, NOTE.A4, NOTE.F4, NOTE.G4, NOTE.A4, NOTE.G4], dur = [0.3, 0.2, 0.3, 0.3, 0.3, 0.3, 0.6]; let t = a.now(); n.forEach((f, i) => { a.tone('square', f, d, t, dur[i] * 0.92, 0.04, { attack: 0.006, release: 0.05, lp: 2200, vib: [5.5, f * 0.003] }); a.tone('sine', f * 2, d, t, dur[i] * 0.92, 0.025); t += dur[i]; }); },
  fanfare(a, d, o) { const t = a.now(), n = o.notes || [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], step = o.step || 0.18; n.forEach((f, i) => { const last = i === n.length - 1, t0 = t + i * step, len = last ? 0.9 : step * 0.9; a.tone('sawtooth', f, d, t0, len, 0.06, { attack: 0.02, release: last ? 0.4 : 0.05, lp: 2800 }); a.tone('sawtooth', f * 1.005, d, t0, len, 0.04, { attack: 0.02, release: last ? 0.4 : 0.05, lp: 2800 }); }); },
  stomp(a, d, o) { const t = a.now(), p = o.power ?? 1; for (const dt of [0, 0.3]) { a.tone('sine', 62, d, t + dt, 0.2, 0.5 * p, { attack: 0.003, release: 0.17, to: 38 }); a.noise(d, t + dt, 0.08, 0.2 * p, { type: 'lowpass', f: 400, q: 0.7 }); } a.clicks(d, t + 0.6, 0.12, 90, 0.22 * p, 1800); },
  // ---------- ball / bat / glove ----------
  crack(a, d, o) { const t = a.now(), p = o.power ?? 0.8; a.noise(d, t, 0.07 + 0.05 * p, 0.3 * p, { type: 'bandpass', f: 2200 + 1400 * p, q: 1.1 }, 0.001, 0.06); a.tone('triangle', 900 + 500 * p, d, t, 0.06, 0.24 * p, { attack: 0.001, release: 0.05, to: 600 }); a.tone('sine', 190, d, t, 0.09, 0.2 * p, { attack: 0.002, release: 0.07 }); if (p > 0.85) a.tone('sine', 2100, d, t + 0.01, 0.35, 0.05, { attack: 0.002, release: 0.3 }); },
  pop(a, d, o) { const t = a.now(), p = o.power ?? 1; a.noise(d, t, 0.06, 0.45 * p, { type: 'lowpass', f: 1000, q: 0.7 }, 0.002, 0.05); a.noise(d, t, 0.03, 0.25 * p, { type: 'bandpass', f: 2400, q: 1.5 }, 0.001, 0.02); a.tone('sine', 150 * R(0.95, 1.05), d, t, 0.08, 0.32 * p, { attack: 0.002, release: 0.07, to: 100 }); },
  whoosh(a, d, o) { const t = a.now(), len = o.len || 0.35; a.noise(d, t, len, 0.16 * (o.power ?? 0.7), { type: 'bandpass', f: 700, q: 0.9, sweep: o.down ? -450 : 1400 }, len * 0.4, len * 0.55); },
  catchSlap(a, d, o) { const t = a.now(), p = o.power ?? 0.7; a.noise(d, t, 0.05, 0.4 * p, { type: 'bandpass', f: 1500, q: 1.4 }, 0.001, 0.04); a.tone('sine', 220, d, t, 0.06, 0.2 * p, { attack: 0.001, release: 0.05 }); },
  kick(a, d, o) { const t = a.now(), p = o.power ?? 0.9; a.tone('sine', 95, d, t, 0.22, 0.65 * p, { attack: 0.002, release: 0.2, to: 55 }); a.noise(d, t, 0.1, 0.35 * p, { type: 'lowpass', f: 700, q: 0.8 }, 0.001, 0.09); },
  // ---------- football contact ----------
  thud(a, d, o) { const t = a.now(), p = o.power ?? 0.8; a.tone('sine', 72 * R(0.9, 1.1), d, t, 0.2, 0.55 * p, { attack: 0.003, release: 0.17, to: 45 }); a.noise(d, t, 0.12, 0.35 * p, { type: 'lowpass', f: 520, q: 0.8 }, 0.002, 0.1); },
  padsCrunch(a, d, o) { const t = a.now(), p = o.power ?? 0.9; a.tone('sine', 66, d, t, 0.26, 0.6 * p, { attack: 0.002, release: 0.23, to: 40 }); a.noise(d, t, 0.14, 0.28 * p, { type: 'bandpass', f: 1200, q: 0.6 }, 0.001, 0.12); a.noise(d, t + 0.015, 0.1, 0.12 * p, { type: 'highpass', f: 3200, q: 0.7 }, 0.001, 0.09); a.clicks(d, t, 0.12, 120, 0.22 * p, 2400); },
  snapCadence(a, d, o) { const t = a.now(), n = o.n || 2; for (let i = 0; i < n; i++) a.formant(d, t + i * 0.28, 0.12, 0.12, [[480, 6, 1], [900, 7, 0.6]], { attack: 0.006 }); },
  // ---------- hockey ----------
  stick(a, d, o) { const t = a.now(), p = o.power ?? 1; a.noise(d, t, 0.04, 0.5 * p, { type: 'bandpass', f: 1800, q: 3 }, 0.001, 0.035); a.tone('triangle', 820 * R(0.95, 1.05), d, t, 0.03, 0.22 * p, { attack: 0.001, release: 0.025 }); },
  slapShot(a, d, o) { const t = a.now(), p = o.power ?? 1; a.noise(d, t, 0.05, 0.3 * p, { type: 'bandpass', f: 3000, q: 1.2 }, 0.001, 0.045); a.tone('sine', 140, d, t, 0.12, 0.35 * p, { attack: 0.002, release: 0.1, to: 80 }); a.noise(d, t + 0.02, 0.28, 0.14 * p, { type: 'bandpass', f: 900, q: 0.8, sweep: -500 }, 0.02, 0.24); },
  wristShot(a, d, o) { const t = a.now(), p = o.power ?? 0.7; a.noise(d, t, 0.04, 0.4 * p, { type: 'bandpass', f: 2400, q: 2 }, 0.001, 0.035); a.tone('sine', 190, d, t, 0.07, 0.2 * p, { attack: 0.002, release: 0.06 }); },
  boards(a, d, o) { const t = a.now(), p = o.power ?? 0.8; a.noise(d, t, 0.35, 0.5 * p, { type: 'lowpass', f: 380, q: 2 }, 0.002, 0.3); a.tone('sine', 58, d, t, 0.3, 0.42 * p, { attack: 0.003, release: 0.25, to: 42 }); a.clicks(d, t, 0.25, 40, 0.1 * p, 1500); },
  glassBang(a, d, o) { const t = a.now(), p = o.power ?? 0.8; a.noise(d, t, 0.3, 0.2 * p, { type: 'bandpass', f: 1600, q: 0.5 }, 0.001, 0.27); a.tone('sine', 120, d, t, 0.25, 0.4 * p, { attack: 0.002, release: 0.22 }); a.tone('sine', 2600, d, t, 0.4, 0.04, { attack: 0.002, release: 0.38 }); },
  puckPost(a, d, o) { const t = a.now(), p = o.power ?? 0.9; for (const [f, g] of [[1700, 0.2], [2450, 0.12], [3300, 0.06]]) a.tone('sine', f * R(0.98, 1.02), d, t, 0.6, g * p, { attack: 0.001, release: 0.55 }); a.noise(d, t, 0.03, 0.3 * p, { type: 'highpass', f: 3500, q: 0.7 }, 0.001, 0.025); },
  padSave(a, d, o) { const t = a.now(), p = o.power ?? 0.8; a.noise(d, t, 0.09, 0.45 * p, { type: 'lowpass', f: 700, q: 0.7 }, 0.002, 0.08); a.tone('sine', 110, d, t, 0.12, 0.35 * p, { attack: 0.002, release: 0.1, to: 80 }); },
  skate(a, d, o) { const t = a.now(), len = o.len || 0.45; a.noise(d, t, len, 0.1 * (o.power ?? 0.7), { type: 'highpass', f: 4200, q: 0.5, sweep: -600 }, len * 0.3, len * 0.6); },
  iceSpray(a, d, o) { const t = a.now(); a.noise(d, t, 0.3, 0.14 * (o.power ?? 0.8), { type: 'highpass', f: 5200, q: 0.4 }, 0.01, 0.25); },
  // ---------- crowd ----------
  cheer(a, d, o) { const t = a.now(), p = o.power ?? 1, len = 1.6 + 2.2 * p;
    a.formant(d, t, len, 0.3 * p, [[700, 1.4, 1], [1150, 1.8, 0.8], [2600, 2.4, 0.35]], { sweep: 1.25, attack: 0.18, release: len * 0.6 });
    a.noise(d, t, len, 0.1 * p, { type: 'bandpass', f: 1300, q: 0.5, sweep: 900 }, 0.25, len * 0.65);
    a.clicks(d, t + 0.1, len * 0.9, 18 + 40 * p, 0.12 * p, 2200); if (p > 0.7) for (let i = 0; i < 3; i++) a.formant(d, t + R(0.1, 0.6), R(0.25, 0.5), 0.12, [[R(600, 900), 8, 1], [R(1400, 2200), 9, 0.5]], { sweep: R(0.9, 1.3), attack: 0.03 }); },
  applause(a, d, o) { const t = a.now(), len = o.len || 3, p = o.power ?? 0.7; a.clicks(d, t, len, 70 + 120 * p, 0.1 * p, 2300); a.noise(d, t, len, 0.12 * p, { type: 'bandpass', f: 3000, q: 0.5 }, 0.3, len * 0.6); },
  groan(a, d, o) { const t = a.now(), p = o.power ?? 0.8; a.formant(d, t, 1.6, 0.3 * p, [[420, 2, 1], [800, 2.5, 0.6]], { sweep: 0.62, attack: 0.15, release: 1.1 }); a.noise(d, t, 1.4, 0.12 * p, { type: 'bandpass', f: 500, q: 1.2, sweep: -250 }, 0.2, 1); },
  oohs(a, d, o) { const t = a.now(), p = o.power ?? 0.7; a.formant(d, t, 1.2, 0.3 * p, [[360, 3, 1], [800, 3.2, 0.5]], { sweep: 1.4, attack: 0.18, release: 0.8 }); a.noise(d, t, 1.0, 0.1 * p, { type: 'bandpass', f: 700, q: 2, sweep: 350 }, 0.15, 0.7); },
  boo(a, d, o) { const t = a.now(), p = o.power ?? 0.8, len = 1.8; a.formant(d, t, len, 0.3 * p, [[300, 3, 1], [640, 3.5, 0.55]], { sweep: 0.8, attack: 0.2, release: 1.2 }); a.noise(d, t, len, 0.1 * p, { type: 'bandpass', f: 380, q: 1.4 }, 0.2, 1.2); },
  gasp(a, d, o) { const t = a.now(), p = o.power ?? 0.7; a.noise(d, t, 0.55, 0.22 * p, { type: 'bandpass', f: 1800, q: 0.9, sweep: 1600 }, 0.25, 0.25); },
  chant(a, d, o) { const t = a.now(), n = o.n || 4, p = o.power ?? 0.7; for (let i = 0; i < n; i++) { const t0 = t + i * 0.55; a.formant(d, t0, 0.2, 0.26 * p, [[520, 3, 1], [1000, 3, 0.6]], { attack: 0.02 }); a.formant(d, t0 + 0.26, 0.22, 0.3 * p, [[430, 3, 1], [820, 3, 0.6]], { attack: 0.02 }); a.tone('sine', 62, d, t0, 0.12, 0.25 * p, { attack: 0.003, release: 0.1 }); } },
  shout(a, d, o) { const t = a.now(), f = R(520, 900); a.formant(d, t, R(0.25, 0.5), 0.22 * (o.power ?? 1), [[f, 9, 1], [f * 2.1, 10, 0.45]], { sweep: R(0.85, 1.25), attack: 0.03 }); },
  // ---------- interface ----------
  ui(a, d, o) { const t = a.now(); a.tone('sine', o.freq || 880, d, t, 0.06, 0.12, { attack: 0.003, release: 0.05 }); },
  uiTick(a, d) { const t = a.now(); a.noise(d, t, 0.02, 0.35, { type: 'highpass', f: 4000, q: 0.7 }, 0.001, 0.015); },
  uiConfirm(a, d) { const t = a.now(); a.tone('sine', 660, d, t, 0.09, 0.1, { attack: 0.004, release: 0.07 }); a.tone('sine', 990, d, t + 0.08, 0.14, 0.1, { attack: 0.004, release: 0.1 }); },
  uiError(a, d) { const t = a.now(); a.tone('square', 170, d, t, 0.18, 0.07, { attack: 0.004, release: 0.1, lp: 900 }); },
  uiSwoosh(a, d) { const t = a.now(); a.noise(d, t, 0.22, 0.12, { type: 'bandpass', f: 1000, q: 0.8, sweep: 1500 }, 0.09, 0.12); },
};
// Back-compat aliases (older rules used these names).
RECIPES.click = RECIPES.uiTick;

// ---------------------------------------------------------------------------------------------------------------
function buildHelper(ctx, noiseBuf) {
  const jit = () => 1 + (Math.random() - 0.5) * 0.04;
  const env = (g, t, len, peak, attack, release) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, t + Math.max(attack, len - release)); g.gain.linearRampToValueAtTime(0, t + len); };
  const h = {
    get ctx() { return ctx; },
    now: () => ctx.currentTime + 0.005,
    // oscillator voice with optional low/high-pass, pitch glide (to), and vibrato [hz, depthHz]
    tone(type, freq, dest, t, len, peak, { attack = 0.005, release = 0.08, lp = 0, hp = 0, to = 0, vib = null } = {}) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq * jit(), t);
      if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + len);
      env(g, t, len, peak, attack, release);
      let node = g; o.connect(g);
      if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
      if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
      node.connect(dest);
      if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vib[0]; lg.gain.value = vib[1]; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + len + 0.02); }
      o.start(t); o.stop(t + len + 0.02);
      return o;
    },
    noise(dest, t, len, peak, filt = {}, attack = 0.004, release = len * 0.7) {
      const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
      f.type = filt.type || 'bandpass'; f.frequency.setValueAtTime(filt.f || 1000, t); f.Q.value = filt.q || 1;
      if (filt.sweep) f.frequency.linearRampToValueAtTime(Math.max(60, (filt.f || 1000) + filt.sweep), t + len);
      // band/high-pass filtering removes most of the noise energy: compensate so `peak` means roughly what it says
      env(g, t, len, peak * ({ bandpass: 2.2, highpass: 2.6, lowpass: 1 }[filt.type || 'bandpass'] ?? 1), attack, release);
      s.connect(f).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + len + 0.05);
    },
    // random short clicks (claps, rattles): `density` per second
    clicks(dest, t, len, density, peak, f = 2000) {
      const n = Math.min(260, Math.round(len * density));
      for (let i = 0; i < n; i++) { const tt = t + Math.random() * len; h.noise(dest, tt, 0.018, peak * (0.4 + Math.random() * 0.6), { type: 'bandpass', f: f * (0.7 + Math.random() * 0.6), q: 1.5 }, 0.001, 0.015); }
    },
    // vowel-like voice: noise through parallel formant band-passes; `sweep` multiplies the formants over the length
    formant(dest, t, len, peak, formants, { sweep = 1, attack = 0.05, release = len * 0.6 } = {}) {
      const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 0.9 + Math.random() * 0.2;
      env(g, t, len, peak, attack, release);
      for (const [f, q, gain] of formants) { const b = ctx.createBiquadFilter(), gg = ctx.createGain(); b.type = 'bandpass'; b.frequency.setValueAtTime(f, t); if (sweep !== 1) b.frequency.linearRampToValueAtTime(f * sweep, t + len); b.Q.value = q; gg.gain.value = gain * 2.4; s.connect(b).connect(gg).connect(g); }
      g.connect(dest); s.start(t, Math.random()); s.stop(t + len + 0.05);
    },
  };
  return h;
}
function makeNoise(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0); let b = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = 0.6 * w + 2.2 * b; }
  return buf;
}
function makeImpulse(ctx, tail, decay) { // stereo generated impulse response (decaying noise, slightly darker late)
  const n = Math.floor(ctx.sampleRate * tail), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const k = i / n, w = Math.random() * 2 - 1; lp += (w - lp) * (0.9 - 0.7 * k); d[i] = lp * Math.pow(1 - k, decay) * 1.4; } }
  return buf;
}

// Render one recipe with an OfflineAudioContext (browser) and report level stats — used by tests / tuning.
export async function renderRecipeOffline(name, opts = {}, seconds = 4, rate = 44100) {
  const OAC = typeof window !== 'undefined' ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null;
  if (!OAC || !RECIPES[name]) return null;
  const ctx = new OAC(2, Math.ceil(seconds * rate), rate), nb = makeNoise(ctx), comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
  const g = ctx.createGain(); g.gain.value = 0.8; g.connect(comp);
  RECIPES[name](buildHelper(ctx, nb), g, opts);
  const out = await ctx.startRendering(); let peak = 0, sum = 0, n = 0, last = 0; const d = out.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (!Number.isFinite(v)) return { peak: NaN, rms: NaN }; if (v > peak) peak = v; sum += v * v; n++; if (v > 0.002) last = i; }
  return { peak, rms: Math.sqrt(sum / n), tail: last / rate };
}
export const RECIPE_NAMES = Object.keys(RECIPES);

function createAudioEngine() {
  let settings = loadAudioSettings();
  let ctx = null, master = null, comp = null, reverb = null, noiseBuf = null, helper = null, analyser = null;
  const buses = {}, sends = {};
  const beds = {}; // continuous layers
  let crowdLevel = 0, ambience = null, venue = 'stadium', duckLevel = 1, duckTimer = 0, lastShout = 0, bedLevels = {};
  const hasAudio = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);

  function ensure() {
    if (ctx || !hasAudio) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    master.connect(comp); comp.connect(analyser); comp.connect(ctx.destination);
    reverb = ctx.createConvolver(); const rg = ctx.createGain(); rg.gain.value = 1; reverb.connect(rg); rg.connect(master);
    for (const c of CATEGORIES) {
      buses[c] = ctx.createGain(); buses[c].connect(master);
      sends[c] = ctx.createGain(); sends[c].gain.value = 0; buses[c].connect(sends[c]); sends[c].connect(reverb);
    }
    noiseBuf = makeNoise(ctx); helper = buildHelper(ctx, noiseBuf);
    applyVenue(); applyVolumes();
    return ctx;
  }
  function applyVenue() {
    if (!ctx) return;
    const v = VENUES[venue] || VENUES.stadium; reverb.buffer = makeImpulse(ctx, v.tail, v.decay);
    for (const c of CATEGORIES) sends[c].gain.setTargetAtTime(v.wet[c] ?? 0, ctx.currentTime, 0.1);
  }
  function applyVolumes() {
    if (!ctx) return;
    master.gain.setTargetAtTime(settings.muted ? 0 : clamp01(settings.master), ctx.currentTime, 0.02);
    for (const c of CATEGORIES) { const duck = (c === 'CROWD' || c === 'AMBIENCE' || c === 'MUSIC') ? duckLevel : 1; buses[c].gain.setTargetAtTime(clamp01(settings[c]) * duck, ctx.currentTime, 0.05); }
  }

  // Continuous layers. Crowd = rumble (low) + chatter (mid, slowly modulated) + roar (high, only when loud).
  const BEDS = {
    crowd: { bus: 'CROWD', layers: [{ type: 'lowpass', f: 320, q: 0.5, k: 'rumble' }, { type: 'bandpass', f: 900, q: 0.7, k: 'chatter', lfo: 0.23 }, { type: 'bandpass', f: 1700, q: 0.5, k: 'roar' }] },
    ice: { bus: 'AMBIENCE', layers: [{ type: 'highpass', f: 4200, q: 0.4, level: 0.035 }, { type: 'lowpass', f: 160, q: 0.8, level: 0.07 }, { tone: 120, level: 0.012 }] },
    stadium: { bus: 'AMBIENCE', layers: [{ type: 'lowpass', f: 380, q: 0.4, level: 0.13 }, { type: 'bandpass', f: 2200, q: 0.4, level: 0.012, lfo: 0.11 }] },
    ballpark: { bus: 'AMBIENCE', layers: [{ type: 'lowpass', f: 520, q: 0.3, level: 0.08 }, { type: 'bandpass', f: 1400, q: 0.5, level: 0.01, lfo: 0.07 }] },
    skates: { bus: 'GAME_EFFECT', layers: [{ type: 'highpass', f: 3800, q: 0.5, k: 'live' }, { type: 'bandpass', f: 1500, q: 0.6, k: 'live', mul: 0.5 }] },
    pads: { bus: 'GAME_EFFECT', layers: [{ type: 'lowpass', f: 600, q: 0.5, k: 'live' }] },
  };
  function startBed(name) {
    if (!ctx || beds[name]) return;
    const r = BEDS[name]; if (!r) return;
    const nodes = [];
    for (const L of r.layers) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(buses[r.bus]);
      let src;
      if (L.tone) { src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.value = L.tone; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; src.connect(f).connect(g); src.start(); nodes.push({ src, g, L, f }); continue; }
      src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = 0.85 + Math.random() * 0.3;
      const f = ctx.createBiquadFilter(); f.type = L.type; f.frequency.value = L.f; f.Q.value = L.q; src.connect(f).connect(g); src.start(0, Math.random());
      let lfo = null;
      if (L.lfo) { lfo = ctx.createOscillator(); const lg = ctx.createGain(); lfo.frequency.value = L.lfo; lg.gain.value = L.f * 0.25; lfo.connect(lg).connect(f.frequency); lfo.start(); }
      nodes.push({ src, g, L, f, lfo });
    }
    beds[name] = { nodes, r };
    updateBeds(true);
  }
  function stopBed(name) { const b = beds[name]; if (!b) return; for (const n of b.nodes) { try { n.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); n.src.stop(ctx.currentTime + 1); n.lfo?.stop(ctx.currentTime + 1); } catch { /* already stopped */ } } delete beds[name]; }
  function updateBeds(immediate = false) {
    if (!ctx) return;
    const tc = immediate ? 0.05 : 0.35, k = crowdLevel / 100, now = ctx.currentTime;
    for (const [name, b] of Object.entries(beds)) for (const n of b.nodes) {
      let lvl = n.L.level ?? 0;
      if (name === 'crowd') { lvl = n.L.k === 'rumble' ? 0.05 + 0.2 * k : n.L.k === 'chatter' ? 0.025 + 0.2 * k : 0.34 * Math.pow(k, 2.6); n.f.frequency.setTargetAtTime(n.L.k === 'roar' ? 1300 + 900 * k : n.L.f * (0.8 + 0.5 * k), now, tc); }
      else if (n.L.k === 'live') lvl = (bedLevels[name] || 0) * 0.16 * (n.L.mul || 1);
      n.g.gain.setTargetAtTime(lvl, now, name === 'skates' || name === 'pads' ? 0.12 : tc);
    }
  }
  // random individual shouts / whistles from the stands, more frequent when the crowd is loud (no timers: driven by setCrowd ticks)
  function sparkle() {
    if (!beds.crowd || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime, k = crowdLevel / 100; if (now - lastShout < 1.6 - 1.2 * k) return;
    if (Math.random() > 0.02 + 0.06 * k) return; lastShout = now;
    api.play(Math.random() < 0.25 ? 'whistle' : 'shout', { category: 'CROWD', power: 0.35 + 0.5 * k, pan: R(-0.9, 0.9), far: 0.6, pitch: R(1.05, 1.25), len: 0.6 });
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
    get venue() { return venue; },
    volume(cat) { return settings.muted ? 0 : clamp01(settings.master) * clamp01(cat === 'master' ? 1 : settings[cat] ?? 1); },
    set(partial) { settings = { ...settings, ...partial }; saveAudioSettings(settings); applyVolumes(); },
    // opts: category, power, pan (−1..1), far (0..1: darker + quieter), gain, pitch/len/notes… (recipe-specific), delay (s)
    play(name, { category = 'GAME_EFFECT', pan = 0, far = 0, gain = 1, delay = 0, ...opts } = {}) {
      if (!ctx || ctx.state !== 'running' || settings.muted) return false;
      const r = RECIPES[name]; if (!r || !buses[category]) return false;
      try {
        const out = ctx.createGain(); out.gain.value = Math.max(0, gain) * (1 - 0.45 * clamp01(far)) * (0.93 + Math.random() * 0.14);
        let node = out;
        if (far > 0.05) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000 - 7000 * clamp01(far); out.connect(lp); node = lp; }
        if (ctx.createStereoPanner && Math.abs(pan) > 0.01) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); node = p; }
        node.connect(buses[category]);
        if (delay > 0) { const orig = helper.now; helper.now = () => ctx.currentTime + delay; try { r(helper, out, opts); } finally { helper.now = orig; } } else r(helper, out, opts);
        return true;
      } catch { return false; }
    },
    // Sport ambience for the mounted match ('stadium' | 'ice' | 'ballpark'); null stops all continuous layers.
    setAmbience(name) {
      if (ambience && ambience !== name) stopBed(ambience);
      ambience = name;
      const v = name === 'ice' ? 'arena' : name === 'ballpark' ? 'ballpark' : 'stadium'; if (v !== venue) { venue = v; applyVenue(); } else venue = v;
      if (!name) { stopBed('crowd'); stopBed('skates'); stopBed('pads'); return; }
      if (ctx?.state === 'running') { startBed('crowd'); startBed(name); }
    },
    setVenue(v) { if (VENUES[v]) { venue = v; applyVenue(); } },
    setCrowd(level) { crowdLevel = Math.max(0, Math.min(100, +level || 0)); updateBeds(); sparkle(); },
    // live continuous layer driven by the match (e.g. 'skates' 0..1 from average skater speed)
    setBedLevel(name, v) { bedLevels[name] = clamp01(v); if (!ctx || ctx.state !== 'running') return; if (!beds[name] && bedLevels[name] > 0.02) startBed(name); else updateBeds(); },
    // Ducking: lower crowd/ambience/music while the voice commentary speaks.
    duck(level = 0.45, ms = 0) {
      duckLevel = clamp01(level); applyVolumes(); clearTimeout(duckTimer);
      if (ms > 0) duckTimer = setTimeout(() => { duckLevel = 1; applyVolumes(); }, ms);
    },
    unduck() { clearTimeout(duckTimer); duckLevel = 1; applyVolumes(); },
    // Output level (RMS/peak of the master after the limiter) for tests and a VU meter.
    level() {
      if (!analyser) return { rms: 0, peak: 0 };
      const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d); let s = 0, p = 0;
      for (const v of d) { s += v * v; if (Math.abs(v) > p) p = Math.abs(v); }
      return { rms: Math.sqrt(s / d.length), peak: p };
    },
    recipes: RECIPE_NAMES,
    unlock,
    dispose() {
      for (const n of Object.keys(beds)) stopBed(n);
      clearTimeout(duckTimer);
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
