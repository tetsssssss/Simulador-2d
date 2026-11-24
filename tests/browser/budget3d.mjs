// Etapa 8: render budget of the 3D mode per sport (triangles and draw calls per frame, read from the engine) and memory.   node tests/browser/budget3d.mjs [port]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300, MAX_TRIS = 350000, MAX_DRAWS = 800, MAX_MI = 450, LOW_TRIS = 100000;   // 'high' keeps the 12k-triangle HD athletes on purpose; 'low' swaps them for the ~650-triangle models
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
for (const [sport, route, start] of [['nfl', '#play', true], ['nhl', '#rink', false], ['mlb', '#diamond', false]]) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 700 } }); await ctx.addInitScript(() => { localStorage.setItem('asu_visual_mode', '3d'); localStorage.setItem('asu_3d_quality', 'high'); });
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/#${sport}`); await page.waitForTimeout(2500);
  const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(r => { location.hash = r; }, route); await page.waitForTimeout(2500);
  if (start) { await f.click('text=Iniciar Quick Game').catch(() => {}); }
  let st = null; for (let i = 0; i < 40; i++) { await page.waitForTimeout(2000); st = await f.evaluate(() => { const r = window.__asu3dRenderer; if (!r?.ready) return null; const a = window.__asu3dStage; let tris = 0, mi = 0; const walk = e => { if (!e.enabled) return; const rc = e.render; if (rc && rc.enabled) for (const m of rc.meshInstances || []) { const pr = m.mesh.primitive[0]; tris += pr.count / 3; mi++; } e.children.forEach(walk); }; walk(a.root);
      return a ? { tris: Math.round(tris), draws: a.stats.drawCalls.total, meshInstances: mi, ath: r.athletes().length, heap: performance.memory?.usedJSHeapSize || 0 } : { noStats: true }; }); if (st && st.tris) break; }
  check(`${sport}: triangles per frame within ${MAX_TRIS / 1000}k and mesh instances within ${MAX_MI} and draw calls (shadow pass included, read mid-frame) within ${MAX_DRAWS}`, !!st?.tris && st.tris <= MAX_TRIS && st.draws <= MAX_DRAWS && st.meshInstances <= MAX_MI, JSON.stringify(st));
  const meas = () => f.evaluate(() => { const r = window.__asu3dRenderer, a = window.__asu3dStage; let tris = 0; const walk = e => { if (!e.enabled) return; const rc = e.render; if (rc && rc.enabled) for (const m of rc.meshInstances || []) tris += m.mesh.primitive[0].count / 3; e.children.forEach(walk); }; walk(a.root); return { tris: Math.round(tris), hd: r.hd, ath: r.athletes().length, ready: r.ready }; });
  if (sport !== 'mlb') {   // live LOD: switch to Low through the same storage event the menu uses
    await f.evaluate(() => { localStorage.setItem('asu_3d_quality', 'low'); window.dispatchEvent(new StorageEvent('storage', { key: 'asu_3d_quality' })); });
    let lo = null; for (let i = 0; i < 30; i++) { await page.waitForTimeout(2000); lo = await meas(); if (lo.ready && lo.hd === false) break; }
    check(`${sport}: switching to Low swaps athletes to low-poly live (triangles < ${LOW_TRIS / 1000}k, athletes still on the field)`, lo.ready && lo.hd === false && lo.tris < LOW_TRIS && lo.ath >= (sport === 'nfl' ? 22 : 10), JSON.stringify(lo));
    await f.evaluate(() => { localStorage.setItem('asu_3d_quality', 'high'); window.dispatchEvent(new StorageEvent('storage', { key: 'asu_3d_quality' })); });
    let hi = null; for (let i = 0; i < 30; i++) { await page.waitForTimeout(2000); hi = await meas(); if (hi.ready && hi.hd === true) break; }
    check(`${sport}: back to High restores the HD athletes`, hi.ready && hi.hd === true && hi.ath >= (sport === 'nfl' ? 22 : 10), JSON.stringify(hi));
  }
  check(`${sport}: no JS errors`, errs.length === 0, errs[0] || ''); await ctx.close();
}
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
