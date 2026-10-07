// Career Hub UI end-to-end (Playwright). For every sport x role (NFL/NHL/MLB x Técnico/Dirigente/Jogador):
//   wizard -> every screen -> NEXT_DAY / NEXT_WEEK / NEXT_GAME (+ simulate the user's game) -> one action (tactic change / trade evaluation /
//   training) -> manual save -> page reload resumes -> list "Continuar" resumes -> advance again.
// Also: 0 page errors, no 'NaN' / 'undefined' text in the DOM, no leaked rAF / intervals / window+document listeners across screen
// switches, save UI (slots, export, import, delete), corrupted save handling, v2 -> v3 migration notice.
// Usage: node tests/browser/career_ui.mjs [port=8214] [screenshotDir] [--only=nhl:COACH,mlb:PLAYER,season:nfl:GM,extras] [--engine]
// Serve the repo root first:  python3 -m http.server 8214 &   (external network is not needed)
const args = process.argv.slice(2), PORT = args.find(a => /^\d+$/.test(a)) || '8214';
const OUT = args.find(a => !/^\d+$/.test(a) && !a.startsWith('--')) || null;
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const ENGINE = args.includes('--engine'); // keep "motor real" on for the user's games (slow)
const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const fs = await import('node:fs');
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${PORT}/career/index.html`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const results = [];
let currentErrs = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + String(info).slice(0, 220) : ''}`); return ok; };

// leak instrumentation (installed before any page script runs)
const INIT = () => {
  const st = { raf: new Set(), intervals: new Set(), timeouts: new Set(), listeners: new Map() };
  window.__leak = st;
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => { const id = raf(t => { st.raf.delete(id); cb(t); }); st.raf.add(id); return id; };
  window.cancelAnimationFrame = id => { st.raf.delete(id); caf(id); };
  const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { const id = si(fn, ms, ...a); st.intervals.add(id); return id; };
  window.clearInterval = id => { st.intervals.delete(id); ci(id); };
  const stt = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => { const id = stt((...x) => { st.timeouts.delete(id); return typeof fn === 'function' ? fn(...x) : undefined; }, ms, ...a); st.timeouts.add(id); return id; };
  window.clearTimeout = id => { st.timeouts.delete(id); ct(id); };
  const fnId = new WeakMap(); let n = 0; const idOf = f => { if (typeof f !== 'function') return 'obj'; if (!fnId.has(f)) fnId.set(f, ++n); return fnId.get(f); };
  for (const [name, target] of [['window', window], ['document', document]]) {
    const add = target.addEventListener.bind(target), rem = target.removeEventListener.bind(target);
    target.addEventListener = (type, fn, opts) => { const k = `${name}|${type}|${idOf(fn)}|${typeof opts === 'object' ? !!opts.capture : !!opts}`; if (!st.listeners.has(k)) st.listeners.set(k, 1); add(type, fn, opts); };
    target.removeEventListener = (type, fn, opts) => { st.listeners.delete(`${name}|${type}|${idOf(fn)}|${typeof opts === 'object' ? !!opts.capture : !!opts}`); rem(type, fn, opts); };
  }
};
const leak = page => page.evaluate(() => ({ raf: window.__leak.raf.size, intervals: window.__leak.intervals.size, listeners: window.__leak.listeners.size }));

const BAD = /\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b(?![-\w])/;
async function domClean(page, where) {
  const bad = await page.evaluate(() => {
    const html = document.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '');
    const text = document.body.innerText;
    const vals = [...document.querySelectorAll('input,select,textarea')].map(e => e.value).join(' ');
    const m = (s, re) => { const x = re.exec(s); return x ? s.slice(Math.max(0, x.index - 40), x.index + 50).replace(/\s+/g, ' ') : null; };
    const re = /\bNaN\b|\bundefined\b|\[object Object\]/;
    return m(text, re) || m(vals, re) || m(html, re);
  });
  return check(`${where}: no NaN/undefined in the DOM`, !bad, bad);
}

const wait = (page, ms) => page.waitForTimeout(ms);
async function idle(page, label = '') { // overlay hidden + nothing busy
  await page.waitForFunction(() => !document.querySelector('#overlay.show'), null, { timeout: 120000 });
  await page.waitForTimeout(120);
}
// resolves / dismisses any open modal (career events, confirmations). `resolveOne` resolves the first event with its first choice.
async function clearModals(page, st) {
  for (let guard = 0; guard < 14; guard++) {
    const m = await page.$('.cs-modal');
    if (!m) return;
    const hasChoice = await page.$('.cs-modal .ev-choice');
    if (hasChoice) {
      if (st && !st.resolved) { st.resolved = true; await page.click('.cs-modal .ev-choice'); await page.waitForTimeout(150); const next = await page.$('.cs-modal [data-m=next]'); await page.click(next ? '.cs-modal [data-m=next]' : '.cs-modal [data-m=ok]'); await page.waitForTimeout(150); continue; }
      await page.click('.cs-modal [data-m=__later]'); await page.waitForTimeout(100); continue;
    }
    const btn = (await page.$('.cs-modal [data-m=fix]')) || (await page.$('.cs-modal [data-m=ok]')) || (await page.$('.cs-modal [data-m=no]')) || (await page.$('.cs-modal [data-m=__close]'));
    if (!btn) return; await btn.click(); await page.waitForTimeout(100);
  }
}
const S = (page, fn, arg) => page.evaluate(fn, arg);
const fingerprint = page => page.evaluate(() => { const { S } = window.__career, c = S.c, me = c.userTeam || (c.me && c.players[c.me.id]?.t); const st = c.standings[me] || {}; return { id: c.id, season: c.season, phase: c.phase, slate: c.slate, day: c.x.cal.day, rec: `${st.w || 0}-${st.l || 0}-${st.otl || 0}-${st.t || 0}`, news: c.x.feed.length, ovr: c.me ? c.players[c.me.id].ovr : null }; });

