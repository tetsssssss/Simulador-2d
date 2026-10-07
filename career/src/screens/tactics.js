// Tactics screen. Every edit goes through A.setTactics(spec, c, patch) (validated by the sport rules); the UI only builds patches.
//  NFL: depth chart, formations, playbook, personnel, schemes, special teams, weekly gameplan
//  NHL: forward lines, D pairs, goalie, forecheck, neutral zone, power play, penalty kill, line matching
//  MLB: lineup vs R/L (batting order + positions), rotation, bullpen, defensive alignment, pitching changes, bunts / steals / pinch hitters
// Editing is done with select + arrow controls (keyboard friendly); invalid combinations are rejected by the API and shown as a toast.
import { A, S, esc, nn, fix, meter, chip, registerScreen, pageTitle, panel, on, onChange, toast, touch, refresh, subTabs, tabOf, posTag, isNum } from '../core.js';

const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, DB: 4, K: 1, P: 1 };
const DEPTH_LEN = { QB: 3, RB: 4, WR: 6, TE: 3, OL: 8, DL: 7, LB: 5, DB: 8, K: 1, P: 1 };
const GROUPS = Object.keys(STARTERS);
const MLB_POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const lbl = p => `${p.n} · ${p.pos} ${p.ovr}${p.inj ? ' 🩹' : ''}`;
const nest = (path, val) => path.split('.').reduceRight((acc, k) => ({ [k]: acc }), val);
const copy = o => JSON.parse(JSON.stringify(o));
const getV = () => A.getTacticsView(S.c);

