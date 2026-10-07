# American Sports Universe 2D

Três simuladores esportivos 2D (HTML/CSS/JS, sem build) que formarão um ecossistema único.

| Pasta | Projeto | Estado |
|---|---|---|
| `nfl/` | NFL Universe 2D **v0.5** | simulação 2D por jogada, modos, carreira, saves — ver `nfl/CLAUDE_HANDOFF.md` |
| `nhl/` | NHL Universe 2D (shell v11) | times, elencos, prospectos, arenas, história, rivalidades; rink 2D placeholder |
| `mlb/` | MLB Universe 2D Alpha 0.1 | gestão + dados; diamond 2D placeholder (inalterado) |

Auditoria, baseline e comparação dos três: `docs/AUDIT_SESSION_01.md`.

Rodar: `START_APP.bat` na raiz (ou `python3 -m http.server 8765`) → http://localhost:8765 — seletor **NFL | NHL** no topo.
Testes NFL: `cd nfl && npm test`. Handoff do universo: `CLAUDE_HANDOFF.md`.
