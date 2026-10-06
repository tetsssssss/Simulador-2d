# DEVELOPMENT_HANDOFF

> **v0.4 RunGame (sessão Claude 02 / Prompt A, 2026-10-06):** jogo corrido 2D (12 conceitos: Inside/Outside Zone,
> Duo, Power, Counter, Trap) com assignments por bloqueador (REACH/DRIVE/DOUBLE/COMBO/PULL/SEAL/CLIMB/KICK), double
> team real (DOUBLE → CONTROL → READ LB → CLIMB), RunningBackDecisionEngine (lanes com score; FOLLOW_BLOCK, CUTBACK,
> BOUNCE, CUT_INSIDE, ACCELERATE, HESITATE), moves do portador (CUT/JUKE/SPIN/STIFF_ARM/TRUCK) e calibração por
> causas sistêmicas medida na liga inteira (`node tests/league.mjs`). Antes/depois: `docs/CALIBRATION_v04.md`.
> Estado técnico atual: `CLAUDE_HANDOFF.md`. Testes: `npm test` (23).

> **v0.3 (sessão Claude 01, 2026-10-06):** detalhes técnicos atuais em `CLAUDE_HANDOFF.md`.
> Resumo: Partida 2D virou simulação física/assignment real (`src/sim/`), estatísticas por evento, testes (`npm test`),
> snapshot local do roster (CORS), correção das chaves de atributos. O texto abaixo é o handoff original (Alpha),
> mantido como histórico; itens obsoletos estão marcados com ~~riscado~~ / **[v0.3]**.

## Estado atual
NFL Alpha funcional em HTML/CSS/JS sem build step.

## Funcionalidades concluídas
- Core de navegação e persistência
- 32 franquias
- sincronizador/importador de roster 2026
- PlayerAvatar/headshot resolver com fallback
- 50 atributos 1–200 e overall posicional
- perfis de atletas
- College Explorer
- 60 Super Bowls
- ~~partida 2D inicial 11 x 11~~ **[v0.3]** simulação 11 x 11 por jogada (passe, passe profundo, corrida)
- carreira, trades, lesões e rivalidades em versão inicial

## Arquivos principais
- index.html
- styles.css
- src/app.js
- src/dataService.js
- src/ratings.js
- src/nflEngine.js
- data/teams.json
- data/champions.json
- data/attributes.json

## Fotos
O aplicativo prioriza `headshot_url` do roster. Se ausente, tenta ESPN ID. Se ainda ausente, usa silhueta local. Não regredir fotos válidas para iniciais.

## Motor 2D
~~Funcional como protótipo: 22 entidades, formações iniciais, animação procedural simples e resolução de corrida/passe/passe profundo. Ainda não há bloqueios individuais, coverage assignments, sacks, special teams, relógio real ou playbook completo.~~
**[v0.3]** Simulação em passo fixo com assignments explícitos, bloqueios/pass rush por engajamento, rotas, cobertura man/zona,
progressão do QB, bola com trajetória, catch/INT/drop, tackle e sacks emergentes, relógio básico e playbook inicial
(4 conceitos curtos, 4 profundos, 4 corridas). Ainda não há special teams, pênaltis ou timeouts. Ver `CLAUDE_HANDOFF.md`.

## Save
Persistência em localStorage. O roster sincronizado também é armazenado em cache local.
**[v0.3]** Atenção: o save de carreira (`asu_career`) não tem campo de versão (o texto da UI diz "versionado"). Pendente: SaveManager/SaveVersion.

## Testes
**[v0.3]** `npm test` (node:test, sem dependências) + `node tests/harness.mjs` (distribuições). Ver `CLAUDE_HANDOFF.md`.
**[v0.4]** + `tests/run.test.mjs` (jogo corrido) e `node tests/league.mjs 80 mix` (calibração com os 32 times).

### Testes executados na geração (Alpha)
- contagem exata de 50 atributos
- validação JSON dos datasets
- verificação sintática dos módulos JS via Node quando disponível
- inspeção de estrutura do ZIP

## Pendências prioritárias
1. depth chart real
2. contratos e salary cap
3. rookies/draft/college prospects
4. schedule e standings
5. ~~playbook e assignments~~ **[v0.3] iniciado** (playbook inicial + assignments por jogador)
6. estatísticas por jogo/temporada/carreira
7. coaches/staff
8. ~~engine 2D avançado~~ **[v0.3] vertical slice de passe concluído** · **[v0.4] calibração + jogo corrido concluídos; próxima etapa: Prompt B**
