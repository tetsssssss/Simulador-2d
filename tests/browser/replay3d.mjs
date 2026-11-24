// NHL / MLB instant replay in the 3D mode: the renderer follows the replay clock and never fires events from the future.   node tests/browser/replay3d.mjs [port]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
for (const [sport, route, hook, wrap] of [['nhl', '#rink', '__nhlMatch', '.nhl-ice-wrap'], ['mlb', '#diamond', '__mlbMatch', '.mlb-field-wrap2']]) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 700 } }); await ctx.addInitScript(() => localStorage.setItem('asu_visual_mode', '3d'));
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/#${sport}`); await page.waitForTimeout(2500);
  const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(r => { location.hash = r; }, route); await page.waitForTimeout(3000);
  for (let i = 0; i < 40; i++) { const t = await f.evaluate(h => window[h]?.state?.t || 0, hook); if (t > 14) break; await page.waitForTimeout(1500); }   // enough history to replay
  await f.evaluate(w => { const b = document.querySelector('.ir-btn'); b?.click(); }, wrap);
  let seen = false, bad = 0, samples = 0, left = false;
  for (let i = 0; i < 160 && !left; i++) {
    await page.waitForTimeout(400);
    const r = await f.evaluate(h => { const rr = window.__asu3dRenderer?.replayInfo?.(); const ev = window[h]?.state?.events || []; return rr && { ...rr, future: ev.slice(0, rr.evIdx).filter(e => (e.t ?? 0) > rr.t + 0.05).length }; }, hook);
    if (r?.replaying) { seen = true; samples++; bad += r.future; } else if (seen) left = true;
  }
  check(`${sport}: replay button puts the 3D renderer into replay mode`, seen, `${samples} samples`);
  check(`${sport}: no future event fired during the replay`, seen && bad === 0, `bad=${bad}`);
  check(`${sport}: replay ends and live play resumes`, left);
  check(`${sport}: no JS errors`, errs.length === 0, errs[0] || ''); await ctx.close();
}
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