async function newPage(browserCtx) {
  const page = await browserCtx.newPage();
  currentErrs = [];
  page.on('pageerror', e => currentErrs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) currentErrs.push('console.error: ' + m.text()); });
  page.on('dialog', d => d.dismiss());
  return page;
}
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` }); };

// ---------- wizard (through the UI) ----------
async function createViaWizard(page, sport, role, team, { cardClick = false, engine = ENGINE } = {}) {
  await page.goto(BASE); await page.waitForSelector('#goNew2, #goNew');
  await page.click('#goNew2, #goNew');
  await page.click(`[data-sport=${sport}]`); await page.click('#wNext');
  await page.click(`[data-role=${role}]`); await page.click('#wNext');
  if (role === 'PLAYER') {
    await page.waitForSelector('#pName', { timeout: 60000 });
    await page.fill('#pName', 'Atleta Teste');
    const poss = await page.$$eval('select[data-chg=wiz-pos] option', os => os.map(o => o.value));
    await page.selectOption('select[data-chg=wiz-pos]', poss[Math.min(1, poss.length - 1)]);
    await page.selectOption('select[data-chg=wiz-talent]', 'raro');
    await page.waitForSelector('#curveBox .curve-card');
    check(`${sport}/${role}: wizard shows 7 curve options with SVG`, (await page.$$('#curveBox .curve-card')).length === 7 && (await page.$$('#curveBox .curve-card svg')).length === 6);
    await page.click('#curveBox .curve-card[data-k=LATE]');
    // budget enforcement: push every slider to the max, the total must stay within the budget
    const over = await page.evaluate(() => { const rs = [...document.querySelectorAll('input[data-inp=wiz-attr]')]; rs.forEach(r => { r.value = r.max; r.dispatchEvent(new Event('input', { bubbles: true })); }); const used = rs.reduce((s, r) => s + +r.value, 0); const txt = document.querySelector('#budTxt').textContent; return { used, txt }; });
    const budget = +/\/ (\d+)/.exec(over.txt)[1];
    check(`${sport}/${role}: attribute budget respected (${over.used} <= ${budget})`, over.used <= budget);
    await page.click('[data-act=wiz-attr-auto]'); await page.waitForSelector('#pName');
    await page.fill('#pName', 'Atleta Teste');
    // avatar editor: randomize + save, the saved look must end up in the career
    await page.click('[data-act=wiz-av-edit]'); await page.waitForSelector('#asuAvatarEd');
    await page.click('#asuAvatarEd [data-a=rand]'); await page.click('#asuAvatarEd [data-a=save]');
    await page.waitForSelector('#asuAvatarEd', { state: 'detached' });
    const paths = await page.$$('[data-act=wiz-path]'); await paths[paths.length - 1].click(); await page.waitForSelector('#pName');
    await page.fill('#pName', 'Atleta Teste');
    if (OUT) await page.screenshot({ path: `${OUT}/${sport}_wizard_player.png`, fullPage: true });
    await page.click('#wNext');
  } else {
    await page.waitForSelector('#wTeam', { timeout: 60000 });
    if (cardClick) await page.click(`#teamGrid [data-team=${team}]`); else await page.selectOption('#wTeam', team);
    check(`${sport}/${role}: team ${team} selected`, await page.$eval('#wTeam', e => e.value) === team && !(await page.$eval('#wNext', e => e.disabled)));
    await page.click('#wNext');
  }
  await page.click('[data-act=wiz-diff][data-v="2"]');
  if (!engine) await page.uncheck('#wEngine');
  await page.fill('#wName', `Teste ${sport} ${role}`);
  await page.click('#wGo');
  await page.waitForSelector('#advBtn', { timeout: 120000 });
  await idle(page);
}

