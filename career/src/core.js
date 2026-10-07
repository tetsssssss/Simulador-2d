// Career Hub shared runtime: state, helpers, event delegation (ONE listener per event type, never removed), modal, toast, busy overlay,
// save plumbing, calendar runner. Screens/wizard/saves import from here; nothing here imports a screen (no cycles).
import * as A from '../../core/career/api.js';
import { setPending, takeResult, goTo } from '../../core/career/bridge.js';
import { getAvatar, setAvatar, hasCustomAvatar } from '../../core/render/avatars.js';
import { avatarThumb } from '../../core/ui/avatarEditor.js';

export { A, goTo };
export const store = A.createCareerStore();
export const SPORT_LABEL = { nfl: 'NFL', nhl: 'NHL', mlb: 'MLB' };
export const ROLE_LABEL = { COACH: 'Técnico', GM: 'Dirigente', PLAYER: 'Jogador' };
export const SPORT_ROUTE = { nfl: null, nhl: '#rink', mlb: '#diamond' };
export const KIT = { nfl: 'football', nhl: 'hockey', mlb: 'baseball' };
export const PHASE_LABEL = { PRESEASON: 'Pré-temporada', REGULAR: 'Temporada regular', PLAYOFFS: 'Playoffs', OFFSEASON: 'Offseason' };

// ---------- state ----------
export const S = {
  c: null, spec: null, screen: 'dashboard', busy: false, wiz: null, cleanup: null,
  ui: { sort: {}, tab: {}, filter: {}, opt: { stopOnEvents: true, autoFix: false, includeUser: false } },
  cache: { teams: {}, opts: {} }, lastAdv: null, autosaveAt: null, autosaveErr: null, dirty: false, migrated: null, modals: [],
};
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- safe formatting (never prints NaN / undefined) ----------
export const esc = v => {
  if (v == null) return '';
  if (typeof v === 'number' && !Number.isFinite(v)) return '—';
  return String(v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
};
export const isNum = v => v != null && v !== '' && Number.isFinite(+v);
export const nn = (v, d = '—') => (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v)) ? d : v);
export const fix = (v, dec = 0, d = '—') => (isNum(v) ? (+v).toFixed(dec) : d);
export const money = m => (isNum(m) ? `${(+m).toFixed(+m >= 10 ? 1 : 2)}M` : '—');
export const pct = (v, d = 0) => (isNum(v) ? `${(+v * 100).toFixed(d)}%` : '—');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ovrCls = v => (v >= 80 ? 'h' : v >= 68 ? 'm' : v < 55 ? 'l' : '');
export const ovrBadge = (v, range) => (range && range[0] !== range[1] ? `<span class="ovr f" title="estimativa: ${esc(range[0])}–${esc(range[1])}">${esc(range[0])}–${esc(range[1])}</span>` : `<span class="ovr ${ovrCls(v)}">${esc(nn(v))}</span>`);
export const potTxt = (p, range) => (range && range[0] !== range[1] ? `${esc(range[0])}–${esc(range[1])}` : esc(nn(p)));
export const tone = v => (v >= 60 ? 'good' : v >= 40 ? 'mid' : 'low');
export const meter = (label, value, { max = 100, sub = '', cls = '' } = {}) => {
  const v = isNum(value) ? +value : null, p = v == null ? 0 : clamp((v / max) * 100, 0, 100);
  return `<div class="meter ${cls || (v == null ? '' : tone(p))}" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${v == null ? 0 : Math.round(v)}"><span class="lbl">${esc(label)}</span><span class="bar"><i style="width:${p.toFixed(1)}%"></i></span><span class="val">${v == null ? '—' : Math.round(v)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>`;
};
export const chip = (t, cls = '') => `<span class="chip ${cls}">${esc(t)}</span>`;
export const posTag = p => `<span class="pos">${esc(p)}</span>`;
const lum = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export const crest = (abbr, color, size = '') => {
  const c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#2a3b52';
  return `<span class="crest ${size}" style="--c:${c};--fg:${lum(c) > 0.62 ? '#0a0f16' : '#fff'}" aria-hidden="true">${esc(abbr || '?')}</span>`;
};
export const teamObj = abbr => S.c?.teams.find(t => t.abbr === abbr);
export const tname = abbr => teamObj(abbr)?.name || abbr || '—';
export const tcolor = abbr => teamObj(abbr)?.color || '#2a3b52';
export const myAbbr = () => (S.c ? (S.c.userTeam || A.myTeam(S.c)) : null);
export const roleTxt = r => ({ S: 'Titular', R: 'Rotação', B: 'Reserva' }[r] || '—');
export const stTxt = (p) => (p.inj ? `🩹 ${esc(p.inj.type)} (${esc(p.inj.games)})` : p.st === 'MIN' ? esc(p.lvl || (S.spec?.sport === 'nfl' ? 'Practice squad' : 'Menores')) : p.st === 'IR' ? 'IR' : p.st === 'ACT' ? 'Ativo' : esc(nn(p.st)));
export const dateOnly = iso => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return '—'; } };

