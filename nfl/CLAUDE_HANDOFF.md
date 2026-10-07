# CLAUDE_HANDOFF — NFL Universe 2D (v0.5 · Product Layer)

> Universo (seletor NFL/NHL, NHL): ver `../CLAUDE_HANDOFF.md`. Esta NFL v0.5 roda inalterada dentro do shell.
> Memória técnica para a próxima sessão. Compacto de propósito. Histórico antigo: `DEVELOPMENT_HANDOFF.md`.
> Calibração do motor: `docs/CALIBRATION_v04.md`. Sessão 03 = **Prompt B** (produto/UI). Sessão 02 = Prompt A (motor/corrida).

## CURRENT VERSION
v0.5.0 — motor v0.4 intacto + camada de produto (UI nova, modos, sliders, saves versionados).

## CURRENT STATE
- HTML/CSS/JS vanilla (ES modules), sem build. Abrir via servidor (`START_APP.bat` ou `python -m http.server`).
- Partida 2D = simulação real (22 jogadores + bola, 30 Hz, RNG seedado). UI só lê `sim`/`result`/eventos.
- Rotas por hash: `#home #play #career #roster/<TEAM|ALL> #depth/<TEAM> #player/<gsis_id> #settings/<tab> #franchises
  #trades #medical #rivalries #champions #colleges #data`.
- Calibração (Simulation, liga): 65,2 % / 7,06 YPA / 5,4 % sacks; 4,7 YPC, mediana 3, 14,8 % stuff, 2,3 % 20+ (= v0.4).

## IMPLEMENTED THIS SESSION
- **UI nova** (identidade "front office / broadcast"): sidebar por seções, Home/Dashboard (hero da franquia, próximo
  jogo com Jogar/Simular, último resultado, calendário, tabela da divisão, stats do time, destaques, lesões,
  transações, notícias, atalhos), tela de boas-vindas sem carreira.
- **PlayerAvatar** (`components.avatar`, tamanhos xs/sm/md/lg/xl): headshot_url → ESPN → silhueta; shimmer de loading,
  `onerror` → fallback, URLs falhas memorizadas na sessão; Settings › Display › fotos on/off (lista e campo).
- **Roster** (busca, filtros posição/status/OVR/idade, ordenação por coluna, até 400 linhas, "toda a liga") +
  **Depth Chart** (titulares = `buildLineups` do motor, depois backups/reservas por OVR; ST).
- **Perfil**: hero com foto grande/bio/draft/OVR, traits derivados de ratings, pontos fortes/fracos, 7 grupos de
  atributos com marcador da média da posição, comparação com outro atleta, stats da temporada (jogos da carreira).
- **Partida**: scorebug de transmissão (posse, quarto, relógio, down&distance, bola, play clock visual), painel de
  play call (RUN 6 famílias × L/R, SHORT/DEEP com rotas, 4 coberturas), Pause/0.5–4x/Next Play/Auto Play/Sim to end,
  zoom, câmera fixa/segue, NORMAL × DEBUG, card de resultado (derivado de eventos), game log, drive strip, box score
  em abas (TEAM/PASSING/RUSHING com YBC/YAC/MTF/RECEIVING/DEFENSE/SCORING), clique no jogador → ficha lateral.
  Atalhos: Espaço, N, D, 1–4.
- **Modos**: QUICK (você chama o ataque dos 2 lados), COACH (um time: ataque + cobertura), SPECTATOR (CPU×CPU, auto),
  SANDBOX (situação livre, ataque+cobertura, lock/replay seed, não altera placar), CAREER (jogar/assistir/simular o
  jogo da semana). Todos usam `createPlay`/`step`.
- **GameplaySettings** + presets SIMULATION (default) / BALANCED / CHAOTIC; Settings em GAMEPLAY/DISPLAY/SIMULATION/SAVE.
- **SaveManager** v1: 5 slots, autosave, export/import JSON, migração `asu_career` → slot (backup mantido),
  save corrompido é reportado e preservado (`asu_nfl_save_N_corrupt`).
- **Carreira**: calendário 17 semanas seedado (6 divisionais), tabela 32 times, notícias, lesões (slider), trades
  registrados, stats da temporada; lesionados ficam fora das partidas da carreira. `Math.random` removido.

