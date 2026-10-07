// Save UI: careers list (multi-career), slots (manual / autosave ring), load, delete, export / import JSON, version + migration
// notices, corruption handling, integrity check, storage usage. Also the in-career "Save & ajustes" screen.
import { A, S, store, $, $$, esc, nn, toast, on, onChange, onInput, saveNow, flushSave, download, confirmBox, openModal, registerScreen, pageTitle, panel, refresh, closeCareer, dateOnly, SPORT_LABEL, ROLE_LABEL, tname, touch, paintAutosave, chip, meter } from './core.js';

const hub = () => $('#hub');
const SLOT_LABEL = { manual: 'Manual', auto: 'Autosave (mais recente)', auto2: 'Autosave (anterior)' };
const QUOTA_BYTES = 5 * 1024 * 1024;
const usageBar = () => { const u = store.usage(), p = Math.min(100, (u * 1 / QUOTA_BYTES) * 100); return `<div class="usage" role="img" aria-label="Uso do armazenamento ${p.toFixed(0)}%"><i style="width:${p.toFixed(0)}%"></i></div><p class="muted small">Armazenamento das carreiras: ${(u / 1024).toFixed(0)} KB de ~5 MB do navegador (${p.toFixed(0)}%). Save versão ${A.CAREER_SAVE_VERSION}. ${p > 70 ? '<b class="warn-t">Quase cheio: exporte e apague carreiras antigas.</b>' : 'Cada cópia pesa ~0,4–1,5 MB; o autosave guarda até 2 cópias além do save manual.'}</p>`; };

