// Mobile drawer menu: adds a ☰ button to the page header and a backdrop; the CSS (mobileNav.css) shows the drawer only on small screens.
// Closes on backdrop tap, Escape, route change or when a menu link is chosen.
export function initMobileNav(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || doc.getElementById('mnBurger')) return;
  const bar = doc.querySelector('.topbar'), side = doc.querySelector('.sidebar'); if (!bar || !side) return;
  const burger = doc.createElement('button'); burger.id = 'mnBurger'; burger.type = 'button'; burger.className = 'mn-burger'; burger.setAttribute('aria-label', 'Abrir menu'); burger.setAttribute('aria-expanded', 'false'); burger.textContent = '☰';
  const back = doc.createElement('div'); back.className = 'mn-backdrop';
  bar.insertBefore(burger, bar.firstChild); doc.body.appendChild(back);
  const set = open => { doc.body.classList.toggle('nav-open', open); burger.setAttribute('aria-expanded', String(open)); burger.textContent = open ? '✕' : '☰'; };
  burger.onclick = () => set(!doc.body.classList.contains('nav-open'));
  back.onclick = () => set(false);
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  side.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
  const w = doc.defaultView; w?.addEventListener('hashchange', () => set(false));
  mountRotateHint(doc);
}

// On a phone held upright, the match screens are cramped: show a one-line, dismissible tip to rotate (only on match routes).
const MATCH_ROUTES = /^#(play|rink|diamond)(?:$|[/?])/;
export function needsRotateHint({ width, height, hash, dismissed }) { return !dismissed && height > width && width <= 700 && MATCH_ROUTES.test(hash || ''); }
function mountRotateHint(doc) {
  const w = doc.defaultView; if (!w) return;
  const el = doc.createElement('div'); el.className = 'mn-rotate'; el.setAttribute('role', 'status'); el.hidden = true;
  el.innerHTML = '<span>↻ Gire o celular na horizontal para ver melhor o campo</span><button type="button" aria-label="Fechar aviso">✕</button>';
  doc.body.appendChild(el); let dismissed = false; try { dismissed = w.sessionStorage.getItem('asu_rotate_hint') === '1'; } catch { /* private */ }
  el.querySelector('button').onclick = () => { dismissed = true; el.hidden = true; try { w.sessionStorage.setItem('asu_rotate_hint', '1'); } catch { /* private */ } };
  const sync = () => { el.hidden = !needsRotateHint({ width: w.innerWidth, height: w.innerHeight, hash: w.location.hash, dismissed }); };
  w.addEventListener('resize', sync); w.addEventListener('orientationchange', sync); w.addEventListener('hashchange', sync); sync();
}
