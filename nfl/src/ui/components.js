// Shared UI building blocks (HTML strings): PlayerAvatar, team logo, OVR badge, attribute groups, traits.
// Photos: headshot_url → ESPN id → silhouette fallback (dataService.playerPhoto). Never invents a photo.
import { playerPhoto, fallbackDataUri, logoUrl } from '../dataService.js';
import { ATTRIBUTES, makeRatings, overall, keyForAttribute } from '../ratings.js';
import { positionGroup, detailedPosition } from '../sim/attributes.js';

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
export const pid = p => p.gsis_id || p.full_name;

// Display preferences the components read (set by app.js from Settings → DISPLAY).
export const displayPrefs = { photos: true };

// Failed photo URLs are remembered for the session so the browser doesn't retry them on every render.
const failed = new Set();
if (typeof window !== 'undefined') {
  window.__asuImgFail = img => {
    if (img.dataset.fb === '1') return;
    failed.add(img.dataset.src);
    img.dataset.fb = '1'; img.src = img.dataset.fallback; img.classList.add('is-fallback');
  };
  window.__asuImgOk = img => img.classList.add('is-loaded');
}

// size: xs (24) list · sm (36) roster · md (56) depth/leaders · lg (96) HUD card · xl (148) profile
export function avatar(p, size = 'sm', extra = '') {
  const fb = fallbackDataUri(p?.full_name || '?');
  const url = displayPrefs.photos && p ? playerPhoto(p) : '';
  const src = url && !failed.has(url) ? url : fb;
  return `<span class="avatar av-${size} ${extra}"><img src="${esc(src)}" data-src="${esc(url)}" data-fallback="${esc(fb)}" alt="" loading="lazy" decoding="async" onload="__asuImgOk(this)" onerror="__asuImgFail(this)"${src === fb ? ' data-fb="1" class="is-fallback is-loaded"' : ''}></span>`;
}

export function teamLogo(t, size = 'sm') {
  if (!t) return '';
  return `<img class="logo lg-${size}" src="${esc(logoUrl(t))}" alt="${esc(t.abbr)}" loading="lazy" onerror="this.style.visibility='hidden'">`;
}

export function ovrClass(o) { return o >= 150 ? 'ovr-elite' : o >= 135 ? 'ovr-good' : o >= 115 ? 'ovr-avg' : 'ovr-low'; }
export function ovrBadge(o, big = false) { return `<span class="ovr ${ovrClass(o)} ${big ? 'ovr-big' : ''}">${o}</span>`; }

const ratingCache = new WeakMap();
export function ratingsOf(p) {
  let c = ratingCache.get(p);
  if (!c) { const r = makeRatings(p); c = { r, o: overall(p, r) }; ratingCache.set(p, c); }
  return c;
}

export const ATTR_GROUPS = [
  ['Physical', ['Speed', 'Acceleration', 'Agility', 'Strength', 'Stamina', 'Balance', 'Change of Direction', 'Explosiveness', 'Jumping', 'Durability']],
  ['Passing', ['Throwing Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Throw on Run']],
  ['Ball Skills', ['Catching', 'Contested Catch', 'Route Running', 'Release', 'Carrying', 'Break Tackle', 'Trucking', 'Elusiveness', 'Stiff Arm']],
  ['Blocking', ['Pass Block', 'Run Block', 'Block Strength', 'Block Footwork']],
  ['Defense', ['Tackling', 'Hit Power', 'Man Coverage', 'Zone Coverage', 'Press Coverage', 'Pass Rush', 'Run Defense']],
  ['Mental', ['Awareness', 'Decision Making', 'Vision', 'Anticipation', 'Play Recognition', 'Positioning', 'Discipline', 'Composure', 'Leadership', 'Teamwork', 'Consistency']],
  ['Special Teams', ['Kick Power', 'Kick Accuracy', 'Punting', 'Long Snap']],
];

