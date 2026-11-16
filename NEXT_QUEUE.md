# NEXT_QUEUE — American Sports Universe 2D

Fase atual: fila v2 A→F concluída (ver checkpoints no CLAUDE_HANDOFF.md). Último item concluído: UI do Career Hub (952/952 no Playwright) + FINAL de jogo nos 3 esportes.

## Próximos itens (em ordem)
1. **Táticas da carreira → motores 2D**: NHL/MLB lerem `pending.engineConfig` completo (forecheck, neutral zone, PP/PK, line matching; defensive alignment, bunts, steals, pinch hitters); NFL coach (`coach:{home,away}`) no motor. Arquivos: nhl/src/game/matchView.js + engineHook.js, mlb/src/game/matchView.js + engineHook.js, nfl/src/game/match.js, core/career/API.md ("engine-config").
2. **MLB**: alimentar `history/rest/consecutive` a partir de mlb/src/career/mlbSpec.js; ~~pickoffs~~ (feito: evento PICKOFF_ATTEMPT; falta animar o arremesso à base e o mergulho de volta); efeito de Injury Risk.
3. **NHL**: offside, ~~LINE_CHANGE~~ (feito: evento + narração; falta animar a saída do banco), reduzir TURNOVER "loose" e nº de passes (~1100/jogo).
4. **NFL**: ~~ações de boneco por evento~~ (feito na etapa 2: throw/catch/check/dive/celebrate; falta `snap` e `handoff`), arquibancada nas câmeras QB/ENDZONE, rebalancear Cover 1 Blitz, stunts/COUNTER mais efetivos. (Cores distintas com mesma primária já existem em `sideColors`: defesa vira kit claro — só conferir contraste em mais pares.)
5. **Carreira**: ação de API para editar aparência; shortlist do draft dentro do save; compressão de saves (0,7–4 MB); NFL 2D a partir do Hub.
6. **Smoke**: checar `tests/browser/smoke.mjs` "audio settings popover" e o limiar de rAF do MLB (27–29 rAF/s headless).

## Testes necessários ao retomar
- `npm test` (raiz + nfl), `node tests/browser/smoke.mjs 8200`, `node tests/browser/career.mjs 8200`, `node tests/browser/career_ui.mjs 8214 <dir>` (~12 min, rodar em background).