// ---------- toast / busy ----------
export function toast(text, bad = false) {
  const el = $('#toast'); if (!el) return;
  el.textContent = text; el.className = `toast show ${bad ? 'bad' : ''}`;
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 4200);
}
export function showBusy(title, text = '') { S.busy = true; const o = $('#overlay'); o.classList.add('show'); $('#ovTitle').textContent = title; $('#ovText').textContent = text; }
export function hideBusy() { S.busy = false; $('#overlay').classList.remove('show'); }
export async function withBusy(title, fn, text = '') { showBusy(title, text); await sleep(40); try { return await fn(); } finally { hideBusy(); } }

// ---------- event delegation ----------
export const ACT = {}, CHG = {}, INP = {};
export const on = (name, fn) => { ACT[name] = fn; };
export const onChange = (name, fn) => { CHG[name] = fn; };
export const onInput = (name, fn) => { INP[name] = fn; };
async function dispatch(table, attr, e) {
  const t = e.target.closest(`[${attr}]`); if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
  const fn = table[t.getAttribute(attr)]; if (!fn) return;
  try { await fn(t, e); } catch (err) { console.error(err); toast(`Erro: ${err.message}`, true); }
}
export function installDelegation() {
  if (installDelegation.done) return; installDelegation.done = true;
  document.addEventListener('click', e => { if (e.target.closest('[data-act]')) dispatch(ACT, 'data-act', e); });
  document.addEventListener('change', e => { if (e.target.closest('[data-chg]')) dispatch(CHG, 'data-chg', e); });
  document.addEventListener('input', e => { if (e.target.closest('[data-inp]')) dispatch(INP, 'data-inp', e); });
  // flush a pending autosave when the page is hidden / closed (single listeners, registered once)
  window.addEventListener('pagehide', () => flushSave());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
}

