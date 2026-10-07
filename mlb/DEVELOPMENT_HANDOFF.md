# DEVELOPMENT_HANDOFF — MLB Universe 2D Alpha 0.1

## Implementado
- 30 franquias.
- Estádios atuais da temporada 2026.
- Logos.
- Rosters MLB 2026 sob demanda.
- Fotos.
- 40 atributos fixos 0–100.
- 30 atributos adaptativos 0–100.
- Prospect database.
- Draft explorer.
- World Series history 1903–2025.
- Rivalry engine baseline.
- Player profiles.
- Diamond 2D prototype.

## Arquitetura
- `data/mlb_core.json`: base estrutural.
- `js/data.js`: mesma base incorporada para funcionar sem fetch local.
- `js/app.js`: UI, ratings, API adapters, draft/prospect loaders e Diamond 2D.
- `styles.css`: interface.

## Pendências prioritárias
- Stats-to-ratings real calibration.
- Farm systems AAA/AA/A.
- Contracts/service time/arbitration/options/waivers.
- Scouting e potential.
- Draft board / mock draft / war room.
- Trade AI.
- Injury engine.
- Schedule/standings/playoffs.
- SaveManager persistente.
- 2D engine real.

## Definição dos ratings
Ratings são simulados/determinísticos e NÃO equivalem a ratings oficiais.
O modelo foi preparado para substituir progressivamente cada rating por fórmulas baseadas em estatísticas reais.

## Próxima sessão sugerida
Começar pelo motor de partida:
PitchModel -> BatterDecision -> ContactModel -> BallFlight -> FieldingAI -> Baserunning -> EventLog.

## v18 (American Sports Universe shell)
UI reescrita no shell comum (ver `../CLAUDE_HANDOFF.md`): `index.html` + `src/{app,mlbData,diamond}.js` + `mlb.css`.
`js/data.js` continua sendo a base. `js/app.js` e `styles.css` da Alpha ficaram sem uso (referência).

## MLB engine v2 (pitch model, batter AI, adaptive attributes)
- Pipeline por arremesso: PITCH → BATTER READ → DECISION → CONTACT → BALL FLIGHT → FIELDING → THROW → BASERUNNING → RESULT
  (`state.stage` ao vivo; `state.lastPitch.pipeline` lista as etapas na ordem observada).
- `src/sim/pitching.js`: 8 tipos (FF, FT, SI, FC, SL, CU, CH, FS) com rpm, eixo de spin (relógio), quebra H/V em polegadas e
  controle (erro de mira); arsenal 3–6 pitches derivado dos ratings; seleção por contagem/situação/mão/sequência.
- `src/sim/baseballEngine.js`: decisões do rebatedor TAKE · CONTACT · NORMAL_SWING · POWER_SWING · PROTECT (+ BUNT raro) no evento `PITCH`;
  contato (bat speed, timing, squared-up → EV/LA/spray/spin); `flight()` com arrasto, Magnus (backspin/topspin/sidespin), vento opcional,
  carom no muro e foul decidido pelo pouso; fly foul pode ser pego; roubos de base (`beginSteal`), decisões de corredor
  HOLD/ADVANCE/RETURN/TAG_UP/STEAL no evento `RUNNER_DECISION`; erros de arremesso; assistências do outfield; sac bunt.
  Calibração em `CT` / `TUNE` (exportados; usados só pelo script de calibração).
- `src/sim/adaptive.js`: `computeAdaptive(player, ctx)` PURA — 30 atributos + `drivers`/`tip` (por quê). "Fatigue" = frescor (100 = descansado);
  `Cold Zone Vulnerability` e `Injury Risk Today`: maior = pior. A engine usa o *delta* (valor − valor neutro do mesmo jogador).
  `adaptiveRatings(p, seed, ctx)` em `mlbData.js` continua existindo (agora chama a função pura). Card do jogador: `src/adaptiveCtx.js`.
- Opções novas de `createBaseballEngine`: `history[pid]` (últimas linhas de box), `rest[pid]`, `consecutive[pid]`, `wind`.
- Testes: `tests/mlb_engine.test.mjs` (4) + `tests/mlb_engine2.test.mjs` (11).
