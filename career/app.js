// Career Hub — one place for every career of the universe (NFL / NHL / MLB × Técnico / Dirigente / Jogador).
// Routes:  #  careers list · #new wizard · #c/<id>/<screen> career (dashboard, calendar, team, roster, ...).
// All sport logic lives in core/career (single entry core/career/api.js); this file is the shell: router, sidebar, header,
// calendar action bar. Screens live in career/src/screens/*.js and register themselves with registerScreen().
import { A, S, $, esc, nn, fix, toast, on, openCareer, applyResultFrom2D, installDelegation, setRenderer, SCREENS, go, saveNow, flushSave, closeCareer, closeModals, paintAutosave, mountAvatars, showBusy, hideBusy,
  runAdvance, playGameNow, play2D, openEvents, crest, tcolor, tname, myAbbr, SPORT_LABEL, ROLE_LABEL, PHASE_LABEL, SPORT_ROUTE, stopText, userResultsText, careerHash, touch, sleep } from './src/core.js';
import { renderWizard } from './src/wizard.js';
import { renderList, renderLoadError } from './src/saves.js';
import './src/screens/dashboard.js';
import './src/screens/team.js';
import './src/screens/staff.js';
import './src/screens/tactics.js';
import './src/screens/market.js';
import './src/screens/world.js';

// ---------- navigation per role ----------
const GAME = ['Jogo', [['dashboard', 'Painel', '🏠'], ['calendar', 'Calendário', '📅'], ['team', 'Time', '🏟️'], ['roster', 'Elenco', '👥']]];
const WORLD = ['Mundo', [['news', 'Notícias', '📰'], ['history', 'Histórico', '🏆'], ['profile', 'Perfil da carreira', '🪪'], ['saves', 'Save & ajustes', '💾']]];
export const NAV = {
  COACH: [GAME, ['Comissão', [['staff', 'Comissão técnica', '🧑‍🏫'], ['training', 'Treino', '🏋️'], ['tactics', 'Táticas', '📋']]], ['Front office', [['contracts', 'Contratos', '💼'], ['transactions', 'Transações', '🔁'], ['scouting', 'Scouting', '🔭'], ['draft', 'Draft', '🎯']]], WORLD],
  GM: [GAME, ['Comissão', [['staff', 'Comissão técnica', '🧑‍🏫'], ['training', 'Treino', '🏋️'], ['tactics', 'Táticas (auto)', '📋']]], ['Front office', [['contracts', 'Contratos & teto', '💼'], ['transactions', 'Transações', '🔁'], ['scouting', 'Scouting', '🔭'], ['draft', 'Draft', '🎯']]], WORLD],
  PLAYER: [['Jogo', [['dashboard', 'Painel', '🏠'], ['calendar', 'Calendário', '📅'], ['development', 'Desenvolvimento', '📈'], ['team', 'Meu clube', '🏟️'], ['roster', 'Elenco', '👥']]], ['Carreira', [['contracts', 'Contrato & agente', '💼'], ['draft', 'Draft & caminho', '🎯']]], WORLD],
};
export const navKeys = role => NAV[role].flatMap(([, items]) => items.map(i => i[0]));

