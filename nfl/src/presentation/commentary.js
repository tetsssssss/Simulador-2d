// NFL commentary pack (PT-BR). Engine events arrive live during the play; game events (FIRST_DOWN, TURNOVER_ON_DOWNS,
// QUARTER_START, FINAL) are derived by the game view from the game state after each play. Every template reads the
// real context (player names from the play's `who` map, score, quarter/clock, down & distance, field position).
// FIELD_GOAL / PUNT / KICKOFF templates are ready but special teams are NOT IMPLEMENTED in the engine yet.
const yd = n => `${Math.abs(n)} jarda${Math.abs(n) === 1 ? '' : 's'}`;
const ord = n => `${n}ª`;
const N = (ctx, id) => ctx.name?.(id) || 'o jogador';
const L = (ctx, id) => ctx.last?.(id) || N(ctx, id);
const margin = ctx => (ctx.score ? ctx.score.off - ctx.score.def : 0);
const late = ctx => ctx.quarter >= 4 && ctx.clock <= 300;

export const NFL_COMMENTARY = {
  SNAP: [
    (e, c) => c.down === 3 ? `${ord(3)} descida e ${c.distance}. Momento decisivo para ${c.off}.` : null,
    (e, c) => c.down === 4 ? `Quarta descida! ${c.off} vai arriscar.` : null,
    (e, c) => c.redZone ? `${c.off} na red zone, ${c.distance} para a primeira descida.` : null,
    (e, c) => late(c) && margin(c) < 0 ? `Relógio correndo contra ${c.off}, que perde por ${-margin(c)}.` : null,
    (e, c) => `${ord(c.down)} e ${c.distance}, bola na ${c.spot}. Snap!`,
    (e, c) => `${L(c, c.qbId)} recebe o snap.`,
    (e, c) => `${c.off} em formação, ${ord(c.down)} descida.`,
  ],
  HANDOFF: [
    (e, c) => `Entrega para ${L(c, e.to)}.`,
    (e, c) => `${L(c, e.to)} recebe a bola e procura o buraco.`,
    (e, c) => `Corrida com ${L(c, e.to)}.`,
  ],
  SCRAMBLE: [
    (e, c) => `${L(c, e.id)} sai do pocket!`,
    (e, c) => `Pressão forte, ${L(c, e.id)} escapa e improvisa.`,
    (e, c) => `${L(c, e.id)} foge da pressão e procura alguém livre.`,
  ],
  PASS_ATTEMPT: [
    (e, c) => e.throwAway ? `${L(c, e.passer)} joga a bola fora para evitar o sack.` : null,
    (e, c) => !e.throwAway && e.airYards >= 25 ? `${L(c, e.passer)} lança longo procurando ${L(c, e.target)}!` : null,
    (e, c) => !e.throwAway && e.airYards >= 25 ? `Bomba de ${L(c, e.passer)} para ${L(c, e.target)}…` : null,
    (e, c) => !e.throwAway && e.hurried ? `${L(c, e.passer)} lança pressionado para ${L(c, e.target)}.` : null,
    (e, c) => !e.throwAway && e.airYards < 25 ? `${L(c, e.passer)} procura ${L(c, e.target)}.` : null,
    (e, c) => !e.throwAway && e.airYards < 8 ? `Passe curto para ${L(c, e.target)}.` : null,
    (e, c) => !e.throwAway ? `${L(c, e.passer)} solta para ${L(c, e.target)}.` : null,
  ],
  PASS_COMPLETE: [
    (e, c, h) => h.streak(`rec:${e.receiver}`) >= 2 ? `De novo ${L(c, e.receiver)}! Virou o alvo favorito.` : null,
    (e, c) => e.contested ? `Recepção disputada e ${L(c, e.receiver)} segura!` : null,
    (e, c) => `Completo para ${L(c, e.receiver)}!`,
    (e, c) => `${L(c, e.receiver)} recebe.`,
    (e, c) => `Pega ${L(c, e.receiver)}.`,
  ],
  INCOMPLETE: [
    (e, c) => e.reason === 'DROP' ? `Escapou das mãos de ${L(c, e.by)}!` : null,
    (e, c) => e.reason === 'DROP' ? `${L(c, e.by)} deixa cair. Bola que tinha que ser pega.` : null,
    (e, c) => e.reason === 'BREAKUP' ? `${L(c, e.by)} chega a tempo e desvia o passe!` : null,
    (e, c) => e.reason === 'BREAKUP' ? `Grande defesa de ${L(c, e.by)}, passe desviado.` : null,
    (e, c) => e.reason === 'DEFLECTED' ? `Bola tocada${e.by ? ` por ${L(c, e.by)}` : ''}! Incompleto.` : null,
    (e, c) => e.reason === 'OVERTHROWN' ? 'Passou do alvo. Incompleto.' : null,
    (e, c) => e.reason === 'THROWAWAY' ? null : (e.reason === 'OUT_OF_BOUNDS' ? 'Recebido fora de campo. Incompleto.' : null),
    (e, c, h) => h.streak('inc') >= 2 ? `Mais um incompleto. ${c.off} não consegue conectar.` : null,
    (e, c) => !['DROP', 'BREAKUP', 'DEFLECTED', 'THROWAWAY'].includes(e.reason) ? 'Incompleto.' : null,
  ],
  INTERCEPTION: [
    (e, c) => `INTERCEPTADO! ${N(c, e.by)} rouba a bola!`,
    (e, c) => `Que leitura de ${L(c, e.by)}! Interceptação!`,
    (e, c) => late(c) ? `INTERCEPTAÇÃO no momento mais crítico! ${L(c, e.by)}!` : null,
  ],
  SACK: [
    (e, c) => e.by ? `SACK! ${N(c, e.by)} derruba ${L(c, e.qb)}!` : `${L(c, e.qb)} é derrubado atrás da linha. Sack!`,
    (e, c, h) => h.streak('sack') >= 2 ? `Outro sack! A linha de ${c.def} domina a partida.` : null,
    (e, c) => e.by ? `${L(c, e.by)} passa pelo bloqueio e chega em ${L(c, e.qb)}. Sack!` : null,
  ],
  BROKEN_TACKLE: [
    (e, c) => e.sackEscape ? `${L(c, e.carrier)} escapa do sack!` : null,
    (e, c) => !e.sackEscape ? `${L(c, e.carrier)} quebra o tackle de ${L(c, e.by)}!` : null,
    (e, c) => !e.sackEscape ? `Escapou! ${L(c, e.carrier)} segue em pé.` : null,
  ],
  TACKLE: [
    (e, c) => { const g = Math.round(e.x - c.losX); return g >= 15 ? `${L(c, e.by)} finalmente derruba ${L(c, e.carrier)} após ganho de ${yd(g)}.` : null; },
    (e, c) => { const g = Math.round(e.x - c.losX); return g <= 0 ? `${L(c, e.by)} pega ${L(c, e.carrier)} ${g < 0 ? `para perda de ${yd(g)}` : 'sem ganho'}!` : null; },
    (e, c) => { const g = Math.round(e.x - c.losX); return g > 0 && g < 15 ? `Tackle de ${L(c, e.by)}. Ganho de ${yd(g)}.` : null; },
    (e, c) => { const g = Math.round(e.x - c.losX); return g > 0 && g < 15 ? `${L(c, e.carrier)} avança ${yd(g)} até ser parado por ${L(c, e.by)}.` : null; },
  ],
  OUT_OF_BOUNDS: [
    (e, c) => `${L(c, e.carrier)} sai pela lateral.`,
    (e, c) => `Para fora, relógio parado.`,
  ],
  FUMBLE: [
    (e, c) => `FUMBLE! A bola está solta!`,
    (e, c) => e.forcedBy ? `${L(c, e.forcedBy)} arranca a bola de ${L(c, e.carrier)}! Fumble!` : null,
  ],
  FUMBLE_RECOVERY: [
    (e, c) => e.lost ? `${N(c, e.by)} recupera para ${c.def}! Turnover!` : `${L(c, e.by)} recupera para ${c.off}. Susto!`,
  ],
  TOUCHDOWN: [
    (e, c) => e.side === 'def' ? `TOUCHDOWN DEFENSIVO! ${N(c, e.by)} leva até a end zone!` : null,
    (e, c) => e.side !== 'def' && margin(c) < 0 && margin(c) >= -7 ? `TOUCHDOWN! ${N(c, e.by)}! ${c.off} encosta no placar!` : null,
    (e, c) => e.side !== 'def' && margin(c) === 0 ? `TOUCHDOWN! ${N(c, e.by)} coloca ${c.off} na frente!` : null,
    (e, c) => e.side !== 'def' && late(c) ? `TOUCHDOWN no fim do jogo! ${N(c, e.by)}!` : null,
    (e, c) => e.side !== 'def' ? `TOUCHDOWN ${c.off}! ${N(c, e.by)} na end zone!` : null,
    (e, c) => e.side !== 'def' ? `${L(c, e.by)} cruza a linha de gol! Touchdown!` : null,
  ],
  SAFETY: [(e, c) => `SAFETY! ${c.def} marca 2 pontos!`],
  FIRST_DOWN: [
    (e, c) => c.prevDown === 3 ? `Conversão de terceira descida! ${c.off} mantém a posse.` : null,
    (e, c) => c.prevDown === 4 ? `Converteu na quarta descida! Aposta certa de ${c.off}.` : null,
    (e, c) => 'Primeira descida!',
    (e, c) => `Corrente mexe. Primeira descida para ${c.off}.`,
  ],
  TURNOVER_ON_DOWNS: [(e, c) => `Parados na quarta descida! A bola é de ${c.def}.`, (e, c) => `A defesa de ${c.def} segura. Turnover on downs!`],
  QUARTER_START: [(e, c) => `Começa o ${e.quarter}º quarto. ${c.home} ${c.homeScore} x ${c.awayScore} ${c.away}.`],
  FINAL: [
    (e, c) => c.homeScore === c.awayScore ? `Fim de jogo: empate em ${c.homeScore}.` : `FIM DE JOGO! ${c.homeScore > c.awayScore ? c.home : c.away} vence por ${Math.max(c.homeScore, c.awayScore)} a ${Math.min(c.homeScore, c.awayScore)}.`,
  ],
  FIELD_GOAL: [(e, c) => `Field goal ${e.good ? 'convertido' : 'errado'}.`],
  PUNT: [(e, c) => `${c.off} vai para o punt.`],
  KICKOFF: [(e, c) => 'Kickoff.'],
  // streaks / sequence memory
  $after(e, c, h) {
    if (e.type === 'PASS_COMPLETE') { h.bump(`rec:${e.receiver}`); h.reset('inc'); }
    if (e.type === 'INCOMPLETE') h.bump('inc');
    if (e.type === 'SACK') h.bump('sack'); else if (e.type === 'SNAP') { /* keep */ } else if (['PASS_COMPLETE', 'HANDOFF'].includes(e.type)) h.reset('sack');
  },
  $priority(e) { return ['TOUCHDOWN', 'INTERCEPTION', 'FUMBLE_RECOVERY', 'FINAL', 'SAFETY'].includes(e.type) ? 3 : ['SACK', 'FIRST_DOWN', 'TURNOVER_ON_DOWNS', 'SCRAMBLE'].includes(e.type) || (e.type === 'PASS_ATTEMPT' && e.airYards >= 25) ? 2 : 1; },
  $tone(e) { return ['TOUCHDOWN', 'SAFETY'].includes(e.type) ? 'score' : ['INTERCEPTION', 'FUMBLE_RECOVERY', 'TURNOVER_ON_DOWNS'].includes(e.type) ? 'turnover' : e.type === 'SACK' ? 'bad' : e.type === 'FIRST_DOWN' ? 'good' : 'normal'; },
};
