// Secondary screens: franchises, colleges, trades, medical, rivalries, champions, data & photos.
import { esc, avatar, teamLogo, ovrBadge, ratingsOf, pid } from '../components.js';
import { generateInjury, teamStrength } from '../../game/career.js';

export function franchisesView(ctx) {
  const { state, content } = ctx;
  ctx.setTitle('Franquias', '32 equipes · conferências e divisões');
  const f = state.ui.fr ||= { conf: '' };
  const confs = f.conf ? [f.conf] : ['AFC', 'NFC'];
  const rec = a => { const s = state.career?.standings?.[a]; return s ? `${s.w}-${s.l}${s.t ? '-' + s.t : ''}` : ''; };
  content.innerHTML = `<div class="toolbar"><div class="seg big">${['', 'AFC', 'NFC'].map(c => `<button data-conf="${c}" class="${f.conf === c ? 'on' : ''}">${c || 'Todas'}</button>`).join('')}</div></div>
    ${confs.map(cf => `<h3 class="sec-h">${cf}</h3><div class="div-grid">${['East', 'North', 'South', 'West'].map(d => `<div class="panel"><div class="panel-h"><b>${cf} ${d}</b></div>${state.teams.filter(t => t.conference === cf && t.division === d).map(t => `<a class="team-row" href="#roster/${t.abbr}" style="--tc:${t.color}">${teamLogo(t, 'md')}<span><b>${esc(t.name)}</b><small class="muted">${esc(t.stadium || '')}</small></span><small class="muted">${rec(t.abbr)}</small>${state.roster.length ? `<span class="ovr ovr-avg" title="OVR médio dos titulares">${Math.round(teamStrength(state.roster, t.abbr))}</span>` : ''}</a>`).join('')}</div>`).join('')}</div>`).join('')}`;
  content.querySelectorAll('[data-conf]').forEach(b => b.onclick = () => { f.conf = b.dataset.conf; franchisesView(ctx); });
}

export function collegesView(ctx) {
  const { state, content } = ctx;
  ctx.setTitle('College Explorer', 'Universidades representadas no roster profissional');
  const map = {};
  state.roster.forEach(p => { if (p.college) map[p.college] = (map[p.college] || 0) + 1; });
  const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
  content.innerHTML = `<div class="panel"><div class="panel-h"><b>Colleges com mais atletas</b><small class="muted">clique para ver os atletas</small></div><div class="college-cloud">${arr.slice(0, 100).map(([c, n]) => `<button class="college-btn" data-c="${esc(c)}">${esc(c)} <b>${n}</b></button>`).join('')}</div></div><div id="colList"></div>`;
  content.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    const list = state.roster.filter(p => p.college === b.dataset.c).map(p => ({ p, o: ratingsOf(p).o })).sort((a, b2) => b2.o - a.o);
    content.querySelector('#colList').innerHTML = `<div class="panel"><div class="panel-h"><b>${esc(b.dataset.c)}</b><small class="muted">${list.length} atletas</small></div><div class="leaders wide">${list.map(({ p, o }) => `<a class="leader" href="#player/${encodeURIComponent(pid(p))}">${avatar(p, 'sm')}<div><b>${esc(p.full_name)}</b><small>${esc(p.team)} · ${esc(p.depth_chart_position || p.position)}</small></div>${ovrBadge(o)}</a>`).join('')}</div></div>`;
  });
}

