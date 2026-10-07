# CLAUDE_HANDOFF — American Sports Universe 2D (v11 · NHL Shell)

> Memória técnica do **universo** (shell + NHL). A NFL tem o próprio handoff: `nfl/CLAUDE_HANDOFF.md` (v0.5, intacta).
> Sessão v11 = Prompt A (seletor NFL/NHL). Próximas: B dados/fotos NHL · C rink grande · D sprites · E motor · F hóquei · G visual.

## CURRENT STATE
- Abrir a raiz via servidor (`START_APP.bat` na raiz ou `python -m http.server 8765`) → `http://localhost:8765`.
- Barra **NFL | NHL** sempre visível no topo (`index.html` da raiz). Cada esporte é um app separado em seu próprio
  documento (iframe): **motores, globais e loops `requestAnimationFrame` nunca se misturam**; trocar de esporte
  descarta o documento anterior (sem loops duplicados). Cada esporte lembra a última tela (`asu_inner_<sport>`).
- NFL: exatamente o sistema v0.5 (nenhum arquivo da NFL alterado). Continua abrindo sozinha em `nfl/index.html`.
- NHL: novo shell com a mesma identidade visual da NFL, navegação própria:
  Home · Times · Elencos · Prospectos · Arenas · História · Rivalidades · Partida 2D.

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
```

## CHANGED (v11)
| Item | Antes | Agora |
|---|---|---|
| Entrada | 3 apps soltos | `index.html` raiz com seletor NFL/NHL |
| NHL UI | IIFE com layout próprio | shell igual ao da NFL, 8 seções, rotas por hash |
| Rink NHL | rAF nunca cancelado (1 loop extra por visita) | 1 loop (teste: 60 rAF/s após 6 visitas) |
| Prospectos NHL | lia só `prospects`/`players` (API real devolve forwards/defensemen/goalies) | lê os três grupos |
| Logos | ícone quebrado sem rede | selo com a sigla do time |

## TESTED
- NFL `npm test`: 32/32 ✔ (inalterado).
- Playwright (1440×900): NFL → NHL → NFL ×3 (volta para a mesma tela da NFL), as 8 telas NHL, ficha com 35 atributos,
  rink 6× seguidas = 1 loop, barra sempre visível, 0 erros JS. A NHL Web API é bloqueada neste ambiente: o teste
  usa respostas no formato real da API (interceptadas) para validar elenco/ficha.

## KNOWN ISSUES
- Dados NHL dependem da NHL Web API (sem snapshot local, ao contrário da NFL). CORS para navegador não verificado
  aqui → Prompt B.
- NHL usa `../nfl/styles.css`: abrir `nhl/` fora do repositório completo perde o visual.
- `nhl/js/app.js` e `nhl/styles.css` (Alpha) ficaram sem uso, mantidos como referência; remover após o Prompt B.
- Partida 2D NHL ainda é o protótipo decorativo (Prompts C–F).