// Position-specific key attributes (what the engine leans on for that role).
export const KEY_ATTRS = {
  QB: ['Throwing Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Decision Making', 'Awareness', 'Composure', 'Throw on Run'],
  RB: ['Speed', 'Acceleration', 'Vision', 'Elusiveness', 'Break Tackle', 'Trucking', 'Carrying', 'Agility'],
  WR: ['Speed', 'Route Running', 'Release', 'Catching', 'Contested Catch', 'Acceleration', 'Agility', 'Change of Direction'],
  TE: ['Catching', 'Route Running', 'Run Block', 'Pass Block', 'Strength', 'Contested Catch', 'Block Strength', 'Speed'],
  OL: ['Pass Block', 'Run Block', 'Block Strength', 'Block Footwork', 'Strength', 'Awareness', 'Discipline', 'Balance'],
  DL: ['Pass Rush', 'Run Defense', 'Strength', 'Explosiveness', 'Tackling', 'Play Recognition', 'Hit Power', 'Acceleration'],
  LB: ['Tackling', 'Run Defense', 'Play Recognition', 'Zone Coverage', 'Speed', 'Pass Rush', 'Hit Power', 'Discipline'],
  DB: ['Man Coverage', 'Zone Coverage', 'Press Coverage', 'Speed', 'Anticipation', 'Agility', 'Catching', 'Tackling'],
  K: ['Kick Power', 'Kick Accuracy', 'Composure', 'Consistency'], P: ['Punting', 'Kick Power', 'Composure', 'Consistency'], LS: ['Long Snap', 'Awareness', 'Consistency', 'Discipline'],
};
export function groupOf(p) { const g = positionGroup(p); return KEY_ATTRS[g] ? g : 'DB'; }
export function keyAttrs(p) { return KEY_ATTRS[groupOf(p)]; }
export { detailedPosition };

// League average per attribute for a position group (comparison markers on the profile).
const avgCache = new Map();
export function positionAverages(roster, group) {
  const key = `${group}|${roster.length}`;
  if (!avgCache.has(key)) {
    const sum = {}, list = roster.filter(p => groupOf(p) === group);
    for (const p of list) { const { r } = ratingsOf(p); for (const a of ATTRIBUTES) { const k = keyForAttribute(a); sum[k] = (sum[k] || 0) + r[k]; } }
    for (const k in sum) sum[k] /= Math.max(1, list.length);
    avgCache.set(key, sum);
  }
  return avgCache.get(key);
}

export function attrBar(name, v, avg = null, key = false) {
  const tone = v >= 160 ? 'a-elite' : v >= 135 ? 'a-good' : v >= 100 ? 'a-avg' : 'a-low';
  return `<div class="attr ${key ? 'attr-key' : ''}"><span class="attr-name">${esc(name)}</span><b class="${tone}">${v}</b><div class="bar"><div class="fill ${tone}" style="width:${v / 2}%"></div>${avg ? `<i class="avg" style="left:${avg / 2}%" title="média da posição ${Math.round(avg)}"></i>` : ''}</div></div>`;
}

// Traits derived only from ratings (labels for what the numbers already say).
const TRAITS = [
  ['Speedster', r => r.speed >= 175], ['Explosive', r => r.explosiveness >= 175 && r.acceleration >= 160],
  ['Field General', r => r.awareness >= 165 && r.decisionMaking >= 165], ['Cannon Arm', r => r.throwingPower >= 178],
  ['Pinpoint', r => r.shortAccuracy >= 172 && r.mediumAccuracy >= 165], ['Route Technician', r => r.routeRunning >= 175],
  ['Sure Hands', r => r.catching >= 178], ['Bulldozer', r => r.trucking >= 172 && r.strength >= 140],
  ['Ankle Breaker', r => r.elusiveness >= 172 && r.agility >= 160], ['Road Grader', r => r.runBlock >= 175],
  ['Pass Pro Anchor', r => r.passBlock >= 175 && r.blockFootwork >= 160], ['Edge Terror', r => r.passRush >= 178],
  ['Run Stopper', r => r.runDefense >= 175], ['Lockdown', r => r.manCoverage >= 175 && r.pressCoverage >= 160],
  ['Ballhawk', r => r.zoneCoverage >= 172 && r.anticipation >= 165], ['Big Hitter', r => r.hitPower >= 178],
  ['Ice Veins', r => r.composure >= 180], ['Iron Man', r => r.durability >= 180 && r.stamina >= 160],
];
export function traitsOf(p) { const { r } = ratingsOf(p); return TRAITS.filter(([, f]) => f(r)).map(([n]) => n); }

export function strengthsWeaknesses(p) {
  const { r } = ratingsOf(p);
  const list = keyAttrs(p).map(a => [a, r[keyForAttribute(a)]]).sort((a, b) => b[1] - a[1]);
  return { strengths: list.slice(0, 3), weaknesses: list.slice(-2).reverse() };
}

export function heightStr(inches) { const n = Number(inches); return n ? `${Math.floor(n / 12)}'${n % 12}"` : '—'; }
export function statusLabel(s) { return { ACT: 'Ativo', RES: 'Reserva/IR', DEV: 'Practice squad', INA: 'Inativo', CUT: 'Dispensado', RET: 'Aposentado', EXE: 'Isento', TRC: 'Contrato' }[s] || s || '—'; }
export { ATTRIBUTES, keyForAttribute, logoUrl };
