# CLAUDE_HANDOFF — NFL Universe 2D (v0.3)

> Memória técnica para a próxima sessão. Compacto de propósito. Histórico anterior: `DEVELOPMENT_HANDOFF.md`.
> Divergência registrada: o master prompt citava `NFL_Universe_2D_v0_2_ClaudeReady.zip` + este arquivo; o ZIP recebido
> foi `American_Sports_Universe_2D_NFL_Alpha.zip` e **não continha** CLAUDE_HANDOFF.md. Este arquivo nasce na v0.3.

## CURRENT STATE
- App HTML/CSS/JS sem build. Abrir via servidor local (`START_APP.bat` ou `python -m http.server`).
- **Partida 2D agora é simulação real**: 22 jogadores + bola em passo fixo (30 Hz), RNG seedado, resultado lido do
  estado final (spot, catch, sack, tackle). Antes: `resolvePlay` sorteava jardas por médias de time e animava depois.
- Box score derivado só de eventos. Estado de jogo: downs, posse, placar, TD/safety/turnover, relógio básico.
- Roster: tenta nflverse remoto e cai no snapshot local `data/roster_2026.csv` (3.020 atletas reais, nflverse).

## CHANGED (sessão 01)
| Item | Antes | Agora |
|---|---|---|
| Jogada | estatística sorteada + animação cosmética | `src/sim/*` simula; animação = estado simulado |
| Atributos | chaves quebradas: `throwingPower`→`throwingower` (28/50 ilegíveis, motor caía em `\|\|100`) | chaves camelCase corretas; 39/50 consumidos pelo motor |
| Lineup | aceitava RES (IR) e DEV; DB/OL sem slot real | ACT primeiro; slots por `depth_chart_position` (T/G/C, DE/DT, CB/S) |
| Roster | sync sempre falhava em browser (CORS do redirect do GitHub) → campo vazio | fallback para snapshot local |
| Posse/placar | turnover não trocava posse; TD aleatório | posse real, TD por linha de gol, safety, turnover on downs |
| Render | sprites DOM 48px em campo de 120 jd (sobrepostos) | canvas com câmera, 3 zooms, fotos em cache, overlay de debug |

## ARCHITECTURE
```
index.html → src/app.js (views, estado global `state`)
  ├─ src/ui/gameView.js      Partida 2D: loop rAF, relógio de simulação (acumulador) ≠ relógio de render,
  │                          applyResult (downs/posse/placar/relógio), box score, HUD
  ├─ src/ui/fieldRenderer.js canvas: câmera, zoom close/medium/full, fotos (cache por URL), overlay debug
  ├─ src/sim/playSim.js      NFLPlay: createPlay(opts) / step(sim) / runToEnd(sim) → result + events
  │    formation.js   slots, alinhamento, PLAYBOOK (conceitos), DEF_CALLS (Cover 1/1 Blitz/2/3), zonas
  │    attributes.js  ratings 1–200 → perfil físico (maxSpeed, accel, turn, mass, reach)
  │    movement.js    MovementSystem: aceleração/frenagem/giro limitados, fadiga, colisão
  │    blocking.js    BlockingSystem + PassRush: engajamento com leverage contínua (speed/power/finesse),
  │                   double team, shed, stalemate/counter, pocket compression, run block sustain
  │    routes.js      RouteSystem: geometria + fases RELEASE/STEM/BREAK/POST_BREAK, jam, scramble drill
  │    coverage.js    CoverageSystem: man (atraso de percepção + leverage) e zona (landmark, ameaças, olhos do QB)
  │    qb.js          QBProgressionEngine: drop, leituras com tempo de processamento, timing de rota,
  │                   openness percebida (ruído ∝ awareness/pressão), pocket (step up/slide), scramble, throw away
  │    ball.js        PassingSystem (lead via simulação-fantasma da rota, erro por precisão/pressão/movimento,
  │                   voo parabólico z) + CatchSystem (catch/drop/breakup/deflection/INT por posição)
  │    tackle.js      portador (busca de lane), pursuit angles, TackleSystem (ângulo, massa, skills, gang, fumble)
  │    stats.js       box score a partir de eventos
  ├─ src/core/rng.js         RNG seedado (next/range/int/chance/weighted/normal/fork)
  ├─ src/nflEngine.js        buildLineups (+ legado resolvePlay/animateTargets, não usados pela UI)
  └─ src/dataService.js, src/ratings.js
```
Pipeline por tick: intents (QB/rotas/cobertura/rush/proteção/portador) → engajamentos → movimento → separação
→ bola → contato/tackle → apito. Eventos: SNAP, PASS_ATTEMPT, PASS_COMPLETE, INCOMPLETE(reason), PASS_BREAKUP,
INTERCEPTION, SACK, SCRAMBLE, HANDOFF, TACKLE, BROKEN_TACKLE, FUMBLE, FUMBLE_RECOVERY, OUT_OF_BOUNDS, TOUCHDOWN,
SAFETY, SHED, WHISTLE (+ debug: QB_READ, JAM, PRESSURE, BLITZ_PICKUP, RUN_READ, ROUTE_BREAK).
Seed por jogada = `${seedDoJogo}-${nº}-${tipo}` (seed editável na UI).