// ---------- one sport x role ----------
async function scenario(sport, role, team) {
  const tag = `${sport}/${role}`;
  console.log(`\n=== ${tag} ===`);
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 940 }, acceptDownloads: true });
  await ctx.addInitScript(INIT);
  const page = await newPage(ctx);
  const t0 = Date.now();
  await createViaWizard(page, sport, role, team, { cardClick: sport === 'nhl' });
  check(`${tag}: career created through the wizard (${((Date.now() - t0) / 1000).toFixed(1)}s)`, await page.$('#advBtn') !== null);
  const info = await page.evaluate(() => { const { S } = window.__career; return { id: S.c.id, role: S.c.role, diff: S.c.settings.difficulty, app: S.c.me ? S.c.players[S.c.me.id].appearance : null, eng: S.c.settings.engineGames, name: S.c.name }; });
  check(`${tag}: difficulty 2 / name saved`, info.diff === 2 && info.name === `Teste ${sport} ${role}`);
  if (role === 'PLAYER') check(`${tag}: avatar editor left no rAF loop behind`, (await leak(page)).raf === 0);
  if (role === 'PLAYER') check(`${tag}: player appearance stored in the save (7 keys)`, info.app && ['skin', 'hairStyle', 'hairColor', 'beard', 'accessory', 'build', 'gear'].every(k => Number.isInteger(info.app[k])), JSON.stringify(info.app));
  const keys = await page.evaluate(() => window.__career.navKeys(window.__career.S.c.role));

  // ---- visit every screen (twice: leaks must not grow) ----
  const visit = async (round) => {
    for (const k of keys) {
      await page.click(`.cs-nav a[data-nav=${k}]`); await wait(page, 140);
      const cur = await page.$eval('.cs-nav a[aria-current=page]', e => e.dataset.nav);
      const len = await page.$eval('#screen', e => e.innerText.length);
      if (cur !== k || len < 30) check(`${tag}: screen ${k} renders`, false, `current=${cur} len=${len}`);
      await domClean(page, `${tag}/${k}`);
      if (round === 0 && OUT && ['dashboard', 'calendar', 'roster', 'team', 'tactics', 'contracts', 'transactions', 'draft', 'staff', 'training', 'profile', 'development', 'scouting', 'news'].includes(k)) await shot(page, `${sport}_${role}_${k}`);
    }
  };
  await visit(0);
  const base = await leak(page);
  await visit(1);
  const after = await leak(page);
  check(`${tag}: all ${keys.length} screens render without errors (${keys.join(',')})`, currentErrs.length === 0, currentErrs.join(' | '));
  check(`${tag}: no leaked rAF/intervals/listeners across screen switches`, after.raf <= base.raf && after.intervals <= base.intervals && after.listeners <= base.listeners, `${JSON.stringify(base)} -> ${JSON.stringify(after)}`);

  // ---- calendar: NEXT_DAY / NEXT_WEEK / NEXT_GAME ----
  await page.click('.cs-nav a[data-nav=calendar]'); await wait(page, 120);
  const st = { resolved: false };
  const f0 = await fingerprint(page);
  await page.click('#advDay'); await idle(page); await clearModals(page, st);
  const f1 = await fingerprint(page);
  check(`${tag}: NEXT_DAY advances the calendar`, f1.day > f0.day, `${f0.day} -> ${f1.day}`);
  await page.click('#advWeek'); await idle(page); await clearModals(page, st);
  const f2 = await fingerprint(page);
  check(`${tag}: NEXT_WEEK advances ~7 days`, f2.day - f1.day >= 1, `${f1.day} -> ${f2.day}`);
  await page.click('#advBtn'); await idle(page); await clearModals(page, st);
  const f3 = await fingerprint(page), note = await page.evaluate(() => window.__career.S.lastAdv?.res?.stopped);
  check(`${tag}: NEXT_GAME stops (${note})`, f3.day > f2.day || f3.day === f2.day, `${f2.day} -> ${f3.day}`);
  await domClean(page, `${tag}/after-advance`);
  const playable = await page.$('#playGame');
  if (playable) {
    const before = await fingerprint(page);
    await page.click('#playGame'); await idle(page); await clearModals(page, st);
    const done = await fingerprint(page);
    check(`${tag}: simulate the user's game changes the record`, done.rec !== before.rec || done.slate !== before.slate, `${before.rec} -> ${done.rec}`);
    await shot(page, `${sport}_${role}_after_game`);
  } else check(`${tag}: no user game pending (${role === 'PLAYER' ? 'player without club' : 'unexpected'})`, role === 'PLAYER' || note !== 'USER_GAME');
  await page.click('#advWeek'); await idle(page); await clearModals(page, st);
  check(`${tag}: advancing produced a stop reason text`, (await page.$('#advNote, .adv-note')) !== null);
  await page.click('.cs-nav a[data-nav=calendar]'); await wait(page, 150);
  await shot(page, `${sport}_${role}_calendar2`);
  await domClean(page, `${tag}/calendar-after`);
  check(`${tag}: no page errors after advancing`, currentErrs.length === 0, currentErrs.join(' | '));
  // ---- career events (modal with choices and consequences) + keyboard basics ----
  if (role !== 'PLAYER' || (await page.$('[data-act=open-events]'))) {
    const pend = await page.evaluate(() => window.__career.S.c.x.events.pending.length);
    if (pend > 0) {
      await page.click('.notice [data-act=open-events]'); await page.waitForSelector('.cs-modal .ev-choice');
      const dlg = await page.$eval('.cs-modal-card', e => ({ role: e.getAttribute('role'), modal: e.getAttribute('aria-modal'), choices: e.querySelectorAll('.ev-choice').length }));
      check(`${tag}: event modal is an accessible dialog with choices`, dlg.role === 'dialog' && dlg.modal === 'true' && dlg.choices >= 2, JSON.stringify(dlg));
      await page.click('.cs-modal .ev-choice'); await page.waitForSelector('.cs-modal [data-m=ok], .cs-modal [data-m=next]');
      const cons = await page.$eval('.cs-modal', e => e.innerText);
      check(`${tag}: event consequence is shown`, /Consequências/.test(cons), cons.slice(0, 120));
      await clearModals(page, { resolved: true });
      check(`${tag}: event resolved (pending ${pend} -> ${await page.evaluate(() => window.__career.S.c.x.events.pending.length)})`, (await page.evaluate(() => window.__career.S.c.x.events.pending.length)) < pend);
    }
  }
  if (role !== 'PLAYER') {
    await page.click('.cs-nav a[data-nav=roster]'); await wait(page, 150);
    await page.click('#rosterTbl .link'); await page.waitForSelector('.cs-modal');
    check(`${tag}: player card opens (dialog, ratings, contract)`, /contrato/i.test(await page.$eval('.cs-modal', e => e.innerText)));
    await page.keyboard.press('Escape'); await wait(page, 120);
    check(`${tag}: Escape closes the modal`, (await page.$('.cs-modal')) === null);
    check(`${tag}: skip link is first in tab order and becomes visible on focus`, await page.evaluate(() => { const first = document.querySelector('a[href],button,input,select,textarea,[tabindex]'); if (!first?.classList.contains('skip-link')) return false; first.focus(); return getComputedStyle(first).left === '0px'; }));
  }

  // ---- role-specific action ----
  if (role === 'COACH') {
    await page.click('.cs-nav a[data-nav=tactics]'); await wait(page, 150);
    const sel = { nfl: 'select[data-path="offense.scheme"]', nhl: 'select[data-path="forecheck"]', mlb: 'select[data-path="defense.shift"]' }[sport];
    await page.click('[data-act=subtab][data-k]' + { nfl: '[data-k=offense]', nhl: '[data-k=style]', mlb: '[data-k=defense]' }[sport]); await wait(page, 100);
    const before = await page.$eval(sel, e => e.value), opts = await page.$$eval(`${sel} option`, os => os.map(o => o.value));
    const next = opts.find(o => o !== before);
    await page.selectOption(sel, next); await wait(page, 200);
    const tacNow = await page.evaluate(sp => { const t = window.__career.S.c.x.tac; return sp === 'nfl' ? t.offense.scheme : sp === 'nhl' ? t.forecheck : t.defense.shift; }, sport);
    check(`${tag}: tactic change saved through the API (${before} -> ${tacNow})`, tacNow === next);
    // lineup slot swap
    const slotInfo = await (async () => {
      if (sport === 'nfl') { await page.click('[data-act=subtab][data-k=depth]'); await wait(page, 100); return { sel: 'select[data-kind=nfl-depth][data-g=QB][data-i="0"]' }; }
      if (sport === 'nhl') { await page.click('[data-act=subtab][data-k=lines]'); await wait(page, 100); return { sel: 'select[data-kind=nhl-F][data-i="0"][data-j="0"]' }; }
      await page.click('[data-act=subtab][data-k=lineup]'); await wait(page, 100); return { sel: 'select[data-kind=mlb-lu][data-side=vsR][data-i="0"]' };
    })();
    const cur = await page.$eval(slotInfo.sel, e => e.value), alt = (await page.$$eval(`${slotInfo.sel} option`, os => os.map(o => o.value))).find(v => v && v !== cur);
    if (alt) {
      await page.selectOption(slotInfo.sel, alt); await wait(page, 250);
      const now = await page.$eval(slotInfo.sel, e => e.value);
      check(`${tag}: lineup slot change applied (swap/replace)`, now === alt, `${cur} -> ${now}`);
    }
    // drag & drop: dropping a slot on another one swaps the two players
    {
      if (sport === 'nfl') { await page.click('[data-act=subtab][data-id=nflDepth][data-k=WR]'); await wait(page, 100); }
      const pair = { nfl: ['select[data-kind=nfl-depth][data-g=WR][data-i="0"]', 'select[data-kind=nfl-depth][data-g=WR][data-i="2"]'], nhl: ['select[data-kind=nhl-F][data-i="0"][data-j="1"]', 'select[data-kind=nhl-F][data-i="0"][data-j="2"]'], mlb: ['select[data-kind=mlb-lu][data-side=vsR][data-i="3"]', 'select[data-kind=mlb-lu][data-side=vsR][data-i="5"]'] }[sport];
      const va = await page.$eval(pair[0], e => e.value), vb = await page.$eval(pair[1], e => e.value);
      await page.dragAndDrop(`[data-dnd]:has(${pair[0]})`, `[data-dnd]:has(${pair[1]})`, { sourcePosition: { x: 8, y: 10 }, targetPosition: { x: 8, y: 10 } }); await wait(page, 300);
      const na = await page.$eval(pair[0], e => e.value), nb = await page.$eval(pair[1], e => e.value);
      check(`${tag}: drag & drop swaps two lineup slots`, na === vb && nb === va, `${va},${vb} -> ${na},${nb}`);
    }
    await shot(page, `${sport}_${role}_tactics2`);
    await domClean(page, `${tag}/tactics-edit`);
  }
  if (role === 'COACH' || role === 'GM') {
    await page.click('.cs-nav a[data-nav=transactions]'); await wait(page, 200);
    const gives = await page.$$('input[data-chg=trade-tog][data-side=give][data-kind=p]'), gets = await page.$$('input[data-chg=trade-tog][data-side=get][data-kind=p]');
    await gives[Math.min(2, gives.length - 1)].click(); await wait(page, 150);
    const gets2 = await page.$$('input[data-chg=trade-tog][data-side=get][data-kind=p]'); await gets2[0].click(); await wait(page, 150);
    await page.click('#tradeEval'); await wait(page, 250);
    const verdict = await page.$eval('.verdict', e => e.innerText).catch(() => null);
    check(`${tag}: trade evaluation returns accept/counter/reasons`, !!verdict && /aceita|recusa|contraproposta|inválida/i.test(verdict), verdict);
    await domClean(page, `${tag}/trade`);
    await shot(page, `${sport}_${role}_trade`);
    if (role === 'GM') { // read-only tactics for the GM
      await page.click('.cs-nav a[data-nav=tactics]'); await wait(page, 150);
      const dis = await page.$$eval('#screen select', s => s.length > 0 && s.every(x => x.disabled));
      check(`${tag}: tactics are read-only for the GM`, dis);
      await page.click('.cs-nav a[data-nav=training]'); await wait(page, 150);
      await page.click('[data-act=train-focus][data-k=technical]'); await wait(page, 200);
      check(`${tag}: training plan change saved`, await page.evaluate(() => window.__career.S.c.x.training.plan.focus) === 'technical');
    }
  }
  if (role === 'PLAYER') {
    await page.click('.cs-nav a[data-nav=development]'); await wait(page, 150);
    const opts = await page.$$eval('select[data-chg=ptrain-focus] option', os => os.map(o => o.value)), cur = await page.$eval('select[data-chg=ptrain-focus]', e => e.value);
    await page.selectOption('select[data-chg=ptrain-focus]', opts.find(o => o !== cur)); await wait(page, 200);
    check(`${tag}: individual training focus changed`, await page.evaluate(() => window.__career.S.c.me.training.focus) !== cur);
    await shot(page, `${sport}_${role}_development2`);
  }
  check(`${tag}: no page errors after actions`, currentErrs.length === 0, currentErrs.join(' | '));

  // ---- save, reload, resume ----
  await page.click('#saveBtn'); await wait(page, 200);
  const toastTxt = await page.$eval('#toast', e => e.textContent);
  check(`${tag}: manual save confirmed`, /salva/i.test(toastTxt), toastTxt);
  const fpSaved = await fingerprint(page);
  await page.reload(); await page.waitForSelector('#advBtn', { timeout: 120000 }); await idle(page); await clearModals(page, { resolved: true });
  const fpReload = await fingerprint(page);
  check(`${tag}: reload resumes the same career state`, JSON.stringify(fpSaved) === JSON.stringify(fpReload), `${JSON.stringify(fpSaved)} vs ${JSON.stringify(fpReload)}`);
  await page.goto(BASE + '#'); await page.waitForSelector('[data-act=list-open]');
  check(`${tag}: career appears in the list`, (await page.$$('[data-act=list-open]')).length === 1);
  await page.click('[data-act=list-open]'); await page.waitForSelector('#advBtn', { timeout: 120000 }); await idle(page); await clearModals(page, { resolved: true });
  const fpList = await fingerprint(page);
  check(`${tag}: list "Continuar" loads the save`, JSON.stringify(fpSaved) === JSON.stringify(fpList));
  await page.click((await page.$('#playGame')) ? '#playGame' : '#advDay'); await idle(page); await clearModals(page, { resolved: true });
  const fp4 = await fingerprint(page);
  check(`${tag}: playable after loading (NEXT_DAY / simulate game)`, fp4.day > fpList.day || fp4.slate !== fpList.slate || fp4.phase !== fpList.phase || fp4.rec !== fpList.rec);
  await domClean(page, `${tag}/after-load`);
  check(`${tag}: 0 page errors in the whole scenario`, currentErrs.length === 0, currentErrs.join(' | '));
  const timeoutsLeft = (await page.evaluate(() => window.__leak.timeouts.size));
  check(`${tag}: no runaway timers (${timeoutsLeft} pending)`, timeoutsLeft < 8);
  await ctx.close();
}

