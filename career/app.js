// Career Hub — one place for every career of the universe (NFL / NHL / MLB × Técnico / Dirigente / Jogador).
// Routes: #  (careers) · #new (wizard) · #c/<id>/<tab> (dashboard). Sport rules come from each sport's career spec;
// CareerCore runs the season; saves go through the CareerStore (versioned, migrations with backup, autosave).
import * as C from '../core/career/careerCore.js';
import { createCareerStore, CAREER_SAVE_VERSION } from '../core/career/saveStore.js';
import { setPending, takeResult, goTo } from '../core/career/bridge.js';

const SPECS = {
  nfl: () => import('../nfl/src/career/nflSpec.js').then(m => m.NFL_SPEC),
  nhl: () => import('../nhl/src/career/nhlSpec.js').then(m => m.NHL_SPEC),
  mlb: () => import('../mlb/src/career/mlbSpec.js').then(m => m.MLB_SPEC),
};
const SPORT_INFO = {
  nfl: { label: 'NFL', desc: 'Futebol americano · 32 franquias · 17 jogos + playoffs · salary cap rígido.', route: null },
  nhl: { label: 'NHL', desc: 'Hóquei · 32 times · 82 jogos · Stanley Cup · cap rígido, ELC/RFA/UFA, AHL.', route: '#rink' },
  mlb: { label: 'MLB', desc: 'Beisebol · 30 times · 162 jogos · CBT, 40-man, ligas menores, arbitragem.', route: '#diamond' },
};
const ROLE_INFO = {
  COACH: { label: 'Técnico', desc: 'Escalações e papéis, táticas, relacionamento com o elenco (confiança, respeito, moral, satisfação). A diretoria cuida do mercado.' },
  GM: { label: 'Dirigente', desc: 'Contratos, teto/folha, trocas avaliadas por valor (idade, potencial, contrato, necessidade), draft, free agency, waivers. MLB: arbitragem, service time, 40-man, opções.' },
  PLAYER: { label: 'Jogador', desc: 'Crie seu atleta e percorra a Road to Pro: amador → draft → ligas menores → profissional. Treino, contratos, relações com o técnico.' },
};
const TABS = {
  COACH: [['overview', 'Visão geral'], ['roster', 'Elenco'], ['tactics', 'Táticas'], ['relations', 'Relacionamentos'], ['calendar', 'Calendário'], ['standings', 'Classificação'], ['injuries', 'Lesões'], ['development', 'Desenvolvimento'], ['news', 'Notícias'], ['history', 'Histórico'], ['settings', 'Save & ajustes']],
  GM: [['overview', 'Visão geral'], ['roster', 'Elenco'], ['contracts', 'Contratos & teto'], ['market', 'Mercado'], ['draft', 'Draft'], ['calendar', 'Calendário'], ['standings', 'Classificação'], ['injuries', 'Lesões'], ['development', 'Desenvolvimento'], ['news', 'Notícias'], ['history', 'Histórico'], ['settings', 'Save & ajustes']],
  PLAYER: [['overview', 'Meu jogador'], ['stats', 'Estatísticas'], ['training', 'Treino'], ['relations', 'Relações'], ['contract', 'Contrato'], ['calendar', 'Calendário'], ['standings', 'Classificação'], ['news', 'Notícias'], ['history', 'Histórico'], ['settings', 'Save & ajustes']],
};

const store = createCareerStore();
const S = { c: null, spec: null, tab: 'overview', wiz: { step: 0 }, busy: false, cancel: false, ui: {} };
const $ = s => document.querySelector(s), hub = $('#hub');
const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const money = m => (m == null ? '—' : `${(+m).toFixed(m >= 10 ? 1 : 2)}M`);
const ovr = v => `<span class="ovr ${v >= 80 ? 'h' : v >= 68 ? 'm' : v < 55 ? 'l' : ''}">${v}</span>`;
const pct = s => { const gp = s.w + s.l + s.t + (s.otl || 0); return gp ? ((s.w + s.t * 0.5) / gp).toFixed(3).replace(/^0/, '') : '.000'; };
const rec = s => (s ? `${s.w}-${s.l}${S.spec?.usePoints ? '-' + (s.otl || 0) : s.otl ? '-' + s.otl : s.t ? '-' + s.t : ''}` : '—');
const roleTxt = r => ({ S: 'Titular', R: 'Rotação', B: 'Reserva' }[r] || '—');
function toast(t, bad = false) { const el = $('#toast'); el.textContent = t; el.className = `toast show ${bad ? 'bad' : ''}`; clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200); }
const tname = abbr => S.c?.teams.find(t => t.abbr === abbr)?.name || abbr;

// ---------- persistence ----------
function save(manual = false) {
  if (!S.c) return;
  try { const { bytes } = manual ? store.save(S.c) : store.autosave(S.c); if (manual) toast(`Carreira salva (${(bytes / 1024).toFixed(0)} KB).`); }
  catch (e) { toast(`Falha ao salvar: ${e.message} (armazenamento cheio? exporte e apague carreiras antigas)`, true); }
}
async function openCareer(id) {
  const r = store.load(id);
  if (r.status !== 'ok') { toast(r.status === 'corrupt' ? `Save corrompido (${r.error}); cópia preservada.` : 'Carreira não encontrada.', true); location.hash = '#'; return false; }
  overlay(true, 'Carregando carreira…');
  try {
    const spec = await SPECS[r.save.sport]();
    let c = r.save.career;
    if (c.legacyNfl && !c.players) { // NFL v0.5 slot imported → build the league around it (copy; the NFL slot stays untouched)
      const L = c.legacyNfl;
      c = await C.createCareer(spec, { role: 'GM', team: L.team, name: L.name, seed: L.seed || `LEG${L.team}` });
      c.id = r.save.id; c.legacyNfl = L;
      C.news(c, `Importada da carreira NFL v0.5 (${L.team} · semana ${L.week} · ${L.wins}-${L.losses}). A liga foi reconstruída no Career Hub; o save original continua no NFL.`, 'big');
      store.save(c);
    }
    C.attachSpec(c, spec);
    await spec.ensureRuntime?.(c);
    S.c = c; S.spec = spec; store.setActive(c.id);
    if (r.migrated) toast(`Save migrado para v${CAREER_SAVE_VERSION} (backup do original mantido).`);
    await applyResultFrom2D();
    return true;
  } catch (e) { console.error(e); toast(`Erro ao abrir: ${e.message}`, true); return false; }
  finally { overlay(false); }
}
// A game played in the Partida 2D view comes back here and replaces the simulation of that game.
async function applyResultFrom2D() {
  const r = takeResult(S.c.id); if (!r) return;
  const map = S.spec.rawIdMap(S.c, [r.h, r.a]);
  S.c.extResult = { ...r, lines: r.lines.map(([pid, l]) => [map.get(String(pid)), l]).filter(x => x[0]) };
  await advance(1, { label: 'Aplicando o resultado do jogo 2D…' });
  toast(`Resultado do 2D aplicado: ${r.a} ${r.as} @ ${r.h} ${r.hs}.`);
}

// ---------- overlay / simulation loop ----------
function overlay(show, title = '', frac = 0, text = '') {
  $('#overlay').classList.toggle('show', show);
  if (!show) return;
  $('#ovTitle').textContent = title; $('#ovBar').style.width = `${Math.round(frac * 100)}%`; $('#ovText').textContent = text;
  $('#ovCancel').style.display = S.busy ? '' : 'none';
}
$('#ovCancel').onclick = () => { S.cancel = true; $('#ovCancel').textContent = 'Parando…'; };
async function stepOnce() {
  const c = S.c, spec = S.spec;
  if (c.phase === 'PRESEASON' || c.phase === 'REGULAR') return C.playSlate(spec, c);
  if (c.phase === 'PLAYOFFS') return C.playPlayoffGameDay(spec, c);
  if (c.phase === 'OFFSEASON') {
    if (c.off === 'DRAFT' && c.role === 'GM' && !c.draft?.done) { const slot = C.runDraft(spec, c); if (slot) { S.tab = 'draft'; return 'stop'; } }
    if (c.role === 'GM' && c.off === 'RESIGN' && S.ui.stopAtResign !== false && Object.values(c.players).some(p => p.expiring && p.t === c.userTeam) && !S.ui.resignSeen) { S.ui.resignSeen = true; S.tab = 'contracts'; return 'stop'; }
    if (c.role === 'PLAYER' && c.off === 'FREE_AGENCY' && (c.players[c.me.id].t === 'FA' || c.players[c.me.id].expiring) && !S.ui.offersSeen) { S.ui.offersSeen = true; S.tab = 'contract'; return 'stop'; }
    C.advanceOffseason(spec, c); S.ui.resignSeen = false; S.ui.offersSeen = false;
  }
  return null;
}
async function advance(n, { label = 'Simulando…', until = null } = {}) {
  if (S.busy) return;
  S.busy = true; S.cancel = false; $('#ovCancel').textContent = 'Parar após o jogo atual';
  const c = S.c, startPhase = c.phase;
  try {
    for (let i = 0; i < n; i++) {
      overlay(true, label, i / n, `${C.dateLabel(c, S.spec)} · ${c.phase === 'REGULAR' ? `rodada ${c.slate + 1}/${c.slates}` : c.phase === 'OFFSEASON' ? C.OFF_LABEL[c.off] : c.phase}`);
      await new Promise(r => setTimeout(r, 0));
      const r = await stepOnce();
      if (r === 'stop' || S.cancel || c.fired) break;
      if (until && until(c, startPhase)) break;
      if (c.settings.autosave && i % 6 === 5) save(false);
    }
  } catch (e) { console.error(e); toast(`Erro na simulação: ${e.message}`, true); }
  finally { S.busy = false; overlay(false); if (c.settings.autosave) save(false); render(); }
}

