// New career wizard: 1 sport → 2 role → 3 team (cards) OR player creator → 4 difficulty → 5 start (saves the career).
// Data comes from core/career/flow.js (getSports / getRoles / getTeams / getDifficulties / getPlayerOptions / validateFlow / startCareer).
import { A, S, store, $, $$, esc, nn, fix, toast, showBusy, hideBusy, sleep, on, onChange, onInput, crest, meter, curveSvg, clamp, SPORT_LABEL, KIT, ensureAvatar, careerHash, mountAvatars, chip } from './core.js';
import { openAvatarEditor, avatarThumb } from '../../core/ui/avatarEditor.js';
import { getAvatar, setAvatar, resetAvatar, randomAvatar } from '../../core/render/avatars.js';

const TMP_AV = '__wizard__';
const POT_BY_TALENT = { raro: 92, alto: 86, medio: 78 };
const SPORT_BLURB = { nfl: 'Futebol americano · 32 franquias · 17 jogos + playoffs · teto salarial rígido.', nhl: 'Hóquei · 32 times · 82 jogos · Stanley Cup · teto rígido, ELC/RFA/UFA, AHL.', mlb: 'Beisebol · 30 times · 162 jogos · CBT, 40-man, ligas menores e arbitragem.' };
const OUTLOOK = { contender: 'Favorito', middle: 'Meio da tabela', rebuild: 'Reconstrução' };
const hub = () => $('#hub');

export const newWiz = () => ({ step: 0, sport: null, role: null, team: null, name: '', difficulty: 1, engineGames: true, q: '', conf: 'all', order: 'name', errors: [],
  player: { name: '', num: 9, pos: null, archetype: null, height: null, weight: null, age: null, talent: 'alto', pathway: null, curve: null, attrs: null, appearance: null, photoUrl: '' } });

async function teamsOf(sport) { return (S.cache.teams[sport] ||= await A.getTeams(sport)); }
async function optsOf(sport) { return (S.cache.opts[sport] ||= await A.getPlayerOptions(sport)); }

const stepLabels = W => ['Esporte', 'Papel', W.role === 'PLAYER' ? 'Criar jogador' : 'Time', 'Dificuldade', 'Começar'];
function stepperHtml(W) { return `<div class="stepper" aria-label="Etapas">${stepLabels(W).map((t, i) => `<span class="${i === W.step ? 'on' : i < W.step ? 'done' : ''}" ${i === W.step ? 'aria-current="step"' : ''}>${i + 1}. ${esc(t)}</span>`).join('')}</div>`; }
const canNext = W => (W.step === 0 ? !!W.sport : W.step === 1 ? !!W.role : W.step === 2 ? (W.role === 'PLAYER' ? !!W.player.name.trim() : !!W.team) : false);

