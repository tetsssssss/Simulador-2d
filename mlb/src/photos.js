// MLBPlayerPhotoResolver — priority: 1) image already loaded/cached  2) known URL (StatsAPI `headshotLink` or the MLB
// static headshot service by MLBAM id, which itself falls back to MLB's generic silhouette)  3) fallback (UI initials;
// field sprite = team color + number).
import { loadImage, imageState } from '../../core/render/images.js';
export function photoUrl(p) {
  if (!p || p.demo) return '';
  const id = p.person?.id || p.id;
  if (p.headshotLink) return p.headshotLink;
  return id ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current` : '';
}
export function photoImage(p) { const u = photoUrl(p); return u ? loadImage(u) : null; }
export function photoStatus(p) { return imageState(photoUrl(p)); }
