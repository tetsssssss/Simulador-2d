// Career events generated from REAL state (never random flavor): lose / win starting job, trade request, contract renewal or
// refusal, injury decisions, rivalry games, big performances, slumps, awards, job offers / firing. Each event carries facts,
// pt-BR text and choices; resolveEvent applies the consequences to the save (relationships, morale, roles, contracts, board).
import { teamPlayers, teamOf, news } from './careerCore.js';
import { clamp, round1, xr } from './kit.js';
import { bumpPrel } from './prel.js';
import { pushNews } from './news.js';
import { winPct } from './league.js';
import { acceptOffer } from './coach.js';

const MAX_PENDING = 6;
const inClamp = (v, d = 0) => clamp(v, 0, 100) + d;
function mk(c, type, o) {
  const x = c.x, key = o.key || `${type}:${o.subject || ''}`;
  if ((x.events.cool[key] ?? -1) > x.cal.day) return null;
  if (x.events.pending.length >= MAX_PENDING) return null;
  if (x.events.pending.some(e => e.key === key)) return null;
  x.events.cool[key] = x.cal.day + (o.cooldown ?? 45);
  const ev = { id: `ev${++x.events.seq}`, type, key, day: x.cal.day, season: c.season, subject: o.subject || null, team: o.team || c.userTeam, title: o.title, text: o.text, facts: o.facts || {}, choices: o.choices, auto: o.auto || o.choices[0].key, status: 'open', chosen: null };
  x.events.pending.push(ev);
  return ev;
}
const ch = (key, label, hint = '') => ({ key, label, hint });

