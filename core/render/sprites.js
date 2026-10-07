// Shared athlete sprite (presentation only). Every sport draws players with the same readable grammar:
//   FAR    team color + number
//   MID    photo + team ring + number (+ small position tag)
//   CLOSE  bigger photo + ring + name plate (surname + number)
// A photo is never replaced by a generic circle when one is available; without a photo the sprite falls back to
// team color + number (still identifiable). Indicators are subtle rings: carrier (gold), selected (white dashed),
// target/receiving (cyan). `shape: 'goalie'` / 'pitcher' / 'batter' give role-specific silhouettes.
import { drawCirclePhoto } from './images.js';

export function zoomLevel(pxRadius) { return pxRadius >= 15 ? 'close' : pxRadius >= 9 ? 'mid' : 'far'; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function textColorOn(hex) {
  const h = (hex || '#333').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0b1118' : '#ffffff';
}

export function drawSprite(ctx, o) {
  const { x, y, r, color = '#1d4ed8', color2 = '#ffffff', number = '', pos = '', name = '', img = null,
    shape = 'circle', facing = null, carrier = false, selected = false, target = false, dim = false, level = zoomLevel(r), t = 0 } = o;
  ctx.save();
  if (dim) ctx.globalAlpha = 0.55;
  // soft shadow
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(x + r * 0.15, y + r * 0.3, r * 1.02, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
  // facing tick (direction of movement)
  if (facing != null && level !== 'far') {
    ctx.strokeStyle = color2; ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + Math.cos(facing) * r * 0.9, y + Math.sin(facing) * r * 0.9);
    ctx.lineTo(x + Math.cos(facing) * r * 1.42, y + Math.sin(facing) * r * 1.42); ctx.stroke();
  }
  // body
  const ringW = level === 'far' ? Math.max(1.2, r * 0.18) : Math.max(2, r * 0.17);
  const bodyPath = () => {
    if (shape === 'goalie') roundRect(ctx, x - r * 1.05, y - r * 1.05, r * 2.1, r * 2.1, r * 0.45);
    else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  };
  bodyPath(); ctx.fillStyle = color; ctx.fill();
  const showPhoto = img && level !== 'far';
  if (showPhoto) {
    if (shape === 'goalie') { ctx.save(); bodyPath(); ctx.clip(); drawCirclePhoto(ctx, img, x, y, r * 1.1); ctx.restore(); }
    else drawCirclePhoto(ctx, img, x, y, r - ringW * 0.5);
  }
  bodyPath(); ctx.lineWidth = ringW; ctx.strokeStyle = shape === 'goalie' ? color2 : color; ctx.stroke();
  if (shape === 'goalie' || shape === 'pitcher' || shape === 'batter') { // role outline
    ctx.lineWidth = Math.max(1, ringW * 0.45); ctx.strokeStyle = color2;
    if (shape !== 'goalie') { ctx.beginPath(); ctx.arc(x, y, r + ringW * 0.9, 0, Math.PI * 2); ctx.stroke(); }
  }
  // number
  const fg = textColorOn(color);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!showPhoto) {
    ctx.fillStyle = fg; ctx.font = `800 ${Math.max(7, r * (String(number).length > 1 ? 0.95 : 1.1))}px Inter, system-ui, sans-serif`;
    ctx.fillText(String(number), x, y + r * 0.04);
  } else {
    const bw = Math.max(13, r * 0.95), bh = Math.max(10, r * 0.62);
    ctx.fillStyle = color; roundRect(ctx, x + r * 0.32, y + r * 0.42, bw, bh, bh * 0.35); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = fg; ctx.font = `800 ${Math.max(8, bh * 0.78)}px Inter, system-ui, sans-serif`;
    ctx.fillText(String(number), x + r * 0.32 + bw / 2, y + r * 0.42 + bh / 2 + 0.5);
    if (pos && level === 'mid') {
      ctx.font = `700 ${Math.max(7, r * 0.42)}px Inter, system-ui, sans-serif`;
      const pw = ctx.measureText(pos).width + 6, ph = Math.max(9, r * 0.55);
      ctx.fillStyle = 'rgba(5,10,16,.78)'; roundRect(ctx, x - r - 2, y - r - 2, pw, ph, 3); ctx.fill();
      ctx.fillStyle = '#e9f0f7'; ctx.fillText(pos, x - r - 2 + pw / 2, y - r - 2 + ph / 2 + 0.5);
    }
  }
  // name plate (close zoom)
  if (level === 'close' && name) {
    const label = `${name}${pos ? ' · ' + pos : ''}`;
    ctx.font = `700 ${Math.max(10, r * 0.5)}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(label).width + 10, h = Math.max(14, r * 0.72), py = y + r + ringW + 3;
    ctx.fillStyle = 'rgba(5,10,16,.82)'; roundRect(ctx, x - w / 2, py, w, h, 4); ctx.fill();
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, py, 3, h);
    ctx.fillStyle = '#f2f6fb'; ctx.fillText(label, x + 1.5, py + h / 2 + 0.5);
  }
  // indicators (subtle)
  const ringR = (shape === 'goalie' ? r * 1.25 : r) + ringW + 3;
  if (carrier) {
    const pulse = 0.65 + 0.35 * Math.sin(t * 6);
    ctx.strokeStyle = `rgba(246,196,83,${0.55 + 0.4 * pulse})`; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2); ctx.stroke();
  }
  if (target) {
    ctx.strokeStyle = 'rgba(92,220,255,.95)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(x, y, ringR + 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  if (selected) {
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(x, y, ringR + 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

// Ball / puck with halo, short trail, ground shadow and height. `trail` = array of recent {x,y} screen points.
export function drawTrackedObject(ctx, o) {
  const { x, y, z = 0, r = 4, color = '#111', rim = '#fff', halo = 'rgba(255,255,255,.35)', trail = [], airborne = false, shadow = true } = o;
  ctx.save();
  if (trail.length > 1) {
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length;
      ctx.strokeStyle = `rgba(255,255,255,${0.32 * a})`; ctx.lineWidth = Math.max(1, r * 0.9 * a); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
    }
  }
  const lift = z;
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x, y, r * (1 + lift * 0.01), r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  const by = y - lift;
  const g = ctx.createRadialGradient(x, by, r * 0.5, x, by, r * 3.2);
  g.addColorStop(0, halo); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, by, r * 3.2, 0, Math.PI * 2); ctx.fill();
  if (airborne) {
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, by); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1, r * 0.35); ctx.stroke();
  ctx.restore();
}
