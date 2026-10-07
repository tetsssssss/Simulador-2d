// Dashboard + Calendar screens.
import { A, S, $, esc, nn, fix, money, pct, meter, chip, crest, tcolor, tname, myAbbr, registerScreen, pageTitle, panel, on, onChange, go, stopText, userResultsText, curveSvg, ovrBadge, stTxt, roleTxt, PHASE_LABEL, SPORT_ROUTE, careerHash, touch, refresh } from '../core.js';

export const objectivesHtml = list => (list || []).map(g => {
  const p = Number.isFinite(+g.pct) ? Math.max(0, Math.min(1, +g.pct)) : null, icon = g.status === 'done' ? '✅' : g.status === 'failed' ? '❌' : g.onTrack === false ? '⚠️' : '◻️';
  return `<div class="goal"><span class="gst" aria-hidden="true">${icon}</span><span style="flex:1">${esc(g.text)}${g.value != null && g.target != null ? ` <small class="muted">(${esc(fix(g.value, g.value % 1 ? 2 : 0))} / ${esc(fix(g.target, g.target % 1 ? 2 : 0))})</small>` : ''}</span>${p != null ? `<span class="bar2" style="width:80px" title="${Math.round(p * 100)}%"><i style="width:${(p * 100).toFixed(0)}%"></i></span>` : ''}</div>`;
}).join('') || '<p class="muted">Sem objetivos no momento.</p>';
export const newsItems = (items, n = 8) => `<div class="news-list">${(items || []).slice(0, n).map(x => `<article class="news-it i${x.imp} k-${esc(x.kind)}"><h4>${esc(x.h)}</h4>${x.b ? `<p>${esc(x.b)}</p>` : ''}<small>${esc(x.date)} · ${esc(x.kind)} · <span class="dots" aria-label="importância ${x.imp}">${'●'.repeat(x.imp || 1)}</span></small></article>`).join('') || '<p class="muted">Sem notícias ainda. Avance o calendário.</p>'}</div>`;
export function relationMeters(c, d) {
  if (c.role === 'PLAYER') { const r = d.relationships; return meter('Confiança do técnico', r.coachTrust, { sub: 'CoachTrust' }) + meter('Relação com companheiros', r.teammates, { sub: 'TeammateRelationship' }) + meter('Confiança da diretoria', r.management, { sub: 'ManagementTrust' }) + meter('Apoio da torcida', r.fans, { sub: 'FanSupport' }); }
  const r = d.relationships;
  return meter('Confiança da diretoria', r.board, { sub: 'quando cai demais, você é demitido' }) + meter('Confiança do elenco', r.squad.trust) + meter('Moral do elenco', r.squad.morale) + meter('Satisfação do elenco', r.squad.satisfaction) + meter('Apoio da torcida', r.fans);
}
const gameCard = (d, c) => {
  const g = d.nextGame; if (!g) return `<p class="muted">${c.phase === 'OFFSEASON' ? 'Offseason: sem jogos até a próxima temporada.' : c.role === 'PLAYER' && !myAbbr() ? 'Você ainda não joga por um clube profissional: acompanhe a Road to Pro.' : 'Sem próximo jogo agendado.'}</p>`;
  const opp = g.opp;
  return `<div class="game-card">${crest(opp, tcolor(opp), 'lg')}<div><div class="vs">${g.home ? 'Em casa vs' : 'Fora @'}</div><b style="font-size:18px">${esc(g.oppName)}</b><div class="muted small">${esc(g.date)} · ${g.today ? '<b class="warn-t">HOJE</b>' : `em ${esc(g.daysAway)} dia(s)`} · ${c.phase === 'PLAYOFFS' ? 'playoffs' : `rodada ${esc(c.slate + 1)}/${esc(c.slates)}`}</div></div>
    <div class="stack">${g.today ? `${S.spec.rostersFor2D && SPORT_ROUTE[c.sport] ? '<button data-act="play2d">🎮 Jogar no 2D</button>' : ''}<button class="primary" data-act="play-game">⚡ Simular jogo</button>` : '<button class="primary" data-act="adv" data-adv="NEXT_GAME">Ir até o jogo ▶</button>'}</div></div>`;
};
const alertsHtml = d => d.alerts.map(a => `<div class="alert ${esc(a.level)}"><span class="grow">${a.level === 'event' ? '📨' : a.level === 'bad' ? '⛔' : a.level === 'warn' ? '⚠️' : 'ℹ️'} ${esc(a.text)}</span>${a.kind === 'EVENT' ? '<button data-act="open-events">Decidir</button>' : ['CAP', 'ROSTER_MAX', 'ROSTER_MIN', 'ACTIVE_26', 'FORTY', 'ACTIVE_NOT_40', 'PITCHERS', 'CATCHERS', 'GOALIES', 'PS_MAX', 'OPTIONS'].includes(a.kind) ? '<button data-act="goto" data-s="roster">Elenco</button>' : a.kind === 'FIRING_WATCH' || a.kind === 'FIRED' ? '<button data-act="goto" data-s="profile">Perfil</button>' : a.kind === 'DEADLINE' ? '<button data-act="goto" data-s="transactions">Trocas</button>' : ''}</div>`).join('') || '<p class="muted">Nenhum alerta. Tudo em ordem.</p>';
on('goto', el => go(el.dataset.s));