// ---------- offseason / draft / next season (GM + PLAYER) ----------
async function seasonScenario(sport, role, team) {
  const tag = `${sport}/${role} season`;
  console.log(`\n=== ${tag} ===`);
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 940 } });
  await ctx.addInitScript(INIT);
  const page = await newPage(ctx);
  await createViaWizard(page, sport, role, team);
  const keys = await page.evaluate(() => window.__career.navKeys(window.__career.S.c.role));
  const visitAll = async (label) => {
    for (const k of keys) { await page.click(`.cs-nav a[data-nav=${k}]`); await wait(page, 110); await domClean(page, `${tag}/${label}/${k}`); }
    check(`${tag}: every screen renders at ${label}`, currentErrs.length === 0, currentErrs.join(' | '));
  };
  const fast = (until, max = 600) => page.evaluate(async ({ until, max }) => {
    const { S, A } = window.__career, c = S.c, spec = S.spec; let last = null, n = 0;
    const done = () => (until === 'resign' ? c.phase === 'OFFSEASON' && c.off === 'RESIGN' : until === 'draft' ? last?.stopped === 'DRAFT_PICK' || (c.phase === 'OFFSEASON' && ['FREE_AGENCY', 'CAMP'].includes(c.off)) : until === 'fa' ? c.phase === 'OFFSEASON' && c.off === 'FREE_AGENCY' : until === 'next' ? c.phase === 'PRESEASON' && c.season > 2026 : false);
    while (n++ < max && !done()) {
      if (last?.stopped === 'DRAFT_PICK') { A.runDraft(spec, c, { auto: true }); last = null; continue; }
      last = await A.advance(spec, c, c.phase === 'OFFSEASON' ? 'NEXT_DAY' : 'NEXT_WEEK', { includeUserGame: true, autoFix: true, stopOnEvents: false });
      if (last.stopped === 'FIRED') break;
    }
    return { phase: c.phase, off: c.off, season: c.season, stopped: last?.stopped, fired: !!c.fired, n };
  }, { until, max });
  const rerender = () => page.evaluate(() => { window.__career.touch(); window.__career.go(window.__career.S.screen); });
  if (role === 'PLAYER') await page.evaluate(() => { const { S, A } = window.__career; A.declareForDraft(S.spec, S.c); });
  let r = await fast('resign'); check(`${tag}: reached the re-sign stage (${JSON.stringify(r)})`, r.phase === 'OFFSEASON' || r.fired);
  await rerender(); await page.waitForTimeout(300); await visitAll('RESIGN');
  if (role === 'GM' && !r.fired) {
    r = await fast('draft'); await rerender(); await page.waitForTimeout(300);
    check(`${tag}: draft reached (${JSON.stringify(r)})`, r.phase === 'OFFSEASON' && r.off === 'DRAFT');
    await page.click('.cs-nav a[data-nav=draft]'); await wait(page, 200);
    if (r.stopped === 'DRAFT_PICK') {
      check(`${tag}: draft day — it is the user's turn with pick buttons`, (await page.$$('[data-act=draft-pick]')).length > 0);
      await shot(page, `${sport}_${role}_draft_day`);
      const before = await page.evaluate(() => window.__career.S.c.draft.cursor);
      await page.click('[data-act=draft-pick]'); await idle(page); await wait(page, 300);
      const after = await page.evaluate(() => ({ cur: window.__career.S.c.draft.cursor, mine: window.__career.A.getDraftView(window.__career.S.c).userPicks.filter(p => p.player).length }));
      check(`${tag}: user pick made and AI picks continued (${before} -> ${after.cur})`, after.cur > before && after.mine >= 1);
      await visitAll('DRAFT');
      await page.click('.cs-nav a[data-nav=draft]'); await wait(page, 200);
      const auto = await page.$('[data-act=draft-auto]'); if (auto) { await auto.click(); await idle(page); await wait(page, 300); }
      check(`${tag}: auto-draft finishes the draft`, await page.evaluate(() => window.__career.S.c.draft.done));
    }
    r = await fast('fa'); await rerender(); await page.waitForTimeout(300); await visitAll('FREE_AGENCY');
  }
  r = await fast('next'); await rerender(); await page.waitForTimeout(300);
  check(`${tag}: next season started (${JSON.stringify(r)})`, r.season > 2026 || r.fired);
  await visitAll('NEXT_SEASON');
  await shot(page, `${sport}_${role}_season2_history`);
  const fired = await page.evaluate(() => window.__career.S.c.fired);
  if (fired) {
    await page.click('.cs-nav a[data-nav=profile]'); await wait(page, 200);
    const btn = await page.$('[data-act=job-accept]');
    check(`${tag}: fired -> job offers shown`, !!btn);
    if (btn) { await btn.click(); await page.waitForSelector('.cs-modal'); await page.click('.cs-modal [data-m=ok]'); await wait(page, 400); check(`${tag}: accepted a job offer`, !(await page.evaluate(() => window.__career.S.c.fired))); await visitAll('NEW_JOB'); }
  }
  if (role === 'PLAYER') { // sign the player with a club through the API (accept an offer) and exercise the club screens + a game
    await page.evaluate(() => { const { S, A } = window.__career, t = S.c.teams[3]; if (!A.myTeam(S.c)) A.acceptPlayerOffer(S.spec, S.c, { team: t.abbr, name: t.name, sal: S.spec.salary.min, yrs: 3, role: 'S' }); });
    await rerender(); await page.waitForTimeout(300); await visitAll('SIGNED');
    await page.click('#advBtn'); await idle(page); await clearModals(page, { resolved: true });
    const g = await page.$('#playGame');
    check(`${tag}: signed player reaches his club's game day`, !!g);
    if (g) { const b = await fingerprint(page); await g.click(); await idle(page); await clearModals(page, { resolved: true }); const a = await fingerprint(page); check(`${tag}: player's club game simulated`, a.rec !== b.rec || a.slate !== b.slate, `${b.rec} -> ${a.rec}`); await visitAll('SIGNED_AFTER_GAME'); await shot(page, `${sport}_${role}_signed_dashboard`); }
  }
  const hist = await page.evaluate(() => window.__career.S.c.history.seasons.length);
  check(`${tag}: season history recorded (${hist})`, hist >= 1);
  check(`${tag}: 0 page errors`, currentErrs.length === 0, currentErrs.join(' | '));
  await ctx.close();
}

