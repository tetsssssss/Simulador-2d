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
}