// ---------- modal ----------
// openModal({ title, html, actions:[{key,label,primary,danger,handler(ctx)}], wide, dismissable }) → Promise(key | null)
// A handler may return false to keep the dialog open; ctx = { el, body, form(), msg(text, kind), close(key) }.
export function openModal({ title, html = '', actions = [], wide = false, dismissable = true, onOpen = null, cls = '' }) {
  return new Promise(resolve => {
    const prev = document.activeElement, wrap = document.createElement('div');
    wrap.className = 'cs-modal';
    wrap.innerHTML = `<div class="cs-modal-card ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3>${dismissable ? '<button class="ghost" data-m="__close" aria-label="Fechar">✕</button>' : ''}</header><div class="cs-modal-body">${html}</div><div class="cs-modal-msg" role="status"></div><footer>${actions.map(a => `<button class="${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}" data-m="${esc(a.key)}">${esc(a.label)}</button>`).join('')}</footer></div>`;
    $('#modalRoot').appendChild(wrap);
    let done = false;
    const ctx = {
      el: wrap, body: $('.cs-modal-body', wrap),
      form() { const o = {}; $$('[name]', wrap).forEach(f => { o[f.name] = f.type === 'checkbox' ? f.checked : f.type === 'radio' ? (f.checked ? f.value : o[f.name]) : f.type === 'number' || f.type === 'range' ? (f.value === '' ? null : +f.value) : f.value; }); return o; },
      msg(text, kind = '') { const m = $('.cs-modal-msg', wrap); m.textContent = text || ''; m.className = `cs-modal-msg ${kind}`; },
      close(key = null) { if (done) return; done = true; wrap.removeEventListener('keydown', onKey); wrap.remove(); S.modals = S.modals.filter(m => m !== ctx); try { prev?.focus?.(); } catch { /* element gone */ } resolve(key); },
    };
    const onKey = e => {
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); ctx.close(null); return; }
      if (e.key !== 'Tab') return;
      const f = $$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', wrap).filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    wrap.addEventListener('keydown', onKey);
    wrap.addEventListener('click', async e => {
      if (e.target === wrap && dismissable) return ctx.close(null);
      const b = e.target.closest('[data-m]'); if (!b) return;
      const key = b.dataset.m; if (key === '__close') return ctx.close(null);
      const a = actions.find(x => x.key === key);
      if (a?.handler) { b.disabled = true; let r; try { r = await a.handler(ctx); } catch (err) { console.error(err); ctx.msg(err.message, 'bad'); r = false; } b.disabled = false; if (r === false) return; }
      ctx.close(key);
    });
    S.modals.push(ctx);
    onOpen?.(ctx);
    (wrap.querySelector('[data-autofocus]') || wrap.querySelector('footer button.primary') || wrap.querySelector('footer button') || wrap.querySelector('button'))?.focus();
  });
}
export const closeModals = () => { for (const m of [...S.modals]) m.close(null); };
export const confirmBox = (title, text, { ok = 'Confirmar', danger = false } = {}) => openModal({ title, html: `<p>${esc(text)}</p>`, actions: [{ key: 'no', label: 'Cancelar' }, { key: 'ok', label: ok, primary: !danger, danger }] }).then(k => k === 'ok');

// ---------- navigation / render ----------
export const SCREENS = {};
export const registerScreen = (key, def) => { SCREENS[key] = def; };
export const careerHash = (screen = S.screen, id = S.c?.id) => `#c/${encodeURIComponent(id)}/${screen}`;
export const go = screen => { if (!S.c) return; if (location.hash === careerHash(screen)) return refresh(); location.hash = careerHash(screen); };
let renderCareerFn = null;
export const setRenderer = fn => { renderCareerFn = fn; };
export function refresh() {
  if (!S.c || !renderCareerFn) return;
  const fo = document.activeElement, fid = fo?.dataset?.fid, caret = fo && 'selectionStart' in fo ? [fo.selectionStart, fo.selectionEnd] : null;
  const y = window.scrollY, hubScroll = $('#hub')?.scrollTop;
  renderCareerFn();
  if (fid) { const n = document.querySelector(`[data-fid="${fid}"]`); if (n) { n.focus(); if (caret && n.setSelectionRange) try { n.setSelectionRange(caret[0], caret[1]); } catch { /* not text */ } } }
  window.scrollTo(0, y); if (hubScroll) $('#hub').scrollTop = hubScroll;
}
// avatars (canvas) need a DOM mount after innerHTML
export function mountAvatars(root = document) {
  $$('[data-av]', root).forEach(el => {
    if (el.firstChild) return;
    try { const o = JSON.parse(el.dataset.av); const cv = avatarThumb({ sport: o.sport, id: o.id, color: o.color, color2: '#ffffff', number: o.num, kit: KIT[o.sport], prop: 'none', size: o.size || 64 }); cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv); } catch (err) { console.warn('avatar', err); }
  });
}
export const avSlot = (id, { size = 64, num = '' } = {}) => `<span class="p-av" data-av='${esc(JSON.stringify({ sport: S.c.sport, id, color: tcolor(myAbbr()), num, size }))}'></span>`;
export function ensureAvatar(c) { // created player: the appearance stored in the save drives the shared avatar store
  if (c.role !== 'PLAYER' || !c.me) return;
  const me = c.players[c.me.id];
  if (me?.appearance && Object.keys(me.appearance).length && !hasCustomAvatar(c.sport, me.id)) setAvatar(c.sport, me.id, { ...getAvatar(c.sport, me.id), ...me.appearance });
}