// ---------- career shell ----------
function renderCareer() {
  const c = S.c, spec = S.spec;
  S.cleanup?.(); S.cleanup = null;
  document.body.classList.add('in-career');
  $('#hubNav').innerHTML = '';
  if (!navKeys(c.role).includes(S.screen)) S.screen = 'dashboard';
  const d = (S.dash = A.getDashboardView(c));
  const h = d.header, me = c.role === 'PLAYER' ? c.players[c.me.id] : null, abbr = myAbbr(), next = d.nextGame, today = d.gameToday && !!next;
  const can2d = today && spec.rostersFor2D && SPORT_ROUTE[c.sport];
  const pend = c.x.events.pending.length;
  const nav = NAV[c.role].map(([sec, items]) => `<div class="nav-sec">${esc(sec)}</div>${items.map(([k, l, ic]) => `<a href="${careerHash(k)}" ${k === S.screen ? 'aria-current="page"' : ''} data-nav="${k}"><span class="ic" aria-hidden="true">${ic}</span>${esc(l)}${k === 'news' && pend ? `<span class="bdg" title="${pend} evento(s) pendente(s)">${pend}</span>` : ''}</a>`).join('')}`).join('');
  const sub = c.role === 'PLAYER' ? `${me.n} (${me.pos}) · ${abbr ? tname(abbr) : (d.header.team ? '' : 'sem clube · ' + (A.getProfileView(c).stage || ''))}` : tname(abbr);
  const bigBox = c.role === 'PLAYER'
    ? `<span class="big">${esc(nn(me.ovr))}</span> <small class="muted">OVR · POT ${esc(nn(me.pot))} · ${esc(nn(me.age))} anos</small>`
    : `<span class="big">${esc(nn(h.record, '0-0'))}</span> <small class="muted">${h.confRank ? `#${esc(h.confRank)} na conferência` : ''}</small>`;
  const adv = S.lastAdv;
  let note = '';
  if (today) note = `<div class="adv-note warn" role="status">🏟️ Jogo do seu time ${next.home ? 'em casa' : 'fora'}: <b>${esc(next.a)} @ ${esc(next.h)}</b> — ${can2d ? 'jogue no 2D ou simule o jogo' : 'simule o jogo'}.</div>`;
  else if (adv) {
    const lines = adv.note ? [adv.note] : userResultsText(adv.res);
    const bad = adv.res.stopped === 'FIRED' || adv.res.stopped === 'ILLEGAL_ROSTER';
    note = `<div class="adv-note ${bad ? 'bad' : adv.res.stopped === 'EVENT' || adv.res.stopped === 'DRAFT_PICK' ? 'warn' : ''}" role="status" id="advNote">${adv.res.days ? `Avançou ${esc(adv.res.days)} dia(s). ` : ''}${esc(adv.mode === 'GAME' ? '' : adv.res.stopped ? stopText(adv.res) : 'Destino alcançado.')}${lines.length ? ` <b>${esc(lines.slice(-3).join(' · '))}</b>` : ''}</div>`;
  }
  const banners = [
    S.migrated ? `<div class="notice warn">⚠ Save migrado para a versão ${esc(S.migrated.to)} (original mantido em backup). <a href="${careerHash('saves')}">Detalhes</a></div>` : '',
    c.fired ? `<div class="notice bad" role="alert">Você foi demitido. <a href="${careerHash('profile')}">Veja as propostas de emprego</a>.</div>` : '',
    pend ? `<div class="notice" role="status">📨 ${pend} evento(s) da carreira aguardando decisão. <button data-act="open-events">Decidir agora</button></div>` : '',
  ].join('');
  $('#hub').innerHTML = `<div class="cs-shell"><nav class="cs-nav" aria-label="Telas da carreira">${nav}</nav>
    <div class="cs-main">
      <header class="dash-head" style="--tc:${esc(abbr ? tcolor(abbr) : '#1b2a3c')}">${crest(abbr || 'ME', abbr ? tcolor(abbr) : '#2a3b52', 'lg')}
        <div><h2>${esc(c.name)}</h2><div class="dash-meta"><span class="chip-role">${esc(SPORT_LABEL[c.sport])}</span><span class="chip-role">${esc(ROLE_LABEL[c.role])}</span><small class="muted">${esc(sub)}</small></div>
          <small class="muted">${esc(h.date)}${h.phase === 'OFFSEASON' ? '' : ` · ${esc(PHASE_LABEL[h.phase] || h.phase)}`} · temporada ${esc(h.season)}${h.team ? ` · reputação ${esc(h.rep)}` : ''} · ${esc(h.difficulty)}</small></div>
        <div class="big-wrap">${bigBox}</div></header>
      <div class="cs-actionbar" role="toolbar" aria-label="Calendário e save">
        <button id="advDay" data-act="adv" data-adv="NEXT_DAY" aria-label="Avançar para o próximo dia (NEXT DAY)" title="NEXT_DAY">Próximo dia</button>
        <button id="advWeek" data-act="adv" data-adv="NEXT_WEEK" aria-label="Avançar uma semana (NEXT WEEK)" title="NEXT_WEEK">Próxima semana</button>
        <button id="advBtn" class="primary" data-act="adv" data-adv="NEXT_GAME" aria-label="Avançar até o próximo jogo (NEXT GAME)" title="NEXT_GAME">Próximo jogo ▶</button>
        ${today ? `${can2d ? '<button id="play2d" data-act="play2d" title="Joga o próximo jogo do seu time na Partida 2D com o motor real; o resultado volta para a carreira">🎮 Jogar no 2D</button>' : ''}<button id="playGame" data-act="play-game" title="Simula o jogo agora${c.settings.engineGames ? ' com o motor real' : ''}">⚡ Simular jogo</button>` : ''}
        <span class="grow"></span><span id="autoInd" class="autosave" aria-live="polite"></span>
        <button id="saveBtn" data-act="save-manual" title="Salva um slot manual">💾 Salvar</button><button id="toList" data-act="to-list">← Carreiras</button></div>
      ${banners}${note}
      <main id="screen" aria-live="off"></main></div></div>`;
  S.cleanup = (SCREENS[S.screen] || SCREENS.dashboard).render($('#screen'), d) || null;
  mountAvatars($('#hub')); paintAutosave();
  document.title = `${SCREENS[S.screen]?.title || 'Painel'} · ${c.name} — Career Hub`;
}
setRenderer(renderCareer);

on('adv', el => runAdvance(el.dataset.adv));
on('play2d', () => play2D());
on('play-game', () => playGameNow());
on('open-events', () => openEvents());
on('save-manual', () => { saveNow(true); });
on('to-list', () => { flushSave(); closeCareer(); location.hash = '#'; });

// ---------- router ----------
let seq = 0;
async function route() {
  const my = ++seq;
  closeModals();
  const h = location.hash;
  if (/^#new/.test(h)) { if (S.c) closeCareer(); return renderWizard(); }
  const m = h.match(/^#c\/([^/]+)\/?([\w-]*)/);
  if (m) {
    const id = decodeURIComponent(m[1]); let screen = m[2] || 'dashboard'; if (screen === 'overview') screen = 'dashboard';
    if (!S.c || S.c.id !== id) {
      if (S.c) closeCareer();
      showBusy('Carregando carreira…', 'lendo o save e preparando a liga'); await sleep(30);
      const r = await openCareer(id, { slot: S.slotPref }); S.slotPref = null;
      hideBusy();
      if (my !== seq) return;
      if (!r.ok) { if (r.status === 'missing') toast('Carreira não encontrada.', true); return renderLoadError(id, r); }
      if (r.migrated) toast(`Save migrado para v${A.CAREER_SAVE_VERSION} (backup do original mantido).`);
      const had = S.c.extResult || null; void had;
      await applyResultFrom2D();
      if (my !== seq) return;
    }
    S.screen = SCREENS[screen] ? screen : 'dashboard';
    renderCareer();
    return;
  }
  if (S.c) closeCareer();
  renderList();
}
window.addEventListener('hashchange', route);
installDelegation();
window.__career = { S, A, go, touch, navKeys, NAV }; // debugging / browser tests
route();