registerScreen('dashboard', {
  title: 'Painel',
  render(el, d) {
    const c = S.c, spec = S.spec;
    if (c.role === 'PLAYER') return renderPlayerDash(el, d);
    const standingsRows = d.standings.map(t => `<tr class="${t.me ? 'me' : ''}"><td>${esc(t.name)}</td><td class="num">${esc(t.record)}</td><td class="num">${t.pf - t.pa > 0 ? '+' : ''}${esc(t.pf - t.pa)}</td><td>${esc(t.streak)}</td></tr>`).join('');
    const f = d.finance, tr = d.training, tc = d.tactics, sec = d.security;
    el.innerHTML = `${pageTitle('Painel')}<div class="dash-grid"><div class="stack">
      ${panel('Próximo jogo', gameCard(d, c))}
      ${panel('Alertas', alertsHtml(d))}
      ${panel('Divisão', `<table class="tbl"><caption class="sr-only">Classificação da divisão</caption><tr><th>Time</th><th class="num">${spec.usePoints ? 'V-D-OTL' : 'V-D'}</th><th class="num">Saldo</th><th>Seq.</th></tr>${standingsRows}</table>`, `<button class="ghost" data-act="goto" data-s="calendar">Calendário</button>`)}
      ${panel('Notícias importantes', newsItems(d.news, 6), `<button class="ghost" data-act="goto" data-s="news">Ver todas</button>`)}
    </div><div class="stack">
      ${panel('Objetivos da temporada', objectivesHtml(d.objectives))}
      ${sec ? panel('Segurança no cargo', `<div class="chips">${chip(sec.label, sec.level === 'SAFE' ? 'ok' : sec.level === 'WARM' ? 'warn' : 'bad')}</div>${meter('Índice de segurança', sec.score)}<p class="muted small">Confiança da diretoria ${esc(sec.trust)} · objetivos no caminho ${esc(sec.onTrack)}% · elenco ${esc(sec.squad)} · reputação ${esc(sec.rep)}</p>`) : ''}
      ${panel('Relacionamentos', relationMeters(c, d))}
      ${f ? panel('Finanças', `<div class="stat-grid"><div class="stat"><small>Caixa</small><b>${money(f.cash)}</b></div><div class="stat"><small>Orç. folha</small><b>${money(f.budget.payroll)}</b></div><div class="stat"><small>Orç. staff</small><b>${money(f.budget.staff)}</b></div><div class="stat"><small>Orç. instal.</small><b>${money(f.budget.facilities)}</b></div></div>${f.last ? `<p class="muted small">Temporada ${esc(f.last.s)}: receita ${money(f.last.rev)} · despesa ${money(f.last.exp)} · lucro ${money(f.last.profit)}</p>` : ''}`, `<button class="ghost" data-act="goto" data-s="contracts">Contratos</button>`) : ''}
      ${tr ? panel('Treino', `<div class="stat-grid"><div class="stat"><small>Foco</small><b style="font-size:14px">${esc(tr.focus)}</b></div><div class="stat"><small>Carga</small><b>${esc(tr.load)}</b></div><div class="stat"><small>Entrosamento</small><b>${esc(tr.familiarity)}</b></div></div>`, `<button class="ghost" data-act="goto" data-s="training">Plano</button>`) : ''}
      ${tc ? panel('Táticas', `<div class="stat-grid"><div class="stat"><small>Encaixe</small><b>${fix(tc.fit * 100, 0)}%</b></div><div class="stat"><small>Sinergia</small><b>${fix(tc.synergy, 1)}</b></div><div class="stat"><small>Bônus no rating</small><b>${tc.bonus > 0 ? '+' : ''}${fix(tc.bonus, 2)}</b></div></div>`, `<button class="ghost" data-act="goto" data-s="tactics">Editar</button>`) : ''}
      ${panel('Lesões', d.injuries.length ? `<table class="tbl">${d.injuries.map(i => `<tr><td>${esc(i.n)}</td><td>${esc(i.pos)}</td><td>${esc(i.type)}</td><td class="num">${esc(i.games)} jogos</td></tr>`).join('')}</table>` : '<p class="muted">Ninguém lesionado.</p>')}
    </div></div>`;
  },
});

