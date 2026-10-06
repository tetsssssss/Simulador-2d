# CLAUDE_HANDOFF — NFL Universe 2D (v0.4 · RunGame)

> Memória técnica para a próxima sessão. Compacto de propósito. Histórico: `DEVELOPMENT_HANDOFF.md`.
> Métricas antes/depois e causas corrigidas: `docs/CALIBRATION_v04.md`.
> Sessão 02 = **Prompt A** (calibração + jogo corrido 2D). Próximo: Prompt B (não iniciado).

## CURRENT STATE
- App HTML/CSS/JS sem build. Abrir via servidor local (`START_APP.bat` ou `python -m http.server`).
- Partida 2D = simulação real: 22 jogadores + bola em passo fixo (30 Hz), RNG seedado, resultado lido do estado final.
- **Jogo corrido v0.4**: 12 conceitos (Inside/Outside Zone, Duo, Power, Counter, Trap × L/R) com assignment por
  bloqueador, double team real com climb, RunningBackDecisionEngine (lanes + score + decisão) e movimentos do portador.
- Calibrado contra a **liga inteira** (`tests/league.mjs`): passe 65 % / 7,1 YPA / 5,4 % sacks; corrida 4,7 ypc,
  mediana 3, 15 % stuff, 2,3 % de 20+.

## CHANGED (sessão 02)
| Item | Antes (v0.3) | Agora (v0.4) |
|---|---|---|
| Bloqueio de corrida | regra única "zone" + climb no defensor mais próximo | `runBlocking.js`: REACH/DRIVE/DOUBLE/COMBO/PULL/SEAL/CLIMB/KICK por esquema; puller (LEAD/KICK/TRAP) |
| Double team | 2º bloqueador só somava força | estado DOUBLE → CONTROL → READ LB → CLIMB (`blocking.js updateDouble`) |
| Leverage de corrida | binária perto do portador ("near" shed) | *fit* (ângulo bloqueador×defensor×bola) disputado por footwork vs agility; técnica define direção do drive |
| RB | busca angular genérica | `rbVision.js`: lanes reais na linha, score (gap, margem do 1º defensor, closing speed/pursuit, bloqueadores, 1ª descida, sideline, design), PRESS → READ → OPEN |
| Movimentos | — | `carrierMoves.js`: CUT/JUKE/SPIN/STIFF_ARM/TRUCK escolhidos por geometria + atributos; entram no TackleSystem |
| Defesa x corrida | todos perseguiam a bola após o handoff | DL squeeze/controle de gap, LB fit com percepção atrasada, DE backside contain (Discipline), DB pass-first |
| Tackle | lunge em todo 1º contato; arm tackle de bloqueio fácil | lunge só quando não fecha; tackle saindo de bloqueio exige lev > 0,6 e tem penalidade |
| Passe (calibração) | 71 % / 9,98 YPA / 1,8 % sack (liga) | rusher vencedor passa pelo OL batido; precisão quadrática; off-man/zona/deep corrigidos; timing de rota vertical |
| Debug | assignments, rotas, leituras, leverage | + lanes com score, lane escolhida, decisão/movimento do RB, "2x" double, setas de climb/pull, FREE |

## ARCHITECTURE
```
index.html → src/app.js (views, estado global `state`)
  ├─ src/ui/gameView.js      loop rAF, applyResult, box score, HUD (+ linha de corrida no debug)
  ├─ src/ui/fieldRenderer.js canvas, câmera, zoom, fotos, overlay debug (passe + corrida)
  ├─ src/sim/playSim.js      NFLPlay: createPlay / step / runToEnd → result + events; intents por papel;
  │                          runFrontVelocity (DL squeeze/contain) e runFitVelocity (LB/DB fit)
  │    formation.js   slots, alinhamento, PLAYBOOK (pass/deep/run), DEF_CALLS, zonas, ROUTES (+timing)
  │    runBlocking.js RunBlockingScheme: assignRunBlocks(sim, concept) + runBlockVelocity (técnica → ponto de ataque)
  │    blocking.js    BlockingSystem/PassRush: engajamentos, matchup por técnica, fit, runAttach, updateDouble
  │    rbVision.js    RunningBackDecisionEngine: buildLanes, marginAt, scoreLanes, decideRun, runnerVelocity
  │    carrierMoves.js moves do portador (qualquer portador, inclusive WR após a recepção e QB fora do pocket)
  │    tackle.js      carrierVelocity (campo aberto), pursuit (+juked), TackleSystem (+move, lunge, fromBlock)
  │    movement.js / attributes.js / routes.js / coverage.js / qb.js / ball.js / stats.js / geometry.js
  ├─ src/core/rng.js         RNG seedado
  └─ src/nflEngine.js, src/dataService.js, src/ratings.js
```
Pipeline por tick: intents (QB/rotas/cobertura/rush/fit/bloqueio/portador+moves) → engajamentos (double/climb) →
movimento → separação → handoff → bola → contato/tackle → apito.
Eventos de jogo inalterados (box score). **Novos eventos de debug** (`sim.debugEvents`): DOUBLE_TEAM, DOUBLE_CONTROL,
CLIMB, PULL_TURN, RB_DECISION {decision, laneY, laneType, score, lanes, free}, RB_MOVE {move, by, vs, q}.
BROKEN_TACKLE ganhou `move`, `lunge`, `fromBlock`. `result.contactX` = jardas antes do 1º contato (calibração).
`sim.runDebug` = { lanes[{x,y,width,type,score,trueScore,m1,m2,m3,support,lead}], chosen, decision, free[ids] }.
`sim.runPlan` = { scheme, aimY, doubleHold, press }. Bloqueador: `assignment = {type:'RUN_BLOCK', tech, target,
climbTo, partner, role, holeY, label}` (label ex.: `COMBO→RDT⇒MIKE`, `PULL:KICK→RDE`).