// ---------- saves ----------
export function saveNow(manual = false) {
  const c = S.c; if (!c) return null;
  clearTimeout(S.autoT);
  try {
    const r = manual ? store.save(c) : store.autosave(c);
    S.dirty = false; S.autosaveAt = Date.now(); S.autosaveErr = null; S.lastBytes = r.bytes; paintAutosave();
    if (manual) toast(`Carreira salva (${(r.bytes / 1024).toFixed(0)} KB).`);
    return r;
  } catch (e) {
    S.autosaveErr = e.message; paintAutosave();
    toast(e.code === 'QUOTA' ? `Armazenamento cheio: exporte e apague carreiras antigas (${e.message})` : `Falha ao salvar: ${e.message}`, true);
    return null;
  }
}
export function touch() { S.dirty = true; clearTimeout(S.autoT); if (S.c && S.c.settings?.autosave !== false) S.autoT = setTimeout(() => saveNow(false), 900); paintAutosave(); }
export function flushSave() { if (S.c && S.dirty && S.c.settings?.autosave !== false) saveNow(false); }
export function paintAutosave() {
  const el = $('#autoInd'); if (!el) return;
  const off = S.c?.settings?.autosave === false;
  el.className = `autosave ${S.autosaveErr ? 'err' : S.dirty || off ? '' : 'ok'}`;
  el.innerHTML = `<i></i><span>${S.autosaveErr ? 'Falha no autosave' : off ? 'Autosave desligado' : S.dirty ? 'Alterações pendentes…' : S.autosaveAt ? `Autosave ${new Date(S.autosaveAt).toLocaleTimeString('pt-BR')}` : 'Autosave ligado'}</span>`;
}
export function closeCareer({ discard = false } = {}) { if (!discard) flushSave(); clearTimeout(S.autoT); S.dirty = false; S.cleanup?.(); S.cleanup = null; closeModals(); S.c = null; S.spec = null; S.lastAdv = null; S.ui.trade = null; document.body.classList.remove('in-career'); }

// ---------- opening a career (load → migrate notice → attach spec → apply 2D result) ----------
export async function openCareer(id, { slot } = {}) {
  const r = store.load(id, slot ? { slot } : {});
  if (r.status !== 'ok') return { ok: false, status: r.status, error: r.error || 'Carreira não encontrada.' };
  try {
    const spec = await A.loadSpec(r.save.sport);
    let c = r.save.career;
    if (c.legacyNfl && !c.players) { // NFL v0.5 slot imported → rebuild the league around it (the NFL slot stays untouched)
      const L = c.legacyNfl;
      c = await A.createCareer(spec, { role: 'GM', team: L.team, name: L.name, seed: L.seed || `LEG${L.team}` });
      c.id = r.save.id; c.legacyNfl = L;
      store.save(c);
    }
    A.attachSpec(c, spec);
    await spec.ensureRuntime?.(c);
    S.c = c; S.spec = spec; store.setActive(c.id); ensureAvatar(c);
    S.migrated = r.migrated ? { from: r.save.migratedFrom ?? 2, to: A.CAREER_SAVE_VERSION, backup: `asu_career_${c.id}_backup_v${c.x?.migratedFrom ?? 2}` } : null;
    S.lastAdv = null; S.dirty = false; S.ui.trade = null; S.loadedFrom = r.from;
    return { ok: true, migrated: !!r.migrated };
  } catch (e) { console.error(e); return { ok: false, status: 'error', error: e.message }; }
}
// A game played in the Partida 2D view comes back here and replaces the simulation of that game.
export async function applyResultFrom2D() {
  const c = S.c, spec = S.spec; if (!c) return;
  const r = takeResult(c.id); if (!r) return;
  if (!A.pendingGameDay(spec, c) || A.nextGameInfo(spec, c)?.key !== r.key) { toast('O resultado do 2D não corresponde ao jogo atual da carreira e foi descartado.', true); return; }
  const map = spec.rawIdMap(c, [r.h, r.a]);
  c.extResult = { ...r, lines: (r.lines || []).map(([pid, l]) => [map.get(String(pid)), l]).filter(x => x[0]) };
  await withBusy('Aplicando o resultado do jogo 2D…', async () => { await A.playUserGame(spec, c); });
  S.lastAdv = { mode: 'GAME', res: { stopped: 'PLAYED', days: 0, played: [], events: [] }, note: `Jogo do 2D aplicado: ${r.a} ${r.as} @ ${r.h} ${r.hs}.` };
  saveNow(false);
  toast(`Resultado do 2D aplicado: ${r.a} ${r.as} @ ${r.h} ${r.hs}.`);
}
export async function play2D() {
  const c = S.c, spec = S.spec, next = A.nextGameInfo(spec, c);
  if (!next || !A.pendingGameDay(spec, c)) return toast('O jogo do seu time ainda não é hoje: use “Próximo jogo”.', true);
  if (!spec.rostersFor2D || !SPORT_ROUTE[c.sport]) return toast('Este esporte não tem ponte 2D: use “Simular jogo”.', true);
  const rosters = await withBusy('Preparando a partida 2D…', () => spec.rostersFor2D(c, next.h, next.a));
  const engineConfig = { home: A.engineConfig(spec, c, next.h), away: A.engineConfig(spec, c, next.a) };
  setPending({ careerId: c.id, careerName: c.name, sport: c.sport, h: next.h, a: next.a, key: next.key, seed: `${c.seed}-${next.key}-${next.h}${next.a}`, rosters, engineConfig });
  saveNow(false); goTo(c.sport, SPORT_ROUTE[c.sport]);
}

