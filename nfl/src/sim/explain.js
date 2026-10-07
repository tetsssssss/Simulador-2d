// "Por que terminou": a compact, evidence-based explanation of a finished play. Every sentence is derived from the
// simulation's own record (events, debug events, block log, pressure log, QB actions, pocket measurements) -- never
// invented. Pure function of the finished `sim`; safe to call for any play (returns null before the whistle).
import { RUSH_MOVE_LABEL } from './blocking.js';

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const lastName = n => { const w = String(n || '').trim().split(/\s+/); while (w.length > 1 && SUFFIX.test(w[w.length - 1])) w.pop(); return w[w.length - 1] || ''; };
const mv = m => (m ? (RUSH_MOVE_LABEL[m] || m).toLowerCase() : null);
const fx = n => (Math.round(n * 10) / 10).toString().replace('.', ',');

const INCOMPLETE_TEXT = {
  BREAKUP: 'passe quebrado pela defesa', DEFLECTED: 'passe desviado na linha de passe', DROP: 'o receptor deixou cair',
  UNCATCHABLE: 'passe impossível de pegar', OVERTHROWN: 'passe longo demais', INCOMPLETE: 'bola no chão (sem posse)',
  OUT_OF_BOUNDS: 'receptor fora de campo', THROWAWAY: 'QB jogou fora para evitar o sack',
};
const TECH_TEXT = { REACH: 'reach', DRIVE: 'drive', DOUBLE: 'dobra', COMBO: 'combo', PULL: 'pull', SEAL: 'seal', CLIMB: 'climb', KICK: 'kick-out', TRAP: 'trap' };

