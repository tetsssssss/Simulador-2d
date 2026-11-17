# Lançamento (Etapa 9): Android, instalação, desempenho e direitos

Estado em 2026-11-17. O que está **feito e testado aqui** está marcado ✅; o que **só você consegue fazer ou confirmar** está marcado 👤; riscos jurídicos estão em 4.

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
* **Ícone/identidade:** o ícone atual (`assets/icons/`) é provisório (texto "ASU" sobre verde). Troque pelo definitivo.
* **App de loja (Play Store):** não foi feito (precisa de Android Studio/Bubblewrap e conta de desenvolvedor). Caminho recomendado: empacotar o PWA como *Trusted Web Activity* (Bubblewrap) ou Capacitor. Exige política de privacidade e assinatura da app. Não testei aqui.
* **Segunda tela / gestos extras:** arrastar para mover a câmera e toque duplo ainda não existem; a partida em pé funciona mas é a tela de PC reorganizada.

## 4. Direitos e licenças (leia antes de publicar)

Não é parecer jurídico: é um mapa dos pontos de atenção para levar a um advogado de propriedade intelectual. Para uso **pessoal/fechado** o risco é baixo; para **distribuição pública ou venda** ele sobe.

| Ponto | Situação no projeto | Risco / ação |
|---|---|---|
| **Marcas das ligas e clubes** (NFL, NHL, MLB, nomes e cores de times, logotipos) | o jogo usa nomes de times e, quando disponíveis, logotipos | Marcas registradas (no Brasil, Lei 9.279/96; nos EUA, Lanham Act). Para publicar: usar nomes/logos **fictícios** ou obter licença. |
| **Nomes e imagem de atletas reais** | elencos reais (nomes, números, fotos de APIs) | Direito de imagem/nome (CF art. 5º X; Código Civil art. 20 no Brasil; *right of publicity* nos EUA). Fotos de terceiros têm direito autoral (Lei 9.610/98). Para publicar: elencos fictícios ou licenciados. |
| **Dados de APIs** (MLB StatsAPI, NHL, fontes de NFL) | consumidos pelo navegador, com cópia local (`snapshot`) | Cada API tem termos de uso próprios (muitas só permitem uso não comercial). Conferir antes de distribuir. |
| **Modelos 3D Meshy** (`assets/models/meshy/`) | enviados pelo usuário | A Meshy costuma exigir atribuição no plano gratuito e liberar uso comercial só em planos pagos. Confirmar o plano e registrar a licença. |
| **Código, sons e fontes** | sons sintetizados no navegador (sem amostras); fonte Inter do sistema/web | Sem material de terceiros embutido que eu tenha identificado; conferir a licença da fonte se for embutida. |
| **Dados pessoais** | tudo fica no aparelho (localStorage); nada é enviado | Sem coleta de dados pelo jogo. Se hospedar com analytics/anúncios, a LGPD passa a valer: política de privacidade. |

Recomendação prática para uma versão pública: modo "genérico" com times/jogadores fictícios (o importador de elencos e o editor de avatares já permitem), mantendo o modo com dados reais só para uso pessoal.