// ---------- careers list ----------
export function renderList() {
  document.body.classList.remove('in-career');
  const list = store.list(), nflSlots = [1, 2, 3, 4, 5].filter(i => { try { return !!localStorage.getItem(`asu_nfl_save_${i}`); } catch { return false; } }).length;
  $('#hubNav').innerHTML = `<button class="primary" id="goNew" data-act="list-new">+ Nova carreira</button><button id="impBtn" data-act="list-import">Importar JSON</button>${nflSlots ? `<button id="impNfl" data-act="list-impnfl" title="Copia as carreiras do NFL v0.5 (os slots originais não são alterados)">Importar carreiras NFL v0.5 (${nflSlots})</button>` : ''}${list.length ? '<button id="verifyBtn" data-act="list-verify">Verificar saves</button>' : ''}<input type="file" id="impFile" accept=".json,application/json" hidden data-chg="list-file">`;
  const ver = S.ui.verify || {};
  hub().innerHTML = list.length ? `<div class="hub-grid">${list.map(e => {
    const m = e.metadata || {}, v = ver[e.id], open = S.ui.openSlots?.[e.id];
    return `<article class="cc" aria-label="${esc(e.name)}"><span class="badge-sport sp-${esc(e.sport)}">${esc(String(e.sport).toUpperCase())}</span><div><h3>${esc(e.name)}</h3>
      <small class="muted">${esc(m.player || (m.team ? tnameOf(e, m.team) : ''))}${m.season ? ` · ${esc(m.season)}` : ''}${m.phase ? ` · ${esc(m.phase)}` : ''}${m.record ? ` · <b>${esc(m.record)}</b>` : ''}</small>
      <div class="row"><span class="chip-role">${esc(ROLE_LABEL[e.role] || e.role)}</span>${e.importedFrom ? '<span class="chip-role warn">importada NFL v0.5</span>' : ''}${v ? `<span class="chip-role ${v.status === 'ok' ? (v.migrated ? 'warn' : 'ok') : 'bad'}">${v.status === 'ok' ? (v.migrated ? 'migrada para v' + A.CAREER_SAVE_VERSION : 'íntegra') : 'corrompida'}</span>` : ''}<small class="muted">atualizada ${esc(dateOnly(e.updatedAt))}</small></div>
      ${v && v.status !== 'ok' ? `<div class="alert bad" role="alert" style="margin-top:6px">Save ilegível: ${esc(v.error)}. Uma cópia do arquivo foi preservada.</div>` : ''}
      <div class="row"><button class="primary" data-act="list-open" data-id="${esc(e.id)}">Continuar ▶</button><button data-act="list-slots" data-id="${esc(e.id)}" aria-expanded="${!!open}">Slots</button><button data-act="list-export" data-id="${esc(e.id)}">Exportar</button><button class="danger" data-act="list-del" data-id="${esc(e.id)}">Excluir</button></div></div>
      ${open ? `<div class="slots">${slotsTable(e.id, false)}</div>` : ''}</article>`;
  }).join('')}</div>${usageBar()}`
    : `<div class="panel empty"><h3>Nenhuma carreira ainda</h3><p class="muted">Crie uma carreira escolhendo o esporte e o papel: Técnico, Dirigente ou Jogador. Ou importe um save (JSON).</p><button class="primary" id="goNew2" data-act="list-new">+ Nova carreira</button>${usageBar()}</div>`;
}
const tnameOf = (e, abbr) => abbr; // the index has no team names (the abbreviation is enough on the card)
on('list-new', () => { S.wiz = null; location.hash = '#new'; });
on('list-import', () => $('#impFile').click());
onChange('list-file', async el => {
  const f = el.files[0]; if (!f) return;
  try { const env = store.importJSON(await f.text()); toast(`Importada: ${env.name} (v${env.saveVersion}${env.saveVersion !== A.CAREER_SAVE_VERSION ? ' → migrada' : ''}).`); }
  catch (err) { toast(`Importação falhou: ${err.message}`, true); }
  el.value = ''; renderList();
});
on('list-impnfl', () => { const ids = store.importNflSlots(); toast(ids.length ? `${ids.length} carreira(s) NFL copiada(s). Abra para reconstruir a liga.` : 'Nada novo para importar.'); renderList(); });
on('list-open', el => { S.slotPref = null; location.hash = `#c/${encodeURIComponent(el.dataset.id)}/dashboard`; });
on('list-slots', el => { const o = (S.ui.openSlots ||= {}); o[el.dataset.id] = !o[el.dataset.id]; renderList(); });
on('list-export', el => exportCareer(el.dataset.id));
on('list-del', async el => { if (await confirmBox('Excluir carreira', 'Excluir esta carreira (todos os slots)? Exporte antes se quiser guardar uma cópia.', { ok: 'Excluir', danger: true })) { store.remove(el.dataset.id); renderList(); toast('Carreira excluída.'); } });
on('list-verify', () => {
  const out = (S.ui.verify = {});
  for (const e of store.list()) { const r = store.load(e.id); out[e.id] = { status: r.status, error: r.error, migrated: !!r.migrated }; }
  const bad = Object.values(out).filter(v => v.status !== 'ok').length;
  toast(bad ? `${bad} save(s) com problema.` : 'Todos os saves estão íntegros.', !!bad); renderList();
});
on('slot-open', el => { const id = el.dataset.id; S.slotPref = el.dataset.slot; if (S.c?.id === id) closeCareer({ discard: true }); const h = `#c/${encodeURIComponent(id)}/dashboard`; if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h; });
export function exportCareer(id) {
  const json = store.exportJSON(id); if (!json) return toast('Nada para exportar (save ausente ou corrompido).', true);
  download(`asu-career-${id}.json`, json); toast('Arquivo exportado.');
}
function slotsTable(id, live) {
  const sl = store.slots(id);
  if (!sl.length) return '<p class="muted small">Sem cópias salvas.</p>';
  return `<table class="tbl"><tr><th>Slot</th><th class="num">Tamanho</th><th>Atualizado</th><th>Versão</th><th>Estado</th><th></th></tr>${sl.map(s => `<tr><td>${esc(SLOT_LABEL[s.slot])}</td><td class="num">${(s.bytes / 1024).toFixed(0)} KB</td><td>${s.ok ? esc(dateOnly(s.updatedAt)) : '—'}</td><td>${s.ok ? `v${esc(s.saveVersion)}${s.saveVersion !== A.CAREER_SAVE_VERSION ? ' <span class="chip warn">migrar</span>' : ''}` : '—'}</td><td>${s.ok ? '<span class="pill-ok">ok</span>' : '<span class="pill-bad">ilegível</span>'}</td><td><button data-act="slot-open" data-id="${esc(id)}" data-slot="${esc(s.slot)}" ${s.ok ? '' : 'disabled'}>${live ? 'Carregar este slot' : 'Abrir este slot'}</button></td></tr>`).join('')}</table>`;
}

