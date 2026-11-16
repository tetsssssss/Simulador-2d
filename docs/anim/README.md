# Animações NFL por clipes (core/anim) — 100 em 4 etapas

Fonte de nomes e rastreabilidade: `docs/ANIMATION_2D_CATALOG.csv` (289 entradas NFL do catálogo recebido; coluna `clip_id` e status
`CLIP_WIRED` / `CLIP_READY_NOT_WIRED` atualizados por `node tools/anim/catalog_status.mjs`). Plano das 100: `docs/anim/plan.json`.

| Etapa | Tema | Qtd | Estado |
|---|---|---|---|
| 1 | QB / passe (arremessos, fintas, snap, handoff, slide…) | 25 | **feito** (17 ligados a eventos do motor, 8 prontos sem evento) |
| 2 | Receptores (recepções e ajustes) | 25 | planejado |
| 3 | Corrida / contato (fintas, quedas, mergulhos) | 25 | planejado |
| 4 | Linhas, secundária e special teams | 25 | planejado |

## Como funciona
* `core/anim/pose.js` — pose = valores de juntas (lean, crouch, air, braços `aF/fF/aB/fB` como ângulos, pernas `lF/kF/lB/kB`, `ball`);
  clipe = keyframes em tempo normalizado 0..1 + duração em **segundos de simulação** (acompanha 0,5x–4x do jogo). Ângulos de braço são
  desenrolados pelo caminho mais curto (`defineClip`), então o arremesso passa por cima da cabeça.
* `core/anim/clips/*.js` — dados dos clipes; `core/anim/registry.js` — registro e `clipPoseOf(action)`.
* `core/render/avatars.js` — desenha o boneco com a pose do clipe (cotovelo em 2 ossos, pernas por keyframe, bola nas mãos); braço
  levantado é desenhado por cima do capacete. `phase` = fase da passada guiada por **distância percorrida** (sem pés deslizando).
* `nfl/src/ui/animationMap.js` — evento do motor → clipe (ex.: tipo de bola + pressão + movimento do QB escolhem o arremesso).
* Prévia: abra `tools/anim/preview.html` por um servidor (`python3 -m http.server 8300` → `/tools/anim/preview.html`).

## Blender (próximo passo; **ainda não executado**)
1. `node tools/anim/export_clips.mjs` → `exports/anim/nfl_clips.json` (keyframes + 30 fps assados + convenções).
2. `blender --background --python tools/blender/build_nfl_sprites.py -- --clips exports/anim/nfl_clips.json --out exports/anim/frames --size 128`
3. `python3 tools/blender/pack_sheets.py exports/anim/frames exports/anim/sheets` (Pillow).
O script foi escrito sem Blender disponível: confira as constantes `SIGN`/`U` e o mapeamento de pernas no topo do arquivo na 1ª execução.
Arte de terceiros: nenhum sprite externo é usado; o rig/malha do script são blocos próprios (substituir por modelo licenciado, anotando a origem).
