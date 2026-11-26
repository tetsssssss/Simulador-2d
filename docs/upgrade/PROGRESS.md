# Upgrade integrado (gráficos 3D · carreira · interface) — checkpoint

**Estado:** M0–M6 concluídos no escopo viável (resultado: parcial — fps/celular não verificáveis aqui) (branch `ccr-1d32cd32-jtupys`). Engine: PlayCanvas 2.24.3 + canvas 2D, JS/ES modules, sem build.
Saves: `localStorage` (`asu_career_*`, envelope versionado v3, migração e corrupção testadas). Testes: `npm test` (raiz + `cd nfl`), navegador em `tests/browser/*.mjs`.

## Inventário (resumo)
| Área | Estado |
|---|---|
| 3D (atletas HD próprios, campos, objetos, Full HD, qualidade Low/Med/High/Auto, FPS cap) | existente funcional |
| Carreira 3.0 (calendário, finanças, staff, treino, táticas, trade AI, draft, scouting, news, eventos, demissão/ofertas, histórico) | existente funcional |
| Pós-jogo na carreira | **ausente → implementado** (`core/career/recap.js`, painel "Último jogo") |
| Alvos de toque no celular (Career Hub) | **incompleto → corrigido** (≥ 44 px em telas touch / ≤ 640 px) |
| Teste `career_ui.mjs` com caminho fixo de outra sessão | **defeito → corrigido** (`os.tmpdir()`) |
| fps em GPU real / celular | bloqueado (sem hardware) |

## Decisões
- Recap = fatos do save (placares do avanço, classificação, diretoria/moral/torcida/reputação/caixa antes e depois, novas lesões). Campo opcional `c.x.recap` (saves antigos: sem recap, sem migração).
- Não trocar engine nem reescrever telas: a UI do Career Hub já cobre todas as views (`getXView`).

## Feito depois do 1º checkpoint
- Torcida 3D visível (NHL/MLB/NFL), arquibancada próxima oculta na câmera de transmissão, bancos do NHL com reservas.
- OT do NHL na carreira calibrado (15,7 % → 22,5 %).
- Contraste do token `--dim`.

## Backlog (P2)
OT do motor de partida do NHL; fiapos nas mangas dos atletas HD; dugouts/bullpen do MLB; bloom; fps real no PC e no celular.

Detalhes e comandos: `VALIDATION.md`.