// ---------- router ----------
async function route() {
  const [, kind, id, tab] = location.hash.match(/^#(\w+)?\/?([^/]*)?\/?(\w+)?/) || [];
  if (kind === 'new') return renderWizard();
  if (kind === 'c' && id) {
    if (!S.c || S.c.id !== id) { const ok = await openCareer(decodeURIComponent(id)); if (!ok) return; }
    S.tab = tab || S.tab || 'overview';
    return renderDash();
  }
  S.c = null; renderList();
}
window.addEventListener('hashchange', route);
const render = () => (S.c ? renderDash() : route());

// ---------- careers list ----------
function renderList() {
  const list = store.list();
  const nflSlots = [1, 2, 3, 4, 5].filter(i => { try { return !!localStorage.getItem(`asu_nfl_save_${i}`); } catch { return false; } }).length;
  $('#hubNav').innerHTML = `<button class="primary" id="goNew">+ Nova carreira</button><button id="impBtn">Importar JSON</button>${nflSlots ? `<button id="impNfl" title="Copia as carreiras do NFL v0.5 (os slots originais não são alterados)">Importar carreiras NFL v0.5 (${nflSlots})</button>` : ''}<input type="file" id="impFile" accept=".json,application/json" hidden>`;
  hub.innerHTML = list.length ? `<div class="hub-grid">${list.map(e => {
    const m = e.metadata || {};
    return `<div class="cc"><span class="badge-sport sp-${e.sport}">${e.sport.toUpperCase()}</span><div><h3>${esc(e.name)}</h3>
      <small class="muted">${esc(m.player || tname(m.team) || m.team || '')}${m.season ? ` · ${m.season}` : ''}${m.phase ? ` · ${esc(m.phase)}` : ''}${m.record ? ` · <b>${esc(m.record)}</b>` : ''}</small>
      <div class="row"><span class="chip-role">${esc(ROLE_INFO[e.role]?.label || e.role)}</span>${e.importedFrom ? '<span class="chip-role">importada NFL v0.5</span>' : ''}<small class="muted">atualizada ${new Date(e.updatedAt).toLocaleString('pt-BR')}</small></div>
      <div class="row"><button class="primary" data-open="${esc(e.id)}">Continuar ▶</button><button data-exp="${esc(e.id)}">Exportar</button><button class="danger" data-del="${esc(e.id)}">Excluir</button></div></div></div>`;
  }).join('')}</div><p class="muted small">Armazenamento das carreiras: ${(store.usage() / 1024).toFixed(0)} KB (limite do navegador ~5 MB). Save versão ${CAREER_SAVE_VERSION}.</p>`
    : `<div class="panel"><h3>Nenhuma carreira ainda</h3><p class="muted">Crie uma carreira escolhendo o esporte e o papel: Técnico, Dirigente ou Jogador.</p><button class="primary" id="goNew2">+ Nova carreira</button></div>`;
  const go = () => { S.wiz = { step: 0 }; location.hash = '#new'; };
  $('#goNew').onclick = go; $('#goNew2') && ($('#goNew2').onclick = go);
  hub.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { location.hash = `#c/${encodeURIComponent(b.dataset.open)}/overview`; });
  hub.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('Excluir esta carreira? Exporte antes se quiser guardar uma cópia.')) { store.remove(b.dataset.del); renderList(); } });
  hub.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => download(b.dataset.exp));
  $('#impBtn').onclick = () => $('#impFile').click();
  $('#impFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const env = store.importJSON(await f.text()); toast(`Importada: ${env.name}`); renderList(); } catch (err) { toast(err.message, true); } };
  $('#impNfl') && ($('#impNfl').onclick = () => { const ids = store.importNflSlots(); toast(ids.length ? `${ids.length} carreira(s) NFL copiada(s). Abra para reconstruir a liga.` : 'Nada novo para importar.'); renderList(); });
}
function download(id) {
  const json = store.exportJSON(id); if (!json) return toast('Nada para exportar.', true);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `asu-career-${id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- new career wizard ----------
async function renderWizard() {
  const w = S.wiz;
  $('#hubNav').innerHTML = '<button id="backList">← Carreiras</button>';
  $('#backList').onclick = () => { location.hash = '#'; };
  const stepper = ['Esporte', 'Papel', w.role === 'PLAYER' ? 'Criar jogador' : 'Time', 'Começar'].map((t, i) => `<span class="${i === w.step ? 'on' : i < w.step ? 'done' : ''}">${i + 1}. ${t}</span>`).join('');
  let body = '';
  if (w.step === 0) body = `<div class="wiz-step">${Object.entries(SPORT_INFO).map(([k, v]) => `<button class="pick ${w.sport === k ? 'on' : ''}" data-sport="${k}"><span class="badge-sport sp-${k}" style="width:auto;height:auto;padding:2px 8px;display:inline-block;border-radius:6px;margin-bottom:8px">${v.label}</span><b>${v.label}</b><small>${v.desc}</small></button>`).join('')}</div>`;
  if (w.step === 1) body = `<div class="wiz-step">${Object.entries(ROLE_INFO).map(([k, v]) => `<button class="pick ${w.role === k ? 'on' : ''}" data-role="${k}"><b>${v.label}</b><small>${v.desc}</small></button>`).join('')}</div>`;
  if (w.step === 2) {
    const spec = w.spec || (w.spec = await SPECS[w.sport]());
    if (w.role !== 'PLAYER') {
      const teams = window.__hubTeams?.[w.sport] || (window.__hubTeams = { ...(window.__hubTeams || {}), [w.sport]: await teamsFor(w.sport) })[w.sport];
      body = `<div class="form-grid"><label>Time<select id="wTeam">${teams.map(t => `<option value="${t.abbr}" ${t.abbr === w.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label>Nome da carreira<input id="wName" value="${esc(w.name || '')}" placeholder="Minha dinastia"></label>
        <label>Dificuldade (mercado)<select id="wDiff"><option value="0.5">Fácil</option><option value="1" selected>Normal</option><option value="1.6">Difícil</option></select></label></div>`;
    } else {
      const ps = spec.archetypes, pos = w.pos || Object.keys(ps)[0];
      body = `<div class="form-grid"><label>Nome do atleta<input id="wPName" value="${esc(w.pname || '')}" placeholder="Seu nome"></label>
        <label>Posição<select id="wPos">${Object.keys(ps).map(p => `<option ${p === pos ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label>Estilo<select id="wArch">${ps[pos].map(a => `<option>${a}</option>`).join('')}</select></label>
        <label>Talento<select id="wTal"><option value="medio">Médio (POT ~78)</option><option value="alto" selected>Alto (POT ~86)</option><option value="raro">Raro (POT ~92)</option></select></label>
        <label>Número<input id="wNum" type="number" min="0" max="99" value="${w.num || 9}"></label>
        <label>Nome da carreira<input id="wName" value="${esc(w.name || '')}" placeholder="Road to Pro"></label></div>
        <p class="muted small">Começa em: <b>${esc(spec.roadToPro[0].label)}</b> → ${spec.roadToPro.slice(1).map(s => esc(s.label)).join(' → ')}.</p>`;
    }
  }
  if (w.step === 3) body = `<div class="panel"><p><b>${SPORT_INFO[w.sport].label}</b> · <b>${ROLE_INFO[w.role].label}</b> · ${esc(w.role === 'PLAYER' ? `${w.pname || 'Jogador'} (${w.pos})` : tname(w.team) || w.team)}</p>
    <label class="chk"><input type="checkbox" id="wEngine" checked> Jogos do meu time com o motor real do esporte (mais lento, estatísticas completas)</label>
    <p class="muted small">Os outros jogos da liga usam o modelo rápido de força dos elencos. Dados: elencos reais quando disponíveis (snapshots locais), contratos estimados.</p></div>`;
  hub.innerHTML = `<div class="wiz"><div class="stepper">${stepper}</div>${body}<div class="row" style="display:flex;gap:8px">${w.step ? '<button id="wBack">← Voltar</button>' : ''}<span class="grow"></span>${w.step === 3 ? '<button class="primary" id="wGo">Criar carreira ▶</button>' : `<button class="primary" id="wNext" ${(w.step === 0 && !w.sport) || (w.step === 1 && !w.role) ? 'disabled' : ''}>Próximo →</button>`}</div></div>`;
  hub.querySelectorAll('[data-sport]').forEach(b => b.onclick = () => { w.sport = b.dataset.sport; w.spec = null; w.team = null; w.pos = null; renderWizard(); });
  hub.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { w.role = b.dataset.role; renderWizard(); });
  $('#wPos') && ($('#wPos').onchange = e => { w.pos = e.target.value; w.pname = $('#wPName').value; renderWizard(); });
  const collect = () => {
    if ($('#wTeam')) w.team = $('#wTeam').value; if ($('#wName')) w.name = $('#wName').value; if ($('#wDiff')) w.diff = +$('#wDiff').value;
    if ($('#wPName')) { w.pname = $('#wPName').value; w.pos = $('#wPos').value; w.arch = $('#wArch').value; w.talent = $('#wTal').value; w.num = +$('#wNum').value; }
  };
  $('#wBack') && ($('#wBack').onclick = () => { collect(); w.step--; renderWizard(); });
  $('#wNext') && ($('#wNext').onclick = () => { collect(); w.step++; renderWizard(); });
  $('#wGo') && ($('#wGo').onclick = async () => {
    overlay(true, 'Montando a liga…', 0.2, 'carregando elencos e calendário');
    try {
      const spec = w.spec || await SPECS[w.sport]();
      const c = await C.createCareer(spec, { role: w.role, team: w.team, name: w.name, settings: { engineGames: $('#wEngine').checked, difficulty: w.diff ?? 1 },
        player: w.role === 'PLAYER' ? { name: w.pname || 'Jogador Criado', pos: w.pos, archetype: w.arch, talent: w.talent, num: w.num, age: spec.roadToPro[0].key === 'JUNIOR' ? 17 : 18 } : null });
      store.save(c); S.c = c; S.spec = spec; S.wiz = { step: 0 };
      location.hash = `#c/${encodeURIComponent(c.id)}/overview`;
    } catch (e) { console.error(e); toast(`Erro ao criar: ${e.message}`, true); }
    finally { overlay(false); }
  });
}
async function teamsFor(sport) { const spec = await SPECS[sport](); const L = await spec.loadLeague(); return L.teams.sort((a, b) => a.name.localeCompare(b.name)); }

