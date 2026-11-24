// Etapa 8: render budget of the 3D mode per sport (triangles and draw calls per frame, read from the engine) and memory.   node tests/browser/budget3d.mjs [port]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300, MAX_TRIS = 300000, MAX_DRAWS = 400;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
for (const [sport, route, start] of [['nfl', '#play', true], ['nhl', '#rink', false], ['mlb', '#diamond', false]]) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 700 } }); await ctx.addInitScript(() => { localStorage.setItem('asu_visual_mode', '3d'); localStorage.setItem('asu_3d_quality', 'high'); });
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/#${sport}`); await page.waitForTimeout(2500);
  const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(r => { location.hash = r; }, route); await page.waitForTimeout(2500);
  if (start) { await f.click('text=Iniciar Quick Game').catch(() => {}); }
  let st = null; for (let i = 0; i < 40; i++) { await page.waitForTimeout(2000); st = await f.evaluate(() => { const r = window.__asu3dRenderer; if (!r?.ready) return null; const a = window.__asu3dStage; return a ? { tris: a.stats.frame.triangles, draws: a.stats.drawCalls.total, mesh: a.stats.frame.meshInstances, ath: r.athletes().length, heap: performance.memory?.usedJSHeapSize || 0 } : { noStats: true }; }); if (st && st.tris) break; }
  check(`${sport}: triangles per frame within ${MAX_TRIS / 1000}k and draw calls within ${MAX_DRAWS}`, !!st?.tris && st.tris <= MAX_TRIS && st.draws <= MAX_DRAWS, JSON.stringify(st));
  check(`${sport}: no JS errors`, errs.length === 0, errs[0] || ''); await ctx.close();
}
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
