# American Sports Universe 2D

Três simuladores esportivos 2D (HTML/CSS/JS, sem build) que formarão um ecossistema único.

| Pasta | Projeto | Estado |
|---|---|---|
| `nfl/` | NFL Universe 2D **v0.3** | simulação 2D por jogada (passe/corrida), stats por evento, testes — ver `nfl/CLAUDE_HANDOFF.md` |
| `nhl/` | NHL Universe 2D Alpha 0.1 | gestão + dados; rink 2D placeholder (inalterado) |
| `mlb/` | MLB Universe 2D Alpha 0.1 | gestão + dados; diamond 2D placeholder (inalterado) |

Auditoria, baseline e comparação dos três: `docs/AUDIT_SESSION_01.md`.

Rodar: `cd nfl && python3 -m http.server 8765` → http://localhost:8765 (Partida 2D). Testes: `cd nfl && npm test`.