// ---------- dashboard ----------
function primaryAction(c) {
  const sp = S.spec;
  if (c.fired) return null;
  if (c.phase === 'PRESEASON') return ['Começar temporada ▶', 1];
  if (c.phase === 'REGULAR') return [sp.calendar.games > 80 ? 'Próximo jogo ▶' : 'Próxima rodada ▶', 1];
  if (c.phase === 'PLAYOFFS') return ['Próximo jogo dos playoffs ▶', 1];
  const i = C.OFF_STAGES.indexOf(c.off);
  return [i === C.OFF_STAGES.length - 1 ? 'Iniciar nova temporada ▶' : `Avançar: ${C.OFF_LABEL[C.OFF_STAGES[i + 1]]} ▶`, 1];
}
function renderDash() {
  const c = S.c, spec = S.spec, mine = C.myTeam(c), me = c.me ? c.players[c.me.id] : null, T = c.teams.find(t => t.abbr === mine);
  const st = mine ? c.standings[mine] : null;
  $('#hubNav').innerHTML = `<button id="toList">← Carreiras</button><button id="saveBtn">💾 Salvar</button>`;
  $('#toList').onclick = () => { save(false); location.hash = '#'; };
  $('#saveBtn').onclick = () => save(true);
  const pa = primaryAction(c), next = C.nextUserGame(c);
  const can2d = next && spec.rostersFor2D && SPORT_INFO[c.sport].route;
  const weekN = c.sport === 'nfl' ? 1 : c.sport === 'nhl' ? 4 : 7;
  const head = `<div class="dash-head" style="--tc:${T?.color || '#1b2a3c'}">
    <span class="badge-sport sp-${c.sport}" style="width:54px;height:54px;border-radius:12px;display:grid;place-items:center;font-weight:900">${c.sport.toUpperCase()}</span>
    <div><h2>${esc(c.name)}</h2><small class="muted">${esc(ROLE_INFO[c.role].label)} · ${esc(me ? `${me.n} (${me.pos}) · ${C.meStage(spec, c)?.label || c.me.stage}` : T?.name || '')} · ${esc(C.dateLabel(c, spec))}</small>
      <div>${st ? `<span class="big">${rec(st)}</span> <small class="muted">${pct(st)}${st.streak ? ` · ${st.streak}` : ''}</small>` : ''}${me ? ` <span class="big">${ovr(me.ovr)}</span> <small class="muted">POT ${me.pot} · ${me.age} anos · ${esc(me.t === 'AMATEUR' ? 'amador' : tname(me.t))}</small>` : ''}</div></div>
    <div class="dash-actions">${c.role !== 'PLAYER' ? `<div class="conf"><small class="muted">Confiança da diretoria ${Math.round(c.board.confidence)}</small><div class="bar"><i style="width:${c.board.confidence}%"></i></div></div>` : ''}
      ${next ? `<small class="muted" style="align-self:center">Próximo: ${esc(next.a)} @ ${esc(next.h)}</small>` : ''}
      ${can2d ? '<button id="play2d" title="Joga o próximo jogo do seu time na Partida 2D com o motor real; o resultado volta para a carreira">🎮 Jogar no 2D</button>' : ''}
      ${pa ? `<button class="primary" id="advBtn">${pa[0]}</button>` : ''}
      ${c.phase === 'REGULAR' ? `<button id="advWeek">Simular ${weekN} jogo${weekN > 1 ? 's' : ''}</button><button id="advPhase">Simular até os playoffs ⏭</button>` : ''}
      ${c.phase === 'PLAYOFFS' ? '<button id="advPhase">Simular playoffs ⏭</button>' : ''}
      ${c.phase === 'OFFSEASON' ? '<button id="advPhase">Pular offseason ⏭</button>' : ''}</div></div>`;
  const tabs = `<div class="tabs hub-tabs seg big">${TABS[c.role].map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  hub.innerHTML = head + tabs + `<div id="tabBody"></div>`;
  hub.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; history.replaceState(null, '', `#c/${encodeURIComponent(c.id)}/${S.tab}`); renderDash(); });
  $('#advBtn') && ($('#advBtn').onclick = () => advance(1, { label: 'Simulando…' }));
  $('#advWeek') && ($('#advWeek').onclick = () => advance(weekN));
  $('#advPhase') && ($('#advPhase').onclick = () => advance(400, { label: c.phase === 'OFFSEASON' ? 'Offseason…' : 'Simulando a temporada…', until: (cc, p0) => cc.phase !== p0 }));
  $('#play2d') && ($('#play2d').onclick = async () => {
    const rosters = await spec.rostersFor2D(c, next.h, next.a);
    setPending({ careerId: c.id, careerName: c.name, sport: c.sport, h: next.h, a: next.a, key: next.key, seed: `${c.seed}-${next.key}-${next.h}${next.a}`, rosters });
    save(false); goTo(c.sport, SPORT_INFO[c.sport].route);
  });
  const body = $('#tabBody');
  const views = { overview: tabOverview, roster: tabRoster, tactics: tabTactics, relations: tabRelations, calendar: tabCalendar, standings: tabStandings, injuries: tabInjuries, development: tabDevelopment, news: tabNews, history: tabHistory, settings: tabSettings, contracts: tabContracts, market: tabMarket, draft: tabDraft, stats: tabStats, training: tabTraining, contract: tabContract };
  (views[S.tab] || tabOverview)(body, c, spec);
}

