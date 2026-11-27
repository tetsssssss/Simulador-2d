# Inventário (Etapa 1) — o que aparece de fato em partida
Gerado por `node tools/anim/inventory.mjs`. **Ligado** = algum esporte dispara o clipe a partir de evento/estado real do motor (qualquer modo visual).
**Só demo** = aparece apenas no botão "Falta (demo)". **Sem gatilho** = existe, está testado e exportável, mas nenhuma jogada o chama.

| Lote | Clipes | Ligados | Só demo | Sem gatilho |
|---|---:|---:|---:|---:|
| qb | 25 | 17 | 0 | 8 |
| move | 20 | 10 | 0 | 10 |
| gesture | 20 | 1 | 1 | 18 |
| foul | 20 | 0 | 19 | 1 |
| grab | 20 | 9 | 2 | 9 |
| pass | 20 | 11 | 0 | 9 |
| skate | 4 | 4 | 0 | 0 |
| sport | 18 | 17 | 0 | 1 |
| **Total** | **147** | **69** | **22** | **56** |

## Por esporte
* **NFL (47 ligados, 2 modos):** locomoção por velocidade, arremessos por tipo de bola/pressão, recepções por altura/posição, tackle/sack/broken tackle/fumble/bloqueio, TD. Sem gatilho: kneel, spike, cadência, pump fake, play-action, under-center, read-option, pré-snap/huddle.
* **NHL (5 nos 2 modos + 14 só em Sprites 3D):** patinação por velocidade; chutes por `shotType`, check e goleiro por estado só no modo sheet (o boneco usa as poses procedurais antigas).
* **MLB (7 nos 2 modos + 8 só em Sprites 3D):** corrida por velocidade; batedor, arremessador, catcher só no modo sheet. **Ainda sem gatilho:** `bb_field_ground` (ground ball), pickoff, slide, bola aérea/mergulho do motor novo.
* **Faltas/árbitro:** 12 faltas + sinais só pelo botão demo; o motor não emite `PENALTY`.

## Sem gatilho (por lote)
* **qb** (8): qb_back_shoulder, qb_jump_throw, qb_pump_fake, qb_play_action, qb_kneel, qb_spike, qb_cadence, qb_read_option
* **move** (10): mv_shuffle, mv_carioca, mv_high_knees, mv_plant_cut, mv_decelerate, mv_burst, mv_turn_180, mv_open_hip, mv_vertical_jump, mv_athletic_ready
* **gesture** (18): gs_fist_pump, gs_first_down, gs_point_sky, gs_wave_crowd, gs_pre_snap_motion, gs_audible_point, gs_sideline_signal, gs_beckon, gs_shrug, rf_touchdown, rf_first_down, rf_incomplete, rf_timeout, rf_safety, rf_no_good, rf_touchback, rf_clock_stop, rf_dead_ball
* **foul** (1): rf_delay_of_game
* **grab** (9): ag_ankle_tackle, ag_diving_tackle, ag_bear_hug, ag_jersey_grab, ag_shoestring, ag_strip_attempt, ag_two_hand_cover, ag_double_team_grip, ag_pull_down
* **pass** (9): ps_fade, ps_screen_toss, ps_checkdown, ps_no_look, ps_across_body, ps_shovel, ps_hail_mary, ps_catch_one_hand, ps_catch_back_shoulder
* **sport** (1): bb_field_ground

## Pesos medidos
| Item | Tamanho |
|---|---|
| assets/sprites (atlas em uso + 6 antigos órfãos) | 16.4 MB |
| exports/anim (3 .glb + clipes JSON) | 4.0 MB |
| exports/props (5 .glb) | 0.03 MB |
