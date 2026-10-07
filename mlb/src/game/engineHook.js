// Plugs the BaseballSimulationEngine into the Partida 2D view (matchHooks extension point in app.js):
// engine factory, commentary/atmosphere context, line score + box score, today's line on the matchup cards, debug.
import { createBaseballEngine } from '../sim/baseballEngine.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const ip = outs => `${Math.floor(outs / 3)}.${outs % 3}`;

export function baseballHook(deps) {
  return {
    ...deps,
    createEngine: ({ home, away, seed }) => createBaseballEngine({ home, away, seed }),
    commentaryCtx: s => {
      const batSide = s.half === 'top' ? 'away' : 'home';
      return {
        name: id => s.roster[id]?.name, last: id => s.roster[id]?.last, team: side => s[side]?.abbr || side,
        score: { ...s.score }, inning: s.inning, half: s.half, outs: s.outs, balls: s.balls, strikes: s.strikes,
        runners: s.runners.map(r => r.base).filter(b => b >= 1 && b <= 3), batSide, fieldSide: batSide === 'home' ? 'away' : 'home', walkoff: !!s.walkoff,
        clockLabel: s.over ? 'FINAL' : `${s.half === 'top' ? '▲' : '▼'}${s.inning} ${s.outs} out`,
      };
    },
    cardExtra: (e, role, s) => {
      const b = s.box?.[e.id]; if (!b) return '';
      return role === 'PITCHER'
        ? `<div class="small">Hoje: ${ip(b.outs)} IP · ${b.ha} H · ${b.ra} R · ${b.ka} K · ${b.bba} BB · ${b.pc} arremessos</div>`
        : `<div class="small">Hoje: ${b.h}-${b.ab}${b.hr ? ` · ${b.hr} HR` : ''}${b.rbi ? ` · ${b.rbi} RBI` : ''}${b.bb ? ` · ${b.bb} BB` : ''}${b.k ? ` · ${b.k} K` : ''}</div>`;
    },
    sidePanels: s => {
      if (!s.box) return '';
      const n = Math.max(9, s.inning);
      const row = side => `<b>${esc(s[side].abbr)}</b>${Array.from({ length: n }, (_, i) => `<span>${s.linescore[side][i] ?? (i < s.inning - 1 || (i === s.inning - 1 && (side === 'away' || s.half === 'bottom')) ? 0 : '')}</span>`).join('')}<span><b>${s.score[side]}</b></span><span>${s.hits[side]}</span><span>${s.errors[side]}</span>`;
      const ls = `<div class="mlb-ls" style="--n:${n}"><span class="h"></span>${Array.from({ length: n }, (_, i) => `<span class="h">${i + 1}</span>`).join('')}<span class="h">R</span><span class="h">H</span><span class="h">E</span>${row('away')}${row('home')}</div>`;
      const bats = side => Object.entries(s.box).map(([id, b]) => ({ r: s.roster[id], b })).filter(x => x.r?.team === side && (x.b.ab || x.b.bb)).slice(0, 9);
      const pits = side => Object.entries(s.box).map(([id, b]) => ({ r: s.roster[id], b })).filter(x => x.r?.team === side && x.b.pc);
      const team = side => `<div class="mlb-bx h"><span>${esc(s[side].abbr)}</span><span>AB</span><span>H</span><span>R</span><span>RBI</span><span>BB</span><span>K</span></div>
        ${bats(side).map(x => `<div class="mlb-bx"><span>${esc(x.r.last)}${x.b.hr ? ` <small>(${x.b.hr} HR)</small>` : ''}</span><span>${x.b.ab}</span><span>${x.b.h}</span><span>${x.b.r}</span><span>${x.b.rbi}</span><span>${x.b.bb}</span><span>${x.b.k}</span></div>`).join('')}
        ${pits(side).map(x => `<div class="mlb-bx"><span>${esc(x.r.last)} (P)</span><span>${ip(x.b.outs)}</span><span>${x.b.ha}</span><span>${x.b.ra}</span><span>—</span><span>${x.b.bba}</span><span>${x.b.ka}</span></div>`).join('')}`;
      return `<div class="panel"><div class="panel-h"><b>Line score</b></div>${ls}${team('away')}${team('home')}</div>`;
    },
    drawDebug: (ctx, cam, s) => {
      ctx.save(); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
      for (const f of s.fielders || []) { if (f.tx == null) continue; ctx.strokeStyle = 'rgba(120,200,255,.7)'; ctx.beginPath(); ctx.moveTo(cam.sx(f.x), cam.sy(f.y)); ctx.lineTo(cam.sx(f.tx), cam.sy(f.ty)); ctx.stroke(); }
      if (s.ball?.landing) { ctx.strokeStyle = 'rgba(255,214,90,.9)'; ctx.beginPath(); ctx.arc(cam.sx(s.ball.landing.x), cam.sy(s.ball.landing.y), 10, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    },
  };
}
