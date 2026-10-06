# Auditoria — Sessão 01 (2026-10-06) · American Sports Universe 2D

Escopo: auditoria + baseline dos 3 projetos; implementação **somente NFL** (ver `nfl/CLAUDE_HANDOFF.md`).
NHL e MLB não foram alterados nesta sessão.

## 1. Inventário dos ZIPs
| ZIP recebido | Arquivos | Tamanho | Conteúdo |
|---|---|---|---|
| `American_Sports_Universe_2D_NFL_Alpha.zip` | 13 | 104 KB | index.html, styles.css, `src/{app,dataService,ratings,nflEngine}.js`, `data/{teams,champions,attributes,sources}.json`, README, DEVELOPMENT_HANDOFF, START_APP.bat |
| `NHL_Universe_2D_Alpha_0_1.zip` | 12 | 108 KB | index.html, styles.css, `js/{app,data}.js`, `data/{teams,attributes,champions,rivalries}.json`, docs/SOURCES.md, README, DEVELOPMENT_HANDOFF, start_server.bat |
| `MLB_Universe_2D_Alpha_0_1.zip` | 9 | 112 KB | index.html, styles.css, `js/{app,data}.js`, `data/mlb_core.json`, docs/SOURCES.md, README, DEVELOPMENT_HANDOFF, start_server.bat |

Sem imagens, fontes, áudio, builds ou `node_modules`: todas as fotos/logos são URLs remotas.
**Divergência:** o prompt citava `NFL_Universe_2D_v0_2_ClaudeReady.zip` e `CLAUDE_HANDOFF.md`; o ZIP NFL recebido é a "Alpha" e não contém CLAUDE_HANDOFF (criado nesta sessão).

## 2. Mapas
**NFL** — `index.html` → `src/app.js` (ES module; estado global `state`; views renderizadas por `innerHTML`)
→ `dataService` (fetch/parse CSV nflverse, resolver de foto `headshot_url → ESPN → silhueta`), `ratings` (50 atributos 1–200 determinísticos por hash FNV do jogador), `nflEngine` (lineups + resolução da jogada).
Save: `localStorage` `asu_career` (sem versão) e cache `asu_roster_2026`. RNG: `Math.random` na jogada, carreira, lesões. Loop: `setInterval` 90 ms (animação).

**NHL** — `index.html` → `js/data.js` (`window.NHL_DATA`) + `js/app.js` (IIFE; views; `fetch` à NHL Web API; cache em memória).
35 atributos 0–99 (skater e goalie separados) por hash; OVR = média simples dos 35. Rink 2D: canvas + `requestAnimationFrame` **nunca cancelado** (cada visita à aba cria mais um loop). Sem save.

**MLB** — `index.html` → `js/data.js` (`window.MLB_DATA`, mesma base de `data/mlb_core.json` duplicada) + `js/app.js` (IIFE; StatsAPI).
40 atributos fixos + 30 adaptativos (0–99). OVR = média dos 40 (inclui atributos de pitcher para rebatedores e vice-versa). Diamond 2D: canvas + rAF nunca cancelado; "Rebater" usa `Math.random`. Sem save.

## 3. Baseline (Chromium headless via servidor local, antes de qualquer alteração)
| | Inicia | Erros de console | Fluxo de partida | Sistemas 2D reais |
|---|---|---|---|---|
| NFL | sim | CORS ×2 no roster, 404 favicon | **campo vazio (0 atletas) e mesmo assim "Passe completo para 8 jardas"** → prova de resultado sorteado | nenhum (animação cosmética) |
| NHL | sim | 404 favicon | não há partida; "Rink 2D" = puck quicando + perseguição | placeholder |
| MLB | sim | 404 favicon | não há partida; "Diamond 2D" = bola com velocidade aleatória | placeholder |

APIs NHL/MLB: bloqueadas pela política de rede **deste ambiente** (403 no proxy) → listas de elenco/prospects não verificáveis aqui. Risco (não verificado): a NHL Web API costuma não enviar CORS para navegadores — provável P0 equivalente ao da NFL.

