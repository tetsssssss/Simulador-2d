// Career Hub end-to-end (Playwright): create NHL + MLB careers in the shell, advance, play the next game in the 2D
// view (Sim to end), come back to the hub and check that the 2D result was applied to that exact game.
// Usage: node tests/browser/career.mjs [port] [outDir]
const PORT = process.argv[2] || 8200, OUT = process.argv[3] || null;
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [], results = [];
page.on('pageerror', e => errs.push(e.message));
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const frame = () => page.frames().find(f => /\/(career|nhl|mlb|nfl)\/index\.html/.test(f.url()));
await page.goto(`http://localhost:${PORT}/#career`); await page.waitForTimeout(1200);
check('shell opens the Career Hub', /career\/index\.html/.test(frame()?.url() || ''));
for (const [sport, team, back] of [['nhl', 'BOS', '#rink'], ['mlb', 'NYY', '#diamond']]) {
  let f = frame();
  await f.evaluate(() => { location.hash = '#new'; }); await page.waitForTimeout(400);
  await f.click(`[data-sport=${sport}]`); await f.click('#wNext'); await page.waitForTimeout(200);
  await f.click('[data-role=COACH]'); await f.click('#wNext'); await page.waitForTimeout(sport === 'mlb' ? 9500 : 1500);
  await f.selectOption('#wTeam', team); await f.click('#wNext'); await page.waitForTimeout(200);
  await f.click('#wGo'); await page.waitForTimeout(sport === 'mlb' ? 10000 : 3000);
  check(`${sport}: career created, dashboard open`, await f.$('#advBtn') !== null);
  await f.click('#advBtn'); await page.waitForTimeout(600); // start season
  const before = await f.evaluate(() => document.querySelector('.dash-head .big')?.textContent || '');
  await f.click('#play2d'); await page.waitForTimeout(3500);
  f = frame();
  check(`${sport}: 2D view opened with the career game`, new RegExp(`/${sport}/index\\.html`).test(f.url()) && /Jogo da carreira/.test(await f.evaluate(() => document.querySelector('#srcNote')?.textContent || '')));
  await f.evaluate(() => { const b = [...document.querySelectorAll('#ctrlExtra button')].find(x => /Sim to end/.test(x.textContent)); b?.click(); });
  await page.waitForTimeout(sport === 'nhl' ? 9000 : 4000);
  const fin = await f.evaluate(() => ({ over: (window.__nhlMatch || window.__mlbMatch)?.state?.over, back: !!document.querySelector('#backHub') }));
  check(`${sport}: 2D game finished and reported`, fin.over && fin.back, JSON.stringify(fin));
  if (OUT) await page.screenshot({ path: `${OUT}/career_${sport}_2d.png` });
  await f.click('#backHub'); await page.waitForTimeout(5000);
  f = frame();
  const after = await f.evaluate(() => ({ rec: document.querySelector('.dash-head .big')?.textContent || '', toast: document.querySelector('#toast')?.textContent || '', url: location.href }));
  const applied = await f.evaluate(() => { const r = JSON.parse(localStorage.getItem('asu_careers_index') || '[]'); return r.length; });
  check(`${sport}: back in the hub with the 2D result applied`, /career\/index\.html/.test(after.url) && /2D aplicado/.test(after.toast) && after.rec !== before, `${before} → ${after.rec} · ${after.toast}`);
  if (OUT) await page.screenshot({ path: `${OUT}/career_${sport}_back.png` });
  void applied;
  await f.evaluate(() => { location.hash = '#'; }); await page.waitForTimeout(400);
}
check('career list shows both careers', (await frame().$$('.cc')).length >= 2);
check('no JS errors', errs.length === 0, errs.slice(0, 4).join(' | '));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
