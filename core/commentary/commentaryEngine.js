// CommentaryEngine — CommentaryEvent → Text (→ optional SpeechAdapter).
// Sport packs provide templates: { [eventType]: [ (ev, ctx, h) => string | null, ... ] }. The engine picks a variant
// with a seeded RNG (reproducible per seed) while avoiding the variants used recently for the same event type.
// Context (names, team, score, clock, situation, streaks) is passed in `ctx`; the engine keeps a short memory so packs
// can react to sequences (h.streak / h.last).
import { createRng } from '../rng/rng.js';

export function createCommentary({ pack, seed = 'commentary', speech = null, maxLines = 120, avoidRecent = 3, colorEvery = 7 } = {}) {
  const rng = createRng(String(seed)); let sinceColor = 0; const recentColor = [];
  const recent = new Map(); // type -> [variant indexes]
  const lines = [];
  const memory = { last: [], counters: {} };
  const subs = new Set();
  let speaking = speech;

  // First time a player is called by last name in this game he is introduced with the full name; afterwards the last name only.
  const introduced = new Set();
  const introNames = ctx => {
    if (!ctx || !ctx.last || !ctx.name || ctx.__intro) return ctx;
    return { ...ctx, __intro: true, last: id => { const n = ctx.name(id), l = ctx.last(id); if (!id || !n || n === l || introduced.has(id)) return l; introduced.add(id); const num = ctx.num?.(id); return num ? `#${num} ${n}` : n; } };
  };

  const h = {
    pick: arr => arr[Math.floor(rng.next() * arr.length)],
    chance: p => rng.next() < p,
    streak: key => memory.counters[key] || 0,
    bump: (key, reset = []) => { memory.counters[key] = (memory.counters[key] || 0) + 1; for (const r of reset) memory.counters[r] = 0; return memory.counters[key]; },
    reset: key => { memory.counters[key] = 0; },
    last: (type) => memory.last.find(l => l.type === type) || null,
  };

  function choose(type, ev, ctx) {
    const variants = pack[type];
    if (!variants || !variants.length) return null;
    const used = recent.get(type) || [];
    const order = variants.map((_, i) => i).filter(i => !used.includes(i));
    const pool = order.length ? order : variants.map((_, i) => i);
    // shuffle pool deterministically, then take the first variant that produces text for this context
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    for (const idx of pool) {
      const text = variants[idx](ev, ctx, h);
      if (text) {
        used.push(idx); while (used.length > Math.min(avoidRecent, variants.length - 1)) used.shift();
        recent.set(type, used);
        return text;
      }
    }
    // every non-recent variant was conditional and returned null: retry with all variants so the line is never silent
    for (const idx of variants.map((_, i) => i).filter(i => !pool.includes(i))) {
      const text = variants[idx](ev, ctx, h);
      if (text) { used.push(idx); while (used.length > Math.min(avoidRecent, variants.length - 1)) used.shift(); recent.set(type, used); return text; }
    }
    return null;
  }

  const api = {
    // Returns the CommentaryLine produced (or null when the pack is silent for this event).
    describe(ev, ctx = {}) {
      ctx = introNames(ctx);
      let text = choose(ev.type, ev, ctx);
      if (text && pack.$story) { const extra = pack.$story(ev, ctx, h); if (extra) text = `${text} ${extra}`; }   // milestone sentence ("second goal tonight")
      if (pack.$after) pack.$after(ev, ctx, h);
      if (!text) return null;
      const line = { id: lines.length + 1, type: ev.type, text, clock: ctx.clockLabel || '', tone: (pack.$tone && pack.$tone(ev, ctx)) || 'normal', priority: (pack.$priority && pack.$priority(ev, ctx)) || 1 };
      const push = l => { lines.unshift(l); if (lines.length > maxLines) lines.length = maxLines; for (const s of subs) s(l); if (speaking && l.priority >= (speaking.minPriority ?? 2)) speaking.speak(l.text, l); };
      memory.last.unshift({ type: ev.type, ev }); if (memory.last.length > 12) memory.last.length = 12;
      push(line);
      // analyst ("color") remark: facts from the game state, never on big moments, at most one every `colorEvery` lines
      sinceColor++;
      if (pack.$color && line.priority < 3 && sinceColor >= colorEvery && rng.next() < 0.7) {
        let ct = null; for (let k = 0; k < 4 && !ct; k++) { const c2 = pack.$color(ev, ctx, h); if (c2 && !recentColor.includes(c2)) ct = c2; }   // never repeat the last few remarks
        if (ct) { recentColor.push(ct); if (recentColor.length > 6) recentColor.shift(); sinceColor = 0; push({ id: lines.length + 1, type: 'COLOR', text: ct, clock: line.clock, tone: 'color', priority: 2 }); }
      }
      return line;
    },
    // PresentationEngine listener interface
    onEvent(ev, ctx) { api.describe(ev, ctx); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    get lines() { return lines; },
    get lang() { return pack.$lang || 'pt-BR'; },     // language of the generated text (the voice must follow it)
    setSpeech(adapter) { speaking?.cancel?.(); speaking = adapter; },
    dispose() { speaking?.cancel?.(); subs.clear(); },
  };
  return api;
}

// ---------- Speech adapters (TTS ready; nothing external is required) ----------
export const NullSpeech = { speak() {}, cancel() {}, minPriority: 99 };
// Browser Web Speech API (optional, local voices). Only the most important lines are spoken (minPriority).
export function createWebSpeech({ lang = 'pt-BR', rate = 1.08, minPriority = 2, volume = () => 1 } = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!synth) return NullSpeech;
  return {
    minPriority,
    speak(text, line) {
      if (line && line.priority >= 3) synth.cancel(); // big moments interrupt
      if (synth.pending && synth.speaking) return; // never queue a backlog of commentary
      const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = rate; u.volume = Math.max(0, Math.min(1, volume()));
      // duck crowd / ambience / music while the voice speaks (AudioEngine singleton, if the sport created one)
      const audio = typeof window !== 'undefined' ? window.__asuAudio : null;
      u.onstart = () => audio?.duck?.(0.45, 12000); u.onend = u.onerror = () => audio?.unduck?.();
      synth.speak(u);
    },
    cancel() { synth.cancel(); window.__asuAudio?.unduck?.(); },
  };
}
