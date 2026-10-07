// Player relationships (PLAYER role): CoachTrust, TeammateRelationship, ManagementTrust, FanSupport (0-100). They move with real
// events (games, roles, contracts, media). CoachTrust is mirrored into the player's own rel.tr so the old systems agree.
import { clamp } from './kit.js';
export const PREL_KEYS = ['coachTrust', 'teammates', 'management', 'fans'];
export function bumpPrel(c, key, delta, why = '') {
  const x = c.x, r = x.prel; if (!(key in r)) return 0;
  const before = r[key]; r[key] = clamp(Math.round((before + delta) * 10) / 10, 0, 100);
  const me = c.players[c.me?.id];
  if (key === 'coachTrust' && me?.rel) me.rel.tr = r[key];
  if (r[key] !== before) { r.log.unshift({ d: x.cal.day, s: c.season, key, delta: Math.round((r[key] - before) * 10) / 10, why }); if (r.log.length > 30) r.log.length = 30; }
  return r[key] - before;
}
export function prelSnapshot(c) { const r = c.x.prel; return { coachTrust: Math.round(r.coachTrust), teammates: Math.round(r.teammates), management: Math.round(r.management), fans: Math.round(r.fans), log: r.log.slice(0, 10) }; }
