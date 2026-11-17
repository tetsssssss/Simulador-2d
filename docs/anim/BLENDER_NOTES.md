# Blender — o que foi executado de verdade (bpy 5.1.0, Linux, sem GPU)

Os scripts de `tools/blender/` **foram executados** nesta sessão com a roda `bpy` do PyPI (mesmo Blender 5.1, sem o aplicativo):

```
python3 -m venv bpyenv && bpyenv/bin/pip install bpy==5.1.0 pillow     # Python 3.13; ~400 MB
sudo apt-get install -y libegl1 libxrender1 libxi6 libxkbcommon0 libsm6 libxxf86vm1 libxfixes3   # libs de GL exigidas pelo bpy
xvfb-run -a bpyenv/bin/python run.py ...      # run.py faz sys.argv = ['blender','--',*args] e runpy.run_path(script)
```

## Resultados medidos
| Item | Resultado |
|---|---|
| Modelo (`athlete_model.py`) | 1 malha com pesos rígidos + armature de 11 ossos; **540 tris** (futebol), 500 (hockey), 484 (baseball); 7 materiais; 1,84 m |
| Render (Workbench, 128 px, transparente) | **~20 ms/quadro**; 3 585 quadros por kit em ~62 s (EEVEE em software: 14 s/quadro — não use sem GPU) |
| glTF (`exports/anim/athlete_<kit>.glb`) | 1,1 MB cada, 125–129 animações; reimportado com `verify_glb.py`: 1 armature, 11 ossos, 592–620 tris (triangulado, com prop) |
| Props (`exports/props/*.glb`) | football 140 tris (0,27×0,17 m) · puck 92 (0,076 m) · baseball 80 (0,074 m) · bat 140 (0,86 m) · hockey stick 24 (1,5 m) |

Bugs que só a execução revelou (já corrigidos): (1) peças presas com `parent_type='BONE'` ficam deslocadas (relativas à ponta do osso) →
agora uma malha única com grupos de vértices; (2) rotações de pose bone são no **referencial local do osso** (girar em Y local = torção, não
balanço) → eixo Y do mundo convertido por osso (`matrix_local⁻¹ @ Y`); (3) `BLENDER_EEVEE` sem GPU é impraticável → Workbench padrão.

## Comandos
```
node tools/anim/export_clips.mjs                                   # 129 clipes -> exports/anim/nfl_clips.json
blender --background --python tools/blender/build_nfl_sprites.py -- --kit football --out exports/anim/frames_football --size 128 --glb exports/anim/athlete_football.glb
#   --kit football|hockey|baseball  --only id1,id2  --step N  --azimuth 30 (0 = vista lateral)  --engine workbench|cycles|eevee  --jersey r,g,b
python3 tools/blender/pack_sheets.py exports/anim/frames_football exports/anim/sheets_football        # Pillow
blender --background --python tools/blender/build_props.py -- --out exports/props
blender --background --python tools/blender/verify_glb.py -- exports/anim/athlete_football.glb
```
`frames*/` e `sheets*/` ficam fora do Git (46 MB + 15 MB por kit): regerar leva ~3 min por kit. Prévia: `docs/anim/blender_preview.png`.

## O que NÃO foi verificado / limites honestos
* Só testei no Blender 5.1 via pip. **Versão que você usa?** Se for 4.x, o provável é só `export_animation_mode` e o nome do motor EEVEE.
* **Não importei na engine** (Unity/Godot/Three.js): só reimportei no próprio Blender. Escala: metros, Z-up no Blender → Y-up no glTF (o exportador converte).
* `height=2.00 m` na reimportação contra 1,84 m do modelo: hipótese = a 1ª animação (braço levantado) está aplicada; não investigado.
* Visual: modelo **low-poly liso, sem rosto/textura/UV**; capacete cinza sem cor de time; o boné/stick/bastão seguem o antebraço (acessório simples).
  É um rig utilizável e correto em escala, não arte final. Cores de time: `--jersey r,g,b` (só camisa).
* Pernas: conversão planar dos deslocamentos de pé do clipe para ângulos (aproximação).
* Desempenho em celular/engine: **não medido** (só contagem de triângulos).

## Sprite sheet no jogo (modo "Sprites 3D")
Seletor **Visual → Sprites 3D** (NFL, NHL, MLB; salvo em `asu_visual_mode`). Pipeline: `tools/blender/make_atlas.sh [kit…]` renderiza 2 camadas por kit
(cor com camisa/capacete/calça brancos + máscara R=camisa/capacete, G=calça), `pack_atlas.py` monta `assets/sprites/<kit>_color.png`, `_mask.png` e `<kit>.json`
(96 px, 15 fps, 1 linha por clipe). Em tempo de execução `core/render/spriteSheet.js` escolhe o quadro pelo mesmo clipe/tempo do boneco (corrida por fase de
distância), **tinge por time** multiplicando pela máscara (cache LRU de 900 quadros) e espelha pela direção. Tamanhos: football 3,9 MB (48 clipes), hockey 0,7 MB (9), baseball 0,7 MB (11).
* O que usa o sheet: gaits (andar/trotar/correr/sprint/patinar/backpedal), idle, e na NFL os clipes de evento do atlas (arremessos, recepções, tackles…).
* **Cai para o boneco procedural** quando: o clipe não está no atlas (ações legadas: swing, chute, check, mergulho do MLB), goleiro, agachado (receptor/catcher), árbitro, ou enquanto o atlas carrega/falha.
* Medido (Chromium headless): custo de quadro a 1× NFL p95 2,4 ms · NHL 2,0 · MLB 3,5; a 4× CPU a NFL fica em 60 fps (238 quadros/4 s; o boneco procedural 204).
* Limites: visão fixa (3/4 frontal, espelhada), sem rosto/textura, cores só em camisa/capacete/calça, hockey: camisa preta fica quase preta, atlas congela em 15 fps.
