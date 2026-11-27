// Etapa 1 inventory: which of the 147 clips can appear in a match, per sport and per visual mode. Regenerates docs/INVENTARIO_ETAPA1.md.
//   node tools/anim/inventory.mjs
// "Ligado" lists mirror the code paths (animationMap.js, locomotion.js, resolveSheet in spriteSheet.js, penalties.js, renderers); the
// invariants are checked by tests/anim_clips.test.mjs and tests/spritesheet.test.mjs, this script only counts.
import { writeFileSync, statSync, readdirSync } from 'node:fs';
const store = new Map(); globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { ALL_CLIPS, BATCHES } = await import('../../core/anim/registry.js');
const { WIRED_CLIPS } = await import('../../nfl/src/ui/animationMap.js');
const { FOULS } = await import('../../nfl/src/ui/penalties.js');
const P = (...a) => a;
// procedural + sheet (both visual modes)
const nfl = new Set(WIRED_CLIPS);
const nhlBoth = new Set(P('hk_glide', 'hk_skate', 'hk_skate_back', 'hk_crossover', 'gs_arms_up'));
const mlbBoth = new Set(P('mv_walk', 'mv_jog', 'mv_run', 'mv_sprint', 'mv_run_ball', 'mv_sprint_ball', 'gs_arms_up'));
// only in "Sprites 3D" mode (resolveSheet): hockey shots/check, goalie saves, batter/pitcher/catcher/dive/catch
const nhlSheet = new Set(P('hk_wrist', 'hk_snap', 'hk_slap', 'hk_backhand', 'hk_onetimer', 'hk_check', 'gk_ready', 'gk_butterfly', 'gk_slide', 'gk_glove', 'gk_blocker', 'gk_pad_save', 'gk_recover', 'ag_wrap_tackle'));
const mlbSheet = new Set(P('bb_stance', 'bb_swing', 'bb_pitch', 'bb_catcher_crouch', 'ps_catch_diving', 'ps_catch_hands', 'qb_overhand', 'mv_idle'));
const demo = new Set(['rf_flag_throw', ...Object.values(FOULS).flatMap(f => [f.offender, f.ref, f.reaction].filter(Boolean))]);   // "Falta (demo)" button only
const linked = id => nfl.has(id) || nhlBoth.has(id) || mlbBoth.has(id) || nhlSheet.has(id) || mlbSheet.has(id);
const rows = Object.entries(BATCHES).map(([g, list]) => {
  const ids = list.map(c => c.id), l = ids.filter(linked), d = ids.filter(i => !linked(i) && demo.has(i)), u = ids.filter(i => !linked(i) && !demo.has(i));
  return { g, n: ids.length, l: l.length, d: d.length, u: u.length, unl: u };
});
const tot = rows.reduce((a, r) => ({ n: a.n + r.n, l: a.l + r.l, d: a.d + r.d, u: a.u + r.u }), { n: 0, l: 0, d: 0, u: 0 });
const mb = d => readdirSync(d).reduce((a, f) => a + statSync(d + '/' + f).size, 0) / 1048576;
const md = `# Inventário (Etapa 1) — o que aparece de fato em partida
Gerado por \`node tools/anim/inventory.mjs\`. **Ligado** = algum esporte dispara o clipe a partir de evento/estado real do motor (qualquer modo visual).
**Só demo** = aparece apenas no botão "Falta (demo)". **Sem gatilho** = existe, está testado e exportável, mas nenhuma jogada o chama.

| Lote | Clipes | Ligados | Só demo | Sem gatilho |
|---|---:|---:|---:|---:|
${rows.map(r => `| ${r.g} | ${r.n} | ${r.l} | ${r.d} | ${r.u} |`).join('\n')}
| **Total** | **${tot.n}** | **${tot.l}** | **${tot.d}** | **${tot.u}** |

## Por esporte
* **NFL (${nfl.size} ligados, 2 modos):** locomoção por velocidade, arremessos por tipo de bola/pressão, recepções por altura/posição, tackle/sack/broken tackle/fumble/bloqueio, TD. Sem gatilho: kneel, spike, cadência, pump fake, play-action, under-center, read-option, pré-snap/huddle.
* **NHL (${nhlBoth.size} nos 2 modos + ${nhlSheet.size} só em Sprites 3D):** patinação por velocidade; chutes por \`shotType\`, check e goleiro por estado só no modo sheet (o boneco usa as poses procedurais antigas).
* **MLB (${mlbBoth.size} nos 2 modos + ${mlbSheet.size} só em Sprites 3D):** corrida por velocidade; batedor, arremessador, catcher só no modo sheet. **Ainda sem gatilho:** \`bb_field_ground\` (ground ball), pickoff, slide, bola aérea/mergulho do motor novo.
* **Faltas/árbitro:** 12 faltas + sinais só pelo botão demo; o motor não emite \`PENALTY\`.

## Sem gatilho (por lote)
${rows.filter(r => r.unl.length).map(r => `* **${r.g}** (${r.unl.length}): ${r.unl.join(', ')}`).join('\n')}

## Pesos medidos
| Item | Tamanho |
|---|---|
| assets/sprites (atlas em uso + 6 antigos órfãos) | ${mb('assets/sprites').toFixed(1)} MB |
| exports/anim (3 .glb + clipes JSON) | ${mb('exports/anim').toFixed(1)} MB |
| exports/props (5 .glb) | ${mb('exports/props').toFixed(2)} MB |
`;
writeFileSync(new URL('../../docs/INVENTARIO_ETAPA1.md', import.meta.url), md);
console.log(`linked ${tot.l}/${tot.n}, demo ${tot.d}, no trigger ${tot.u}`);
