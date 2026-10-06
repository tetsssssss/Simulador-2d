# Calibração v0.4 — jogo corrido + causas sistêmicas do passe

Sessão Prompt A (2026-10-06). Todos os números vêm dos harnesses do repositório (seeds fixas, reproduzíveis).

## Como medir
- `node tests/league.mjs 80 mix` — **referência principal**: os 32 times no ataque (adversário rotativo). 2.560 jogadas.
- `node tests/harness.mjs 2000 mix` — confronto fixo SEA × NE (o harness histórico).
- `node tests/league.mjs 60 run` — só corridas (1.920).

> Lição desta sessão: calibrar só com SEA × NE enviesa o resultado. O ataque terrestre do SEA está entre os mais
> fracos do snapshot (3,7 ypc vs NE) e outros ataques chegavam a 9 ypc. A calibração final usa a liga inteira.

## Antes (v0.3) × depois (v0.4) — liga inteira, `league.mjs 80 mix`

| Métrica | v0.3 | v0.4 | Referência NFL (aprox.) |
|---|---|---|---|
| Completion % | 71,0 | **65,2** | 64–66 |
| Yards / attempt | 9,98 | **7,06** | 6,9–7,2 |
| Sack rate (dropbacks) | 1,8 | **5,4** | 6–7 |
| Interception rate | 1,1 | **3,2** (SEA×NE 2,7) | 2,2–2,5 |
| Scramble iniciado (% dropbacks) | 4,1 | **6,3** | 4–6 |
| Time to throw (s) | 2,09 | **2,31** | 2,6–2,8 |
| YAC por recepção | 7,78 | **3,95** | 5,0–5,5 |
| Passes de 20+ (% tentativas) | 17,1 | **12,5** | 8–10 |
| Tackles quebrados / recepção | 0,46 | **0,24** | ~0,12 |
| Yards per carry | 6,91 | **4,70** | 4,2–4,5 |
| Mediana da corrida | 0 | **3** | 3 |
| Corridas ≤ 0 jd (stuff) | 50,6 % | **14,8 %** | 17–20 % |
| Tackles for loss (< 0 jd) | 39,4 % | **4,4 %** | 8–10 % |
| Corridas 4+ jd | 33,9 % | **41,3 %** | 43–46 % |
| Explosivas 10+ jd | 16,4 % | **7,3 %** | 10–12 % |
| Explosivas 20+ jd | 12,2 % | **2,3 %** | 2–3 % |
| Tackles quebrados / carregada | 0,63 | **0,25** | 0,15–0,20 |
| Yards before contact / carregada | — | **1,97** | 1,5–2,0 |
| Yards after contact / carregada | — | **2,34** | 2,5–2,9 |
| TDs em 2.560 jogadas | 222 | **54** | — |

Só corridas (`league.mjs 60 run`, 1.920): v0.3 7,37 ypc / mediana 0 / 40,4 % TFL / 12,9 % de 20+ →
v0.4 **4,88 ypc / mediana 3 / 4,1 % TFL / 2,7 % de 20+**, 0,27 tackles quebrados por carregada.

SEA × NE (`harness.mjs 2000 mix`): v0.3 cmp 70,8 · YPA 9,33 · sack 2,1 · ypc 3,88 (mediana 0, 54,6 % stuff) →
v0.4 cmp 65,2 · YPA 7,40 · sack 9,3 · INT 2,7 · ypc 3,82 (mediana 3, 18,2 % stuff, 6,8 % TFL).

Por conceito (liga, 40 corridas/time): Outside Zone 6,4 · Trap 5,8 · Duo 5,0 · Inside Zone 4,9 · Power 3,7 · Counter 3,2.
Por cobertura: Cover 1 4,4 · Cover 3 4,8 · Cover 2 5,2 · Cover 1 Blitz 5,2.

Decisões do RB (1.920 corridas): FOLLOW_BLOCK 3.207 · CUTBACK 1.004 · CUT_INSIDE 887 · HESITATE 362 · BOUNCE 358 ·
ACCELERATE 42 (eventos de decisão; há várias por corrida). Movimentos: CUT 2.749 · JUKE 715 · SPIN 257 ·
STIFF_ARM 182 · TRUCK 111.