// ---------- calendar runner ----------
export const STOP_TXT = {
  USER_GAME: 'Parou antes do jogo do seu time.', PLAYED: 'Seu jogo foi disputado.', EVENT: 'Um evento da carreira pede a sua decisão.', FIRED: 'Você foi demitido: veja as propostas.',
  DRAFT_PICK: 'É a sua vez no draft.', ILLEGAL_ROSTER: 'Elenco/teto ilegal em dia de jogo: corrija antes de continuar.', MAX_DAYS: 'Limite de dias do avanço atingido.',
};
export const stopText = res => (res?.stopped ? STOP_TXT[res.stopped] || res.stopped : 'Destino alcançado.');
export function userResultsText(res) {
  const me = A.myTeam(S.c); if (!me || !res?.played) return [];
  return res.played.flatMap(p => p.user.map(u => { const home = u.h === me, hs = u.r?.[0], as = u.r?.[1], us = home ? hs : as, them = home ? as : hs, won = us > them; return `${won ? 'V' : 'D'} ${nn(us)}–${nn(them)} ${home ? 'vs' : '@'} ${tname(home ? u.a : u.h)}${u.ot ? ' (OT)' : ''}`; }));
}
export async function runAdvance(mode, extra = {}) {
  const c = S.c, spec = S.spec; if (!c || S.busy) return null;
  const noGames = c.role === 'PLAYER' && !A.myTeam(c);
  const o = S.ui.opt, opts = { stopOnEvents: o.stopOnEvents, autoFix: o.autoFix, includeUserGame: o.includeUser, maxDays: mode === 'NEXT_GAME' ? (noGames ? 45 : 500) : 500, ...extra };
  const label = { NEXT_DAY: 'Avançando 1 dia…', NEXT_WEEK: 'Avançando 1 semana…', NEXT_GAME: 'Avançando até o próximo jogo…' }[mode] || 'Simulando…';
  showBusy(label, 'treino, finanças, scouting, lesões, trocas e notícias');
  await sleep(40);
  let res = null;
  try { res = await A.advance(spec, c, mode, opts); } catch (e) { console.error(e); toast(`Erro na simulação: ${e.message}`, true); }
  hideBusy();
  if (res) S.lastAdv = { mode, res, at: Date.now() };
  S.dirty = true; if (c.settings?.autosave !== false) saveNow(false); else paintAutosave();
  refresh();
  if (res) {
    const lines = userResultsText(res); if (lines.length) toast(lines.slice(-2).join(' · '));
    await afterAdvance(res);
  }
  return res;
}
export async function afterAdvance(res) {
  const c = S.c;
  if (res.stopped === 'FIRED' || c.fired) { toast('Você foi demitido pela diretoria.', true); go('profile'); return; }
  if (res.stopped === 'DRAFT_PICK') { go('draft'); }
  if (res.stopped === 'ILLEGAL_ROSTER') {
    const k = await openModal({ title: 'Elenco ilegal em dia de jogo', html: `<p>O jogo não pode ser disputado até corrigir:</p><ul class="reasons">${(res.issues || []).map(i => `<li>${esc(i.text)}</li>`).join('')}</ul><p class="muted small">“Corrigir e continuar” ajusta o elenco automaticamente (dispensa/promoção) e segue até o jogo.</p>`, actions: [{ key: 'roster', label: 'Abrir elenco' }, { key: 'fix', label: 'Corrigir e continuar', primary: true }] });
    if (k === 'fix') return runAdvance(res.mode === 'NEXT_DAY' || res.mode === 'NEXT_WEEK' || res.mode === 'NEXT_GAME' ? res.mode : 'NEXT_GAME', { autoFix: true });
    if (k === 'roster') go('roster');
    return;
  }
  if (c.x.events.pending.length) await openEvents();
}
export async function playGameNow() {
  const c = S.c, spec = S.spec; if (!c || S.busy) return;
  if (!A.pendingGameDay(spec, c) || !A.nextGameInfo(spec, c)) return toast('Não há jogo do seu time hoje.', true);
  let r = null;
  await withBusy('Simulando o jogo do seu time…', async () => { r = await A.playUserGame(spec, c); }, c.settings.engineGames ? 'motor real do esporte' : 'modelo rápido');
  if (!r?.ok) return toast(r?.text || 'Não foi possível jogar agora.', true);
  const lines = userResultsText({ played: r.played });
  S.lastAdv = { mode: 'GAME', res: { stopped: 'PLAYED', days: 0, played: r.played, events: [] }, note: lines.join(' · ') };
  S.dirty = true; saveNow(false); toast(lines.join(' · ') || 'Jogo disputado.'); refresh();
  if (c.x.events.pending.length) await openEvents();
}

