// End-of-game presentation shared by NFL/NHL/MLB: a broadcast-style "FINAL" card over the 2D canvas.
// showFinal(host, data) → dispose. `host` = the canvas wrapper (position:relative). Pure presentation: every number comes from `data`.
//   data = { sport, ot?:string ('OT'|'SO'|'F/10'), home:{abbr,name,color,score}, away:{...},
//            periods:{labels:[], home:[], away:[]}, stats:[{label, home, away, fmt?}], stars:[{name, team, line}],
//            note?:string, actions:[{id,label,primary?,onClick}] }
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
export function showFinal(host, d) {
  hideFinal(host);
  const win = d.home.score === d.away.score ? null : d.home.score > d.away.score ? 'home' : 'away';
  const side = k => { const t = d[k]; return `<div class="fin-team ${win === k ? 'win' : win ? 'lose' : ''}" style="--tc:${esc(t.color || '#335')}"><b>${esc(t.abbr)}</b><small>${esc(t.name || '')}</small><span class="fin-score">${esc(t.score)}</span></div>`; };
  const P = d.periods, line = P && P.labels?.length ? `<table class="fin-line"><thead><tr><th></th>${P.labels.map(l => `<th>${esc(l)}</th>`).join('')}<th>T</th></tr></thead><tbody>${['away', 'home'].map(k => `<tr><td>${esc(d[k].abbr)}</td>${P[k].map(v => `<td>${esc(v)}</td>`).join('')}<td><b>${esc(d[k].score)}</b></td></tr>`).join('')}</tbody></table>` : '';
  const stat = s => { const a = +s.away || 0, h = +s.home || 0, tot = a + h || 1; const f = v => (s.fmt ? s.fmt(v) : v);
    return `<div class="fin-stat"><span>${esc(f(s.away))}</span><div class="fin-bar"><i style="width:${(a / tot * 100).toFixed(1)}%;background:${esc(d.away.color || '#47c')}"></i><i style="width:${(h / tot * 100).toFixed(1)}%;background:${esc(d.home.color || '#c74')}"></i></div><span>${esc(f(s.home))}</span><em>${esc(s.label)}</em></div>`; };
  const el = host.ownerDocument.createElement('div'); el.className = 'fin-overlay'; el.dataset.sport = d.sport || '';
  el.innerHTML = `<div class="fin-card"><div class="fin-head"><span class="fin-tag">FINAL${d.ot ? ` · ${esc(d.ot)}` : ''}</span></div>
    <div class="fin-scoreboard">${side('away')}<span class="fin-at">@</span>${side('home')}</div>${line}
    ${d.note ? `<div class="fin-note">${esc(d.note)}</div>` : ''}
    <div class="fin-cols">${d.stats?.length ? `<div class="fin-stats">${d.stats.map(stat).join('')}</div>` : ''}
    ${d.stars?.length ? `<div class="fin-stars"><h4>Destaques</h4>${d.stars.map((s, i) => `<div class="fin-star"><b>${'★'.repeat(3 - i)}</b><span><strong>${esc(s.name)}</strong> <small>${esc(s.team)}</small><br><em>${esc(s.line)}</em></span></div>`).join('')}</div>` : ''}</div>
    <div class="fin-actions">${(d.actions || []).map(a => `<button data-id="${esc(a.id)}" class="${a.primary ? 'primary' : ''}">${esc(a.label)}</button>`).join('')}</div></div>`;
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const a = (d.actions || []).find(x => x.id === b.dataset.id); a?.onClick?.(); });
  host.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
  return () => hideFinal(host);
}
export function hideFinal(host) { host.querySelectorAll(':scope > .fin-overlay').forEach(e => e.remove()); }
