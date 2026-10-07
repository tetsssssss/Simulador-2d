// Match layer: game state (score, downs, clock, possession), play calling (user or CPU) and play-result
// presentation. Pure logic, no DOM — shared by the 2D game view (all modes) and the headless full-game sim.
// Every play is simulated by NFLPlay (src/sim/playSim.js); this module only reads its result/events.
import { buildLineups } from '../nflEngine.js';
import { createPlay, step, chooseConcept, chooseDefCall } from '../sim/playSim.js';
import { explainPlay } from '../sim/explain.js';
import { PLAYBOOK, DEF_CALLS } from '../sim/formation.js';
import { emptyBox, applyPlayEvents } from '../sim/stats.js';
import { createRng, hashSeed } from '../core/rng.js';

export const PLAY_TYPES = { run: 'RUN', pass: 'SHORT PASS', deep: 'DEEP PASS' };

const pretty = s => s.toLowerCase().split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
export function conceptLabel(concept) {
  if (!concept) return '';
  const m = /^(.*)_(L|R)$/.exec(concept);
  if (m && PLAYBOOK.run[concept]) return `${pretty(m[1])} ${m[2] === 'L' ? 'Left' : 'Right'}`;
  return pretty(concept).replace('Four Verts', '4 Verts');
}
export function defLabel(call) { return DEF_CALLS[call]?.label || call; }

// Run concepts grouped by family (Inside Zone, Duo, ...) for the play-call panel — only what PLAYBOOK implements.
export function runFamilies() {
  const fam = {};
  for (const k of Object.keys(PLAYBOOK.run)) { const base = k.replace(/_(L|R)$/, ''); (fam[base] ||= []).push(k); }
  return Object.entries(fam).map(([base, list]) => ({ base, label: pretty(base), L: list.find(x => x.endsWith('_L')), R: list.find(x => x.endsWith('_R')) }));
}
export function passConcepts(type) {
  return Object.entries(PLAYBOOK[type]).map(([k, c]) => ({ key: k, label: conceptLabel(k), routes: ['X', 'Z', 'SLOT', 'TE', 'RB'].map(s => `${s}:${c[s]}`).join(' · ') }));
}
export function defCalls() { return Object.entries(DEF_CALLS).map(([k, d]) => ({ key: k, label: d.label })); }

export function newGameState(prev = {}) {
  const qLen = (prev.quarterMin || 15) * 60;
  return {
    home: prev.home || 'SEA', away: prev.away || 'NE', homeScore: 0, awayScore: 0, down: 1, distance: 10, ballOn: 25,
    possession: 'home', log: [], quarter: 1, clock: qLen, qLen, seed: prev.seed || `G${Date.now().toString(36).toUpperCase()}`,
    playNo: 0, box: emptyBox(), energy: {}, over: false, lastEvents: [], drives: 0,
    scoring: [], // { q, clock, team, text }
  };
}

export const offAbbr = g => (g.possession === 'home' ? g.home : g.away);
export const defAbbr = g => (g.possession === 'home' ? g.away : g.home);
export function clockStr(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }
export function ballSpot(g) { return g.ballOn === 50 ? '50' : g.ballOn < 50 ? `${offAbbr(g)} ${g.ballOn}` : `${defAbbr(g)} ${100 - g.ballOn}`; }
export function downText(g) {
  const ord = ['1st', '2nd', '3rd', '4th'][Math.min(3, g.down - 1)];
  return `${ord} & ${g.ballOn + g.distance >= 100 ? 'Goal' : g.distance}`;
}

