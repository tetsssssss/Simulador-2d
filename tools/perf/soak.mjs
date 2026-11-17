// Soak test: 30 s per sport and visual mode at 4x game speed; prints fps, frame-time percentiles, long tasks, heap. Needs Playwright + a server on :8300.
//   python3 -m http.server 8300 & SECS=30 node tools/perf/soak.mjs
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const SECS = +(process.env.SECS || 30);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-precise-memory-info'] });
const out = [];
for (const mode of ['avatar', 'sheet']) for (const sport of ['nfl', 'nhl', 'mlb']) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(m => { try { localStorage.setItem('asu_visual_mode', m); } catch {} }, mode);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:8300/#${sport}`); await page.waitForTimeout(2500);
  await page.click(`.su-seg a[data-sport=${sport}]`); await page.waitForTimeout(1500);
  const f = page.frames().find(f => /\/(nfl|nhl|mlb)\/index\.html/.test(f.url()));
  await f.evaluate(r => { location.hash = r; }, sport === 'nhl' ? '#rink' : sport === 'mlb' ? '#diamond' : '#play'); await page.waitForTimeout(1500);
  if (sport === 'nfl') await f.evaluate(() => { const b = document.querySelector('[data-mode=SPECTATOR]'); if (b) { b.click(); setTimeout(() => document.querySelector('[data-start]')?.click(), 150); document.querySelector('[data-auto], #autoPlay')?.click(); } });
  await f.evaluate(() => { const s = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '4x'); s?.click(); });
  await page.waitForTimeout(1500);
  const r = await f.evaluate(secs => new Promise(res => {
    const dts = []; let last = performance.now(), long = 0, stop = false;
    try { new PerformanceObserver(l => { long += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch {}
    const tick = t => { dts.push(t - last); last = t; if (!stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    const h0 = performance.memory?.usedJSHeapSize || 0;
    setTimeout(() => { stop = true; dts.sort((a, b) => a - b); const n = dts.length;
      res({ frames: n, fps: +(n / secs).toFixed(1), p50: +dts[Math.floor(n * .5)].toFixed(1), p95: +dts[Math.floor(n * .95)].toFixed(1), p99: +dts[Math.floor(n * .99)].toFixed(1), max: +dts[n - 1].toFixed(1), longTasks: long, heapMB: +((performance.memory?.usedJSHeapSize || 0) / 1048576).toFixed(0), heap0MB: +(h0 / 1048576).toFixed(0) }); }, secs * 1000); }), SECS);
  const ev = await f.evaluate(() => { const S = window.__nhlMatch?.state || window.__mlbMatch?.state || window.__nflGame?.sim; return { t: Math.round(S?.t ?? -1), events: S?.events?.length ?? -1 }; });
  out.push({ mode, sport, ...r, simT: ev.t, errors: errs.length ? errs.slice(0, 2) : 0 }); console.log(JSON.stringify(out[out.length - 1]));
  await ctx.close();
}
await browser.close();