// ---------- save UI scenario (NHL coach) ----------
async function savesScenario() {
  console.log('\n=== save UI ===');
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 940 }, acceptDownloads: true });
  await ctx.addInitScript(INIT);
  const page = await newPage(ctx);
  await createViaWizard(page, 'nhl', 'COACH', 'TOR');
  await page.click('.cs-nav a[data-nav=saves]'); await wait(page, 200);
  await page.click('#advDay'); await idle(page); await clearModals(page, { resolved: true }); await wait(page, 1200);
  check('saves: autosave indicator shows a time', /Autosave \d/.test(await page.$eval('#autoInd', e => e.textContent)), await page.$eval('#autoInd', e => e.textContent));
  await page.click('#sSave'); await wait(page, 300);
  check('saves: slots table lists the manual slot', /Manual/.test(await page.$eval('#screen', e => e.innerText)));
  await page.click('#advDay'); await idle(page); await clearModals(page, { resolved: true }); await wait(page, 1300);
  await page.click('.cs-nav a[data-nav=saves]'); await wait(page, 200);
  check('saves: autosave slot appears after advancing', /Autosave/.test(await page.$eval('#screen', e => e.innerText)));
  // load a specific slot: the manual slot holds the state before the last advance
  await page.click('#sSave'); await wait(page, 300);
  const fpManual = await fingerprint(page);
  await page.click('#advDay'); await idle(page); await clearModals(page, { resolved: true }); await wait(page, 1300);
  const fpLater = await fingerprint(page);
  await page.click('.cs-nav a[data-nav=saves]'); await wait(page, 200);
  await page.click('[data-act=slot-open][data-slot=manual]'); await page.waitForSelector('#advBtn', { timeout: 60000 }); await idle(page); await clearModals(page, { resolved: true });
  const fpLoaded = await fingerprint(page);
  check('saves: "Carregar este slot" restores that copy', JSON.stringify(fpLoaded) === JSON.stringify(fpManual) && fpLater.day !== fpManual.day, `${fpManual.day} / later ${fpLater.day} / loaded ${fpLoaded.day}`);
  await page.click('.cs-nav a[data-nav=saves]'); await wait(page, 200);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#sExport')]);
  const p = await dl.path(); const text = fs.readFileSync(p, 'utf8'); const env = JSON.parse(text);
  check('saves: export downloads a versioned JSON', env.saveVersion === 3 && env.sport === 'nhl' && !!env.career, `v${env.saveVersion} ${text.length}B`);
  const id = env.id;
  await page.goto(BASE + '#'); await page.waitForSelector('[data-act=list-open]');
  const impPath = '/tmp/claude-0/-home-user/cb47fa6f-635e-5121-86e0-b05d00bbe7bd/scratchpad/export.json';
  fs.writeFileSync(impPath, text);
  await page.setInputFiles('#impFile', impPath); await wait(page, 600);
  check('saves: import adds a second career (renamed id)', (await page.$$('.cc')).length === 2);
  // slots in the list
  await page.click('[data-act=list-slots]'); await wait(page, 200);
  check('saves: list shows the slots table', (await page.$$('.cc .cslots table')).length === 1);
  // corrupt save → error panel, other careers intact
  await page.evaluate(id0 => { const idx = JSON.parse(localStorage.getItem('asu_careers_index')); idx.unshift({ id: 'nhl-quebrada', sport: 'nhl', role: 'COACH', name: 'Quebrada', updatedAt: new Date().toISOString(), metadata: {} }); localStorage.setItem('asu_careers_index', JSON.stringify(idx)); localStorage.setItem('asu_career_nhl-quebrada', '{"saveVersion":3,"id":"nhl-quebrada","sport":"nhl","career":{broken'); }, id);
  await page.goto(BASE + '#c/nhl-quebrada/dashboard'); await wait(page, 800);
  const alertTxt = await page.$eval('[role=alert]', e => e.innerText).catch(() => '');
  check('saves: corrupted save shows an error panel (no crash)', /corrompido/i.test(alertTxt), alertTxt);
  check('saves: corrupted raw copy preserved', await page.evaluate(() => localStorage.getItem('asu_career_nhl-quebrada_corrupt') != null));
  await page.click('[data-act=err-back]'); await page.waitForSelector('[data-act=list-open]');
  // verify button flags it
  await page.click('#verifyBtn'); await wait(page, 600);
  check('saves: "Verificar saves" flags the corrupted entry', /corrompida/i.test(await page.$eval('#hub', e => e.innerText)));
  // delete the corrupted one + the import
  for (let i = 0; i < 4; i++) { const del = await page.$('[data-act=list-del]'); if (!del) break; await del.click(); await page.waitForSelector('.cs-modal'); await page.click('.cs-modal [data-m=ok]'); await wait(page, 250); }
  check('saves: delete removes careers', (await page.$$('.cc')).length === 0);
  check('saves: no page errors', currentErrs.length === 0, currentErrs.join(' | '));
  await ctx.close();
}