// ---------- detection ----------
export function scanEvents(spec, c, ctx = {}) {
  const x = c.x, out = [], push = e => { if (e) out.push(e); };
  const mine = c.role === 'PLAYER' ? c.players[c.me?.id] : null;
  if (c.role === 'PLAYER') {
    if (!mine) return out;
    scanPlayer(spec, c, mine, push, ctx);
  } else if (c.userTeam) {
    scanClub(spec, c, push, ctx);
  }
  return out;
}
function scanClub(spec, c, push, ctx) {
  const x = c.x, list = teamPlayers(c, c.userTeam), weekly = x.cal.day % 7 === 0;
  if (weekly) for (const p of list) {
    if (!p.rel) continue;
    if (p.rel.sat < 28 && p.rel.mo < 44 && p.ovr >= 60 && p.role !== 'S' && !p.mine) push(mk(c, 'REQUEST_TRADE', { subject: p.id, cooldown: 70, title: `${p.n} pede para sair`, text: `${p.n} (${p.pos}, ${p.ovr}) está insatisfeito com o espaço (satisfação ${Math.round(p.rel.sat)}, moral ${Math.round(p.rel.mo)}) e pediu uma troca.`, facts: { sat: Math.round(p.rel.sat), mo: Math.round(p.rel.mo), role: p.role }, choices: [ch('grant', 'Colocar no mercado de trocas', 'ele sai quando houver proposta'), ch('promise', 'Prometer mais espaço (10 jogos)', 'confiança em jogo'), ch('refuse', 'Recusar o pedido', 'moral cai')], auto: 'promise' }));
    if (p.c && p.c.yrs <= 1 && p.ovr >= 68 && p.t === c.userTeam && c.phase === 'REGULAR' && p.st !== 'MIN' && !p.noReSign) push(mk(c, 'CONTRACT_RENEWAL', { subject: p.id, cooldown: 120, title: `${p.n} quer renovar`, text: `${p.n} (${p.pos}, ${p.ovr}) tem contrato até ${c.season + Math.max(0, p.c.yrs - 1)} e quer conversar sobre a renovação.`, facts: { sal: p.c.sal, yrs: p.c.yrs }, choices: [ch('negotiate', 'Abrir negociação', 'cria pedido de contrato'), ch('later', 'Adiar para o fim da temporada', 'confiança −2'), ch('refuse', 'Dizer que não há planos', 'confiança −5')], auto: 'later' }));
    if (p.fm != null && p.fm <= -6 && p.role === 'S' && (p.ps?.gp || 0) >= 6) push(mk(c, 'SLUMP', { subject: p.id, cooldown: 35, title: `${p.n} em má fase`, text: `${p.n} (${p.pos}) vive uma fase ruim (forma ${p.fm}). O vestiário já percebeu.`, facts: { form: p.fm }, choices: [ch('practice', 'Treino extra individual', 'forma +, fadiga +'), ch('rest', 'Poupar um jogo', 'forma +3'), ch('ignore', 'Manter o plano', '')], auto: 'ignore' }));
  }
  // injuries of important players (once per injury)
  for (const p of list) if (p.inj && p.inj.games >= 6 && !p.inj.ev && p.ovr >= spec.starOvr - 10) { p.inj.ev = 1; push(mk(c, 'INJURY', { subject: p.id, key: `INJURY:${p.id}:${c.season}:${c.x.cal.day}`, cooldown: 1, title: `${p.n} se machuca`, text: `${p.n} (${p.pos}, ${p.ovr}) sofreu ${p.inj.type} e deve perder ${p.inj.games} jogos. O departamento médico pede uma decisão.`, facts: { type: p.inj.type, games: p.inj.games }, choices: injuryChoices(p), auto: 'rest' })); }
  // rivalry: next game against a division rival
  if (c.phase === 'REGULAR') {
    const g = c.schedule.find(q => q.s === c.slate && (q.h === c.userTeam || q.a === c.userTeam)), opp = g && (g.h === c.userTeam ? g.a : g.h);
    if (opp && teamOf(c, opp)?.div === teamOf(c, c.userTeam)?.div && x.cal.day % 7 === 0 || (opp && teamOf(c, opp)?.div === teamOf(c, c.userTeam)?.div && ctx.dayBeforeGame))
      push(mk(c, 'RIVALRY', { subject: opp, key: `RIVALRY:${opp}:${c.season}:${Math.floor(c.slate / Math.max(1, Math.floor(c.slates / 3)))}`, cooldown: 1, title: `Clássico contra ${teamOf(c, opp).name}`, text: `O próximo jogo é contra o rival de divisão ${teamOf(c, opp).name} (${c.standings[opp].w}-${c.standings[opp].l}). A torcida espera um recado.`, facts: { opp }, choices: [ch('hype', 'Esquentar a rivalidade', 'moral +, risco de indisciplina'), ch('focus', 'Foco no processo', 'sem risco'), ch('rest', 'Poupar desgaste no treino', 'fadiga −')], auto: 'focus' }));
  }
  // big performances of the last game
  for (const bp of ctx.bigGames || []) { const p = c.players[bp.id]; if (p && p.t === c.userTeam) push(mk(c, 'BIG_PERFORMANCE', { subject: p.id, key: `BIG:${p.id}:${c.season}:${c.slate}`, cooldown: 1, title: `${p.n} brilha`, text: `${p.n} (${p.pos}) teve uma atuação de gala: ${bp.label}.`, facts: { label: bp.label }, choices: [ch('celebrate', 'Exaltar a atuação', 'moral e torcida +'), ch('humble', 'Pedir humildade', 'respeito +')], auto: 'celebrate' })); }
  // awards for my players
  for (const a of ctx.awards || []) { const p = a.id && c.players[a.id]; if (p && p.t === c.userTeam) push(mk(c, 'AWARD', { subject: p.id, key: `AWARD:${p.id}:${c.season}:${a.award}`, cooldown: 1, title: `${a.award}: ${p.n}`, text: `${p.n} foi eleito ${a.award}. A diretoria quer saber como valorizar a conquista.`, facts: { award: a.award }, choices: [ch('celebrate', 'Homenagem pública', 'torcida e moral +'), ch('contract', 'Oferecer renovação com aumento', 'abre negociação'), ch('dismiss', 'Seguir adiante', '')], auto: 'celebrate' })); }
}
function injuryChoices(p) { return [ch('rest', 'Recuperação completa', 'sem risco'), ch('rush', 'Acelerar o retorno', 'volta 35% antes, risco de recaída'), ...(p.inj.games >= 12 ? [ch('surgery', 'Cirurgia', 'volta 20% antes, sem risco; custa caixa')] : [])]; }