function applyTac(patch, quiet = false) {
  const r = A.setTactics(S.spec, S.c, patch);
  if (!r.ok) toast(r.errors?.[0] || r.text, true);
  else { touch(); if (!quiet) toast(r.changed ? 'Táticas atualizadas (o entrosamento cai um pouco com mudanças).' : 'Sem alterações.'); }
  refresh(); return r;
}
const dis = v => (v.editable ? '' : 'disabled');
const DND = v => (v.editable ? 'draggable="true" data-dnd title="Arraste para trocar de lugar"' : '');
const optSel = (v, label, path, value, options, extra = '') => `<label class="fld">${esc(label)}<select data-chg="tac-opt" data-path="${path}" ${dis(v)} ${extra}>${options.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
const rng = (v, label, path, value, min, max, step = 0.01, pctFmt = true) => `<div class="slider-row"><label for="r_${path}">${esc(label)}</label><input id="r_${path}" type="range" min="${min}" max="${max}" step="${step}" value="${esc(value)}" data-chg="tac-num" data-path="${path}" ${dis(v)}><span class="v">${pctFmt ? `${Math.round(value * 100)}%` : esc(value)}</span></div>`;
const chk = (v, label, path, value) => `<label class="chk"><input type="checkbox" data-chg="tac-bool" data-path="${path}" ${value ? 'checked' : ''} ${dis(v)}> ${esc(label)}</label>`;
const slotSel = (v, value, cands, attrs, { blank = false, label = 'Jogador' } = {}) => {
  const has = cands.some(p => p.id === value), cur = value && !has ? v.players[value] : null;
  return `<select ${attrs} aria-label="${esc(label)}" ${dis(v)}>${blank || !value ? '<option value="">—</option>' : ''}${cur ? `<option value="${esc(value)}" selected>${esc(lbl(cur))}</option>` : ''}${cands.map(p => `<option value="${esc(p.id)}" ${p.id === value ? 'selected' : ''}>${esc(lbl(p))}</option>`).join('')}</select>`;
};
const arrows = (v, attrs) => `<span class="arrows"><button data-act="tac-move" ${attrs} data-dir="-1" aria-label="Subir" ${dis(v)}>▲</button><button data-act="tac-move" ${attrs} data-dir="1" aria-label="Descer" ${dis(v)}>▼</button></span>`;
const roster = v => Object.values(v.players).filter(p => p.st === 'ACT' || p.st === 'IR').sort((a, b) => b.ovr - a.ovr);

// ---------- screen ----------
registerScreen('tactics', {
  title: 'Táticas',
  render(el) {
    const c = S.c, v = getV(), sport = c.sport;
    if (!v.tac) { el.innerHTML = `${pageTitle('Táticas')}<div class="panel empty">Sem clube: as táticas só existem para técnicos e dirigentes.</div>`; return; }
    const tabs = { nfl: [['depth', 'Depth chart'], ['offense', 'Ataque'], ['defense', 'Defesa'], ['playbook', 'Playbook'], ['special', 'Times especiais'], ['gameplan', 'Plano do jogo'], ['report', 'Relatório']], nhl: [['lines', 'Linhas & goleiros'], ['special', 'Power play / PK'], ['style', 'Estilo de jogo'], ['gameplan', 'Plano do jogo'], ['report', 'Relatório']], mlb: [['lineup', 'Lineup & ordem'], ['rotation', 'Rotação'], ['bullpen', 'Bullpen'], ['defense', 'Defesa & arremessos'], ['situational', 'Situações'], ['gameplan', 'Plano da série'], ['report', 'Relatório']] }[sport];
    const cur = tabOf('tac_' + sport, tabs[0][0]);
    v.report ||= { fit: 1, lineupDelta: 0, synergy: 0, coordinators: 0, familiarity: c.x.training?.fam ?? 50, bonus: 0 }; // dirigente: sem relatório (as táticas são automáticas)
    const body = { nfl: nflTab, nhl: nhlTab, mlb: mlbTab }[sport](v, cur);
    el.innerHTML = `${pageTitle('Táticas', v.editable ? '<button data-act="tac-auto" title="Restaura a escalação automática da comissão">↺ Automático</button>' : '')}
    ${v.editable ? '' : '<div class="notice">Somente o técnico define as táticas. Como dirigente você vê a configuração automática que a comissão usa (somente leitura).</div>'}
    <div class="stat-grid"><div class="stat"><small>Encaixe</small><b>${fix(v.report.fit * 100, 0)}%</b></div><div class="stat"><small>Desvio da escalação</small><b>${fix(v.report.lineupDelta, 1)}</b></div><div class="stat"><small>Sinergia</small><b>${fix(v.report.synergy, 1)}</b></div><div class="stat"><small>Staff</small><b>${fix(v.report.coordinators, 2)}</b></div><div class="stat"><small>Entrosamento</small><b>${fix(v.report.familiarity, 0)}</b></div><div class="stat"><small>Bônus no rating</small><b>${v.report.bonus > 0 ? '+' : ''}${fix(v.report.bonus, 2)}</b></div></div>
    ${subTabs('tac_' + sport, tabs, cur)}${body}`;
  },
});
on('tac-auto', () => { A.autoTactics(S.spec, S.c); touch(); toast('Escalação automática restaurada.'); refresh(); });
onChange('tac-opt', el => applyTac(nest(el.dataset.path, el.value)));
onChange('tac-num', el => applyTac(nest(el.dataset.path, +el.value), true));
onChange('tac-bool', el => applyTac(nest(el.dataset.path, el.checked)));

const reportTab = v => `<div class="grid2">${panel('Relatório tático', `${meter('Encaixe do plano com o elenco', v.report.fit * 100)}<dl class="dl"><dt>Desvio da escalação</dt><dd>${fix(v.report.lineupDelta, 2)} (quanto o seu onze perde para o melhor possível)</dd><dt>Sinergia esquema × elenco</dt><dd>${fix(v.report.synergy, 2)}</dd><dt>Coordenadores</dt><dd>${fix(v.report.coordinators, 2)}</dd><dt>Entrosamento</dt><dd>${fix(v.report.familiarity, 0)}/100</dd><dt>Bônus total no rating</dt><dd><b>${v.report.bonus > 0 ? '+' : ''}${fix(v.report.bonus, 2)}</b></dd></dl><p class="muted small">Jogadores lesionados titulares são substituídos automaticamente a cada dia (o relatório de trocas aparece nas notícias).</p>`)}
  ${panel('Config enviada ao motor (engineConfig)', `<details><summary>Ver JSON</summary><pre class="json">${esc(JSON.stringify(v.engineConfig, (k, x) => (k === 'staff' ? undefined : x), 1))}</pre></details><p class="muted small">NFL lê esse objeto no motor de simulação (<code>coach</code>); NHL/MLB aplicam linhas/rotação/ordem ao elenco. As telas 2D ainda não leem os demais campos.</p>`)}</div>`;
const planBox = v => (v.gameplan ? `<div class="alert info">📝 <span class="grow"><b>Sugestão da semana vs ${esc(v.gameplan.opp)}</b> (${v.gameplan.home ? 'em casa' : 'fora'}): ${esc(v.gameplan.note)}</span>${v.gameplan.focus && v.editable ? `<button data-act="tac-plan" data-f="${esc(v.gameplan.focus)}">Aplicar foco “${esc(v.gameplan.focus)}”</button>` : ''}</div>` : '<p class="muted small">O plano da semana aparece quando houver um jogo marcado.</p>');
on('tac-plan', el => { const sport = S.c.sport; if (sport === 'nfl') applyTac({ gameplan: { focus: el.dataset.f } }); else toast(`Foco sugerido: ${el.dataset.f}. Ajuste o estilo de jogo conforme necessário.`); });

// ---------- NFL ----------
function nflTab(v, tab) {
  const t = v.tac, sc = v.schema, ps = roster(v), grp = p => S.spec.posGroup(p.pos);
  if (tab === 'depth') {
    const g = tabOf('nflDepth', 'QB'), pool = ps.filter(p => grp(p) === g), arr = t.depth[g] || [];
    return `<div class="panel">${subTabs('nflDepth', GROUPS.map(x => [x, x]), g)}<p class="sec-sub" style="margin-top:8px">Os ${STARTERS[g]} primeiro(s) são titulares; os demais, reservas na ordem. ${pool.length} jogador(es) elegível(is). Trocar um jogador por outro já escalado faz os dois trocarem de lugar.</p>
      ${Array.from({ length: DEPTH_LEN[g] }, (_, i) => `<div ${DND(v)} class="tslot ${i < STARTERS[g] ? 'starter' : ''}"><span class="n">${i < STARTERS[g] ? 'T' : 'R'}${i + 1}</span>${slotSel(v, arr[i] || '', pool, `data-chg="tac-slot" data-kind="nfl-depth" data-g="${g}" data-i="${i}"`, { blank: i >= STARTERS[g], label: `${g} posição ${i + 1}` })}${arrows(v, `data-kind="nfl-depth" data-g="${g}" data-i="${i}"`)}</div>`).join('')}
      ${v.editable ? `<button data-act="tac-depth-auto" data-g="${g}" style="margin-top:8px">Ordenar ${g} por OVR (saudáveis primeiro)</button>` : ''}</div>`;
  }
  if (tab === 'offense') return `<div class="panel"><div class="form-grid">${optSel(v, 'Formação', 'offense.formation', t.offense.formation, sc.offense.formation)}${optSel(v, 'Personnel', 'offense.personnel', t.offense.personnel, sc.offense.personnel)}${optSel(v, 'Esquema', 'offense.scheme', t.offense.scheme, sc.offense.scheme)}${optSel(v, 'Ritmo', 'offense.tempo', t.offense.tempo, sc.offense.tempo)}</div><p class="muted small">Personnel 11 = 1 RB, 1 TE, 3 WR · 12 = 1 RB, 2 TE · 21 = 2 RB, 1 TE · 22 = 2 RB, 2 TE · 10 = 1 RB, 0 TE. Air Raid pede WR e QB fortes; Ground & Pound pede linha e RB.</p></div>`;
  if (tab === 'defense') return `<div class="panel"><div class="form-grid">${optSel(v, 'Formação', 'defense.formation', t.defense.formation, sc.defense.formation)}${optSel(v, 'Personnel', 'defense.personnel', t.defense.personnel, sc.defense.personnel)}${optSel(v, 'Esquema', 'defense.scheme', t.defense.scheme, sc.defense.scheme)}</div>${rng(v, 'Frequência de blitz', 'gameplan.blitzRate', t.gameplan.blitzRate, 0, 1)}<p class="muted small">Man Press pede DBs fortes; Zone Blitz pede linha defensiva forte.</p></div>`;
  if (tab === 'playbook') return `<div class="panel">${rng(v, 'Passe vs corrida', 'playbook.passShare', t.playbook.passShare, 0.3, 0.7)}${rng(v, 'Bola longa', 'playbook.deepRate', t.playbook.deepRate, 0, 1)}${rng(v, 'RPO', 'playbook.rpoRate', t.playbook.rpoRate, 0, 1)}${rng(v, 'Screens', 'playbook.screenRate', t.playbook.screenRate, 0, 1)}</div>`;
  if (tab === 'special') {
    const K = ps.filter(p => grp(p) === 'K'), P = ps.filter(p => grp(p) === 'P'), R = ps.filter(p => ['WR', 'RB', 'DB'].includes(grp(p)));
    return `<div class="panel"><div class="form-grid"><label class="fld">Kicker${slotSel(v, t.specialTeams.kicker, K, 'data-chg="tac-slot" data-kind="nfl-st" data-w="kicker"')}</label><label class="fld">Punter${slotSel(v, t.specialTeams.punter, P, 'data-chg="tac-slot" data-kind="nfl-st" data-w="punter"')}</label><label class="fld">Retornador${slotSel(v, t.specialTeams.returner, R, 'data-chg="tac-slot" data-kind="nfl-st" data-w="returner"', { blank: true })}</label></div>${rng(v, 'Fake punt/FG', 'specialTeams.fakeRate', t.specialTeams.fakeRate, 0, 0.3)}${rng(v, 'Onside kick (risco)', 'specialTeams.onsideRisk', t.specialTeams.onsideRisk, 0, 1)}</div>`;
  }
  if (tab === 'gameplan') return `<div class="stack">${planBox(v)}<div class="panel"><div class="form-grid">${optSel(v, 'Foco do plano', 'gameplan.focus', t.gameplan.focus, sc.gameplan.focus)}${optSel(v, '4ª descida', 'gameplan.fourthDown', t.gameplan.fourthDown, sc.gameplan.fourthDown)}</div>${chk(v, 'Tentar conversão de 2 pontos quando fizer sentido', 'gameplan.twoPoint', t.gameplan.twoPoint)}</div></div>`;
  return reportTab(v);
}
onChange('tac-slot', el => {
  const v = getV(), t = copy(v.tac), k = el.dataset.kind, val = el.value || null, i = +el.dataset.i, j = +el.dataset.j;
  if (k === 'nfl-depth') { const g = el.dataset.g, arr = [...(t.depth[g] || [])]; while (arr.length < DEPTH_LEN[g]) arr.push(null); const at = val ? arr.indexOf(val) : -1; if (at >= 0 && at !== i) [arr[i], arr[at]] = [arr[at], arr[i]]; else arr[i] = val; return applyTac({ depth: { [g]: arr.filter(Boolean) } }, true); }
  if (k === 'nfl-st') return applyTac({ specialTeams: { [el.dataset.w]: val } }, true);
  if (k === 'nhl-F') { const F = t.lines.F, at = findIn(F, val); if (at && (at[0] !== i || at[1] !== j)) { [F[i][j], F[at[0]][at[1]]] = [F[at[0]][at[1]], F[i][j]]; } else F[i][j] = val; return applyTac({ lines: { F } }, true); }
  if (k === 'nhl-D') { const D = t.lines.D, at = findIn(D, val); if (at && (at[0] !== i || at[1] !== j)) { [D[i][j], D[at[0]][at[1]]] = [D[at[0]][at[1]], D[i][j]]; } else D[i][j] = val; return applyTac({ lines: { D } }, true); }
  if (k === 'nhl-G') { const G = t.lines.G, w = el.dataset.w, o = w === 'starter' ? 'backup' : 'starter'; if (val && G[o] === val) G[o] = G[w]; G[w] = val; return applyTac({ lines: { G } }, true); }
  if (k === 'nhl-unit') { const u = el.dataset.u, n = +el.dataset.n, units = t[u].units; const un = [...(units[n] || [])]; const at = val ? un.indexOf(val) : -1; while (un.length <= i) un.push(null); if (at >= 0 && at !== i) [un[i], un[at]] = [un[at], un[i]]; else un[i] = val; units[n] = un.filter(Boolean); return applyTac({ [u]: { units } }, true); }
  if (k === 'mlb-lu') { const side = el.dataset.side, lu = t.lineup[side]; const at = val ? lu.findIndex(s => s.id === val) : -1; if (at >= 0 && at !== i) [lu[i].id, lu[at].id] = [lu[at].id, lu[i].id]; else lu[i].id = val; return applyTac({ lineup: { [side]: lu } }, true); }
  if (k === 'mlb-pos') { const side = el.dataset.side, lu = t.lineup[side], at = lu.findIndex((s, x) => s.pos === el.value && x !== i); if (at >= 0) lu[at].pos = lu[i].pos; lu[i].pos = el.value; return applyTac({ lineup: { [side]: lu } }, true); }
  if (k === 'mlb-rot') { const arr = [...t.rotation]; while (arr.length < 5) arr.push(null); const at = val ? arr.indexOf(val) : -1; if (at >= 0 && at !== i) [arr[i], arr[at]] = [arr[at], arr[i]]; else arr[i] = val; return applyTac({ rotation: arr.filter(Boolean) }, true); }
  if (k === 'mlb-bp') { const w = el.dataset.w; if (w === 'closer' || w === 'long') return applyTac({ bullpen: { [w]: val } }, true); const arr = [...(t.bullpen[w] || [])]; while (arr.length <= i) arr.push(null); arr[i] = val; return applyTac({ bullpen: { [w]: arr.filter(Boolean) } }, true); }
});
function findIn(rows, id) { if (!id) return null; for (let i = 0; i < rows.length; i++) { const j = rows[i].indexOf(id); if (j >= 0) return [i, j]; } return null; }
on('tac-move', el => {
  const v = getV(), t = copy(v.tac), k = el.dataset.kind, i = +el.dataset.i, d = +el.dataset.dir, j = i + d;
  const swap = arr => { if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };
  if (k === 'nfl-depth') { const g = el.dataset.g, arr = [...(t.depth[g] || [])]; if (!swap(arr)) return; return applyTac({ depth: { [g]: arr.filter(Boolean) } }, true); }
  if (k === 'mlb-lu') { const side = el.dataset.side, lu = t.lineup[side]; if (!swap(lu)) return; return applyTac({ lineup: { [side]: lu } }, true); }
  if (k === 'mlb-rot') { const arr = [...t.rotation]; if (!swap(arr)) return; return applyTac({ rotation: arr }, true); }
});
on('tac-depth-auto', el => { const v = getV(), g = el.dataset.g, ps = roster(v).filter(p => S.spec.posGroup(p.pos) === g).sort((a, b) => (a.inj - b.inj) || b.ovr - a.ovr); applyTac({ depth: { [g]: ps.slice(0, DEPTH_LEN[g]).map(p => p.id) } }); });

// ---------- NHL ----------
function nhlTab(v, tab) {
  const t = v.tac, sc = v.schema, ps = roster(v), F = ps.filter(p => p.pos !== 'D' && p.pos !== 'G'), D = ps.filter(p => p.pos === 'D'), G = ps.filter(p => p.pos === 'G'), sk = ps.filter(p => p.pos !== 'G');
  const byPos = (list, pos) => [...list].sort((a, b) => ((b.pos === pos) - (a.pos === pos)) || b.ovr - a.ovr);
  if (tab === 'lines') return `<div class="grid2"><div class="stack">${t.lines.F.map((l, i) => `<div class="line-card"><h4>Linha ${i + 1} · ${Math.round(([0.35, 0.28, 0.22, 0.15][i]) * 100)}% do tempo</h4>${['C', 'LW', 'RW'].map((pos, j) => `<div ${DND(v)} class="tslot"><span class="n">${pos}</span>${slotSel(v, l[j], byPos(F, pos), `data-chg="tac-slot" data-kind="nhl-F" data-i="${i}" data-j="${j}"`, { label: `Linha ${i + 1} ${pos}` })}<span></span></div>`).join('')}</div>`).join('')}</div>
    <div class="stack">${t.lines.D.map((l, i) => `<div class="line-card"><h4>Par defensivo ${i + 1}</h4>${['LD', 'RD'].map((pos, j) => `<div ${DND(v)} class="tslot"><span class="n">${pos}</span>${slotSel(v, l[j], D, `data-chg="tac-slot" data-kind="nhl-D" data-i="${i}" data-j="${j}"`, { label: `Par ${i + 1} ${pos}` })}<span></span></div>`).join('')}</div>`).join('')}
      <div class="line-card"><h4>Goleiros</h4><div ${DND(v)} class="tslot"><span class="n">Tit.</span>${slotSel(v, t.lines.G.starter, G, 'data-chg="tac-slot" data-kind="nhl-G" data-w="starter"', { label: 'Goleiro titular' })}<span></span></div><div ${DND(v)} class="tslot"><span class="n">Res.</span>${slotSel(v, t.lines.G.backup, G, 'data-chg="tac-slot" data-kind="nhl-G" data-w="backup"', { label: 'Goleiro reserva' })}<span></span></div>${optSel(v, 'Descanso do goleiro', 'goalieRest', t.goalieRest, sc.goalieRest)}</div></div></div>`;
  if (tab === 'special') return `<div class="grid2"><div class="panel"><div class="panel-h"><b>Power play</b></div>${optSel(v, 'Formação', 'powerPlay.formation', t.powerPlay.formation, sc.powerPlay.formation)}${t.powerPlay.units.map((u, n) => `<div class="line-card" style="margin-top:8px"><h4>Unidade ${n + 1} (5 jogadores)</h4>${Array.from({ length: 5 }, (_, i) => `<div ${DND(v)} class="tslot"><span class="n">${i + 1}</span>${slotSel(v, u[i] || '', sk, `data-chg="tac-slot" data-kind="nhl-unit" data-u="powerPlay" data-n="${n}" data-i="${i}"`, { blank: true, label: `PP unidade ${n + 1} slot ${i + 1}` })}<span></span></div>`).join('')}</div>`).join('')}</div>
    <div class="panel"><div class="panel-h"><b>Penalty kill</b></div>${optSel(v, 'Estilo', 'penaltyKill.style', t.penaltyKill.style, sc.penaltyKill.style)}${t.penaltyKill.units.map((u, n) => `<div class="line-card" style="margin-top:8px"><h4>Unidade ${n + 1} (4 jogadores)</h4>${Array.from({ length: 4 }, (_, i) => `<div ${DND(v)} class="tslot"><span class="n">${i + 1}</span>${slotSel(v, u[i] || '', sk, `data-chg="tac-slot" data-kind="nhl-unit" data-u="penaltyKill" data-n="${n}" data-i="${i}"`, { blank: true, label: `PK unidade ${n + 1} slot ${i + 1}` })}<span></span></div>`).join('')}</div>`).join('')}</div></div>`;
  if (tab === 'style') return `<div class="panel"><div class="form-grid">${optSel(v, 'Forecheck', 'forecheck', t.forecheck, sc.forecheck)}${optSel(v, 'Zona neutra', 'neutralZone', t.neutralZone, sc.neutralZone)}${optSel(v, 'Ritmo', 'pace', t.pace, sc.pace)}${optSel(v, 'Line matching', 'lineMatching.mode', t.lineMatching.mode, sc.lineMatching.mode)}</div>${rng(v, 'Tempo da 1ª linha', 'lineMatching.topLineShare', t.lineMatching.topLineShare, 0.3, 0.45)}<p class="muted small">Forecheck agressivo e ritmo rápido pedem time jovem; trap pede goleiro de elite; stretch pede 1ª linha muito acima da profundidade.</p></div>`;
  if (tab === 'gameplan') return `<div class="stack">${planBox(v)}<div class="panel"><p class="muted small">No NHL o “plano do jogo” é a combinação de forecheck, zona neutra, ritmo e line matching (aba Estilo de jogo).</p></div></div>`;
  return reportTab(v);
}

// ---------- MLB ----------
function mlbTab(v, tab) {
  const t = v.tac, sc = v.schema, ps = roster(v), bats = ps.filter(p => p.pos !== 'SP' && p.pos !== 'RP'), pit = ps.filter(p => p.pos === 'SP' || p.pos === 'RP');
  if (tab === 'lineup') return `<div class="grid2">${['vsR', 'vsL'].map(side => `<div class="panel"><div class="panel-h"><b>Lineup ${side === 'vsR' ? 'contra destros (vs R)' : 'contra canhotos (vs L)'}</b>${side === 'vsL' && v.editable ? '<button data-act="mlb-copy">Copiar do vs R</button>' : ''}</div>${t.lineup[side].map((s, i) => `<div ${DND(v)} class="lineup-row"><b class="muted">${i + 1}º</b>${slotSel(v, s.id, bats, `data-chg="tac-slot" data-kind="mlb-lu" data-side="${side}" data-i="${i}"`, { label: `${side} rebatedor ${i + 1}` })}<select data-chg="tac-slot" data-kind="mlb-pos" data-side="${side}" data-i="${i}" aria-label="Posição ${i + 1}" ${dis(v)}>${MLB_POS.map(p => `<option ${p === s.pos ? 'selected' : ''}>${p}</option>`).join('')}</select>${arrows(v, `data-kind="mlb-lu" data-side="${side}" data-i="${i}"`)}</div>`).join('')}</div>`).join('')}</div><p class="muted small">Ordem de rebatida = ordem da lista. Posições não podem repetir; ao escolher uma posição já usada as duas trocam.</p>`;
  if (tab === 'rotation') return `<div class="panel"><div class="panel-h"><b>Rotação de abridores</b><span class="muted small">mínimo de 4, até 5</span></div>${Array.from({ length: 5 }, (_, i) => `<div ${DND(v)} class="tslot starter"><span class="n">SP${i + 1}</span>${slotSel(v, t.rotation[i] || '', pit, `data-chg="tac-slot" data-kind="mlb-rot" data-i="${i}"`, { blank: i >= 4, label: `Abridor ${i + 1}` })}${arrows(v, `data-kind="mlb-rot" data-i="${i}"`)}</div>`).join('')}</div>`;
  if (tab === 'bullpen') return `<div class="panel"><div ${DND(v)} class="tslot starter"><span class="n">CL</span>${slotSel(v, t.bullpen.closer, pit, 'data-chg="tac-slot" data-kind="mlb-bp" data-w="closer"', { label: 'Closer', blank: true })}<span></span></div>
    <h4 class="sec-h">Setup (até 3)</h4>${[0, 1, 2].map(i => `<div ${DND(v)} class="tslot"><span class="n">SU${i + 1}</span>${slotSel(v, t.bullpen.setup[i] || '', pit, `data-chg="tac-slot" data-kind="mlb-bp" data-w="setup" data-i="${i}"`, { blank: true, label: `Setup ${i + 1}` })}<span></span></div>`).join('')}
    <h4 class="sec-h">Meio (até 4)</h4>${[0, 1, 2, 3].map(i => `<div ${DND(v)} class="tslot"><span class="n">MR${i + 1}</span>${slotSel(v, t.bullpen.middle[i] || '', pit, `data-chg="tac-slot" data-kind="mlb-bp" data-w="middle" data-i="${i}"`, { blank: true, label: `Meio ${i + 1}` })}<span></span></div>`).join('')}
    <h4 class="sec-h">Long man</h4><div ${DND(v)} class="tslot"><span class="n">LM</span>${slotSel(v, t.bullpen.long, pit, 'data-chg="tac-slot" data-kind="mlb-bp" data-w="long"', { blank: true, label: 'Long man' })}<span></span></div></div>`;
  if (tab === 'defense') return `<div class="panel"><div class="form-grid">${optSel(v, 'Shift', 'defense.shift', t.defense.shift, sc.defense.shift)}${optSel(v, 'Infield', 'defense.infield', t.defense.infield, sc.defense.infield)}${optSel(v, 'Outfield', 'defense.outfield', t.defense.outfield, sc.defense.outfield)}${optSel(v, 'Troca de arremessador', 'pitching.hook', t.pitching.hook, sc.pitching.hook)}</div>${rng(v, 'Limite de arremessos', 'pitching.pitchLimit', t.pitching.pitchLimit, 75, 125, 1, false)}<p class="muted small">Hook rápido pede bullpen forte; paciente pede rotação de elite.</p></div>`;
  if (tab === 'situational') return `<div class="panel"><div class="form-grid">${optSel(v, 'Bunts', 'bunt', t.bunt, sc.bunt)}${optSel(v, 'Roubo de base', 'steal', t.steal, sc.steal)}${optSel(v, 'Pinch hitters', 'pinchHit', t.pinchHit, sc.pinchHit)}</div>${chk(v, 'Intentional walk quando fizer sentido', 'intentionalWalk', t.intentionalWalk)}</div>`;
  if (tab === 'gameplan') return `<div class="stack">${planBox(v)}<div class="panel"><p class="muted small">No MLB o plano da série combina lineup vs R/L, rotação (o abridor do dia segue a ordem) e as situações (bunt, steal, pinch hitter).</p></div></div>`;
  return reportTab(v);
}
on('mlb-copy', () => { const v = getV(); applyTac({ lineup: { vsL: copy(v.tac.lineup.vsR) } }); });
