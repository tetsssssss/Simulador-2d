// Avatar ("boneco") editor modal, shared by NFL/NHL/MLB. openAvatarEditor({ sport, id, name, number, pos, color, color2, kit, prop, onSave })
// Live preview (idle / running), swatches for skin + hair color, chip rows for style/beard/accessory/build/headgear,
// "Aleatório" and "Padrão" buttons. Saves per sport + player id through core/render/avatars.js.
import { drawAvatar, getAvatar, setAvatar, resetAvatar, randomAvatar, defaultAvatar, SKINS, HAIR_COLORS, HAIR_STYLES, BEARDS, ACCESSORIES, BUILDS, GEAR } from '../render/avatars.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const ROWS = [['hairStyle', 'Cabelo', HAIR_STYLES], ['beard', 'Barba', BEARDS], ['accessory', 'Acessório', ACCESSORIES], ['build', 'Porte', BUILDS], ['gear', 'Equipamento', GEAR]];

export function openAvatarEditor(o) {
  const { sport, id, name = 'Atleta', number = '', pos = '', color = '#1d4ed8', color2 = '#ffffff', kit = 'baseball', prop = 'none', role = '', onSave = () => {} } = o;
  const doc = document, cur = getAvatar(sport, id);
  doc.getElementById('asuAvatarEd')?.remove();
  const el = doc.createElement('div'); el.id = 'asuAvatarEd'; el.className = 'asu-ave';
  el.innerHTML = `<div class="asu-ave-card" role="dialog" aria-label="Editar boneco">
    <div class="asu-ave-prev"><canvas width="360" height="420"></canvas><div class="asu-ave-btns"><button data-m="idle" class="on">Parado</button><button data-m="run">Correndo</button></div></div>
    <div class="asu-ave-form"><h3>${esc(name)} <small>#${esc(number)} ${esc(pos)}</small></h3>
      <div class="asu-ave-row"><b>Pele</b><div class="sw" data-k="skin">${SKINS.map((c, i) => `<i data-v="${i}" style="background:${c}"></i>`).join('')}</div></div>
      <div class="asu-ave-row"><b>Cor do cabelo</b><div class="sw" data-k="hairColor">${HAIR_COLORS.map((c, i) => `<i data-v="${i}" style="background:${c}"></i>`).join('')}</div></div>
      ${ROWS.map(([k, label, list]) => `<div class="asu-ave-row"><b>${label}</b><div class="chips" data-k="${k}">${list.map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}</div></div>`).join('')}
      <div class="asu-ave-act"><button data-a="rand">🎲 Aleatório</button><button data-a="def">Padrão</button><span class="grow"></span><button data-a="cancel">Cancelar</button><button data-a="save" class="primary">Salvar</button></div>
    </div></div>`;
  doc.body.appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  let mode = 'idle', raf = 0, t0 = performance.now(), closed = false;
  function mark() {
    el.querySelectorAll('[data-k]').forEach(g => g.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', +b.dataset.v === +cur[g.dataset.k])));
  }
  function frame(now) {
    if (closed) return;
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const g = ctx.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, '#16314a'); g.addColorStop(1, '#0c1c2b'); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(0, 360, cv.width, 60);
    drawAvatar(ctx, { x: 180, y: 360, h: 330, opts: cur, kit, color, color2, number, prop, role, moving: mode === 'run', t, dir: Math.cos(t * 0.8) >= 0 ? 1 : -1, facing: mode === 'run' ? 0 : null });
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  mark();
  const close = () => { closed = true; cancelAnimationFrame(raf); el.remove(); doc.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  doc.addEventListener('keydown', onKey, true);
  el.addEventListener('click', e => {
    if (e.target === el) return close();
    const b = e.target.closest('button,i'); if (!b) return;
    if (b.dataset.m) { mode = b.dataset.m; el.querySelectorAll('.asu-ave-btns button').forEach(x => x.classList.toggle('on', x === b)); return; }
    if (b.dataset.v != null) { cur[b.closest('[data-k]').dataset.k] = +b.dataset.v; mark(); return; }
    const a = b.dataset.a; if (!a) return;
    if (a === 'rand') { Object.assign(cur, randomAvatar()); mark(); }
    else if (a === 'def') { Object.assign(cur, defaultAvatar(`${sport}|${id}`)); mark(); }
    else if (a === 'cancel') close();
    else if (a === 'save') { setAvatar(sport, id, cur); onSave({ ...cur }); close(); }
  });
  return close;
}
export { resetAvatar };

// Small static portrait of an athlete's avatar (cards / lists). Returns a <canvas>.
export function avatarThumb({ sport, id, color, color2, number, kit = 'baseball', prop = 'none', size = 64 }) {
  const c = document.createElement('canvas'); c.width = size * 2; c.height = size * 2.2; c.style.cssText = `width:${size}px;height:${size * 1.1}px`;
  const g = c.getContext('2d'); g.fillStyle = '#17364a'; g.fillRect(0, 0, c.width, c.height);
  drawAvatar(g, { x: c.width / 2, y: c.height - 8, h: c.height - 16, opts: getAvatar(sport, id), kit, color, color2, number, prop, showNumber: true });
  return c;
}
