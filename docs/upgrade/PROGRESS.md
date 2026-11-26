# Upgrade integrado (gráficos 3D · carreira · interface) — checkpoint

**Estado:** M0–M4 em andamento (branch `ccr-1d32cd32-jtupys`). Engine: PlayCanvas 2.24.3 + canvas 2D, JS/ES modules, sem build.
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

## Próximo passo
M2/M3 gráficos (torcida NHL lado oposto, borrão MLB, mangas), M5 HUD/menu, M6 validação final. Ver `VALIDATION.md`.