function scanPlayer(spec, c, me, push, ctx) {
  const x = c.x, role = me.role, prev = x.pstate?.role;
  x.pstate ||= { role: role ?? null, starts: 0 };
  if (me.t && !['AMATEUR', 'DRAFT', 'FA', 'RET'].includes(me.t) && me.st !== 'PROSPECT') {
    if (prev && role && prev !== role) {
      if (prev === 'S' && role !== 'S') push(mk(c, 'LOSE_STARTING_JOB', { subject: me.id, key: `LOSE:${c.season}:${c.slate}`, cooldown: 14, title: 'Você perdeu a vaga de titular', text: `${teamOf(c, me.t)?.name} escalou outro jogador na sua posição. Seu papel agora é ${role === 'R' ? 'rotação' : 'reserva'}.`, facts: { from: prev, to: role }, choices: [ch('work', 'Trabalhar mais e responder em campo', 'XP +, confiança do técnico estável'), ch('ask', 'Pedir explicações ao técnico', 'depende da confiança'), ch('trade', 'Pedir troca', 'risco com a diretoria')], auto: 'work' }));
      if (prev !== 'S' && role === 'S') push(mk(c, 'WIN_STARTING_JOB', { subject: me.id, key: `WIN:${c.season}:${c.slate}`, cooldown: 14, title: 'Você é o novo titular!', text: `O técnico de ${teamOf(c, me.t)?.name} promoveu você a titular.`, facts: { from: prev, to: role }, choices: [ch('humble', 'Agradecer e manter os pés no chão', 'companheiros +'), ch('celebrate', 'Celebrar com a torcida', 'torcida +, companheiros neutro')], auto: 'humble' }));
    }
    x.pstate.role = role;
    if (x.cal.day % 7 === 0) {
      if (me.rel && me.rel.sat < 30 && me.role === 'B' && x.prel.coachTrust < 45) push(mk(c, 'REQUEST_TRADE', { subject: me.id, cooldown: 90, title: 'Você está insatisfeito', text: 'Sem espaço e com pouca confiança do técnico, seu agente sugere pedir uma troca.', facts: { sat: Math.round(me.rel.sat), coachTrust: Math.round(x.prel.coachTrust) }, choices: [ch('request', 'Pedir troca à diretoria', 'ManagementTrust cai se recusarem'), ch('wait', 'Esperar uma oportunidade', 'paciência'), ch('talk', 'Conversar com o técnico', 'pode melhorar a confiança')], auto: 'wait' }));
      if (me.c && me.c.yrs <= 1 && c.phase === 'REGULAR') push(mk(c, 'CONTRACT_RENEWAL', { subject: me.id, cooldown: 150, title: 'Seu contrato está acabando', text: `Seu contrato vai até ${c.season + Math.max(0, me.c.yrs - 1)}. O clube abriu conversas de renovação.`, facts: { sal: me.c.sal }, choices: [ch('accept', 'Aceitar a primeira proposta (−5% do valor)', 'garantia'), ch('negotiate', 'Negociar o valor de mercado', 'risco se a confiança estiver baixa'), ch('refuse', 'Recusar e ir ao mercado', 'ManagementTrust −')], auto: 'negotiate' }));
      if (me.fm != null && me.fm <= -6 && (me.ps?.gp || 0) >= 5) push(mk(c, 'SLUMP', { subject: me.id, cooldown: 35, title: 'Fase ruim', text: `Você vive uma má fase (forma ${me.fm}). A confiança está em ${Math.round(me.conf ?? 50)}.`, facts: { form: me.fm }, choices: [ch('practice', 'Treino extra', 'forma +, fadiga'), ch('rest', 'Descansar', 'forma +3'), ch('ignore', 'Seguir o plano', '')], auto: 'practice' }));
    }
    if (me.inj && me.inj.games >= 4 && !me.inj.ev) { me.inj.ev = 1; push(mk(c, 'INJURY', { subject: me.id, key: `INJURY:${me.id}:${c.season}:${x.cal.day}`, cooldown: 1, title: 'Você se lesionou', text: `${me.inj.type}: ${me.inj.games} jogos fora. O que fazer?`, facts: { type: me.inj.type, games: me.inj.games }, choices: injuryChoices(me), auto: 'rest' })); }
    if (c.phase === 'REGULAR') {
      const g = c.schedule.find(q => q.s === c.slate && (q.h === me.t || q.a === me.t)), opp = g && (g.h === me.t ? g.a : g.h);
      if (opp && teamOf(c, opp)?.div === teamOf(c, me.t)?.div) push(mk(c, 'RIVALRY', { subject: opp, key: `RIVALRY:${opp}:${c.season}:${Math.floor(c.slate / Math.max(1, Math.floor(c.slates / 3)))}`, cooldown: 1, title: `Rival: ${teamOf(c, opp).name}`, text: `Você enfrenta o rival de divisão ${teamOf(c, opp).name}. Entrevistas esperam uma declaração.`, facts: { opp }, choices: [ch('trash', 'Provocar o rival', 'torcida +, companheiros −'), ch('respect', 'Mostrar respeito', 'companheiros +'), ch('quiet', 'Não falar com a imprensa', '')], auto: 'quiet' }));
    }
  }
  for (const bp of ctx.bigGames || []) if (bp.id === me.id) push(mk(c, 'BIG_PERFORMANCE', { subject: me.id, key: `BIG:${me.id}:${c.season}:${c.slate}`, cooldown: 1, title: 'Atuação de destaque', text: `Você brilhou: ${bp.label}.`, facts: { label: bp.label }, choices: [ch('celebrate', 'Aproveitar os holofotes', 'torcida +, XP +'), ch('humble', 'Dar crédito aos companheiros', 'companheiros +')], auto: 'humble' }));
  for (const a of ctx.awards || []) if (a.id === me.id) push(mk(c, 'AWARD', { subject: me.id, key: `AWARD:${me.id}:${c.season}:${a.award}`, cooldown: 1, title: `Prêmio: ${a.award}`, text: `Você foi eleito ${a.award}!`, facts: { award: a.award }, choices: [ch('celebrate', 'Comemorar', 'torcida +'), ch('humble', 'Agradecer a equipe', 'companheiros +')], auto: 'humble' }));
}
// events created from outside the scan (season end): job offers and firing
export function jobOfferEvents(spec, c) {
  const out = [];
  for (const o of c.x.market.offers || []) {
    const e = mk(c, 'JOB_OFFER', { subject: o.team, key: `JOB:${o.team}:${c.season}`, cooldown: 1, team: o.team, title: `Proposta do ${o.name}`, text: `${o.name} quer você: ${o.sal}M por ${o.yrs} anos. ${o.why}`, facts: { ...o }, choices: [ch('accept', 'Aceitar a proposta', 'muda de clube'), ch('decline', 'Recusar e ficar', 'diretoria atual percebe o interesse'), ch('leverage', 'Usar a proposta para pedir aumento', 'depende da confiança')], auto: 'decline' });
    if (e) out.push(e);
  }
  return out;
}
export function firedEvent(spec, c, reason) {
  return mk(c, 'FIRED', { subject: c.userTeam, key: `FIRED:${c.season}`, cooldown: 1, title: 'Você foi demitido', text: `A diretoria de ${teamOf(c, c.userTeam)?.name} encerrou seu ciclo. ${reason}`, facts: { reason }, choices: [ch('look', 'Ver propostas de emprego', 'abre o mercado'), ch('wait', 'Esperar por oportunidades melhores', 'a reputação cai um pouco')], auto: 'look' });
}

