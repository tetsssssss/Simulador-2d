// Home / Dashboard: franchise hero, next game, last result, division, injuries, leaders, news, schedule, team stats.
import { esc, avatar, teamLogo, ovrBadge, ratingsOf, pid } from '../components.js';
import { nextGame, lastGame, divisionTable, leagueRank, teamStrength, pct } from '../../game/career.js';
import { buildLineups } from '../../nflEngine.js';

const rec = s => `${s.w}-${s.l}${s.t ? '-' + s.t : ''}`;

export function homeView(ctx) {
  const { state, content, teamBy, navigate } = ctx;
  const c = state.career;
  if (!c) return welcome(ctx);
  ctx.setTitle('Home', `${c.name} · Temporada ${c.season}`);
  const T = teamBy(c.team), ng = nextGame(c), lg = lastGame(c);
  const st = c.standings[c.team] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  const div = divisionTable(c, state.teams), divPos = div.findIndex(x => x.t.abbr === c.team) + 1;
  const rank = leagueRank(c, state.teams);
  const team = state.roster.filter(p => p.team === c.team);
  const starters = state.roster.length ? buildLineups(state.roster, c.team, c.team) : { offense: [], defense: [] };
  const leaders = [...starters.offense, ...starters.defense].map(p => ({ p, o: ratingsOf(p).o })).sort((a, b) => b.o - a.o).slice(0, 6);
  const oppT = ng ? teamBy(ng.opp) : null;
  const strength = abbr => (state.roster.length ? Math.round(teamStrength(state.roster, abbr)) : '—');
  const ts = c.teamStats || { games: 0 };
  const per = k => (ts.games ? (ts[k] / ts.games).toFixed(1) : '—');
  const sched = c.schedule.filter(g => !g.result?.legacy);
  const curIdx = sched.findIndex(g => !g.result);
  const window5 = sched.slice(Math.max(0, (curIdx < 0 ? sched.length : curIdx) - 3), Math.max(0, (curIdx < 0 ? sched.length : curIdx) - 3) + 6);

  content.innerHTML = `
  <section class="hero" style="--tc:${T.color}">
    <div class="hero-id">${teamLogo(T, 'xl')}<div><small class="eyebrow">${esc(T.conference)} ${esc(T.division)} · ${esc(T.stadium || '')}</small><h2>${esc(T.name)}</h2>
      <div class="hero-meta"><span class="rec">${rec(st)}</span><span>${divPos}º na divisão</span><span>#${rank} na liga</span><span>PF ${st.pf} · PA ${st.pa}</span><span>OVR ${strength(c.team)}</span></div></div></div>
    <div class="hero-next">${ng ? `<small class="eyebrow">Próximo jogo · Semana ${ng.week}</small>
      <div class="hn-match">${teamLogo(oppT, 'lg')}<div><b>${ng.home ? 'vs' : '@'} ${esc(oppT.name)}</b><small>${rec(c.standings[ng.opp] || { w: 0, l: 0, t: 0 })} · OVR ${strength(ng.opp)}</small></div></div>
      <div class="hn-actions"><button class="primary" id="playNext">▶ Jogar</button><button id="simNext">⏭ Simular</button></div>` : `<small class="eyebrow">Temporada encerrada</small><h3>${rec(st)}</h3>`}
    </div>
  </section>
  <div class="dash-grid">
    <div class="panel"><div class="panel-h"><b>Último resultado</b></div>${lg ? `<div class="last-res ${lg.result.w}">${teamLogo(teamBy(lg.opp), 'md')}<div><b>${lg.result.w} ${lg.result.us}-${lg.result.them}</b><small>Semana ${lg.week} ${lg.home ? 'vs' : '@'} ${esc(lg.opp)}</small></div></div>` : '<p class="muted">Nenhum jogo disputado.</p>'}
      <div class="panel-h" style="margin-top:12px"><b>Calendário</b><a href="#career">ver tudo</a></div>
      <div class="sched">${window5.map(g => `<div class="sched-row ${g.result ? 'done' : g === ng ? 'next' : ''}"><span>S${g.week}</span>${teamLogo(teamBy(g.opp), 'xs')}<span>${g.home ? 'vs' : '@'} ${esc(g.opp)}</span><b class="${g.result?.w || ''}">${g.result ? `${g.result.w} ${g.result.us}-${g.result.them}` : g === ng ? 'PRÓXIMO' : ''}</b></div>`).join('')}</div>
    </div>
    <div class="panel"><div class="panel-h"><b>${esc(T.conference)} ${esc(T.division)}</b><small class="muted">W-L-T · PF · PA</small></div>
      <table class="table compact standings"><tbody>${div.map((x, i) => `<tr class="${x.t.abbr === c.team ? 'me' : ''}"><td>${i + 1}</td><td>${teamLogo(x.t, 'xs')} ${esc(x.t.abbr)}</td><td>${rec(x.s)}</td><td>${pct(x.s).toFixed(3).replace(/^0/, '')}</td><td>${x.s.pf}</td><td>${x.s.pa}</td></tr>`).join('')}</tbody></table>
      <div class="panel-h" style="margin-top:12px"><b>Estatísticas do time</b><small class="muted">${ts.games || 0} jogos no motor</small></div>
      <div class="kpis">${[['Pts/j', ts.games ? (st.pf / Math.max(1, st.w + st.l + st.t)).toFixed(1) : '—'], ['Jds/j', per('yards')], ['Passe/j', per('passYds')], ['Corrida/j', per('rushYds')], ['TO', ts.turnovers ?? '—'], ['Sacks sof.', ts.sacksAllowed ?? '—']].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    </div>
    <div class="panel"><div class="panel-h"><b>Destaques do elenco</b><a href="#depth/${c.team}">depth chart</a></div>
      <div class="leaders">${leaders.map(({ p, o }) => `<a class="leader" href="#player/${encodeURIComponent(pid(p))}">${avatar(p, 'md')}<div><b>${esc(p.full_name)}</b><small>${esc(p.depth_chart_position || p.position)} · #${esc(p.jersey_number || '—')}</small></div>${ovrBadge(o)}</a>`).join('') || '<p class="muted">Roster não carregado.</p>'}</div>
    </div>
    <div class="panel"><div class="panel-h"><b>Lesões</b><a href="#medical">médico</a></div>
      ${c.injuries.length ? c.injuries.slice(0, 5).map(i => { const p = team.find(x => (x.gsis_id || x.full_name) === i.id || x.full_name === i.name); return `<div class="inj-row">${p ? avatar(p, 'xs') : ''}<span><b>${esc(i.name)}</b> <small class="muted">${esc(i.position)} · ${esc(i.type)}</small></span><b class="bad">${i.weeks} sem.</b></div>`; }).join('') : '<p class="muted">Elenco saudável.</p>'}
      <div class="panel-h" style="margin-top:12px"><b>Transações</b><a href="#trades">trades</a></div>
      ${c.trades.length ? c.trades.slice(-4).reverse().map(t => `<div class="news-row"><small>S${t.week}</small><span>${esc(t.a.join(', '))} ⇄ ${esc(t.b.join(', '))}</span></div>`).join('') : '<p class="muted">Nenhuma transação.</p>'}
    </div>
    <div class="panel span2"><div class="panel-h"><b>Notícias</b></div>${c.news.slice(0, 8).map(n => `<div class="news-row"><small>S${n.week}</small><span>${esc(n.text)}</span></div>`).join('')}</div>
    <div class="panel"><div class="panel-h"><b>Atalhos</b></div><div class="shortcuts">
      <a href="#play" class="sc">▶<b>Partida 2D</b></a><a href="#roster/${c.team}" class="sc">☰<b>Roster</b></a><a href="#depth/${c.team}" class="sc">⇅<b>Depth chart</b></a>
      <a href="#career" class="sc">★<b>Saves</b></a><a href="#settings" class="sc">⚙<b>Sliders</b></a><a href="#trades" class="sc">⇄<b>Trades</b></a></div></div>
  </div>`;
  const pn = content.querySelector('#playNext');
  if (pn) pn.onclick = () => { state.setup = { ...(state.setup || {}), mode: 'CAREER' }; if (state.match && state.match.mode !== 'CAREER') state.match.suspended = true; navigate('play'); };
  const sn = content.querySelector('#simNext');
  if (sn) sn.onclick = async () => {
    sn.disabled = true; sn.textContent = 'Simulando…';
    const me = c.team, home = ng.home ? me : ng.opp, away = ng.home ? ng.opp : me;
    await ctx.simCareerGame({ home, away, seed: `${c.seed}-W${ng.week}`, quarterMin: state.settings.gameplay.quarterMin });
    ctx.render();
  };
}

function welcome(ctx) {
  const { state, content, teamBy } = ctx;
  ctx.setTitle('Home', 'NFL Universe 2D · temporada 2026');
  const slots = ctx.sm.slots().filter(s => s.status === 'ok');
  const act = state.roster.filter(p => p.status === 'ACT').length;
  const champs = {};
  state.champions.forEach(c => { champs[c.champion] = (champs[c.champion] || 0) + 1; });
  const top = Object.entries(champs).sort((a, b) => b[1] - a[1]).slice(0, 5);
  content.innerHTML = `
  <section class="hero welcome" style="--tc:#123a63"><div class="hero-id"><div class="brand-mark big">ASU</div><div><small class="eyebrow">American Sports Universe 2D</small><h2>NFL Universe 2D</h2>
    <div class="hero-meta"><span>${state.teams.length} franquias</span><span>${state.roster.length.toLocaleString('pt-BR') || '—'} atletas</span><span>${act || '—'} ativos</span><span>motor 2D 30 Hz</span></div></div></div>
    <div class="hero-next"><small class="eyebrow">Comece por aqui</small><div class="hn-actions col"><a class="btn primary" href="#career">★ Nova carreira</a><a class="btn" href="#play">⚡ Quick Game</a></div></div></section>
  <div class="dash-grid">
    <div class="panel"><div class="panel-h"><b>Saves</b><a href="#career">gerenciar</a></div>${slots.length ? slots.map(s => `<div class="save-row">${teamLogo(teamBy(s.save.metadata.team), 'sm')}<span><b>${esc(s.save.metadata.name)}</b><small class="muted">${esc(s.save.metadata.record)} · semana ${s.save.metadata.week}</small></span><button data-load="${s.slot}">Carregar</button></div>`).join('') : '<p class="muted">Nenhum save ainda.</p>'}</div>
    <div class="panel"><div class="panel-h"><b>Modos de jogo</b></div><div class="shortcuts">
      <a href="#play" class="sc">⚡<b>Quick Game</b></a><a href="#play" class="sc">📋<b>Coach</b></a><a href="#play" class="sc">📺<b>Spectator</b></a><a href="#play" class="sc">🧪<b>Sandbox</b></a></div></div>
    <div class="panel"><div class="panel-h"><b>Maiores campeões</b><a href="#champions">histórico</a></div>${top.map(([n, v]) => `<div class="news-row"><b>${v}×</b><span>${esc(n)}</span></div>`).join('')}</div>
    <div class="panel span3"><div class="panel-h"><b>Franquias</b><a href="#franchises">todas</a></div><div class="logo-strip">${state.teams.map(t => `<a href="#roster/${t.abbr}" title="${esc(t.name)}">${teamLogo(t, 'md')}</a>`).join('')}</div></div>
  </div>`;
  content.querySelectorAll('[data-load]').forEach(b => b.onclick = () => { if (ctx.loadSlot(+b.dataset.load)) ctx.render(); });
}
