# Plano de ação — 3 jogos lindos, animação robusta, visual PS1/PS2 e jogo "vivo"

Base real (medida nesta sessão): sprites procedurais + sprite sheets de Blender (540 tris/atleta, 96 px, 15 fps, 5 direções + espelho), 147 clipes,
motor 2D em canvas; custo de quadro p95 2,5–4 ms a 1× e 10–18 ms com CPU 4× mais lenta (headless, não é celular real). Atlas ≈ 11 MB.

## 0. Decisão que manda em tudo (preciso de você)
| | A) Sprites pré-renderizados "estilo PS1/PS2" (evolução do que existe) | B) 3D em tempo real (Three.js + os .glb) |
|---|---|---|
| Look PS1/PS2 | Sim: render em baixa resolução, sombreamento Gouraud, textura 128–256 px, dither/jitter no shader do Blender | Sim e mais fiel (câmera livre, vertex snapping, affine warp reais) |
| Custo | Médio; reaproveita motor, testes e saves | Alto: novo renderer, câmeras, colisão visual, LOD; os 3 renderers 2D viram legado |
| Risco | Visão fixa (5 direções), 15 fps, atlas grandes | Desempenho em celular e peso de assets, **só se mede depois de construir** |
| Prova | Capturas + custo de quadro | Protótipo de 22 atletas a 60 fps medido |
**Recomendação (confiança média):** A agora, e um protótipo B isolado de 1 semana para decidir com número, não com impressão. Não migrar os 3 jogos para 3D sem esse teste.

## Fases (cada uma termina com algo que dá para abrir e medir)
**Fase 1 — Direção de arte e orçamento (S).** Folha de estilo PS1 e PS2 (1 atleta, 1 estádio, 1 HUD), orçamento por plataforma
(PC / celular: tris por atleta, textura 128/256, páginas ≤ 4096 px, MB de atlas), paleta por esporte. *Prova:* você escolhe PS1 ou PS2 olhando 2 renders.
**Fase 2 — Atleta "de verdade" no Blender (M).** UV + textura pintada (camisa com número, rosto simples, luvas, botas), capacete/cor de time por máscara,
3 LODs, 3 biótipos por posição, uniformes por time (dados já existem). Faces expressivas por 3 mapas (neutro, esforço, comemoração). *Prova:* render lado a lado + contagem de tris por LOD.
**Fase 3 — Animação robusta (L).** (a) Máquina de estados única (locomoção ↔ ação ↔ queda) com **transições com blend** em vez de trocar o clipe seco;
(b) clipes de duas pessoas **sincronizados** (tackle, bloqueio, checks) com ponto de contato alinhado; (c) 30 fps em vez de 15, 8 direções reais nos eventos;
(d) mocap/IK de pés para não deslizar; (e) reações (emoção, cansaço, lesão leve) ligadas ao estado do motor. *Prova:* teste automático de continuidade + vídeo curto de 10 jogadas.
**Fase 4 — Mundo vivo (L, por camadas, cada uma é entregável).**
1. Torcida com ondas, reação a gol/touchdown/home run (hoje é estática), bandeiras, mascote.
2. Banco/sideline: treinadores, médicos, reservas reagindo; huddle e pré-snap (NFL), troca de linha entrando pela porta (NHL), bullpen/dugout (MLB).
3. Árbitros em campo com sinais ligados às jogadas (depende do motor emitir `PENALTY`/`OFFICIAL`).
4. Diretor de câmera e replay (câmera lenta do melhor lance), placar/HUD de transmissão, gráficos de jogador.
5. Clima, horário do dia, estádios distintos (cobertura, neve, chuva), áudio ambiente já existente conectado ao clima.
6. Narrativa viva: rivalidades, notícias, reações de entrevistas pós-jogo, ligadas ao modo carreira existente.
**Fase 5 — Polimento e desempenho (M).** Cache offscreen das camadas estáticas, atlas comprimidos (WebP/KTX2), carregamento por esporte, medir em celular real. *Prova:* 60 fps medido no aparelho-alvo.

## Riscos (o que seria erro caro)
1. **Misturar estilos:** boneco procedural, sprite 3D e fotos coexistem hoje; escolher um padrão e aposentar os outros.
2. **Escopo "vivo" infinito:** sem camadas e provas por camada, nunca termina; fazer 1 camada por vez.
3. **Peso:** atlas de 5 direções ×  kits × cores; sem LOD/compressão o celular sofre (já vimos queda a 4× CPU).
4. **Direitos:** logos, nomes e rostos reais de times/atletas para uso público exigem licença; arte própria e nomes fictícios para publicar.
5. **Regressão do motor:** tudo acima é visual; mudar o motor (faltas, lesões) mexe no equilíbrio e em `golden.json` — tratar como etapa separada.

## O que está firme x hipótese
Firme: pipeline Blender→atlas→jogo funciona e está testado (136 testes, smoke 33/33). Hipótese: PS1/PS2 "lindo" com 96 px e 15 fps (precisa da folha de estilo da Fase 1);
desempenho em celular (nunca medido); que 3D tempo real caiba no orçamento (só o protótipo responde).

## Próximo passo
Fase 1 (folha de estilo + orçamento) e o protótipo B em paralelo, se você topar.
