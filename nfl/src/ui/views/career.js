// Career & Saves: slots (load / delete / export / import), new career, active career summary + full schedule.
import { esc, teamLogo } from '../components.js';
import { SLOT_COUNT } from '../../core/saveManager.js';
import { nextGame } from '../../game/career.js';

export function savesPanel(ctx) {
  const { teamBy } = ctx;
  const slots = ctx.sm.slots(), act = ctx.state.slot;
  return `<div class="panel"><div class="panel-h"><b>Slots de save</b><small class="muted">${SLOT_COUNT} slots locais</small></div><div class="slots">${slots.map(s => {
    if (s.status === 'empty') return `<div class="slot empty"><span class="slot-n">${s.slot}</span><span class="muted">Vazio</span><span class="grow"></span><button data-new-slot="${s.slot}">+ Nova carreira</button><button data-import="${s.slot}">Importar</button></div>`;
    if (s.status === 'corrupt') return `<div class="slot corrupt"><span class="slot-n">${s.slot}</span><span><b>Save corrompido</b><small class="muted">${esc(s.error)} — conteúdo preservado em backup</small></span><span class="grow"></span><button data-del="${s.slot}">Delete</button><button data-import="${s.slot}">Importar</button></div>`;
    const md = s.save.metadata, T = teamBy(md.team);
    return `<div class="slot ${act === s.slot ? 'active' : ''}"><span class="slot-n">${s.slot}</span>${teamLogo(T, 'md')}<span><b>${esc(md.name)}</b><small class="muted">${esc(T?.name || md.team)} · Temporada ${md.season} · Semana ${md.week} · <b>${esc(md.record)}</b></small><small class="muted">Atualizado ${new Date(s.save.updatedAt).toLocaleString('pt-BR')}${s.save.career.migratedFrom ? ' · migrado do save antigo' : ''}</small></span><span class="grow"></span>
      ${act === s.slot ? '<span class="chip on">ATIVO</span>' : `<button class="primary" data-load="${s.slot}">LOAD</button>`}<button data-export="${s.slot}">EXPORT</button><button data-import="${s.slot}">Importar</button><button class="danger" data-del="${s.slot}">DELETE</button></div>`;
  }).join('')}</div><input type="file" id="importFile" accept=".json,application/json" hidden></div>`;
}

