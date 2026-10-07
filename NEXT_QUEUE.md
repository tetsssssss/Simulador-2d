# NEXT_QUEUE — American Sports Universe 2D

Fase atual: fila v2 A→F concluída (ver checkpoints no CLAUDE_HANDOFF.md). Último item concluído: UI do Career Hub (952/952 no Playwright) + FINAL de jogo nos 3 esportes.

## Próximos itens (em ordem)
1. **Táticas da carreira → motores 2D**: NHL/MLB lerem `pending.engineConfig` completo (forecheck, neutral zone, PP/PK, line matching; defensive alignment, bunts, steals, pinch hitters); NFL coach (`coach:{home,away}`) no motor. Arquivos: nhl/src/game/matchView.js + engineHook.js, mlb/src/game/matchView.js + engineHook.js, nfl/src/game/match.js, core/career/API.md ("engine-config").
2. **MLB**: alimentar `history/rest/consecutive` a partir de mlb/src/career/mlbSpec.js; pickoffs; efeito de Injury Risk.
3. **NHL**: offside, LINE_CHANGE, reduzir TURNOVER "loose" e nº de passes (~1100/jogo).
4. **NFL**: ações de boneco por evento (snap/throw/tackle/celebrate), arquibancada nas câmeras QB/ENDZONE, rebalancear Cover 1 Blitz, stunts/COUNTER mais efetivos, cores distintas quando os times têm a mesma primária.
5. **Carreira**: ação de API para editar aparência; shortlist do draft dentro do save; compressão de saves (0,7–4 MB); NFL 2D a partir do Hub.
6. **Smoke**: checar `tests/browser/smoke.mjs` "audio settings popover" e o limiar de rAF do MLB (27–29 rAF/s headless).

## Testes necessários ao retomar
- `npm test` (raiz + nfl), `node tests/browser/smoke.mjs 8200`, `node tests/browser/career.mjs 8200`, `node tests/browser/career_ui.mjs 8214 <dir>` (~12 min, rodar em background).