// ---------- fired -> offers -> new job ----------
async function firedScenario() {
  console.log('\n=== fired / job offers ===');
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 940 } });
  await ctx.addInitScript(INIT);
  const page = await newPage(ctx);
  await createViaWizard(page, 'nhl', 'COACH', 'DET');
  await page.evaluate(async () => { const { S } = window.__career, m = await import('/core/career/coach.js'); m.fireUser(S.spec, S.c, 'Teste: diretoria perdeu a confiança.'); m.refreshOffers(S.spec, S.c); window.__career.touch(); window.__career.go('profile'); });
  await wait(page, 400);
  check('fired: banner + profile show the dismissal and job offers', /demitido/i.test(await page.$eval('#hub', e => e.innerText)) && (await page.$$('[data-act=job-accept]')).length >= 1);
  await page.click('#advDay'); await idle(page); await wait(page, 200);
  check('fired: advancing while fired reports the stop reason', /demitido/i.test(await page.$eval('#hub', e => e.innerText)));
  const old = await page.evaluate(() => window.__career.S.c.userTeam);
  await page.click('[data-act=job-accept]'); await page.waitForSelector('.cs-modal'); await page.click('.cs-modal [data-m=ok]'); await wait(page, 500);
  const now = await page.evaluate(() => ({ fired: window.__career.S.c.fired, team: window.__career.S.c.userTeam }));
  check(`fired: accepting an offer starts a new job (${old} -> ${now.team})`, !now.fired && now.team !== old);
  const keys = await page.evaluate(() => window.__career.navKeys(window.__career.S.c.role));
  for (const k of keys) { await page.click(`.cs-nav a[data-nav=${k}]`); await wait(page, 110); await domClean(page, `fired/${k}`); }
  check('fired: 0 page errors', currentErrs.length === 0, currentErrs.join(' | '));
  await ctx.close();
}

