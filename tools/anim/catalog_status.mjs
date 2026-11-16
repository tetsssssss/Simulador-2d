// Annotate docs/ANIMATION_2D_CATALOG.csv with the clip that implements each entry (column clip_id) and a precise status:
//   CLIP_WIRED          keyframed clip exists AND the NFL renderer triggers it from an engine event
//   CLIP_READY_NOT_WIRED clip exists (tested, previewable, exportable) but no engine event drives it yet
// Other rows keep their previous status. Run:  node tools/anim/catalog_status.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { ALL_CLIPS } from '../../core/anim/registry.js';
import { WIRED_CLIPS } from '../../nfl/src/ui/animationMap.js';

const path = new URL('../../docs/ANIMATION_2D_CATALOG.csv', import.meta.url).pathname;
const split = line => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const quote = v => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean), head = split(lines[0]);
if (!head.includes('clip_id')) head.push('clip_id');
const iName = head.indexOf('original_name'), iStatus = head.indexOf('status'), iClip = head.indexOf('clip_id');
const byCatalog = new Map(ALL_CLIPS.map(c => [c.catalog, c]));
let wired = 0, ready = 0;
const rows = lines.slice(1).map(l => {
  const r = split(l); while (r.length < head.length) r.push('');
  const c = byCatalog.get(r[iName]); r[iClip] = c ? c.id : r[iClip] || '';
  if (c) { if (WIRED_CLIPS.includes(c.id)) { r[iStatus] = 'CLIP_WIRED'; wired++; } else { r[iStatus] = 'CLIP_READY_NOT_WIRED'; ready++; } }
  return r;
});
writeFileSync(path, [head, ...rows].map(r => r.map(quote).join(',')).join('\n') + '\n');
console.log(`catalog updated: ${wired} wired, ${ready} ready-not-wired, ${rows.length} rows`);