export function bindSaves(ctx, rerender) {
  const { content, sm, toast } = ctx;
  let importSlot = null;
  content.querySelectorAll('[data-load]').forEach(b => b.onclick = () => { if (ctx.loadSlot(+b.dataset.load)) { toast(`Slot ${b.dataset.load} carregado`); ctx.navigate('home'); } });
  content.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const i = +b.dataset.del;
    if (!confirm(`Apagar o slot ${i}? Exporte antes se quiser guardar uma cópia.`)) return;
    sm.remove(i); if (ctx.state.slot === i) ctx.closeCareer(); toast(`Slot ${i} apagado`); rerender();
  });
  content.querySelectorAll('[data-export]').forEach(b => b.onclick = () => {
    const json = sm.exportSlot(+b.dataset.export); if (!json) return;
    const md = JSON.parse(json).metadata, a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `nfl-universe-${md.team}-S${md.season}-W${md.week}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  const file = content.querySelector('#importFile');
  content.querySelectorAll('[data-import]').forEach(b => b.onclick = () => { importSlot = +b.dataset.import; file.value = ''; file.click(); });
  if (file) file.onchange = async () => {
    const f = file.files[0]; if (!f || !importSlot) return;
    const cur = sm.load(importSlot);
    if (cur.status === 'ok' && !confirm(`Substituir o slot ${importSlot}?`)) return;
    try { sm.importInto(importSlot, await f.text()); toast(`Save importado no slot ${importSlot}`); if (ctx.state.slot === importSlot) ctx.loadSlot(importSlot); rerender(); }
    catch (e) { toast(e.message, 'bad'); }
  };
  content.querySelectorAll('[data-new-slot]').forEach(b => b.onclick = () => { ctx.state.ui.newSlot = +b.dataset.newSlot; ctx.navigate('career'); });
}

export function careerView(ctx) {
  const { state, content, teamBy } = ctx;
  const c = state.career;
  ctx.setTitle('Carreira & Saves', c ? `${c.name} · ${c.team}` : 'Crie ou carregue uma carreira');
  const free = state.ui.newSlot || ctx.sm.firstFreeSlot();
  const T = c ? teamBy(c.team) : null, ng = c ? nextGame(c) : null;
  content.innerHTML = `
  <div class="career-grid">
    <div class="panel"><div class="panel-h"><b>Nova carreira</b><small class="muted">GM / Head Coach</small></div>
      <div class="form-col"><label>Nome<input id="ncName" placeholder="Minha dinastia"></label>
      <label>Franquia<select id="ncTeam">${state.teams.map(t => `<option value="${t.abbr}" ${t.abbr === (state.ui.ncTeam || 'SEA') ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label>Slot<select id="ncSlot">${Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map(i => `<option value="${i}" ${i === free ? 'selected' : ''}>Slot ${i}${ctx.sm.load(i).status === 'ok' ? ' (ocupado — será substituído)' : ''}</option>`).join('')}</select></label>
      <div class="nc-preview" id="ncPrev"></div>
      <button class="primary" id="ncGo">Criar carreira ▶</button></div></div>
    ${c ? `<div class="panel"><div class="panel-h"><b>Carreira ativa</b><small class="muted">slot ${state.slot || '—'}</small></div>
      <div class="hero-id small">${teamLogo(T, 'lg')}<div><h3>${esc(c.name)}</h3><small class="muted">${esc(T.name)} · Temporada ${c.season} · Semana ${Math.min(c.week, 17)}</small><div class="rec big">${c.wins}-${c.losses}${c.ties ? '-' + c.ties : ''}</div></div></div>
      <div class="call-actions"><button class="primary" id="cSave">Salvar agora</button>${ng ? '<a class="btn" href="#play">▶ Próximo jogo</a>' : ''}<button id="cClose">Fechar carreira</button></div>
      <div class="sched full">${c.schedule.map(g => `<div class="sched-row ${g.result ? 'done' : g === ng ? 'next' : ''}"><span>S${g.week}</span>${teamLogo(teamBy(g.opp), 'xs')}<span>${g.home ? 'vs' : '@'} ${esc(g.opp)}</span><b class="${g.result?.w || ''}">${g.result?.legacy ? 'jogado (save antigo)' : g.result ? `${g.result.w} ${g.result.us}-${g.result.them}` : g === ng ? 'PRÓXIMO' : ''}</b></div>`).join('')}</div></div>` : ''}
  </div>${savesPanel(ctx)}`;
  const $ = s => content.querySelector(s);
  const prev = () => { const t = teamBy($('#ncTeam').value); state.ui.ncTeam = t.abbr; $('#ncPrev').innerHTML = `${teamLogo(t, 'lg')}<div><b>${esc(t.name)}</b><small class="muted">${esc(t.conference)} ${esc(t.division)} · ${esc(t.stadium || '')}</small></div>`; };
  $('#ncTeam').onchange = prev; prev();
  $('#ncGo').onclick = () => {
    const slot = +$('#ncSlot').value;
    if (ctx.sm.load(slot).status === 'ok' && !confirm(`O slot ${slot} será substituído. Continuar?`)) return;
    ctx.newCareer({ team: $('#ncTeam').value, name: $('#ncName').value.trim(), slot });
    state.ui.newSlot = null; ctx.toast(`Carreira criada no slot ${slot}`); ctx.navigate('home');
  };
  if ($('#cSave')) $('#cSave').onclick = () => { ctx.autosave(); careerView(ctx); };
  if ($('#cClose')) $('#cClose').onclick = () => { ctx.closeCareer(); careerView(ctx); };
  bindSaves(ctx, () => careerView(ctx));
}