function renderPlayerDash(el, d) {
  const c = S.c, me = c.players[c.me.id], P = A.getProfileView(c), st = P.pathway;
  const team = myAbbr();
  el.innerHTML = `${pageTitle('Painel do jogador')}<div class="dash-grid"><div class="stack">
    ${panel('Próximo jogo', gameCard(d, c))}
    ${panel('Road to Pro', `<div class="timeline" aria-label="Caminho">${st.steps.map(s => `<span class="${s.state === 'current' ? 'on' : ''}" ${s.state === 'current' ? 'aria-current="step"' : ''}>${s.state === 'done' ? '✓ ' : ''}${esc(s.label)}</span>`).join('')}</div><p class="muted small" style="margin-top:8px">Fase atual: <b>${esc(P.stage)}</b> · ${team ? esc(tname(team)) : esc(me.t === 'AMATEUR' ? 'amador' : me.t === 'DRAFT' ? 'aguardando o draft' : me.t === 'FA' ? 'agente livre' : '')}${P.stock ? ` · projeção de draft: <b>${esc(P.stock.label)}</b>` : ''}</p>`)}
    ${panel('Alertas', alertsHtml(d))}
    ${panel('Notícias', newsItems(d.news, 6), `<button class="ghost" data-act="goto" data-s="news">Ver todas</button>`)}
  </div><div class="stack">
    ${panel('Meu jogador', `<div class="stat-grid"><div class="stat"><small>OVR</small><b>${esc(nn(me.ovr))}</b></div><div class="stat"><small>POT</small><b>${esc(nn(me.pot))}</b></div><div class="stat"><small>XP</small><b>${fix(me.xp, 0)}</b></div><div class="stat"><small>Forma</small><b>${me.fm > 0 ? '+' : ''}${fix(me.fm ?? 0, 1)}</b></div><div class="stat"><small>Confiança</small><b>${fix(me.conf ?? 55, 0)}</b></div><div class="stat"><small>Papel</small><b style="font-size:14px">${esc(roleTxt(me.role))}</b></div></div><p class="muted small">Curva: <b>${esc(P.player.curve.label)}</b> · pico previsto ${esc(fix(P.projection.peakOvr, 0))} aos ${esc(P.projection.peakAge)} anos.</p>`, `<button class="ghost" data-act="goto" data-s="development">Desenvolvimento</button>`)}
    ${panel('Relacionamentos', relationMeters(c, d))}
    ${panel('Objetivos', objectivesHtml(d.objectives))}
  </div></div>`;
}