## Causas sistêmicas encontradas e corrigidas (nenhum resultado calibrado individualmente)

### Corrida
1. **Defesa ignorava a leitura de corrida após o handoff** — `defenseIntent` mandava todos os 11 para
   `pursuitVelocity` assim que existia portador; o "fit" de LB e o "squeeze" do DL nunca rodavam. Agora a frente
   controla gap/profundidade, LBs fazem fit com percepção atrasada (misdirection funciona) e só perseguem quando a bola
   declara. O DE do lado fraco respeita bootleg/cutback por um tempo que depende de **Discipline**.
2. **RB colidia com o próprio QB e com os próprios bloqueadores** — separação de corpos zerava a velocidade do RB.
   O portador agora desliza pelos companheiros; bloqueadores de corrida passam pelo quadril de um defensor já engajado
   por um colega (climb sai do double).
3. **"Lunge" em todo primeiro contato** — o defensor tentava o tackle assim que entrava no anel de alcance máximo,
   ainda fechando a distância; quase todo tackle quebrado era um lunge. Agora ele só mergulha quando não consegue mais
   fechar (portador escapando/deslizando).
4. **Shed automático perto do portador** — o termo "ball carrier near" empurrava a leverage do defensor mesmo com o
   bloqueador perfeitamente posicionado. Agora escala com o *fit* (posição corporal).
5. **Yards after contact** — queda para frente subestimada (momentum × massa).
6. **DBs liam corrida tão rápido quanto LBs** — safeties são pass-first (+0,45 s de leitura).
7. RB alinhado mais fundo em corridas (6,6 jd; 7,2 em gap schemes) para receber a bola em velocidade.

### Passe
1. **Rusher que vencia o bloqueio ficava preso atrás do corpo do OL batido** — 60 % das jogadas tinham "shed" antes
   do lançamento e só 5 % viravam sack. O rusher agora passa pelo ombro do bloqueador vencido (sack|shed → ~22 %).
2. **Precisão linear com a distância** — bolas profundas caíam no alvo como passes curtos. Erro agora cresce de forma
   quadrática com a distância (20+ jd: 67 % → ~50 % de completion).
3. **Off-man descia em direção ao recebedor ainda na linha** e era batido em qualquer rota vertical. Agora mantém
   cushion contra stem vertical (rotas cruzando continuam sendo atacadas).
4. **Zona subia até rotas rasas antes do lançamento** (ganchos a 2 jd da LOS). Agora segura a profundidade do
   landmark, carrega rotas verticais e ataca cruzamentos dentro da zona.
5. **Deep zone sem antecipação** — cushion cresce com a velocidade vertical da ameaça.
6. **Rotas verticais sem timing** — GO/SEAM/FADE/WHEEL ficavam "disponíveis" ao QB após 1,5 jd de release (bombas a
   1,8 s). Agora o timing é o fim do stem (15–18 jd) e passes profundos usam drop de 7 passos.
7. Constantes globais ajustadas depois das correções estruturais: tempo de processamento de leitura do QB
   (0,50 → 0,55 s base), ruído de leverage de bloqueio (corrida 0,42 / passe 0,47), base de tackle (0,80 → 0,90),
   peso do fit na leverage (0,10), base de INT em bola contestada (0,38 → 0,30).

## Pendências de calibração (registradas, não corrigidas)
- TFL baixo (4–7 %): DL raramente vence o bloqueio cedo em corrida; penetração por stunts/slants não existe.
- Explosivas 10+ abaixo da NFL; YAC por recepção baixo (3,9) e tackles quebrados por recepção alto (0,24).
- Sack rate por confronto varia muito (NE gera 9,3 %); média da liga 5,4 %.
- INT na liga ~3,2 % (puxado por passes profundos contestados); drops ~8 % das tentativas (alto).
- QB scramble quase nunca vira corrida (`qbRunPct` ≈ 0): o QB que sai do pocket quase sempre lança.
- Counter/Power ainda abaixo de zone (timing de puller vs fill do LB).
