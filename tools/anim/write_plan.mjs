// Regenerate docs/anim/plan.json from the registry (clip ids per batch) — keeps the plan honest.
import { writeFileSync } from 'node:fs';
import { BATCHES } from '../../core/anim/registry.js';
const stages = Object.fromEntries(Object.entries(BATCHES).map(([k, v]) => [k, v.map(c => c.id)]));
writeFileSync(new URL('../../docs/anim/plan.json', import.meta.url), JSON.stringify({ total: Object.values(stages).flat().length, note: 'ids per batch; qb = etapa 1, demais = pacote "noite" (movimentação, gestos, faltas, agarrado, passe)', stages }, null, 1) + '\n');
console.log('plan.json:', Object.entries(stages).map(([k, v]) => `${k}=${v.length}`).join(' '));
