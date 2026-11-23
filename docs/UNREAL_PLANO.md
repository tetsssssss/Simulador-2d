# Porte para o Unreal Engine (versão PC de visual de ponta)

Decisão do usuário (2026-11-23): **portar o Simulador para o Unreal**; o jogo web/Android atual **continua como está** (o Unreal é um produto à parte, em PC).
Engine-alvo: Unreal Engine 5.8 (versão mais recente encontrada em 23/06/2026; **confirmar na hora de instalar**). Licença: royalty de 5% acima de US$ 1 milhão de receita bruta e um EULA com mudança em 30/10/2026 (3,5% em "Launch Everywhere with Epic") — **conferir o EULA oficial antes de lançar**.

## Objetivo, restrições, sucesso
* Objetivo: partidas de NFL, NHL e MLB com gráficos de ponta (iluminação dinâmica, atletas 3D HD animados, estádios), em PC Windows.
* Restrições: o motor de regras já existe em JavaScript (nfl/nhl/mlb, 183 testes) e o equilíbrio dos jogos não pode se perder; arte de atletas vem do Blender/Meshy.
* Sucesso (por esporte): uma partida completa no Unreal com as mesmas regras e resultados que o simulador web, 60 fps no PC-alvo (medido).

## Arquitetura recomendada: simulação JS + visual Unreal (em fases)
| Opção | Custo | Risco | Quando |
|---|---|---|---|
| **A. Reescrever os 3 motores em C++** | meses | alto: perde equilíbrio e testes | só no fim, se quiser um produto 100% Unreal |
| **B. Motor JS como "servidor de simulação" e o Unreal só desenha** (recomendada) | semanas | baixo: regras e testes preservados | começo |
| C. Embutir o JS dentro do Unreal (plugin de runtime JS) | médio | a verificar (plugin e versão) | quando B estiver estável |

Fase B: um processo Node roda o motor existente e envia a cada tick (proposta, ainda **não implementada**):
`{ t, ents:[{id,team,slot,x,y,facing,vx,vy,clip,clipT}], ball:{x,y,z}, events:[{type,...}] }` por WebSocket local; o Unreal move os atletas, toca as animações (os nomes dos clipes já são os do jogo, ex. `mv_run`, `ag_wrap_tackle`) e reage aos eventos (câmera, replay, torcida).

## Ativos já prontos para o Unreal (verificados)
| Arquivo | Conteúdo |
|---|---|
| `exports/anim/athlete_football_hd.glb` | 12 mil triângulos, esqueleto de 11 ossos, **147 animações**, 8 materiais por zona (camisa, calça, pele, botas, capacete, meias, acento, escuro) |
| `exports/anim/athlete_hockey_hd.glb` | idem, patinador (taco incluso, pintado como zona "escuro") |
| `exports/anim/athlete_{football,hockey,baseball}.glb` | atletas low-poly (125–129 animações) |
Limites: os modelos HD **não têm textura nem UV** (só cor por zona); rosto e número da camisa precisam de arte nova. Goleiro, árbitro e beisebol HD não existem ainda.

## Etapas (cada uma só avança com a prova cumprida)
1. **Engine e versão** — feito (Unreal 5.8; conferir versão ao instalar).
2. **Projeto e Git** — projeto C++ criado, `.gitignore` e Git LFS, primeiro commit. *Prova:* clonar em outra pasta e o projeto abre sem erro.
3. **Cena e um atleta** — nível com campo, luz e câmera; o atleta HD importado e se movendo por teclado.
4. **Importar os 147 clipes** — Skeletal Mesh e Animation Sequences; Animation Blueprint com estado (parado, andar, correr).
5. **Ligar à simulação** — servidor JS + cliente no Unreal; 22 atletas se movendo conforme o motor.
6. **Estádio e iluminação** — materiais, luz (Lumen), torcida, clima. *Aqui nasce o "gráfico incrível".*
7. **Desempenho** — fps e memória medidos no PC-alvo; ajustes pela medida.
8. **Build e entrega** — pacote Windows jogável.