## 4. Problemas classificados
| ID | Projeto | Sev. | Problema | Status |
|---|---|---|---|---|
| N1 | NFL | P0 | Roster: redirect de release do GitHub sem `Access-Control-Allow-Origin` → sync falha em qualquer navegador → partida sem jogadores | **corrigido** (snapshot local) |
| N2 | NFL | P1 | `ratings.js`: chaves camelCase perdiam maiúsculas (`throwingPower`→`throwingower`); 28/50 atributos ilegíveis pelo motor | **corrigido** + teste de regressão |
| N3 | NFL | P1 | Jogada = jardas sorteadas por médias + animação fake | **substituído** por simulação |
| N4 | NFL | P1 | Lineup aceitava IR/practice squad; `position` do nflverse é grupo (DB/OL) | **corrigido** |
| N5 | NFL | P1 | Turnover não trocava posse; TD sorteado | **corrigido** |
| N6 | NFL | P2 | Carreira/lesões com `Math.random`; save sem versão; trade value `(p.age‖25-25)` usa idade inteira | aberto |
| H1 | NHL | P1 | Rink sem posse/goalie/física: placeholder | aberto (roadmap) |
| H2 | NHL | P2 | rAF não cancelado (vazamento a cada visita) | aberto |
| H3 | NHL | P2 | OVR = média dos 35 atributos (não posicional) | aberto |
| M1 | MLB | P1 | Atributos adaptativos = re-sorteio por "dia", sem contexto (forma, fadiga, mão, estádio) | aberto |
| M2 | MLB | P1 | Diamond sem pitch/contato/fielding: placeholder | aberto (roadmap) |
| M3 | MLB | P2 | rAF não cancelado; base duplicada em `data.js` e `mlb_core.json`; OVR mistura pitcher/rebatedor | aberto |

## 5. Matriz comparativa
| Área | NFL (v0.3) | NHL | MLB | Melhor abordagem |
|---|---|---|---|---|
| State | módulo ES, `state` explícito | IIFE + `window.NHL_DATA` | IIFE + `window.MLB_DATA` | ES modules (como NFL) |
| Simulation | `src/sim` passo fixo, seedado, eventos | decorativo | decorativo | padrão NFL por esporte (motores independentes) |
| Rendering | renderer canvas separado do sim; teardown por `isConnected` | canvas rAF sem teardown | canvas rAF sem teardown | renderer lê estado, não altera; sempre com teardown |
| Data | CSV nflverse + snapshot local | API sem snapshot | API + JSON duplicado | snapshot local + sync opcional |
| Save | localStorage sem versão | — | — | SaveManager + SaveVersion + migração (core) |
| UI | sidebar + views | igual | igual | shell comum (mesmo design nos 3) |
| RNG | `core/rng.js` mulberry32 + FNV | FNV hash | FNV hash | **`core/rng.js` — 1º candidato real ao SportsUniverseCore** (mesmo hash nos 3) |
| Debug | overlay + HUD + eventos | — | — | overlay por esporte, liga/desliga |
| Assets | URL remota + silhueta | URL remota + iniciais | URL remota + iniciais | PlayerPhotoResolver por esporte com a mesma política de fallback |

**Comprovadamente compartilhável hoje:** hash FNV/RNG seedado (função idêntica nos 3), política de fallback de foto, shell de navegação.
**Ainda não:** eventos/stats (só NFL tem), save (nenhum tem versão).

## 6. Roadmap NHL / MLB (não implementado nesta sessão)
**NHL:** (1) snapshot local de rosters + verificar CORS; (2) teardown do rAF; (3) vertical slice `HockeySimulationEngine`: skating com momentum (mesmo padrão de `nfl/src/sim/movement.js`), puck como entidade (posse/lastTouch), passe com lanes, chute, goalie com estados próprios; (4) eventos → box score.
**MLB:** (1) snapshot local; (2) adaptativos calculados de contexto (fadiga, mão, estádio, forma) em vez de re-sorteio; (3) vertical slice: pitch (arsenal) → decisão do rebatedor → contato (EV/LA/spray) → voo → leitura do fielder → arremesso → corrida nas bases; (4) eventos → box score.