// Lineup cache per (off, def, roster size): lineups + id→info map (box score / names).
export function makeLineupCache(getRoster) {
  const cache = new Map();
  return {
    get(off, def) {
      const roster = getRoster();
      const key = `${off}|${def}|${roster.length}`;
      if (!cache.has(key)) {
        const ls = buildLineups(roster, off, def), who = {};
        for (const p of ls.offense) who[p.gsis_id || p.full_name] = { name: p.full_name, team: off, pos: p.position, p };
        for (const p of ls.defense) who[p.gsis_id || p.full_name] = { name: p.full_name, team: def, pos: p.position, p };
        cache.set(key, { ...ls, who });
      }
      return cache.get(key);
    },
    clear() { cache.clear(); },
  };
}

// ---------- CPU play calling (seeded: same game seed + play number → same call) ----------
export function cpuOffenseCall(g) {
  const rng = createRng(hashSeed(`${g.seed}-${g.playNo + 1}-ocall`));
  const d = g.distance, dn = g.down, goal = g.ballOn + d >= 100;
  let run = dn === 1 ? 0.48 : d <= 2 ? 0.62 : d <= 5 ? 0.42 : d >= 8 && dn >= 2 ? 0.2 : 0.36;
  if (goal && d <= 3) run += 0.1;
  let deep = d >= 9 ? 0.3 : dn === 1 ? 0.17 : 0.12;
  if (g.ballOn > 80) deep *= 0.4;
  const type = rng.weighted([['run', run], ['deep', (1 - run) * deep], ['pass', (1 - run) * (1 - deep)]]);
  const concept = type === 'run' ? rng.pick(Object.keys(PLAYBOOK.run)) : chooseConcept(rng, type, dn, d);
  return { playType: type, concept };
}
export function cpuDefenseCall(g) {
  const rng = createRng(hashSeed(`${g.seed}-${g.playNo + 1}-dcall`));
  return chooseDefCall(rng, g.down, g.distance, true); // CPU uses the full menu (Cover 0/1/2/3/4/6, Tampa 2)
}

// Build the NFLPlay for the next snap. call = { playType, concept?, defCall? }.
export function snap(g, ls, call, tuning) {
  return createPlay({
    offense: ls.offense, defense: ls.defense, ballOn: g.ballOn, down: g.down, distance: g.distance,
    playType: call.playType, concept: call.concept, defCall: call.defCall, stunt: call.stunt,
    seed: `${g.seed}-${g.playNo + 1}-${call.playType}`, energy: g.energy, tuning,
  });
}