// ---------- calendar ----------
function bracketHtml(c, spec) {
  const po = c.playoffs, mine = A.myTeam(c), names = spec.playoffs.names || [];
  if (!po?.rounds) return '<p class="muted">Os playoffs ainda não começaram.</p>';
  return `<div class="bracket">${po.rounds.map((r, i) => `<div class="col"><small class="muted">${esc(names[i] || `Rodada ${i + 1}`)}</small>${r.series.filter(s => !s.bye).map(s => `<div class="sr ${s.a === mine || s.b === mine ? 'mine' : ''}"><b class="${s.winner === s.a ? 'w' : ''}">${esc(s.a)}</b> ${esc(nn(s.wa, 0))}–${esc(nn(s.wb, 0))} <b class="${s.winner === s.b ? 'w' : ''}">${esc(s.b)}</b></div>`).join('')}</div>`).join('')}${po.champion ? `<div class="col"><small class="muted">Campeão</small><div class="sr mine">🏆 <b class="w">${esc(po.champion)}</b></div></div>` : ''}</div>`;
}
const gameRow = g => `<tr><td class="num">${esc(g.slate + 1)}</td><td>${esc(g.date)}</td><td>${g.home ? 'vs' : '@'} ${crest(g.opp, tcolor(g.opp), 'sm')} ${esc(g.oppName)}</td><td>${g.result ? `<span class="res ${g.result.won ? 'w' : 'l'}">${g.result.won ? 'V' : 'D'}</span> ${esc(g.result.us)}–${esc(g.result.them)}${g.result.ot ? ' (OT)' : ''}` : ''}</td></tr>`;
function reportHtml(adv) {
  if (!adv) return '<p class="muted">Nenhum avanço nesta sessão. Use os botões acima.</p>';
  const r = adv.res, lines = adv.note ? [adv.note] : userResultsText(r);
  return `<dl class="dl"><dt>Modo</dt><dd>${esc(adv.mode)}</dd><dt>Dias avançados</dt><dd>${esc(nn(r.days, 0))}${r.date ? ` → ${esc(r.date)}` : ''}</dd><dt>Fase</dt><dd>${esc(PHASE_LABEL[r.phase] || r.phase || '—')}${r.off ? ` · ${esc(r.off)}` : ''}</dd><dt>Motivo da parada</dt><dd><b>${esc(stopText(r))}</b></dd><dt>Jogos do time</dt><dd>${lines.length ? esc(lines.join(' · ')) : '—'}</dd><dt>Notícias novas</dt><dd>${esc(nn(r.newsAdded, 0))}</dd><dt>Eventos</dt><dd>${esc((r.events || []).length)}</dd>${r.newSeason ? '<dt>Temporada</dt><dd>Nova temporada começou</dd>' : ''}${r.issues?.length ? `<dt>Problemas</dt><dd>${r.issues.map(i => esc(i.text)).join(' · ')}</dd>` : ''}</dl>`;
}
registerScreen('calendar', {
  title: 'Calendário',
  render(el) {
    const c = S.c, spec = S.spec, v = A.getCalendarView(c, { upcoming: 10, past: 8 }), o = S.ui.opt, g = v.nextGame;
    const noTeam = !myAbbr();
    el.innerHTML = `${pageTitle('Calendário', `<span class="chip blue">${esc(v.date)}</span>`)}<div class="dash-grid"><div class="stack">
      ${panel('Avançar o tempo', `<div class="grid3"><button class="pick" data-act="adv" data-adv="NEXT_DAY"><b>Próximo dia</b><small>NEXT_DAY · treino, finanças, scouting, lesões, trocas e notícias de 1 dia.</small></button><button class="pick" data-act="adv" data-adv="NEXT_WEEK"><b>Próxima semana</b><small>NEXT_WEEK · 7 dias; para antes do seu jogo ou de um evento.</small></button><button class="pick on" data-act="adv" data-adv="NEXT_GAME"><b>Próximo jogo</b><small>NEXT_GAME · até o dia do jogo do seu time${noTeam ? ' (sem clube: avança até 45 dias)' : ''}.</small></button></div>
        <div class="stack" style="margin-top:10px"><label class="chk"><input type="checkbox" data-chg="cal-opt" data-k="stopOnEvents" ${o.stopOnEvents ? 'checked' : ''}> Parar quando surgir um evento da carreira</label>
        <label class="chk"><input type="checkbox" data-chg="cal-opt" data-k="autoFix" ${o.autoFix ? 'checked' : ''}> Corrigir elenco/teto automaticamente em dia de jogo (senão o avanço para)</label>
        <label class="chk"><input type="checkbox" data-chg="cal-opt" data-k="includeUser" ${o.includeUser ? 'checked' : ''}> Simular os jogos do meu time durante o avanço (não parar antes deles)</label></div>`)}
      ${panel('Último avanço', reportHtml(S.lastAdv))}
      ${g ? panel('Próximo jogo', `<div class="game-card">${crest(g.opp, tcolor(g.opp), 'lg')}<div><div class="vs">${g.home ? 'Em casa vs' : 'Fora @'}</div><b style="font-size:18px">${esc(g.oppName)}</b><div class="muted small">${esc(g.date)} · ${g.today ? '<b class="warn-t">HOJE</b>' : `em ${esc(g.daysAway)} dia(s)`}</div></div><div class="stack">${g.today ? `${spec.rostersFor2D && SPORT_ROUTE[c.sport] ? '<button data-act="play2d">🎮 Jogar no 2D</button>' : ''}<button class="primary" data-act="play-game">⚡ Simular jogo</button>` : ''}</div></div>`) : ''}
      <div class="grid2">${panel('Próximos jogos', `<table class="tbl"><caption class="sr-only">Próximos jogos</caption><tr><th class="num">#</th><th>Data</th><th>Jogo</th><th>Resultado</th></tr>${v.upcoming.map(gameRow).join('') || `<tr><td colspan="4" class="muted">${noTeam ? 'Sem clube (fase amadora ou agente livre).' : c.phase === 'OFFSEASON' ? 'Offseason: sem jogos agendados.' : 'Nenhum jogo restante.'}</td></tr>`}</table>`)}
      ${panel('Resultados recentes', `<table class="tbl"><caption class="sr-only">Resultados recentes</caption><tr><th class="num">#</th><th>Data</th><th>Jogo</th><th>Resultado</th></tr>${v.recent.map(gameRow).join('') || '<tr><td colspan="4" class="muted">Sem resultados ainda.</td></tr>'}</table>`)}</div>
    </div><div class="stack">
      ${panel('Fases da temporada', `<div class="timeline">${v.stages.map(s => `<span class="${s.current ? 'on' : ''}" ${s.current ? 'aria-current="step"' : ''}>${esc(s.label)}</span>`).join('')}</div><p class="muted small" style="margin-top:8px">Rodada ${esc(Math.min(v.slate + 1, v.slates))}/${esc(v.slates)} · dia ${esc(v.day)}</p>`)}
      ${panel('Prazo de trocas', `<p>${v.deadline.open ? `Janela <b class="pill-ok">aberta</b>${v.phase === 'REGULAR' ? ` · faltam ${esc(Math.max(0, v.deadline.daysLeft))} dia(s) (${esc(v.deadline.date)})` : ''}` : `Janela <b class="pill-bad">fechada</b> (prazo: ${esc(v.deadline.date)})`}</p>`)}
      ${panel('Playoffs', bracketHtml(c, spec))}
    </div></div>`;
  },
});
onChange('cal-opt', el => { S.ui.opt[el.dataset.k] = el.checked; });