// ---------- tabs ----------
const newsHtml = (list, n = 30) => `<div class="news-list">${list.slice(0, n).map(x => `<div class="k-${x.kind}"><small>${esc(x.d || x.s)}</small>${esc(x.text)}</div>`).join('') || '<p class="muted">Sem notícias.</p>'}</div>`;
const goalsHtml = c => c.goals.map(g => `<div class="goal"><span class="st">${g.status === 'done' ? '✅' : g.status === 'failed' ? '❌' : '◻️'}</span><span>${esc(g.text)}</span></div>`).join('') || '<p class="muted">—</p>';
function tabOverview(el, c, spec) {
  const mine = C.myTeam(c);
  if (c.role === 'PLAYER') return tabMe(el, c, spec);
  const div = c.teams.filter(t => t.div === c.teams.find(x => x.abbr === mine)?.div).sort((a, b) => (spec.usePoints ? (2 * c.standings[b.abbr].w + c.standings[b.abbr].otl) - (2 * c.standings[a.abbr].w + c.standings[a.abbr].otl) : 0) || (c.standings[b.abbr].w - c.standings[a.abbr].w));
  const top = C.teamPlayers(c, mine).filter(p => p.ps?.gp).sort((a, b) => b.ovr - a.ovr).slice(0, 6);
  el.innerHTML = `${c.fired ? firedPanel(c, spec) : ''}<div class="dash-grid"><div>
    <div class="panel"><div class="panel-h"><b>Divisão</b><small class="muted">${esc(c.teams.find(x => x.abbr === mine)?.div || '')}</small></div><table class="tbl"><tr><th>Time</th><th class="num">${spec.usePoints ? 'V-D-OTL' : 'V-D'}</th>${spec.usePoints ? '<th class="num">PTS</th>' : '<th class="num">PCT</th>'}<th class="num">Saldo</th><th>Seq.</th></tr>
      ${div.map(t => { const s = c.standings[t.abbr]; return `<tr class="${t.abbr === mine ? 'me' : ''}"><td>${esc(t.name)}</td><td class="num">${rec(s)}</td><td class="num">${spec.usePoints ? 2 * s.w + s.otl + s.t : pct(s)}</td><td class="num">${s.pf - s.pa > 0 ? '+' : ''}${s.pf - s.pa}</td><td>${esc(s.streak)}</td></tr>`; }).join('')}</table></div>
    <div class="panel"><div class="panel-h"><b>Destaques do elenco</b></div>${top.map(p => `<div class="goal">${ovr(p.ovr)} <b>${esc(p.n)}</b> <small class="muted">${esc(p.pos)} · ${esc(spec.formatLine(p.ps))}</small></div>`).join('') || '<p class="muted">A temporada ainda não começou.</p>'}</div>
    ${c.playoffs ? `<div class="panel"><div class="panel-h"><b>Playoffs</b></div>${bracketHtml(c, spec)}</div>` : ''}
  </div><div>
    <div class="panel"><div class="panel-h"><b>Metas da temporada</b><small class="muted">modo: ${esc(c.teams.find(x => x.abbr === mine)?.mode || '')}</small></div>${goalsHtml(c)}</div>
    <div class="panel"><div class="panel-h"><b>Notícias</b></div>${newsHtml(c.news, 14)}</div>
    ${c.dataNote ? `<p class="muted small">${esc(c.dataNote)}</p>` : ''}</div></div>`;
  bindFired(el, c, spec);
}
function firedPanel(c, spec) { return `<div class="panel" style="border-color:#ff6b6b"><div class="panel-h"><b>Você foi demitido</b></div><p class="muted">Propostas de emprego:</p>${C.jobOffers(spec, c).map(o => `<button data-job="${o.abbr}">Aceitar ${esc(o.name)}</button>`).join(' ')} <button class="danger" id="endCareer">Encerrar carreira</button></div>`; }
function bindFired(el, c, spec) {
  el.querySelectorAll('[data-job]').forEach(b => b.onclick = () => { C.takeJob(spec, c, b.dataset.job); save(false); renderDash(); });
  el.querySelector('#endCareer') && (el.querySelector('#endCareer').onclick = () => { if (confirm('Encerrar a carreira? O save continua disponível para consulta.')) { C.news(c, 'Carreira encerrada.', 'bad'); save(true); location.hash = '#'; } });
}
function bracketHtml(c) {
  const po = c.playoffs, mine = C.myTeam(c), names = S.spec.playoffs.names || [];
  return `<div class="bracket">${po.rounds.map((r, i) => `<div class="col"><small class="muted">${esc(names[i] || `Rodada ${i + 1}`)}</small>${r.series.filter(s => !s.bye).map(s => `<div class="sr ${s.a === mine || s.b === mine ? 'mine' : ''}"><b class="${s.winner === s.a ? 'w' : ''}">${s.a}</b> ${s.wa}–${s.wb} <b class="${s.winner === s.b ? 'w' : ''}">${s.b}</b></div>`).join('')}</div>`).join('')}${po.champion ? `<div class="col"><small class="muted">Campeão</small><div class="sr mine">🏆 <b class="w">${esc(po.champion)}</b></div></div>` : ''}</div>`;
}
function rosterRows(c, spec, list, { roleEdit = false, actions = () => '' } = {}) {
  return `<div class="scroll"><table class="tbl"><tr><th>Pos</th><th>Atleta</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">POT</th><th>Papel</th><th>Status</th><th>Contrato</th><th>Relação (conf · resp · moral · satisf.)</th><th>Temporada</th><th></th></tr>
    ${list.map(p => `<tr class="${p.inj ? 'inj' : ''} ${p.mine ? 'me' : ''}"><td>${esc(p.pos)}</td><td><b>${esc(p.n)}</b>${p.fict ? '<span class="fict">fictício</span>' : ''}${p.demo ? '<span class="fict">demo</span>' : ''}</td><td class="num">${p.age}${p.ageEst ? '<span class="est">*</span>' : ''}</td><td class="num">${ovr(p.ovr)}</td><td class="num">${p.pot}</td>
      <td>${roleEdit && p.st === 'ACT' ? `<select data-role="${esc(p.id)}">${['S', 'R', 'B'].map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${roleTxt(r)}</option>`).join('')}</select>` : roleTxt(p.role)}</td>
      <td>${p.inj ? `🩹 ${esc(p.inj.type)} (${p.inj.games})` : p.st === 'MIN' ? (p.lvl || 'Menores') : esc(p.st)}</td><td>${p.c ? `${money(p.c.sal)} × ${p.c.yrs}${p.c.kind && p.c.kind !== 'VET' ? ` <small class="muted">${esc(p.c.kind)}</small>` : ''}${p.expiring ? ' <b class="bad">vence</b>' : ''}` : '—'}</td>
      <td>${p.rel ? `<span class="rel" title="confiança ${Math.round(p.rel.tr)} · respeito ${Math.round(p.rel.rs)} · moral ${Math.round(p.rel.mo)} · satisfação ${Math.round(p.rel.sat)}">${['tr', 'rs', 'mo', 'sat'].map(k => `<i><b style="width:${p.rel[k]}%;background:${p.rel[k] < 35 ? '#ff6b6b' : p.rel[k] < 55 ? '#f6c453' : '#4fd18b'}"></b></i>`).join('')}</span>` : '—'}</td>
      <td><small class="muted">${p.ps?.gp ? esc(spec.formatLine(p.ps)) : ''}</small></td><td>${actions(p)}</td></tr>`).join('')}</table></div><p class="muted small">* idade estimada (fonte sem data de nascimento).</p>`;
}
function tabRoster(el, c, spec) {
  const list = C.teamPlayers(c, c.userTeam).sort((a, b) => spec.positions.indexOf(spec.posGroup(a.pos)) - spec.positions.indexOf(spec.posGroup(b.pos)) || (a.st === 'MIN') - (b.st === 'MIN') || b.ovr - a.ovr);
  const act = list.filter(p => p.st === 'ACT' || p.st === 'IR').length;
  const coach = c.role === 'COACH';
  el.innerHTML = `<div class="panel"><div class="panel-h"><b>Elenco ${esc(tname(c.userTeam))}</b><small class="muted">${act}/${spec.roster.max} no elenco principal · ${list.length - act} ${esc(spec.minorsLabel?.replace(/^para (o |a |as )?/, '') || 'menores')}${coach ? ' · defina os papéis: afetam satisfação e moral' : ''}</small></div>
    ${rosterRows(c, spec, list, { roleEdit: coach, actions: p => coach ? `<select data-talk="${esc(p.id)}"><option value="">Conversar…</option><option value="praise">Elogiar</option><option value="motivate">Motivar</option><option value="criticize">Cobrar</option><option value="promise">Prometer espaço</option></select>`
      : `${p.st === 'ACT' ? `<button data-down="${esc(p.id)}" title="Enviar para as ligas menores${c.sport === 'mlb' ? ' (usa uma opção)' : ''}">↓</button>` : p.st === 'MIN' ? `<button data-up="${esc(p.id)}" title="Chamar para o elenco principal">↑</button>` : ''}<button data-ext="${esc(p.id)}">Renovar</button><button class="danger" data-rel="${esc(p.id)}">Dispensar</button>` })}</div>`;
  el.querySelectorAll('[data-role]').forEach(s => s.onchange = () => { C.setRole(spec, c, s.dataset.role, s.value); toast('Papel definido.'); });
  el.querySelectorAll('[data-talk]').forEach(s => s.onchange = () => { if (!s.value) return; const r = C.talkTo(c, s.dataset.talk, s.value); toast(r.text); renderDash(); });
  el.querySelectorAll('[data-rel]').forEach(b => b.onclick = () => { const p = c.players[b.dataset.rel]; if (!confirm(`Dispensar ${p.n}? O salário restante pode pesar no orçamento.`)) return; toast(C.releasePlayer(spec, c, p.id).text); renderDash(); });
  el.querySelectorAll('[data-ext]').forEach(b => b.onclick = () => negotiateDialog(c, spec, c.players[b.dataset.ext]));
  el.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { const p = c.players[b.dataset.down]; if (c.sport === 'mlb') { if ((p.opt ?? 0) <= 0) return toast(`${p.n} não tem mais opções: teria que passar por waivers.`, true); if (!p.optUsed) { p.opt--; p.optUsed = true; } p.lvl = 'AAA'; } p.st = 'MIN'; toast(`${p.n} enviado ${spec.minorsLabel || 'para as menores'}.`); renderDash(); });
  el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const p = c.players[b.dataset.up]; if (C.teamPlayers(c, c.userTeam).filter(q => q.st === 'ACT').length >= spec.roster.max) return toast(`Elenco principal cheio (${spec.roster.max}).`, true); p.st = 'ACT'; p.lvl = null; if (c.sport === 'mlb') p.on40 = true; toast(`${p.n} chamado para o elenco principal.`); renderDash(); });
}
function negotiateDialog(c, spec, p) {
  const ask = C.contractAsk(spec, p);
  const sal = prompt(`${p.n} (${p.pos}, ${p.ovr}, ${p.age} anos)\nValor de mercado: ${money(C.marketValue(spec, p))}/ano · pedido: ${money(ask.sal)} × ${ask.yrs}\n\nSalário anual (milhões):`, ask.sal);
  if (sal == null) return;
  const yrs = prompt('Anos de contrato:', ask.yrs); if (yrs == null) return;
  const r = C.extendContract(spec, c, p.id, { sal: +sal, yrs: +yrs });
  toast(r.text, !r.ok); renderDash();
}
function tabTactics(el, c, spec) {
  const list = C.teamPlayers(c, c.userTeam, { active: true }), eff = spec.tacticEffect ? spec.tacticEffect(c.tactics, list) : 0;
  el.innerHTML = `<div class="panel"><div class="panel-h"><b>Plano de jogo</b><small class="muted">efeito estimado no rendimento: ${eff > 0 ? '+' : ''}${eff.toFixed(1)}</small></div><div class="form-grid">
    ${spec.tactics.map(t => `<label>${esc(t.label)}<select data-tac="${t.key}">${t.options.map(o => `<option ${c.tactics[t.key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`).join('')}
    <label>Intensidade dos treinos<select id="trainInt">${[[0.6, 'Leve (menos lesões)'], [1, 'Normal'], [1.5, 'Pesada (mais evolução)']].map(([v, l]) => `<option value="${v}" ${c.training.intensity === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <p class="muted small">As táticas combinam com o elenco: um forecheck agressivo pede um time jovem e rápido; passar mais pede um QB de elite; trocar o arremessador cedo pede um bullpen forte.</p></div>`;
  el.querySelectorAll('[data-tac]').forEach(s => s.onchange = () => { c.tactics[s.dataset.tac] = s.value; renderDash(); });
  el.querySelector('#trainInt').onchange = e => { c.training.intensity = +e.target.value; c.settings.injuryRate = c.training.intensity > 1 ? 1.2 : c.training.intensity < 1 ? 0.8 : 1; toast('Treinos ajustados.'); };
}
function tabRelations(el, c, spec) {
  if (c.role === 'PLAYER') return tabPlayerRelations(el, c, spec);
  const list = C.teamPlayers(c, c.userTeam).filter(p => p.rel).sort((a, b) => a.rel.mo - b.rel.mo);
  el.innerHTML = `<div class="dash-grid"><div class="panel"><div class="panel-h"><b>Vestiário</b><small class="muted">moral média ${Math.round(C.avgMorale(c, c.userTeam))}</small></div>
    ${rosterRows(c, spec, list, { actions: p => `<button data-t="${esc(p.id)}|praise">Elogiar</button><button data-t="${esc(p.id)}|promise">Prometer espaço</button><button data-t="${esc(p.id)}|criticize">Cobrar</button>` })}</div>
    <div class="panel"><div class="panel-h"><b>Diretoria</b></div><p>Confiança: <b>${Math.round(c.board.confidence)}</b>/100</p>${goalsHtml(c)}<p class="muted small">Papéis abaixo do esperado derrubam a satisfação; promessas não cumpridas custam confiança; vitórias sobem a moral.</p></div></div>`;
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const [id, k] = b.dataset.t.split('|'); toast(C.talkTo(c, id, k).text); renderDash(); });
}
function tabCalendar(el, c, spec) {
  const mine = C.myTeam(c);
  const games = mine ? c.schedule.filter(g => g.h === mine || g.a === mine) : [];
  el.innerHTML = `<div class="dash-grid"><div class="panel"><div class="panel-h"><b>Calendário ${c.season}</b><small class="muted">${esc(C.dateLabel(c, spec))}</small></div><div class="scroll"><table class="tbl"><tr><th>#</th><th>Data</th><th>Jogo</th><th>Resultado</th></tr>
    ${games.map((g, i) => { const home = g.h === mine, r = g.r, w = r && (home ? r[0] > r[1] : r[1] > r[0]); const d = new Date(Date.UTC(c.season, spec.calendar.startMonth - 1, spec.calendar.startDay) + g.s * spec.calendar.slateDays * 864e5); return `<tr class="${g.s === c.slate && c.phase === 'REGULAR' ? 'me' : ''}"><td>${i + 1}</td><td>${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</td><td>${home ? 'vs' : '@'} ${esc(tname(home ? g.a : g.h))}</td><td>${r ? `<b class="${w ? 'pill-ok' : 'pill-bad'}">${w ? 'V' : 'D'}</b> ${home ? r[0] : r[1]}-${home ? r[1] : r[0]}${g.ot ? ' (OT)' : ''}${g.engine ? ' <small class="muted">motor</small>' : ''}` : ''}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">Sem time na liga (Road to Pro amador).</td></tr>'}</table></div></div>
    <div class="panel"><div class="panel-h"><b>Fases</b></div><div class="stepper" style="flex-direction:column;align-items:flex-start">${['PRESEASON', 'REGULAR', 'PLAYOFFS', ...C.OFF_STAGES].map(k => { const label = { PRESEASON: 'Pré-temporada', REGULAR: 'Temporada regular', PLAYOFFS: 'Playoffs' }[k] || C.OFF_LABEL[k]; const on = c.phase === k || c.off === k; return `<span class="${on ? 'on' : ''}">${esc(label)}</span>`; }).join('')}</div>${c.playoffs ? bracketHtml(c) : ''}</div></div>`;
}
function tabStandings(el, c, spec) {
  const confs = [...new Set(c.teams.map(t => t.conf))];
  el.innerHTML = `<div class="dash-grid" style="grid-template-columns:1fr 1fr">${confs.map(cf => `<div class="panel"><div class="panel-h"><b>${esc(spec.confLabel)} ${esc(cf)}</b></div><table class="tbl"><tr><th>#</th><th>Time</th><th class="num">${spec.usePoints ? 'V-D-OTL' : 'V-D'}</th><th class="num">${spec.usePoints ? 'PTS' : 'PCT'}</th><th class="num">Saldo</th></tr>
    ${c.teams.filter(t => t.conf === cf).sort((a, b) => { const A = c.standings[a.abbr], B = c.standings[b.abbr]; return (spec.usePoints ? (2 * B.w + B.otl) - (2 * A.w + A.otl) : 0) || (B.w / Math.max(1, B.w + B.l + B.otl) - A.w / Math.max(1, A.w + A.l + A.otl)) || (B.pf - B.pa) - (A.pf - A.pa); }).map((t, i) => { const s = c.standings[t.abbr]; return `<tr class="${t.abbr === C.myTeam(c) ? 'me' : ''}"><td>${i + 1}${i < spec.playoffs.perConf ? ' ·' : ''}</td><td>${esc(t.name)} <small class="muted">${esc(t.div.split(' ').slice(-1)[0])}</small></td><td class="num">${rec(s)}</td><td class="num">${spec.usePoints ? 2 * s.w + s.otl + s.t : pct(s)}</td><td class="num">${s.pf - s.pa}</td></tr>`; }).join('')}</table></div>`).join('')}</div>`;
}
function tabInjuries(el, c, spec) {
  const mine = C.myTeam(c), inj = Object.values(c.players).filter(p => p.inj).sort((a, b) => (b.t === mine) - (a.t === mine) || b.ovr - a.ovr);
  el.innerHTML = `<div class="panel"><div class="panel-h"><b>Departamento médico</b><small class="muted">${inj.filter(p => p.t === mine).length} no seu time · ${inj.length} na liga</small></div><table class="tbl"><tr><th>Time</th><th>Atleta</th><th>Pos</th><th class="num">OVR</th><th>Lesão</th><th class="num">Jogos fora</th></tr>${inj.slice(0, 80).map(p => `<tr class="${p.t === mine ? 'me' : ''}"><td>${esc(p.t)}</td><td>${esc(p.n)}</td><td>${esc(p.pos)}</td><td class="num">${p.ovr}</td><td>${esc(p.inj.type)}</td><td class="num">${p.inj.games}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Ninguém lesionado.</td></tr>'}</table></div>`;
}
function tabDevelopment(el, c, spec) {
  const list = C.teamPlayers(c, c.userTeam).sort((a, b) => (b.pot - b.ovr) - (a.pot - a.ovr));
  el.innerHTML = `<div class="panel"><div class="panel-h"><b>Desenvolvimento</b><small class="muted">evolução acontece com idade, potencial, tempo de jogo e treino (intensidade em Táticas)</small></div><table class="tbl"><tr><th>Atleta</th><th>Pos</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">POT</th><th class="num">Margem</th><th class="num">Últ. evolução</th><th>Histórico</th></tr>
    ${list.map(p => `<tr><td>${esc(p.n)}</td><td>${esc(p.pos)}</td><td class="num">${p.age}</td><td class="num">${ovr(p.ovr)}</td><td class="num">${p.pot}</td><td class="num">${p.pot - p.ovr}</td><td class="num ${p.dv > 0 ? 'good' : p.dv < 0 ? 'bad' : ''}">${p.dv ? (p.dv > 0 ? '+' : '') + p.dv : '—'}</td><td><small class="muted">${(p.hist || []).slice(-3).map(h => `${h.s}: ${h.gp || 0}J`).join(' · ')}</small></td></tr>`).join('')}</table></div>`;
}
function tabNews(el, c) { el.innerHTML = `<div class="panel"><div class="panel-h"><b>Notícias</b></div>${newsHtml(c.news, 160)}</div>`; }
function tabHistory(el, c) {
  el.innerHTML = `<div class="dash-grid"><div><div class="panel"><div class="panel-h"><b>Temporadas</b><small class="muted">títulos: ${c.history.titles}</small></div><table class="tbl"><tr><th>Temporada</th><th>Time</th><th>Campanha</th><th>Campeão</th><th>Metas</th></tr>
    ${c.history.seasons.slice().reverse().map(h => `<tr><td>${h.s}</td><td>${esc(h.team || '')}</td><td>${h.w != null ? `${h.w}-${h.l}${h.otl ? '-' + h.otl : h.t ? '-' + h.t : ''} (${h.finish}º)` : esc(h.line || h.stage || '')}</td><td>${esc(h.champion || '')}</td><td><small>${(h.goals || []).map(g => (g.status === 'done' ? '✅' : '❌')).join('')}</small></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhuma temporada concluída.</td></tr>'}</table></div>
    <div class="panel"><div class="panel-h"><b>Prêmios</b></div>${c.history.awards.slice().reverse().slice(0, 30).map(a => `<div class="goal"><small class="muted">${a.s}</small> <b>${esc(a.award)}</b> ${esc(a.name)} <small class="muted">${esc(a.team)}</small></div>`).join('') || '<p class="muted">—</p>'}</div></div>
    <div class="panel"><div class="panel-h"><b>Transações</b></div><div class="news-list">${c.history.transactions.slice().reverse().slice(0, 80).map(t => `<div><small>${t.s} · ${esc(t.kind)}</small>${esc(t.text)}</div>`).join('') || '<p class="muted">—</p>'}</div></div></div>`;
}
function tabSettings(el, c, spec) {
  el.innerHTML = `<div class="dash-grid"><div class="panel"><div class="panel-h"><b>Save</b><small class="muted">versão ${CAREER_SAVE_VERSION} · id ${esc(c.id)}</small></div>
    <div class="form-grid"><label>Nome da carreira<input id="sName" value="${esc(c.name)}"></label></div>
    <label class="chk"><input type="checkbox" id="sAuto" ${c.settings.autosave ? 'checked' : ''}> Autosave (cópia separada; o save manual nunca é sobrescrito por ele)</label>
    <label class="chk"><input type="checkbox" id="sEngine" ${c.settings.engineGames ? 'checked' : ''}> Jogos do meu time com o motor real do esporte</label>
    ${c.sport === 'nfl' ? `<label class="chk">Duração do quarto no motor NFL <select id="sQ">${[15, 10, 6].map(q => `<option value="${q}" ${(c.settings.nflQuarter || 15) === q ? 'selected' : ''}>${q} min</option>`).join('')}</select></label>` : ''}
    <div class="row" style="display:flex;gap:8px;margin-top:10px"><button class="primary" id="sSave">💾 Salvar agora</button><button id="sExport">Exportar JSON</button><button class="danger" id="sDel">Excluir carreira</button></div></div>
    <div class="panel"><div class="panel-h"><b>Dados</b></div><p class="muted">${esc(c.dataNote)}</p><p class="muted small">Seed: ${esc(c.seed)} · todas as decisões aleatórias são reprodutíveis a partir dela.</p></div></div>`;
  el.querySelector('#sName').onchange = e => { c.name = e.target.value; };
  el.querySelector('#sAuto').onchange = e => { c.settings.autosave = e.target.checked; };
  el.querySelector('#sEngine').onchange = e => { c.settings.engineGames = e.target.checked; };
  el.querySelector('#sQ') && (el.querySelector('#sQ').onchange = e => { c.settings.nflQuarter = +e.target.value; });
  el.querySelector('#sSave').onclick = () => save(true);
  el.querySelector('#sExport').onclick = () => { save(true); download(c.id); };
  el.querySelector('#sDel').onclick = () => { if (confirm('Excluir esta carreira definitivamente?')) { store.remove(c.id); S.c = null; location.hash = '#'; } };
}
// ---------- GM ----------
function tabContracts(el, c, spec) {
  const all = Object.values(c.players), list = C.teamPlayers(c, c.userTeam).sort((a, b) => (b.c?.sal || 0) - (a.c?.sal || 0));
  const pay = C.payroll(all, c.userTeam), cap = spec.cap;
  el.innerHTML = `<div class="panel"><div class="panel-h"><b>Folha salarial</b><small class="muted">${esc(cap.label)}</small></div>
    <p><span class="big">${money(pay)}</span> / ${money(cap.limit)} ${cap.kind === 'hard' ? `· espaço <b class="${pay > cap.limit ? 'bad' : 'good'}">${money(cap.limit - pay)}</b>` : `· ${pay > cap.limit ? `<b class="bad">acima do CBT: imposto ~${money((pay - cap.limit) * 0.2)}</b>` : `<b class="good">abaixo do CBT</b>`}`}</p>
    <p class="muted small">${c.sport === 'mlb' ? 'Pré-arbitragem (<3 anos de serviço) recebe o mínimo; arbitragem de 3 a 5 anos aumenta o salário a cada ano; free agency com 6+. Opções: até 3 temporadas podendo ir às menores sem waivers.' : c.sport === 'nhl' ? 'ELC de 3 anos para draftados; RFA (<27 anos e <7 de serviço) pode ser retido; UFA livre. Teto rígido.' : 'Contratos de novato de 4–5 anos; teto rígido; dispensar gera custo morto.'} Contratos dos atletas reais são estimados (sem dados de salário na fonte).</p>
    ${rosterRows(c, spec, list, { actions: p => `<button data-ext="${esc(p.id)}">${p.expiring ? 'Renovar ⚠' : 'Estender'}</button>${p.arb ? ' <small class="muted">arbitragem</small>' : ''}${p.rfa ? ' <small class="muted">RFA</small>' : ''}` })}</div>`;
  el.querySelectorAll('[data-ext]').forEach(b => b.onclick = () => negotiateDialog(c, spec, c.players[b.dataset.ext]));
}
function tabMarket(el, c, spec) {
  const others = c.teams.filter(t => t.abbr !== c.userTeam);
  S.ui.tradeTeam ||= others[0].abbr; S.ui.give ||= new Set(); S.ui.get ||= new Set();
  const mineL = C.teamPlayers(c, c.userTeam).filter(p => p.st !== 'PROSPECT').sort((a, b) => b.ovr - a.ovr), theirs = C.teamPlayers(c, S.ui.tradeTeam).sort((a, b) => b.ovr - a.ovr);
  const tinfo = C.teamInfo(spec, c, S.ui.tradeTeam), v = (p, t) => C.tradeValue(spec, p, t);
  const giveV = [...S.ui.give].reduce((a, id) => a + (c.players[id] ? v(c.players[id], tinfo) : 0), 0), getV = [...S.ui.get].reduce((a, id) => a + (c.players[id] ? v(c.players[id], tinfo) : 0), 0);
  const col = (list, set, key) => `<div class="scroll"><table class="tbl"><tr><th></th><th>Atleta</th><th>Pos</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">POT</th><th>Contrato</th><th class="num">Valor*</th></tr>${list.map(p => `<tr><td><input type="checkbox" data-${key}="${esc(p.id)}" ${set.has(p.id) ? 'checked' : ''}></td><td>${esc(p.n)}</td><td>${esc(p.pos)}</td><td class="num">${p.age}</td><td class="num">${ovr(p.ovr)}</td><td class="num">${p.pot}</td><td>${p.c ? `${money(p.c.sal)}×${p.c.yrs}` : ''}</td><td class="num">${v(p, tinfo).toFixed(0)}</td></tr>`).join('')}</table></div>`;
  const fas = C.freeAgents(c).sort((a, b) => b.ovr - a.ovr).slice(0, 60);
  el.innerHTML = `<div class="panel"><div class="panel-h"><b>Central de trocas</b><select id="trTeam">${others.map(t => `<option value="${t.abbr}" ${t.abbr === S.ui.tradeTeam ? 'selected' : ''}>${esc(t.name)} (${esc(t.mode)})</option>`).join('')}</select></div>
    <div class="trade-cols"><div><b>Você envia</b> <small class="muted">valor ${giveV.toFixed(0)}</small>${col(mineL, S.ui.give, 'give')}</div><div><b>Você recebe</b> <small class="muted">valor ${getV.toFixed(0)}</small>${col(theirs, S.ui.get, 'get')}</div></div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button class="primary" id="propose" ${S.ui.give.size && S.ui.get.size ? '' : 'disabled'}>Propor troca</button><small class="muted">* valor na visão do ${esc(S.ui.tradeTeam)} (${esc(tinfo.mode)}): idade, OVR agora vs potencial, contrato (excedente vs valor de mercado), necessidade de posição.</small></div></div>
    <div class="panel"><div class="panel-h"><b>Free agents</b><small class="muted">${C.freeAgents(c).length} disponíveis${c.phase === 'OFFSEASON' && c.off === 'FREE_AGENCY' ? ' · período de free agency' : ''}</small></div><div class="scroll"><table class="tbl"><tr><th>Atleta</th><th>Pos</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">POT</th><th>Pedido</th><th></th></tr>
      ${fas.map(p => { const a = C.contractAsk(spec, p, { freeAgent: true }); return `<tr><td>${esc(p.n)}${p.fict ? '<span class="fict">fictício</span>' : ''}</td><td>${esc(p.pos)}</td><td class="num">${p.age}</td><td class="num">${ovr(p.ovr)}</td><td class="num">${p.pot}</td><td>${money(a.sal)} × ${a.yrs}</td><td><button data-fa="${esc(p.id)}">Oferecer</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Nenhum agente livre.</td></tr>'}</table></div></div>`;
  el.querySelector('#trTeam').onchange = e => { S.ui.tradeTeam = e.target.value; S.ui.get = new Set(); renderDash(); };
  el.querySelectorAll('[data-give]').forEach(x => x.onchange = () => { x.checked ? S.ui.give.add(x.dataset.give) : S.ui.give.delete(x.dataset.give); renderDash(); });
  el.querySelectorAll('[data-get]').forEach(x => x.onchange = () => { x.checked ? S.ui.get.add(x.dataset.get) : S.ui.get.delete(x.dataset.get); renderDash(); });
  el.querySelector('#propose').onclick = () => { const r = C.proposeTrade(spec, c, { give: [...S.ui.give], get: [...S.ui.get], aiTeam: S.ui.tradeTeam }); toast(r.text, !r.ok); if (r.ok) { S.ui.give = new Set(); S.ui.get = new Set(); save(false); } renderDash(); };
  el.querySelectorAll('[data-fa]').forEach(b => b.onclick = () => { const p = c.players[b.dataset.fa], a = C.contractAsk(spec, p, { freeAgent: true }); const sal = prompt(`${p.n} pede ${money(a.sal)} × ${a.yrs}. Salário anual (M):`, a.sal); if (sal == null) return; const yrs = prompt('Anos:', a.yrs); if (yrs == null) return; const r = C.signFreeAgent(spec, c, p.id, { sal: +sal, yrs: +yrs }); toast(r.text, !r.ok); renderDash(); });
}
function tabDraft(el, c, spec) {
  const d = c.draft, active = c.phase === 'OFFSEASON' && c.off === 'DRAFT' && d && !d.done;
  const pool = C.draftPool(c).sort((a, b) => (b.pot * 0.65 + b.ovr * 0.35) - (a.pot * 0.65 + a.ovr * 0.35));
  const slot = active ? d.picks[d.cursor] : null, onClock = slot && slot.team === c.userTeam;
  const fog = p => Math.max(1, 12 - (p.scout || 6)); // scouting uncertainty
  el.innerHTML = `<div class="dash-grid"><div class="panel"><div class="panel-h"><b>Classe do draft ${c.season}</b><small class="muted">${pool.length} prospectos (fictícios) · notas com margem de scouting</small></div>
    ${active ? `<p>${onClock ? `<b class="good">Você está escolhendo:</b> ${slot.round}ª rodada, ${slot.overall}º geral.` : `Escolha atual: ${slot.overall}º — ${esc(slot.team)}`} <button id="dRun">Simular até a minha vez</button> <button id="dAuto">Auto-draft até o fim</button></p>` : `<p class="muted">${d?.done ? 'Draft encerrado.' : 'O draft acontece na offseason. Use a temporada para observar a classe.'}</p>`}
    <div class="scroll"><table class="tbl"><tr><th>#</th><th>Prospecto</th><th>Pos</th><th class="num">Idade</th><th>OVR (est.)</th><th>POT (est.)</th><th></th></tr>${pool.slice(0, 120).map((p, i) => `<tr class="${p.mine ? 'me' : ''}"><td>${i + 1}</td><td>${esc(p.n)}${p.mine ? ' ★' : ''}</td><td>${esc(p.pos)}</td><td class="num">${p.age}</td><td>${p.ovr - fog(p)}–${p.ovr + fog(p)}</td><td>${p.pot - fog(p)}–${Math.min(99, p.pot + fog(p))}</td><td>${onClock ? `<button class="primary" data-pick="${esc(p.id)}">Escolher</button>` : ''}</td></tr>`).join('')}</table></div></div>
    <div class="panel"><div class="panel-h"><b>Escolhas</b></div><div class="scroll"><table class="tbl"><tr><th>#</th><th>Time</th><th>Escolha</th></tr>${(d?.picks || []).slice(0, 160).map(s => `<tr class="${s.team === c.userTeam ? 'me' : ''}"><td>${s.overall}</td><td>${esc(s.team)}</td><td>${s.playerId ? esc(c.players[s.playerId]?.n || '—') : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Ordem definida ao fim da temporada (pior campanha escolhe primeiro).</td></tr>'}</table></div></div></div>`;
  el.querySelector('#dRun') && (el.querySelector('#dRun').onclick = () => { C.runDraft(spec, c); renderDash(); });
  el.querySelector('#dAuto') && (el.querySelector('#dAuto').onclick = () => { C.runDraft(spec, c, { auto: true }); renderDash(); });
  el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const s = C.draftPick(spec, c, b.dataset.pick); if (s) toast(`Você escolheu ${c.players[b.dataset.pick].n}.`); C.runDraft(spec, c); renderDash(); });
}
// ---------- PLAYER ----------
function tabMe(el, c, spec) {
  const me = c.players[c.me.id], st = C.meStage(spec, c), idx = spec.roadToPro.findIndex(s => s.key === c.me.stage);
  const line = me.ps?.gp ? spec.formatLine(me.ps) : me.mps?.gp ? `${spec.formatLine(me.mps)} (menores)` : '—';
  const amateur = st?.kind === 'amateur' && (me.t === 'AMATEUR');
  el.innerHTML = `<div class="dash-grid"><div>
    <div class="panel"><div class="panel-h"><b>Road to Pro</b></div><div class="stepper">${spec.roadToPro.map((s, i) => `<span class="${i === idx ? 'on' : i < idx ? 'done' : ''}">${esc(s.label)}</span>`).join('<span style="background:none">→</span>')}</div>
      <p>${amateur ? `Temporada ${c.me.stageYear}/${st.years} em ${esc(st.label)}. ${c.me.stock ? `Projeção de draft: <b>${esc(c.me.stock.label)}</b>.` : ''} ${me.age >= spec.draft.ageMin && !c.me.declare ? '<button id="declare">Declarar para o draft</button>' : c.me.declare ? '<b>Declarado para o draft.</b>' : `Elegível ao draft com ${spec.draft.ageMin} anos.`}` : me.t === 'DRAFT' ? 'Aguardando o draft.' : me.t === 'FA' ? 'Agente livre — veja propostas em Contrato.' : `${esc(tname(me.t))} · ${me.st === 'MIN' ? esc(me.lvl || 'ligas menores') : roleTxt(me.role)}`}</p></div>
    <div class="panel"><div class="panel-h"><b>${esc(me.n)}</b><small class="muted">#${esc(me.num)} · ${esc(me.pos)} · ${esc(me.arch || '')}</small></div>
      <p>${ovr(me.ovr)} OVR · POT ${me.pot} · ${me.age} anos ${me.dv ? `· última evolução ${me.dv > 0 ? '+' : ''}${me.dv}` : ''}</p><p>Temporada: <b>${esc(line)}</b></p>
      ${me.c ? `<p>Contrato: ${money(me.c.sal)} × ${me.c.yrs} ${esc(me.c.kind || '')}</p>` : ''}${me.drafted ? `<p class="muted">Draft ${me.drafted.year}: ${me.drafted.round}ª rodada, ${me.drafted.overall}º (${esc(me.drafted.team)})</p>` : ''}</div>
    <div class="panel"><div class="panel-h"><b>Diário</b></div>${(c.me.log || []).slice(0, 10).map(l => `<div class="goal">${esc(l)}</div>`).join('') || '<p class="muted">—</p>'}</div></div>
    <div><div class="panel"><div class="panel-h"><b>Metas</b></div>${goalsHtml(c)}</div><div class="panel"><div class="panel-h"><b>Notícias</b></div>${newsHtml(c.news, 12)}</div></div></div>`;
  el.querySelector('#declare') && (el.querySelector('#declare').onclick = () => { toast(C.declareForDraft(spec, c).text); renderDash(); });
}
function tabStats(el, c, spec) {
  const me = c.players[c.me.id], keys = spec.statKeys(me);
  const rows = [...(me.hist || []), ...(me.ps?.gp ? [{ s: c.season, t: me.t, ...me.ps, cur: true }] : []), ...(me.mps?.gp ? [{ s: c.season, t: `${me.t} (${me.lvl || 'menores'})`, ...me.mps, cur: true }] : [])];
  el.innerHTML = `<div class="panel"><div class="panel-h"><b>Estatísticas de ${esc(me.n)}</b></div><table class="tbl"><tr><th>Temp.</th><th>Time / nível</th>${keys.map(([, l]) => `<th class="num">${esc(l)}</th>`).join('')}<th>Resumo</th></tr>${rows.map(r => `<tr class="${r.cur ? 'me' : ''}"><td>${r.s}</td><td>${esc(r.t)}</td>${keys.map(([k]) => `<td class="num">${k === 'outs' ? `${Math.floor((r.outs || 0) / 3)}.${(r.outs || 0) % 3}` : r[k] ?? '—'}</td>`).join('')}<td><small class="muted">${esc(spec.formatLine(r))}</small></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Sem jogos ainda.</td></tr>'}</table></div>`;
}
function tabTraining(el, c, spec) {
  const FOCUS = [['balanced', 'Equilibrado', 'Evolução geral'], ['physical', 'Físico', 'Velocidade, força, resistência (+ risco de lesão leve)'], ['technical', 'Técnico', 'Fundamentos da posição'], ['mental', 'Mental', 'Leitura de jogo, consistência, clutch']];
  el.innerHTML = `<div class="panel"><div class="panel-h"><b>Plano de treino</b></div><div class="wiz-step">${FOCUS.map(([k, l, d]) => `<button class="pick ${c.me.focus === k ? 'on' : ''}" data-focus="${k}"><b>${l}</b><small>${d}</small></button>`).join('')}</div><p class="muted small">Jovens com potencial alto evoluem mais; tempo de jogo e foco aumentam a evolução da offseason.</p></div>`;
  el.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => { c.me.focus = b.dataset.focus; c.training.intensity = b.dataset.focus === 'physical' ? 1.3 : 1.1; toast('Plano de treino atualizado.'); renderDash(); });
}
function tabPlayerRelations(el, c, spec) {
  const me = c.players[c.me.id], team = me.t && !['AMATEUR', 'DRAFT', 'FA'].includes(me.t);
  const mates = team ? C.teamPlayers(c, me.t).filter(p => p !== me).sort((a, b) => b.ovr - a.ovr).slice(0, 10) : [];
  el.innerHTML = `<div class="dash-grid"><div class="panel"><div class="panel-h"><b>Técnico & diretoria</b></div>${me.rel ? `<p>Confiança do técnico: <b>${Math.round(me.rel.tr)}</b> · respeito ${Math.round(me.rel.rs)} · moral ${Math.round(me.rel.mo)} · satisfação ${Math.round(me.rel.sat)}</p>` : '<p class="muted">—</p>'}
    ${team ? '<button id="askPT">Pedir mais tempo de jogo</button> <button id="askTrade" class="danger">Pedir troca</button>' : ''}<p class="muted small">Pedidos gastam confiança; desempenho e treino a recuperam.</p></div>
    <div class="panel"><div class="panel-h"><b>Companheiros</b></div>${mates.map(p => `<div class="goal">${ovr(p.ovr)} ${esc(p.n)} <small class="muted">${esc(p.pos)} · ${roleTxt(p.role)}</small></div>`).join('') || '<p class="muted">—</p>'}</div></div>`;
  el.querySelector('#askPT') && (el.querySelector('#askPT').onclick = () => { toast(C.requestPlayingTime(spec, c).text); renderDash(); });
  el.querySelector('#askTrade') && (el.querySelector('#askTrade').onclick = () => { if (confirm('Pedir troca? Isso pode desgastar a relação com o time.')) { toast(C.requestTrade(spec, c).text); renderDash(); } });
}
function tabContract(el, c, spec) {
  const me = c.players[c.me.id], open = me.t === 'FA' || me.expiring;
  const offers = open ? C.playerOffers(spec, c) : [];
  el.innerHTML = `<div class="panel"><div class="panel-h"><b>Contrato</b><small class="muted">valor de mercado ~${money(C.marketValue(spec, me))}/ano</small></div>
    ${me.c ? `<p>Atual: ${money(me.c.sal)} × ${me.c.yrs} anos (${esc(me.c.kind || '')})${me.expiring ? ' — <b class="bad">vence nesta offseason</b>' : ''}</p>` : '<p class="muted">Sem contrato profissional (amador).</p>'}
    ${open ? `<table class="tbl"><tr><th>Time</th><th>Proposta</th><th>Papel previsto</th><th>Momento</th><th></th></tr>${offers.map((o, i) => `<tr><td>${esc(o.name)}</td><td>${money(o.sal)} × ${o.yrs}</td><td>${roleTxt(o.role)}</td><td>${esc(o.mode)}</td><td><button class="primary" data-offer="${i}">Assinar</button></td></tr>`).join('')}</table>` : '<p class="muted">Propostas aparecem quando o contrato vence ou como agente livre.</p>'}</div>`;
  el.querySelectorAll('[data-offer]').forEach(b => b.onclick = () => { C.acceptOffer(spec, c, offers[+b.dataset.offer]); save(false); renderDash(); });
}

route();
