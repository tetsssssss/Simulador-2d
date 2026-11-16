// Penalty PRESENTATION (never touches the simulation): maps a foul id to the offender's clip, the victim's reaction, the referee's
// flag throw and signal. Contract for a future engine event:  { type: 'PENALTY', foul: <key of FOULS>, by?: id, on?: id }
// Until the engine emits it, the NFL view offers a clearly labelled "Falta (demo)" control (see gameView.js) that calls
// renderer.demoPenalty(). Timing uses the WALL clock (seconds), so signals play at normal speed even when the game is paused/fast.
import { getClip } from '../../../core/anim/registry.js';

export const REF_ID = 'REF';
const OL = /^(LT|LG|C|RG|RT)$/, DL = /^(LDE|LDT|RDT|RDE|NT|DT|DE)$/, DB = /^(CBL|CBR|CB|FS|SS|S)$/, WR = /^(X|Z|SLOT|WR|TE)$/;
// who: how to pick the offender when the event does not name one; victim: slot pattern of the opponent to react.
export const FOULS = {
  FALSE_START: { label: 'False start', yards: 5, side: 'off', who: OL, offender: 'fl_false_start', ref: 'rf_false_start' },
  OFFSIDE: { label: 'Offside', yards: 5, side: 'def', who: DL, offender: 'fl_offside', ref: 'rf_offside' },
  ENCROACHMENT: { label: 'Encroachment', yards: 5, side: 'def', who: DL, offender: 'fl_encroachment', ref: 'rf_offside' },
  HOLDING_OFFENSE: { label: 'Holding (ataque)', yards: 10, side: 'off', who: OL, victim: DL, offender: 'fl_holding_off', reaction: 'ag_hold_reaction', ref: 'rf_holding' },
  HOLDING_DEFENSE: { label: 'Holding (defesa)', yards: 5, side: 'def', who: DB, victim: WR, offender: 'fl_holding_def', reaction: 'ag_hold_reaction', ref: 'rf_holding' },
  DPI: { label: 'Interferência de passe (defesa)', yards: 15, side: 'def', who: DB, victim: WR, offender: 'fl_dpi', reaction: 'ag_jersey_victim', ref: 'rf_pass_interference' },
  OPI: { label: 'Interferência de passe (ataque)', yards: 10, side: 'off', who: WR, victim: DB, offender: 'fl_opi', reaction: 'ag_jersey_victim', ref: 'rf_pass_interference' },
  FACEMASK: { label: 'Facemask', yards: 15, side: 'def', who: DL, victim: null, offender: 'fl_facemask', reaction: 'ag_jersey_victim', ref: 'rf_facemask' },
  ROUGHING_PASSER: { label: 'Roughing the passer', yards: 15, side: 'def', who: DL, victim: 'QB', offender: 'fl_roughing', reaction: 'ag_wrap_victim', ref: 'rf_unsportsmanlike', note: 'sinal de personal foul ainda não autorado: usa o mais próximo' },
  HORSE_COLLAR: { label: 'Horse-collar', yards: 15, side: 'def', who: DB, victim: null, offender: 'fl_horse_collar', reaction: 'ag_jersey_victim', ref: 'rf_unsportsmanlike', note: 'sinal de personal foul ainda não autorado: usa o mais próximo' },
  TAUNTING: { label: 'Provocação', yards: 15, side: 'def', who: DB, offender: 'fl_taunting', ref: 'rf_unsportsmanlike' },
  INTENTIONAL_GROUNDING: { label: 'Intentional grounding', yards: 10, side: 'off', who: /^QB$/, offender: 'fl_intentional_grounding', ref: 'rf_intentional_grounding' },
};
export const FOUL_KEYS = Object.keys(FOULS);

const near = (list, to) => list.reduce((best, e) => (!best || Math.hypot(e.pos.x - to.x, e.pos.y - to.y) < Math.hypot(best.pos.x - to.x, best.pos.y - to.y) ? e : best), null);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Returns { label, foul, offender, victim, ref:{ pos, facing }, actions:[{ who, type, t0, dur, wall:true, next? }], until } or null.
export function buildPenalty(foulKey, sim, { by = null, on = null, now = 0, fieldW = 53.33 } = {}) {
  const F = FOULS[foulKey]; if (!F || !sim?.ents?.length) return null;
  const ents = sim.ents, byId = id => ents.find(e => e.id === id);
  const sideEnts = ents.filter(e => e.side === F.side), opp = ents.filter(e => e.side !== F.side);
  const anchor = sim.qb?.pos || { x: sim.losX ?? 30, y: fieldW / 2 };
  const offender = (by && byId(by)) || near(sideEnts.filter(e => F.who.test(e.slot)), anchor) || near(sideEnts, anchor);
  if (!offender) return null;
  let victim = (on && byId(on)) || null;
  if (!victim && F.victim === 'QB') victim = sim.qb;
  else if (!victim && F.victim !== undefined) victim = near(opp.filter(e => (F.victim ? F.victim.test(e.slot) : true)), offender.pos);
  const acts = [], clip = id => getClip(id);
  const push = (who, id, delay = 0) => { const c = clip(id); if (who && c) acts.push({ who, type: 'clip:' + id, t0: now + delay, dur: c.dur, wall: true }); };
  push(offender.id, F.offender); if (victim && F.reaction) push(victim.id, F.reaction, 0.15);
  // referee: throw the flag, then hold the signal (chained: the signal starts when the throw ends)
  const side = offender.pos.y < fieldW / 2 ? 1 : -1;
  const ref = { pos: { x: offender.pos.x - 6, y: clamp(offender.pos.y + side * 8, 3, fieldW - 3) }, facing: 0 };
  ref.facing = Math.atan2(offender.pos.y - ref.pos.y, offender.pos.x - ref.pos.x);
  const fl = clip('rf_flag_throw'), sg = clip(F.ref);
  if (fl && sg) acts.push({ who: REF_ID, type: 'clip:rf_flag_throw', t0: now + 0.3, dur: fl.dur, wall: true, next: { type: 'clip:' + F.ref, dur: sg.dur, wall: true } });
  const total = 0.3 + (fl?.dur || 0) + (sg?.dur || 0) + 1.2;
  return { foul: foulKey, label: `FALTA · ${F.label} · ${F.yards} jd`, note: F.note || null, offender: offender.id, victim: victim?.id || null, ref, actions: acts, until: now + total };
}
