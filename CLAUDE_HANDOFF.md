# CLAUDE_HANDOFF — American Sports Universe 2D (v18 · MLB Shell)

> Memória técnica do **universo** (shell + NHL). A NFL tem o próprio handoff: `nfl/CLAUDE_HANDOFF.md` (v0.5, intacta).
> Sessão v18 = MLB Prompt A (aba MLB). Sessão v11 = NHL Prompt A (seletor NFL/NHL).
> Divergência: os prompts citam v12–v17 (NHL B–G); nenhum ZIP dessas versões foi recebido nesta sessão — a v18 foi
> construída sobre a v11 deste repositório. Próximas MLB: B elencos/fotos/OVR posicional · C diamond grande · D sprites ·
> E pitch+batter · F física/fielding/baserunning · G HUD/partida. NHL B–G seguem pendentes aqui.

## CURRENT STATE
- Abrir a raiz via servidor (`START_APP.bat` na raiz ou `python -m http.server 8765`) → `http://localhost:8765`.
- Barra **NFL | NHL | MLB** sempre visível no topo (`index.html` da raiz). Cada esporte é um app separado em seu próprio
  documento (iframe): **motores, globais e loops `requestAnimationFrame` nunca se misturam**; trocar de esporte
  descarta o documento anterior (sem loops duplicados). Cada esporte lembra a última tela (`asu_inner_<sport>`).
- NFL: exatamente o sistema v0.5 (nenhum arquivo da NFL alterado). Continua abrindo sozinha em `nfl/index.html`.
- NHL: novo shell com a mesma identidade visual da NFL, navegação própria:
  Home · Times · Elencos · Prospectos · Arenas · História · Rivalidades · Partida 2D.
- MLB (v18): mesmo shell, acento laranja, navegação: Home · Franquias · Elencos · Prospectos · Draft · Estádios ·
  Rivalidades · Histórico · Partida 2D. Ficha do jogador com 40 fixos + 30 adaptativos (botão "Atualizar contexto do dia").

## ARCHITECTURE
```
SportsUniverse  index.html (raiz)      barra NFL|NHL + iframe; hash #nfl / #nhl; localStorage asu_sport
├── NFL         nfl/index.html         app v0.5 inalterado
└── NHL         nhl/index.html         shell NHL; CSS = ../nfl/styles.css (identidade única) + nhl/nhl.css (acento gelo)
     ├─ js/data.js        BASE EXISTENTE reaproveitada (window.NHL_DATA: 32 times, logos, arenas, 100 Stanley Cups,
     │                    25 rivalidades, 35 atributos skater + 35 goalie) — não recriada
     ├─ src/nhlData.js    adaptadores NHL Web API (roster/prospects), makeAttrs/overall/age — portados sem mudar
     │                    a lógica da Alpha (ratings idênticos)
     ├─ src/app.js        router por hash: #home #teams #team/<ABBR> #roster/<ABBR> #prospects/<ABBR> #arenas
     │                    #history #rivalries #rink; ficha do atleta em modal (35 atributos; goleiro usa os seus)
     └─ src/rink.js       Partida 2D = protótipo da Alpha (PLACEHOLDER) com teardown do rAF
└── MLB         mlb/index.html         shell MLB; CSS = ../nfl/styles.css + mlb/mlb.css
     ├─ js/data.js        BASE EXISTENTE (window.MLB_DATA: 30 times, logos, estádios 2026, 30 rivalidades,
     │                    123 World Series, 40 fixos + 30 adaptativos) — não recriada
     ├─ src/mlbData.js    StatsAPI (roster/people/draft/prospects), fixedRatings/adaptiveRatings — lógica da Alpha intacta
     ├─ src/app.js        #home #teams #team/<ABBR> #roster/<ABBR> #prospects #draft/<ANO> #stadiums #rivalries #history
     │                    #diamond; routeToken descarta respostas async de telas já abandonadas
     └─ src/diamond.js    Partida 2D = Diamond da Alpha (PLACEHOLDER) com teardown do rAF e RNG seedado no "Rebater"
```