export async function renderWizard() {
  const W = (S.wiz ||= newWiz());
  document.body.classList.remove('in-career');
  $('#hubNav').innerHTML = '<button data-act="wiz-cancel">← Carreiras</button>';
  let body = '';
  if (W.step === 0) body = `<div class="wiz-step" role="radiogroup" aria-label="Esporte">${A.getSports().map(s => `<button class="pick ${W.sport === s.key ? 'on' : ''}" data-act="wiz-sport" data-sport="${s.key}" role="radio" aria-checked="${W.sport === s.key}"><span class="badge-sport sp-${s.key}" style="display:inline-block;padding:2px 8px;border-radius:6px;margin-bottom:8px;font-weight:900;color:#06101a">${s.label}</span><b>${s.label}</b><small>${esc(SPORT_BLURB[s.key] || s.desc)}</small></button>`).join('')}</div>`;
  else if (W.step === 1) body = `<div class="wiz-step" role="radiogroup" aria-label="Papel">${A.getRoles().map(r => `<button class="pick ${W.role === r.key ? 'on' : ''}" data-act="wiz-role" data-role="${r.key}" role="radio" aria-checked="${W.role === r.key}"><b>${esc(r.label.toUpperCase())}</b><small>${esc(r.desc)}</small></button>`).join('')}</div>`;
  else if (W.step === 2) {
    if (!(W.role === 'PLAYER' ? S.cache.opts[W.sport] : S.cache.teams[W.sport])) hub().innerHTML = `<div class="wiz">${stepperHtml(W)}<div class="panel empty">Carregando ${W.role === 'PLAYER' ? 'opções do jogador' : 'times'} de ${SPORT_LABEL[W.sport]}…</div></div>`;
    try { body = W.role === 'PLAYER' ? await playerStep(W) : await teamStep(W); } catch (e) { console.error(e); body = `<div class="panel"><b class="bad">Erro ao carregar os dados de ${SPORT_LABEL[W.sport]}: ${esc(e.message)}</b></div>`; }
    if (S.wiz !== W || W.step !== 2) return; // the user moved on while loading
  } else if (W.step === 3) body = await difficultyStep(W);
  const last = W.step === 3;
  hub().innerHTML = `<div class="wiz">${stepperHtml(W)}${body}${W.errors.length ? `<div class="alert bad" role="alert">${W.errors.map(esc).join(' · ')}</div>` : ''}<div class="wiz-nav">${W.step ? '<button id="wBack" data-act="wiz-back">← Voltar</button>' : ''}<span class="grow"></span>${last ? '<button class="primary" id="wGo" data-act="wiz-go">Criar carreira ▶</button>' : `<button class="primary" id="wNext" data-act="wiz-next" ${canNext(W) ? '' : 'disabled'}>Próximo →</button>`}</div></div>`;
  if (W.step === 2 && W.role === 'PLAYER') { mountThumb(); paintCurves(); }
  hub().focus?.({ preventScroll: true });
}

