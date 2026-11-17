# Plano de ação em 9 etapas — NFL, NHL e MLB lindos, animação robusta, visual PS1/PS2 e jogo vivo

Ponto de partida real (medido): motor 2D em canvas; 147 clipes; sprites 3D de Blender (540 tris, 96 px, 15 fps, 5 direções + espelho, ~11 MB);
136 testes + smoke 33/33; custo de quadro p95 2,5–4 ms a 1× e 10–18 ms com CPU 4× mais lenta (headless; celular real nunca medido).
Regra: **etapa só avança quando a prova está cumprida e registrada** (testado / simulado / hipótese separados).

| # | Etapa | Objetivo | Entrega e critério para avançar |
|---|---|---|---|
| 1 | **(feita)** Diagnóstico e orçamento | Inventário do que roda hoje nos 3 jogos e metas numéricas por plataforma | Tabela "clipe → evento do motor → aparece em jogo?" (hoje 40 de 147 ligados) + orçamento (tris, textura, MB, ms/quadro) por PC e celular. Prova: uma partida completa de cada esporte sem travar |
| 2 | Direção de arte PS1/PS2 | Escolher o look antes de produzir | Folha de estilo (1 atleta, 1 estádio, 1 HUD) em PS1 (baixa resolução, Gouraud, dither) e PS2 (mais detalhe, texturas 256). Prova: você escolhe com 2 renders lado a lado |
| 3 | Atleta e bola no Blender | Modelo reutilizável com UV, textura, rosto, uniforme por máscara, 3 LODs e biótipos por posição | `.blend` editável, `.glb` por kit, render de teste, contagem de tris por LOD. Prova: poses de teste sem deformação ruim |
| 4 | Animações essenciais | Parado, andar, correr, patinar, passe, chute/tacada, queda, recuperação com **transições blendadas** (hoje o clipe troca seco) | Máquina de estados única + teste de continuidade + vídeo curto. Prova: 10 jogadas por esporte sem "pulos" de pose |
| 5 | Mecânicas e contato | Colisão, posse, contato de 2 corpos **sincronizado** (tackle, bloqueio, check), faltas e reações | Cada regra alterada com cenário de verificação; clipes de duas pessoas com ponto de contato alinhado. Mexer em regra mexe no equilíbrio/`golden.json`: etapa separada e testada |
| 6 | Animações avançadas | Cobrir o catálogo (289 NFL + NHL/MLB) por grupos, só o que tem evento real | Registro por grupo: validado em jogo / só pose / pendente. Prova: nada marcado "feito" sem aparecer em partida |
| 7 | Mundo vivo (por camadas) | Torcida reativa, banco/sideline, árbitros com sinais, huddle e pré-snap, troca de linha, bullpen, clima, câmera diretora e replay | Uma camada por vez, cada uma com captura e custo de quadro. Prova: o jogo "respira" mesmo sem ação do usuário e continua ≥ 60 fps medido |
| 8 | Carreira e outros modos | Resultados, estatística, fadiga e lesões alimentando visual (cansaço, curativo, comemoração) e saves | Temporada jogável e carregamento de saves conferido (migração + backup). Prova: carreira de 1 temporada sem erro |
| 9 | Android e lançamento | Desempenho, interface de toque, empacotamento, licenças | Medição em celular real, atlas comprimidos, checklist de direitos (logos/nomes reais), ZIP de entrega |

## Decisão-gate (entre 2 e 4): 2D com sprites ou 3D em tempo real?
Recomendação (confiança média): seguir com sprites 3D e fazer **um protótipo isolado** de 22 atletas em Three.js com os `.glb` já gerados; migrar só se medir 60 fps no celular-alvo.
Sem esse número, migrar os 3 jogos para 3D é a decisão mais cara e mais fácil de errar.

## Onde discordo do plano de referência (o da imagem)
* **Android só na etapa 9** é tarde: orçamento de desempenho entra na etapa 1 e é medido em cada etapa.
* **Volume ("250 movimentos") não é qualidade:** "vinculado ao runtime" é afirmação de código, não prova de que aparece certo em jogo; exijo captura/teste por grupo.
* **Falta direção de arte e a decisão 2D × 3D**, que mudam todo o resto; vão antes de produzir assets.
* **Falta o jogo vivo** (torcida, banco, árbitros, clima, replay) como camadas mensuráveis; sem isso a partida fica "limpa" e parada.
* **Direitos:** NBA/NFL/NHL/MLB têm marcas; para publicar, arte própria e nomes fictícios, ou licença.

## O que ainda não sei
O **NBA Universe Manager e o ZIP v11 da imagem não estão no repositório**: só tenho NFL/NHL/MLB. Se o basquete deve ser o 4º jogo, preciso do zip.

## Status
* **Etapa 1 concluída:** `docs/INVENTARIO_ETAPA1.md` (69 de 147 clipes ligados, 22 só em demo, 56 sem gatilho) e `docs/ORCAMENTO.md` (metas PC/celular, lacunas). Partida de 30 s por esporte e modo sem erro e sem travar, exceto MLB a 52 fps e hitch de 116 ms no 1º uso do atlas.