// ---------- load error (corrupt / missing / spec failure) ----------
export function renderLoadError(id, info) {
  document.body.classList.remove('in-career');
  $('#hubNav').innerHTML = '<button data-act="err-back">← Carreiras</button>';
  const corruptKeys = ['', '_auto', '_auto2'].map(s => `asu_career_${id}${s}_corrupt`).filter(k => { try { return localStorage.getItem(k) != null; } catch { return false; } });
  hub().innerHTML = `<div class="panel" role="alert" style="max-width:760px;margin:0 auto"><h3>Não foi possível abrir a carreira</h3>
    <p class="${info.status === 'missing' ? 'muted' : 'bad'}">${info.status === 'corrupt' ? `Save corrompido: ${esc(info.error)}.` : info.status === 'missing' ? 'Carreira não encontrada neste navegador.' : `Erro ao carregar: ${esc(info.error)}.`}</p>
    ${info.status === 'corrupt' ? '<p class="muted small">O arquivo ilegível foi preservado (cópia “_corrupt”) e nada foi sobrescrito. Se houver outro slot válido, abra-o pela lista (botão “Slots”).</p>' : ''}
    <div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="primary" data-act="err-back">Voltar às carreiras</button>${corruptKeys.map(k => `<button data-act="err-dl" data-k="${esc(k)}">Baixar cópia corrompida (${esc(k.replace(`asu_career_${id}`, '') || 'manual')})</button>`).join('')}${info.status !== 'missing' ? `<button class="danger" data-act="err-del" data-id="${esc(id)}">Excluir carreira</button>` : ''}</div></div>`;
}
on('err-back', () => { location.hash = '#'; });
on('err-dl', el => { try { download(`${el.dataset.k}.json.txt`, localStorage.getItem(el.dataset.k) || '', 'text/plain'); } catch { toast('Não foi possível ler a cópia.', true); } });
on('err-del', async el => { if (await confirmBox('Excluir carreira', 'Excluir esta carreira e as cópias preservadas?', { ok: 'Excluir', danger: true })) { store.remove(el.dataset.id); for (const s of ['', '_auto', '_auto2']) try { localStorage.removeItem(`asu_career_${el.dataset.id}${s}_corrupt`); } catch { /* ignore */ } location.hash = '#'; } });