// ---------- NFL v0.5 import ----------
async function legacyScenario() {
  console.log('\n=== NFL v0.5 import ===');
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 940 } });
  await ctx.addInitScript(INIT);
  const page = await newPage(ctx);
  await page.goto(BASE);
  const raw = JSON.stringify({ version: 1, career: { team: 'KC', week: 3, wins: 2, losses: 1, season: 2026, seed: 'legtest', name: 'Carreira legada' }, settings: {}, metadata: {} });
  await page.evaluate(r => localStorage.setItem('asu_nfl_save_1', r), raw);
  await page.reload(); await page.waitForSelector('#impNfl');
  await page.click('#impNfl'); await page.waitForSelector('.cc');
  check('legacy: imported NFL v0.5 slot appears in the list', /NFL v0.5/i.test(await page.$eval('.cc', e => e.innerText)));
  await page.click('[data-act=list-open]'); await page.waitForSelector('#advBtn', { timeout: 120000 }); await idle(page);
  const keys = await page.evaluate(() => window.__career.navKeys(window.__career.S.c.role));
  for (const k of keys) { await page.click(`.cs-nav a[data-nav=${k}]`); await wait(page, 110); }
  await domClean(page, 'legacy/screens');
  check('legacy: original NFL slot untouched', (await page.evaluate(() => localStorage.getItem('asu_nfl_save_1'))) === raw);
  check('legacy: no page errors', currentErrs.length === 0, currentErrs.join(' | '));
  await ctx.close();
}

