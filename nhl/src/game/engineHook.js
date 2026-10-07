// Plugs the HockeySimulationEngine into the Partida 2D view (matchHooks extension point in app.js):
// engine factory, commentary/atmosphere context, box score panel and the role/target debug overlay.
import { createHockeyEngine } from '../sim/hockeyEngine.js';
import { RINK } from '../rink/geometry.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const clk = c => `${Math.floor(Math.max(0, c) / 60)}:${String(Math.floor(Math.max(0, c) % 60)).padStart(2, '0')}`;

export function hockeyHook(deps) {
  return {
    ...deps,
    createEngine: ({ home, away, seed }) => createHockeyEngine({ home, away, seed }),
    commentaryCtx: s => {
      const att = s.possession, u = att ? (s.puck.x - RINK.center) * s.attack[att] : 0;
      return {
        name: id => s.roster[id]?.name, last: id => s.roster[id]?.last, team: side => s[side]?.abbr || side,
        score: { ...s.score }, period: s.period, clock: s.clock, powerPlay: s.powerPlay, possession: s.possession, inZone: u > 25,
        clockLabel: s.over ? 'FINAL' : `${['1º', '2º', '3º', 'OT'][Math.min(3, s.period - 1)]} ${clk(s.clock)}`,
      };
    },
    sidePanels: s => {
      if (!s.box) return '';
      const rows = side => Object.entries(s.box).map(([id, b]) => ({ r: s.roster[id], b })).filter(x => x.r && x.r.team === side && !x.r.goalie && x.b.toi > 0)
        .sort((a, b) => (b.b.g * 2 + b.b.a) - (a.b.g * 2 + a.b.a) || b.b.sog - a.b.sog).slice(0, 7);
      const gl = side => Object.entries(s.box).map(([id, b]) => ({ r: s.roster[id], b })).filter(x => x.r && x.r.team === side && x.r.goalie && x.b.toi > 0);
      const tot = (side, k) => Object.entries(s.box).reduce((a, [id, b]) => a + (s.roster[id]?.team === side ? b[k] : 0), 0);
      const fo = side => { const w = tot(side, 'fow'), t = tot(side, 'fot'); return t ? Math.round(100 * w / t) + '%' : '—'; };
      const team = side => `<div class="nhl-bx"><div class="nhl-bx-h"><b>${esc(s[side].abbr)}</b><span>G</span><span>A</span><span>SOG</span><span>HIT</span><span>BLK</span><span>+/-</span></div>
        ${rows(side).map(x => `<div class="nhl-bx-r"><span>${esc(x.r.last)}</span><span>${x.b.g}</span><span>${x.b.a}</span><span>${x.b.sog}</span><span>${x.b.hit}</span><span>${x.b.blk}</span><span>${x.b.pm > 0 ? '+' : ''}${x.b.pm}</span></div>`).join('')}
        ${gl(side).map(x => `<div class="nhl-bx-r g"><span>${esc(x.r.last)} (G)</span><span class="wide">${x.b.sv}/${x.b.sa} SV${x.b.sa ? ' · ' + (x.b.sv / x.b.sa).toFixed(3).replace(/^0/, '') : ''}</span></div>`).join('')}</div>`;
      return `<div class="panel"><div class="panel-h"><b>Box score</b><small class="muted">FO ${fo('away')} – ${fo('home')} · Hits ${tot('away', 'hit')}–${tot('home', 'hit')} · PIM ${tot('away', 'pim')}–${tot('home', 'pim')}</small></div>${team('away')}${team('home')}${s.shootout ? `<div class="muted small">Shootout: ${s.away.abbr} ${s.shootout.away} x ${s.shootout.home} ${s.home.abbr}</div>` : ''}</div>`;
    },
    // Debug: each skater's assignment and where it is heading (rotas/alvos).
    drawDebug: (ctx, cam, s) => {
      ctx.save(); ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      for (const p of s.players) {
        if (p.tx == null) continue;
        ctx.strokeStyle = p.team === 'home' ? 'rgba(255,214,90,.6)' : 'rgba(120,200,255,.6)'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(cam.sx(p.x), cam.sy(p.y)); ctx.lineTo(cam.sx(p.tx), cam.sy(p.ty)); ctx.stroke(); ctx.setLineDash([]);
        if (p.role) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(p.role, cam.sx(p.x), cam.sy(p.y) - 16); }
      }
      ctx.restore();
    },
  };
}
