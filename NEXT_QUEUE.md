# NEXT_QUEUE — American Sports Universe 2D

Fase atual: fila v2 A→F concluída (ver checkpoints no CLAUDE_HANDOFF.md). Último item concluído: UI do Career Hub (952/952 no Playwright) + FINAL de jogo nos 3 esportes.

## Próximos itens (em ordem)
1. **Táticas da carreira → motores 2D**: NHL/MLB lerem `pending.engineConfig` completo (forecheck, neutral zone, PP/PK, line matching; defensive alignment, bunts, steals, pinch hitters); NFL coach (`coach:{home,away}`) no motor. Arquivos: nhl/src/game/matchView.js + engineHook.js, mlb/src/game/matchView.js + engineHook.js, nfl/src/game/match.js, core/career/API.md ("engine-config").
2. **MLB**: alimentar `history/rest/consecutive` a partir de mlb/src/career/mlbSpec.js; pickoffs; efeito de Injury Risk.
3. **NHL**: offside, LINE_CHANGE, reduzir TURNOVER "loose" e nº de passes (~1100/jogo).
4. **NFL**: ~~ações de boneco por evento~~ (feito na etapa 2: throw/catch/check/dive/celebrate; falta `snap` e `handoff`), arquibancada nas câmeras QB/ENDZONE, rebalancear Cover 1 Blitz, stunts/COUNTER mais efetivos. (Cores distintas com mesma primária já existem em `sideColors`: defesa vira kit claro — só conferir contraste em mais pares.)
5. **Carreira**: ação de API para editar aparência; shortlist do draft dentro do save; compressão de saves (0,7–4 MB); NFL 2D a partir do Hub.
6. **Smoke**: checar `tests/browser/smoke.mjs` "audio settings popover" e o limiar de rAF do MLB (27–29 rAF/s headless).

## Testes necessários ao retomar
- `npm test` (raiz + nfl), `node tests/browser/smoke.mjs 8200`, `node tests/browser/career.mjs 8200`, `node tests/browser/career_ui.mjs 8214 <dir>` (~12 min, rodar em background).

## Visual / colisão / sprites (sessão atual — branch ccr-1d32cd32-jtupys, PR #1)
- [x] Etapa 1: `core/render/labels.js` (rótulos sem sobreposição, 3 esportes) + NHL `separate()` robusto.
- [x] Etapa 2: ações de boneco por evento na NFL (`pumpActions` em nfl/src/ui/fieldRenderer.js).
- [x] Etapa 3: colisão medida. MLB: 2B e SS iam para o mesmo ponto (a 2ª base) em quase toda bola rebatida → agora `spread()` em baseballEngine.js afasta quem chega depois 6 ft (ticks com fielders <2 ft: 17,2% → 7,2%; o resto é bola em jogo/batedor×receptor). NFL: 10% dos ticks com pares <0,5 jd, quase tudo contato legítimo de bloqueio/tackle; sem mudança. Falta: teste de velocidade alta (bola/disco atravessando goleiro/poste/muro).
- [~] Etapa 4: FEITO: ações `snap`/`handoff` no avatar (core/render/avatars.js) ligadas na NFL; custo de quadro medido (Chromium headless, 1600×900: NFL p95 2,7 ms, NHL 2,5 ms, MLB 3,8 ms; máx 7,1 ms; orçamento 16,6 ms). FALTA: alinhamento/escala dos avatares por zoom (revisão visual), pickoff MLB (motor não tem pickoffs), LINE_CHANGE NHL (motor não tem), medir em celular real/CPU throttled.
- [ ] Rodar `tests/browser/smoke.mjs` e `career.mjs` (não rodados nesta sessão).