// ---------- in-career screen ----------
registerScreen('saves', {
  title: 'Save & ajustes',
  render(el) {
    const c = S.c, spec = S.spec, integ = A.integrityCheck(c), mig = S.migrated;
    el.innerHTML = `${pageTitle('Save & ajustes')}
    ${mig ? `<div class="notice warn" role="status">⚠ Este save foi <b>migrado</b> para a versão ${esc(mig.to)} ao abrir. O texto original foi mantido como backup (<code>${esc(mig.backup)}</code>) e nada foi apagado.</div>` : ''}
    <div class="dash-grid"><div class="stack">
      <section class="panel"><div class="panel-h"><b>Carreira</b><small class="muted">save v${esc(A.CAREER_SAVE_VERSION)} · id ${esc(c.id)}</small></div>
        <div class="form-grid"><label>Nome da carreira<input id="sName" value="${esc(c.name)}" data-inp="set-name" data-fid="sname"></label>
        <label>Sua dificuldade<input value="${esc(['Fácil', 'Normal', 'Difícil', 'Lendário'][c.settings.difficulty ?? 1] || 'Normal')}" disabled></label></div>
        <div class="stack" style="margin-top:8px">
          <label class="chk"><input type="checkbox" id="sAuto" ${c.settings.autosave !== false ? 'checked' : ''} data-chg="set-auto"> Autosave após cada avanço/ação (anel de 2 cópias; o save manual nunca é sobrescrito por ele)</label>
          <label class="chk"><input type="checkbox" id="sEngine" ${c.settings.engineGames ? 'checked' : ''} data-chg="set-engine"> Jogos do meu time com o motor real do esporte (mais lento, estatísticas completas)</label>
          <label class="chk"><input type="checkbox" id="sCtl" ${c.settings.controlUserGames !== false ? 'checked' : ''} data-chg="set-ctl"> Parar antes dos jogos do meu time (recomendado)</label>
          ${c.sport === 'nfl' ? `<label class="chk">Duração do quarto no motor NFL <select id="sQ" data-chg="set-q">${[15, 10, 6].map(q => `<option value="${q}" ${(c.settings.nflQuarter || 15) === q ? 'selected' : ''}>${q} min</option>`).join('')}</select></label>` : ''}
        </div>
        <div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="primary" id="sSave" data-act="set-save">💾 Salvar agora (manual)</button><button id="sExport" data-act="set-export">Exportar JSON</button><button data-act="set-check">Verificar integridade</button><button class="danger" id="sDel" data-act="set-del">Excluir carreira</button></div>
        <p class="muted small" id="integ">${integ ? `<b class="bad">Integridade: ${esc(integ)}</b>` : 'Integridade estrutural: ok.'}</p></section>
      <section class="panel"><div class="panel-h"><b>Slots de save</b></div>${slotsTable(c.id, true)}<p class="muted small">Ao abrir, vale a cópia válida mais recente. “Carregar este slot” descarta o que não foi salvo e recarrega a carreira daquela cópia.</p>${usageBar()}</section>
    </div><div class="stack">
      <section class="panel"><div class="panel-h"><b>Dados</b></div><p class="muted small">${esc(c.dataNote || '')}</p><p class="muted small">Seed: <code>${esc(c.seed)}</code> · mesma seed + mesmas ações = mesmo futuro (determinístico, também após salvar e carregar).</p><dl class="kv"><dt>Esporte</dt><dd>${esc(SPORT_LABEL[c.sport])}</dd><dt>Papel</dt><dd>${esc(ROLE_LABEL[c.role])}</dd><dt>Temporada</dt><dd>${esc(c.season)}</dd><dt>Criada</dt><dd>${esc(dateOnly(c.createdAt))}</dd></dl></section>
      <section class="panel"><div class="panel-h"><b>Motor 2D</b></div><p class="muted small">As táticas do técnico (<code>engineConfig</code>) são entregues ao motor rápido do esporte (NFL: <code>simulateGame({coach})</code>; NHL/MLB: linhas, rotação e ordem de rebatedores aplicados ao elenco). Na ponte “Jogar no 2D” o <code>engineConfig</code> dos dois times viaja junto com o elenco; as telas 2D atuais ainda não leem esse campo (usam os elencos, que já refletem lineup/linhas salvos).</p></section>
    </div></div>`;
  },
});
onInput('set-name', el => { S.c.name = el.value.trim() || S.c.name; touch(); });
onChange('set-auto', el => { S.c.settings.autosave = el.checked; paintAutosave(); touch(); if (el.checked) saveNow(false); else clearTimeout(S.autoT); });
onChange('set-engine', el => { S.c.settings.engineGames = el.checked; touch(); });
onChange('set-ctl', el => { S.c.settings.controlUserGames = el.checked; touch(); });
onChange('set-q', el => { S.c.settings.nflQuarter = +el.value; touch(); });
on('set-save', () => { saveNow(true); refresh(); });
on('set-export', () => { if (saveNow(true)) exportCareer(S.c.id); refresh(); });
on('set-check', () => { const r = A.integrityCheck(S.c); $('#integ').innerHTML = r ? `<b class="bad">Integridade: ${esc(r)}</b>` : 'Integridade estrutural: ok.'; toast(r ? `Problema: ${r}` : 'Save íntegro.', !!r); });
on('set-del', async () => { if (await confirmBox('Excluir carreira', 'Excluir esta carreira definitivamente (todos os slots)?', { ok: 'Excluir', danger: true })) { const id = S.c.id; clearTimeout(S.autoT); S.c.settings.autosave = false; S.dirty = false; closeCareer(); store.remove(id); location.hash = '#'; } });
