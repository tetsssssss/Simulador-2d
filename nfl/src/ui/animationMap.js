// Engine event → animation clip (presentation only; the simulation is never touched). Each rule returns { id, at?, lead?, loop? }:
//   id    clip id from core/anim/registry.js
//   at    name of the clip event that should coincide with the engine event (default: start at p = 0)
//   lead  how much clip time (0..1) before `at` the clip starts, so the wind-up is visible (0.18 ≈ 0.15 s on a 0.8 s throw)
//   loop  repeat until the play ends (WHISTLE) or another QB clip replaces it
// Clips that exist but are not wired yet (no engine event to hang them on): qb_kneel, qb_spike, qb_cadence, qb_pump_fake,
// qb_play_action, qb_under_center (the engine always lines the QB up in the gun), qb_read_option.
import { getClip } from '../../../core/anim/registry.js';

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
export const WIRED_CLIPS = Object.freeze(['qb_throwaway', 'qb_lob', 'qb_touch', 'qb_overhand', 'qb_quick_release', 'qb_bullet', 'qb_three_quarter', 'qb_sidearm', 'qb_under_pressure', 'qb_throw_on_run', 'qb_off_platform', 'qb_shotgun_snap', 'qb_under_center', 'qb_handoff', 'qb_slide', 'qb_scramble', 'qb_pocket_escape']);

export function clipsForEvent(ev, sim) {
  switch (ev.type) {
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
