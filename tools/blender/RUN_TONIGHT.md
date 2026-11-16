# Roteiro para rodar o Blender (noite) — 15 minutos para validar, depois render em lote

Pré-requisito: Blender 3.6+ ou 4.x no PATH (`blender --version`) e este repositório na pasta atual.
O script **nunca foi executado** (sem Blender no ambiente de desenvolvimento): o roteiro abaixo existe para achar os ajustes
pequenos rápido. Todos os ajustes ficam em constantes no topo de `tools/blender/build_nfl_sprites.py`.

## 1. Regerar o JSON (125 clipes)
```
node tools/anim/export_clips.mjs
```

## 2. Teste mínimo: 3 clipes, só 6 quadros cada, tamanho pequeno
```
blender --background --python tools/blender/build_nfl_sprites.py -- \
  --clips exports/anim/nfl_clips.json --out exports/anim/frames_test --size 128 \
  --only mv_run,qb_overhand,ag_wrap_tackle --step 4
```
Espere: `[asu] mv_run: N frames` para cada clipe e PNGs em `exports/anim/frames_test/<clip>/frame_XXXX.png`.

## 3. O que conferir nas imagens (e o que mudar se estiver errado)
| Sintoma | Causa provável | Ajuste |
|---|---|---|
| Braço do arremesso gira para trás/para baixo | sentido de rotação | `SIGN = 1.0` (era -1.0) |
| Atleta aparece de costas / espelhado | câmera | em `setup_scene`: `cam.location = (0, 10, ...)` e `rotation_euler = (radians(90), 0, radians(180))` |
| Figura muito pequena/grande | escala ortográfica | `cam.data.ortho_scale` (12*U → 10*U ou 14*U) |
| Pernas muito abertas no sprint | conversão planar | multiplicar `l`/`k` por 0.8 em `leg_angles` |
| Erro `BLENDER_EEVEE_NEXT` | versão do Blender | já há fallback para `BLENDER_EEVEE`; se falhar, use `BLENDER_WORKBENCH` |
| Quadros pretos | luz/mundo | ajustar `sun.data.energy` (3.0) |

## 4. Lote completo (125 clipes × ~25 quadros ≈ 3000 renders; ~10–40 min conforme a máquina)
```
blender --background --python tools/blender/build_nfl_sprites.py -- \
  --clips exports/anim/nfl_clips.json --out exports/anim/frames --size 128
python3 tools/blender/pack_sheets.py exports/anim/frames exports/anim/sheets      # precisa de Pillow
```
Dica: para rodar por grupo, passe `--only` com os ids de `docs/anim/plan.json` (qb, move, gesture, foul, grab, pass).

## 5. Depois
Me mande 2–3 PNGs do teste (passo 2) e o log do Blender; eu ajusto as constantes e o mapeamento de pernas.
Arte de terceiros: os blocos do rig são próprios; troque por um modelo licenciado mantendo os nomes dos ossos
(`hips, spine, head, upper_F/B, fore_F/B, thigh_F/B, shin_F/B`) e anote a origem/licença em `docs/anim/ART_SOURCES.md`.
