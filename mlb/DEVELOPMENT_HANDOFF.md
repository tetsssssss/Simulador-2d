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
