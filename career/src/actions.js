// Shared player actions used by several screens: contract negotiation modal, release confirmation, sport-specific roster moves,
// trade block toggle. Every call goes through core/career/api.js (cap / roster rules are enforced there, never here).
import { A, S, esc, nn, fix, money, openModal, confirmBox, toast, touch, refresh, myAbbr, isNum, on } from './core.js';

const POS_GRP = p => S.spec.posGroup(p.pos);
export function contractInfo(id) {
  const c = S.c, spec = S.spec, p = c.players[id];
  const v = A.getContractsView(c), row = v.rows.find(r => r.id === id) || v.freeAgents.find(r => r.id === id);
  return { p, row, ask: row?.ask || null, market: row?.market ?? null };
}
// kind: 'extend' (my player) | 'sign' (free agent)
export async function negotiateModal(id, kind = 'extend', askIn = null) {
  const c = S.c, spec = S.spec, p = c.players[id]; if (!p) return;
  const info = contractInfo(id), ask = askIn || info.ask || { sal: p.c?.sal || spec.salary.min, yrs: p.c?.yrs || 2 };
  const cap = spec.cap, pay = A.getContractsView(c).payroll;
  const html = `<dl class="dl"><dt>Atleta</dt><dd>${esc(p.n)} · ${esc(p.pos)} · ${esc(nn(p.age))} anos · OVR ${esc(nn(p.ovr))}${kind === 'sign' ? ' (estimativa)' : ''}</dd>
    ${p.c && kind === 'extend' ? `<dt>Contrato atual</dt><dd>${money(p.c.sal)} × ${esc(p.c.yrs)} ano(s)${p.expiring ? ' — <b class="bad">vence nesta offseason</b>' : ''}</dd>` : ''}
    ${isNum(info.market) ? `<dt>Valor de mercado</dt><dd>${money(info.market)}/ano</dd>` : ''}<dt>Pedido</dt><dd><b>${money(ask.sal)} × ${esc(ask.yrs)} ano(s)</b></dd>
    ${cap ? `<dt>${esc(cap.kind === 'hard' ? 'Folha / teto' : 'Folha / CBT')}</dt><dd>${money(pay)} / ${money(cap.limit)}</dd>` : ''}</dl>
    <div class="form-grid"><label>Salário anual (milhões)<input type="number" name="sal" step="0.05" min="0" value="${esc(ask.sal)}" data-autofocus></label><label>Anos de contrato<input type="number" name="yrs" min="1" max="8" value="${esc(ask.yrs)}"></label></div>
    <p class="muted small">Propor menos que o pedido reduz a chance de aceitação; ${cap?.kind === 'hard' ? 'o teto rígido bloqueia propostas que estourem a folha.' : 'acima do CBT há imposto de luxo.'}</p>`;
  await openModal({ title: kind === 'sign' ? `Contratar ${p.n}` : `Renovar ${p.n}`, html, actions: [{ key: 'no', label: 'Cancelar' }, {
    key: 'ok', label: 'Propor contrato', primary: true,
    handler: ctx => {
      const f = ctx.form(), offer = { sal: Math.round((+f.sal || 0) * 100) / 100, yrs: Math.round(+f.yrs || 0) };
      if (!(offer.sal > 0) || !(offer.yrs >= 1)) { ctx.msg('Informe salário e anos válidos.', 'bad'); return false; }
      const r = kind === 'sign' ? A.signFreeAgent(S.spec, S.c, id, offer) : A.extendContract(S.spec, S.c, id, offer);
      if (!r?.ok) { ctx.msg(r?.text || 'Proposta recusada.', 'bad'); return false; }
      toast(r.text || 'Contrato fechado.'); touch();
    },
  }] });
  refresh();
}
export async function releaseConfirm(id) {
  const p = S.c.players[id]; if (!p) return;
  const ok = await confirmBox('Dispensar atleta', `Dispensar ${p.n} (${p.pos}, ${p.ovr})? ${p.c ? `O contrato de ${p.c.sal}M × ${p.c.yrs} pode gerar custo morto.` : ''}${S.spec.waivers ? ' Pode passar por waivers.' : ''}`, { ok: 'Dispensar', danger: true });
  if (!ok) return;
  const r = A.releasePlayer(S.spec, S.c, id); toast(r.text || (r.ok ? 'Dispensado.' : 'Não foi possível dispensar.'), !r.ok); if (r.ok) touch(); refresh();
}
// Sport rules decide what is legal; the UI only offers the buttons that can apply.
export function sportMoves(p) {
  const c = S.c, spec = S.spec, own = p.t === c.userTeam, out = [];
  const yrs = p.c?.yrs ?? 9, expiring = p.expiring || yrs <= 1;
  if (spec.sport === 'nfl') {
    if (p.t === 'FA' && p.st === 'FA') out.push(['signPracticeSquad', 'Assinar PS', 'Assina para o practice squad (mínimo)']);
    if (own && p.st === 'ACT') out.push(['demoteToPracticeSquad', '→ PS', 'Envia ao practice squad']);
    if (own && p.st === 'MIN') out.push(['promotePracticeSquad', 'Promover', 'Promove ao elenco ativo']);
    if (own && expiring && c.phase === 'OFFSEASON') out.push(['franchiseTag', 'Tag', 'Franchise tag (1 por temporada)']);
  } else if (spec.sport === 'nhl') {
    if (own && p.st === 'ACT') { out.push(['sendToAHL', '→ AHL', 'Envia à AHL (pode exigir waivers)']); out.push(['placeOnWaivers', 'Waivers', 'Coloca nos waivers']); }
    if (own && p.st === 'MIN' && (p.lvl || 'AHL') === 'AHL') out.push(['callUp', 'Chamar', 'Chama da AHL']);
    if (own && expiring && (p.age ?? 99) < 27 && (p.svc ?? 99) < 7 && c.phase === 'OFFSEASON') out.push(['qualifyRFA', 'Oferta qualif.', 'Oferta qualificada (RFA)']);
  } else if (spec.sport === 'mlb') {
    if (own && p.st === 'ACT') { out.push(['sendDown', 'Opcionar', 'Envia às menores usando uma opção']); out.push(['dfa', 'DFA', 'Designated for assignment']); }
    if (own && p.st === 'MIN') { out.push(['callUp', 'Chamar', 'Chama para a MLB']); out.push([p.on40 ? 'removeFrom40' : 'addTo40', p.on40 ? 'Tirar do 40' : 'Pôr no 40', p.on40 ? 'Remove do 40-man' : 'Adiciona ao 40-man']); if (p.on40) out.push(['dfa', 'DFA', 'Designated for assignment']); }
  }
  return out;
}
export const moveButtons = p => sportMoves(p).map(([a, l, t]) => `<button data-act="move" data-m="${a}" data-id="${esc(p.id)}" title="${esc(t)}">${esc(l)}</button>`).join('');
export async function doMove(name, id, ...args) {
  const fn = A[name]; if (!fn) return toast(`Ação desconhecida: ${name}`, true);
  let r = fn(S.spec, S.c, id, ...args);
  if (r?.needsWaivers) { if (await confirmBox('Waivers necessários', r.text + ' Colocar nos waivers agora?', { ok: 'Colocar nos waivers' })) r = A.placeOnWaivers(S.spec, S.c, id); }
  else if (r?.needsDfa) { if (await confirmBox('Sem opções', r.text + ' Fazer DFA?', { ok: 'DFA', danger: true })) r = A.dfa(S.spec, S.c, id); }
  toast(r?.text || (r?.ok ? 'Feito.' : 'Não foi possível.'), r?.ok === false); if (r?.ok) touch(); refresh();
}
on('move', el => doMove(el.dataset.m, el.dataset.id));
export function toggleBlock(id) {
  const cur = A.getTransactionsView(S.c).block.user.map(p => p.id), has = cur.includes(id);
  A.setTradeBlock(S.spec, S.c, has ? cur.filter(x => x !== id) : [...cur, id]); touch(); toast(has ? 'Removido do bloco de trocas.' : 'Colocado no bloco de trocas: clubes farão ofertas.'); refresh();
}
on('negotiate', el => negotiateModal(el.dataset.id, el.dataset.kind || 'extend', el.dataset.sal ? { sal: +el.dataset.sal, yrs: +el.dataset.yrs } : null));
on('release', el => releaseConfirm(el.dataset.id));
on('block', el => toggleBlock(el.dataset.id));