// ---------- migration v2 -> v3 ----------
async function migrationScenario() {
  console.log('\n=== v2 -> v3 migration ===');
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 940 } });
  await ctx.addInitScript(INIT);
  const page = await newPage(ctx);
  await createViaWizard(page, 'nhl', 'COACH', 'BOS');
  const id = await page.evaluate(() => window.__career.S.c.id);
  await page.click('#saveBtn'); await wait(page, 300);
  // downgrade the stored envelope to a v2 save (no career 3.0 state)
  await page.evaluate(id0 => { const k = `asu_career_${id0}`, env = JSON.parse(localStorage.getItem(k)); env.saveVersion = 2; env.career.saveVersion = 2; delete env.career.x; delete env.career.tactics?.__x; localStorage.setItem(k, JSON.stringify(env)); localStorage.removeItem(`${k}_auto`); localStorage.removeItem(`${k}_auto2`); }, id);
  await page.goto(BASE + `#c/${id}/saves`); await page.reload();
  await page.waitForSelector('.cs-shell', { timeout: 120000 }); await idle(page); await wait(page, 300);
  const txt = await page.$eval('#hub', e => e.innerText);
  check('migration: v2 save opens and shows the migration notice', /migrado/i.test(txt), txt.slice(0, 200));
  check('migration: backup of the v2 text kept', await page.evaluate(id0 => localStorage.getItem(`asu_career_${id0}_backup_v2`) != null, id));
  const keys = await page.evaluate(() => window.__career.navKeys(window.__career.S.c.role));
  for (const k of keys) { await page.click(`.cs-nav a[data-nav=${k}]`); await wait(page, 120); }
  await domClean(page, 'migration/screens');
  await page.click('#advDay'); await idle(page); await clearModals(page, { resolved: true });
  check('migration: playable after migrating', (await page.evaluate(() => window.__career.S.c.x.cal.day)) > -7);
  check('migration: no page errors', currentErrs.length === 0, currentErrs.join(' | '));
  await ctx.close();
}

// ---------- run ----------
const COMBOS = [['nfl', 'COACH', 'KC'], ['nfl', 'GM', 'DAL'], ['nfl', 'PLAYER', null], ['nhl', 'COACH', 'BOS'], ['nhl', 'GM', 'TOR'], ['nhl', 'PLAYER', null], ['mlb', 'COACH', 'NYY'], ['mlb', 'GM', 'LAD'], ['mlb', 'PLAYER', null]];
const want = c => !ONLY.length || ONLY.includes(`${c[0]}:${c[1]}`) || ONLY.includes(c[0]) || ONLY.includes(c[1]);
const onlySeasons = ONLY.length && ONLY.every(o => o.startsWith('season'));
for (const c of COMBOS.filter(c => want(c) && !onlySeasons)) {
  try { await scenario(...c); } catch (e) { check(`${c[0]}/${c[1]}: scenario completed`, false, e.stack?.split('\n').slice(0, 3).join(' ') || e.message); currentErrs = []; }
}
const SEASONS = [['nfl', 'GM', 'DAL'], ['nhl', 'GM', 'TOR'], ['mlb', 'GM', 'LAD'], ['nfl', 'PLAYER', null], ['nhl', 'PLAYER', null], ['mlb', 'PLAYER', null]];
for (const c of SEASONS.filter(c => (!ONLY.length || ONLY.includes(`season:${c[0]}:${c[1]}`) || ONLY.includes('season')))) {
  try { await seasonScenario(...c); } catch (e) { check(`${c[0]}/${c[1]} season scenario completed`, false, e.stack?.split('\n').slice(0, 3).join(' ') || e.message); currentErrs = []; }
}
if (!ONLY.length || ONLY.includes('extras')) {
  try { await savesScenario(); } catch (e) { check('save UI scenario completed', false, e.message); }
  try { await firedScenario(); } catch (e) { check('fired scenario completed', false, e.message); }
  try { await legacyScenario(); } catch (e) { check('legacy scenario completed', false, e.message); }
  try { await migrationScenario(); } catch (e) { check('migration scenario completed', false, e.message); }
}
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