## ARCHITECTURE CHANGES
```
src/app.js            shell: state, hash router, settings/saves, career glue (finishCareerGame, simCareerGame)
src/game/match.js     game state (newGameState/applyPlay), CPU calls (seeded), snap(), summarize() p/ card+log,
                      simulateGame/simulateRest (jogo inteiro headless com o motor, ~1 s)
src/game/career.js    createCareer/normalizeCareer/ensureSchedule/completeWeek/recordGameStats/divisionTable
src/core/gameplaySettings.js  sliders, presets, sanitize, engineTuning(gameplay) → null no default
src/core/saveManager.js       envelope {version,createdAt,updatedAt,career,settings,metadata}, slots, migração
src/ui/gameView.js    tela da partida + setup de modos (1 rAF garantido via activeCleanup)
src/ui/components.js  avatar, logo, OVR, ATTR_GROUPS, KEY_ATTRS, traits, médias por posição
src/ui/views/*.js     home, roster(+depth), player, settings, career(saves), misc (franquias, trades, ...)
```
**Hooks do motor (neutros no default, provado por teste bit-a-bit):** `createPlay({ tuning })` → `sim.tune`;
`buildProfile(p, overrides, influence)` escala r' = 0.5 + (r−0.5)·k nas chaves do slider; `e.fatigueK` multiplica
o desgaste (`movement.integrate`); `sim.tune.turnover` multiplica pInt (2 pontos em `ball.js`) e pFumble (`tackle.js`).
WHISTLE ganhou `contactX`; `stats.js`: rush.ybc/yac/mtf e team.firstDowns.

## NEW FILES
`src/core/{gameplaySettings,saveManager}.js`, `src/game/{match,career}.js`, `src/ui/{components,teamColors}.js`,
`src/ui/views/{home,roster,player,settings,career,misc}.js`, `tests/product.test.mjs`.

## MODIFIED FILES
`index.html`, `styles.css` (reescrito), `src/app.js` (reescrito), `src/ui/gameView.js` (reescrito),
`src/ui/fieldRenderer.js` (photos/follow/selected/pick), `src/sim/{attributes,playSim,movement,ball,tackle,stats}.js`
(hooks acima), `package.json` 0.5.0, `README.md`.

## TEST STATUS
- `npm test`: **32/32 ✔** (23 anteriores + 9 em `tests/product.test.mjs`: tuning nulo no default, bit-identidade com
  tuning neutro, influence, Turnover 0 ⇒ sem INT/fumble, slots/export/import, migração legada + corrupção, painel só
  com conceitos reais, jogo inteiro determinístico e placar = TDs×7 + safeties×2, semana da carreira).
- Golden inalterado. `tests/league.mjs 80 mix` = baseline v0.4.
- Smoke Playwright (1366×768, 1600×900, 1920×1080): todas as telas, Coach + Debug + clique no campo, Sim to end,
  Sandbox, migração do save antigo, Simular semana — 0 erros JS, sem scroll horizontal.

## KNOWN ISSUES
| Item | Nota |
|---|---|
| Special teams/pênaltis/timeouts | não implementados → 4ª descida sempre vai para o jogo (≈165 jogadas/jogo); slider de pênalti reservado |
| Jogos fora do seu time (carreira) | placar por força média dos titulares + ruído seedado (não usa o motor) |
| Playoffs / offseason | temporada termina na semana 17 |
| Depth chart | só visualização (não editável); titulares vêm da seleção automática |
| Partida em andamento | não persiste em save (só carreira/settings); sair e voltar na mesma sessão funciona (Continuar) |
| Carreira (perfil) | sem histórico multi-temporada nem contratos |
| Motor (de v0.4) | TFL baixo, QB scramble raramente vira corrida, sem Cover 0/4/6, sem stunts |

## NEXT PRIORITIES
1. Special teams mínimos (punt/FG/kickoff) no motor → 4ª descida e placares realistas.
2. Depth chart editável alimentando `buildLineups` (override por slot).
3. Playoffs + nova temporada; persistir partida em andamento.
4. Motor: penetração do DL/stunts, scramble → corrida, mais coberturas (só quando implementadas de verdade).