// ---------- career events (modal with choices and consequences) ----------
export async function openEvents() {
  const c = S.c, spec = S.spec;
  while (c && c.x.events.pending.length) {
    const ev = c.x.events.pending[0];
    const facts = Object.entries(ev.facts || {}).filter(([, v]) => v != null && typeof v !== 'object').slice(0, 6).map(([k, v]) => chip(`${k}: ${v}`, 'blue')).join('');
    const pend = c.x.events.pending.length;
    const k = await openModal({
      title: ev.title, dismissable: true, cls: 'ev', wide: false,
      html: `<p class="muted small">Evento ${esc(ev.type)} · ${pend} pendente(s)</p><p>${esc(ev.text)}</p>${facts ? `<div class="chips">${facts}</div>` : ''}<div class="stack">${ev.choices.map(ch => `<button class="ev-choice" data-m="${esc(ch.key)}"><b>${esc(ch.label)}</b>${ch.hint ? `<small>${esc(ch.hint)}</small>` : ''}</button>`).join('')}</div>`,
      actions: [{ key: '__later', label: 'Decidir depois' }, { key: '__auto', label: 'Deixar o assistente decidir' }],
    });
    if (k == null || k === '__later') break;
    const key = k === '__auto' ? ev.auto : k;
    const r = A.resolveEvent(spec, c, ev.id, key);
    touch();
    if (!r.ok) { toast(r.text, true); break; }
    const more = c.x.events.pending.length;
    const kk = await openModal({ title: 'Consequências', html: `<p><b>${esc(ev.title)}</b></p><p>${esc(r.text)}</p>`, actions: [...(more ? [{ key: 'next', label: `Próximo evento (${more})`, primary: true }] : []), { key: 'ok', label: 'Fechar', primary: !more }] });
    refresh();
    if (kk !== 'next') break;
  }
  refresh();
}