export function explainPlay(sim) {
  const r = sim?.result;
  if (!r) return null;
  const ev = r.events, dbg = sim.debugEvents || [];
  const ent = id => sim.ents.find(e => e.id === id);
  const nm = id => { const e = ent(id); return e ? `${e.slot} ${lastName(e.name)}` : (id || '—'); };
  const f = t => ev.find(e => e.type === t);
  const isRun = r.playType === 'run';
  const out = { reason: r.outcome, why: '', passer: null, target: null, receiver: null, tacklers: [], pressure: [], blockWinners: [], blockLosers: [], stunt: null, pocket: null, qbActions: [], lines: [] };

  // ---- passing ----
  const pa = f('PASS_ATTEMPT'), pc = f('PASS_COMPLETE'), inc = f('INCOMPLETE'), pick = f('INTERCEPTION');
  if (pa) { out.passer = pa.passer; out.target = pa.target; }
  if (pc) out.receiver = pc.receiver;

  // ---- tackle / sack ----
  const tk = f('TACKLE'), sk = f('SACK');
  if (tk) out.tacklers = [tk.by, ...(tk.assists || [])];
  if (sk?.by) out.tacklers = [sk.by];

  // ---- pass rush: who pressured and with which move ----
  const wins = dbg.filter(e => e.type === 'RUSH_WIN');
  const seen = new Set();
  for (const p of sim.pressureLog || []) if (p.by && !seen.has(p.by)) { seen.add(p.by); out.pressure.push({ id: p.by, move: p.move, t: p.t, won: p.won, unblocked: p.unblocked }); }
  for (const w of wins) if (!seen.has(w.by)) { seen.add(w.by); out.pressure.push({ id: w.by, move: w.move, t: w.t, won: true, unblocked: false, over: w.over }); }
  if (sk?.by && !seen.has(sk.by)) out.pressure.push({ id: sk.by, move: sk.move, t: r.duration, won: !!sk.move, unblocked: !!sk.unblocked });

  // ---- blocks ----
  const log = [...(sim.blockLog || [])];
  for (const eng of sim.engagements) log.push({ t: +sim.t.toFixed(2), mode: eng.mode, def: eng.def.id, blockers: eng.blockers.map(b => b.id), tech: eng.blockers[0]?.assignment?.tech || null, move: eng.mode === 'PASS' ? eng.move : null, lev: +eng.lev.toFixed(2), outcome: eng.lev < -0.3 ? 'BLOCK_WIN' : eng.lev > 0.3 ? 'DEF_WIN' : 'ACTIVE', at: { x: eng.def.pos.x, y: eng.def.pos.y } });
  const mode = isRun ? 'RUN' : 'PASS';
  const spotX = r.spotX, rel = e => Math.abs((e.at?.x ?? spotX) - spotX);
  const relevant = log.filter(e => e.mode === mode || (isRun && e.mode === 'RUN'));
  const winners = relevant.filter(e => e.outcome === 'BLOCK_WIN').sort((a, b) => (isRun ? rel(a) - rel(b) : a.lev - b.lev));
  const losers = relevant.filter(e => e.outcome === 'DEF_WIN').sort((a, b) => (isRun ? rel(a) - rel(b) : a.t - b.t));
  out.blockWinners = winners.slice(0, 2).map(e => ({ blockers: e.blockers, def: e.def, tech: e.tech, lev: e.lev }));
  out.blockLosers = losers.slice(0, 2).map(e => ({ blockers: e.blockers, def: e.def, tech: e.tech, move: e.move, t: e.t }));

  // ---- stunt / pocket / QB ----
  if (sim.stunt) out.stunt = { type: sim.stunt.type, pen: sim.stunt.pen.id, loop: sim.stunt.loop.id, phase: sim.stunt.phase, picked: dbg.some(e => e.type === 'STUNT_PICKUP') };
  const pk = sim.qbState?.pocket;
  if (!isRun && pk) out.pocket = { collapse: pk.collapse, leak: pk.leak, sector: pk.sector, depth: pk.depth, width: pk.width };
  out.qbActions = (sim.qbActions || []).map(a => a.action);

  // ---- the reason the play ended ----
  let why;
  const dur = fx(r.duration);
  if (r.touchdown) why = r.touchdown === 'off' ? 'Touchdown: o portador chegou à end zone.' : 'Touchdown defensivo após a virada de posse.';
  else if (r.safety) why = 'Safety: o portador foi parado dentro da própria end zone.';
  else if (r.outcome === 'INTERCEPTION') why = `Interceptação de ${nm(pick?.by)} em passe de ${nm(pick?.passer)}.`;
  else if (r.outcome === 'FUMBLE_LOST') { const fr = f('FUMBLE_RECOVERY'); why = `Fumble${f('FUMBLE')?.forcedBy ? ` forçado por ${nm(f('FUMBLE').forcedBy)}` : ''}; ${fr ? `recuperado por ${nm(fr.by)} (${fr.lost ? 'posse perdida' : 'posse mantida'})` : 'sem recuperação'}.`; }
  else if (r.outcome === 'SACK') {
    const mvTxt = sk?.move ? ` com ${mv(sk.move)}` : sk?.unblocked ? ' livre (sem bloqueio)' : '';
    why = sk?.by ? `Sack de ${nm(sk.by)}${mvTxt} aos ${dur}s.` : `QB derrubado atrás da linha aos ${dur}s.`;
  } else if (r.outcome === 'INCOMPLETE') {
    const t = INCOMPLETE_TEXT[inc?.reason] || 'passe incompleto';
    why = `Incompleto: ${t}${inc?.by && ['BREAKUP', 'DEFLECTED', 'DROP'].includes(inc.reason) ? ` (${nm(inc.by)})` : ''}${pa?.hurried && !pa?.throwAway ? '; QB apressado' : ''}.`;
  } else if (r.reason === 'OUT_OF_BOUNDS') why = `Portador saiu de campo${r.outcome === 'COMPLETE' ? ' após a recepção' : ''}.`;
  else if (r.reason === 'TIME') why = 'Tempo máximo de jogada esgotado.';
  else if (tk) why = `Tackle de ${nm(tk.by)}${tk.assists?.length ? ` (+${tk.assists.length} assist.)` : ''} após ${r.yards} jd${Math.abs(r.yards) === 1 ? '' : 's'}.`;
  else why = `Jogada encerrada (${String(r.reason || r.outcome).toLowerCase()}).`;
  out.why = why;

  // ---- compact lines ----
  const L = out.lines;
  L.push({ k: 'Fim', t: why });
  if (isRun) {
    const rb = f('HANDOFF')?.to;
    const dec = dbg.filter(e => e.type === 'RB_DECISION');
    const lastDec = dec[dec.length - 1];
    L.push({ k: 'Corrida', t: `${nm(rb)}${lastDec ? ` · decisão ${lastDec.decision}${lastDec.free ? ` (${lastDec.free} defensor${lastDec.free > 1 ? 'es' : ''} livre${lastDec.free > 1 ? 's' : ''})` : ''}` : ''}${r.contactX != null ? ` · contato em ${r.contactX >= 0 ? '+' : ''}${fx(r.contactX)} jd` : ''}` });
  } else if (pa) {
    L.push({ k: 'Passe', t: `${nm(pa.passer)} → ${pa.throwAway ? 'fora (arremesso descartado)' : nm(pa.target)} · ${fx(pa.airYards)} jd no ar${pc?.contested ? ' · contestado' : ''}${pa.hurried ? ' · apressado' : ''}` });
  } else if (r.outcome === 'SCRAMBLE') L.push({ k: 'QB', t: `${nm(f('SCRAMBLE')?.id)} deixou o bolsão e correu.` });
  const bw = out.blockWinners.map(b => `${b.blockers.map(nm).join(' + ')}${b.tech ? ` (${TECH_TEXT[b.tech] || b.tech.toLowerCase()})` : ''} dominou ${nm(b.def)}`);
  const bl = out.blockLosers.map(b => `${nm(b.def)}${b.move ? ` (${mv(b.move)})` : ''} venceu ${b.blockers.map(nm).join(' + ')}`);
  if (bw.length || bl.length) L.push({ k: 'Bloqueio', t: [...bw, ...bl].slice(0, 3).join(' · ') });
  if (out.pressure.length) L.push({ k: 'Pressão', t: out.pressure.slice(0, 3).map(p => `${nm(p.id)}${p.move ? ` (${mv(p.move)})` : p.unblocked ? ' (livre)' : ''}`).join(', ') + (out.pocket?.collapse > 0.35 ? ` · bolsão colapsou${out.pocket.leak === 'EDGE' ? ` pela borda ${out.pocket.sector === 'L' ? 'esq.' : 'dir.'}` : ' pelo meio'} (${Math.round(out.pocket.collapse * 100)}%)` : '') });
  if (out.stunt) L.push({ k: 'Stunt', t: `${out.stunt.type === 'TE' ? 'tackle-end' : 'end-tackle'}: ${nm(out.stunt.pen)} penetrou, ${nm(out.stunt.loop)} contornou${out.stunt.picked ? ' (linha leu o stunt)' : ''}` });
  if (out.qbActions.length) L.push({ k: 'QB', t: [...new Set(out.qbActions)].join(' → ').replace(/_/g, ' ').toLowerCase() });
  if (out.tacklers.length && !tk && !sk) L.push({ k: 'Defesa', t: out.tacklers.map(nm).join(', ') });
  return out;
}
