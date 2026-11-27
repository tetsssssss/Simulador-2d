// NHL / MLB: same teams + seed => identical engine events with the 3D visual mode and with the 2D one.   node tests/browser/seed3d.mjs [port]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300, N = 14;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
async function events(sport, route, hook, mode) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 700 } }); await ctx.addInitScript(m => { localStorage.setItem('asu_3d_fullhd', '0'); localStorage.setItem('asu_3d_quality', 'medium'); localStorage.setItem('asu_visual_mode', m); }, mode);
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/#${sport}`); await page.waitForTimeout(2500);
  const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(r => { location.hash = r; }, route); await page.waitForTimeout(2500);
  let ev = [];
  for (let i = 0; i < 80 && ev.length < N; i++) { await page.waitForTimeout(500); ev = await f.evaluate(([h, n]) => (window[h]?.engine?.state?.events || []).slice(0, n).map(e => [e.type, e.by ?? e.pitcher ?? e.team ?? '', e.t != null ? +e.t.toFixed(2) : ''].join(':')), [hook, N]); }
  await ctx.close(); return { ev, errs };
}
for (const [sport, route, hook] of [['nhl', '#rink', '__nhlMatch'], ['mlb', '#diamond', '__mlbMatch']]) {
  const a = await events(sport, route, hook, '3d'), c = await events(sport, route, hook, 'sheet'), k = Math.min(a.ev.length, c.ev.length);
  check(`${sport}: first ${k} engine events identical in 3D and 2D`, k >= 8 && a.ev.slice(0, k).join('|') === c.ev.slice(0, k).join('|'), k < 8 ? 'too few events' : a.ev.slice(0, 3).join(' '));
  check(`${sport}: no JS errors in 3D`, a.errs.length === 0, a.errs[0] || '');
}
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
