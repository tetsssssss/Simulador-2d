// Browser smoke test for the whole universe (Playwright + Chromium). Run with the repo root served on PORT:
//   python3 -m http.server 8200 &  node tests/browser/smoke.mjs [port] [outDir]
// Checks: NFL → NHL → MLB → NFL switching (×3), each sport's 2D match mounts once, rAF count stays at one loop,
// no NaN in engine/render state, no JS errors (network failures of blocked hosts are ignored).
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8200, OUT = process.argv[3] || null;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1980, height: 1080 } });
const errs = [];
const ignore = /ERR_TUNNEL|CORS|ERR_FAILED|ERR_CONNECTION|Failed to load resource|net::/;
page.on('console', m => { if (m.type() === 'error' && !ignore.test(m.text())) errs.push(m.text().slice(0, 240)); });
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 300)));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const frame = () => page.frames().find(f => /\/(nfl|nhl|mlb)\/index\.html/.test(f.url()));
const rafPerSec = f => f.evaluate(() => new Promise(res => { let n = 0; const o = window.requestAnimationFrame; window.requestAnimationFrame = cb => { n++; return o.call(window, cb); }; setTimeout(() => { window.requestAnimationFrame = o; res(n); }, 1000); }));
const hasNaN = f => f.evaluate(() => {
  const st = window.__nhlMatch?.state || window.__mlbMatch?.state || window.__nflGame?.sim; if (!st) return null;
  const seen = new WeakSet(); let bad = 0;
  const skip = new Set(['p', 'prof', 'hist', 'rng', 'img', 'lineup', 'raw']);
  (function walk(v, depth) {
    if (typeof v === 'number') { if (!Number.isFinite(v)) bad++; return; }
    if (!v || typeof v !== 'object' || depth > 6 || seen.has(v)) return;
    seen.add(v);
    for (const k of Object.keys(v)) if (!skip.has(k)) walk(v[k], depth + 1);
  })(st, 0);
  return bad;
});

await page.goto(`http://localhost:${PORT}/#nfl`); await page.waitForTimeout(3000);
for (let round = 0; round < 3; round++) {
  for (const sport of ['nhl', 'mlb', 'nfl']) {
    await page.click(`.su-seg a[data-sport=${sport}]`); await page.waitForTimeout(1500);
    const f = frame();
    const route = sport === 'nhl' ? '#rink' : sport === 'mlb' ? '#diamond' : '#play';
    await f.evaluate(r => { location.hash = r; }, route); await page.waitForTimeout(1800);
    if (sport === 'nfl') { await f.evaluate(() => { const b = document.querySelector('[data-mode=SPECTATOR]'); if (b) { b.click(); setTimeout(() => document.querySelector('[data-start]')?.click(), 150); } }); await page.waitForTimeout(1500); }
    // re-enter the match view several times inside the same document (router teardown must hold)
    for (let k = 0; k < 3; k++) { await f.evaluate(() => { location.hash = '#home'; }); await page.waitForTimeout(250); await f.evaluate(r => { location.hash = r; }, route); await page.waitForTimeout(400); }
    if (sport === 'nfl') { await f.evaluate(() => { const b = document.querySelector('[data-mode=SPECTATOR]'); if (b) { b.click(); setTimeout(() => document.querySelector('[data-start]')?.click(), 150); } }); await page.waitForTimeout(1500); }
    await page.waitForTimeout(800);
    const n = await rafPerSec(f);
    check(`${sport} round ${round}: single render loop`, n >= 30 && n <= 75, `${n} rAF/s`);
    const nan = await hasNaN(f);
    check(`${sport} round ${round}: no NaN in state`, nan === 0 || nan === null, `NaN=${nan}`);
    const loops = await f.evaluate(() => window.__nhlLoops ?? window.__mlbLoops ?? null);
    if (loops !== null) check(`${sport} round ${round}: one mounted match view`, loops === 1, `mounted=${loops}`);
    if (OUT && round === 0) await page.screenshot({ path: `${OUT}/smoke_${sport}.png` });
  }
}
// NFL live commentary: spectator auto-play must produce narration lines from engine events
{
  const f = frame();
  await f.evaluate(() => { const b = document.querySelector('#autoBtn'); if (b && !b.classList.contains('on')) b.click(); });
  await page.waitForTimeout(9000);
  const lines = await f.evaluate(() => [...document.querySelectorAll('#liveComm .lc-line .lc-x')].map(e => e.textContent));
  check('nfl live commentary lines', lines.length >= 2 && !lines.some(l => /undefined|NaN|null/.test(l)), `${lines.length} · ${lines.slice(0, 3).join(' / ')}`);
  if (OUT) await page.screenshot({ path: `${OUT}/smoke_nfl_commentary.png` });
}
check('only one sport document loaded', page.frames().filter(f => /\/(nfl|nhl|mlb)\/index\.html/.test(f.url())).length === 1);
check('no JS errors', errs.length === 0, errs.slice(0, 4).join(' | '));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
