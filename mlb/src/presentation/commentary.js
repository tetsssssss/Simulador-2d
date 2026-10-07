// MLB commentary pack (PT-BR). Events are emitted by the BaseballSimulationEngine (state.events); the match view
// builds ctx: name(id)/last(id), team(side), bat/field side, score, inning, half, outs, balls, strikes, runners.
const L = (c, id) => c.last?.(id) || c.name?.(id) || 'o jogador';
const N = (c, id) => c.name?.(id) || L(c, id);
const T = (c, side) => c.team?.(side) || side;
const loaded = c => (c.runners || []).length === 3;
const risp = c => (c.runners || []).some(b => b >= 2);
const PT = { FF: 'fastball', FT: 'two-seam', SI: 'sinker', FC: 'cutter', SL: 'slider', CU: 'curva', CH: 'changeup', FS: 'splitter', SP: 'splitter', SW: 'sweeper' };
const DEC = { POWER_SWING: 'vai com tudo no swing', PROTECT: 'protege a zona com dois strikes', CONTACT: 'busca o contato', BUNT: 'mostra o bunt' };
const runs = n => `${n} corrida${n === 1 ? '' : 's'}`;

export const MLB_COMMENTARY = {
  AT_BAT: [
    (e, c) => loaded(c) ? `Bases lotadas para ${N(c, e.batter)}!` : null,
    (e, c) => risp(c) && c.outs === 2 ? `Dois outs, corredor em posição. ${L(c, e.batter)} no bastão.` : null,
    (e, c) => `${N(c, e.batter)} vem para o bastão.`,
    (e, c) => `No bastão, ${L(c, e.batter)}. ${c.outs} out${c.outs === 1 ? '' : 's'}.`,
  ],
  PITCH: [
    (e, c) => c.balls === 3 && c.strikes === 2 ? `Contagem cheia. ${L(c, e.pitcher)} prepara o arremesso…` : null,
    (e, c) => e.mph >= 98 ? `${Math.round(e.mph)} mph! ${PT[e.pitchType] || 'Fastball'} de ${L(c, e.pitcher)}.` : null,
    (e, c) => e.decision === 'BUNT' ? `${L(c, e.batter)} ${DEC.BUNT}!` : null,
    (e, c) => e.hb != null && Math.abs(e.vb) >= 14 && e.pitchType === 'CU' ? `Curva de ${L(c, e.pitcher)} com ${Math.abs(Math.round(e.vb))} polegadas de queda, ${Math.round(e.mph)} mph.` : null,
    (e, c) => `${PT[e.pitchType] || 'Arremesso'} de ${L(c, e.pitcher)}, ${Math.round(e.mph)} mph${e.rpm ? ` e ${e.rpm} rpm` : ''}.`,
    (e, c) => `${L(c, e.pitcher)} arremessa.`,
  ],
  BALL: [(e, c) => `Ball${c.balls ? `, ${c.balls}-${c.strikes}` : ''}.`, (e, c) => `Fora da zona. ${c.balls}-${c.strikes}.`],
  STRIKE: [
    (e, c) => e.kind === 'called' ? `Strike chamado! ${c.balls}-${c.strikes}.` : null,
    (e, c) => e.kind === 'swinging' ? `Swing e erra! ${c.balls}-${c.strikes}.` : null,
    (e, c) => e.kind === 'foul' ? `Foul, ${c.balls}-${c.strikes}.` : null,
  ],
  FOUL: [(e, c) => `Foul para trás. Segue ${c.balls}-${c.strikes}.`, (e, c) => `Rebatida para foul, contagem mantida.`],
  CONTACT: [
    (e, c) => e.ev >= 105 ? `Contato forte! ${Math.round(e.ev)} mph de saída!` : null,
    (e, c) => e.kind === 'bunt' ? `${L(c, e.batter)} amortece a bola, bunt!` : null,
    (e, c) => e.foul && e.kind === 'pop' ? `Pop-up para trás do home, foul.` : null,
    (e, c) => e.kind === 'ground' ? `Bola rasteira${e.spray < -15 ? ' para o lado esquerdo' : e.spray > 15 ? ' para o lado direito' : ' pelo meio'}.` : null,
    (e, c) => e.kind === 'fly' ? `Bola alta${e.spray < -15 ? ' para o campo esquerdo' : e.spray > 15 ? ' para o campo direito' : ' para o centro'}…` : null,
    (e, c) => e.kind === 'line' ? `Line drive de ${L(c, e.batter)}!` : null,
    (e, c) => e.kind === 'pop' ? `Pop-up, bola sobe muito.` : null,
  ],
  HIT: [
    (e, c) => e.bases === 1 ? `Single de ${L(c, e.by)}!` : null,
    (e, c) => e.bases === 1 ? `${L(c, e.by)} coloca a bola entre os defensores. Rebatida!` : null,
    (e, c) => e.bases === 2 ? `DOUBLE! ${N(c, e.by)} chega na segunda!` : null,
    (e, c) => e.bases === 3 ? `TRIPLE! ${N(c, e.by)} corre até a terceira!` : null,
  ],
  HOME_RUN: [
    (e, c) => e.runs === 4 ? `GRAND SLAM! ${N(c, e.by)}!!!` : null,
    (e, c) => c.walkoff ? `HOME RUN DE WALK-OFF! ${N(c, e.by)} encerra o jogo!` : null,
    (e, c) => `HOME RUN! ${N(c, e.by)}! ${e.dist ? `${Math.round(e.dist)} pés. ` : ''}${runs(e.runs)} para ${T(c, e.team)}!`,
    (e, c) => `Lá se vai… e foi! ${L(c, e.by)} manda para fora!`,
  ],
  STRIKEOUT: [
    (e, c) => e.looking ? `Strikeout! ${L(c, e.batter)} fica olhando o terceiro strike.` : null,
    (e, c) => !e.looking ? `${L(c, e.pitcher)} elimina ${L(c, e.batter)} no swing! Strikeout!` : null,
    (e, c, h) => h.streak(`k:${e.pitcher}`) >= 3 ? `Mais um K de ${L(c, e.pitcher)}! Já são ${h.streak(`k:${e.pitcher}`) + 1} na partida.` : null,
  ],
  WALK: [(e, c) => loaded(c) ? `Walk com bases lotadas! Corrida forçada.` : `Base por bolas para ${L(c, e.batter)}.`, (e, c) => `Quatro balls. ${L(c, e.batter)} caminha para a primeira.`],
  HIT_BY_PITCH: [(e, c) => `${L(c, e.batter)} é atingido pelo arremesso. Vai para a primeira.`],
  OUT: [
    (e, c) => e.sac ? `Sacrifício! ${L(c, e.batter)} avança o corredor com o bunt.` : null,
    (e, c) => e.kind === 'thrownOut' && e.assist ? `ASSISTÊNCIA do outfield! ${L(c, e.fielder)} acerta o arremesso e pega o corredor!` : null,
    (e, c) => e.kind === 'thrownOut' ? `Corredor eliminado no arremesso de ${L(c, e.fielder)}.` : null,
    (e, c) => e.kind === 'groundout' ? `Rasteira para ${L(c, e.fielder)}, out na primeira.` : null,
    (e, c) => e.kind === 'flyout' ? `${L(c, e.fielder)} se posiciona… e pega. Out.` : null,
    (e, c) => e.kind === 'lineout' ? `Line drive direto na luva de ${L(c, e.fielder)}!` : null,
    (e, c) => e.kind === 'popout' ? `Pop-up fácil para ${L(c, e.fielder)}.` : null,
    (e, c) => e.kind === 'doublePlay' ? `DOUBLE PLAY! ${T(c, e.team)} sai do sufoco!` : null,
    (e, c) => e.kind === 'fieldersChoice' ? `Fielder's choice, out na base da frente.` : null,
    (e, c) => e.kind === 'caughtStealing' ? `Pego roubando base!` : null,
    (e, c) => `Out ${c.outs}.`,
  ],
  RUN_SCORES: [(e, c) => `${L(c, e.runner)} cruza o home! ${T(c, e.team)} ${c.score[e.team]}.`, (e, c) => `Corrida anotada por ${L(c, e.runner)}.`],
  ERROR: [(e, c) => e.kind === 'throw' ? `Arremesso ruim de ${L(c, e.fielder)}! Erro, o corredor avança.` : null, (e, c) => `Erro de ${L(c, e.fielder)}!`, (e, c) => `${L(c, e.fielder)} falha na jogada. Erro.`],
  STOLEN_BASE: [(e, c) => `${L(c, e.runner)} rouba a ${e.base === 3 ? 'terceira' : 'segunda'}!`, (e, c) => `Base roubada! ${L(c, e.runner)} chega antes do arremesso.`],
  RUNNER_DECISION: [
    (e, c) => e.decision === 'STEAL' ? `${L(c, e.runner)} sai correndo para a próxima base!` : null,
    (e, c) => e.decision === 'TAG_UP' ? `${L(c, e.runner)} espera a bola cair na luva e tenta o tag-up.` : null,
    (e, c) => e.decision === 'RETURN' ? `${L(c, e.runner)} volta para a base.` : null,
    (e, c) => e.decision === 'HOLD' ? `${L(c, e.runner)} fica na base.` : null,
    (e, c) => `${L(c, e.runner)} arrisca e avança.`,
  ],
  INNING_START: [(e, c) => `${e.half === 'top' ? 'Topo' : 'Fim'} do ${e.inning}º inning. ${T(c, 'away')} ${c.score.away} x ${c.score.home} ${T(c, 'home')}.`],
  INNING_END: [(e, c) => e.lob ? `Fim da metade. ${e.lob} corredor${e.lob > 1 ? 'es deixados' : ' deixado'} em base.` : 'Três outs. Troca de lado.'],
  PITCHING_CHANGE: [(e, c) => `Troca de arremessador: entra ${N(c, e.pitcher)}.`],
  FINAL: [(e, c) => `FIM DE JOGO! ${T(c, c.score.home > c.score.away ? 'home' : 'away')} vence por ${Math.max(c.score.home, c.score.away)} a ${Math.min(c.score.home, c.score.away)}.`],
  $after(e, c, h) { if (e.type === 'STRIKEOUT') h.bump(`k:${e.pitcher}`); },
  $priority(e) { if (e.type === 'RUNNER_DECISION') return e.decision === 'STEAL' || e.decision === 'TAG_UP' ? 2 : 0; return ['HOME_RUN', 'FINAL'].includes(e.type) || (e.type === 'OUT' && e.kind === 'doublePlay') ? 3 : ['HIT', 'STRIKEOUT', 'RUN_SCORES', 'WALK', 'ERROR', 'INNING_START'].includes(e.type) ? 2 : 1; },
  $tone(e) { return ['HOME_RUN', 'RUN_SCORES'].includes(e.type) ? 'score' : e.type === 'ERROR' ? 'turnover' : e.type === 'STRIKEOUT' ? 'save' : e.type === 'HIT' ? 'good' : 'normal'; },
};

