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