// ---------- step 3a: team ----------
async function teamStep(W) {
  const teams = await teamsOf(W.sport), confs = [...new Set(teams.map(t => t.conf))];
  const q = W.q.trim().toLowerCase();
  let list = teams.filter(t => (W.conf === 'all' || t.conf === W.conf) && (!q || t.name.toLowerCase().includes(q) || t.abbr.toLowerCase().includes(q)));
  list = [...list].sort((a, b) => (W.order === 'rating' ? b.rating - a.rating : a.name.localeCompare(b.name)));
  return `<div class="panel"><div class="team-tools">
      <label class="fld" style="min-width:210px">Escolha rápida<select id="wTeam" data-chg="wiz-team-sel" aria-label="Time"><option value="">— escolha um time —</option>${[...teams].sort((a, b) => a.name.localeCompare(b.name)).map(t => `<option value="${esc(t.abbr)}" ${t.abbr === W.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="fld">Buscar<input type="search" id="wQ" value="${esc(W.q)}" data-inp="wiz-q" data-fid="wq" placeholder="nome ou sigla"></label>
      <label class="fld">Ordenar<select data-chg="wiz-order"><option value="name" ${W.order === 'name' ? 'selected' : ''}>Nome</option><option value="rating" ${W.order === 'rating' ? 'selected' : ''}>Força do elenco</option></select></label>
      <div class="chips" role="group" aria-label="Conferência"><button class="${W.conf === 'all' ? 'on' : ''}" data-act="wiz-conf" data-conf="all">Todas</button>${confs.map(c => `<button class="${W.conf === c ? 'on' : ''}" data-act="wiz-conf" data-conf="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    </div>
    <div class="team-grid" id="teamGrid">${teamCards(list, W)}</div>
    <p class="muted small">${teams.length} times · “Favorito / Meio / Reconstrução” vem da força do elenco e define a expectativa da diretoria.</p></div>`;
}
const teamCards = (list, W) => list.map(t => `<button class="team-card ${t.abbr === W.team ? 'on' : ''}" style="--c:${esc(t.color)}" data-act="wiz-team" data-team="${esc(t.abbr)}" aria-pressed="${t.abbr === W.team}">${crest(t.abbr, t.color)}<span><b>${esc(t.name)}</b><small>${esc(t.conf)} · ${esc(String(t.div).replace(/^\S+\s/, ''))}</small><small><span class="outlook ${t.outlook}">${OUTLOOK[t.outlook] || ''}</span> · força ${fix(t.rating, 1)} (#${nn(t.rank)})</small></span></button>`).join('') || '<div class="empty">Nenhum time encontrado.</div>';
on('wiz-sport', el => { const W = S.wiz; if (W.sport !== el.dataset.sport) { W.sport = el.dataset.sport; W.team = null; W.player = newWiz().player; } renderWizard(); });
on('wiz-role', el => { S.wiz.role = el.dataset.role; renderWizard(); });
on('wiz-team', el => { S.wiz.team = el.dataset.team; paintTeamSel(); });
onChange('wiz-team-sel', el => { S.wiz.team = el.value || null; paintTeamSel(); });
onChange('wiz-order', el => { S.wiz.order = el.value; renderWizard(); });
on('wiz-conf', el => { S.wiz.conf = el.dataset.conf; renderWizard(); });
onInput('wiz-q', el => { S.wiz.q = el.value; renderWizard().then(() => { const n = $('#wQ'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); });
function paintTeamSel() {
  const W = S.wiz; $$('#teamGrid .team-card').forEach(b => { const on = b.dataset.team === W.team; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  const sel = $('#wTeam'); if (sel) sel.value = W.team || ''; const nx = $('#wNext'); if (nx) nx.disabled = !canNext(W);
}

// ---------- step 3b: player creator ----------
async function playerStep(W) {
  const o = await optsOf(W.sport), spec = (W.spec = await A.loadSpec(W.sport)), P = W.player;
  if (!P.pos) { const first = o.positions[0]; P.pos = first.pos; }
  const po = o.positions.find(p => p.pos === P.pos) || o.positions[0];
  if (!P.archetype || !po.archetypes.includes(P.archetype)) P.archetype = po.archetypes[0];
  P.height ??= Math.round((o.height.min + o.height.max) / 2); P.weight ??= Math.round((o.weight.min + o.weight.max) / 2);
  P.age ??= o.ages.min + 1; P.pathway ||= o.pathways[0].key;
  if (!P.attrs || Object.keys(P.attrs).join() !== po.attrs.map(a => a.key).join()) P.attrs = autoAttrs(W, spec, P);
  P.appearance ||= { ...getAvatar(W.sport, TMP_AV) };
  const budget = A.attributeBudget(spec, P.pos, P.talent), used = Object.values(P.attrs).reduce((a, b) => a + b, 0), { ovr, pot } = preview(W, po);
  return `<div class="pl-grid"><div class="stack">
    <section class="panel"><div class="panel-h"><b>Identidade</b></div><div class="form-grid">
      <label>Nome do atleta<input id="pName" value="${esc(P.name)}" data-inp="wiz-p" data-f="name" data-fid="pname" maxlength="40" placeholder="Seu nome" autocomplete="off"></label>
      <label>Número<input type="number" min="0" max="99" value="${esc(P.num)}" data-inp="wiz-p" data-f="num"></label>
      <label>Posição<select data-chg="wiz-pos">${o.positions.map(p => `<option ${p.pos === P.pos ? 'selected' : ''}>${esc(p.pos)}</option>`).join('')}</select></label>
      <label>Estilo / arquétipo<select data-chg="wiz-p" data-f="archetype">${po.archetypes.map(a => `<option ${a === P.archetype ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
      <label>Talento (define o orçamento e o potencial)<select data-chg="wiz-talent">${o.talents.map(t => `<option value="${t.key}" ${t.key === P.talent ? 'selected' : ''}>${esc(t.label)} (POT ~${POT_BY_TALENT[t.key]})</option>`).join('')}</select></label>
      <label>Idade<select data-chg="wiz-age">${range(o.ages.min, o.ages.max).map(a => `<option ${a === P.age ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label>Altura: <b id="hVal">${P.height} ${esc(o.height.unit)}</b><input type="range" min="${o.height.min}" max="${o.height.max}" value="${P.height}" data-inp="wiz-hw" data-f="height" aria-label="Altura"></label>
      <label>Peso: <b id="wVal">${P.weight} ${esc(o.weight.unit)}</b><input type="range" min="${o.weight.min}" max="${o.weight.max}" value="${P.weight}" data-inp="wiz-hw" data-f="weight" aria-label="Peso"></label>
    </div></section>
    <section class="panel"><div class="panel-h"><b>Atributos iniciais (orçamento de pontos)</b><button data-act="wiz-attr-auto">Distribuir automaticamente</button></div>
      <div class="budget"><b id="budTxt">${used} / ${budget} pontos</b><div class="bar2" style="flex:1"><i id="budBar" style="width:${clamp((used / budget) * 100, 0, 100).toFixed(0)}%"></i></div><span id="ovrPrev" class="chip blue">OVR ~${ovr} · POT ~${pot}</span></div>
      ${po.attrs.map(a => `<div class="slider-row"><label for="at_${a.key}">${esc(a.label)} <small class="muted">(${Math.round(a.weight * 100)}%)</small></label><input id="at_${a.key}" type="range" min="${o.attributes.min}" max="${o.attributes.max}" value="${P.attrs[a.key]}" data-inp="wiz-attr" data-chg="wiz-attr-done" data-k="${a.key}"><span class="v" id="atv_${a.key}">${P.attrs[a.key]}</span></div>`).join('')}
      <p class="muted small">Atributos de ${o.attributes.min} a ${o.attributes.max}. A soma não pode passar do orçamento (${po.attrs.length} atributos × 50 + bônus do talento). O OVR é a média ponderada.</p></section>
    <section class="panel"><div class="panel-h"><b>Caminho até a liga</b></div><div class="wiz-step" role="radiogroup" aria-label="Caminho">${o.pathways.map(p => `<button class="pick ${p.key === P.pathway ? 'on' : ''}" data-act="wiz-path" data-k="${p.key}" role="radio" aria-checked="${p.key === P.pathway}"><b>${esc(p.label)}</b><small>${esc(p.next)}</small></button>`).join('')}</div></section>
  </div><div class="stack">
    <section class="panel"><div class="panel-h"><b>Aparência</b></div><div class="av-box"><span id="wAvThumb"></span><div class="stack"><button data-act="wiz-av-edit">🎨 Editar boneco</button><button data-act="wiz-av-rand">🎲 Aleatório</button></div></div>
      <label class="fld" style="margin-top:10px">Foto (URL opcional, http/https)<input type="url" id="pPhoto" value="${esc(P.photoUrl)}" data-inp="wiz-p" data-f="photoUrl" data-fid="pphoto" placeholder="https://…" autocomplete="off"></label></section>
    <section class="panel"><div class="panel-h"><b>Curva de crescimento</b></div><p class="sec-sub">Define quando o atleta evolui, atinge o pico e declina. Prévia da evolução esperada de OVR por idade (média de 30 simulações).</p><div id="curveBox"></div></section>
  </div></div>`;
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
function autoAttrs(W, spec, P) { const r = A.validatePlayerInput(spec, { name: 'x', pos: P.pos, talent: P.talent, archetype: P.archetype }); return r.player.attrs; }
function preview(W, po) {
  const P = W.player, ovr = clamp(Math.round(po.attrs.reduce((s, a) => s + (P.attrs[a.key] ?? 50) * a.weight, 0) - 6), 30, 99);
  return { ovr, pot: Math.max(POT_BY_TALENT[P.talent] ?? 86, ovr + 8) };
}
function paintCurves() {
  const W = S.wiz, box = $('#curveBox'); if (!box || !W?.spec) return;
  const o = S.cache.opts[W.sport], po = o.positions.find(p => p.pos === W.player.pos), { ovr, pot } = preview(W, po);
  const proj = Object.fromEntries(o.curves.map(c => [c.key, A.projectCurve(W.spec, { ovr, pot, age: W.player.age, curve: c.key, seed: 'wizard-preview', years: 12, runs: 24 })]));
  const sel = W.player.curve;
  box.innerHTML = `<div class="curve-grid"><button class="curve-card ${sel == null ? 'on' : ''}" data-act="wiz-curve" data-k="" aria-pressed="${sel == null}"><b>Automática</b><small>sorteada na criação (a maioria é Normal)</small></button>${o.curves.map(c => `<button class="curve-card ${sel === c.key ? 'on' : ''}" data-act="wiz-curve" data-k="${c.key}" aria-pressed="${sel === c.key}">${curveSvg(proj[c.key].points, { w: 150, h: 60, mini: true, color: sel === c.key ? '#2fe08f' : '#4d9bff', label: c.label })}<b>${esc(c.label)}</b><small>pico ${fix(proj[c.key].peakOvr, 0)} aos ${nn(proj[c.key].peakAge)} anos</small></button>`).join('')}</div>
    ${sel ? `<div style="margin-top:10px">${curveSvg(proj[sel].points, { w: 520, h: 150, label: proj[sel].label })}<p class="muted small">${esc(proj[sel].label)}: pico de OVR ${fix(proj[sel].peakOvr, 0)} aos ${nn(proj[sel].peakAge)} anos (estimativa com OVR ~${ovr} e POT ~${pot}).</p></div>` : ''}`;
}
function mountThumb() {
  const W = S.wiz, el = $('#wAvThumb'); if (!el) return; el.innerHTML = '';
  const cv = avatarThumb({ sport: W.sport, id: TMP_AV, color: '#1d4ed8', color2: '#ffffff', number: W.player.num, kit: KIT[W.sport], size: 84 }); cv.setAttribute('aria-label', 'Prévia do boneco'); el.appendChild(cv);
}
onInput('wiz-p', el => { const P = S.wiz.player, f = el.dataset.f; P[f] = f === 'num' ? clamp(+el.value || 0, 0, 99) : el.value; const nx = $('#wNext'); if (nx) nx.disabled = !canNext(S.wiz); });
onChange('wiz-p', el => { S.wiz.player[el.dataset.f] = el.value; });
onInput('wiz-hw', el => { S.wiz.player[el.dataset.f] = +el.value; const o = S.cache.opts[S.wiz.sport]; $(el.dataset.f === 'height' ? '#hVal' : '#wVal').textContent = `${el.value} ${el.dataset.f === 'height' ? o.height.unit : o.weight.unit}`; });
onChange('wiz-pos', el => { const W = S.wiz; W.player.pos = el.value; W.player.archetype = null; W.player.attrs = null; renderWizard(); });
onChange('wiz-talent', el => { const W = S.wiz; W.player.talent = el.value; W.player.attrs = null; renderWizard(); });
onChange('wiz-age', el => { S.wiz.player.age = +el.value; paintCurves(); });
on('wiz-path', el => { S.wiz.player.pathway = el.dataset.k; renderWizard(); });
on('wiz-curve', el => { S.wiz.player.curve = el.dataset.k || null; paintCurves(); });
on('wiz-attr-auto', () => { const W = S.wiz; W.player.attrs = null; renderWizard(); });
onInput('wiz-attr', el => {
  const W = S.wiz, P = W.player, o = S.cache.opts[W.sport], po = o.positions.find(p => p.pos === P.pos), budget = A.attributeBudget(W.spec, P.pos, P.talent);
  const others = Object.entries(P.attrs).filter(([k]) => k !== el.dataset.k).reduce((s, [, v]) => s + v, 0);
  const v = clamp(+el.value, o.attributes.min, Math.min(o.attributes.max, budget - others)); el.value = v; P.attrs[el.dataset.k] = v;
  $(`#atv_${el.dataset.k}`).textContent = v;
  const used = others + v; $('#budTxt').textContent = `${used} / ${budget} pontos`; $('#budBar').style.width = `${clamp((used / budget) * 100, 0, 100).toFixed(0)}%`;
  const pv = preview(W, po); $('#ovrPrev').textContent = `OVR ~${pv.ovr} · POT ~${pv.pot}`;
});
onChange('wiz-attr-done', () => paintCurves());
on('wiz-av-edit', () => {
  const W = S.wiz, P = W.player;
  openAvatarEditor({ sport: W.sport, id: TMP_AV, name: P.name || 'Seu atleta', number: P.num, pos: P.pos, color: '#1d4ed8', color2: '#ffffff', kit: KIT[W.sport], onSave: ap => { P.appearance = { ...ap }; mountThumb(); } });
});
on('wiz-av-rand', () => { const W = S.wiz; W.player.appearance = randomAvatar(); setAvatar(W.sport, TMP_AV, W.player.appearance); mountThumb(); });

// ---------- step 4: difficulty + summary ----------
async function difficultyStep(W) {
  const diffs = A.getDifficulties(), P = W.player, who = W.role === 'PLAYER' ? `${esc(P.name || 'Jogador')} (${esc(P.pos)})` : esc(W.team || '—');
  return `<div class="wiz-step" role="radiogroup" aria-label="Dificuldade">${diffs.map(d => `<button class="pick ${d.value === W.difficulty ? 'on' : ''}" data-act="wiz-diff" data-v="${d.value}" role="radio" aria-checked="${d.value === W.difficulty}"><b>${esc(d.label)}</b><small>Paciência da diretoria ×${d.boardPatience} · lesões ×${d.injury} · ruído de scouting ×${d.scoutNoise} · reputação inicial ${d.startRep}</small></button>`).join('')}</div>
    <div class="panel"><div class="panel-h"><b>Resumo</b></div><p><span class="chip blue">${SPORT_LABEL[W.sport]}</span> <span class="chip">${esc({ COACH: 'Técnico', GM: 'Dirigente', PLAYER: 'Jogador' }[W.role])}</span> <b>${who}</b>${W.role === 'PLAYER' ? ` · caminho: ${esc(P.pathway)} · curva: ${esc(P.curve || 'automática')}` : ''}</p>
      <div class="form-grid"><label>Nome da carreira (opcional)<input id="wName" value="${esc(W.name)}" data-inp="wiz-name" placeholder="Minha dinastia"></label></div>
      <label class="chk" style="margin-top:8px"><input type="checkbox" id="wEngine" ${W.engineGames ? 'checked' : ''} data-chg="wiz-engine"> Jogos do meu time com o motor real do esporte (mais lento, estatísticas completas)</label>
      <p class="muted small">Os outros jogos da liga usam o modelo rápido de força dos elencos. Dados: elencos reais quando disponíveis (snapshots locais), contratos estimados. ${W.role !== 'PLAYER' ? 'Você pode jogar cada partida do seu time no 2D (NHL/MLB) a partir do Calendário.' : ''}</p></div>`;
}
on('wiz-diff', el => { S.wiz.difficulty = +el.dataset.v; renderWizard(); });
onInput('wiz-name', el => { S.wiz.name = el.value; });
onChange('wiz-engine', el => { S.wiz.engineGames = el.checked; });

// ---------- navigation ----------
on('wiz-cancel', () => { S.wiz = null; location.hash = '#'; });
on('wiz-back', () => { const W = S.wiz; W.errors = []; W.step = Math.max(0, W.step - 1); renderWizard(); });
on('wiz-next', async () => {
  const W = S.wiz; if (!canNext(W)) return; W.errors = [];
  if (W.step === 2 && W.role === 'PLAYER') { const v = A.validatePlayerInput(W.spec, playerInput(W)); if (!v.ok) { W.errors = v.errors; return renderWizard(); } }
  W.step++; renderWizard();
});
const playerInput = W => { const P = W.player; return { name: P.name.trim(), pos: P.pos, archetype: P.archetype, talent: P.talent, height: P.height, weight: P.weight, age: P.age, num: P.num, attrs: P.attrs, appearance: P.appearance, photoUrl: P.photoUrl.trim() || undefined, curve: P.curve || undefined, pathway: P.pathway }; };
on('wiz-go', async () => {
  const W = S.wiz; W.errors = [];
  const draft = { sport: W.sport, role: W.role, difficulty: W.difficulty, name: W.name.trim() || undefined, engineGames: W.engineGames };
  if (W.role === 'PLAYER') draft.player = playerInput(W); else draft.team = W.team;
  const v = await A.validateFlow(draft); if (!v.ok) { W.errors = v.errors; return renderWizard(); }
  showBusy('Montando a liga…', 'carregando elencos, calendário e scouting'); await sleep(40);
  try {
    const { career, spec } = await A.startCareer(draft, { store });
    if (W.role === 'PLAYER') { setAvatar(W.sport, career.me.id, { ...W.player.appearance }); resetAvatar(W.sport, TMP_AV); }
    S.c = career; S.spec = spec; S.wiz = null; S.lastAdv = null; S.migrated = null; S.dirty = false; S.autosaveAt = null; S.ui.trade = null; S.screen = 'dashboard';
    ensureAvatar(career); store.setActive(career.id);
    location.hash = careerHash('dashboard', career.id);
  } catch (e) { console.error(e); W.errors = [`Erro ao criar: ${e.message}`]; toast(`Erro ao criar: ${e.message}`, true); renderWizard(); } finally { hideBusy(); }
});
