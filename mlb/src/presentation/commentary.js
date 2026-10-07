// MLB commentary pack (PT-BR). Events are emitted by the BaseballSimulationEngine (state.events); the match view
// builds ctx: name(id)/last(id), team(side), bat/field side, score, inning, half, outs, balls, strikes, runners.
const L = (c, id) => c.last?.(id) || c.name?.(id) || 'o jogador';
const N = (c, id) => c.name?.(id) || L(c, id);
const T = (c, side) => c.team?.(side) || side;
const loaded = c => (c.runners || []).length === 3;
const risp = c => (c.runners || []).some(b => b >= 2);
const PT = { FF: 'fastball', SI: 'sinker', FC: 'cutter', SL: 'slider', CU: 'curva', CH: 'changeup', SP: 'splitter', SW: 'sweeper' };
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
    (e, c) => `${PT[e.pitchType] || 'Arremesso'} de ${L(c, e.pitcher)}, ${Math.round(e.mph)} mph.`,
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
  ERROR: [(e, c) => `Erro de ${L(c, e.fielder)}!`, (e, c) => `${L(c, e.fielder)} falha na jogada. Erro.`],
  STOLEN_BASE: [(e, c) => `${L(c, e.runner)} rouba a base!`],
  INNING_START: [(e, c) => `${e.half === 'top' ? 'Topo' : 'Fim'} do ${e.inning}º inning. ${T(c, 'away')} ${c.score.away} x ${c.score.home} ${T(c, 'home')}.`],
  INNING_END: [(e, c) => e.lob ? `Fim da metade. ${e.lob} corredor${e.lob > 1 ? 'es deixados' : ' deixado'} em base.` : 'Três outs. Troca de lado.'],
  PITCHING_CHANGE: [(e, c) => `Troca de arremessador: entra ${N(c, e.pitcher)}.`],
  FINAL: [(e, c) => `FIM DE JOGO! ${T(c, c.score.home > c.score.away ? 'home' : 'away')} vence por ${Math.max(c.score.home, c.score.away)} a ${Math.min(c.score.home, c.score.away)}.`],
  $after(e, c, h) { if (e.type === 'STRIKEOUT') h.bump(`k:${e.pitcher}`); },
  $priority(e) { return ['HOME_RUN', 'FINAL'].includes(e.type) || (e.type === 'OUT' && e.kind === 'doublePlay') ? 3 : ['HIT', 'STRIKEOUT', 'RUN_SCORES', 'WALK', 'ERROR', 'INNING_START'].includes(e.type) ? 2 : 1; },
  $tone(e) { return ['HOME_RUN', 'RUN_SCORES'].includes(e.type) ? 'score' : e.type === 'ERROR' ? 'turnover' : e.type === 'STRIKEOUT' ? 'save' : e.type === 'HIT' ? 'good' : 'normal'; },
};
