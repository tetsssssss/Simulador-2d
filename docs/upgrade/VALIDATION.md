# Validação do upgrade (2026-11-26)

Ambiente: contêiner Linux, Chromium headless com GL **por software** (SwiftShader) — prova lógica, erros e imagem; **não mede fps**.

## Comandos e resultados (rodados)
| Comando | Resultado |
|---|---|
| `node --test tests/*.test.mjs` | 232/232 (após corrigir 1 teste frágil, ver abaixo) |
| `cd nfl && node --test tests/*.test.mjs` | 44/44 |
| `node tests/browser/smoke.mjs 8300` | 33/33 |
| `node tests/browser/career.mjs 8300` | 11/11 |
| `node tests/browser/career_ui.mjs 8300` | **952/952** (antes: 945/946 — caminho fixo de outra sessão, corrigido) |
| `nhl3d` / `mlb3d` / `nfl3d` / `stadium3d` / `budget3d` / `replay3d` | 5/5 · 5/5 · 7/7 · 7/7 · 10/10 · 8/8 |
| Amostra carreira NHL (1312 jogos, modelo rápido) | OT/SO 15,7 % → **22,5 %** (real ~23 %), gols/jogo 6,22 → 6,30 |

Teste ajustado: `career2.test.mjs` exigia que um passo de 1 semana em modo automático parasse exatamente na pré-temporada; com a nova calibração de OT os playoffs duram outro número de dias e o passo atravessa os 7 dias de pré-temporada. O teste agora aceita PRESEASON ou os primeiros dias de REGULAR (comportamento correto do calendário).

## O que mudou e como verificar
- **Carreira — pós-jogo** (`core/career/recap.js`, painel "Último jogo"): placar(es) reais, campanha antes→depois, posição na conferência, variação de diretoria/moral/torcida/reputação/caixa, novas lesões. Persistido em `c.x.recap` (sobrevive a recarregar a página — verificado). Saves antigos: sem recap, nada a migrar. Teste: `tests/career_recap.test.mjs`.
- **Carreira — calibração NHL**: `tieBoost` (configurável em `nhlSpec.scoring`). Mudança **intencional de simulação**. Teste: `tests/career_scoring.test.mjs`.
- **3D — torcida**: as cabeças tinham faces com winding errado (só as laterais apareciam como "riscos"); `cull = none` + cor autoiluminada. Vale para NHL, MLB e NFL. Arquibancada próxima da NFL escondida quando a câmera está nela/acima (removia os blocos borrados no canto). NHL ganhou bancos com reservas (low-poly) nas portas reais do motor (x 75/125 ft).
- **Interface**: alvos de toque ≥ 44 px no Career Hub (telas touch/≤ 640 px; medido: 7 → 0 controles < 40 px no celular 390 px); token `--dim` passou de contraste 3,5:1 para ~4,8:1.

## Evidências (`docs/upgrade/evidence/`)
01–02 painel da carreira antes (desktop/celular) · 03–04 painel com pós-jogo depois · 05 NFL 3D transmissão · 06 NHL torcida · 07 NHL bancos · 08 MLB.
Sem "antes" das torcidas 3D (as capturas antigas foram sobrescritas durante o trabalho).

## Não testado / limitações
fps em GPU real e no celular; save antigo real do usuário (só fixtures sintéticas dos testes); motor de partida do NHL continua com OT baixo (~7 % em 60 jogos — backlog); acessibilidade por leitor de tela não auditada.

## Reversão
Cada etapa é um commit separado na branch `ccr-1d32cd32-jtupys` (`git revert <hash>`). `tieBoost` pode ser removido do `nhlSpec` sem afetar saves.

## Fechamento (2026-11-27)
- **MLB 3D:** dugouts (1B/3B) e bullpens (nas linhas) como estruturas (`diamondScene.js`); sem reservas dentro (backlog). Captura `09_depois_mlb3d_dugout.png`.
- **Atletas HD:** ponta da manga fechada (`athlete_hd.py`); o "pelo" branco no punho diminuiu mas não sumiu por completo.
- **Motor de partida NHL (medido, 240 jogos, 4 duplas):** além do 3º período **14,6 %** (shootout 6,7 %), gols/jogo 6,37. A medida anterior de 7 % (60 jogos, 1 dupla) era amostra pequena. Real ≈ 23 % / ≈ 6,1: o motor fica abaixo em prorrogação. **Não alterei o motor** (mudaria o resultado das partidas 2D); backlog.
- Revalidação: unitários 232/232; mlb3d 5/5, budget3d 10/10, athletes3d 5/5, nfl3d 7/7, nhl3d 5/5, fullhd3d 10/10.

## Bloom, reservas do MLB e goleiro retirado do NHL (2026-11-27)
- **Bloom** (`stage.js`, `pc.CameraFrame`): só em qualidade Alta + opção "Bloom" (🔊, `asu_3d_bloom`, padrão ligado). Renderiza em HDR, aplica bloom e o tone mapping passa para o compose. Verificado por captura (noite NFL: brilho e exposição diferentes) e `bloom3d.mjs` 6/6 (ativo só em Alta+ligado; sem erros). **Custo em fps não medido.**
- **Reservas do MLB**: 16 atletas low-poly nos dugouts (5/time) e bullpens (3/time), mesma regra e mesmos pontos do 2D (jogadores fora do campo/base; comemoram runs). Dugouts/bullpens movidos para as coordenadas do 2D. `mlb3d.mjs` 6/6 (>= 6 reservas em campo).
- **Goleiro retirado no motor NHL** (`hockeyEngine.js`): atrás por 1 com ≤ 150 s (ou por 2 com ≤ 90 s) no 3º período, sem pena própria, na bola ao chão (faceoff) o goleiro sai, entra um 6º atacante (chute ×3), rede vazia = gol em chute no alvo; gols em rede vazia (`strength:'EN'`) não contam como GA do goleiro; volta quando empata/vira. Eventos `GOALIE_PULLED` / `GOALIE_RETURNS`, comentários PT/EN. **Medido (4×60 jogos, 240 no total):** além do 3º período **~17,5–18 %** (antes 14,6 %; real ≈ 23 %), retiradas 0,3–0,4/jogo, rede vazia 0,15/jogo, gols/jogo 6,5 (real ~6,1), 0 NaN. Os parâmetros (95→150 s, ×2,2→×3) mudaram pouco a taxa: o resto da diferença vem de como o motor empata em 60 min — continua abaixo do real; backlog.
- Testes: unitários 233/233, smoke 33/33, nhl3d 5/5, budget3d 10/10, fullhd3d 10/10. Testes do motor ajustados: GA exclui rede vazia; LINE_CHANGE aceita 6.
