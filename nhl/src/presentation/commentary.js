// NHL commentary pack (PT-BR). Events are emitted by the HockeySimulationEngine (state.events); the match view
// builds ctx: name(id)/last(id), team(abbr of a side), score {home,away}, period, clockLabel, strength, possession.
const L = (c, id) => c.last?.(id) || c.name?.(id) || 'o jogador';
const N = (c, id) => c.name?.(id) || L(c, id);
const T = (c, side) => c.team?.(side) || side;
const lead = (c, side) => (c.score ? c.score[side] - c.score[side === 'home' ? 'away' : 'home'] : 0);
const lateGame = c => c.period >= 3 && c.clock <= 300;

export const NHL_COMMENTARY = {
  FACEOFF: [
    (e, c) => `${L(c, e.winner)} vence o faceoff para ${T(c, e.team)}.`,
    (e, c) => `Faceoff ganho por ${L(c, e.winner)} contra ${L(c, e.loser)}.`,
    (e, c) => e.zone === 'center' ? `Disco no centro, ${L(c, e.winner)} leva a melhor.` : null,
    (e, c) => e.zone === 'offensive' ? `Faceoff ofensivo, ${L(c, e.winner)} puxa para trás!` : null,
  ],
  PASS: [
    (e, c) => e.stretch ? `Passe longo de ${L(c, e.from)} procurando ${L(c, e.to)}!` : null,
    (e, c) => `${L(c, e.from)} toca para ${L(c, e.to)}.`,
    (e, c) => `${L(c, e.from)} encontra ${L(c, e.to)}.`,
    (e, c) => e.cross ? `Cruzamento de ${L(c, e.from)} para ${L(c, e.to)}!` : null,
  ],
  INTERCEPTION: [
    (e, c) => `${L(c, e.by)} intercepta o passe!`,
    (e, c) => `Linha de passe cortada por ${L(c, e.by)}.`,
  ],
  TAKEAWAY: [(e, c) => `${L(c, e.by)} rouba o disco de ${L(c, e.from)}!`, (e, c) => `Takeaway de ${L(c, e.by)}.`],
  ZONE_ENTRY: [
    (e, c) => e.carried ? `${L(c, e.by)} entra na zona com o disco.` : null,
    (e, c) => !e.carried ? `${T(c, e.team)} despeja o disco na zona.` : null,
    (e, c) => e.carried ? `${L(c, e.by)} cruza a linha azul em velocidade!` : null,
  ],
  BREAKAWAY: [(e, c) => `${N(c, e.by)} sai sozinho! Breakaway!`, (e, c) => `Ninguém alcança ${L(c, e.by)}, mano a mano com o goleiro!`],
  HIT: [
    (e, c) => e.big ? `QUE HIT de ${N(c, e.by)} em ${L(c, e.on)}!` : null,
    (e, c) => `${L(c, e.by)} acerta ${L(c, e.on)} contra as placas.`,
    (e, c) => `Checagem de ${L(c, e.by)}.`,
  ],
  SHOT: [
    (e, c) => e.shotType === 'slap' ? `Slapshot de ${L(c, e.by)} da ponta!` : null,
    (e, c) => e.shotType === 'wrist' ? `${L(c, e.by)} arremessa de pulso!` : null,
    (e, c) => e.shotType === 'backhand' ? `Backhand de ${L(c, e.by)}!` : null,
    (e, c) => e.slot ? `${L(c, e.by)} chuta do slot!` : null,
    (e, c) => `${L(c, e.by)} chuta!`,
  ],
  SAVE: [
    (e, c) => e.big ? `DEFESAÇA de ${N(c, e.goalie)}!` : null,
    (e, c) => `${L(c, e.goalie)} defende.`,
    (e, c) => e.rebound ? `${L(c, e.goalie)} defende, mas dá rebote!` : `${L(c, e.goalie)} segura o disco.`,
    (e, c) => `Defesa de ${L(c, e.goalie)} no chute de ${L(c, e.shooter)}.`,
  ],
  REBOUND: [(e, c) => `Rebote! ${L(c, e.by)} chega primeiro!`, (e, c) => `Disco solto na frente do gol!`],
  BLOCK: [(e, c) => `${L(c, e.by)} bloqueia o chute!`, (e, c) => `Chute travado por ${L(c, e.by)}.`],
  MISS: [(e, c) => `${L(c, e.by)} erra o alvo.`, (e, c) => `Chute de ${L(c, e.by)} passa ao lado.`],
  PENALTY: [
    (e, c) => `Penalidade: ${N(c, e.on)}, ${e.minutes} minutos por ${e.infraction}.`,
    (e, c) => `${L(c, e.on)} vai para o banco de penalidades. ${e.infraction}.`,
  ],
  POWER_PLAY: [(e, c) => `Power play para ${T(c, e.team)}!`, (e, c) => `${T(c, e.team)} com vantagem numérica.`],
  POWER_PLAY_END: [(e, c) => `Fim do power play. Equipes completas.`],
  GOAL: [
    (e, c) => e.strength === 'PP' ? `GOL NO POWER PLAY! ${N(c, e.by)}!` : null,
    (e, c) => e.strength === 'SH' ? `GOL EM INFERIORIDADE! ${N(c, e.by)}!` : null,
    (e, c) => lead(c, e.team) === 0 ? `GOOOL! ${N(c, e.by)} empata para ${T(c, e.team)}!` : null,
    (e, c) => lead(c, e.team) === 1 && lateGame(c) ? `GOOOL no fim! ${N(c, e.by)} coloca ${T(c, e.team)} na frente!` : null,
    (e, c) => `GOOOL! ${N(c, e.by)} marca para ${T(c, e.team)}${e.assists?.length ? `, assistência de ${e.assists.map(a => L(c, a)).join(' e ')}` : ''}!`,
    (e, c) => `${L(c, e.by)} balança a rede! Gol de ${T(c, e.team)}!`,
  ],
  ICING: [(e, c) => `Icing. Faceoff na zona de ${T(c, e.team)}.`],
  OFFSIDE: [(e, c) => `Impedimento. Jogo parado.`],
  LINE_CHANGE: [(e, c) => e.team ? `${T(c, e.team)} troca a linha.` : null],
  PERIOD_START: [(e, c) => `Começa o ${['1º', '2º', '3º'][e.period - 1] || 'prolongamento'} período. ${c.team('away')} ${c.score.away} x ${c.score.home} ${c.team('home')}.`],
  PERIOD_END: [(e, c) => `Fim do ${['1º', '2º', '3º'][e.period - 1] || ''} período.`],
  FINAL: [(e, c) => c.score.home === c.score.away ? `Fim de jogo, empate.` : `FIM DE JOGO! ${T(c, c.score.home > c.score.away ? 'home' : 'away')} vence por ${Math.max(c.score.home, c.score.away)} a ${Math.min(c.score.home, c.score.away)}.`],
  $after(e, c, h) { if (e.type === 'SHOT') h.bump(`shots:${e.team}`); if (e.type === 'GOAL') h.reset(`shots:${e.team}`); },
  $priority(e) { return ['GOAL', 'FINAL', 'BREAKAWAY'].includes(e.type) || (e.type === 'SAVE' && e.big) ? 3 : ['PENALTY', 'POWER_PLAY', 'SAVE', 'PERIOD_START', 'PERIOD_END'].includes(e.type) || (e.type === 'HIT' && e.big) ? 2 : 1; },
  $tone(e) { return e.type === 'GOAL' ? 'score' : ['TAKEAWAY', 'INTERCEPTION'].includes(e.type) ? 'turnover' : e.type === 'SAVE' ? 'save' : e.type === 'PENALTY' ? 'bad' : e.type === 'POWER_PLAY' ? 'good' : 'normal'; },
};