// ---------- result presentation (derived only from the engine's events) ----------
export function summarize(sim, who) {
  const r = sim.result, ev = r.events, f = t => ev.find(e => e.type === t);
  const nm = id => who[id]?.name || id || '—';
  const pos = id => who[id]?.pos || '';
  const ent = id => sim.ents.find(e => e.id === id);
  const tk = f('TACKLE');
  const tackle = tk ? `${pos(tk.by)} ${ent(tk.by)?.jersey ? '#' + ent(tk.by).jersey : ''} ${nm(tk.by)}`.trim() : null;
  const isRun = r.playType === 'run';
  const pa = f('PASS_ATTEMPT');
  let route = '';
  if (pa?.target) { const slot = ent(pa.target)?.slot; route = PLAYBOOK[r.playType]?.[r.concept]?.[slot] || ''; }
  const title = isRun ? conceptLabel(r.concept).toUpperCase() : `PASS — ${(route || conceptLabel(r.concept)).replace(/_/g, ' ')}`;
  const out = { title, concept: conceptLabel(r.concept), defense: r.defLabel, outcome: r.outcome, yards: r.yards, tackle, lines: [], tone: 'neutral', badge: '' };
  const yd = n => `${n > 0 ? '+' : ''}${n} yd`;
  const broken = ev.filter(e => e.type === 'BROKEN_TACKLE').length;
  switch (r.outcome) {
    case 'RUSH': {
      const c = f('HANDOFF')?.to;
      out.lines.push(nm(c)); out.badge = yd(r.yards); out.tone = r.yards >= 10 ? 'good' : r.yards <= 0 ? 'bad' : 'neutral';
      if (r.contactX !== null) out.lines.push(`YBC ${Math.max(-9, Math.round(r.contactX))} · YAC ${Math.round(r.yards - r.contactX)}${broken ? ` · ${broken} MTF` : ''}`);
      break;
    }
    case 'COMPLETE': out.lines.push(`${nm(pa.passer)} → ${nm(f('PASS_COMPLETE').receiver)}`); out.badge = yd(r.yards); out.tone = r.yards >= 15 ? 'good' : 'neutral'; break;
    case 'INCOMPLETE': {
      const i = f('INCOMPLETE');
      out.badge = 'INCOMPLETE'; out.tone = 'bad';
      out.lines.push(pa?.throwAway ? `${nm(pa.passer)} joga fora` : `${nm(pa?.passer)} → ${nm(pa?.target)}`);
      if (i?.reason) out.lines.push(`${i.reason.replace(/_/g, ' ')}${i.by && i.reason === 'BREAKUP' ? ` · ${nm(i.by)}` : ''}`);
      break;
    }
    case 'INTERCEPTION': out.badge = 'INTERCEPTION'; out.tone = 'bad'; out.lines.push(`${nm(pa?.passer)} → ${nm(f('INTERCEPTION').by)}`); break;
    case 'SACK': { const s = f('SACK'); out.title = 'SACK'; out.badge = yd(r.yards); out.tone = 'bad'; out.lines.push(`${nm(s?.qb)}${s?.by ? ` · por ${nm(s.by)}` : ''}`); break; }
    case 'SCRAMBLE': out.title = 'QB SCRAMBLE'; out.badge = yd(r.yards); out.lines.push(nm(f('SCRAMBLE')?.id)); break;
    case 'FUMBLE_LOST': out.badge = 'FUMBLE'; out.tone = 'bad'; out.lines.push(`Recuperado por ${nm(f('FUMBLE_RECOVERY')?.by)}`); break;
    default: out.badge = r.outcome;
  }
  try { out.why = explainPlay(sim); } catch { out.why = null; } // "Por que terminou" (evidence from the sim's own record)
  if (r.touchdown === 'off' || r.touchdown === 'def') { out.badge = 'TOUCHDOWN'; out.tone = r.touchdown === 'off' ? 'good' : 'bad'; }
  if (r.safety) out.badge = 'SAFETY';
  return out;
}

// Short one-line text for the game log.
export function logText(sum) {
  const yards = ['RUSH', 'COMPLETE', 'SCRAMBLE', 'SACK'].includes(sum.outcome) ? ` — ${sum.yards} yd` : '';
  const what = sum.outcome === 'COMPLETE' ? 'Complete' : sum.outcome === 'INCOMPLETE' ? 'Incomplete' : sum.outcome === 'INTERCEPTION' ? 'INTERCEPTION' : sum.outcome === 'FUMBLE_LOST' ? 'FUMBLE' : '';
  const base = sum.outcome === 'RUSH' ? sum.concept : sum.title === 'SACK' ? 'Sack' : sum.title.replace('PASS — ', '').toLowerCase().replace(/^./, c => c.toUpperCase());
  return `${base}${what ? ` — ${what}` : ''}${yards}${sum.lines[0] ? ` · ${sum.lines[0]}` : ''}`;
}

