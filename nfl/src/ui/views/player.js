// Player profile: header (photo, bio, OVR), traits, strengths/weaknesses, grouped attributes vs position average,
// comparison with another player, season stats (engine games of the active career), status/injury, data ids.
import { esc, avatar, teamLogo, ovrBadge, ratingsOf, pid, groupOf, keyAttrs, keyForAttribute, heightStr, statusLabel, ATTR_GROUPS, attrBar, positionAverages, traitsOf, strengthsWeaknesses } from '../components.js';

export function playerView(ctx, id) {
  const { state, content, teamBy } = ctx;
  const p = state.roster.find(x => pid(x) === id);
  if (!p) { content.innerHTML = `<div class="panel"><p>Atleta não encontrado.</p><a class="btn" href="#roster">← Roster</a></div>`; return; }
  const T = teamBy(p.team), { r, o } = ratingsOf(p), grp = groupOf(p);
  ctx.setTitle(p.full_name, `${p.depth_chart_position || p.position} · ${T?.name || p.team}`);
  const avg = positionAverages(state.roster, grp);
  const key = new Set(keyAttrs(p));
  const sw = strengthsWeaknesses(p), traits = traitsOf(p);
  const inj = (state.career?.injuries || []).find(i => (i.id || i.name) === pid(p) || i.name === p.full_name);
  const ss = state.career?.seasonStats?.[pid(p)];
  const showAll = state.ui.showAllAttrs;
  const cmpId = state.ui.compare?.[pid(p)];
  const cmp = cmpId ? state.roster.find(x => pid(x) === cmpId) : null;
  const peers = state.roster.filter(x => groupOf(x) === grp && pid(x) !== pid(p)).map(x => ({ x, o: ratingsOf(x).o })).sort((a, b) => b.o - a.o).slice(0, 60);
  const draft = p.draft_club ? `${p.entry_year || ''} · ${p.draft_club} #${p.draft_number || '—'}` : p.entry_year ? `${p.entry_year} · não draftado` : '—';
  const groups = ATTR_GROUPS.map(([g, list]) => {
    const rel = list.some(a => key.has(a));
    if (!showAll && !rel && !['Physical', 'Mental'].includes(g)) return '';
    return `<div class="attr-group ${rel ? 'rel' : ''}"><h4>${g}</h4>${list.map(a => attrBar(a, r[keyForAttribute(a)], avg[keyForAttribute(a)], key.has(a))).join('')}</div>`;
  }).join('');
  const statLine = (title, obj, cols) => obj && Object.values(obj).some(v => v) ? `<tr><td><b>${title}</b></td>${cols.map(([k, l]) => `<td><small class="muted">${l}</small> ${obj[k] ?? 0}</td>`).join('')}</tr>` : '';
  const cmpBlock = cmp ? (() => { const cr = ratingsOf(cmp).r; return `<div class="cmp">${keyAttrs(p).map(a => { const k = keyForAttribute(a), va = r[k], vb = cr[k]; return `<div class="cmp-row"><b class="${va >= vb ? 'win' : ''}">${va}</b><div class="cmp-bars"><i style="width:${va / 2}%"></i><span>${esc(a)}</span><i class="b" style="width:${vb / 2}%"></i></div><b class="${vb > va ? 'win' : ''}">${vb}</b></div>`; }).join('')}</div>`; })() : '<p class="muted small">Escolha um atleta da mesma posição para comparar os atributos-chave.</p>';

  content.innerHTML = `
  <a class="back" href="#roster/${esc(p.team)}">← ${esc(T?.name || 'Roster')}</a>
  <section class="profile-hero" style="--tc:${T?.color || '#24364d'}">
    ${avatar(p, 'xl')}
    <div class="ph-main"><div class="ph-top"><span class="ph-num">#${esc(p.jersey_number || '—')}</span><span class="badge">${esc(p.depth_chart_position || p.position)}</span>${teamLogo(T, 'sm')}<span class="muted">${esc(T?.name || p.team)}</span></div>
      <h2>${esc(p.full_name)}</h2>
      <div class="ph-bio">${[['Idade', p.age ?? '—'], ['College', p.college], ['Experiência', `${p.years_exp} ${p.years_exp === 1 ? 'ano' : 'anos'}`], ['Altura', heightStr(p.height)], ['Peso', p.weight ? `${p.weight} lb` : '—'], ['Draft', draft], ['Status', inj ? `✚ ${inj.type} (${inj.weeks} sem.)` : statusLabel(p.status)]].map(([l, v]) => `<div><small>${l}</small><b>${esc(v)}</b></div>`).join('')}</div>
      <div class="traits">${traits.map(t => `<span class="trait">${esc(t)}</span>`).join('') || '<span class="muted small">Sem traits de destaque</span>'}</div></div>
    <div class="ph-ovr"><small>OVERALL</small>${ovrBadge(o, true)}<small class="muted">escala 1–200 · ${esc(grp)}</small></div>
  </section>
  <div class="profile-grid">
    <div class="panel"><div class="panel-h"><b>Pontos fortes</b></div>${sw.strengths.map(([a, v]) => `<div class="sw good"><span>${esc(a)}</span><b>${v}</b></div>`).join('')}
      <div class="panel-h" style="margin-top:10px"><b>Pontos fracos</b></div>${sw.weaknesses.map(([a, v]) => `<div class="sw bad"><span>${esc(a)}</span><b>${v}</b></div>`).join('')}</div>
    <div class="panel"><div class="panel-h"><b>Temporada ${state.career?.season || ''}</b><small class="muted">${ss ? `${ss.gp} jogo(s) no motor` : ''}</small></div>
      ${ss ? `<table class="table compact"><tbody>${statLine('Passe', ss.pass, [['cmp', 'Cmp'], ['att', 'Att'], ['yds', 'Jds'], ['td', 'TD'], ['int', 'INT']])}${statLine('Corrida', ss.rush, [['att', 'Att'], ['yds', 'Jds'], ['td', 'TD'], ['ybc', 'YBC'], ['yac', 'YAC'], ['mtf', 'MTF']])}${statLine('Recepção', ss.rec, [['rec', 'Rec'], ['tgt', 'Alvos'], ['yds', 'Jds'], ['td', 'TD'], ['drops', 'Drops']])}${statLine('Defesa', ss.def, [['tkl', 'Tkl'], ['ast', 'Ast'], ['sacks', 'Sk'], ['int', 'INT'], ['pd', 'PD']])}</tbody></table>` : '<p class="muted">Sem jogos registrados nesta temporada (as estatísticas vêm dos jogos da carreira simulados pelo motor).</p>'}
      <div class="panel-h" style="margin-top:10px"><b>Carreira / Contrato</b></div><p class="muted small">Histórico de carreira e contratos: previstos para uma próxima versão.</p></div>
    <div class="panel"><div class="panel-h"><b>Comparar</b><select id="cmpSel"><option value="">—</option>${peers.map(({ x, o: po }) => `<option value="${esc(pid(x))}" ${cmpId === pid(x) ? 'selected' : ''}>${esc(x.full_name)} · ${esc(x.team)} · ${po}</option>`).join('')}</select></div>
      ${cmp ? `<div class="cmp-head"><span>${avatar(p, 'sm')} ${esc(p.full_name.split(' ').slice(-1)[0])}</span><span>${esc(cmp.full_name.split(' ').slice(-1)[0])} ${avatar(cmp, 'sm')}</span></div>` : ''}${cmpBlock}</div>
  </div>
  <div class="panel"><div class="panel-h"><b>Atributos</b><small class="muted">barra = nota · marcador = média da posição (${esc(grp)}) · ★ atributos-chave</small><label class="chk"><input type="checkbox" id="allAttrs" ${showAll ? 'checked' : ''}> mostrar todos os grupos</label></div>
    <div class="attr-groups">${groups}</div></div>
  <div class="panel muted small">IDs: GSIS ${esc(p.gsis_id || '—')} · ESPN ${esc(p.espn_id || '—')} · depth ${esc(p.depth_chart_position || '—')} · foto: ${p.headshot_url ? 'headshot_url do roster' : p.espn_id ? 'ESPN (por ID)' : 'silhueta (sem foto pública)'}</div>`;
  content.querySelector('#allAttrs').onchange = e => { state.ui.showAllAttrs = e.target.checked; playerView(ctx, id); };
  content.querySelector('#cmpSel').onchange = e => { (state.ui.compare ||= {})[pid(p)] = e.target.value; playerView(ctx, id); };
}
