# Lançamento (Etapa 9): Android, instalação e desempenho

> **Uso pessoal, sem publicação** (decisão do usuário em 2026-11-24): este documento não trata de loja, licenciamento nem direitos de distribuição.

Estado em 2026-11-24 (seção 5 = modo 3D). O que está **feito e testado aqui** está marcado ✅; o que **só você consegue fazer ou confirmar** está marcado 👤; riscos jurídicos estão em 4.

## 1. Como instalar no Android hoje (sem loja)

O jogo é um **PWA** (manifesto + service worker): funciona offline depois da primeira abertura e pode ser instalado na tela inicial.

1. Hospede a pasta por **HTTPS** (o service worker só funciona em HTTPS ou em `localhost`). Opção mais simples: GitHub Pages do repositório (Settings → Pages → branch). 👤
2. No Chrome do celular abra o endereço → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
3. Abra uma vez com internet, jogue uma partida de cada esporte (os atlas de sprites são guardados na primeira vez em que aparecem); depois funciona sem internet.
4. Dados do jogo (carreiras, saves): menu 🔊 → **Exportar tudo** gera um único arquivo; **Importar** restaura no outro aparelho sem sobrescrever o que já existe. O app também pede ao Android que **não apague os dados sozinho** (aparece o estado no mesmo menu).

Teste no celular **sem** hospedar: `python3 -m http.server 8300` no PC + `adb reverse tcp:8300 tcp:8300` e abra `http://localhost:8300` no Chrome do celular (localhost conta como seguro). 👤

## 2. O que já está pronto ✅

| Item | Detalhe |
|---|---|
| Instalável/offline | `manifest.webmanifest`, `sw.js`, `sw-precache.js` (gerado por `node tools/build_sw_manifest.mjs`, ~3 MB de código/dados pré-carregados; atlas e modelos em cache na primeira vez) |
| Menu no celular | gaveta ☰ nos 3 esportes, barra do topo responsiva, respeita a barra de status (safe-area) |
| Toque | pinça de dois dedos troca o zoom/câmera (NFL: Close/Mid/Full; NHL e MLB: escada de câmeras); aviso para girar o celular nas partidas |
| Tamanho | atlas em **WebP** (23,7 MB → 10,1 MB; máscaras sem perda, para as cores do time continuarem exatas) |
| Memória | só um conjunto de atlas (HD *ou* low-poly) carrega por vez; opção "Sprites HD" no menu |
| Medição | "Mostrar FPS (diagnóstico)" no menu 🔊 |
| Saves | backup completo + validação por soma de verificação; migração de versão e cópias de saves corrompidos já existiam |

## 3. O que falta e depende de aparelho/decisão 👤

* **Medir FPS e toque em celular real** (menu 🔊 → Mostrar FPS) e me passar os números por esporte. O MLB está em ~45–52 fps no ambiente de teste *sem GPU*; no aparelho pode ser melhor ou pior. Se ficar pesado: desligar "Sprites HD" e/ou a torcida.
* **Ícone:** o ícone atual (`assets/icons/`: bola de futebol americano, bola de beisebol e disco no anel verde, com "ASU") foi desenhado para o projeto; para usar outro, substitua os 4 PNGs e rode `node tools/build_sw_manifest.mjs`.
* **Segunda tela / gestos extras:** arrastar para mover a câmera e toque duplo ainda não existem; a partida em pé funciona mas é a tela de PC reorganizada.

## 4. Direitos e licenças

Não se aplica: o projeto é de **uso pessoal e não será publicado**. (Se isso mudar um dia, revise nomes/marcas de ligas e atletas, dados de APIs e licenças dos modelos antes de distribuir.)

## 5. Modo 3D (PlayCanvas) — como usar, desempenho e o que não está no Android

**O que é:** um modo visual extra, "3D (PlayCanvas)", no menu *Visual* dos 3 esportes. Reaproveita os mesmos motores de simulação (mesma seed ⇒ mesmos lances, testado). O 2D, o PWA e o APK continuam como estavam.

**Como usar:** abra uma partida → menu *Visual* → **3D (PlayCanvas)**. Sem WebGL2 o jogo volta sozinho para o 2D com um aviso. A engine (2,9 MB, MIT) e os modelos (1–3 MB cada) só são baixados na primeira vez que o 3D é usado e depois ficam em cache (funciona offline depois disso).

**Opções (menu 🔊):**
| Opção | Valores | Efeito |
|---|---|---|
| **Qualidade 3D** | **Alta (padrão)** / Auto / Baixa / Média | Baixa: sem sombras, pixel ratio 1, atletas low-poly. Auto começa em Média e **desce sozinha** se o tempo médio de quadro passar de 28 ms (sobe só com folga). |
| **Full HD no 3D** | ligado (padrão) / desligado | Na qualidade Alta o 3D renderiza em **pelo menos 1920 px de largura** (supersampling, depois reduzido pelo navegador = bordas limpas; teto 3x). Desligue se o fps cair. |
| **Bloom** | ligado (padrão) / desligado | Brilho suave nas luzes (refletores, telão, gelo claro); só na qualidade Alta (pós-processamento HDR da engine). Desligue se o fps cair. |
| **FPS do 3D** | 30 / 45 / 60 (padrão) / 75 / 90 / 100 | Teto de quadros por segundo; a GPU fica ociosa nos quadros pulados (menos calor e bateria). O monitor limita o máximo real. |
| **Mostrar FPS** | liga/desliga | Mede o desempenho real (use isto para me passar os números). |
| Botão 🌗 **Luz** (NFL) | auto (padrão) → dia → tarde → noite | Iluminação, névoa e refletores; Auto segue o quarto (Q3 tarde, Q4 noite). Telão com o placar no estádio. |
| Clima | Auto / Limpo / Chuva / Neve / Neblina | Mesmo clima do 2D, sobre o 3D. |

**O que foi medido aqui (software, sem GPU — fps NÃO representativo):** triângulos por quadro: NFL 320 mil em Alta / 70 mil em Baixa; NHL 123 mil / 9 mil; MLB 7 mil. Nenhum número de fps de GPU real foi medido.

**Android/APK:** o 3D **não foi testado em celular** e **não foi incluído como alvo do APK** (decisão registrada no plano: o jogo normal no Android permanece como está). No navegador do celular (PWA) o modo existe e cai para o 2D sem WebGL2; recomendo testar com Qualidade Auto e FPS 30 antes de confiar.

**👤 Só você consegue:** (1) medir fps no PC (RX 6600) por nível de qualidade e me passar; (2) testar o 3D no celular, se quiser; (3) decidir se o 3D entra num futuro APK.

**Limites conhecidos do 3D:** banco de reservas só no NFL (NHL e MLB sem banco/dugouts/bullpen); torcida do NHL (lado oposto) pouco convincente; atletas HD sem textura/rosto, com franjas no colarinho/mangas; sem bloom; LOD só por qualidade (não por distância); bloom não feito.