// Apply one finished play to the game state. Returns { sum, notes[] } (notes = TD, first down, turnover, ...).
export function applyPlay(g, sim, who) {
  const r = sim.result, off = offAbbr(g), def = defAbbr(g);
  applyPlayEvents(g.box, r.events, who, off);
  for (const e of sim.ents) g.energy[e.id] = Math.min(1, e.energy + 0.06); // partial recovery between plays
  g.playNo++;
  const sum = summarize(sim, who);
  const entry = { q: Math.min(4, g.quarter), clock: clockStr(g.clock), off, situation: `${downText(g)} · ${ballSpot(g)}`, text: logText(sum), why: sum.why?.why || '', tone: sum.tone, kind: 'play' };
  g.log.unshift(entry);
  const notes = [];
  const note = (text, kind = 'note') => { notes.push(text); g.log.unshift({ q: Math.min(4, g.quarter), clock: clockStr(g.clock), off, text, kind }); };
  const add = (pts, team) => { if (team === g.home) g.homeScore += pts; else g.awayScore += pts; };
  const flip = ballOn => { g.possession = g.possession === 'home' ? 'away' : 'home'; g.down = 1; g.ballOn = Math.max(1, Math.min(99, ballOn)); g.distance = Math.min(10, 100 - g.ballOn); g.drives++; };
  const score = (team, text) => g.scoring.push({ q: Math.min(4, g.quarter), clock: clockStr(g.clock), team, text });
  if (r.touchdown === 'off') { add(7, off); note(`TOUCHDOWN ${off}! (PAT automático)`, 'score'); score(off, `TD · ${sum.title} ${sum.lines[0] || ''}`); flip(25); }
  else if (r.touchdown === 'def') { add(7, def); note(`TOUCHDOWN DEFENSIVO ${def}!`, 'score'); score(def, 'TD defensivo'); g.down = 1; g.ballOn = 25; g.distance = 10; }
  else if (r.safety) { add(2, def); note(`SAFETY! +2 ${def}`, 'score'); score(def, 'Safety'); flip(35); }
  else if (r.turnover) { const spot = r.spotX >= 110 ? 20 : 110 - r.spotX; note(`Turnover — posse ${def}`, 'turnover'); flip(Math.round(spot)); }
  else {
    g.ballOn = Math.round(r.spotX - 10);
    if (r.yards >= g.distance) { g.down = 1; g.distance = Math.min(10, 100 - g.ballOn); if (r.yards > 0) notes.push('1ª descida!'); }
    else {
      g.distance -= r.yards; g.down++;
      if (g.down > 4) { note(`Turnover on downs — posse ${def}`, 'turnover'); flip(100 - g.ballOn); }
    }
  }
  // Game clock: play time, plus runoff when the clock keeps running (scaled with quarter length).
  const runoff = 25 * (g.qLen / 900);
  g.clock -= r.duration + (r.clockStops ? 0 : runoff);
  if (g.clock <= 0) {
    if (g.quarter >= 4) { g.clock = 0; g.over = true; note(`FINAL: ${g.away} ${g.awayScore} x ${g.homeScore} ${g.home}`, 'final'); }
    else {
      g.quarter++; g.clock = g.qLen; note(`Início do ${g.quarter}º quarto`, 'period');
      if (g.quarter === 3) { g.possession = 'away'; g.down = 1; g.distance = 10; g.ballOn = 25; }
    }
  }
  g.lastEvents = r.events;
  return { sum, notes };
}

// Headless full game with the real engine (every snap is an NFLPlay run to the whistle). Yields between chunks
// so the UI can stay responsive. Used by career "Sim game" and Spectator "Sim to end".
export async function simulateGame({ roster, home, away, seed, tuning, quarterMin = 15, controls = {}, onProgress }) {
  const g = newGameState({ home, away, seed, quarterMin });
  return simulateRest(g, makeLineupCache(() => roster), { tuning, controls, onProgress });
}

// Continue an existing game to the final whistle with CPU calls on both sides.
export async function simulateRest(g, cache, { tuning, controls = {}, onProgress } = {}) {
  let n = 0;
  while (!g.over && n < 400) {
    const ls = cache.get(offAbbr(g), defAbbr(g));
    const call = { ...cpuOffenseCall(g), defCall: cpuDefenseCall(g) };
    const sim = snap(g, ls, call, tuning);
    while (step(sim));
    applyPlay(g, sim, ls.who);
    if (++n % 12 === 0) { onProgress?.(g); await new Promise(res => setTimeout(res, 0)); }
    if (controls.cancel) break;
  }
  return g;
}