### RunningBackDecisionEngine (resumo)
Lanes = gaps entre corpos na faixa da linha (+ lane de design sempre presente). Score = largura (cap 2,6) +
margem de tempo do 1º defensor em P (linha), P2 (+5) e P3 (+10) [bloqueados ganham tempo de "get off"; defensor com
bloqueador livre no caminho conta como coberto; closing speed muda a velocidade média] + bloqueadores (lead/puller)
+ 1ª descida + 10 % da projeção − sideline − custo lateral − corpo no caminho + confiança no design (Discipline).
Percepção: ruído AR(1) por região de lane (∝ 1 − Vision), campo de visão (Vision), atraso (Awareness).
Decisão: tipo da lane (CUTBACK/BOUNCE/CUT_INSIDE) ou FOLLOW_BLOCK / ACCELERATE (lane de design limpa) /
HESITATE (buraco fechado com bloqueio se desenvolvendo, ninguém perto, paciência ∝ Vision). Commitment ∝ Agility;
troca de lane em velocidade = CUT (Agility/Change of Direction). Speed/Acceleration entram no tempo até o buraco.

## TESTED
- `npm test`: **23/23 ✔** (15 anteriores + 8 de corrida em `tests/run.test.mjs`: assignments por conceito, double
  team real, climb após CONTROL, RB nunca teleporta, mesma seed = mesma corrida, cutback determinístico em cenário
  montado, atributos influenciam (regret de lane por Vision; juke × truck por perfil), nenhum NaN em 12 conceitos ×
  4 coberturas × 3 campos).
- Golden seeds regenerados (mudança intencional de comportamento) — `node tests/golden.mjs --update`.
- `scenario E` (play.test) usa 160 jogadas (antes 80): com a precisão nova o QB "wild" (40/200) lança muita bola
  incatável e breakups ficaram raros na amostra pequena; asserções iguais.
- Harness: `node tests/league.mjs 80 mix` (≈18 s, 2.560 jogadas) e `node tests/harness.mjs 2000 mix` (≈14 s).
- 32 times × run/pass/deep sem erro; smoke Chromium (Playwright) com debug ligado em corridas: 0 erros JS.

## KNOWN ISSUES / STATUS
| Sistema | Status | Nota |
|---|---|---|
| Jogo corrido | IMPLEMENTED | TFL baixo (4–7 %), 10+ abaixo da NFL; Counter/Power < Zone (timing puller × fill do LB) |
| Moves do portador | IMPLEMENTED (sem animação) | decisões reais do motor; overlay mostra o nome do move |
| Passe | IMPLEMENTED | INT liga ~3,2 %, drops ~8 % das tentativas, YAC/rec 3,9 (baixo); sacks variam muito por confronto |
| QB scramble | PARTIAL | inicia (6 %), mas quase nunca vira corrida (`qbRunPct` ≈ 0) |
| Cobertura | PARTIAL | Cover 1/1-Blitz/2/3; sem 0/4/6/match; seam vs Cover 3 ainda forte |
| Pass rush | PARTIAL | sem stunts/twists; leverage com ruído 0,47 |
| Special teams, pênaltis, timeouts, 2-min | NOT IMPLEMENTED | (Prompt seguinte) |
| Carreira/lesões/trades | legado | `Math.random`; save sem versão |

Atributos sem consumidor (9): Durability, Kick Power, Kick Accuracy, Punting, Long Snap, Positioning, Leadership,
Teamwork, Consistency. (**Stiff Arm** e **Discipline** passaram a ser consumidos nesta sessão.)

## NEXT (maior valor)
1. Prompt B (conforme roteiro do usuário).
2. Corrida: penetração do DL (slants/stunts) para TFL realista; perseguição em campo aberto para 10+.
3. Passe: drops e INT; YAC; QB scramble → corrida.
4. Playbook UI (escolher conceito de corrida), estatísticas de RB (YBC/YAC, MTF) no box score.

## SESSION CHANGELOG (sessão 02)
- CREATED: `src/sim/runBlocking.js`, `src/sim/rbVision.js`, `src/sim/carrierMoves.js`, `tests/run.test.mjs`,
  `tests/league.mjs`, `docs/CALIBRATION_v04.md`.
- MODIFIED: `src/sim/{blocking,playSim,tackle,movement,coverage,qb,ball,routes,formation}.js`,
  `src/ui/{fieldRenderer,gameView}.js`, `tests/{harness.mjs,golden.json,play.test.mjs}`, `package.json` (0.4.0,
  script `harness:league`), `README.md`, `DEVELOPMENT_HANDOFF.md`, este arquivo.
- REMOVED: `assignRunBlocks`/`runBlockVelocity` antigos de `playSim.js` (substituídos por `runBlocking.js`).