## CHANGED (v18 · MLB)
| Item | Antes | Agora |
|---|---|---|
| Seletor | NFL \| NHL | NFL \| NHL \| MLB |
| MLB UI | IIFE com layout próprio | shell comum, 9 seções, rotas por hash |
| Diamond | rAF nunca cancelado; `Math.random` no "Rebater" | 1 loop (60 rAF/s após 6 visitas); RNG seedado |

## CHANGED (v11)
| Item | Antes | Agora |
|---|---|---|
| Entrada | 3 apps soltos | `index.html` raiz com seletor NFL/NHL |
| NHL UI | IIFE com layout próprio | shell igual ao da NFL, 8 seções, rotas por hash |
| Rink NHL | rAF nunca cancelado (1 loop extra por visita) | 1 loop (teste: 60 rAF/s após 6 visitas) |
| Prospectos NHL | lia só `prospects`/`players` (API real devolve forwards/defensemen/goalies) | lê os três grupos |
| Logos | ícone quebrado sem rede | selo com a sigla do time |

## TESTED (v18)
- NFL `npm test` 32/32 ✔. Playwright: NFL → NHL → MLB ×3, as 9 telas MLB, ficha com 40 + 30 atributos, draft,
  diamond 6× = 1 loop, iframe único (sem documentos acumulados), 0 erros JS. StatsAPI bloqueada aqui → respostas
  interceptadas no formato real da API.

## TESTED (v11)
- NFL `npm test`: 32/32 ✔ (inalterado).
- Playwright (1440×900): NFL → NHL → NFL ×3 (volta para a mesma tela da NFL), as 8 telas NHL, ficha com 35 atributos,
  rink 6× seguidas = 1 loop, barra sempre visível, 0 erros JS. A NHL Web API é bloqueada neste ambiente: o teste
  usa respostas no formato real da API (interceptadas) para validar elenco/ficha.

## KNOWN ISSUES (MLB)
- OVR MLB = média dos 40 fixos (mistura ratings de pitcher e rebatedor) e adaptativos são re-sorteio por "dia" —
  comportamento da Alpha mantido de propósito; corrigir no MLB Prompt B/E.
- Dados MLB dependem da StatsAPI (sem snapshot local). `mlb/js/app.js` e `mlb/styles.css` (Alpha) sem uso, mantidos.

## KNOWN ISSUES
- Dados NHL dependem da NHL Web API (sem snapshot local, ao contrário da NFL). CORS para navegador não verificado
  aqui → Prompt B.
- NHL usa `../nfl/styles.css`: abrir `nhl/` fora do repositório completo perde o visual.
- `nhl/js/app.js` e `nhl/styles.css` (Alpha) ficaram sem uso, mantidos como referência; remover após o Prompt B.
- Partida 2D NHL ainda é o protótipo decorativo (Prompts C–F).

---
# MEGA UPDATE — fila autônoma A→G (base: v18)

Camada compartilhada nova na raiz: `core/` (infraestrutura, **nunca** lógica esportiva). Os apps a importam por
caminho relativo (`../../../core/...`), por isso o universo deve ser servido pela raiz (`START_APP.bat` da raiz; o
`nfl/START_APP.bat` agora serve a pasta pai e abre `/nfl/index.html`).

## CHECKPOINT A — Visual HQ + resolução
- Feito: `core/render/hidpi.js` (tamanho CSS ≠ backing store; ResizeObserver + watch de DPR; `begin()` aplica o DPR por
  frame; `dispose()`), `core/render/images.js` (cache único de imagens, URL falha memorizada, `drawImageCover` /
  `drawCirclePhoto` sem esticar). Renderer NFL usa os dois (fotos com crop "cover"); listener de `resize` da janela
  removido (ResizeObserver cobre). Canvas da partida até 980 px de altura; ≥1800 px: coluna lateral 380 px, campo ≈75 %.
  Fonte com antialiasing/optimizeLegibility.
- Arquivos: `core/render/{hidpi,images}.js`, `nfl/src/ui/{fieldRenderer,gameView}.js`, `nfl/styles.css`, `nfl/START_APP.bat`.
- Testes: NFL 32/32; Playwright 1980×1080 DPR 2 → canvas 2652×1560 para 1326×780 CSS; 0 erros.
- Problemas: NHL/MLB ainda com canvas protótipo (substituídos na fase B).
- Próxima: B — visual 2D dos três esportes.