## Visual / colisão / sprites (sessão atual — branch ccr-1d32cd32-jtupys, PR #1)
- [x] Etapa 1: `core/render/labels.js` (rótulos sem sobreposição, 3 esportes) + NHL `separate()` robusto.
- [x] Etapa 2: ações de boneco por evento na NFL (`pumpActions` em nfl/src/ui/fieldRenderer.js).
- [x] Etapa 3: colisão medida. MLB: 2B e SS iam para o mesmo ponto (a 2ª base) em quase toda bola rebatida → agora `spread()` em baseballEngine.js afasta quem chega depois 6 ft (ticks com fielders <2 ft: 17,2% → 7,2%; o resto é bola em jogo/batedor×receptor). NFL: 10% dos ticks com pares <0,5 jd, quase tudo contato legítimo de bloqueio/tackle; sem mudança. Túnel a alta velocidade: NHL corrigido (ver abaixo); goleiro é por evento (sem geometria, não tunela); MLB `flight()` e NFL não auditados para túnel.
- [~] Etapa 4: FEITO: ações `snap`/`handoff` no avatar (core/render/avatars.js) ligadas na NFL; custo de quadro medido (Chromium headless, 1600×900: NFL p95 2,7 ms, NHL 2,5 ms, MLB 3,8 ms; máx 7,1 ms; orçamento 16,6 ms). FALTA: alinhamento/escala dos avatares por zoom (revisão visual), pickoff MLB (motor não tem pickoffs), LINE_CHANGE NHL (motor não tem), medir em celular real/CPU throttled.
- [ ] Rodar `tests/browser/smoke.mjs` e `career.mjs` (não rodados nesta sessão).
- [x] Túnel NHL: disco vindo de trás da rede a ≥150 ft/s (~100 mph, >3,33 ft/tick) atravessava a gaiola (80/80 casos); agora teste varrido do plano de fundo da rede em hockeyEngine.js `puckStep` (0/80). Teste: tests/nhl_engine2.test.mjs.
- [x] Revisão visual (12 capturas: NFL Close/Full/QB/Endzone/Tática, NHL Tactical/Puck/Full, MLB Batter/Pitcher/Infield/Full): escala, pés/sombras e leitura de equipe OK. Achado real: o pop-up de resultado da NFL cobria ~190 px do campo (a jogada congelada). Agora compacto (título + jardas, 106 px); tackle/conceito/"Por que terminou" continuam no painel Em jogo e no log. Observação: no Modo 2D (painel fechado) a explicação só aparece abrindo ☰ Painel.
- [x] Pickoff MLB + LINE_CHANGE NHL (gameplay novo, só nível de motor/eventos/narração; sem animação dedicada). Medido em 150 jogos MLB: ~4,2 tentativas/jogo, ~0,2 outs/jogo; runs/jogo 7,65 vs 7,55 sem pickoff, CS 0,25 vs 0,27 (sem efeito material no ambiente). NHL: LINE_CHANGE no gelo (troca em movimento) e nos faceoffs.
- [x] Animações: MLB PICKOFF_ATTEMPT → arremessador `throw` + corredor `dive` (fieldRenderer.js `pumpActions`); NHL LINE_CHANGE → quem sai desliza até a porta do banco por 1,6 s (fantasmas translúcidos, só visual) em rinkRenderer.js.
- [ ] DESEMPENHO com CPU limitada (CDP `Emulation.setCPUThrottlingRate`, Chromium headless, rAF por 4 s): 1× NFL/NHL/MLB ≈ 240 rAF (60 fps) p95 2,2–4,0 ms · 4× NFL 181 rAF (p95 16 ms), NHL 90 (≈22 fps, p95 18), MLB 68 (≈17 fps, p95 21) · 6× NHL 56 e MLB 47 rAF (≈12–14 fps). Perfil do MLB/NHL a 4×: ~54–75% em `(program)` (rasterização nativa do canvas em software) e só ~10% em funções JS (avatars, crowd.draw, drawPark/drawArena). Hipótese NÃO confirmada: em celular real a GPU rasteriza o canvas, então este teste exagera; mas os candidatos óbvios são camadas estáticas (estádio, arquibancada/crowd) redesenhadas a cada quadro → cache em canvas offscreen quando a câmera não muda.

## Animações NFL por clipes — 100 em 4 etapas (docs/anim/README.md)
- [x] Etapa 0+1: motor de clipes (core/anim), 25 clipes de QB/passe, boneco com cotovelo/pernas por keyframe, passada guiada por distância, ombreiras no kit de futebol, mapa evento→clipe (17 ligados), export JSON + scripts Blender (não executados), prévia `tools/anim/preview.html`, catálogo anotado. Testes: tests/anim_clips.test.mjs (13).
- [ ] Etapa 2: 25 receptores · [ ] Etapa 3: 25 corrida/contato · [ ] Etapa 4: 25 linhas/secundária/ST (nomes em docs/anim/plan.json).
- [ ] Rodar Blender (ver README) e validar convenções; ligar clipes sem evento (kneel, spike, cadence, pump fake, play-action, under-center, read-option) quando o motor tiver os eventos.
- NOTA DE DIVERGÊNCIA: o zip enviado (QA_CORRIGIDO 2026-10-26, checkpoints CP100–112, 331 testes) é outra linha de código que a deste repositório (fila A→F, 116 testes). O catálogo veio do zip; o código novo é modular (core/anim) para ser portado.
- [x] Pacote "noite" (100 clipes novos: movimentação 20, gestos 20, faltas 20, agarrado 20, passe 20) + locomoção por clipes ligada ao NFL (velocidade real → mv_walk/jog/run/sprint/backpedal, variantes com bola), jogadores derrubados deitados (ag_pile_bottom), tackle/sack/broken tackle/fumble/block/recepções/INT/breakup/drop/TD ligados a eventos. 125 clipes no total, 120 testes (17 de clipes). Export 125 clipes (3585 quadros assados a 30 fps).
- [ ] Faltas: o motor NFL não emite eventos de penalidade → 20 clipes de falta prontos sem gatilho. Decisão pendente do usuário: criar sistema de penalidades no motor (impacta equilíbrio/golden) ou só usar os clipes em replays/ilustração.
- [ ] Árbitro: não há entidade de árbitro no campo; os 18 sinais ficam prontos para uma futura entidade OFFICIAL.
- [ ] Rodar Blender (tools/blender/RUN_TONIGHT.md).
