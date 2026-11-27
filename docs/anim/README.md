# Animações NFL por clipes (core/anim) — 100 em 4 etapas

Fonte de nomes e rastreabilidade: `docs/ANIMATION_2D_CATALOG.csv` (289 entradas NFL do catálogo recebido; coluna `clip_id` e status
`CLIP_WIRED` / `CLIP_READY_NOT_WIRED` atualizados por `node tools/anim/catalog_status.mjs`). Plano das 100: `docs/anim/plan.json`.

| Lote | Tema | Qtd | Estado |
|---|---|---|---|
| qb | QB / passe (arremessos, fintas, snap, handoff, slide…) | 25 | feito (17 ligados) |
| move | Movimentação: idle, andar, trote, corrida, sprint, com bola, backpedal, shuffle, carioca, cortes, frenagem, giros, pulo | 20 | feito (gaits ligados à velocidade real) |
| gesture | Gestos: 10 de jogador + 10 sinais de árbitro | 20 | feito (só `gs_arms_up` ligado ao TD; árbitros sem entidade) |
| foul | Faltas: 12 infrações (false start, holding, DPI, facemask…) + 8 sinais | 20 | feito, **sem evento de falta no motor** (nenhum ligado) |
| grab | Agarrado: tackles, abraço, puxão de camisa, pilha, strip, mãos travadas | 20 | feito (9 ligados a TACKLE/SACK/BROKEN_TACKLE/BLOCK_ENGAGE/FUMBLE) |
| pass | Passe: 7 arremessos extra + 9 recepções + drop, breakup, interceptação, contested | 20 | feito (recepções/INT/breakup/drop ligados a eventos reais) |

Total: **125 clipes** (25 QB + 100 do pacote "noite"). 40 ligados ao jogo; 85 prontos (testados, previsualizáveis, exportáveis).
Catálogo: `docs/ANIMATION_2D_CATALOG.csv` (coluna `clip_id`); clipes sem entrada no catálogo (faltas, árbitros, locomoção extra) têm `source: 'extra'`.

## Árbitro e faltas (apresentação, sem tocar no motor)
* `nfl/src/ui/penalties.js`: 12 faltas → clipe do infrator + reação da vítima + árbitro (flag → sinal, encadeados) + banner. Contrato para o
  motor: evento `{ type: 'PENALTY', foul: <chave de FOULS>, by?, on? }` (hoje o motor NÃO emite). Usa relógio real (toca com o jogo pausado ou a 4x).
* Entidade de árbitro: camisa listrada + boné (`role: 'ref'` em avatars.js), aparece só durante a apresentação.
* Controle **"Falta (demo)"** na barra do jogo NFL: escolhe a falta e mostra — claramente uma demonstração, não afeta o placar nem a simulação.
* Sinais ainda não autorados: personal foul (roughing/horse-collar usam o mais próximo, `rf_unsportsmanlike`).

## Como funciona
* `core/anim/pose.js` — pose = valores de juntas (lean, crouch, air, braços `aF/fF/aB/fB` como ângulos, pernas `lF/kF/lB/kB`, `ball`);
  clipe = keyframes em tempo normalizado 0..1 + duração em **segundos de simulação** (acompanha 0,5x–4x do jogo). Ângulos de braço são
  desenrolados pelo caminho mais curto (`defineClip`), então o arremesso passa por cima da cabeça.
* `core/anim/clips/*.js` — dados dos clipes; `core/anim/registry.js` — registro e `clipPoseOf(action)`.
* `core/render/avatars.js` — desenha o boneco com a pose do clipe (cotovelo em 2 ossos, pernas por keyframe, bola nas mãos); braço
  levantado é desenhado por cima do capacete. `phase` = fase da passada guiada por **distância percorrida** (sem pés deslizando).
* `nfl/src/ui/animationMap.js` — evento do motor → clipe (ex.: tipo de bola + pressão + movimento do QB escolhem o arremesso).
* Prévia: abra `tools/anim/preview.html` por um servidor (`python3 -m http.server 8300` → `/tools/anim/preview.html`).

## Blender (à noite; **ainda não executado**) — roteiro em `tools/blender/RUN_TONIGHT.md`
1. `node tools/anim/export_clips.mjs` → `exports/anim/nfl_clips.json` (keyframes + 30 fps assados + convenções).
2. (teste mínimo primeiro, ver RUN_TONIGHT) `blender --background --python tools/blender/build_nfl_sprites.py -- --clips exports/anim/nfl_clips.json --out exports/anim/frames --size 128`
3. `python3 tools/blender/pack_sheets.py exports/anim/frames exports/anim/sheets` (Pillow).
O script foi escrito sem Blender disponível: confira as constantes `SIGN`/`U` e o mapeamento de pernas no topo do arquivo na 1ª execução.
Arte de terceiros: nenhum sprite externo é usado; o rig/malha do script são blocos próprios (substituir por modelo licenciado, anotando a origem).
