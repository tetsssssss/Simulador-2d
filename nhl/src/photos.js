// NHLPlayerPhotoResolver — central photo resolution for every NHL screen and the rink.
// Priority: 1) image already loaded/cached  2) known URL (API `headshot`, else NHL mugs pattern for the snapshot
// season/team)  3) fallback (UI: initials placeholder; rink sprite: team color + number — never a blank circle).
import { loadImage, imageState } from '../../core/render/images.js';

const SNAPSHOT_SEASON = '20232024';
export function photoUrl(p) {
  if (!p) return '';
  if (p.headshot) return p.headshot;
  if (p.id && p.teamAbbr) return `https://assets.nhle.com/mugs/nhl/${p.photoSeason || SNAPSHOT_SEASON}/${p.teamAbbr}/${p.id}.png`;
  return '';
}
// For canvas sprites: returns a loaded HTMLImageElement or null (still loading / failed → caller draws color + number).
export function photoImage(p) { const u = photoUrl(p); return u ? loadImage(u) : null; }
export function photoStatus(p) { return imageState(photoUrl(p)); }