export function tradesView(ctx) {
  const { state, content, toast } = ctx;
  ctx.setTitle('Trade Center', 'Negociações com valor interno do simulador (OVR × idade)');
  const myTeam = state.career?.team || 'SEA';
  const opts = sel => state.teams.map(t => `<option value="${t.abbr}" ${t.abbr === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  content.innerHTML = `<div class="panel"><div class="toolbar"><select id="ta">${opts(myTeam)}</select><span class="muted">⇄</span><select id="tb">${opts(myTeam === 'NE' ? 'BUF' : 'NE')}</select></div>
    <div class="trade-cols"><div class="select-list" id="listA"></div><div class="trade-mid"><button class="primary" id="offer">Propor trade ⇄</button><div id="tradeResult"></div></div><div class="select-list" id="listB"></div></div></div>`;
  const $ = s => content.querySelector(s);
  const fill = () => {
    for (const side of ['A', 'B']) {
      const team = $('#t' + side.toLowerCase()).value;
      const list = state.roster.filter(p => p.team === team && p.status === 'ACT').map(p => ({ p, o: ratingsOf(p).o })).sort((a, b) => b.o - a.o).slice(0, 60);
      $('#list' + side).innerHTML = list.map(({ p, o }) => `<label class="select-row"><input type="checkbox" data-id="${esc(pid(p))}">${avatar(p, 'xs')}<span>${esc(p.full_name)} <small class="muted">${esc(p.depth_chart_position || p.position)} · ${p.age ?? '—'}a</small></span>${ovrBadge(o)}</label>`).join('');
    }
  };
  $('#ta').onchange = fill; $('#tb').onchange = fill; fill();
  $('#offer').onclick = () => {
    const picked = s => [...$('#list' + s).querySelectorAll('input:checked')].map(i => state.roster.find(p => pid(p) === i.dataset.id));
    const A = picked('A'), B = picked('B');
    const value = xs => Math.round(xs.reduce((n, p) => n + ratingsOf(p).o * Math.max(0.55, 1 - ((p.age || 25) - 25) * 0.018), 0));
    const va = value(A), vb = value(B), gap = Math.abs(va - vb) / Math.max(1, Math.max(va, vb));
    const ok = A.length && B.length && gap < 0.22;
    $('#tradeResult').innerHTML = `<div class="rcard tone-${ok ? 'good' : 'bad'}"><div class="rc-title">${ok ? 'TRADE ACEITO' : 'TRADE RECUSADO'}</div><div class="muted">Valor A ${va} · B ${vb} · diferença ${(gap * 100).toFixed(1)}%</div></div>`;
    if (ok && state.career) {
      state.career.trades.push({ week: state.career.week, a: A.map(x => x.full_name), b: B.map(x => x.full_name) });
      state.career.news.unshift({ week: state.career.week, text: `Trade: ${A.map(x => x.full_name).join(', ')} ⇄ ${B.map(x => x.full_name).join(', ')}` });
      if (state.settings.save.autosave) ctx.autosave(true);
      toast('Trade registrado na carreira');
    }
  };
}

export function medicalView(ctx) {
  const { state, content } = ctx;
  ctx.setTitle('Departamento Médico', 'Lesões da carreira (afastam o atleta das partidas da carreira)');
  const c = state.career;
  if (!c) { content.innerHTML = '<div class="panel"><p class="muted">Sem carreira ativa.</p><a class="btn primary" href="#career">Criar carreira</a></div>'; return; }
  const team = state.roster.filter(p => p.team === c.team);
  content.innerHTML = `<div class="panel"><div class="panel-h"><b>${esc(c.team)} · lesões ativas</b><button id="newInj">Gerar evento de lesão de teste</button></div>
    ${c.injuries.length ? c.injuries.map(i => { const p = team.find(x => pid(x) === i.id || x.full_name === i.name); return `<div class="inj-row">${p ? avatar(p, 'sm') : ''}<span><b>${esc(i.name)}</b> <small class="muted">${esc(i.position)} · ${esc(i.type)} · desde a semana ${i.week ?? '—'}</small></span><b class="bad">${i.weeks} sem.</b></div>`; }).join('') : '<p class="muted">Nenhuma lesão registrada.</p>'}</div>`;
  content.querySelector('#newInj').onclick = () => { generateInjury(c, state.roster); if (state.settings.save.autosave) ctx.autosave(true); medicalView(ctx); };
}

export function rivalriesView(ctx) {
  const { state, content } = ctx;
  ctx.setTitle('Rivalidades', 'Índice 0–100 · rivalidades históricas e divisionais');
  const fixed = [['GB', 'CHI', 100], ['PIT', 'BAL', 98], ['DAL', 'PHI', 97], ['ATL', 'NO', 95], ['KC', 'LV', 94], ['SF', 'SEA', 93], ['CLE', 'PIT', 92], ['NYG', 'PHI', 91], ['NE', 'NYJ', 90], ['CHI', 'DET', 86]];
  const T = a => state.teams.find(t => t.abbr === a);
  content.innerHTML = `<div class="riv-grid">${fixed.map(([a, b, s]) => `<div class="panel riv"><div class="riv-teams">${teamLogo(T(a), 'md')}<span>vs</span>${teamLogo(T(b), 'md')}</div><b>${esc(T(a).name)} × ${esc(T(b).name)}</b><div class="bar"><div class="fill a-low" style="width:${s}%"></div></div><small class="muted">Rivalry Score ${s}/100</small></div>`).join('')}</div>`;
}

export function championsView(ctx) {
  const { state, content } = ctx;
  ctx.setTitle('Histórico de Campeões', 'Super Bowl I ao LX');
  content.innerHTML = `<div class="champion-list">${state.champions.slice().reverse().map(c => `<div class="champ"><span class="badge">SB ${c.sb} · ${c.year}</span><b>${esc(c.champion)}</b><small class="muted">${esc(c.score)} vs ${esc(c.runnerUp)}</small></div>`).join('')}</div>`;
}

export function dataView(ctx) {
  const { state, content } = ctx;
  ctx.setTitle('Dados & Fotos', 'Sincronização, cache e integridade');
  const withUrl = state.roster.filter(p => !!p.headshot_url).length, withEspn = state.roster.filter(p => !p.headshot_url && p.espn_id).length;
  const none = state.roster.length - withUrl - withEspn;
  content.innerHTML = `<div class="dash-grid"><div class="panel"><div class="panel-h"><b>Fonte do roster</b><small class="muted">nflverse · roster_2026.csv</small></div>
    <div class="kpis">${[['Registros', state.roster.length], ['headshot_url', withUrl], ['Via ESPN ID', withEspn], ['Silhueta', none]].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    <div class="call-actions"><button id="sync2" class="primary">Sincronizar agora</button><button id="importCsv">Importar roster_2026.csv</button></div></div>
    <div class="panel span2"><div class="panel-h"><b>Política de imagem</b></div><p class="muted">Fotos: <b>headshot_url</b> do roster → <b>ESPN</b> por ID → silhueta local. URLs que falham são lembradas na sessão (sem novas tentativas a cada render). Logos e fotos não são redistribuídos: são carregados das URLs públicas em tempo de execução.</p><p class="muted">Dados textuais ficam em cache local após a primeira sincronização (<code>asu_roster_2026</code>).</p></div></div>`;
  content.querySelector('#sync2').onclick = ctx.sync;
  content.querySelector('#importCsv').onclick = () => document.querySelector('#csvFile').click();
}
