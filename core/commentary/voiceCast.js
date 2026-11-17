// VoiceCast ("dublador"): two casters on top of the browser Web Speech API (local voices, nothing external).
//   play  = play-by-play caller (faster, brighter)       color = analyst (slower, lower; reacts to turnovers / bad news)
// Pure helpers (`pickVoices`, `prosodyFor`, `roleFor`) have no DOM dependency so they are unit-tested in Node with a fake synth.
// Same SpeechAdapter interface as createWebSpeech: { minPriority, speak(text, line), cancel() }.

const GOOD_HINTS = /natural|neural|online|google|premium|enhanced/i;

// Rank installed voices for a language (BCP-47, e.g. 'pt-BR'). Returns [primary, secondary] (secondary differs from primary when possible).
export function pickVoices(voices, lang = 'pt-BR', prefs = {}) {
  const base = lang.slice(0, 2).toLowerCase();
  const score = v => {
    const l = (v.lang || '').replace('_', '-');
    let s = 0;
    if (l.toLowerCase() === lang.toLowerCase()) s += 100; else if (l.slice(0, 2).toLowerCase() === base) s += 50; else return -1;
    if (GOOD_HINTS.test(v.name || '')) s += 20;
    if (v.localService) s += 5;                       // offline voices avoid network hiccups
    if (prefs.play && v.name === prefs.play) s += 1000;
    if (prefs.color && v.name === prefs.color) s += 500;
    return s;
  };
  const ranked = (voices || []).map(v => [v, score(v)]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const play = (prefs.play && ranked.find(v => v.name === prefs.play)) || ranked[0] || null;
  const color = (prefs.color && ranked.find(v => v.name === prefs.color && v !== play)) || ranked.find(v => v !== play) || play;
  return { play, color, all: ranked };
}

// Which caster reads this line: the analyst takes turnovers / bad news / reviews; the caller takes everything else.
const COLOR_TONES = new Set(['turnover', 'bad', 'review']);
export function roleFor(line) { return line && COLOR_TONES.has(line.tone) ? 'color' : 'play'; }

// Delivery by emotion. priority 3 = big moment (touchdown, goal, home run...). Values are Web Speech rate/pitch/volume.
export function prosodyFor(line, role = 'play', baseRate = 1.05) {
  const p = line?.priority ?? 1, tone = line?.tone || 'normal';
  let rate = baseRate, pitch = role === 'color' ? 0.9 : 1.0, volume = 0.9;
  if (role === 'color') rate -= 0.06;
  if (tone === 'score') { rate += 0.12; pitch += 0.15; volume = 1; }
  else if (tone === 'turnover' || tone === 'bad') { rate -= 0.04; pitch -= 0.08; }
  else if (tone === 'good') { rate += 0.04; pitch += 0.05; }
  if (p >= 3) { rate += 0.06; volume = 1; } else if (p <= 1) { rate -= 0.05; volume = 0.85; }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  return { rate: clamp(rate, 0.7, 1.6), pitch: clamp(pitch, 0.6, 1.6), volume: clamp(volume, 0, 1) };
}

export function createVoiceCast({
  lang = 'pt-BR', minPriority = 2, volume = () => 1, pronounce = s => s, baseRate = 1.05, prefs = {},
  synth = typeof window !== 'undefined' ? window.speechSynthesis : null,
  Utterance = typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : null,
  audio = () => (typeof window !== 'undefined' ? window.__asuAudio : null),
} = {}) {
  if (!synth || !Utterance) return { minPriority: 99, speak() {}, cancel() {}, voices: () => [], setLang() {}, setPrefs() {}, cast: () => ({}) };
  let cast = pickVoices(synth.getVoices?.() || [], lang, prefs);
  const refresh = () => { cast = pickVoices(synth.getVoices?.() || [], lang, prefs); };
  // voices load asynchronously in Chromium: re-pick when the list arrives
  if (synth.addEventListener) synth.addEventListener('voiceschanged', refresh); else if ('onvoiceschanged' in synth) synth.onvoiceschanged = refresh;
  return {
    minPriority,
    speak(text, line) {
      if (!text) return;
      if (line && line.priority >= 3) synth.cancel();                 // big moments interrupt
      else if (synth.pending || synth.speaking) return;               // never queue a backlog
      const role = roleFor(line), pr = prosodyFor(line, role, baseRate), u = new Utterance(pronounce(text));
      const v = cast[role]; if (v) u.voice = v;
      u.lang = (v && v.lang) || lang; u.rate = pr.rate; u.pitch = pr.pitch; u.volume = Math.max(0, Math.min(1, pr.volume * volume()));
      const a = audio();
      u.onstart = () => a?.duck?.(0.45, 12000); u.onend = u.onerror = () => a?.unduck?.();
      synth.speak(u);
    },
    cancel() { synth.cancel(); audio()?.unduck?.(); },
    voices: () => cast.all,
    cast: () => ({ play: cast.play?.name || null, color: cast.color?.name || null }),
    setLang(l) { lang = l; refresh(); },
    setMinPriority(n) { this.minPriority = n; },
    setPrefs(p) { prefs = { ...prefs, ...p }; refresh(); },
  };
}