// ---------- resolution ----------
export const getEvents = (c, { status } = {}) => (status === 'open' ? c.x.events.pending : status === 'resolved' ? c.x.events.log : [...c.x.events.pending, ...c.x.events.log]);
export function resolveEvent(spec, c, eventId, choiceKey) {
  const x = c.x, ev = x.events.pending.find(e => e.id === eventId);
  if (!ev) return { ok: false, text: 'Evento não encontrado ou já resolvido.' };
  const choice = ev.choices.find(k => k.key === choiceKey);
  if (!choice) return { ok: false, text: `Escolha inválida (${ev.choices.map(k => k.key).join(', ')}).` };
  const r = (RESOLVERS[ev.type] || {})[choiceKey]?.(spec, c, ev) || '';
  ev.status = 'resolved'; ev.chosen = choiceKey; ev.resolvedDay = x.cal.day; ev.result = r;
  x.events.pending = x.events.pending.filter(e => e !== ev);
  x.events.log.unshift(ev); if (x.events.log.length > 60) x.events.log.length = 60;
  pushNews(c, { kind: 'EVENT', imp: ['REQUEST_TRADE', 'LOSE_STARTING_JOB', 'FIRED', 'JOB_OFFER'].includes(ev.type) ? 4 : 3, h: ev.title, b: `${ev.text} → ${choice.label}. ${r}`, teams: [ev.team].filter(Boolean), players: ev.subject && c.players[ev.subject] ? [ev.subject] : [], key: `evr:${ev.id}`, src: { event: ev.type, choice: choiceKey } });
  return { ok: true, text: r || 'Decisão registrada.', event: ev };
}
export function autoResolveEvents(spec, c) { let n = 0; for (const e of [...c.x.events.pending]) { resolveEvent(spec, c, e.id, e.auto); n++; } return n; }
const P = (c, id) => c.players[id];
const sq = (c, d, why) => { for (const p of teamPlayers(c, c.userTeam)) if (p.rel) p.rel.mo = clamp(p.rel.mo + d, 0, 100); };
const RESOLVERS = {
  REQUEST_TRADE: {
    grant(spec, c, ev) { const p = P(c, ev.subject); if (c.role === 'PLAYER') return ''; if (p) { c.x.block.user = [...new Set([...c.x.block.user, p.id])]; p.rel.mo = clamp(p.rel.mo + 6, 0, 100); p.rel.tr = clamp(p.rel.tr + 3, 0, 100); } return `${p?.n} entra no mercado de trocas.`; },
    promise(spec, c, ev) { const p = P(c, ev.subject); if (p) { p.promise = { role: 'S', until: 10 }; p.rel.tr = clamp(p.rel.tr + 2, 0, 100); p.rel.sat = clamp(p.rel.sat + 8, 0, 100); } return `Você prometeu mais espaço a ${p?.n} por 10 jogos.`; },
    refuse(spec, c, ev) { const p = P(c, ev.subject); if (p?.rel) { p.rel.mo = clamp(p.rel.mo - 8, 0, 100); p.rel.tr = clamp(p.rel.tr - 6, 0, 100); } return `${p?.n} não gostou da resposta.`; },
    request(spec, c, ev) { const me = P(c, ev.subject); const ok = c.x.prel.management >= 55 && c.x.prel.coachTrust < 50; if (!ok) { bumpPrel(c, 'management', -6, 'Pedido de troca recusado'); bumpPrel(c, 'coachTrust', -3, 'Pedido de troca vazou'); return 'A diretoria recusou o pedido e a relação azedou.'; } bumpPrel(c, 'management', -3, 'Pedido de troca aceito'); c.x.pstate.tradeRequested = c.season; return 'A diretoria vai procurar uma troca.'; },
    wait(spec, c) { bumpPrel(c, 'coachTrust', 1, 'Paciência'); return 'Você decidiu esperar.'; },
    talk(spec, c) { const t = c.x.prel.coachTrust; bumpPrel(c, 'coachTrust', t >= 40 ? 4 : -2, 'Conversa com o técnico'); return t >= 40 ? 'O técnico ouviu e prometeu avaliar.' : 'O técnico achou a conversa desnecessária.'; },
  },
  CONTRACT_RENEWAL: {
    negotiate(spec, c, ev) { const p = P(c, ev.subject); if (!p) return ''; if (c.role === 'PLAYER') { const ok = c.x.prel.management >= 40; if (!ok) { bumpPrel(c, 'management', -2, 'Negociação travada'); return 'O clube não cedeu: a relação com a diretoria está fria.'; } p.c = { ...p.c, sal: round1(p.c.sal * 1.1 + 0.05), yrs: p.c.yrs + 3, kind: 'VET' }; bumpPrel(c, 'management', 4, 'Renovação'); return `Renovação fechada: ${p.c.sal}M por mais 3 anos.`; } p.askExt = true; return `${p.n} quer negociar: abra a renovação em Contratos.`; },
    later(spec, c, ev) { const p = P(c, ev.subject); if (p?.rel) p.rel.tr = clamp(p.rel.tr - 2, 0, 100); return 'Conversa adiada.'; },
    refuse(spec, c, ev) { const p = P(c, ev.subject); if (p?.rel) { p.rel.tr = clamp(p.rel.tr - 5, 0, 100); p.rel.mo = clamp(p.rel.mo - 3, 0, 100); } if (c.role === 'PLAYER') { bumpPrel(c, 'management', -4, 'Recusou renovar'); p.refuses = true; } return 'Sem renovação por enquanto.'; },
    accept(spec, c, ev) { const p = P(c, ev.subject); if (p?.c) { p.c = { ...p.c, sal: round1(p.c.sal * 0.95), yrs: p.c.yrs + 2 }; } bumpPrel(c, 'management', 3, 'Renovou rápido'); return 'Contrato renovado sem desgaste.'; },
  },
  REFUSE_CONTRACT: {
    persuade(spec, c, ev) { const p = P(c, ev.subject); if (p) { p.noReSign = false; p.askBonus = 1.15; if (p.rel) p.rel.tr = clamp(p.rel.tr + 8, 0, 100); } return `${p?.n} aceita conversar por 15% a mais.`; },
    release(spec, c, ev) { return 'Você deixa o jogador seguir seu caminho.'; },
  },
  INJURY: {
    rest() { return 'Recuperação respeitada.'; },
    rush(spec, c, ev) { const p = P(c, ev.subject); if (p?.inj) { p.inj.games = Math.max(1, Math.round(p.inj.games * 0.65)); p.reinjure = (p.reinjure || 0) + 0.3; if (c.role === 'PLAYER') bumpPrel(c, 'coachTrust', 2, 'Voltou rápido'); } return `${p?.n} volta antes, com risco de recaída.`; },
    surgery(spec, c, ev) { const p = P(c, ev.subject); if (p?.inj) { p.inj.games = Math.max(1, Math.round(p.inj.games * 0.8)); if (c.role !== 'PLAYER') c.x.fin.cash = round1(c.x.fin.cash - (spec.cap?.limit || 200) * 0.004); } return 'Cirurgia bem-sucedida: retorno mais cedo e seguro.'; },
  },
  RIVALRY: {
    hype(spec, c) { if (c.role === 'PLAYER') return ''; sq(c, 3); c.x.gameBoost = (c.x.gameBoost || 0) + 0.5; c.x.prel.fans = clamp(c.x.prel.fans + 1, 0, 100); return 'O vestiário entra motivado (+moral).'; },
    focus() { return 'Preparação normal.'; }, rest(spec, c) { c.x.training.load = clamp(c.x.training.load - 8, 0, 100); return 'Carga reduzida antes do clássico.'; },
    trash(spec, c) { bumpPrel(c, 'fans', 3, 'Provocou o rival'); bumpPrel(c, 'teammates', -2, 'Declaração polêmica'); return 'A torcida adorou; o vestiário nem tanto.'; },
    respect(spec, c) { bumpPrel(c, 'teammates', 2, 'Respeito ao rival'); return 'Postura elogiada.'; }, quiet() { return 'Sem declarações.'; },
  },
  BIG_PERFORMANCE: {
    celebrate(spec, c, ev) { const p = P(c, ev.subject); if (c.role === 'PLAYER') { bumpPrel(c, 'fans', 4, 'Atuação de destaque'); p.xp = (p.xp || 0) + 15; } else if (p?.rel) { p.rel.mo = clamp(p.rel.mo + 5, 0, 100); c.x.prel.fans = clamp(c.x.prel.fans + 2, 0, 100); } if (p) p.conf = clamp((p.conf ?? 50) + 6, 0, 100); return 'Momento aproveitado.'; },
    humble(spec, c, ev) { const p = P(c, ev.subject); if (c.role === 'PLAYER') bumpPrel(c, 'teammates', 3, 'Humildade'); else if (p?.rel) p.rel.rs = clamp(p.rel.rs + 4, 0, 100); return 'Humildade elogiada no vestiário.'; },
  },
  SLUMP: {
    practice(spec, c, ev) { const p = P(c, ev.subject); if (p) { p.fm = clamp((p.fm || 0) + 3, -10, 10); p.xp = (p.xp || 0) + 10; } c.x.training.load = clamp(c.x.training.load + 4, 0, 100); return 'Treino extra ajuda a retomar a confiança.'; },
    rest(spec, c, ev) { const p = P(c, ev.subject); if (p) { p.fm = clamp((p.fm || 0) + 3, -10, 10); if (c.role !== 'PLAYER') p.userRole = 'B'; } return 'Descanso para esfriar a cabeça.'; },
    ignore() { return 'Nada muda.'; },
  },
  AWARD: {
    celebrate(spec, c, ev) { const p = P(c, ev.subject); if (c.role === 'PLAYER') { bumpPrel(c, 'fans', 5, 'Prêmio'); bumpPrel(c, 'management', 2, 'Prêmio'); } else { sq(c, 2); if (p?.rel) p.rel.tr = clamp(p.rel.tr + 4, 0, 100); } return 'Conquista celebrada.'; },
    contract(spec, c, ev) { const p = P(c, ev.subject); if (p) p.askExt = true; return `Renovação de ${p?.n} fica no radar.`; },
    humble(spec, c) { bumpPrel(c, 'teammates', 3, 'Dividiu o prêmio'); return 'Time elogiado.'; }, dismiss() { return ''; },
  },
  LOSE_STARTING_JOB: {
    work(spec, c, ev) { const me = P(c, ev.subject); me.xp = (me.xp || 0) + 30; bumpPrel(c, 'coachTrust', 1, 'Atitude após perder a vaga'); return 'XP +30: você usa a decepção como combustível.'; },
    ask(spec, c) { const t = c.x.prel.coachTrust; bumpPrel(c, 'coachTrust', t >= 50 ? 3 : -3, 'Pedido de explicação'); return t >= 50 ? 'O técnico explicou o que precisa melhorar.' : 'O técnico não gostou de ser questionado.'; },
    trade(spec, c, ev) { return RESOLVERS.REQUEST_TRADE.request(spec, c, ev); },
  },
  WIN_STARTING_JOB: {
    humble(spec, c) { bumpPrel(c, 'teammates', 3, 'Humildade'); bumpPrel(c, 'coachTrust', 2, 'Conquistou a vaga'); return 'Titularidade conquistada com respeito.'; },
    celebrate(spec, c) { bumpPrel(c, 'fans', 3, 'Promoção a titular'); return 'A torcida celebra com você.'; },
  },
  JOB_OFFER: {
    accept(spec, c, ev) { return acceptOffer(spec, c, ev.facts.team).text; },
    decline(spec, c) { c.board.confidence = clamp(c.board.confidence + 2, 0, 100); return 'Você segue no clube; a diretoria soube do interesse.'; },
    leverage(spec, c) { const ok = c.board.confidence >= 55; if (ok) { c.x.coach.contract.sal = round1(c.x.coach.contract.sal * 1.12); c.x.coach.contract.yrs = Math.max(c.x.coach.contract.yrs, 3); return 'A diretoria cobriu a oferta: salário +12% e contrato estendido.'; } c.board.confidence = clamp(c.board.confidence - 4, 0, 100); return 'A diretoria não gostou da pressão.'; },
  },
  FIRED: { look() { return 'Propostas de emprego disponíveis.'; }, wait(spec, c) { c.x.rep = clamp(c.x.rep - 2, 0, 100); return 'Você espera por algo melhor.'; } },
};
