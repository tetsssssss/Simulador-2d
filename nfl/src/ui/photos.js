// NFLPlayerPhotoResolver — the single place that decides which photo an NFL athlete shows (lists, profile, field).
// Priority: 1) image already loaded/cached  2) known URL: nflverse `headshot_url`, else ESPN headshot by `espn_id`
// 3) fallback: UI = silhouette with initials (dataService.fallbackDataUri); field sprite = team color + number.
import { playerPhoto, fallbackDataUri } from '../dataService.js';
import { loadImage, imageState } from '../../../core/render/images.js';

export const photoUrl = p => (p ? playerPhoto(p) : '');
export const fallbackUrl = p => fallbackDataUri(p?.full_name || '?');
// Canvas: loaded image or null (loading / failed → caller draws team color + number, never a blank circle).
export function photoImage(p) { const u = photoUrl(p); return u ? loadImage(u) : null; }
export function photoStatus(p) { return imageState(photoUrl(p)); }