// The commentary engine avoids repeating the last variants of a type, so every type needs enough unconditional
// variants to never run dry (otherwise the 3rd identical event in a row would be silent). Appended after the pack above.
const FALLBACK = {
  AT_BAT: [(e, c) => `${L(c, e.batter)} se prepara na caixa.`, (e, c) => `Próximo rebatedor: ${L(c, e.batter)}.`, (e, c) => `${L(c, e.pitcher)} encara ${L(c, e.batter)}.`],
  PITCH: [(e, c) => `${L(c, e.pitcher)} lança.`, (e, c) => `Lá vem o arremesso de ${L(c, e.pitcher)}.`, (e, c) => `${Math.round(e.mph || 90)} mph na direção do home.`],
  BALL: [(e, c) => `Ball ${c.balls}-${c.strikes}.`, (e, c) => `O arremesso passa longe.`, (e, c) => `${L(c, e.batter)} deixa passar.`],
  STRIKE: [(e, c) => `Strike. ${c.balls}-${c.strikes}.`, (e, c) => `Mais um strike, ${c.balls}-${c.strikes}.`, (e, c) => `Strike para ${L(c, e.batter)}.`],
  FOUL: [(e, c) => `Foul, contagem mantida.`, (e, c) => `A bola vai para fora da linha.`, (e, c) => `Foul de ${L(c, e.batter)}.`],
  CONTACT: [(e, c) => `Contato de ${L(c, e.batter)}.`, (e, c) => `A bola sai do bastão a ${Math.round(e.ev || 85)} mph.`, (e, c) => `${L(c, e.batter)} acerta a bola.`],
  HIT: [(e, c) => `Rebatida de ${L(c, e.by)}.`, (e, c) => `${L(c, e.by)} encontra espaço.`, (e, c) => `Hit para ${T(c, e.team)}.`],
  HOME_RUN: [(e, c) => `Home run de ${L(c, e.by)}!`, (e, c) => `A bola passa a cerca! ${N(c, e.by)}!`, (e, c) => `${T(c, e.team)} marca com um home run.`],
  STRIKEOUT: [(e, c) => `Strikeout de ${L(c, e.batter)}.`, (e, c) => `${L(c, e.pitcher)} termina a aparição com um K.`, (e, c) => `Três strikes. Out.`],
  WALK: [(e, c) => `Walk. ${L(c, e.batter)} na primeira.`, (e, c) => `${L(c, e.pitcher)} perde o controle e dá a base.`, (e, c) => `Base por bolas.`],
  HIT_BY_PITCH: [(e, c) => `Hit-by-pitch em ${L(c, e.batter)}.`, (e, c) => `${L(c, e.batter)} leva a bola e ganha a base.`, (e, c) => `Atingido, vai para a primeira.`],
  OUT: [(e, c) => `Out.`, (e, c) => `É out para ${T(c, e.team)}.`, (e, c) => `Mais um out. ${c.outs ?? ''}`.trim()],
  RUN_SCORES: [(e, c) => `Corrida anotada.`, (e, c) => `${T(c, e.team)} marca.`, (e, c) => `${L(c, e.runner)} pisa no home.`],
  ERROR: [(e, c) => `Erro da defesa.`, (e, c) => `A defesa falha.`, (e, c) => `Erro anotado para ${T(c, e.team)}.`],
  STOLEN_BASE: [(e, c) => `Base roubada.`, (e, c) => `${L(c, e.runner)} avança correndo.`, (e, c) => `O receptor não consegue evitar.`],
  RUNNER_DECISION: [(e, c) => `${L(c, e.runner)} decide: ${e.decision}.`, (e, c) => `Decisão de corrida de ${L(c, e.runner)}.`, (e, c) => `${L(c, e.runner)} lê a jogada.`],
  INNING_START: [(e, c) => `Começa o ${e.inning}º inning.`, (e, c) => `${e.half === 'top' ? 'Topo' : 'Fim'} da entrada ${e.inning}.`, (e, c) => `Nova meia-entrada.`],
  INNING_END: [(e, c) => `Três outs.`, (e, c) => `Troca de lado.`, (e, c) => `Fim da meia-entrada.`],
  PITCHING_CHANGE: [(e, c) => `Mudança no bullpen: ${N(c, e.pitcher)}.`, (e, c) => `${L(c, e.pitcher)} assume o monte.`, (e, c) => `Novo arremessador em campo.`],
  FINAL: [(e, c) => `Fim de jogo.`, (e, c) => `Final: ${c.score.away} a ${c.score.home}.`, (e, c) => `Acabou a partida.`],
};
for (const [t, fb] of Object.entries(FALLBACK)) MLB_COMMENTARY[t] = [...(MLB_COMMENTARY[t] || []), ...fb];
