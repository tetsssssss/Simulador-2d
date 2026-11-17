// Engine event → animation clip (presentation only; the simulation is never touched). Each rule returns { id, at?, lead?, loop? }:
//   id    clip id from core/anim/registry.js
//   at    name of the clip event that should coincide with the engine event (default: start at p = 0)
//   lead  how much clip time (0..1) before `at` the clip starts, so the wind-up is visible (0.18 ≈ 0.15 s on a 0.8 s throw)
//   loop  repeat until the play ends (WHISTLE) or another QB clip replaces it
// Clips that exist but are not wired yet (no engine event to hang them on): qb_kneel, qb_spike, qb_cadence, qb_pump_fake,
// qb_play_action, qb_under_center (the engine always lines the QB up in the gun), qb_read_option.
import { getClip } from '../../../core/anim/registry.js';
import { runGait } from '../../../core/anim/locomotion.js';

// Choose the QB throw from what the engine already knows at release: ball type (distance), pressure, QB movement, throw-away.
export function throwClipId(sim, ev) {
  const qb = sim.qb, s = sim.qbState || {}, col = s.pocket?.collapse ?? 0, spd = qb ? Math.hypot(qb.vel?.x || 0, qb.vel?.y || 0) : 0;
  if (ev.throwAway) return 'qb_throwaway';
  if (spd > 3.2) return col > 0.55 ? 'qb_off_platform' : 'qb_throw_on_run';
  if (col > 0.6 || ev.hurried) return 'qb_under_pressure';
  if (ev.ballType === 'LOB') return 'qb_lob';
  if (ev.ballType === 'TOUCH') return (ev.airYards ?? 0) < 18 ? 'qb_touch' : 'qb_overhand';
  // BULLET (< 13 yd): short and flat. Quick release when the read was fast; otherwise vary the arm slot by passer id so it is stable per player.
  if ((ev.airYards ?? 0) < 5) return 'qb_quick_release';
  const h = [...String(ev.passer)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return ['qb_bullet', 'qb_three_quarter', 'qb_bullet', 'qb_sidearm'][h % 4];
}

// Clips the renderer can actually trigger today (the rest are authored and tested but wait for an engine event).
export const WIRED_CLIPS = Object.freeze([
  // QB (batch 1)
  'qb_throwaway', 'qb_lob', 'qb_touch', 'qb_overhand', 'qb_quick_release', 'qb_bullet', 'qb_three_quarter', 'qb_sidearm', 'qb_under_pressure', 'qb_throw_on_run', 'qb_off_platform', 'qb_shotgun_snap', 'qb_under_center', 'qb_handoff', 'qb_slide', 'qb_scramble', 'qb_pocket_escape',
  // locomotion (driven by stride phase) + falls
  'mv_walk', 'mv_jog', 'mv_run', 'mv_sprint', 'mv_run_ball', 'mv_sprint_ball', 'mv_backpedal', 'mv_jump_cut', 'mv_stumble_recover',
  // tackles / grabs / blocks
  'ag_wrap_tackle', 'ag_wrap_victim', 'ag_arm_tackle', 'ag_pile_top', 'ag_pile_bottom', 'ag_tackle_drag', 'ag_escape_grip', 'ag_ball_rip', 'ag_lock_hands',
  // catches and pass defence
  'ps_catch_chest', 'ps_catch_hands', 'ps_catch_over_shoulder', 'ps_catch_diving', 'ps_catch_high_point', 'ps_catch_basket', 'ps_catch_toe_tap', 'ps_contested_catch', 'ps_drop', 'ps_swat', 'ps_interception',
  // celebration
  'gs_arms_up',
]);
// Locomotion clip from the athlete's real velocity (yd/s). One loop = one full stride cycle, driven by distance (stride phase).
export function locomotionClipId(o) { return runGait(o); }

const hash = id => [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
// Catch variant from the ball's flight (height at the catch, ball type), the field position (sideline → toe tap) and the receiver.
export function catchClipId(sim, ev) {
  const b = sim.ball, z = b?.z ?? 1.5, type = b?.type || 'BULLET', rec = sim.ents?.find(e => e.id === ev.receiver), y = rec?.pos?.y ?? 26;
  if (ev.contested) return 'ps_contested_catch';
  if (z < 0.9) return 'ps_catch_diving';
  if (type === 'LOB') return (y < 2.6 || y > 50.7) ? 'ps_catch_toe_tap' : ['ps_catch_over_shoulder', 'ps_catch_high_point', 'ps_catch_basket'][hash(ev.receiver) % 3];
  if (z > 2.4) return 'ps_catch_high_point';
  return type === 'TOUCH' ? 'ps_catch_hands' : ['ps_catch_chest', 'ps_catch_hands'][hash(ev.receiver) % 2];
}

export function clipsForEvent(ev, sim) {
  switch (ev.type) {
    case 'PASS_COMPLETE': return [{ who: ev.receiver, id: catchClipId(sim, ev), at: 'catch', lead: 0.25 }];
    case 'INTERCEPTION': return [{ who: ev.by, id: 'ps_interception', at: 'catch', lead: 0.25 }];
    case 'PASS_BREAKUP': return [{ who: ev.by, id: 'ps_swat', at: 'hit', lead: 0.25 }];
    case 'INCOMPLETE': return ev.reason === 'DROP' && ev.by ? [{ who: ev.by, id: 'ps_drop', at: 'drop', lead: 0.25 }] : [];
    case 'TACKLE': return [{ who: ev.by, id: 'ag_wrap_tackle', at: 'contact', lead: 0.3 }, { who: ev.carrier, id: 'ag_wrap_victim', lead: 0 }, ...(ev.assists || []).map(a => ({ who: a, id: 'ag_pile_top' }))];
    case 'SACK': return [{ who: ev.by, id: 'ag_wrap_tackle', at: 'contact', lead: 0.3 }, { who: ev.qb, id: 'ag_wrap_victim' }];
    case 'BROKEN_TACKLE': return [{ who: ev.carrier, id: ev.move === 'SPIN' ? 'ag_escape_grip' : ev.move === 'JUKE' ? 'mv_jump_cut' : 'ag_tackle_drag' }, { who: ev.by, id: ev.move === 'JUKE' ? 'mv_stumble_recover' : 'ag_arm_tackle' }];
    case 'FUMBLE': return ev.forcedBy ? [{ who: ev.forcedBy, id: 'ag_ball_rip', at: 'rip', lead: 0.3 }] : [];
    case 'SHED': return [{ who: ev.by, id: 'ag_escape_grip' }];
    case 'BLOCK_ENGAGE': return [{ who: ev.by, id: 'ag_lock_hands' }, { who: ev.on, id: 'ag_lock_hands' }];
    case 'TOUCHDOWN': return [];
    case 'SNAP': { const gun = sim.qb && sim.qb.pos.x < sim.losX - 2.5; return [{ who: sim.qb?.id, id: gun ? 'qb_shotgun_snap' : 'qb_under_center' }]; }
    case 'PASS_ATTEMPT': return [{ who: ev.passer, id: throwClipId(sim, ev), at: 'release', lead: 0.18 }];
    case 'HANDOFF': return [{ who: ev.from, id: 'qb_handoff', at: 'release', lead: 0.3 }];
    case 'QB_ACTION':
      if (ev.action === 'SLIDE') return [{ who: ev.id, id: 'qb_slide' }];
      if (ev.action === 'SCRAMBLE') return [{ who: ev.id, id: 'qb_scramble', loop: true }];
      if (ev.action === 'ROLL_OUT' || ev.action === 'STEP_UP') return [{ who: ev.id, id: 'qb_pocket_escape' }];
      return [];
    default: return [];
  }
}

// Turn rules into avatar actions: [{ who, type:'clip:<id>', t0, dur, loop }] given the current sim time.
export function actionsFor(ev, sim) {
  const t = sim.t ?? 0, out = [];
  for (const r of clipsForEvent(ev, sim)) {
    const c = getClip(r.id); if (!c || !r.who) continue;
    const pe = r.at ? (c.ev[r.at] ?? 0) : 0, p0 = Math.max(0, pe - (r.lead || 0));
    out.push({ who: r.who, type: 'clip:' + c.id, t0: t - p0 * c.dur, dur: c.dur, loop: !!(r.loop || c.loop) });
  }
  return out;
}