## CHECKPOINT B — Visual 2D dos três esportes
- Feito:
  - `core/render/camera.js` (câmera 2D suave, tempo-real, flipY) e `core/render/sprites.js` (sprite comum + bola/puck
    com halo, trail, sombra e indicador de "no ar") — infraestrutura, sem regra esportiva.
  - **NFL** (motor intacto): borda branca, áreas dos times entre as jardas 32 (cores do mandante/visitante), end zones
    nas cores dos times, gol de 2 pontos, hashes NFL (70'9"), números com setas, marca do mandante no meio-campo,
    pylons, traves (vista de cima), LOS azul, linha a ganhar amarela + marcadores de down/chains na lateral.
  - **NHL**: rink oficial 200×85 ft (`nhl/src/rink/`): boards + kick plate + vidro, linhas de gol/azuis/vermelha,
    5 círculos + 9 pontos de faceoff com hash marks, creases, trapézios, redes, bancos (cores dos times) e penalty boxes;
    tinta da zona de ataque do time com o puck. Câmeras BROADCAST / TACTICAL / PUCK / FULL. Tela `game/matchView.js`
    (mount/dispose, 1 rAF), linhas reais no faceoff, painel "no gelo" com fotos.
  - **NHL dados**: `nhl/data/roster_snapshot.json` (774 atletas reais, 32 times, ids NHL, nº, posição, mão,
    TOI/G/A/SOG/hits/blocks/faceoffs 2023-24; goleiros SA/SV) gerado de fastRhockey-data; `getRoster` usa a API e
    cai no snapshot no mesmo formato (Elencos funcionam offline). Linhas por TOI real.
  - **MLB**: ballpark (`mlb/src/field/`): grama justa/foul com faixas, terra do infield, grama do diamante, bases,
    home plate, montinho + rubber, batter's/catcher's box, linhas de foul, warning track, muro 330/365/400 com marcas,
    dugouts (cores) e bullpens. Câmeras BROADCAST / BATTER / PITCHER / TACTICAL / FULL. Tela `game/matchView.js`
    (placar R/H/E, inning ▲▼, diamante de corredores, B/S/O, matchup pitcher×batter com fotos, lineup).
  - **MLB OVR posicional** (`positionalOvr`): pitcher só com atributos de arremesso; C/IF/SS/OF = bat + defesa com peso
    por posição. Substitui a média dos 40 na UI.
  - **MLB elenco offline**: a StatsAPI é bloqueada neste ambiente e não há fonte pública de elencos 2025-26 acessível;
    sem conexão usa-se um elenco **DEMO rotulado** (sem nomes/fotos inventados). Com internet: elencos reais.
  - Protótipos `nhl/src/rink.js` e `mlb/src/diamond.js` **removidos** (substituídos pelas telas novas).
- Testes: `npm test` na raiz (7 novos + 32 NFL), `tests/browser/smoke.mjs` 26/26 (NFL→NHL→MLB→NFL ×3, 1 loop por
  esporte, montagem única, sem NaN, 0 erros).
- Problemas: fotos externas não carregam neste sandbox (rede) → sprites mostram cor+número (fallback correto).
- Próxima: C — sprites com fotos em todos os esportes.

## CHECKPOINT C — Fotos + sprites
- Feito:
  - Resolvers centrais (prioridade cache → URL conhecida → fallback), todos sobre `core/render/images.js`:
    `nfl/src/ui/photos.js` (**NFLPlayerPhotoResolver**: headshot_url → ESPN → silhueta),
    `nhl/src/photos.js` (**NHLPlayerPhotoResolver**: headshot da API → mugs NHL por temporada/time do snapshot),
    `mlb/src/photos.js` (**MLBPlayerPhotoResolver**: headshotLink → serviço MLB por MLBAM id; demo = sem foto falsa).
  - Sprite comum (`core/render/sprites.js`): longe = cor + número; médio = foto + número + posição; perto = foto + nome.
    Aro externo fino na cor secundária; `separateKits` (uniforme claro quando as cores principais conflitam).
    NFL: QB com contorno de papel, portador com anel dourado, cores reais por time (defesa branca se colidir).
    NHL: goleiro com silhueta própria (retângulo arredondado), alvo de passe com anel ciano. MLB: pitcher e batter
    maiores e contornados; alvo de arremesso; fotos sem esticar (crop "cover").
  - Elencos: NHL agrupado (Atacantes/Defensores/Goleiros) e MLB agrupado (Pitchers/Catchers/Infielders/Outfielders/
    DH) com foto grande, nº, posição, idade/altura/peso quando existem, B/T (MLB) e OVR (posicional na MLB).
- Testes: raiz 7/7, NFL 32/32, smoke 26/26; caminho de fotos validado servindo imagem de teste nas URLs reais
  (Playwright route) — fotos aparecem no campo/rink sem distorção.
- Problemas: ratings NHL ainda são os da Alpha (hash) — não refletem produção real (ex.: McDavid 69). Calibrar com
  TOI/pontos do snapshot na fase F.
- Próxima: D — narração (PresentationEngine / CommentaryEngine).

### CHECKPOINT D — Narração (PresentationEngine + CommentaryEngine)
**Feito**
- `core/presentation/presentationEngine.js`: barramento por partida (`emit/emitAll/tick/dispose`), listeners com `onEvent/tick/dispose`. Sem regra de esporte.
- `core/commentary/commentaryEngine.js`: CommentaryEvent → texto (→ SpeechAdapter opcional). Variantes por evento escolhidas com RNG seedado (`core/rng/rng.js`), evitando repetir as últimas 3; memória de sequência (`h.streak/bump/reset/last`); `$priority` (1–3) e `$tone` por pack. `NullSpeech` e `createWebSpeech` (Web Speech API local, pt-BR, só prioridade ≥2; nenhum serviço externo).
- `core/commentary/commentaryPanel.js`: painel LIVE COMMENTARY recolhível (estado por esporte em localStorage), toggle "Voz", linha mais nova no topo, máx. 60 linhas; CSS em `nfl/styles.css` (compartilhado).
- NFL `nfl/src/presentation/commentary.js`: SNAP, HANDOFF, SCRAMBLE, PASS_ATTEMPT (curto/longo/pressionado/throwaway), PASS_COMPLETE (disputada, alvo favorito em sequência), INCOMPLETE (DROP/BREAKUP/DEFLECTED/OVERTHROWN), INTERCEPTION, SACK (sequência de sacks), BROKEN_TACKLE, TACKLE (jardas reais via losX), OUT_OF_BOUNDS, FUMBLE, FUMBLE_RECOVERY, TOUCHDOWN (empata/vira/fim de jogo/defensivo), SAFETY, FIRST_DOWN (conversão de 3ª/4ª), TURNOVER_ON_DOWNS, QUARTER_START, FINAL; FIELD_GOAL/PUNT/KICKOFF prontos (special teams ainda NÃO implementado no motor).
- `nfl/src/ui/gameView.js`: eventos do motor drenados ao vivo a cada frame (`emitLive`), eventos de jogo derivados das `notes` de `applyPlay` (`emitAfterPlay`); commentary/presentation criados por montagem e liberados no `cleanup()`.
- NHL `nhl/src/presentation/commentary.js` e MLB `mlb/src/presentation/commentary.js`: vocabulário completo (faceoff, passe, entrada de zona, hit, chute, defesa, rebote, penalidade, power play, gol… / arremesso, ball, strike, swing, contato, rasteira, bola alta, hit, double, HR, strikeout, walk, out…). `matchView` dos dois já drena `state.events` (índice `pres.idx`) para o painel; `deps.commentaryCtx(state)` monta o contexto; `deps.onEvent(e, state, view)` para áudio/torcida (Fase E). Os motores da Fase F emitem esses eventos.
**Testes**: `tests/commentary.test.mjs` (6: reprodutível por seed, variedade, contexto real NFL, streak, cobertura NHL/MLB sem undefined, dispose, fala só prioridade ≥2). `npm test`: 13 raiz + 32 NFL ok. Smoke 27/27 (novo: narração NFL ao vivo no Spectator).
**Problemas**: voz depende das vozes instaladas no navegador (off por padrão).
**Próxima fase**: E — AudioEngine + arquibancada + CrowdIntensity.