// ---------- tables ----------
export function sortRows(tbl, rows, cols, def) {
  const st = S.ui.sort[tbl] || def, col = cols.find(c => c.k === st.k) || cols[0];
  const val = r => { const v = col.val ? col.val(r) : r[col.k]; return v == null || (typeof v === 'number' && !Number.isFinite(v)) ? (st.dir > 0 ? Infinity : -Infinity) : v; };
  return [...rows].sort((a, b) => { const x = val(a), y = val(b); const r = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), 'pt-BR') : x - y; return r * st.dir; });
}
export function thead(tbl, cols, def) {
  const st = S.ui.sort[tbl] || def;
  return `<tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}" scope="col" ${c.k === st.k ? `aria-sort="${st.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.sort === false ? esc(c.label) : `<button class="th-btn" data-act="sort" data-tbl="${tbl}" data-k="${c.k}" data-def="${def.dir}">${esc(c.label)}${c.k === st.k ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`}</th>`).join('')}</tr>`;
}
on('sort', el => { const t = el.dataset.tbl, cur = S.ui.sort[t]; const k = el.dataset.k; S.ui.sort[t] = { k, dir: cur?.k === k ? -cur.dir : (k === 'n' || k === 'pos' || k === 'name' ? 1 : -1) }; refresh(); });

// ---------- misc widgets ----------
export function curveSvg(points, { w = 280, h = 110, peak = null, color = '#2fe08f', label = '', mini = false } = {}) {
  if (!points?.length) return '';
  const xs = points.map(p => p.age), ys = points.map(p => p.ovr), x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.floor(Math.min(...ys) / 5) * 5 - 2, hi = Math.ceil(Math.max(...ys) / 5) * 5 + 2;
  const px = a => 6 + ((a - x0) / Math.max(1, x1 - x0)) * (w - 12), py = v => h - 14 - ((v - lo) / Math.max(1, hi - lo)) * (h - 24);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.age).toFixed(1)},${py(p.ovr).toFixed(1)}`).join(' ');
  const pk = peak || points.reduce((b, p) => (p.ovr > b.ovr ? p : b), points[0]);
  return `<svg class="curve-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label || 'Curva de crescimento')}: pico ${esc(pk.ovr)} aos ${esc(pk.age)} anos"><rect width="${w}" height="${h}" rx="6" fill="#0a121c"/>${mini ? '' : [0, 1, 2, 3].map(i => `<line x1="6" x2="${w - 6}" y1="${(10 + i * ((h - 24) / 3)).toFixed(1)}" y2="${(10 + i * ((h - 24) / 3)).toFixed(1)}" stroke="#1c2a3b"/>`).join('')}<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${px(pk.age).toFixed(1)}" cy="${py(pk.ovr).toFixed(1)}" r="3.6" fill="#f6c453"/>${mini ? '' : `<text x="6" y="${h - 3}" fill="#8295aa" font-size="9">${x0} anos</text><text x="${w - 6}" y="${h - 3}" fill="#8295aa" font-size="9" text-anchor="end">${x1}</text><text x="${px(pk.age).toFixed(1)}" y="${Math.max(10, py(pk.ovr) - 7).toFixed(1)}" fill="#f6c453" font-size="9.5" text-anchor="middle" font-weight="700">${esc(pk.ovr)}</text>`}</svg>`;
}
export const fogNote = r => (r.ovrRange ? `<span class="est" title="Ratings estimados (fog of war): conhecimento ${esc(r.know)}%">${esc(r.know)}%</span>` : '');
export const issuesHtml = lg => (lg && lg.issues?.length ? `<div>${lg.issues.map(i => `<div class="alert warn">⚠ ${esc(i.text)}</div>`).join('')}</div>` : '');
export function pageTitle(text, right = '') { return `<div class="page-title"><h2>${esc(text)}</h2><span class="grow"></span>${right}</div>`; }
export const panel = (title, body, right = '', cls = '') => `<section class="panel ${cls}"><div class="panel-h"><b>${esc(title)}</b><span>${right}</span></div>${body}</section>`;
export function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const subTabs = (id, tabs, cur) => `<div class="subtabs" role="group" aria-label="Seções">${tabs.map(([k, l]) => `<button data-act="subtab" data-id="${id}" data-k="${k}" aria-pressed="${k === cur}" class="${k === cur ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
on('subtab', el => { S.ui.tab[el.dataset.id] = el.dataset.k; refresh(); });
export const tabOf = (id, def) => S.ui.tab[id] || def;
export const result = (r, okText = '') => { toast(r?.text || okText || (r?.ok ? 'Feito.' : 'Não foi possível.'), r && r.ok === false); if (r?.ok !== false) touch(); return r; };