## TESTED
- `npm test` (= `node --test tests/*.test.mjs`): 15/15 ✔ — RNG, chaves de atributo (regressão), movimento sem
  teleporte, lineups reais/ativos, determinismo, continuidade de jogadores/bola, pipeline do passe, cenários A–E,
  coerência box score × resultados (300 jogadas), golden seeds (`tests/golden.json`).
- `node tests/harness.mjs 1000 mix` (SEA×NE): cmp 72,4% · YPA 9,8 (inclui "passe profundo") · sack 1,9% · INT 2,4% ·
  scramble 6,3% · TTT 2,1 s · YPC 5,6 · 50% das corridas ≤ 0 jd. 1000 jogadas em ~8 s.
- 32 times × (pass/deep/run): sem erro. Smoke test Chromium: roster via snapshot, 8+ jogadas, TD/posse/box score.

## KNOWN ISSUES / STATUS
| Sistema | Status | Nota |
|---|---|---|
| Passe (vertical slice) | IMPLEMENTED | balanceamento P2: cmp alto, sacks baixos (NFL ≈ 65% / 6,5%) |
| Corrida (zone) | PARTIAL | P2 bimodal: ~50% ≤0 jd e muitas explosivas; leitura do RB vs LB livre fraca |
| Pass rush moves | PARTIAL | speed/power/finesse afetam matchup e trajetória; sem stunts/spin visual |
| Cobertura | PARTIAL | Cover 1, 1-Blitz, 2, 3; sem 0/4/6/Tampa/match. Press-man fecha slants demais (P2) |
| Retorno de INT/fumble | PARTIAL | INT pode ser devolvida; fumble termina na recuperação |
| PAT | PLACEHOLDER | +7 automático (comportamento legado preservado) |
| Special teams, pênaltis, timeouts, 2-min | NOT IMPLEMENTED | kickoff = touchback no 25 |
| Fadiga entre jogadas | PARTIAL | energia persiste no jogo, recuperação fixa |
| Carreira/lesões/trades | legado | ainda usam `Math.random`; save sem versão (P2); trade value: `(p.age||25-25)` = idade inteira (P2) |
| Fotos | IMPLEMENTED | `headshot_url` → ESPN ID → silhueta; zoom "Próximo" desenha foto no canvas |

Atributos sem consumidor (11): Durability, Stiff Arm, Kick Power, Kick Accuracy, Punting, Long Snap, Positioning,
Discipline, Leadership, Teamwork, Consistency — dependem de special teams/lesões/pênaltis/moral.

## NEXT (maior valor)
1. Calibrar com o harness (sem mexer em arquitetura): taxa de pressão→sack, % de passes completos, jogo corrido bimodal.
2. Jogo corrido: leitura do RB (lane vs LB livre), combos/double → climb, cutback.
3. Play-action e Cover 0/4 + match; stunts no pass rush.
4. Special teams mínimo (kickoff/punt/FG) para partidas completas; consumir Kick*/Punting.
5. Extrair `core/rng.js` + padrão de eventos para `SportsUniverseCore` quando NHL/MLB começarem a simular.

## SESSION CHANGELOG
- CREATED: `src/core/rng.js`, `src/sim/{attributes,geometry,formation,movement,blocking,routes,coverage,qb,ball,tackle,stats,playSim}.js`,
  `src/ui/{gameView,fieldRenderer}.js`, `data/roster_2026.csv` (snapshot nflverse 2026-10-06), `tests/*`, `package.json`, este arquivo.
- MODIFIED: `src/app.js` (view Partida 2D delega a gameView; estado inicial do jogo), `src/ratings.js` (bug das chaves),
  `src/nflEngine.js` (buildLineups; legado marcado), `src/dataService.js` (fallback local), `styles.css` (+canvas/box score),
  `DEVELOPMENT_HANDOFF.md`, `README.md`.
- REMOVED: nada.
